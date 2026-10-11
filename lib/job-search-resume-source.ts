import type { ResumeVersion } from '@/lib/database-suite';
import { classifyResumeVerification } from '@/lib/resume-source-classifier';

type ResumeRecord = ResumeVersion & {
  provenance?: unknown;
  resume_provenance?: unknown;
  resumeProvenance?: unknown;
  source?: string;
  guardrail_report?: unknown;
  morph_guardrail_report?: unknown;
  morph_effective_percentage?: unknown;
};

function resumeMetadata(resume: ResumeRecord): Record<string, any> {
  return resume.metadata && typeof resume.metadata === 'object' ? resume.metadata : {};
}

function isGeneratedResumeSource(resume: ResumeRecord): boolean {
  const metadata = resumeMetadata(resume);
  const source = String(resume.source || metadata.source || '').toLowerCase();
  const hasGuardrailMetadata = Boolean(
    resume.guardrail_report
      || resume.morph_guardrail_report
      || resume.morph_effective_percentage
      || metadata.guardrail_report
      || metadata.morph_guardrail_report
      || metadata.morph_effective_percentage
      || metadata.guardrailReport
      || metadata.morphGuardrailReport
      || metadata.morphEffectivePercentage,
  );
  const generatedSource = new Set(['agent', 'agent_queue', 'morph', 'auto_fix', 'nightly', 'apply_pipeline']).has(source);
  return hasGuardrailMetadata || generatedSource;
}

export function isEligibleJobSearchResume(resume: ResumeVersion): boolean {
  const record = resume as ResumeRecord;
  if (isGeneratedResumeSource(record)) return false;
  // The classifier is pure: use the same lineage boundary as search/preparation.
  // Active document versions and malformed envelopes cannot become source records.
  return classifyResumeVerification(record, 'resume_versions').verified;
}

export function chooseJobSearchResumeSource(
  resumes: ResumeVersion[],
  savedResumeId?: string | null,
): { resume: ResumeVersion | null; recoveredFromId: boolean } {
  const eligible = resumes.filter(isEligibleJobSearchResume);
  const saved = savedResumeId ? resumes.find(resume => resume.id === savedResumeId) : null;
  if (saved && isEligibleJobSearchResume(saved)) return { resume: saved, recoveredFromId: false };
  return { resume: eligible[0] || null, recoveredFromId: Boolean(savedResumeId && savedResumeId !== eligible[0]?.id) };
}

/** An explicit source handoff may select only the exact verified source ID. */
export function resolveExplicitJobSearchResumeSource(
  resumes: ResumeVersion[],
  requestedId: string | null | undefined,
): ResumeVersion | null {
  if (!requestedId) return null;
  const exact = resumes.find(resume => resume.id === requestedId);
  return exact && isEligibleJobSearchResume(exact) ? exact : null;
}
