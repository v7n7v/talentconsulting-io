/**
 * Authenticated Fetch Helper
 * Automatically attaches Firebase ID token to API requests.
 * 
 * Usage:
 *   import { authFetch } from '@/lib/auth-fetch';
 *   const res = await authFetch('/api/resume/morph', { method: 'POST', body: JSON.stringify(data) });
 */
import { auth } from '@/lib/firebase';
import { DEMO_AUTH_TOKEN, isDemoModeEnabled } from '@/lib/demo-mode';

/** The subset of RequestInit that affects which headers a request needs. */
export interface AuthHeaderInit {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
  /**
   * Refuse to build headers for a signed-in user whose token cannot be read.
   *
   * The default is a silent downgrade: `getIdToken()` throws, the warning is
   * logged, and the request goes out with no Authorization header at all — so
   * the server sees an anonymous caller. For most routes that just means a 401
   * the caller can retry. For the resumable upload it means the parse route
   * resolves `anon:<ip>`, cannot match the object's uid prefix, answers 401 and
   * deletes nothing, leaving a real resume in the bucket. Callers that own
   * something the server can only reach as *them* pass this and fail closed.
   */
  requireToken?: boolean;
}

/** Thrown by `resolveAuthHeaders` when `requireToken` is set and no token exists. */
export class AuthTokenUnavailableError extends Error {
  readonly code = 'auth/token-unavailable';

  constructor(message = 'Your session could not be verified.') {
    super(message);
    this.name = 'AuthTokenUnavailableError';
  }
}

/**
 * Build the headers an authenticated request needs, without performing it.
 *
 * Extracted from authFetch so the XHR upload transport (lib/upload) can reach
 * exactly the same rules. XHR is required there because a streamed fetch body
 * cannot set Content-Length and /api/gauntlet/parse-resume answers 411 without
 * it — but XHR must not mean a second, drifting copy of demo-mode bypass and
 * the FormData Content-Type exemption. There is one copy, and this is it.
 */
export async function resolveAuthHeaders(options: AuthHeaderInit = {}): Promise<Headers> {
  const user = auth.currentUser;

  const headers = new Headers(options.headers);

  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch {
        console.warn('[auth:token-read]', { code: 'auth/token-unavailable' });
        if (options.requireToken) throw new AuthTokenUnavailableError();
    }
  } else if (options.requireToken) {
    throw new AuthTokenUnavailableError('You are not signed in.');
  } else if (isDemoModeEnabled()) {
    headers.set('Authorization', `Bearer ${DEMO_AUTH_TOKEN}`);
    headers.set('x-demo-auth-bypass', 'true');
  }

  // Default to JSON content type for POST requests
  if (options.method?.toUpperCase() === 'POST' && !headers.has('Content-Type')) {
    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return headers;
}

/**
 * Wrapper around fetch() that automatically injects the Firebase ID token
 * into the Authorization header for authenticated API calls.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = await resolveAuthHeaders(options);

  const response = await fetch(url, {
    ...options,
    headers,
  });
  return response;
}
