export type VerifiedResumeOrigin = 'user_upload' | 'user_authored' | 'onboarding_upload' | 'sona_upload';

export interface VerifiedResumeProvenance {
  verified: true;
  origin: VerifiedResumeOrigin;
  recordedAt: string;
}

const VERIFIED_ORIGINS = new Set<VerifiedResumeOrigin>([
  'user_upload',
  'user_authored',
  'onboarding_upload',
  'sona_upload',
]);

export function normalizeVerifiedResumeProvenance(value: unknown, recordedAt: string): VerifiedResumeProvenance | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { verified?: unknown; origin?: unknown };
  if (candidate.verified !== true || !VERIFIED_ORIGINS.has(candidate.origin as VerifiedResumeOrigin)) return null;
  return {
    verified: true,
    origin: candidate.origin as VerifiedResumeOrigin,
    recordedAt,
  };
}
