import { createHash } from 'node:crypto';

export const STAGING_DEPLOYMENT_IDENTITY_VERSION = 'staging-deployment-v1';

export function stagingDeploymentIdentityFingerprint(env: {
  NODE_ENV?: string;
  STAGING_HOSTNAME?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
}) {
  const values = [
    STAGING_DEPLOYMENT_IDENTITY_VERSION,
    env.NODE_ENV?.trim(),
    env.STAGING_HOSTNAME?.trim(),
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  ];
  if (values.slice(1).some(value => !value)) return null;
  return createHash('sha256').update(values.join('\0')).digest('hex').slice(0, 24);
}
