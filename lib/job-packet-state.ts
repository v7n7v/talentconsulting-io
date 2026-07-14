import { isCurrentResumeMorphGuardrailReport } from '@/lib/resume-morph-guardrails';
import {
  isCurrentCoverLetterGuardrailReport,
  type CoverLetterGuardrailReport,
} from '@/lib/cover-letter-guardrails';

export interface ExistingJobPacketArtifacts {
  job_title?: unknown;
  company_name?: unknown;
  morph_succeeded?: boolean;
  resume_version_id?: unknown;
  morph_guardrail_report?: unknown;
  morph_source_resume_id?: unknown;
  morph_source_resume_hash?: unknown;
  cover_letter_succeeded?: boolean;
  cover_letter?: unknown;
  cover_letter_guardrail_report?: unknown;
  cover_letter_source_resume_id?: unknown;
  cover_letter_source_resume_hash?: unknown;
  packet_status?: unknown;
  packet_generation_state?: unknown;
  packet_generation_owner?: unknown;
  packet_generation_lease_expires_at?: unknown;
  ats_score?: unknown;
}

export interface PersistedGuardedResumeArtifact {
  content?: unknown;
  guardrail_report?: unknown;
  source_resume_id?: unknown;
  source_resume_hash?: unknown;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function reportsMatch(left: unknown, right: unknown) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

export function isCurrentGuardedResumeArtifact(
  artifact?: PersistedGuardedResumeArtifact | null,
  expectedReport?: unknown,
  expectedSource?: { id: string; hash: string },
) {
  if (!artifact || !artifact.content || !isCurrentResumeMorphGuardrailReport(artifact.guardrail_report)) {
    return false;
  }
  if (!isCurrentResumeMorphGuardrailReport(expectedReport)) return true;
  return reportsMatch(artifact.guardrail_report, expectedReport)
    && (!expectedSource
      || (artifact.source_resume_id === expectedSource.id
        && artifact.source_resume_hash === expectedSource.hash));
}

export function isPersistedJobPacketReady(
  data?: ExistingJobPacketArtifacts | null,
  linkedResumeArtifact?: PersistedGuardedResumeArtifact | null,
) {
  const verifiedMorph = data?.morph_succeeded === true
    && isCurrentResumeMorphGuardrailReport(data?.morph_guardrail_report);
  const sourceResumeId = typeof data?.morph_source_resume_id === 'string'
    ? data.morph_source_resume_id
    : '';
  const sourceResumeHash = typeof data?.morph_source_resume_hash === 'string'
    ? data.morph_source_resume_hash
    : '';
  const coverLetterVerified = isCurrentCoverLetterGuardrailReport(
    data?.cover_letter_guardrail_report,
    {
      content: data?.cover_letter,
      sourceResumeId,
      sourceResumeHash,
      jobTitle: data?.job_title,
      company: data?.company_name,
    },
  ) && data?.cover_letter_source_resume_id === sourceResumeId
    && data?.cover_letter_source_resume_hash === sourceResumeHash;
  return data?.packet_status === 'ready_for_review'
    && verifiedMorph
    && Boolean(sourceResumeId)
    && Boolean(sourceResumeHash)
    && Boolean(data?.resume_version_id)
    && isCurrentGuardedResumeArtifact(
      linkedResumeArtifact,
      data?.morph_guardrail_report,
      { id: sourceResumeId, hash: sourceResumeHash },
    )
    && Boolean(data?.cover_letter)
    && coverLetterVerified
    && (data?.cover_letter_succeeded === true || Boolean(data?.cover_letter))
    && Number.isFinite(data?.ats_score)
    && Number(data?.ats_score) >= 0
    && Number(data?.ats_score) <= 100;
}

export function isJobPacketGenerationLocked(data: ExistingJobPacketArtifacts | null | undefined, nowMs: number) {
  const leaseExpiresAt = typeof data?.packet_generation_lease_expires_at === 'string'
    ? new Date(data.packet_generation_lease_expires_at).getTime()
    : 0;
  return data?.packet_generation_state === 'running'
    && typeof data?.packet_generation_owner === 'string'
    && data.packet_generation_owner.length > 0
    && Number.isFinite(leaseExpiresAt)
    && leaseExpiresAt > nowMs;
}

export function resolveJobPacketArtifacts(input: {
  existing?: ExistingJobPacketArtifacts | null;
  existingResumeArtifact?: PersistedGuardedResumeArtifact | null;
  currentSourceResumeId: string;
  currentSourceResumeHash: string;
  currentJobTitle: string;
  currentCompany: string;
  morphSucceeded: boolean;
  coverLetterSucceeded: boolean;
  coverLetter: string;
  coverLetterReport: CoverLetterGuardrailReport | null;
}) {
  const priorMorphVerified = input.existing?.morph_succeeded === true
    && isCurrentResumeMorphGuardrailReport(input.existing?.morph_guardrail_report)
    && input.existing?.morph_source_resume_id === input.currentSourceResumeId
    && input.existing?.morph_source_resume_hash === input.currentSourceResumeHash
    && isCurrentGuardedResumeArtifact(
      input.existingResumeArtifact,
      input.existing?.morph_guardrail_report,
      { id: input.currentSourceResumeId, hash: input.currentSourceResumeHash },
    );
  const priorMorphVersionId = priorMorphVerified
    && input.existing?.resume_version_id
    ? String(input.existing.resume_version_id)
    : null;
  const priorCoverLetter = input.existing?.cover_letter_succeeded === true
    && isCurrentCoverLetterGuardrailReport(input.existing?.cover_letter_guardrail_report, {
      content: input.existing?.cover_letter,
      sourceResumeId: input.currentSourceResumeId,
      sourceResumeHash: input.currentSourceResumeHash,
      jobTitle: input.currentJobTitle,
      company: input.currentCompany,
    })
    && input.existing?.cover_letter_source_resume_id === input.currentSourceResumeId
    && input.existing?.cover_letter_source_resume_hash === input.currentSourceResumeHash
    && typeof input.existing?.cover_letter === 'string'
      ? input.existing.cover_letter
      : '';
  const priorCoverLetterReport = priorCoverLetter
    ? input.existing?.cover_letter_guardrail_report as CoverLetterGuardrailReport
    : null;
  const effectiveMorphSucceeded = input.morphSucceeded || Boolean(priorMorphVersionId);
  const newCoverLetterVerified = input.coverLetterSucceeded
    && isCurrentCoverLetterGuardrailReport(input.coverLetterReport, {
      content: input.coverLetter,
      sourceResumeId: input.currentSourceResumeId,
      sourceResumeHash: input.currentSourceResumeHash,
      jobTitle: input.currentJobTitle,
      company: input.currentCompany,
    });
  const effectiveCoverLetter = newCoverLetterVerified ? input.coverLetter : priorCoverLetter;
  const effectiveCoverLetterReport = newCoverLetterVerified
    ? input.coverLetterReport
    : priorCoverLetterReport;
  const effectiveCoverLetterSucceeded = Boolean(effectiveCoverLetter && effectiveCoverLetterReport);

  return {
    priorMorphVersionId,
    effectiveMorphSucceeded,
    effectiveCoverLetter,
    effectiveCoverLetterReport,
    effectiveCoverLetterSucceeded,
    packetPrepared: effectiveMorphSucceeded && effectiveCoverLetterSucceeded,
  };
}
