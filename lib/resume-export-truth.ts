import { normalizeResume, type CanonicalResume } from '@/lib/resume-normalizer';
import {
  applyResumeMorphGuardrails,
  resolveResumeMorphAccess,
  type ResumeMorphGuardrailReport,
} from '@/lib/resume-morph-guardrails';

export interface PreparedResumeExport {
  resume: CanonicalResume | null;
  guardrailReport: ResumeMorphGuardrailReport | null;
  missingEducationInstitutionIndexes: number[];
  blockedReason: 'missing_source' | null;
}

export function canPersistPreparedResume(prepared: PreparedResumeExport) {
  return prepared.blockedReason === null
    && prepared.resume !== null
    && prepared.missingEducationInstitutionIndexes.length === 0;
}

function findMissingEducationInstitutions(resume: CanonicalResume) {
  return resume.education
    .map((education, index) => ({ education, index }))
    .filter(({ education }) => Boolean(education.degree || education.year || education.details) && !education.institution)
    .map(({ index }) => index);
}

export function prepareResumeForExport(input: {
  mode: 'choose' | 'morph' | 'create';
  candidateResume: unknown;
  originalResume?: unknown;
  requestedMorphPercentage?: number;
  hasFullConsent?: boolean;
}): PreparedResumeExport {
  const candidate = normalizeResume(input.candidateResume);

  if (input.mode === 'morph' && !input.originalResume) {
    return {
      resume: null,
      guardrailReport: null,
      missingEducationInstitutionIndexes: [],
      blockedReason: 'missing_source',
    };
  }

  let resume = candidate;
  let guardrailReport: ResumeMorphGuardrailReport | null = null;

  if (input.mode === 'morph' && input.originalResume) {
    const original = normalizeResume(input.originalResume);
    const guarded = applyResumeMorphGuardrails(
      original,
      candidate,
      resolveResumeMorphAccess({
        requestedMorphPercentage: input.requestedMorphPercentage,
        hasFullConsent: input.hasFullConsent === true,
        mode: 'automated',
      }),
    );
    resume = normalizeResume(guarded.resume);
    guardrailReport = guarded.report;
  }

  return {
    resume,
    guardrailReport,
    missingEducationInstitutionIndexes: findMissingEducationInstitutions(resume),
    blockedReason: null,
  };
}
