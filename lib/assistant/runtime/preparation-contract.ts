import { createHash } from 'node:crypto';
import { z } from 'zod';

/** P1 contract only. No endpoint or model tool may mint authority from this schema. */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = integer.positive();

export const PreparationRequestSchema = z.object({
  requestId: id,
  resumeVersionId: id,
  operation: z.enum(['analyze_supplied_role', 'prepare_packet']),
  posting: z.object({
    title: z.string().trim().min(1).max(200),
    company: z.string().trim().min(1).max(200),
    // Preserve exact supplied text; its digest is not interchangeable with the
    // existing packet hash of JSON.stringify(normalized text).
    text: z.string().min(1).max(12_000).refine(value => value.trim().length > 0),
    url: z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value)).optional(),
  }).strict(),
}).strict();

export type PreparationRequest = z.infer<typeof PreparationRequestSchema>;
export type PreparationOperation = PreparationRequest['operation'];

export const SourceBindingSchema = z.object({
  collection: z.enum(['resume_versions', 'vault']),
  id,
  hash: digest,
  hashEncoding: z.literal('sha256-json-stringify-v1'),
}).strict();
export type SourceBinding = z.infer<typeof SourceBindingSchema>;

export const PostingBindingSchema = z.object({
  hash: digest,
  hashEncoding: z.literal('sha256-utf8-exact-v1'),
}).strict();
export type PostingBinding = z.infer<typeof PostingBindingSchema>;

/** Persist server-side, separate from model arguments and external approval. */
export const PreparationCommandSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: id,
  requestId: id,
  userId: id,
  operation: PreparationRequestSchema.shape.operation,
  requestFingerprint: digest,
  source: SourceBindingSchema,
  posting: PostingBindingSchema,
  policyVersion: z.string().min(1).max(80),
  authorityEpoch: integer,
  deletionEpoch: integer,
  issuedAtMs: timestamp,
  expiresAtMs: timestamp,
  budget: z.object({
    maxProviderAttempts: integer.positive(),
    maxCostMicros: integer.positive(),
  }).strict(),
}).strict().refine(value => value.expiresAtMs > value.issuedAtMs, {
  message: 'Preparation authority must have a finite future deadline.',
});
export type PreparationCommand = z.infer<typeof PreparationCommandSchema>;

/** Loaded from current server authority/journal state, never a restored run or request body. */
export const CurrentPreparationAccessSchema = z.object({
  userId: id,
  tier: z.enum(['free', 'pro', 'studio', 'god']),
  authorityEpoch: integer,
  deletionEpoch: integer,
  revoked: z.boolean(),
  deleted: z.boolean(),
  restoreState: z.enum(['ready', 'quarantined']),
  policyVersion: z.string().min(1).max(80),
}).strict();
export type CurrentPreparationAccess = z.infer<typeof CurrentPreparationAccessSchema>;

export function bindPosting(text: string): PostingBinding {
  return { hash: createHash('sha256').update(text, 'utf8').digest('hex'), hashEncoding: 'sha256-utf8-exact-v1' };
}

/** Fixed field order; pinned source changes conflict even when the request ID is reused. */
export function preparationFingerprint(request: PreparationRequest, source: SourceBinding): string {
  const parsed = PreparationRequestSchema.parse(request);
  const binding = SourceBindingSchema.parse(source);
  if (parsed.resumeVersionId !== binding.id) throw new Error('Selected source does not match the confirmed source binding.');
  return createHash('sha256').update(JSON.stringify([
    1, parsed.operation, binding.collection, binding.id, binding.hashEncoding, binding.hash,
    parsed.posting.title, parsed.posting.company, parsed.posting.text, parsed.posting.url ?? null,
  ])).digest('hex');
}

/** Compatibility metadata: keep the legacy packet hash tagged; do not compare unlike digests. */
export interface LegacyPreparationReferences {
  analysisId?: string;
  applicationId?: string;
  packetRevision?: string;
  packetPostingHash?: { value: string; encoding: 'sha256-json-stringify-normalized-text-v1' };
}

/** Runtime selection remains provisional until the staging recovery comparison. */
export type ExecutionOwner =
  | { kind: 'firestore_tasks'; workflowVersion: string }
  | { kind: 'google_workflows'; workflowVersion: string; executionId: string };

export interface PreparationRunIdentity {
  schemaVersion: 1;
  runId: string;
  commandId: string;
  userId: string;
  inputFingerprint: string;
  executionOwner: ExecutionOwner;
  policyVersion: string;
  authorityEpoch: number;
  deletionEpoch: number;
  cancellationEpoch: number;
  attempt: number;
  fence: number;
  sequence: number;
}

/** Storage/transaction/restore enforcement is deliberately not implemented by these types. */
export interface PreparationEvent {
  schemaVersion: 1;
  eventId: string;
  runId: string;
  userId: string;
  sequence: number;
  commandId: string;
  causationId: string;
  occurredAtMs: number;
  kind: 'run_started' | 'step_committed' | 'run_paused' | 'run_resumed' | 'run_cancelled' | 'run_completed' | 'run_failed';
  resultRef?: string;
}
