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

/**
 * Wrapper around fetch() that automatically injects the Firebase ID token
 * into the Authorization header for authenticated API calls.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;

  const headers = new Headers(options.headers);

  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (e) {
      console.warn('Failed to get auth token:', e);
    }
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

  return fetch(url, {
    ...options,
    headers,
  });
}
