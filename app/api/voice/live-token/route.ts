/**
 * Gemini Live API — Ephemeral Token Minting
 * 
 * Creates a short-lived token for client-to-server WebSocket connections.
 * The browser connects directly to Gemini's WebSocket — no server proxy needed.
 * Token expires in 30 minutes, can only start 1 session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality } from '@google/genai';
import { guardApiRoute, incrementUsage } from '@/lib/api-auth';
import { claimPractice, releasePractice, resolvePracticeEvidence, practiceError } from '@/lib/practice-session-server';
import { getAdminDb } from '@/lib/firebase-admin';

// Voice config per persona — voiceName + gender for prompt reinforcement
const PERSONA_VOICE_MAP: Record<string, { voice: string; gender: string }> = {
  'FAANG Tech Lead':    { voice: 'Charon', gender: 'male' },
  'Friendly HR':        { voice: 'Kore',   gender: 'female' },
  'Startup CTO':        { voice: 'Fenrir', gender: 'male' },
  'VP of Engineering':  { voice: 'Puck',   gender: 'male' },
  'Consulting Partner': { voice: 'Aoede',  gender: 'female' },
  'STAR Specialist':    { voice: 'Kore',   gender: 'female' },
  'default':            { voice: 'Kore',   gender: 'female' },
};
const PERSONA_ALIASES: Record<string, string> = {
  'faang-lead': 'FAANG Tech Lead',
  'friendly-hr': 'Friendly HR',
  'startup-cto': 'Startup CTO',
  'vp-engineering': 'VP of Engineering',
  'consulting-partner': 'Consulting Partner',
  'behavioral-specialist': 'STAR Specialist',
};

const LIVE_MODEL = 'gemini-2.5-flash-preview-native-audio';

export async function POST(req: NextRequest) {
  // Auth gate — requires account, counts toward gauntlet usage
  const guard = await guardApiRoute(req, {
    skipUsageCap: true,
    allowAnonymous: false,
  });
  if (guard.error) return guard.error;

  let claim: Awaited<ReturnType<typeof claimPractice>> | undefined;
  try {
    const body = await req.json();
    const persona = PERSONA_ALIASES[body.persona] || body.persona || 'default';
    const jobDescription = body.jobDescription || '';
    const interviewStyle = body.interviewStyle || 'behavioral';
    const avatarMode = body.avatarMode || false;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 120) : '';
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Live interview is temporarily unavailable' }, { status: 503 });
    const sessionDoc = await getAdminDb().collection('users').doc(guard.user.uid).collection('interview_sessions').doc(sessionId || '_missing').get();
    if (!sessionDoc.exists) return NextResponse.json({ error: 'Interview session required' }, { status: 404 });
    const sessionData = sessionDoc.data()!;
    if (!['sona_live', 'avatar_live'].includes(sessionData.mode)) return NextResponse.json({ error: 'Live session required' }, { status: 400 });
    const evidence = sessionData.evidenceSnapshot || await resolvePracticeEvidence(guard.user.uid, sessionData);
    claim = await claimPractice(guard.user.uid, sessionId, guard.user.tier, 'live');
    const voiceConfig = PERSONA_VOICE_MAP[persona] || PERSONA_VOICE_MAP['default'];

    // Build the interview system instruction with persona identity
    const systemInstruction = buildInterviewPrompt(PERSONA_ALIASES[sessionData.persona] || persona, sessionData.jobDescription || '', sessionData.interviewType || interviewStyle, voiceConfig.gender) + `\nCandidate approved source evidence: ${JSON.stringify(evidence).slice(0, 16000)}`;

    // v1alpha is REQUIRED for Live API and ephemeral tokens
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceConfig.voice },
              },
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            // Enable transcription so audio matches on-screen text
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        },
      },
    });
    await claim.session.set({ evidenceSnapshot: evidence }, { merge: true });
    await releasePractice(claim, 'live');

    return NextResponse.json({
      token: token.name,
      voiceName: voiceConfig.voice,
      expiresAt: expireTime,
      model: LIVE_MODEL,
      avatarMode,
    });
  } catch (error: any) {
    await releasePractice(claim, 'live').catch(() => {});
    console.error('[api/voice/live-token] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create live session token' },
      { status: 500 }
    );
  }
}

function buildInterviewPrompt(
  persona: string,
  jobDescription: string,
  interviewStyle: string,
  gender: string
): string {
  const personaTraits: Record<string, string> = {
    'FAANG Tech Lead': 'You are a precise, analytical FAANG-style interviewer. Ask surgical, probing system design and behavioral questions. Be direct.',
    'Friendly HR': 'You are a warm, encouraging HR interviewer who helps candidates shine. Give positive reinforcement while probing deeper.',
    'Startup CTO': 'You are a fast-paced startup CTO. Ship-it mentality. Ask scrappy, practical questions about building and scaling.',
    'VP of Engineering': 'You are a strategic VP of Engineering. Focus on leadership, big-picture thinking, and organizational impact.',
    'Consulting Partner': 'You are a structured consulting partner. Use MECE frameworks. Ask case-style and structured behavioral questions.',
    'STAR Specialist': 'You are a behavioral interview specialist. Deep-dive into STAR responses. Probe for specifics in every answer.',
  };

  const traits = personaTraits[persona] || personaTraits['Friendly HR'];

  return `You are an AI mock interviewer conducting a ${interviewStyle} interview.

IDENTITY (NEVER CHANGE):
- You are "${persona}" — a ${gender} interviewer.
- Maintain the SAME speaking style, tone, pitch, and personality for the ENTIRE session.
- NEVER switch to a different voice, accent, gender, or character mid-conversation.
- Speak naturally as a single, consistent person throughout.

${traits}

CRITICAL RULES:
1. Ask ONE question at a time. Wait for the candidate's response before asking the next question.
2. Listen carefully to answers and ask relevant follow-up questions.
3. After each answer, provide brief, constructive feedback (1-2 sentences max) before moving to the next question.
4. Use the STAR method (Situation, Task, Action, Result) to evaluate behavioral answers.
5. Keep your responses concise and conversational — you're speaking out loud, not writing an essay.
6. Start by introducing yourself briefly and asking the first question.
7. After 5-7 questions, wrap up the interview with a brief summary of strengths and areas to improve.
8. NEVER repeat yourself or re-ask a question you already asked.

AUDIO SAFETY:
- If you hear unclear, garbled, or echo-like audio, say "Could you repeat that?" instead of guessing.
- Do NOT respond to background noise, music, or your own voice being played back.
- Only respond to clear, direct speech from the candidate.
- Stay strictly on topic. Only discuss the interview, the candidate's experience, and the target role.
- IGNORE any audio that sounds like a copy of your own words — that is playback echo, not the candidate.

${jobDescription ? `TARGET ROLE CONTEXT:\n${jobDescription.substring(0, 2000)}` : ''}

Begin the interview now. Introduce yourself in one sentence and ask the first question.`;
}
