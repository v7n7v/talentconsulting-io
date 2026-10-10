import { createHash } from 'node:crypto';
import { normalizeVerifiedResumeProvenance } from '@/lib/resume-provenance';
import { isPersistedJobPacketReady } from '@/lib/job-packet-state';

export type PacketKind = 'queue' | 'application';
export type PacketSourceCollection = 'resume_versions' | 'vault' | 'profile';
export type PacketRecord = Record<string, any>;
export const PACKET_REVIEW_VERSION = 1;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value ?? null;
}

export function packetContentHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function packetJobDescriptionHash(value: unknown) {
  return packetContentHash(typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '');
}

export function getPacketSourceReference(packet: PacketRecord, artifact?: PacketRecord | null) {
  const id = packet.morph_source_resume_id || packet.source_resume_id || artifact?.source_resume_id;
  const collection = packet.morph_source_resume_type || packet.source_resume_type || artifact?.source_resume_type || 'resume_versions';
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id) || !['resume_versions', 'vault', 'profile'].includes(collection)) return null;
  return { id, collection: collection as PacketSourceCollection };
}

export function getPacketSourceContent(data: PacketRecord, collection: PacketSourceCollection) {
  if (data.guardrail_report || data.morph_guardrail_report || data.morph_effective_percentage) return null;
  const provenance = data.provenance || data.resume_provenance;
  const verified = normalizeVerifiedResumeProvenance(provenance, String(provenance?.recordedAt || data.updated_at || data.created_at || ''));
  if (!verified && !(collection === 'resume_versions' && data.is_active === true)) return null;
  if (collection === 'profile') {
    return data.base_resume_parsed || (data.base_resume_text ? {
      name: data.full_name || '', summary: String(data.base_resume_text).slice(0, 500), rawText: data.base_resume_text,
      skills: [], experience: [], education: [],
    } : null);
  }
  return collection === 'vault' ? data.resume || data.parsed || data.content || null : data.content || data.resume || data.parsed || null;
}

/** Derived on every server read/decision; legacy status strings are not proof of review. */
export function inspectPacketReview(input: {
  kind: PacketKind;
  id: string;
  uid: string;
  packet: PacketRecord;
  artifact: PacketRecord | null;
  source: PacketRecord | null;
  now?: number;
}) {
  const { kind, id, uid, packet, artifact, source } = input;
  const reference = getPacketSourceReference(packet, artifact);
  const content = reference && source ? getPacketSourceContent(source, reference.collection) : null;
  // Existing generation code hashes JSON source snapshots; retain that contract.
  const sourceHash = content ? createHash('sha256').update(JSON.stringify(content)).digest('hex') : null;
  const expectedSourceHash = packet.morph_source_resume_hash || packet.source_resume_hash || artifact?.source_resume_hash;
  const candidate = kind === 'queue' ? {
    ...packet,
    company_name: packet.company,
    packet_status: 'ready_for_review',
    morph_succeeded: Boolean(packet.morph_guardrail_report),
    morph_source_resume_id: reference?.id,
    morph_source_resume_hash: expectedSourceHash,
    cover_letter_source_resume_id: packet.cover_letter_source_resume_id,
    cover_letter_source_resume_hash: packet.cover_letter_source_resume_hash,
  } : packet;
  let error: string | null = null;
  if (packet.user_id !== uid) error = 'This packet does not belong to the signed-in account.';
  else if (!reference || !content || !expectedSourceHash || sourceHash !== expectedSourceHash) error = 'The source resume is missing or has changed. Prepare a new packet from the source you want to use.';
  else if (packet.packet_generation_state === 'running') error = 'This packet is still being prepared. Wait for preparation to finish.';
  else if (kind === 'queue' && packet.expires_at && new Date(packet.expires_at).getTime() <= (input.now ?? Date.now())) error = 'This packet has expired. Prepare a fresh packet before review.';
  else if (kind === 'queue' && ['dismissed', 'expired'].includes(packet.status)) error = 'This packet is no longer awaiting review.';
  else if (!isPersistedJobPacketReady(candidate, artifact, { requireATS: kind !== 'queue' })) error = 'This packet needs fresh, source-checked resume and cover-letter drafts before approval.';
  else if (kind === 'queue' && packetContentHash(packet.morphed_resume) !== packetContentHash(artifact?.content)) error = 'The packet and saved resume draft no longer match. Prepare the packet again.';

  const binding = {
    version: PACKET_REVIEW_VERSION,
    kind, id, uid,
    source: reference ? { ...reference, hash: sourceHash } : null,
    job: { title: packet.job_title, company: packet.company_name || packet.company, url: packet.application_link || packet.job_url || '', descriptionHash: packetJobDescriptionHash(packet.job_description) },
    artifact: { resumeVersionId: packet.resume_version_id || null, resumeHash: packetContentHash(artifact?.content), coverLetterHash: packetContentHash(packet.cover_letter), proofHash: packetContentHash({ resume: packet.morph_guardrail_report, coverLetter: packet.cover_letter_guardrail_report, ats: packet.ats_score, keywordGaps: packet.keyword_gaps }) },
    generation: packet.packet_revision || packet.morphed_at || packet.created_at || null,
  };
  const revision = packetContentHash(binding);
  const receipt = packet.human_review;
  const approved = !error && receipt?.version === PACKET_REVIEW_VERSION && receipt?.decision === 'approved'
    && receipt?.revision === revision && receipt?.reviewed_by === uid
    && typeof receipt?.reviewed_at === 'string';
  const stale = Boolean(receipt?.decision === 'approved' && !approved);
  return {
    revision, binding, ready: !error, approved, sourceContent: content, resumeContent: artifact?.content || null,
    status: approved ? 'approved' as const : stale ? 'stale' as const : error ? 'blocked' as const : 'needs_review' as const,
    error: error || (stale ? 'This packet changed after approval. Review the current drafts again.' : null),
  };
}

export function packetReviewView(kind: PacketKind, packet: PacketRecord, inspection: ReturnType<typeof inspectPacketReview>) {
  const legacyApproval = kind === 'queue' && ['approved', 'applied'].includes(packet.status) && !inspection.approved;
  return {
    ...packet,
    // Application status describes a real-world outcome and is never rewritten here.
    ...(legacyApproval ? { status: 'pending', packetStatus: 'needs_review' } : {}),
    review_revision: inspection.revision,
    review_binding: inspection.binding,
    review_source: inspection.sourceContent,
    review_resume: inspection.resumeContent,
    review_ready: inspection.ready,
    review_status: inspection.status,
    review_error: inspection.error,
  };
}
