/**
 * Turn-based interview — one exchange.
 *
 * Deepgram STT (candidate audio) → Groq LLM (`openai/gpt-oss-120b`, the model
 * already used by interview grading) with the ported persona prompt → SuperTonic
 * TTS, sentence-chunked so the client can play an ordered queue and flush it on
 * barge-in. Returns the real `userText`, `aiText`, and the audio segments.
 *
 * ── Failure handling (never nag upgrade on an infra fault) ──
 *   - STT transport fault → 502 `{ error }`, no `upgrade`/`upgradeUrl`.
 *   - STT returns no speech → 200 `{ noSpeech: true }`; the client simply
 *     re-opens the mic. No LLM/TTS spend, no turn recorded.
 *   - LLM fault → 502 `{ error }`, no upgrade field.
 *   - TTS fault → the turn STILL succeeds with the transcript; `segments` holds
 *     whatever synthesized, `ttsFailed` flags the rest. A voice outage degrades
 *     to text, it does not lose the answer or bill for silence.
 *
 * ── Entitlement (parity with the retired Gemini live flow) ──
 * The session gate lives in `/api/interview/session` (`feature: 'gauntlets'`).
 * Per-turn we require auth + a rate limit only — we do NOT decrement gauntlets
 * per turn (the old live stream did not bill per message) and do NOT check the
 * voice-minute cap (free tier is 0 minutes, which would break gauntlet-gated
 * free interviews). See docs/DECISIONS.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqChat } from '@/lib/ai/groq-client';
import { synthesize, isSuperTonicConfigured, SuperTonicError } from '@/lib/ai/supertonic-tts';
import { resolveVoiceSid } from '@/lib/ai/persona-voices';
import { buildInterviewPrompt, splitIntoSpeechChunks } from '@/lib/ai/interview-prompt';
import { monitor } from '@/lib/monitor';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/** Keep the LLM context bounded — the tail of the conversation is what matters. */
const MAX_HISTORY_TURNS = 20;

interface TurnHistoryEntry {
  role: 'user' | 'ai';
  text: string;
}

function parseHistory(raw: unknown): TurnHistoryEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is TurnHistoryEntry =>
        entry && (entry.role === 'user' || entry.role === 'ai') && typeof entry.text === 'string' && entry.text.trim().length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map(entry => ({ role: entry.role, text: entry.text }));
  } catch {
    return [];
  }
}

async function transcribe(audio: Blob): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('Deepgram API key not configured');
  }
  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': audio.type || 'audio/wav',
    },
    body: audio,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('[api/interview/turn] Deepgram error:', response.status, errorText);
    throw new Error(`Deepgram API error: ${response.status}`);
  }
  const data = await response.json();
  return String(data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
}

export async function POST(req: NextRequest) {
  // Auth + speed limit only. NOT gauntlet-gated (session route owns that) and
  // NOT voice-minute gated (parity — see the header note).
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const form = await req.formData();
    const persona = String(form.get('persona') || 'friendly-hr');
    const jobDescription = String(form.get('jobDescription') || '');
    const interviewStyle = String(form.get('interviewStyle') || 'behavioral');
    const kickoff = String(form.get('kickoff') || '') === 'true';
    const history = parseHistory(form.get('history'));
    const audio = form.get('audio');
    const typedText = String(form.get('text') || '').trim();

    // ── 1. Establish the candidate's turn text ──
    let userText = '';
    if (kickoff) {
      userText = '';
    } else if (typedText) {
      // `sendText` path: caller supplied text directly, no STT.
      userText = typedText;
    } else {
      if (!(audio instanceof Blob) || audio.size === 0) {
        return NextResponse.json({ error: 'No audio provided for this turn' }, { status: 400 });
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio too large. Max 10MB.' }, { status: 400 });
      }
      try {
        userText = await transcribe(audio);
      } catch (sttError) {
        console.error('[api/interview/turn] STT failed:', sttError);
        // Transport fault — never an upgrade prompt.
        return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
      }
      if (!userText) {
        // No speech recognised — tell the client to keep listening. No spend.
        return NextResponse.json({ userText: '', aiText: '', segments: [], noSpeech: true });
      }
    }

    // ── 2. LLM: produce the interviewer's spoken reply ──
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildInterviewPrompt(persona, jobDescription, interviewStyle) },
    ];
    for (const entry of history) {
      messages.push({ role: entry.role === 'ai' ? 'assistant' : 'user', content: entry.text });
    }
    messages.push({
      role: 'user',
      content: kickoff
        ? 'Please begin the interview: introduce yourself in one sentence and ask your first question.'
        : userText,
    });

    let aiText: string;
    try {
      aiText = (await groqChat(messages, { temperature: 0.7, maxTokens: 500 })).trim();
    } catch (llmError) {
      console.error('[api/interview/turn] LLM failed:', llmError);
      return NextResponse.json({ error: 'Interview response failed' }, { status: 502 });
    }
    if (!aiText) {
      return NextResponse.json({ error: 'Interview response failed' }, { status: 502 });
    }

    // ── 3. TTS: sentence-chunked SuperTonic. A TTS fault degrades to text. ──
    const segments: Array<{ audio: string; contentType: string }> = [];
    let ttsFailed = false;
    const ttsAvailable = isSuperTonicConfigured();

    if (ttsAvailable) {
      const voiceSid = resolveVoiceSid(persona);
      const chunks = splitIntoSpeechChunks(aiText);
      for (const chunk of chunks) {
        try {
          const result = await synthesize({ text: chunk, voiceSid, format: 'mp3' });
          segments.push({
            audio: result.audio.toString('base64'),
            contentType: result.headers['content-type'] || 'audio/mpeg',
          });
        } catch (ttsError) {
          // Infra fault: stop synthesizing, keep the transcript, flag the gap.
          // Not a 500, not an upgrade nag, and no usage was billed.
          ttsFailed = true;
          if (ttsError instanceof SuperTonicError) {
            console.error(`[api/interview/turn] TTS ${ttsError.kind}:`, ttsError.message);
          } else {
            console.error('[api/interview/turn] TTS failed:', ttsError);
          }
          break;
        }
      }
    }

    return NextResponse.json({
      userText,
      aiText,
      segments,
      ttsAvailable,
      ...(ttsFailed ? { ttsFailed: true } : {}),
    });
  } catch (error: unknown) {
    console.error('[api/interview/turn] Error:', error);
    monitor.critical('Tool: interview/turn', String(error));
    return NextResponse.json({ error: 'Interview turn failed' }, { status: 500 });
  }
}
