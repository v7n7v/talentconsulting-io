import { auth } from './firebase';
import { authFetch } from './auth-fetch';
import { DEMO_USER_ID, isDemoModeEnabled } from './demo-mode';
import { classifyResumeVerification } from './resume-source-classifier';
import { normalizeResume } from './resume-normalizer';
import { readWorkspaceVersion, stableWorkspaceContentHash } from './resume-workspace';
import {
  isSearchSourceRecord,
  normalizeConfirmedSource,
  parseConfirmSearchSourceRequest,
  stableSourceStringify,
  type CanonicalResume,
  type ConfirmSearchSourceRequest,
  type SearchSourceReceipt,
} from './resume-search-source';

export interface ResumeSearchSourceResponse {
  source: Record<string, any>;
  receipt: SearchSourceReceipt;
}

export type SavedResumeRoleSearchReview =
  | { status: 'review'; content: CanonicalResume; origin: 'user_upload' | 'user_authored'; warning?: string }
  | { status: 'blocked'; reason: string };

type CapturedRequest = {
  ownerId: string;
  intentHash: string;
  request: ConfirmSearchSourceRequest;
};

const REQUEST_STORAGE_PREFIX = 'taco:resume-search-confirmation:v1';
const DEMO_STORAGE_PREFIX = 'taco:demo:resume-search-sources:v1';
const REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestMemory = new Map<string, CapturedRequest>();

export class ResumeSearchSourceError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(message: string, options: { code?: string; status?: number | null } = {}) {
    super(message);
    this.name = 'ResumeSearchSourceError';
    this.code = options.code || 'RESUME_SEARCH_SOURCE_FAILED';
    this.status = options.status ?? null;
  }
}

function hasGeneratedResumeMarkers(value: unknown): boolean {
  const markerKeys = new Set([
    'guardrail_report', 'morph_guardrail_report', 'morph_effective_percentage', 'guardrailReport',
    'proofScore', 'proof_score', 'proofReport', 'proof_report', 'packetProof', 'packet_proof',
    'generatedBy', 'generated_by', 'skill_graph', 'skillGraph',
  ]);
  const visit = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;
    if (Array.isArray(item)) return item.some(visit);
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (markerKeys.has(key)) return true;
      if ((key === 'source' || key === 'savedFrom' || key === 'mode') && typeof child === 'string'
        && /morph|optimi[sz]e|tailor|agent|generated|packet|auto_fix|nightly|apply_pipeline/i.test(child)) return true;
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(value);
}

/** Choose only factual content for the saved-resume review panel; never submit here. */
export async function prepareSavedResumeRoleSearchReview(version: Record<string, any>): Promise<SavedResumeRoleSearchReview> {
  const loaded = readWorkspaceVersion(version);
  const generated = loaded.origin === 'tailored' || hasGeneratedResumeMarkers(version);
  if (generated) {
    const snapshot = loaded.sourceSnapshot;
    if (!snapshot?.content || typeof snapshot.contentHash !== 'string') {
      return { status: 'blocked', reason: 'This saved version contains generated content but has no retained original source. Return to Source and open the factual résumé; the generated version cannot be used for Find roles.' };
    }
    try {
      const content = normalizeResume(snapshot.content) as CanonicalResume;
      const contentHash = await stableWorkspaceContentHash(content);
      if (contentHash !== snapshot.contentHash) {
        return { status: 'blocked', reason: 'The retained original source could not be verified. Return to Source and open the factual résumé; the generated version cannot be used for Find roles.' };
      }
      const origin = snapshot.origin === 'user_upload' ? 'user_upload' : 'user_authored';
      return { status: 'review', content, origin, warning: 'This saved version contains generated wording. Review the retained original source facts before confirming them for role search.' };
    } catch {
      return { status: 'blocked', reason: 'The retained original source could not be verified. Return to Source and open the factual résumé; the generated version cannot be used for Find roles.' };
    }
  }

  if (!loaded.candidate || typeof loaded.candidate !== 'object') {
    return { status: 'blocked', reason: 'This saved version has no readable factual résumé. Return to Source and open the original résumé.' };
  }
  const content = normalizeResume(loaded.candidate) as CanonicalResume;
  const verification = classifyResumeVerification(version, 'resume_versions');
  const warning = loaded.origin === 'legacy' || !verification.verified
    ? 'This older résumé has no clear saved source history. Review every fact and confirm it before using it for role search.'
    : undefined;
  const origin = loaded.origin === 'user_upload' ? 'user_upload' : 'user_authored';
  return { status: 'review', content, origin, ...(warning ? { warning } : {}) };
}

function assertOwner(ownerId: string): void {
  if (!ownerId || auth.currentUser?.uid !== ownerId) {
    throw new ResumeSearchSourceError('Your account changed. Reopen the résumé and confirm it again.', { code: 'SOURCE_OWNER_CHANGED' });
  }
}

function assertActive(ownerId: string, signal?: AbortSignal): void {
  assertOwner(ownerId);
  if (signal?.aborted) {
    throw new ResumeSearchSourceError('Résumé source verification was cancelled. Your content is still here.', { code: 'SOURCE_REQUEST_ABORTED' });
  }
}

function storageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function demoStorage(): Storage {
  try {
    if (typeof window === 'undefined' || !window.localStorage) throw new Error('unavailable');
    return window.localStorage;
  } catch {
    throw new ResumeSearchSourceError('This local preview could not save its example résumé. Allow local storage and retry.', { code: 'DEMO_STORAGE_UNAVAILABLE' });
  }
}

function hasWebCrypto(): boolean {
  return typeof globalThis.crypto !== 'undefined' && Boolean(globalThis.crypto.subtle);
}

async function sha256(value: string): Promise<string> {
  if (!hasWebCrypto()) throw new ResumeSearchSourceError('Secure résumé verification is unavailable in this browser.', { code: 'SOURCE_CRYPTO_UNAVAILABLE' });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function requestKey(ownerId: string, intentHash: string): string {
  return `${REQUEST_STORAGE_PREFIX}:${encodeURIComponent(ownerId)}:${intentHash}`;
}

function freshRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ResumeSearchSourceError('A secure save identifier could not be created in this browser.', { code: 'SOURCE_UUID_UNAVAILABLE' });
  }
  return globalThis.crypto.randomUUID();
}

function requestIntent(request: ConfirmSearchSourceRequest): Omit<ConfirmSearchSourceRequest, 'requestId'> {
  const { confirmedContent, origin, intake } = request;
  return { confirmedContent, origin, ...(intake === undefined ? {} : { intake }) };
}

async function captureRequest(ownerId: string, request: ConfirmSearchSourceRequest, signal?: AbortSignal): Promise<{ key: string; captured: CapturedRequest }> {
  assertActive(ownerId, signal);
  const confirmedContent = normalizeConfirmedSource(JSON.parse(JSON.stringify(request.confirmedContent)));
  const suppliedRequestId = REQUEST_UUID.test(request.requestId) ? request.requestId : undefined;
  const placeholderRequest = parseConfirmSearchSourceRequest({
    ...request,
    requestId: suppliedRequestId || '00000000-0000-4000-8000-000000000000',
    confirmedContent,
  });
  const intent = requestIntent(placeholderRequest);
  const intentHash = await sha256(stableSourceStringify(intent));
  assertActive(ownerId, signal);
  const key = requestKey(ownerId, intentHash);
  const inMemory = requestMemory.get(key);
  if (inMemory) {
    const verified = validateCapturedRequest(inMemory, ownerId, intentHash, intent, suppliedRequestId);
    return { key, captured: verified };
  }

  const storage = storageOrNull();
  if (!storage) {
    throw new ResumeSearchSourceError('This browser cannot keep a safe retry record for the résumé. Enable session storage and retry.', { code: 'SOURCE_RETRY_STORAGE_UNAVAILABLE' });
  }
  let stored: string | null;
  try { stored = storage.getItem(key); }
  catch { throw new ResumeSearchSourceError('This browser could not read the résumé retry record. Your content is unchanged; retry after checking session storage.', { code: 'SOURCE_RETRY_STORAGE_UNAVAILABLE' }); }
  if (stored) {
    try {
      const value = JSON.parse(stored) as CapturedRequest;
      const captured = validateCapturedRequest(value, ownerId, intentHash, intent, suppliedRequestId);
      requestMemory.set(key, captured);
      return { key, captured };
    } catch {
      throw new ResumeSearchSourceError('The saved confirmation retry could not be verified. Keep this résumé open and try again.', { code: 'SOURCE_RETRY_STATE_INVALID' });
    }
  }

  const requestId = REQUEST_UUID.test(request.requestId) ? request.requestId : freshRequestId();
  const capturedRequest = parseConfirmSearchSourceRequest({ ...request, requestId, confirmedContent });
  const captured: CapturedRequest = { ownerId, intentHash, request: capturedRequest };
  // Store before the first network attempt so a lost response can be replayed
  // with exactly the same payload and idempotency identity.
  try { storage.setItem(key, JSON.stringify(captured)); }
  catch {
    throw new ResumeSearchSourceError('This browser could not keep a safe retry record for the résumé. Your content is unchanged; retry after enabling session storage.', { code: 'SOURCE_RETRY_STORAGE_UNAVAILABLE' });
  }
  requestMemory.set(key, captured);
  return { key, captured };
}

function validateCapturedRequest(value: CapturedRequest, ownerId: string, intentHash: string,
  expectedIntent: Omit<ConfirmSearchSourceRequest, 'requestId'>, suppliedRequestId?: string): CapturedRequest {
  if (!value || value.ownerId !== ownerId || value.intentHash !== intentHash
    || !value.request || !REQUEST_UUID.test(value.request.requestId)) throw new Error('invalid retry state');
  const request = parseConfirmSearchSourceRequest(value.request);
  const storedIntent = requestIntent(request);
  if (stableSourceStringify(storedIntent) !== stableSourceStringify(expectedIntent)
    || (suppliedRequestId && suppliedRequestId !== request.requestId)) throw new Error('invalid retry payload');
  return { ownerId, intentHash, request };
}

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('The résumé source request timed out.', 'TimeoutError')), 30_000);
  return {
    signal: controller.signal,
    dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', abortFromCaller); },
  };
}

async function responseJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

async function requestJson(path: string, init: RequestInit, ownerId: string): Promise<any> {
  assertOwner(ownerId);
  const timeout = withTimeout(init.signal || undefined);
  try {
    const response = await authFetch(path, { ...init, signal: timeout.signal });
    assertActive(ownerId, timeout.signal);
    const payload = await responseJson(response);
    assertActive(ownerId, timeout.signal);
    if (!response.ok) {
      throw new ResumeSearchSourceError(typeof payload?.error === 'string' ? payload.error : 'Your résumé source could not be saved or verified. Your work is still here; retry when the connection is available.', {
        code: typeof payload?.code === 'string' ? payload.code : 'SOURCE_REQUEST_FAILED', status: response.status,
      });
    }
    return payload;
  } finally { timeout.dispose(); }
}

function sameReceipt(a: SearchSourceReceipt, b: SearchSourceReceipt): boolean {
  return stableSourceStringify(a) === stableSourceStringify(b);
}

async function validateResponse(payload: any, ownerId: string, sourceId: string, requestId: string,
  expectedRequest?: ConfirmSearchSourceRequest, signal?: AbortSignal): Promise<ResumeSearchSourceResponse> {
  assertActive(ownerId, signal);
  const source = payload?.source;
  const receipt = payload?.receipt;
  const verification = isSearchSourceRecord(source) ? classifyResumeVerification(source, 'resume_versions') : null;
  if (!verification?.verified || verification.kind !== 'explicit_user_source' || !receipt || typeof receipt !== 'object') {
    throw new ResumeSearchSourceError('The saved résumé source did not pass its integrity check. Your imported content is still here.', { code: 'SOURCE_INTEGRITY_FAILED' });
  }
  const normalized = normalizeConfirmedSource(source.content);
  const contentHash = await sha256(stableSourceStringify(normalized));
  assertActive(ownerId, signal);
  const packetHash = await sha256(JSON.stringify(normalized));
  assertActive(ownerId, signal);
  if (typeof requestId !== 'string' || !REQUEST_UUID.test(requestId)) {
    throw new ResumeSearchSourceError('The saved résumé source did not pass its integrity check. Your imported content is still here.', { code: 'SOURCE_INTEGRITY_FAILED' });
  }
  const derivedSourceId = `source_${await sha256(requestId.toLowerCase())}`;
  assertActive(ownerId, signal);
  const confirmed = source.source_confirmation_receipt as SearchSourceReceipt;
  const sourcePayloadHash = await sha256(stableSourceStringify({
    requestId,
    confirmedContent: normalized,
    origin: source.metadata?.workspace?.origin,
    ...(source.intake === undefined ? {} : { intake: source.intake }),
  }));
  const expectedPayloadHash = expectedRequest
    ? await sha256(stableSourceStringify(parseConfirmSearchSourceRequest({ ...expectedRequest, requestId })))
    : sourcePayloadHash;
  assertActive(ownerId, signal);
  if (source.id !== sourceId || source.user_id !== ownerId || sourceId !== derivedSourceId
    || confirmed.ownerId !== ownerId || confirmed.sourceId !== sourceId || confirmed.requestId !== requestId
    || receipt.ownerId !== ownerId || receipt.sourceId !== sourceId || receipt.requestId !== requestId
    || confirmed.contentHash !== contentHash || receipt.contentHash !== contentHash
    || confirmed.packetHash !== packetHash || receipt.packetHash !== packetHash
    || confirmed.payloadHash !== sourcePayloadHash || receipt.payloadHash !== sourcePayloadHash
    || confirmed.payloadHash !== expectedPayloadHash || receipt.payloadHash !== expectedPayloadHash
    || source.metadata?.workspace?.contentHash !== contentHash
    || (expectedRequest && stableSourceStringify(normalized) !== stableSourceStringify(normalizeConfirmedSource(expectedRequest.confirmedContent)))) {
    throw new ResumeSearchSourceError('The saved résumé source did not match the confirmed content. Your résumé is still here; retry confirmation.', { code: 'SOURCE_INTEGRITY_FAILED' });
  }
  if (!sameReceipt(confirmed, receipt)) {
    throw new ResumeSearchSourceError('The source receipt changed between save and readback. Your résumé is still here; retry confirmation.', { code: 'SOURCE_RECEIPT_MISMATCH' });
  }
  assertActive(ownerId, signal);
  return { source, receipt: confirmed };
}

function demoRecords(ownerId: string): Record<string, any>[] {
  const storage = demoStorage();
  const raw = storage.getItem(`${DEMO_STORAGE_PREFIX}:${encodeURIComponent(ownerId)}`);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('invalid demo source store');
    return value.filter(record => isSearchSourceRecord(record) && record.user_id === ownerId);
  } catch {
    throw new ResumeSearchSourceError('The local preview source list could not be verified.', { code: 'DEMO_SOURCE_STORE_INVALID' });
  }
}

async function confirmDemoSource(ownerId: string, request: ConfirmSearchSourceRequest, signal?: AbortSignal): Promise<ResumeSearchSourceResponse> {
  assertActive(ownerId, signal);
  if (!isDemoModeEnabled() || ownerId !== DEMO_USER_ID) {
    throw new ResumeSearchSourceError('Local preview sources are available only for the designated demo account.', { code: 'DEMO_SOURCE_OWNER_INVALID' });
  }
  const { captured } = await captureRequest(ownerId, request, signal);
  assertActive(ownerId, signal);
  const payloadHash = await sha256(stableSourceStringify(captured.request));
  assertActive(ownerId, signal);
  const id = `source_${await sha256(captured.request.requestId.toLowerCase())}`;
  assertActive(ownerId, signal);
  const records = demoRecords(ownerId);
  const prior = records.find(record => record.id === id);
  if (prior && prior.source_confirmation_receipt?.payloadHash !== payloadHash) {
    throw new ResumeSearchSourceError('This save request was already used for different résumé details. Confirm the current revision again.', { code: 'SOURCE_REQUEST_CONFLICT', status: 409 });
  }
  let source = prior;
  if (!source) {
    const confirmedAt = new Date().toISOString();
    const content = normalizeConfirmedSource(captured.request.confirmedContent);
    const contentHash = await sha256(stableSourceStringify(content));
    assertActive(ownerId, signal);
    const packetHash = await sha256(JSON.stringify(content));
    assertActive(ownerId, signal);
    const receipt: SearchSourceReceipt = {
      schemaVersion: 1, ownerId, sourceId: id, requestId: captured.request.requestId,
      contentHash, packetHash, payloadHash, confirmedAt,
      contentHashEncoding: 'sha256-stable-json-v1', hashEncoding: 'sha256-json-stringify-v1',
    };
    source = {
      id, user_id: ownerId, version_name: content.name || 'My résumé', content,
      source: 'user_confirmed_role_search', is_active: true,
      provenance: { verified: true, origin: captured.request.origin, recordedAt: confirmedAt },
      metadata: { workspace: { schemaVersion: 2, kind: 'source', purpose: 'role_search', origin: captured.request.origin,
        sourceVersionId: id, sourceHash: contentHash, contentHash, sourceConfirmedAt: confirmedAt } },
      source_confirmation_receipt: receipt,
      ...(captured.request.intake ? { intake: captured.request.intake } : {}),
      created_at: confirmedAt, updated_at: confirmedAt,
    };
    const storage = demoStorage();
    storage.setItem(`${DEMO_STORAGE_PREFIX}:${encodeURIComponent(ownerId)}`, JSON.stringify([...records, source]));
  }
  assertActive(ownerId, signal);
  const readback = demoRecords(ownerId).find(record => record.id === id);
  if (!readback) throw new ResumeSearchSourceError('The local preview could not read back its saved résumé. Retry without leaving this page.', { code: 'DEMO_SOURCE_READBACK_FAILED' });
  return validateResponse({ source: readback, receipt: readback.source_confirmation_receipt }, ownerId, id, captured.request.requestId, captured.request, signal);
}

export async function confirmResumeSearchSource(input: {
  ownerId: string;
  request: ConfirmSearchSourceRequest;
  signal?: AbortSignal;
}): Promise<ResumeSearchSourceResponse> {
  const { ownerId, request, signal } = input;
  assertActive(ownerId, signal);
  if (isDemoModeEnabled() && ownerId === DEMO_USER_ID) return confirmDemoSource(ownerId, request, signal);

  const { captured } = await captureRequest(ownerId, request, signal);
  assertActive(ownerId, signal);
  const posted = await requestJson('/api/resume/source', {
    method: 'POST', body: JSON.stringify(captured.request), signal,
  }, ownerId);
  const created = await validateResponse(posted, ownerId, posted?.source?.id, captured.request.requestId, captured.request, signal);
  assertActive(ownerId, signal);
  const readback = await readResumeSearchSource({ ownerId, id: created.source.id, signal });
  assertActive(ownerId, signal);
  if (!sameReceipt(created.receipt, readback.receipt)
    || stableSourceStringify(created.source.content) !== stableSourceStringify(readback.source.content)) {
    throw new ResumeSearchSourceError('The source changed between confirmation and readback. Your résumé is still here; retry confirmation.', { code: 'SOURCE_READBACK_MISMATCH' });
  }
  return readback;
}

export async function readResumeSearchSource(input: { ownerId: string; id: string; signal?: AbortSignal }): Promise<ResumeSearchSourceResponse> {
  const { ownerId, id, signal } = input;
  assertActive(ownerId, signal);
  if (isDemoModeEnabled() && ownerId === DEMO_USER_ID) {
    const source = demoRecords(ownerId).find(record => record.id === id);
    if (!source) throw new ResumeSearchSourceError('This local preview résumé source is unavailable.', { code: 'SOURCE_NOT_FOUND', status: 404 });
    assertActive(ownerId, signal);
    const receipt = source.source_confirmation_receipt as SearchSourceReceipt;
    return validateResponse({ source, receipt }, ownerId, id, receipt.requestId, undefined, signal);
  }
  const payload = await requestJson(`/api/resume/source?id=${encodeURIComponent(id)}`, { method: 'GET', signal }, ownerId);
  assertActive(ownerId, signal);
  if (typeof payload?.receipt?.requestId !== 'string') {
    throw new ResumeSearchSourceError('This résumé source did not pass its integrity check.', { code: 'SOURCE_INTEGRITY_FAILED' });
  }
  return validateResponse(payload, ownerId, id, payload.receipt.requestId, undefined, signal);
}

export async function listDemoSearchSources(ownerId: string, signal?: AbortSignal): Promise<Record<string, any>[]> {
  if (!isDemoModeEnabled() || ownerId !== DEMO_USER_ID) return [];
  assertActive(ownerId, signal);
  const records = demoRecords(ownerId);
  const verified: Record<string, any>[] = [];
  for (const source of records) {
    const receipt = source.source_confirmation_receipt as SearchSourceReceipt;
    const item = await validateResponse({ source, receipt }, ownerId, source.id, receipt.requestId, undefined, signal);
    assertActive(ownerId, signal);
    verified.push(item.source);
  }
  return verified;
}
