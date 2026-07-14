/**
 * Cloudflare Turnstile Verification
 * Server-side token validation for invisible bot protection.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification');
    return process.env.NODE_ENV !== 'production';
  }

  try {
    const body: Record<string, string> = {
      secret,
      response: token,
    };
    if (ip) body.remoteip = ip;

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return data.success === true;
  } catch (error) {
    console.error('[turnstile] Verification failed:', error);
    return false;
  }
}
