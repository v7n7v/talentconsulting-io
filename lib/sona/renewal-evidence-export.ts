import 'server-only';
import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import {
  SONA_ECONOMICS_ACCOUNTS_COLLECTION,
  SONA_ECONOMICS_COLLECTION,
  SONA_ECONOMICS_PAYMENTS_COLLECTION,
  summarizeSonaPaidCohortRetention,
  summarizeSonaPaidRenewalCohorts,
  summarizeSonaPlanObservedEconomics,
  type SonaEconomicsAccountSummary,
} from '@/lib/sona/economics';

type Firestore = FirebaseFirestore.Firestore;
type Query = FirebaseFirestore.Query;
type QueryDocumentSnapshot = FirebaseFirestore.QueryDocumentSnapshot;

export const SONA_RENEWAL_EVIDENCE_EXPORT_VERSION = 'sona-renewal-evidence-export-v1-2026-07-10';
export const SONA_RENEWAL_PRICING_REVIEW_PACKET_VERSION = 'sona-renewal-pricing-review-v1-2026-07-10';
export const SONA_COMBINED_PRICING_MEMO_VERSION = 'sona-combined-pricing-memo-v1-2026-07-10';
const DEFAULT_PAGE_SIZE = 500;
const COMBINED_MEMO_WINDOW_DAYS = 30;

type RenewalReconciliation = ReturnType<typeof summarizeSonaPaidRenewalCohorts>;

export function buildSonaRenewalPricingReviewPacket(input: {
  fullPopulation: boolean;
  snapshotConsistent: boolean;
  evidenceFingerprint: string;
  reconciliation: RenewalReconciliation;
}) {
  const { reconciliation } = input;
  const integrityBlockers = new Set<string>();
  if (!input.fullPopulation) integrityBlockers.add('full_population_required');
  if (!input.snapshotConsistent) integrityBlockers.add('consistent_snapshot_required');
  if (reconciliation.sampleCapped) integrityBlockers.add('sample_cap');
  if (reconciliation.coverageWithheldReason) {
    integrityBlockers.add(reconciliation.coverageWithheldReason);
  }
  if (!reconciliation.evidenceComplete) integrityBlockers.add('evidence_incomplete');
  reconciliation.blockers.forEach(blocker => integrityBlockers.add(blocker.code));

  const accountRows = reconciliation.accountEvidenceRows;
  const population = reconciliation.populationAccountsObserved;
  if (!Array.isArray(accountRows) || population == null) {
    integrityBlockers.add('account_manifest_required');
  } else {
    if (accountRows.length !== population) integrityBlockers.add('account_manifest_mismatch');
    if (accountRows.some(row => row.status !== 'reconciled' || row.blockerCodes.length > 0)) {
      integrityBlockers.add('account_backlog');
    }
    if (
      population > 0
      && (
        reconciliation.reconciledAccountsObserved !== population
        || reconciliation.evidenceCoveragePercent !== 100
      )
    ) {
      integrityBlockers.add('coverage_below_100');
    }
  }

  const segments = reconciliation.segments.map(segment => ({
    plan: segment.plan,
    planLabel: segment.planLabel,
    interval: segment.interval,
    intervalLabel: segment.intervalLabel,
    matureAccounts: segment.eligibleAccounts,
    renewedAccounts: segment.renewedAccounts,
    renewalRatePercent: segment.renewalRatePercent,
    minimumMatureAccounts: reconciliation.minMatureAccountsPerSegment,
    targetRenewalRatePercent: reconciliation.targetRenewalRatePercent,
    meetsMinimum: segment.eligibleAccounts >= reconciliation.minMatureAccountsPerSegment,
    meetsTarget: segment.renewalRatePercent >= reconciliation.targetRenewalRatePercent,
  }));
  const collectingSegments = segments
    .filter(segment => !segment.meetsMinimum)
    .map(segment => `${segment.plan}_${segment.interval}`);
  const blockers = [...integrityBlockers].sort();
  const status = blockers.length > 0
    ? 'blocked' as const
    : collectingSegments.length > 0
      ? 'collecting' as const
      : 'ready' as const;
  const outcome = status === 'ready'
    ? segments.every(segment => segment.meetsTarget) ? 'pass' as const : 'watch' as const
    : null;
  const reason = status === 'blocked'
    ? 'Resolve renewal evidence integrity blockers and generate a new snapshot before human pricing review.'
    : status === 'collecting'
      ? `Collect the minimum mature cohort for ${collectingSegments.length} segment${collectingSegments.length === 1 ? '' : 's'}.`
      : outcome === 'pass'
        ? 'All mature renewal segments meet the directional review threshold.'
        : 'The evidence is ready for human review, but at least one mature segment is below the directional threshold.';

  return {
    version: SONA_RENEWAL_PRICING_REVIEW_PACKET_VERSION,
    scope: 'Renewal evidence only; combine with margin, pricing and product evidence in a separate human decision.',
    generatedAt: reconciliation.generatedAt,
    evidenceFingerprint: input.evidenceFingerprint,
    status,
    outcome,
    readyForHumanReview: status === 'ready',
    requiresHumanApproval: true,
    priceChangeAuthorized: false,
    totalPricingDecisionAuthorized: false,
    blockers,
    collectingSegments,
    segments,
    reason,
    noAutomaticPricingChange: true,
  };
}

export function buildSonaCombinedPricingMemo(input: {
  evidenceFingerprint: string;
  renewalPacket: ReturnType<typeof buildSonaRenewalPricingReviewPacket>;
  observedMargin: ReturnType<typeof summarizeSonaPlanObservedEconomics>;
  usefulReturn: ReturnType<typeof summarizeSonaPaidCohortRetention>;
}) {
  const renewalPacketInvalid = input.renewalPacket.evidenceFingerprint !== input.evidenceFingerprint
    || input.renewalPacket.readyForHumanReview !== (input.renewalPacket.status === 'ready')
    || (
      input.renewalPacket.status === 'ready'
      && input.renewalPacket.outcome !== 'pass'
      && input.renewalPacket.outcome !== 'watch'
    );
  const blockers = [
    ...(renewalPacketInvalid ? ['renewal_packet_invalid'] : []),
    ...(input.renewalPacket.status === 'blocked' ? ['renewal_evidence'] : []),
    ...(
      input.observedMargin.status === 'blocked'
      || !input.observedMargin.evidenceComplete
      || input.observedMargin.sampleCapped
        ? ['margin_evidence']
        : []
    ),
    ...(
      input.usefulReturn.status === 'blocked'
      || !input.usefulReturn.evidenceComplete
      || input.usefulReturn.sampleCapped
        ? ['useful_return_evidence']
        : []
    ),
  ];
  const collectingSignals = [
    ...(input.renewalPacket.status === 'collecting' ? ['renewal_cohort'] : []),
    ...(input.observedMargin.status === 'collecting' ? ['margin_cohort'] : []),
    ...(input.usefulReturn.status === 'collecting' ? ['useful_return_cohort'] : []),
  ];
  const status = blockers.length > 0
    ? 'blocked' as const
    : collectingSignals.length > 0
      ? 'collecting' as const
      : 'ready' as const;
  const outcome = status === 'ready'
    ? (
      input.renewalPacket.outcome === 'watch'
      || input.observedMargin.status === 'watch'
      || input.usefulReturn.status === 'watch'
    ) ? 'watch' as const : 'pass' as const
    : null;
  const reason = status === 'blocked'
    ? 'Resolve incomplete renewal, margin or useful-return evidence before human pricing review.'
    : status === 'collecting'
      ? `Collect the minimum evidence for ${collectingSignals.length} signal${collectingSignals.length === 1 ? '' : 's'}.`
      : outcome === 'pass'
        ? 'Renewal, observed provider-cost margin and useful-return evidence meet their directional review thresholds.'
        : 'The combined evidence is ready for human review, but at least one signal is below its directional threshold.';

  return {
    version: SONA_COMBINED_PRICING_MEMO_VERSION,
    scope: 'Snapshot-bound paid renewal, observed provider-cost cash margin and useful Sona return; not recognized revenue, total gross margin or pricing authorization.',
    windowDays: COMBINED_MEMO_WINDOW_DAYS,
    generatedAt: input.renewalPacket.generatedAt,
    evidenceFingerprint: input.evidenceFingerprint,
    status,
    outcome,
    readyForHumanReview: status === 'ready',
    requiresHumanApproval: true,
    priceChangeAuthorized: false,
    entitlementChangeAuthorized: false,
    blockers,
    collectingSignals,
    signals: {
      renewal: {
        status: input.renewalPacket.status,
        outcome: input.renewalPacket.outcome,
        reason: input.renewalPacket.reason,
      },
      observedMargin: {
        status: input.observedMargin.status,
        reason: input.observedMargin.plans.map(plan => `${plan.plan}:${plan.reason}`).join(' | '),
      },
      usefulReturn: {
        status: input.usefulReturn.status,
        reason: input.usefulReturn.plans.map(plan => `${plan.plan}:${plan.reason}`).join(' | '),
      },
    },
    reason,
    noAutomaticPricingChange: true,
  };
}

async function collectAllQueryDocuments(
  query: Query,
  pageSize: number,
  getPage: (pageQuery: Query) => Promise<FirebaseFirestore.QuerySnapshot>,
  addDocumentOrder = true,
) {
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | null = null;

  while (true) {
    let pageQuery = (addDocumentOrder ? query.orderBy(FieldPath.documentId()) : query).limit(pageSize);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await getPage(pageQuery);
    documents.push(...page.docs);
    if (page.docs.length < pageSize) break;
    const nextCursor = page.docs[page.docs.length - 1];
    if (!nextCursor || nextCursor.id === cursor?.id) {
      throw new Error('Renewal evidence pagination did not advance.');
    }
    cursor = nextCursor;
  }

  return documents;
}

export async function getFullSonaRenewalEvidenceExport(
  db: Firestore,
  options: { now?: string; pageSize?: number } = {},
) {
  const pageSize = Math.max(100, Math.min(1_000, Math.round(options.pageSize || DEFAULT_PAGE_SIZE)));
  const snapshotStartedAt = new Date().toISOString();
  const reportNow = options.now || snapshotStartedAt;
  const reportNowMs = Date.parse(reportNow);
  const recentEventStart = new Date(
    reportNowMs - (COMBINED_MEMO_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  ).toISOString();
  const [paymentDocuments, invoiceDocuments, accountDocuments, recentEventDocuments] = await db.runTransaction(
    async transaction => {
      const getPage = (query: Query) => transaction.get(query);
      const payments = await collectAllQueryDocuments(
        db.collection(SONA_ECONOMICS_PAYMENTS_COLLECTION),
        pageSize,
        getPage,
      );
      const invoices = await collectAllQueryDocuments(
        db.collection(SONA_ECONOMICS_COLLECTION).where('eventType', '==', 'invoice_paid'),
        pageSize,
        getPage,
      );
      const accounts = await collectAllQueryDocuments(
        db.collection(SONA_ECONOMICS_ACCOUNTS_COLLECTION),
        pageSize,
        getPage,
      );
      const recentEvents = await collectAllQueryDocuments(
        db.collection(SONA_ECONOMICS_COLLECTION)
          .where('occurredAt', '>=', recentEventStart)
          .orderBy('occurredAt', 'asc')
          .orderBy(FieldPath.documentId()),
        pageSize,
        getPage,
        false,
      );
      return [payments, invoices, accounts, recentEvents];
    },
    { readOnly: true },
  );
  const paymentRecords = paymentDocuments.map(document => ({
    ...document.data(),
    paymentReferenceId: document.id,
  }));
  const invoiceRecords = invoiceDocuments.map(document => document.data());
  const accountSummaries = accountDocuments.map(document => ({
    ...document.data(),
    uid: typeof document.data().uid === 'string' && document.data().uid
      ? document.data().uid
      : document.id,
  } as SonaEconomicsAccountSummary));
  const paidAccountSummaries = accountSummaries.filter(account => (
    Number(account.paidInvoiceCount || 0) > 0
    || account.paidAfterUsefulOutcome === true
    || (typeof account.firstPaidAt === 'string' && account.firstPaidAt.length > 0)
    || (typeof account.latestPaidAt === 'string' && account.latestPaidAt.length > 0)
    || account.firstPaidPlan === 'pro'
    || account.firstPaidPlan === 'studio'
    || account.firstPaidPlan === 'god'
    || Number(account.grossCashAfterUsefulCents || 0) > 0
  ));
  const recentEvents = recentEventDocuments
    .map(document => document.data() as Parameters<typeof summarizeSonaPlanObservedEconomics>[0][number])
    .filter(event => {
      const occurredAt = Date.parse(event.occurredAt);
      return Number.isFinite(occurredAt) && occurredAt <= reportNowMs;
    });
  const reconciliation = summarizeSonaPaidRenewalCohorts(accountSummaries, {
    now: reportNow,
    paymentRecords,
    invoiceRecords,
    includeAccountEvidenceRows: true,
  });
  const observedMargin = summarizeSonaPlanObservedEconomics(recentEvents, { sampleCapped: false });
  const usefulReturn = summarizeSonaPaidCohortRetention(recentEvents, paidAccountSummaries, {
    now: reportNow,
    cohortWindowDays: COMBINED_MEMO_WINDOW_DAYS,
    sampleCapped: false,
  });
  const sourceCounts = {
    paymentRecords: paymentRecords.length,
    invoiceEvents: invoiceRecords.length,
    accountSummaries: accountSummaries.length,
    paidAccountSummaries: paidAccountSummaries.length,
    recentEconomicsEvents: recentEvents.length,
  };
  const evidenceFingerprint = createHash('sha256').update(JSON.stringify({
    exportVersion: SONA_RENEWAL_EVIDENCE_EXPORT_VERSION,
    snapshotStartedAt,
    sourceCounts,
    reconciliationVersion: reconciliation.version,
    generatedAt: reconciliation.generatedAt,
    reconciliation,
    observedMargin,
    usefulReturn,
  })).digest('hex');
  const reviewPacket = buildSonaRenewalPricingReviewPacket({
    fullPopulation: true,
    snapshotConsistent: true,
    evidenceFingerprint,
    reconciliation,
  });
  const combinedPricingMemo = buildSonaCombinedPricingMemo({
    evidenceFingerprint,
    renewalPacket: reviewPacket,
    observedMargin,
    usefulReturn,
  });

  return {
    version: SONA_RENEWAL_EVIDENCE_EXPORT_VERSION,
    generatedAt: reconciliation.generatedAt,
    scope: 'Full server-owned renewal evidence reconciliation for human review; not recognized revenue or an automatic pricing decision.',
    fullPopulation: true,
    snapshotConsistent: true,
    snapshotStartedAt,
    pageSize,
    sourceCounts,
    evidenceFingerprint,
    reconciliation,
    reviewPacket,
    observedMargin,
    usefulReturn,
    combinedPricingMemo,
    noStripeRead: true,
    noStripeMutation: true,
    noAutomaticPricingChange: true,
  };
}
