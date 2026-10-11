/** Pure contracts for the Experience/Resume workspace boundary.
 *
 * This module deliberately has no Firebase, React, or browser dependencies. A
 * save command can build its envelope from the snapshots it captured at start,
 * then a reader can safely reopen old and new records without guessing source
 * identity from the current editor state.
 */

import { readResumeDesign, type ResumeDesignConfig } from './resume-design';
import { isSearchSourceRecord, isSearchSourceWorkspace, type SearchSourceWorkspace } from './resume-search-source';

export type WorkspaceKind = 'experience' | 'resume' | 'source';
export type WorkspaceOrigin = 'user_upload' | 'user_authored' | 'tailored' | 'legacy';

export interface WorkspaceSourceSnapshot {
  sourceVersionId?: string | null;
  revisionId?: string | null;
  contentHash?: string | null;
  content?: unknown;
  rawText?: string | null;
  confirmedAt?: string | null;
  [key: string]: unknown;
}

export interface WorkspaceTargetSnapshot {
  role?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  jobDescription?: string | null;
  url?: string | null;
  targetRole?: string | null;
  targetCompany?: string | null;
  postingUrl?: string | null;
}

export interface WorkspacePresentationSnapshot {
  design?: ResumeDesignConfig | null;
  template?: string | null;
  palette?: string | null;
  paletteId?: string | null;
  targetPageCount?: number | 'auto' | null;
  [key: string]: unknown;
}

export interface WorkspaceMetadata {
  schemaVersion: 1;
  kind: 'experience' | 'resume';
  origin: WorkspaceOrigin;
  parentVersionId: string | null;
  sourceVersionId: string | null;
  sourceSnapshot: WorkspaceSourceSnapshot | null;
  sourceHash: string | null;
  contentHash: string | null;
  sourceConfirmedAt: string | null;
  target: WorkspaceTargetSnapshot;
  presentation: WorkspacePresentationSnapshot;
}

export interface CreateWorkspaceMetadataInput {
  kind: 'experience' | 'resume';
  origin: WorkspaceOrigin;
  parentVersionId?: string | null;
  sourceVersionId?: string | null;
  sourceSnapshot?: WorkspaceSourceSnapshot | null;
  sourceHash?: string | null;
  contentHash?: string | null;
  content?: unknown;
  sourceConfirmedAt?: string | null;
  target?: WorkspaceTargetSnapshot;
  presentation?: WorkspacePresentationSnapshot;
}

export interface ReadWorkspaceVersionResult {
  id: string | null;
  name: string;
  kind: WorkspaceKind;
  origin: WorkspaceOrigin;
  source: WorkspaceSourceSnapshot | null;
  sourceSnapshot: WorkspaceSourceSnapshot | null;
  sourceVersionId: string | null;
  sourceHash: string | null;
  contentHash: string | null;
  parentVersionId: string | null;
  sourceConfirmedAt: string | null;
  candidate: unknown | null;
  target: WorkspaceTargetSnapshot;
  presentation: WorkspacePresentationSnapshot;
  config: { target: WorkspaceTargetSnapshot; presentation: WorkspacePresentationSnapshot };
  metadata: Record<string, unknown>;
  legacy: boolean;
  unavailable: boolean;
}

const EMPTY_TARGET: WorkspaceTargetSnapshot = {
  role: null, jobTitle: null, company: null, jobDescription: null, url: null,
  targetRole: null, targetCompany: null, postingUrl: null,
};
const EMPTY_PRESENTATION: WorkspacePresentationSnapshot = {
  template: null, palette: null, paletteId: null, targetPageCount: null,
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function cloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (value === undefined || value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export async function stableWorkspaceContentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeTarget(value: unknown): WorkspaceTargetSnapshot {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { ...EMPTY_TARGET, ...Object.fromEntries(Object.keys(EMPTY_TARGET).map(key => [key, text(source[key])])) };
}

function safePresentation(value: unknown): WorkspacePresentationSnapshot {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const pageCount = source.targetPageCount === 'auto' || (typeof source.targetPageCount === 'number' && Number.isFinite(source.targetPageCount))
    ? source.targetPageCount : null;
  return {
    ...EMPTY_PRESENTATION,
    ...source,
    design: readResumeDesign(source.design),
    template: text(source.template),
    palette: text(source.palette),
    paletteId: text(source.paletteId),
    targetPageCount: pageCount,
  };
}

/** Build a versioned envelope only from explicit snapshots supplied by the save command. */
export function createWorkspaceMetadata(input: CreateWorkspaceMetadataInput): WorkspaceMetadata {
  if (!input || (input.kind !== 'experience' && input.kind !== 'resume')) {
    throw new TypeError('Workspace metadata writer only supports experience and resume records.');
  }
  const sourceSnapshot = input.sourceSnapshot && typeof input.sourceSnapshot === 'object'
    ? cloneSnapshot(input.sourceSnapshot)
    : null;
  return {
    schemaVersion: 1,
    kind: input.kind,
    origin: input.origin,
    parentVersionId: text(input.parentVersionId),
    sourceVersionId: text(input.sourceVersionId) || text(sourceSnapshot?.sourceVersionId) || null,
    sourceSnapshot,
    sourceHash: text(input.sourceHash) || text(sourceSnapshot?.contentHash),
    contentHash: text(input.contentHash),
    sourceConfirmedAt: text(input.sourceConfirmedAt) || text(sourceSnapshot?.confirmedAt),
    target: safeTarget(input.target),
    presentation: safePresentation(input.presentation),
  };
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);
}

export function isValidWorkspaceMetadata(raw: unknown): raw is WorkspaceMetadata {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;
  const kind = candidate.kind;
  const origin = candidate.origin;
  if (candidate.schemaVersion !== 1 || (kind !== 'experience' && kind !== 'resume')) return false;
  if (!['user_upload', 'user_authored', 'tailored', 'legacy'].includes(String(origin))) return false;
  if (kind === 'experience' && !['user_upload', 'user_authored'].includes(String(origin))) return false;
  if (!validHash(candidate.contentHash)) return false;
  if (candidate.sourceHash != null && !validHash(candidate.sourceHash)) return false;
  const source = candidate.sourceSnapshot;
  if (kind === 'experience') {
    if (origin === 'user_upload' || origin === 'user_authored') {
      if (!source || typeof source !== 'object' || !candidate.sourceVersionId || !candidate.sourceConfirmedAt) return false;
      const sourceObject = source as Record<string, unknown>;
      if (sourceObject.content == null && typeof sourceObject.rawText !== 'string') return false;
      if (!candidate.sourceHash || !validHash(sourceObject.contentHash) || candidate.sourceHash !== sourceObject.contentHash) return false;
      if (candidate.contentHash !== candidate.sourceHash) return false;
    }
  }
  if (source && typeof source === 'object' && candidate.sourceHash != null && (source as Record<string, unknown>).contentHash != null
    && candidate.sourceHash !== (source as Record<string, unknown>).contentHash) return false;
  return true;
}

/** Read a persisted version; missing or malformed lineage is an explicitly unavailable legacy source. */
export function readWorkspaceVersion(version: any): ReadWorkspaceVersionResult {
  const metadata = version?.metadata && typeof version.metadata === 'object' ? version.metadata as Record<string, unknown> : {};
  const raw = metadata.workspace && typeof metadata.workspace === 'object' ? metadata.workspace as Record<string, unknown> : null;
  const hasSourceEnvelope = Boolean(raw && (raw.schemaVersion === 2 || raw.kind === 'source')) || version?.source_confirmation_receipt != null || metadata.source_confirmation_receipt != null;
  if (hasSourceEnvelope) {
    const sourceRecord = { ...version };
    const valid = isSearchSourceWorkspace(raw) && isSearchSourceRecord(sourceRecord);
    const sourceWorkspace = valid ? raw as SearchSourceWorkspace : null;
    const content = valid ? version.content : null;
    const sourceSnapshot: WorkspaceSourceSnapshot | null = valid ? {
      sourceVersionId: sourceWorkspace!.sourceVersionId,
      content,
      contentHash: sourceWorkspace!.contentHash,
      confirmedAt: sourceWorkspace!.sourceConfirmedAt,
    } : null;
    const emptyTarget = safeTarget(null);
    const emptyPresentation = safePresentation(null);
    const origin: WorkspaceOrigin = sourceWorkspace?.origin || 'legacy';
    return {
      id: typeof version?.id === 'string' ? version.id : null,
      name: text(version?.version_name || version?.name) || 'Confirmed source',
      kind: 'source', origin,
      source: sourceSnapshot, sourceSnapshot,
      sourceVersionId: sourceWorkspace?.sourceVersionId || null,
      sourceHash: sourceWorkspace?.sourceHash || null,
      contentHash: sourceWorkspace?.contentHash || null,
      parentVersionId: null,
      sourceConfirmedAt: sourceWorkspace?.sourceConfirmedAt || null,
      candidate: content,
      target: emptyTarget,
      presentation: emptyPresentation,
      config: { target: emptyTarget, presentation: emptyPresentation },
      metadata,
      legacy: false,
      unavailable: !valid,
    };
  }
  const hasEnvelope = Boolean(raw && isValidWorkspaceMetadata(raw));
  const workspace = hasEnvelope ? createWorkspaceMetadata(raw as unknown as CreateWorkspaceMetadataInput) : createWorkspaceMetadata({
    kind: 'resume', origin: 'legacy', target: {
      targetRole: text(metadata.targetRole), targetCompany: text(metadata.targetCompany),
      jobDescription: text(metadata.jobDescription), postingUrl: text(metadata.postingUrl),
    }, presentation: {
      template: text(metadata.template), paletteId: text(metadata.paletteId),
      targetPageCount: metadata.targetPageCount === 'auto' || typeof metadata.targetPageCount === 'number' ? metadata.targetPageCount : null,
    },
  });
  return {
    id: typeof version?.id === 'string' ? version.id : null,
    name: text(version?.version_name || version?.name) || 'Untitled resume',
    kind: workspace.kind,
    origin: workspace.origin,
    source: workspace.sourceSnapshot,
    sourceSnapshot: workspace.sourceSnapshot,
    sourceVersionId: workspace.sourceVersionId,
    sourceHash: workspace.sourceHash,
    contentHash: workspace.contentHash,
    parentVersionId: workspace.parentVersionId,
    sourceConfirmedAt: workspace.sourceConfirmedAt,
    candidate: version?.content || version?.resume || version?.parsed || null,
    target: workspace.target,
    presentation: workspace.presentation,
    config: { target: workspace.target, presentation: workspace.presentation },
    metadata,
    legacy: !hasEnvelope || workspace.origin === 'legacy',
    unavailable: false,
  };
}

/** Stable, owner-bound key for callers that want retry-safe content saves. */
export async function buildResumeIdempotencyKey(ownerId: string, contentHash: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ownerId}\0${contentHash}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
