/**
 * Interview system-prompt builder + persona traits — ported from the retired
 * Gemini `app/api/voice/live-token/route.ts` and corrected.
 *
 * THE BUG THIS FIXES: the live-token maps (`PERSONA_VOICE_MAP`, `personaTraits`)
 * were keyed by *display name* (`'FAANG Tech Lead'`) while every caller sends
 * `persona.id` (`'faang-lead'`). Every lookup missed, so every persona fell
 * through to one default identity — the interview personas all sounded and
 * behaved the same. This module is keyed by `persona.id`, the value the client
 * actually sends, so the identity, gender reinforcement and (via
 * `lib/ai/persona-voices.ts`) the voice all line up. See
 * docs/voice-vps-migration-plan.md.
 *
 * Pure and server-agnostic so it is unit-testable without booting a route.
 */

export interface PersonaProfile {
  /** Human-facing name used in the IDENTITY block. */
  displayName: string;
  /** Coarse gender used only to reinforce a single consistent voice in-prompt. */
  gender: 'male' | 'female';
  /** One-line character brief that shapes the interviewer's questioning style. */
  traits: string;
}

/**
 * persona.id → profile. The keys MUST match the `id` values in
 * `app/suite/interview-sim/page.tsx` PERSONAS and the keys in
 * `lib/ai/persona-voices.ts` PERSONA_VOICE_SID.
 */
export const PERSONA_PROFILES: Readonly<Record<string, PersonaProfile>> = Object.freeze({
  'faang-lead': {
    displayName: 'FAANG Tech Lead',
    gender: 'male',
    traits:
      'You are a precise, analytical FAANG-style interviewer. Ask surgical, probing system design and behavioral questions. Be direct.',
  },
  'friendly-hr': {
    displayName: 'Friendly HR',
    gender: 'female',
    traits:
      'You are a warm, encouraging HR interviewer who helps candidates shine. Give positive reinforcement while probing deeper.',
  },
  'startup-cto': {
    displayName: 'Startup CTO',
    gender: 'male',
    traits:
      'You are a fast-paced startup CTO. Ship-it mentality. Ask scrappy, practical questions about building and scaling.',
  },
  'vp-engineering': {
    displayName: 'VP of Engineering',
    gender: 'male',
    traits:
      'You are a strategic VP of Engineering. Focus on leadership, big-picture thinking, and organizational impact.',
  },
  'consulting-partner': {
    displayName: 'Consulting Partner',
    gender: 'female',
    traits:
      'You are a structured consulting partner. Use MECE frameworks. Ask case-style and structured behavioral questions.',
  },
  'behavioral-specialist': {
    displayName: 'STAR Specialist',
    gender: 'female',
    traits:
      'You are a behavioral interview specialist. Deep-dive into STAR responses. Probe for specifics in every answer.',
  },
});

/** The identity used when an unknown persona id arrives — same fallback the live route used. */
export const DEFAULT_PERSONA_ID = 'friendly-hr';

/** Resolve a persona id to its profile, falling back to the default identity. */
export function resolvePersonaProfile(personaId?: string | null): PersonaProfile {
  if (personaId && Object.prototype.hasOwnProperty.call(PERSONA_PROFILES, personaId)) {
    return PERSONA_PROFILES[personaId];
  }
  return PERSONA_PROFILES[DEFAULT_PERSONA_ID];
}

/**
 * Build the interviewer system prompt for a turn-based (STT → LLM → TTS)
 * session. Adapted from the live prompt: the model now writes short spoken-style
 * replies that a TTS voice reads aloud, so it is told to stay concise and
 * conversational and to ask exactly one question per turn.
 */
export function buildInterviewPrompt(
  personaId: string,
  jobDescription: string,
  interviewStyle: string,
): string {
  const profile = resolvePersonaProfile(personaId);
  const style = (interviewStyle || 'behavioral').trim() || 'behavioral';

  return `You are an AI mock interviewer conducting a ${style} interview.

IDENTITY (NEVER CHANGE):
- You are "${profile.displayName}" — a ${profile.gender} interviewer.
- Maintain the SAME tone and personality for the ENTIRE session.
- Speak naturally as a single, consistent person throughout.

${profile.traits}

CRITICAL RULES:
1. Ask ONE question at a time. Wait for the candidate's response before asking the next question.
2. Listen carefully to answers and ask relevant follow-up questions.
3. After each answer, provide brief, constructive feedback (1-2 sentences max) before moving to the next question.
4. Use the STAR method (Situation, Task, Action, Result) to evaluate behavioral answers.
5. Keep every reply concise and conversational — your words are read aloud by a voice, not written as an essay. Two to four sentences.
6. On your very first turn, introduce yourself in one sentence and ask the first question.
7. After 5-7 questions, wrap up with a brief summary of strengths and areas to improve.
8. NEVER repeat yourself or re-ask a question you already asked.
9. Stay strictly on topic: only the interview, the candidate's experience, and the target role.
10. Do not use markdown, bullet points, headings, or emoji — plain spoken sentences only.
${jobDescription ? `\nTARGET ROLE CONTEXT:\n${jobDescription.substring(0, 2000)}` : ''}`;
}

/**
 * Split an assistant reply into speakable chunks (roughly one sentence each) so
 * the caller can synthesize and play them as an ordered queue — the unit at
 * which barge-in flushes. Never returns empty strings; collapses whitespace;
 * hard-caps very long sentences so a single TTS request stays bounded.
 */
export function splitIntoSpeechChunks(text: string, maxChars = 320): string[] {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const chunks: string[] = [];

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    // Over-long sentence: break on word boundaries into <= maxChars pieces.
    let current = '';
    for (const word of sentence.split(' ')) {
      if (current && current.length + 1 + word.length > maxChars) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks;
}
