import { normalizeResume, type CanonicalResume } from './resume-normalizer';
import { sanitizeResumeReviewState, type ResumeReviewState } from './resume-review-ledger';
import type { ProofResult } from './tfidf-proof';
import { readResumeDesign, type ResumeDesignConfig } from './resume-design';
import type { WorkspaceSourceSnapshot } from './resume-workspace';

export interface ResumeGenerationSourceContext {
  workspaceSource: WorkspaceSourceSnapshot | null;
  rawText: string;
  metadata: { fileName?: string; sourceType?: 'direct' | 'storage' | 'paste' | 'library'; characterCount?: number; detectedType?: string; storagePathDeleted?: boolean };
}

export type ResumeSection = 'source' | 'target' | 'shape' | 'design' | 'ship';
export type ResumeSectionStatus = 'not-started' | 'in-progress' | 'ready' | 'attention' | 'outdated';
export interface ResumeGenerationInputs {
  source: CanonicalResume;
  jobDescription: string;
  role: string;
  company: string;
  postingUrl: string;
  percentage: number;
  targetPageCount: number | 'auto';
  unlocked100: boolean;
}
export interface ResumeGeneration {
  schemaVersion: 2;
  id: string;
  createdAt: string;
  inputs: ResumeGenerationInputs;
  effectivePercentage: number;
  candidate: CanonicalResume;
  sourceContext?: ResumeGenerationSourceContext;
  review: ResumeReviewState;
  score: number | null;
  proof: ProofResult | null;
  guardrailReport: {
    effectiveMorphPercentage?: number;
    protectedFields?: string[];
    blockedChangeCount?: number;
  } | null;
  presentation: { templateId: string; paletteId: string; pageSize: 'A4' | 'LETTER'; design?: ResumeDesignConfig | null; pdfExportMode?: 'designed' | 'application' };
}

// Navigation and presentation are deliberately absent: changing views never
// changes which request or generation owns the user's content.
export function resumeGenerationKey(inputs: ResumeGenerationInputs): string {
  return JSON.stringify([
    normalizeResume(inputs.source), inputs.jobDescription.trim(), inputs.role.trim(),
    inputs.company.trim(), inputs.postingUrl.trim(), inputs.percentage,
    inputs.targetPageCount, inputs.unlocked100,
  ]);
}

export function generationNeedsRegeneration(generation: ResumeGeneration | null, inputs: ResumeGenerationInputs): boolean {
  return Boolean(generation && resumeGenerationKey(generation.inputs) !== resumeGenerationKey(inputs));
}

export function retainPreviousGeneration(history: ResumeGeneration[], generation: ResumeGeneration | null): ResumeGeneration[] {
  if (!generation) return history;
  return [generation, ...history.filter(item => item.id !== generation.id)].slice(0, 10);
}

// Validate recoverable snapshots, including cloud metadata, instead of trusting
// arbitrary stored objects as an applied AI configuration.
export function restoreResumeGeneration(value: unknown): ResumeGeneration | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as ResumeGeneration;
  if (item.schemaVersion !== 2 || typeof item.id !== 'string' || !item.id || !item.inputs ||
      typeof item.inputs.jobDescription !== 'string' || typeof item.inputs.source !== 'object' || !item.inputs.source ||
      typeof item.candidate !== 'object' || !item.candidate ||
      !Number.isFinite(item.inputs.percentage) || item.inputs.percentage < 25 || item.inputs.percentage > 100 ||
      !Number.isFinite(item.effectivePercentage) || item.effectivePercentage < 25 || item.effectivePercentage > 100 ||
      ['role', 'company', 'postingUrl'].some(key => item.inputs[key as 'role' | 'company' | 'postingUrl'] != null && typeof item.inputs[key as 'role' | 'company' | 'postingUrl'] !== 'string')) return null;
  return {
    ...item,
    sourceContext: restoreGenerationSourceContext(item.sourceContext),
    inputs: { ...item.inputs, source: normalizeResume(item.inputs.source), role: item.inputs.role || '',
      company: item.inputs.company || '', postingUrl: item.inputs.postingUrl || '',
      unlocked100: item.inputs.unlocked100 === true,
      targetPageCount: item.inputs.targetPageCount === 1 || item.inputs.targetPageCount === 2 ? item.inputs.targetPageCount : 'auto' },
    candidate: normalizeResume(item.candidate), review: sanitizeResumeReviewState(item.review),
    score: typeof item.score === 'number' ? item.score : null, proof: item.proof || null,
    guardrailReport: item.guardrailReport || null,
    presentation: { templateId: item.presentation?.templateId || '', paletteId: item.presentation?.paletteId || '',
      design: readResumeDesign(item.presentation?.design, normalizeResume(item.candidate)),
      pdfExportMode: item.presentation?.pdfExportMode === 'application' ? 'application' : 'designed',
      pageSize: item.presentation?.pageSize === 'LETTER' ? 'LETTER' : 'A4' },
  };
}

function restoreGenerationSourceContext(value: unknown): ResumeGenerationSourceContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const context = value as ResumeGenerationSourceContext;
  const metadata = context.metadata || {};
  let workspaceSource: WorkspaceSourceSnapshot | null = null;
  if (context.workspaceSource && typeof context.workspaceSource === 'object' && !Array.isArray(context.workspaceSource)) {
    try { workspaceSource = JSON.parse(JSON.stringify(context.workspaceSource)); } catch { /* corrupt provenance is unlinked */ }
  }
  return { workspaceSource, rawText: typeof context.rawText === 'string' ? context.rawText : '', metadata: {
    fileName: typeof metadata.fileName === 'string' ? metadata.fileName : undefined,
    sourceType: ['direct', 'storage', 'paste', 'library'].includes(metadata.sourceType || '') ? metadata.sourceType : undefined,
    characterCount: typeof metadata.characterCount === 'number' && Number.isFinite(metadata.characterCount) ? metadata.characterCount : undefined,
    detectedType: typeof metadata.detectedType === 'string' ? metadata.detectedType : undefined,
    storagePathDeleted: metadata.storagePathDeleted === true,
  } };
}

export function resumeSectionStatuses(input: {
  hasSource: boolean; sourcePending: boolean; sourceError: boolean; sourceWarnings: boolean;
  hasJob: boolean; generating: boolean; hasCandidate: boolean; outdated: boolean;
  needsReview: boolean; hasTemplateAccess: boolean; saved: boolean;
  /** A loaded document (e.g. a saved tailored version without a source snapshot). */
  hasDocument?: boolean;
}): Record<ResumeSection, ResumeSectionStatus> {
  return {
    source: input.sourcePending ? 'in-progress' : input.sourceError || input.sourceWarnings ? 'attention' : input.hasSource ? 'ready' : 'not-started',
    target: input.hasJob ? 'ready' : 'not-started',
    shape: input.generating ? 'in-progress' : input.outdated ? 'outdated' : input.needsReview ? 'attention' : input.hasCandidate ? 'ready' : 'not-started',
    // A default template is always selected, but nothing is ready to design
    // until there is a source: "Ready" beside four "Not started" steps misled.
    design: !input.hasSource && !input.hasDocument ? 'not-started' : input.hasTemplateAccess ? 'ready' : 'attention',
    ship: input.outdated || input.needsReview ? 'attention' : input.saved ? 'ready' : input.hasCandidate ? 'in-progress' : 'not-started',
  };
}
