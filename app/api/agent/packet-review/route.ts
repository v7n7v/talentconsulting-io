import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { canPrepareApplicationPackets } from '@/lib/assistant/workload-policy';
import { getPacketSourceReference, inspectPacketReview, packetReviewView, PACKET_REVIEW_VERSION, type PacketKind, type PacketRecord } from '@/lib/job-packet-review';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const collectionFor = (kind: PacketKind) => kind === 'queue' ? 'agent_queue' : 'applications';
class ReviewError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

async function inspect(db: FirebaseFirestore.Firestore, uid: string, kind: PacketKind, id: string, packet: PacketRecord, transaction?: FirebaseFirestore.Transaction) {
  const user = db.collection('users').doc(uid);
  const read = (ref: FirebaseFirestore.DocumentReference) => transaction ? transaction.get(ref) : ref.get();
  const artifactSnapshot = validId(packet.resume_version_id) ? await read(user.collection('resume_versions').doc(packet.resume_version_id)) : null;
  const artifact = artifactSnapshot?.exists ? artifactSnapshot.data() || null : null;
  const reference = getPacketSourceReference(packet, artifact);
  const sourceSnapshot = reference ? await read(user.collection(reference.collection).doc(reference.id)) : null;
  const source = sourceSnapshot?.exists ? sourceSnapshot.data() || null : null;
  return inspectPacketReview({ kind, id, uid, packet, artifact, source });
}

export async function GET(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, { rateLimit: 120, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;
    const kind = request.nextUrl.searchParams.get('kind') === 'application' ? 'application' : 'queue';
    const id = request.nextUrl.searchParams.get('id');
    if ((id && !validId(id)) || (kind === 'application' && !id)) return NextResponse.json({ error: 'Choose a valid packet.' }, { status: 400 });
    const db = getAdminDb();
    const collection = db.collection('users').doc(guard.user.uid).collection(collectionFor(kind));
    const snapshots = id ? [await collection.doc(id).get()] : (await collection.get()).docs;
    const data = await Promise.all(snapshots.filter(snapshot => snapshot.exists).map(async snapshot => {
      const packet = snapshot.data() || {};
      const inspection = await inspect(db, guard.user.uid, kind, snapshot.id, packet);
      return { ...packetReviewView(kind, packet, inspection), id: snapshot.id };
    }));
    if (id && !data.length) return NextResponse.json({ error: 'Packet not found.' }, { status: 404 });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Packet review could not load. Try again.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, { rateLimit: 30, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;
    const body = await request.json();
    if (!body || typeof body !== 'object' || !['queue', 'application'].includes(body.kind)) return NextResponse.json({ error: 'Choose a valid packet.' }, { status: 400 });
    const { id, revision, action } = body;
    const kind: PacketKind = body.kind === 'application' ? 'application' : 'queue';
    if (!validId(id) || !['approve', 'dismiss', 'track'].includes(action) || (kind === 'application' && action !== 'approve')) return NextResponse.json({ error: 'Choose a valid packet action.' }, { status: 400 });
    if (action !== 'dismiss' && !canPrepareApplicationPackets(guard.user.tier)) return NextResponse.json({ error: 'Prepared packet review requires Max. Your saved work is still available.', code: 'packet_upgrade_required' }, { status: 403 });
    if (action !== 'dismiss' && (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision))) return NextResponse.json({ error: 'Reload the packet and review its current drafts.', code: 'review_revision_required' }, { status: 409 });
    const uid = guard.user.uid;
    const db = getAdminDb();
    const user = db.collection('users').doc(uid);
    const ref = user.collection(collectionFor(kind)).doc(id);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new ReviewError('packet_not_found', 'Packet not found.', 404);
      const packet = snapshot.data() || {};
      if (packet.user_id !== uid) throw new ReviewError('packet_not_found', 'Packet not found.', 404);
      const now = new Date().toISOString();
      if (action === 'dismiss') {
        if (!['pending', 'approved'].includes(packet.status)) throw new ReviewError('packet_not_pending', 'Only pending or approved packets can be dismissed.');
        transaction.set(ref, { status: 'dismissed', packetStatus: 'dismissed', human_review: null, reviewed_at: now, last_action_at: now }, { merge: true });
        return { success: true };
      }
      const inspection = await inspect(db, uid, kind, id, packet, transaction);
      if (revision !== inspection.revision) throw new ReviewError('review_stale', 'This packet changed. Reload it and review the current drafts.');
      if (!inspection.ready) throw new ReviewError('packet_not_ready', inspection.error || 'The packet is not ready for approval.');
      if (action === 'approve') {
        if (inspection.approved) return { success: true, idempotent: true, revision };
        const humanReview = { version: PACKET_REVIEW_VERSION, decision: 'approved', revision, reviewed_by: uid, reviewed_at: now, binding: inspection.binding };
        transaction.set(ref, {
          human_review: humanReview,
          ...(kind === 'queue' ? { status: 'approved', packetStatus: packet.application_id ? 'assist_apply' : 'approved', reviewed_at: now, last_action_at: now } : { last_updated: now }),
        }, { merge: true });
        return { success: true, revision };
      }
      if (!inspection.approved) throw new ReviewError('review_required', 'Approve the current packet before creating a tracker entry.');
      const applicationId = validId(packet.application_id) ? packet.application_id : `agent_queue_${id}`;
      const applicationRef = user.collection('applications').doc(applicationId);
      const application = await transaction.get(applicationRef);
      if (application.exists) {
        const existing = application.data() || {};
        if (existing.source !== 'agent_queue' || existing.source_meta?.queue_id !== id || existing.source_meta?.review_revision !== revision) throw new ReviewError('tracker_conflict', 'The linked tracker belongs to a different packet revision. Keep that history and review the current packet separately.');
      } else {
        transaction.set(applicationRef, {
          user_id: uid, company_name: packet.company, job_title: packet.job_title,
          job_description: packet.job_description || '', resume_version_id: packet.resume_version_id,
          morphed_resume_name: `${packet.company} — ${packet.job_title}`, talent_density_score: packet.match_score || 0,
          application_link: packet.job_url || '', status: 'not_applied', applied_at: null,
          morphed_at: packet.created_at || now, last_updated: now, created_at: now,
          source: 'agent_queue', source_meta: { queue_id: id, packet_status: 'approved', review_revision: revision },
          packet_status: 'tracker_draft', human_review: null,
        });
      }
      transaction.set(ref, { status: 'approved', packetStatus: 'assist_apply', assisted_at: packet.assisted_at || now, last_action_at: now, application_id: applicationId }, { merge: true });
      return { success: true, applicationId, idempotent: application.exists };
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'The packet action could not be read.' }, { status: 400 });
    return NextResponse.json({ error: 'The review could not be saved. Reload the packet before trying again.', code: 'review_unavailable' }, { status: 503 });
  }
}
