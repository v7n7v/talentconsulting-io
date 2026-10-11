import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  createSearchSourceWorkspace, parseConfirmSearchSourceRequest, SearchSourceValidationError,
  type ConfirmSearchSourceRequest, type SearchSourceReceipt,
} from './resume-search-source';
import { hashConfirmedSource, hashSearchSourcePayload, validateSealedSearchSource } from './resume-source-integrity';

export interface SourceCreationPolicy { enabled: boolean; retentionPolicyVersion: string }

/** Deployment activation also needs an approved eraser to provision and retain
 * account_source_fences. Neither an environment flag nor a missing user tree is
 * evidence that the account is active. The fence must survive user erasure. */
export function sourceCreationPolicy(): SourceCreationPolicy {
  return {
    enabled: process.env.RESUME_SOURCE_CREATION_ENABLED === 'true',
    retentionPolicyVersion: process.env.RESUME_SOURCE_RETENTION_POLICY_VERSION || '',
  };
}

export function searchSourceId(requestId: string): string {
  return `source_${createHash('sha256').update(requestId.toLowerCase()).digest('hex')}`;
}

function sourceError(code: string, message: string, status: number): never {
  throw new SearchSourceValidationError(code, message, status);
}

function assertAccountMayRead(lifecycle: any, fence: any) {
  if (lifecycle?.exists && lifecycle.data()?.status !== 'active') {
    sourceError('SOURCE_ACCOUNT_UNAVAILABLE', 'This account cannot use saved résumé sources.', 403);
  }
  if (fence?.exists && fence.data()?.status !== 'active') {
    sourceError('SOURCE_ACCOUNT_UNAVAILABLE', 'This account cannot use saved résumé sources.', 403);
  }
}

async function readAccountFence(db: Firestore, transaction: Transaction, uid: string) {
  const fenceRef = db.collection('account_source_fences').doc(uid);
  const lifecycleRef = db.collection('users').doc(uid).collection('settings').doc('accountLifecycle');
  const [fence, lifecycle] = await Promise.all([transaction.get(fenceRef), transaction.get(lifecycleRef)]);
  assertAccountMayRead(lifecycle, fence);
  return fence;
}

export async function confirmSearchSource(db: Firestore, uid: string, input: unknown, policy = sourceCreationPolicy()) {
  const request: ConfirmSearchSourceRequest = parseConfirmSearchSourceRequest(input);
  const id = searchSourceId(request.requestId);
  const hashes = hashConfirmedSource(request.confirmedContent);
  const payloadHash = hashSearchSourcePayload(request);
  const ref = db.collection('users').doc(uid).collection('resume_versions').doc(id);
  return db.runTransaction(async transaction => {
    const fence = await readAccountFence(db, transaction, uid);
    const previous = await transaction.get(ref);
    if (previous.exists) {
      const source = previous.data()!;
      const sealed = validateSealedSearchSource(source, { uid, id, collection: 'resume_versions' });
      if (!sealed || sealed.receipt.payloadHash !== payloadHash) {
        sourceError('SOURCE_REQUEST_CONFLICT', 'This save request belongs to a different résumé revision. Confirm your changes as a new revision.', 409);
      }
      return { source, receipt: sealed.receipt, replayed: true };
    }
    // Recovery is a read of the original command, even after a rollout hold.
    // The account fence still precedes it; a deleted owner can never replay.
    if (!policy.enabled || !policy.retentionPolicyVersion || !fence.exists || fence.data()?.retentionPolicyVersion !== policy.retentionPolicyVersion) {
      sourceError('SOURCE_CREATION_UNAVAILABLE', 'Saving a résumé for Find roles is not available yet. Your résumé is still here; you can continue editing or tailor it to a pasted job description.', 503);
    }
    const confirmedAt = new Date().toISOString();
    const receipt: SearchSourceReceipt = {
      schemaVersion: 1, ownerId: uid, sourceId: id, requestId: request.requestId,
      contentHash: hashes.contentHash, packetHash: hashes.packetHash, payloadHash, confirmedAt,
      contentHashEncoding: 'sha256-stable-json-v1', hashEncoding: 'sha256-json-stringify-v1',
    };
    const source = {
      id, user_id: uid, version_name: request.confirmedContent.name || 'My résumé',
      content: hashes.content, source: 'user_confirmed_role_search', is_active: true,
      provenance: { verified: true, origin: request.origin, recordedAt: confirmedAt },
      metadata: { workspace: createSearchSourceWorkspace({ sourceId: id, origin: request.origin, contentHash: hashes.contentHash, confirmedAt }) },
      source_confirmation_receipt: receipt,
      ...(request.intake ? { intake: request.intake } : {}),
      created_at: confirmedAt, updated_at: confirmedAt,
    };
    if (Buffer.byteLength(JSON.stringify(source), 'utf8') > 900000) {
      sourceError('SOURCE_TOO_LARGE', 'This résumé contains too much source material to save. Shorten the text and retry.', 413);
    }
    transaction.create(ref, source);
    return { source, receipt, replayed: false };
  });
}

export async function readSearchSource(db: Firestore, uid: string, id: string) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(id)) sourceError('INVALID_SOURCE_ID', 'The résumé source link is invalid.', 400);
  const ref = db.collection('users').doc(uid).collection('resume_versions').doc(id);
  return db.runTransaction(async transaction => {
    await readAccountFence(db, transaction, uid);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) sourceError('SOURCE_NOT_FOUND', 'This résumé source is unavailable. Return to your résumé and choose a confirmed revision.', 404);
    const source = snapshot.data()!;
    const sealed = validateSealedSearchSource(source, { uid, id, collection: 'resume_versions' });
    if (!sealed) sourceError('SOURCE_INTEGRITY_FAILED', 'This résumé source could not be verified. Confirm a new revision from your original résumé.', 422);
    return { source, receipt: sealed.receipt };
  });
}

/** No PII or parsed body appears in error responses or logs. */
export async function readBoundedSourceBody(request: Request): Promise<unknown> {
  const limit = 800000;
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) sourceError('SOURCE_TOO_LARGE', 'The résumé save request is too large.', 413);
  if (!request.body) sourceError('INVALID_SEARCH_SOURCE', 'The résumé save request is empty.', 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); sourceError('SOURCE_TOO_LARGE', 'The résumé save request is too large.', 413); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SearchSourceValidationError) throw error;
    sourceError('INVALID_SEARCH_SOURCE', 'The résumé save request is not valid JSON.', 400);
  } finally { reader.releaseLock(); }
}
