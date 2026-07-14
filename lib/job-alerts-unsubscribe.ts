import crypto from 'node:crypto';

function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || 'local-dev-unsubscribe-secret';
}

export function createJobAlertUnsubscribeToken(uid: string) {
  return crypto
    .createHmac('sha256', secret())
    .update(`job-alerts:${uid}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyJobAlertUnsubscribeToken(uid: string, token: string | null) {
  if (!uid || !token) return false;
  const expected = createJobAlertUnsubscribeToken(uid);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
