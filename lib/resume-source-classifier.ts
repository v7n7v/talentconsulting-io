/** Browser-safe source eligibility classifier shared by picker and search UI. */

import { normalizeVerifiedResumeProvenance } from './resume-provenance';
import { isValidWorkspaceMetadata } from './resume-workspace';
import { isSearchSourceRecord, isSearchSourceWorkspace } from './resume-search-source';

export type ResumeSource = 'resume_versions' | 'vault' | 'profile';
export type ResumeVerificationKind = 'explicit_user_source' | 'legacy_user_approved' | 'unverified';

export interface ResumeVerification {
  verified: boolean;
  kind: ResumeVerificationKind;
  reason: string;
}

function isGeneratedResumeDraft(data: any): boolean {
  const source = String(data?.source || data?.metadata?.savedFrom || '').toLowerCase();
  const savedFrom = String(data?.metadata?.savedFrom || '').toLowerCase();
  const mode = String(data?.mode || '').toLowerCase();
  const isSonaUpload = source === 'sona_upload' || source === 'sona_resume_upload';
  const hasMorphMetadata = Boolean(
    data?.guardrail_report
    || data?.morph_guardrail_report
    || data?.morph_effective_percentage
    || data?.metadata?.guardrailReport
    || data?.skill_graph?.guardrailReport,
  );

  return hasMorphMetadata
    || (source.startsWith('sona') && !isSonaUpload)
    || source.includes('agent')
    || source.includes('morph')
    || source.includes('optimiz')
    || savedFrom.includes('optimiz')
    || savedFrom.includes('morph')
    || source.includes('auto_fix')
    || source.includes('nightly')
    || source.includes('apply_pipeline')
    || mode.includes('agent')
    || mode.includes('morph');
}

export function classifyResumeVerification(data: any, source: ResumeSource): ResumeVerification {
  const workspace = data?.metadata?.workspace;
  const hasSourceEnvelope = Boolean(workspace && typeof workspace === 'object' && (workspace.schemaVersion === 2 || workspace.kind === 'source'))
    || data?.source_confirmation_receipt != null || data?.metadata?.source_confirmation_receipt != null;
  if (hasSourceEnvelope) {
    if (source === 'resume_versions' && isSearchSourceWorkspace(workspace) && isSearchSourceRecord(data)) {
      return { verified: true, kind: 'explicit_user_source', reason: 'Sealed, user-confirmed role-search source.' };
    }
    return { verified: false, kind: 'unverified', reason: 'Sealed source envelope is malformed or belongs to another namespace.' };
  }
  if (isGeneratedResumeDraft(data)) {
    return { verified: false, kind: 'unverified', reason: 'Generated or morphed resume output cannot be a source of truth.' };
  }
  if (workspace != null && !isValidWorkspaceMetadata(workspace)) {
    return { verified: false, kind: 'unverified', reason: 'Workspace lineage envelope is malformed.' };
  }
  if (workspace?.schemaVersion === 1) {
    if (workspace.kind === 'resume') {
      return { verified: false, kind: 'unverified', reason: 'Resume documents are never promoted to factual source records.' };
    }
    if (workspace.kind === 'experience' && (workspace.origin === 'user_upload' || workspace.origin === 'user_authored')) {
      return { verified: true, kind: 'explicit_user_source', reason: 'Confirmed Experience revision with explicit source lineage.' };
    }
    return { verified: false, kind: 'unverified', reason: 'Workspace lineage is generated or unavailable.' };
  }
  const rawProvenance = data?.provenance || data?.resume_provenance;
  const explicitProvenance = normalizeVerifiedResumeProvenance(
    rawProvenance,
    String(rawProvenance?.recordedAt || data?.updatedAt || data?.updated_at || data?.createdAt || data?.created_at || ''),
  );
  if (explicitProvenance) {
    return { verified: true, kind: 'explicit_user_source', reason: 'Stored with explicit user-source provenance.' };
  }
  if (source === 'resume_versions' && data?.is_active === true) {
    return { verified: true, kind: 'legacy_user_approved', reason: 'Legacy active resume with no generated-output markers.' };
  }
  return { verified: false, kind: 'unverified', reason: 'Resume provenance is missing or ambiguous.' };
}
