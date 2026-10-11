import { createHash } from 'node:crypto';
import {
  isSearchSourceRecord,
  isSearchSourceWorkspace,
  normalizeConfirmedSource,
  parseConfirmSearchSourceRequest,
  stableSourceStringify,
  type CanonicalResume,
  type ConfirmSearchSourceRequest,
  type SearchSourceReceipt,
} from './resume-search-source';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Hash the exact source bytes under both supported canonical encodings. */
export function hashConfirmedSource(value: unknown): { content: CanonicalResume; contentHash: string; packetHash: string } {
  const content = normalizeConfirmedSource(value);
  return {
    content,
    contentHash: sha256(stableSourceStringify(content)),
    packetHash: sha256(JSON.stringify(content)),
  };
}

/** Hash request semantics, excluding anything generated later such as timestamps. */
export function hashSearchSourcePayload(value: unknown): string {
  const request: ConfirmSearchSourceRequest = parseConfirmSearchSourceRequest(value);
  return sha256(stableSourceStringify(request));
}

/**
 * Verify a sealed source document before role-search use. Legacy records are
 * deliberately handled by the caller; malformed v2 source envelopes fail closed.
 */
export function validateSealedSearchSource(
  data: unknown,
  options: { uid: string; id: string; collection?: string },
): { content: CanonicalResume; contentHash: string; packetHash: string; receipt: SearchSourceReceipt } | null {
  if (!options || (options.collection !== undefined && options.collection !== 'resume_versions')) return null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  const workspace = meta.workspace;
  const receipt = record.source_confirmation_receipt;
  // Only this module's sealed-source shape is accepted; do not fall back to
  // legacy active/provenance logic after a source envelope is present.
  if (!isSearchSourceWorkspace(workspace) || !receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return null;
  if (record.id !== options.id || record.user_id !== options.uid || !isSearchSourceRecord(record)) return null;
  const sourceReceipt = receipt as unknown as SearchSourceReceipt;
  if (sourceReceipt.ownerId !== options.uid || sourceReceipt.sourceId !== options.id || workspace.sourceVersionId !== options.id) return null;
  try {
    const hashes = hashConfirmedSource(record.content);
    if (stableSourceStringify(hashes.content) !== stableSourceStringify(record.content)) return null;
    if (hashes.contentHash !== workspace.contentHash || hashes.contentHash !== workspace.sourceHash || hashes.contentHash !== sourceReceipt.contentHash) return null;
    if (hashes.packetHash !== sourceReceipt.packetHash) return null;
    if (sourceReceipt.contentHashEncoding !== 'sha256-stable-json-v1' || sourceReceipt.hashEncoding !== 'sha256-json-stringify-v1') return null;
    if (sourceReceipt.confirmedAt !== workspace.sourceConfirmedAt || sourceReceipt.requestId.length === 0) return null;
    const payloadHash = hashSearchSourcePayload({
      requestId: sourceReceipt.requestId, confirmedContent: hashes.content, origin: workspace.origin,
      ...(record.intake === undefined ? {} : { intake: record.intake }),
    });
    if (payloadHash !== sourceReceipt.payloadHash) return null;
    return { ...hashes, receipt: sourceReceipt };
  } catch {
    return null;
  }
}
