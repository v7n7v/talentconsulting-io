import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { getFullSonaRenewalEvidenceExport } from '@/lib/sona/renewal-evidence-export';

export const maxDuration = 300;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const strict = await checkRateLimitStrict(`renewal-evidence-export:${admin.user!.uid}`, 2, 60_000);
  if (!strict.allowed) return NextResponse.json({ error: 'Export is temporarily unavailable.' }, { status: strict.unavailable ? 503 : 429, headers: PRIVATE_HEADERS });
  const db = getAdminDb();
  const evidence = await getFullSonaRenewalEvidenceExport(db);
  const auditRef = db.collection('settings').doc('admin_log').collection('entries').doc();
  const latestExportRef = db.collection('settings').doc('admin_log').collection('pricing_memo').doc('latest_export');
  await db.runTransaction(async transaction => {
    transaction.create(auditRef, {
      action: 'renewal_evidence_export', by: admin.user!.email || admin.user!.uid, at: new Date().toISOString(),
      changes: { generatedAt: evidence.generatedAt, evidenceFingerprint: evidence.evidenceFingerprint, combinedPricingMemoStatus: evidence.combinedPricingMemo.status, combinedPricingMemoOutcome: evidence.combinedPricingMemo.outcome, requiresHumanApproval: true, priceChangeAuthorized: false, totalPricingDecisionAuthorized: false, entitlementChangeAuthorized: false, noStripeMutation: true },
    });
    transaction.set(latestExportRef, { action: 'renewal_evidence_export_latest', exportAuditId: auditRef.id, evidenceFingerprint: evidence.evidenceFingerprint, generatedAt: evidence.generatedAt, latestGeneratedAt: evidence.generatedAt });
  });
  return NextResponse.json({ evidence, noStripeMutation: true }, { headers: PRIVATE_HEADERS });
}
