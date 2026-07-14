import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import {
  buildPricingMemoAcknowledgementDecision,
  comparePricingMemoAcknowledgementReplay,
  parsePricingMemoAcknowledgementInput,
} from '@/lib/sona/pricing-memo-acknowledgement';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const strict = await checkRateLimitStrict(`pricing-memo-ack:${admin.user!.uid}`, 6, 60_000);
  if (!strict.allowed) return NextResponse.json({ error: 'Review recording is temporarily unavailable.' }, { status: strict.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  const input = parsePricingMemoAcknowledgementInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'Invalid pricing memo review.' }, { status: 400, headers: PRIVATE_HEADERS });
  const db = getAdminDb();
  const log = db.collection('settings').doc('admin_log');
  const entries = log.collection('entries');
  const latestExportRef = log.collection('pricing_memo').doc('latest_export');
  const acknowledgementRef = entries.doc(`pricing_memo_ack_${input.evidenceFingerprint}`);
  const reviewer = admin.user!.email || admin.user!.uid;
  const result = await db.runTransaction(async transaction => {
    const latestSnapshot = await transaction.get(latestExportRef);
    const latest = latestSnapshot.exists ? latestSnapshot.data() || null : null;
    const exportAuditId = typeof latest?.exportAuditId === 'string' ? latest.exportAuditId : '';
    const exportSnapshot = exportAuditId ? await transaction.get(entries.doc(exportAuditId)) : null;
    const existingSnapshot = await transaction.get(acknowledgementRef);
    const existing = existingSnapshot.exists ? existingSnapshot.data() || null : null;
    const replay = comparePricingMemoAcknowledgementReplay(existing, input, reviewer);
    if (!replay.ok) return replay;
    if (replay.alreadyAcknowledged) return { ok: true as const, record: existing, replay: true };
    const decision = buildPricingMemoAcknowledgementDecision(exportSnapshot?.exists ? exportSnapshot.data() || null : null, latest, input, { reviewedBy: reviewer });
    if (!decision.ok) return decision;
    transaction.create(acknowledgementRef, decision.record);
    return { ok: true as const, record: decision.record, replay: false };
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers: PRIVATE_HEADERS });
  return NextResponse.json({ acknowledged: true, replay: result.replay, record: result.record }, { headers: PRIVATE_HEADERS });
}
