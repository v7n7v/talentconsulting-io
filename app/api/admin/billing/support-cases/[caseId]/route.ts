import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { writeBillingAuditLog } from '@/lib/billing-ledger';
import { validateStripeAccountReviewTransition } from '@/lib/billing/stripe-account-review-case';

const SAFE_CASE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function PATCH(req: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const { caseId } = await context.params;
  if (!SAFE_CASE_ID.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case.' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== 'object') {
    return NextResponse.json({ error: 'Invalid update.' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const db = getAdminDb();
  const caseRef = db.collection('admin_feedback').doc(caseId);
  const now = new Date().toISOString();
  const outcome = await db.runTransaction(async transaction => {
    const caseSnapshot = await transaction.get(caseRef);
    if (!caseSnapshot.exists) return { error: 'Case not found.', httpStatus: 404 } as const;
    const data = caseSnapshot.data()!;
    const transition = validateStripeAccountReviewTransition({
      currentStatus: data.status,
      nextStatus: input.nextStatus,
      note: input.note,
      accountHistoryReviewed: input.accountHistoryReviewed,
      checkoutSafetyReviewed: input.checkoutSafetyReviewed,
      confirmationText: input.confirmationText,
      checkoutAccountEvidence: data.checkoutAccountEvidence,
    });
    if (!transition.valid) return { error: transition.error, httpStatus: 409 } as const;
    const operator = admin.user!.email || admin.user!.uid;
    const historyEntry = { status: transition.nextStatus, note: transition.note, at: now, by: operator };
    const update = {
      status: transition.nextStatus,
      updatedAt: now,
      reviewedBy: operator,
      history: FieldValue.arrayUnion(historyEntry),
      ...(transition.nextStatus === 'resolved' ? { resolvedAt: now, resolutionNote: transition.note } : {}),
    };
    transaction.update(caseRef, update);
    if (typeof data.uid === 'string' && data.uid) {
      const receiptRef = db.collection('users').doc(data.uid).collection('billingSupport').doc('current');
      const receiptSnapshot = await transaction.get(receiptRef);
      if (receiptSnapshot.data()?.caseId === caseId) {
        transaction.set(receiptRef, {
          status: transition.nextStatus,
          updatedAt: now,
          ...(transition.nextStatus === 'resolved' ? { resolvedAt: now } : {}),
        }, { merge: true });
      }
    }
    return { status: transition.nextStatus, historyEntry } as const;
  });
  if ('error' in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.httpStatus, headers: PRIVATE_HEADERS });
  }
  await writeBillingAuditLog('stripe_account_review_transition', admin.user!.email || admin.user!.uid, {
    caseId,
    nextStatus: outcome.status,
  });
  return NextResponse.json({ caseId, status: outcome.status }, { headers: PRIVATE_HEADERS });
}
