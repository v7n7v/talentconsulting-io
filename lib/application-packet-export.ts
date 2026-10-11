import { normalizeResume } from '@/lib/resume-normalizer';
import { canPersistPreparedResume, prepareResumeForExport } from '@/lib/resume-export-truth';

type ReviewPayload = {
  id?: string;
  user_id?: string;
  review_revision?: string;
  review_ready?: boolean;
  review_status?: string;
  review_source?: unknown;
  review_resume?: unknown;
  binding?: { artifact?: { resumeVersionId?: string | null } };
  review_binding?: { artifact?: { resumeVersionId?: string | null } };
};

export type ApplicationPacketExportInput = {
  ownerId: string;
  application: {
    id: string;
    source?: string | null;
    source_meta?: Record<string, unknown> | null;
    resume_version_id?: string | null;
  };
  linkedResume: { id: string; content: unknown };
  /** The revision actually displayed by ApplicationPacketReview for apply_pipeline. */
  displayedReviewRevision?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  isCurrent: () => boolean;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value ?? null;
}

export async function packetContentHash(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure packet verification is unavailable in this browser.');
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function assertCurrent(input: ApplicationPacketExportInput) {
  if (input.signal?.aborted || !input.isCurrent()) throw new DOMException('The selected application changed. Reopen it before exporting.', 'AbortError');
}

/** Load and verify a fresh approved packet before allowing an application-linked resume export. */
export async function loadApprovedApplicationPacketExport(input: ApplicationPacketExportInput) {
  const { application: app, linkedResume } = input;
  if (!input.ownerId || !app.id || !app.resume_version_id || app.resume_version_id !== linkedResume.id) {
    throw new Error('The linked resume changed. Reopen this application before exporting.');
  }
  const kind = app.source === 'agent_queue' ? 'queue' : app.source === 'apply_pipeline' ? 'application' : null;
  if (!kind) throw new Error('This export verification is only for prepared application packets.');
  const packetId = kind === 'queue' ? app.source_meta?.queue_id : app.id;
  const expectedRevision = kind === 'queue' ? app.source_meta?.review_revision : input.displayedReviewRevision;
  if (typeof packetId !== 'string' || !packetId || typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) {
    throw new Error('Review the current packet before exporting its linked resume.');
  }
  assertCurrent(input);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Packet review timed out.', 'TimeoutError')), input.timeoutMs ?? 15_000);
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason || new DOMException('Packet review was cancelled.', 'AbortError')), { once: true });
    });
    const query = kind === 'queue'
      ? `/api/agent/packet-review?kind=queue&id=${encodeURIComponent(packetId)}`
      : `/api/agent/packet-review?kind=application&id=${encodeURIComponent(packetId)}`;
    const response = await Promise.race([input.authFetch(query, { cache: 'no-store', signal: controller.signal }), aborted]);
    assertCurrent(input);
    const result = await Promise.race([response.json(), aborted]);
    assertCurrent(input);
    if (!response.ok || result?.success !== true || !Array.isArray(result.data) || result.data.length !== 1) {
      throw new Error(result?.error || 'The current packet could not be verified. Reload it and review again.');
    }
    const snapshot = result.data[0] as ReviewPayload;
    const binding = snapshot.review_binding || snapshot.binding;
    if (snapshot.id !== packetId || snapshot.user_id !== input.ownerId || snapshot.review_ready !== true
      || snapshot.review_status !== 'approved' || snapshot.review_revision !== expectedRevision
      || binding?.artifact?.resumeVersionId !== linkedResume.id) {
      throw new Error('This packet is no longer approved for the linked resume. Reload and review the current packet.');
    }
    if (!snapshot.review_source || !snapshot.review_resume) throw new Error('The approved packet is missing its source or prepared resume.');

    const [linkedHash, reviewedHash] = await Promise.all([
      packetContentHash(linkedResume.content),
      packetContentHash(snapshot.review_resume),
    ]);
    assertCurrent(input);
    if (linkedHash !== reviewedHash) throw new Error('The linked resume differs from the approved packet. Review the current draft before exporting.');

    const prepared = prepareResumeForExport({
      mode: 'morph',
      originalResume: snapshot.review_source,
      candidateResume: snapshot.review_resume,
    });
    if (!canPersistPreparedResume(prepared)) {
      throw new Error('The approved resume is missing required source evidence. Reopen review and prepare a new packet.');
    }
    const guardedHash = await packetContentHash(prepared.resume);
    const approvedNormalizedHash = await packetContentHash(normalizeResume(snapshot.review_resume));
    assertCurrent(input);
    if (guardedHash !== approvedNormalizedHash) {
      throw new Error('Truth checks changed the approved resume. Review and approve the corrected packet before exporting.');
    }
    return { resume: prepared.resume, reviewRevision: expectedRevision, packetId, kind };
  } catch (error) {
    if (controller.signal.aborted && !input.signal?.aborted) throw new Error('Packet review timed out. Try again after reloading the application.');
    throw error;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', abortFromCaller);
  }
}
