/**
 * Turn-based interview — session authorize.
 *
 * Replaces the role the retired Gemini `app/api/voice/live-token` played: it is
 * the ONE gate a live interview passes through, and it keeps the exact same
 * contract so the client's failure handling is unchanged:
 *   - `guardApiRoute({ feature: 'gauntlets' })` — account required, and the
 *     shared `gauntlets` cap decides who may start a session. A free user who
 *     has used their runs gets the 429 whose body carries `limitReached` +
 *     `upgradeUrl`, which the hook surfaces as `errorUpgradeUrl`.
 *   - The upgrade CTA appears ONLY on that cap/tier rejection. This endpoint
 *     never mints an upgrade prompt for an infrastructure fault.
 *
 * Parity note (entitlement): like `live-token`, this authorizes the session but
 * does NOT itself increment the gauntlets counter, and the per-turn endpoint is
 * NOT gauntlet-gated. Free-user entitlement is therefore identical to the old
 * live flow. See docs/DECISIONS.md.
 *
 * No STT/LLM/TTS happens here — that is `/api/interview/turn`. This route only
 * says "you may begin" and reports whether self-hosted audio is available so the
 * room can fall back to a text-only transcript honestly when it is not.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { isSuperTonicConfigured } from '@/lib/ai/supertonic-tts';
import { resolvePersonaProfile } from '@/lib/ai/interview-prompt';

export async function POST(req: NextRequest) {
  // Same gate the Gemini live-token used: account required, gauntlets cap.
  const guard = await guardApiRoute(req, {
    feature: 'gauntlets',
    allowAnonymous: false,
  });
  if (guard.error) return guard.error;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const personaId = typeof body.persona === 'string' ? body.persona : 'friendly-hr';
    const profile = resolvePersonaProfile(personaId);

    return NextResponse.json({
      ok: true,
      persona: personaId,
      personaName: profile.displayName,
      // The room uses this to decide whether to expect spoken audio or degrade
      // to a text-only transcript. It is a capability flag, not a promise about
      // any single turn (a turn can still hit a transport fault).
      ttsAvailable: isSuperTonicConfigured(),
    });
  } catch (error: unknown) {
    console.error('[api/interview/session] Error:', error);
    return NextResponse.json({ error: 'Could not start the interview session' }, { status: 500 });
  }
}
