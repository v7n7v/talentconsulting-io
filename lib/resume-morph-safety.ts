export const RESUME_MORPH_DEFAULT_MAX = 80;
export const RESUME_MORPH_FULL_UNLOCK = 100;
export const RESUME_MORPH_CONSENT_VERSION = 'resume-morph-100-v1';

export const RESUME_MORPH_ACKNOWLEDGEMENTS = [
  'I understand that 100% Morph increases rewrite strength, but protected resume facts remain locked.',
  'I understand Talent Studio must not invent degrees, schools, certifications, licenses, employers, job titles, dates, or contact details.',
  'I agree to review every generated resume before using it in an application.',
] as const;

export interface ResumeMorphConsentStatus {
  unlocked100: boolean;
  acceptedAt: string | null;
  consentVersion: string;
  disabledAt?: string | null;
}

export function isValidResumeMorphConsentRecord(
  value: unknown,
  uid: string,
  acknowledgementHash: string,
) {
  if (!value || typeof value !== 'object' || !uid || !acknowledgementHash) return false;
  const data = value as Record<string, unknown>;
  const acceptedAt = typeof data.acceptedAt === 'string' ? data.acceptedAt : '';
  const typedName = typeof data.typedName === 'string' ? data.typedName.trim() : '';
  const acknowledgements = Array.isArray(data.acknowledgements) ? data.acknowledgements : [];

  return data.unlocked100 === true
    && data.consentVersion === RESUME_MORPH_CONSENT_VERSION
    && !data.disabledAt
    && data.acceptedByUid === uid
    && data.acknowledgementHash === acknowledgementHash
    && typedName.length >= 2
    && Number.isFinite(Date.parse(acceptedAt))
    && RESUME_MORPH_ACKNOWLEDGEMENTS.every((text) => acknowledgements.includes(text));
}
