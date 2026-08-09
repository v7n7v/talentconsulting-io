import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { checkVoiceAllowed, recordVoiceUsage, estimateTTSSeconds } from '@/lib/usage-tracker';
import { validateBody } from '@/lib/validate';
import { VoiceSpeakSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';
import { isSuperTonicConfigured, synthesize, DEFAULT_TTS_TIMEOUT_MS } from '@/lib/ai/supertonic-tts';
import { resolveVoiceSid } from '@/lib/ai/persona-voices';

const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/tts';
const TTS_MODEL = 'openai/gpt-4o-mini-tts-2025-12-15';

// Voice mapping per interviewer persona
const PERSONA_VOICE_MAP: Record<string, string> = {
    'faang-lead': 'onyx',
    'friendly-hr': 'nova',
    'startup-cto': 'echo',
    'vp-engineering': 'fable',
    'consulting-partner': 'onyx',
    'behavioral-specialist': 'shimmer',
    'male': 'onyx',
    'female': 'nova',
    'default': 'alloy',
};

const SUPPORTED_VOICES = new Set(['alloy', 'nova', 'echo', 'fable', 'onyx', 'shimmer']);

function resolveVoice(voiceHint?: string): string {
    if (!voiceHint) return PERSONA_VOICE_MAP['default'];
    if (SUPPORTED_VOICES.has(voiceHint)) return voiceHint;
    return PERSONA_VOICE_MAP[voiceHint] || PERSONA_VOICE_MAP['default'];
}

export async function POST(req: NextRequest) {
    try {
        const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
        if (guard.error) return guard.error;

        const validated = await validateBody(req, VoiceSpeakSchema);
        if (!validated.success) return validated.error;
        const { text, voiceId } = validated.data;

        const useSuperTonic = isSuperTonicConfigured();

        // Fail fast only when NEITHER provider is configured — SuperTonic (self-hosted
        // VPS) takes precedence over the OpenRouter fallback when its base URL is set.
        if (!useSuperTonic && !process.env.OPENROUTER_API_KEY) {
            return NextResponse.json({ error: 'TTS not configured. Set TTS_BASE_URL or OPENROUTER_API_KEY.' }, { status: 500 });
        }

        // ── Voice minute cap check ──
        const voiceCheck = await checkVoiceAllowed(guard.user.uid, guard.user.tier);
        if (!voiceCheck.allowed) {
            const isFreeTier = guard.user.tier === 'free';
            return NextResponse.json(
                {
                    error: isFreeTier
                        ? 'Voice mode is a Standard feature. Upgrade to access AI interview voice.'
                        : `Monthly voice limit reached (${Math.floor(voiceCheck.capSeconds / 60)} min). Resets next month.`,
                    upgrade: isFreeTier,
                    usedMinutes: Math.floor(voiceCheck.usedSeconds / 60),
                    capMinutes: Math.floor(voiceCheck.capSeconds / 60),
                    remainingSeconds: voiceCheck.remainingSeconds,
                },
                { status: 403 }
            );
        }

        // Estimate how many seconds this TTS will use
        const estimatedSeconds = estimateTTSSeconds(text);

        // Check if this request would exceed the cap
        if (voiceCheck.remainingSeconds < estimatedSeconds) {
            const remainingMin = Math.floor(voiceCheck.remainingSeconds / 60);
            const remainingSec = voiceCheck.remainingSeconds % 60;
            return NextResponse.json(
                {
                    error: `Only ${remainingMin}m ${remainingSec}s of voice remaining this month. This text needs ~${estimatedSeconds}s. Try a shorter text or wait until next month.`,
                    remainingSeconds: voiceCheck.remainingSeconds,
                    estimatedSeconds,
                },
                { status: 403 }
            );
        }

        // ── Synthesize (SuperTonic self-hosted when configured, else OpenRouter) ──
        let audioBuffer: Buffer;
        // Carry the provider's observed content-type through rather than asserting
        // audio/mpeg over whatever actually came back.
        let responseContentType = 'audio/mpeg';

        if (useSuperTonic) {
            const voiceSid = resolveVoiceSid(voiceId);
            const result = await synthesize({ text, voiceSid, format: 'mp3' });
            audioBuffer = result.audio;
            responseContentType = result.headers['content-type'] || responseContentType;
        } else {
            const voice = resolveVoice(voiceId);

            // Bound the whole exchange (headers + body) the same way the SuperTonic
            // client does; the timer is not cleared until arrayBuffer() resolves.
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), DEFAULT_TTS_TIMEOUT_MS);
            try {
                const ttsRes = await fetch(OPENROUTER_TTS_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://talentconsulting.io',
                        'X-Title': 'TalentConsulting.io Interview Simulator',
                    },
                    body: JSON.stringify({
                        model: TTS_MODEL,
                        input: text,
                        voice,
                        response_format: 'mp3',
                        speed: 1.0,
                    }),
                    signal: controller.signal,
                });

                if (!ttsRes.ok) {
                    const errText = await ttsRes.text().catch(() => 'Unknown error');
                    console.error('[api/voice/speak] OpenRouter TTS error:', ttsRes.status, errText);
                    throw new Error(`OpenRouter TTS failed: ${ttsRes.status}`);
                }

                const buf = Buffer.from(await ttsRes.arrayBuffer());
                // An empty 200 must fail before billing — symmetric with the SuperTonic
                // branch, which throws 'empty-audio' rather than record usage for silence.
                if (buf.length === 0) {
                    throw new Error('OpenRouter TTS returned an empty audio body');
                }
                audioBuffer = buf;
            } finally {
                clearTimeout(timer);
            }
        }

        // ── Record usage AFTER successful synthesis ──
        await recordVoiceUsage(guard.user.uid, estimatedSeconds);

        const remainingAfter = voiceCheck.remainingSeconds - estimatedSeconds;

        return new NextResponse(new Uint8Array(audioBuffer), {
            headers: {
                'Content-Type': responseContentType,
                // The voice meter is estimate-based (estimateTTSSeconds), so this figure
                // is a projection of the debited total, not a measured playback duration.
                // Named accordingly so no client mistakes it for the latter.
                'X-Voice-Estimated-Used-Seconds': String(voiceCheck.usedSeconds + estimatedSeconds),
                'X-Voice-Remaining-Seconds': String(Math.max(0, remainingAfter)),
                'X-Voice-Cap-Minutes': String(Math.floor(voiceCheck.capSeconds / 60)),
            },
        });

    } catch (error: unknown) {
        console.error('[api/voice/speak] Error:', error);
        monitor.critical('Tool: voice/speak', String(error));
        return NextResponse.json({ error: 'Voice synthesis failed' }, { status: 500 });
    }
}
