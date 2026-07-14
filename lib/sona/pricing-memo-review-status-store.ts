import { buildPricingMemoReviewStatus } from '@/lib/sona/pricing-memo-acknowledgement';

interface PricingMemoReviewStatusDb {
  collection(name: string): any;
  runTransaction<T>(callback: (transaction: { get(ref: any): Promise<any> }) => Promise<T>): Promise<T>;
}

export async function loadLatestPricingMemoReviewStatus(
  db: PricingMemoReviewStatusDb,
  options: { now?: string } = {},
) {
  const adminLog = db.collection('settings').doc('admin_log');
  const auditCollection = adminLog.collection('entries');
  const latestExportRef = adminLog.collection('pricing_memo').doc('latest_export');
  return db.runTransaction(async transaction => {
    const latestExportSnapshot = await transaction.get(latestExportRef);
    if (!latestExportSnapshot.exists) {
      return buildPricingMemoReviewStatus(null, null, null, options);
    }
    const latestExport = latestExportSnapshot.data() || null;
    const exportAuditId = typeof latestExport?.exportAuditId === 'string' ? latestExport.exportAuditId : '';
    const evidenceFingerprint = typeof latestExport?.evidenceFingerprint === 'string'
      ? latestExport.evidenceFingerprint.toLowerCase()
      : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(exportAuditId) || !/^[a-f0-9]{64}$/.test(evidenceFingerprint)) {
      return buildPricingMemoReviewStatus(latestExport, null, null, options);
    }
    const [exportAuditSnapshot, acknowledgementSnapshot] = await Promise.all([
      transaction.get(auditCollection.doc(exportAuditId)),
      transaction.get(auditCollection.doc(`pricing_memo_ack_${evidenceFingerprint}`)),
    ]);
    return buildPricingMemoReviewStatus(
      latestExport,
      exportAuditSnapshot.exists ? exportAuditSnapshot.data() || null : null,
      acknowledgementSnapshot.exists ? acknowledgementSnapshot.data() || null : null,
      options,
    );
  });
}
