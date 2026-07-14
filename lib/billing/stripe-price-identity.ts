import { createHash } from 'node:crypto';

export function stripePriceIdentityFingerprint(priceId: string) {
  return `sha256:${createHash('sha256').update(priceId).digest('hex').slice(0, 24)}`;
}
