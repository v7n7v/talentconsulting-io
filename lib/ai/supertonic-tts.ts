/**
 * Server-side client for the self-hosted SuperTonic TTS service (VPS `/speak`).
 *
 * This is called only from server code (the `/api/voice/*` routes). It never runs
 * in the browser, so the auth token (`TTS_API_KEY`) is never shipped in the client
 * bundle. The base URL is validated to blunt SSRF: only HTTPS, or HTTP to a
 * loopback host (the local SSH tunnel used in dev), is accepted. Anything else —
 * an arbitrary internal IP, embedded credentials — resolves to "not configured".
 *
 * Transport failures are mapped to a small, typed set of error kinds so the route
 * can decide what to surface (an infra fault must NOT look like a billing/upgrade
 * prompt): `unreachable`, `timeout`, `non-200`, `empty-audio`, `bad-content-type`,
 * `not-configured`.
 *
 * The timeout bounds the WHOLE exchange, not just header receipt: a VPS that
 * returns 200 headers and then stalls the audio stream is aborted at the deadline,
 * because the abort timer is not cleared until the body has been fully read (or the
 * call has failed). See docs/voice-vps-migration-plan.md.
 */

/** Default per-request timeout. SuperTonic TTFA is ~1.5 s; 10 s is generous headroom. */
export const DEFAULT_TTS_TIMEOUT_MS = 10_000;

export type SuperTonicErrorKind =
    | 'not-configured'
    | 'unreachable'
    | 'timeout'
    | 'non-200'
    | 'empty-audio'
    | 'bad-content-type';

/** Typed transport error. `kind` lets callers branch without string-matching messages. */
export class SuperTonicError extends Error {
    readonly kind: SuperTonicErrorKind;
    readonly status?: number;

    constructor(kind: SuperTonicErrorKind, message: string, status?: number) {
        super(message);
        this.name = 'SuperTonicError';
        this.kind = kind;
        this.status = status;
    }
}

export interface SuperTonicConfig {
    baseUrl: string;
    apiKey: string;
}

export interface SynthesizeParams {
    /** Text to speak. */
    text: string;
    /** SuperTonic speaker id (0–9). Use `resolveVoiceSid` to derive it. */
    voiceSid: number;
    /** Playback speed multiplier. Defaults to 1.0. */
    speed?: number;
    /** Container/codec requested from the service. Defaults to `'mp3'`. */
    format?: 'mp3' | 'wav';
    /** Override the request timeout (ms). Defaults to {@link DEFAULT_TTS_TIMEOUT_MS}. */
    timeoutMs?: number;
    /** Optional caller abort signal, combined with the internal timeout. */
    signal?: AbortSignal;
    /** Injected fetch, for tests. Defaults to global `fetch`. */
    fetchImpl?: typeof fetch;
    /** Explicit config override, for tests. Falls back to env when omitted. */
    config?: SuperTonicConfig;
}

export interface SynthesizeResult {
    /** Raw audio bytes returned by the service. */
    audio: Buffer;
    /** Selected response headers (currently just `content-type`). */
    headers: { 'content-type': string };
}

/**
 * Read and validate the SuperTonic config from the environment.
 *
 * Returns `null` — meaning "not configured, use the fallback provider" — when
 * `TTS_BASE_URL` is unset, unparseable, uses a disallowed scheme/host, or carries
 * embedded credentials. `TTS_API_KEY` may legitimately be blank in local dev
 * against an unauthenticated tunnel, so a missing key does not disable the client.
 */
export function getSuperTonicConfig(): SuperTonicConfig | null {
    const raw = String(process.env.TTS_BASE_URL || '').trim();
    if (!raw) return null;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const httpsOk = url.protocol === 'https:';
    const httpLoopbackOk = url.protocol === 'http:' && loopback;
    if (!httpsOk && !httpLoopbackOk) return null;

    // Reject `https://user:pass@host` — credentials in the URL are an SSRF/leak smell.
    if (url.username || url.password) return null;

    return {
        baseUrl: raw.replace(/\/+$/, ''),
        apiKey: String(process.env.TTS_API_KEY || '').trim(),
    };
}

/** True when a valid SuperTonic base URL is configured; the route uses this to branch. */
export function isSuperTonicConfigured(): boolean {
    return getSuperTonicConfig() !== null;
}

/**
 * Synthesize speech via the SuperTonic `/speak` endpoint.
 *
 * Resolves to `{ audio, headers }` on success. Throws {@link SuperTonicError} on
 * any transport fault. Never records usage or performs billing — that is the
 * caller's responsibility, and must happen only after this resolves.
 */
export async function synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const config = params.config ?? getSuperTonicConfig();
    if (!config) {
        throw new SuperTonicError('not-configured', 'TTS_BASE_URL is not set or invalid');
    }

    const fetchImpl = params.fetchImpl ?? fetch;
    const timeoutMs = params.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS;
    const format = params.format ?? 'mp3';
    const speed = params.speed ?? 1.0;

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (params.signal) {
        if (params.signal.aborted) controller.abort();
        else params.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    // `timedOut` distinguishes our timeout from an external caller-signal abort.
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

    // The timer is held across BOTH the header fetch and the body download, then
    // cleared in this single finally. Clearing it earlier (the old bug) left a
    // 200-then-stalled body able to hang past the timeout budget.
    try {
        let response: Response;
        try {
            response = await fetchImpl(`${config.baseUrl}/speak`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-TTS-Token': config.apiKey,
                },
                body: JSON.stringify({
                    text: params.text,
                    sid: params.voiceSid,
                    speed,
                    format,
                }),
                signal: controller.signal,
            });
        } catch (error) {
            if (timedOut) {
                throw new SuperTonicError(
                    'timeout',
                    `SuperTonic TTS did not respond within ${timeoutMs}ms`,
                );
            }
            throw new SuperTonicError(
                'unreachable',
                `SuperTonic TTS unreachable: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        if (!response.ok) {
            // Drain the body so we don't leak the connection; detail is logged by caller.
            await response.text().catch(() => '');
            throw new SuperTonicError(
                'non-200',
                `SuperTonic TTS returned ${response.status}`,
                response.status,
            );
        }

        let audio: Buffer;
        try {
            audio = Buffer.from(await response.arrayBuffer());
        } catch (error) {
            // The body read can abort mid-stream when our deadline fires; that is a
            // timeout, not a generic transport fault.
            if (timedOut) {
                throw new SuperTonicError(
                    'timeout',
                    `SuperTonic TTS did not respond within ${timeoutMs}ms`,
                );
            }
            throw new SuperTonicError(
                'unreachable',
                `SuperTonic TTS body read failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        if (audio.length === 0) {
            throw new SuperTonicError('empty-audio', 'SuperTonic TTS returned an empty audio body');
        }

        // A misconfigured VPS can answer 200 with a small JSON/HTML error body. Trust
        // the observed content-type over the status line: anything that is not audio/*
        // is a typed fault, never bytes handed to the browser mislabeled as audio.
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        if (!/^audio\//i.test(contentType.trim())) {
            throw new SuperTonicError(
                'bad-content-type',
                `SuperTonic TTS returned a non-audio 200 (content-type: ${contentType})`,
                response.status,
            );
        }

        return {
            audio,
            headers: { 'content-type': contentType },
        };
    } finally {
        clearTimeout(timer);
        if (params.signal) params.signal.removeEventListener('abort', onExternalAbort);
    }
}
