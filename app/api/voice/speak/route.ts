import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { checkVoiceAllowed, recordVoiceUsage, estimateTTSSeconds } from '@/lib/usage-tracker';
import { validateBody } from '@/lib/validate';
import { VoiceSpeakSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
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

        if (!OPENROUTER_API_KEY) {
            return NextResponse.json({ error: 'TTS not configured. Missing OPENROUTER_API_KEY.' }, { status: 500 });
        }

        // ── Voice minute cap check ──
        const voiceCheck = await checkVoiceAllowed(guard.user.uid, guard.user.tier);
        if (!voiceCheck.allowed) {
            const isFreeTier = guard.user.tier === 'free';
            return NextResponse.json(
                {
                    error: isFreeTier
                        ? 'Voice mode is a Pro feature. Upgrade to access AI interview voice.'
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

        // ── Synthesize via OpenRouter TTS ──
        const voice = resolveVoice(voiceId);

        const ttsRes = await fetch(OPENROUTER_TTS_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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
        });

        if (!ttsRes.ok) {
            const errText = await ttsRes.text().catch(() => 'Unknown error');
            console.error('[api/voice/speak] OpenRouter TTS error:', ttsRes.status, errText);
            throw new Error(`OpenRouter TTS failed: ${ttsRes.status}`);
        }

        const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

        // ── Record usage AFTER successful synthesis ──
        await recordVoiceUsage(guard.user.uid, estimatedSeconds);

        const remainingAfter = voiceCheck.remainingSeconds - estimatedSeconds;

        return new NextResponse(new Uint8Array(audioBuffer), {
            headers: {
                'Content-Type': 'audio/mpeg',
                'X-Voice-Used-Seconds': String(voiceCheck.usedSeconds + estimatedSeconds),
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
