/**
 * Canonical persona.id → SuperTonic voice-sid map.
 *
 * This is the single source of truth for which self-hosted SuperTonic voice each
 * interview persona speaks with. It is keyed by `persona.id` (e.g. `'faang-lead'`),
 * NOT by display name — the old Gemini `live-token` map was keyed by display name
 * (`'FAANG Tech Lead'`) while callers send `persona.id`, so every persona fell
 * through to a single default voice. Keying by id fixes that class of bug at the
 * source.
 *
 * SuperTonic exposes 10 voices, addressed by integer speaker id (`sid`) 0–9. The
 * mapping below is PROVISIONAL: the intended gender/character of each sid must be
 * confirmed by ear in the TTS lab, and this table is the one place to change it.
 * See docs/voice-vps-migration-plan.md.
 */

/** Lowest valid SuperTonic speaker id. */
export const MIN_VOICE_SID = 0;
/** Highest valid SuperTonic speaker id (10 voices, 0–9). */
export const MAX_VOICE_SID = 9;

/** Fallback voice used when a hint resolves to nothing recognisable. */
export const DEFAULT_VOICE_SID = 0;

/**
 * persona.id → SuperTonic sid. Provisional — tune by ear.
 *
 * | persona.id             | Persona          | sid | Intent               |
 * |------------------------|------------------|-----|----------------------|
 * | faang-lead             | FAANG Lead       | 0   | male, precise        |
 * | friendly-hr            | Friendly HR      | 3   | female, warm         |
 * | startup-cto            | Startup CTO      | 1   | male, energetic      |
 * | vp-engineering         | VP Engineering   | 2   | male, measured       |
 * | consulting-partner     | Consultant       | 4   | female, structured   |
 * | behavioral-specialist  | STAR Specialist  | 7   | female, coaching     |
 */
export const PERSONA_VOICE_SID: Readonly<Record<string, number>> = Object.freeze({
    'faang-lead': 0,
    'friendly-hr': 3,
    'startup-cto': 1,
    'vp-engineering': 2,
    'consulting-partner': 4,
    'behavioral-specialist': 7,
});

/**
 * Agent-chat voice names → SuperTonic sid.
 *
 * The Taco agent quick-picker (`app/suite/agent/page.tsx`) offers six named voices
 * borrowed from the OpenAI/OpenRouter TTS vocabulary: `alloy`, `nova`, `echo`,
 * `fable`, `onyx`, `shimmer`. Those names mean nothing to SuperTonic, so without
 * this map every one of them fell through to {@link DEFAULT_VOICE_SID} — six
 * distinct labels playing one voice, while the UI caption ("Taco replies with
 * {Onyx} voice") claimed a voice the audio never used. Each name resolves to a
 * distinct in-range sid so the six selections actually sound different. The
 * sid↔character pairing is PROVISIONAL — tune by ear in the TTS lab.
 */
export const AGENT_VOICE_SID: Readonly<Record<string, number>> = Object.freeze({
    alloy: 5,
    nova: 3,
    echo: 6,
    fable: 8,
    onyx: 1,
    shimmer: 9,
});

/**
 * Coarse gender hints, kept so callers that only know "male"/"female" (the agent
 * chat quick-toggle) still land on a sensible voice rather than the default.
 */
const GENDER_VOICE_SID: Readonly<Record<string, number>> = Object.freeze({
    male: 0,
    female: 3,
});

function isValidSid(value: number): boolean {
    return Number.isInteger(value) && value >= MIN_VOICE_SID && value <= MAX_VOICE_SID;
}

/**
 * Resolve any voice hint to a SuperTonic sid.
 *
 * Accepts, in priority order:
 *   - a persona id (`'faang-lead'`)
 *   - a raw integer sid, as number or numeric string (`4`, `'4'`) within 0–9
 *   - an agent-chat voice name (`'onyx'`, `'nova'`, …)
 *   - a coarse gender hint (`'male'` / `'female'`)
 *   - anything else, or nothing → {@link DEFAULT_VOICE_SID}
 *
 * Never throws; always returns a valid sid so the TTS call cannot be handed an
 * out-of-range speaker.
 */
export function resolveVoiceSid(hint?: string | number | null): number {
    if (hint === undefined || hint === null) return DEFAULT_VOICE_SID;

    if (typeof hint === 'number') {
        return isValidSid(hint) ? hint : DEFAULT_VOICE_SID;
    }

    const normalized = hint.trim().toLowerCase();
    if (!normalized) return DEFAULT_VOICE_SID;

    if (Object.prototype.hasOwnProperty.call(PERSONA_VOICE_SID, normalized)) {
        return PERSONA_VOICE_SID[normalized];
    }

    // A bare integer sid, e.g. from a lab tool auditioning voices.
    if (/^\d+$/.test(normalized)) {
        const sid = Number.parseInt(normalized, 10);
        if (isValidSid(sid)) return sid;
    }

    if (Object.prototype.hasOwnProperty.call(AGENT_VOICE_SID, normalized)) {
        return AGENT_VOICE_SID[normalized];
    }

    if (Object.prototype.hasOwnProperty.call(GENDER_VOICE_SID, normalized)) {
        return GENDER_VOICE_SID[normalized];
    }

    return DEFAULT_VOICE_SID;
}
