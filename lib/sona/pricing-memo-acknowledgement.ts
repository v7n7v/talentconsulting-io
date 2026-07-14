export const PRICING_MEMO_ACKNOWLEDGEMENT_VERSION = 'pricing-memo-acknowledgement-v1-2026-07-10';
export const PRICING_MEMO_ACKNOWLEDGEMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PricingMemoAcknowledgementInput {
  evidenceFingerprint: string;
  expectedStatus: 'blocked' | 'collecting' | 'ready';
  expectedOutcome: 'pass' | 'watch' | null;
  rationale: string;
  confirmationText: string;
  acknowledgedNoStripeMutation: boolean;
  acknowledgedNoPriceChange: boolean;
  acknowledgedNoEntitlementChange: boolean;
}

export function pricingMemoAcknowledgementPhrase(fingerprint: string) {
  return `ACKNOWLEDGE ${fingerprint.slice(0, 8).toUpperCase()}`;
}

export function parsePricingMemoAcknowledgementInput(body: unknown): PricingMemoAcknowledgementInput | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const evidenceFingerprint = typeof value.evidenceFingerprint === 'string'
    ? value.evidenceFingerprint.trim().toLowerCase()
    : '';
  const expectedStatus = value.expectedStatus;
  const expectedOutcome = value.expectedOutcome == null ? null : value.expectedOutcome;
  const rationale = typeof value.rationale === 'string' ? value.rationale.trim() : '';
  const confirmationText = typeof value.confirmationText === 'string' ? value.confirmationText.trim() : '';
  if (
    !/^[a-f0-9]{64}$/.test(evidenceFingerprint)
    || !['blocked', 'collecting', 'ready'].includes(String(expectedStatus))
    || (expectedOutcome !== null && !['pass', 'watch'].includes(String(expectedOutcome)))
    || (expectedStatus === 'ready' && expectedOutcome === null)
    || (expectedStatus !== 'ready' && expectedOutcome !== null)
    || rationale.length < 20
    || rationale.length > 1_000
  ) return null;

  return {
    evidenceFingerprint,
    expectedStatus: expectedStatus as PricingMemoAcknowledgementInput['expectedStatus'],
    expectedOutcome: expectedOutcome as PricingMemoAcknowledgementInput['expectedOutcome'],
    rationale,
    confirmationText,
    acknowledgedNoStripeMutation: value.acknowledgedNoStripeMutation === true,
    acknowledgedNoPriceChange: value.acknowledgedNoPriceChange === true,
    acknowledgedNoEntitlementChange: value.acknowledgedNoEntitlementChange === true,
  };
}

export function buildPricingMemoAcknowledgementDecision(
  exportAudit: Record<string, unknown> | null,
  latestExport: Record<string, unknown> | null,
  input: PricingMemoAcknowledgementInput,
  options: { now?: string; reviewedBy: string } ,
) {
  if (!exportAudit || exportAudit.action !== 'renewal_evidence_export') {
    return { ok: false as const, code: 'EXPORT_NOT_FOUND', status: 404, error: 'Generate a new pricing evidence export before recording a review.' };
  }
  const changes = exportAudit.changes && typeof exportAudit.changes === 'object'
    ? exportAudit.changes as Record<string, unknown>
    : {};
  if (
    !latestExport
    || latestExport.action !== 'renewal_evidence_export_latest'
    || latestExport.evidenceFingerprint !== input.evidenceFingerprint
  ) {
    return { ok: false as const, code: 'EXPORT_SUPERSEDED', status: 409, error: 'A newer pricing evidence export exists. Review and acknowledge the latest snapshot.' };
  }
  if (
    changes.evidenceFingerprint !== input.evidenceFingerprint
    || changes.combinedPricingMemoStatus !== input.expectedStatus
    || (changes.combinedPricingMemoOutcome ?? null) !== input.expectedOutcome
  ) {
    return { ok: false as const, code: 'MEMO_MISMATCH', status: 409, error: 'The reviewed memo does not match the server audit record.' };
  }
  if (
    changes.requiresHumanApproval !== true
    || changes.priceChangeAuthorized !== false
    || changes.entitlementChangeAuthorized !== false
    || changes.noStripeMutation !== true
  ) {
    return { ok: false as const, code: 'SAFEGUARD_MISSING', status: 409, error: 'The export does not contain the required no-change safeguards. Generate a new export.' };
  }
  const now = options.now || new Date().toISOString();
  const nowMs = Date.parse(now);
  const exportAt = typeof exportAudit.at === 'string' ? Date.parse(exportAudit.at) : Number.NaN;
  if (
    !Number.isFinite(nowMs)
    || !Number.isFinite(exportAt)
    || exportAt > nowMs
    || nowMs - exportAt > PRICING_MEMO_ACKNOWLEDGEMENT_MAX_AGE_MS
  ) {
    return { ok: false as const, code: 'EXPORT_STALE', status: 409, error: 'The pricing evidence export is stale. Generate and review a new snapshot.' };
  }
  if (
    !input.acknowledgedNoStripeMutation
    || !input.acknowledgedNoPriceChange
    || !input.acknowledgedNoEntitlementChange
    || input.confirmationText !== pricingMemoAcknowledgementPhrase(input.evidenceFingerprint)
  ) {
    return { ok: false as const, code: 'ATTESTATION_REQUIRED', status: 400, error: 'Complete every no-change acknowledgement and type the record-specific phrase.' };
  }

  return {
    ok: true as const,
    record: {
      action: 'pricing_memo_acknowledged',
      by: options.reviewedBy,
      at: now,
      changes: {
        acknowledgementVersion: PRICING_MEMO_ACKNOWLEDGEMENT_VERSION,
        evidenceFingerprint: input.evidenceFingerprint,
        memoStatus: input.expectedStatus,
        memoOutcome: input.expectedOutcome,
        decision: 'no_change',
        rationale: input.rationale,
        sourceExportAt: new Date(exportAt).toISOString(),
        requiresHumanApproval: true,
        priceChangeAuthorized: false,
        entitlementChangeAuthorized: false,
        noStripeMutation: true,
      },
    },
  };
}

export function comparePricingMemoAcknowledgementReplay(
  existingRecord: Record<string, unknown> | null,
  input: PricingMemoAcknowledgementInput,
  reviewedBy: string,
) {
  if (!existingRecord) return { ok: true as const, alreadyAcknowledged: false as const };
  const existingChanges = existingRecord.changes && typeof existingRecord.changes === 'object'
    ? existingRecord.changes as Record<string, unknown>
    : {};
  if (
    !input.acknowledgedNoStripeMutation
    || !input.acknowledgedNoPriceChange
    || !input.acknowledgedNoEntitlementChange
    || input.confirmationText !== pricingMemoAcknowledgementPhrase(input.evidenceFingerprint)
  ) {
    return { ok: false as const, code: 'ATTESTATION_REQUIRED', status: 400, error: 'Complete every no-change acknowledgement and type the record-specific phrase.' };
  }
  if (
    existingRecord.action !== 'pricing_memo_acknowledged'
    || existingRecord.by !== reviewedBy
    || existingChanges.evidenceFingerprint !== input.evidenceFingerprint
    || existingChanges.memoStatus !== input.expectedStatus
    || (existingChanges.memoOutcome ?? null) !== input.expectedOutcome
    || existingChanges.decision !== 'no_change'
    || existingChanges.rationale !== input.rationale
    || existingChanges.priceChangeAuthorized !== false
    || existingChanges.entitlementChangeAuthorized !== false
    || existingChanges.noStripeMutation !== true
  ) {
    return {
      ok: false as const,
      code: 'ACKNOWLEDGEMENT_CONFLICT',
      status: 409,
      error: 'This pricing memo already has a different acknowledgement. Review the canonical audit record.',
    };
  }
  return { ok: true as const, alreadyAcknowledged: true as const };
}

export function buildPricingMemoReviewStatus(
  latestExport: Record<string, unknown> | null,
  exportAudit: Record<string, unknown> | null,
  acknowledgement: Record<string, unknown> | null,
  options: { now?: string } = {},
) {
  if (!latestExport) {
    return {
      ok: true as const,
      reviewStatus: {
        available: false as const,
        memo: null,
        acknowledgement: null,
        canAcknowledge: false,
        requiresNewExport: true,
      },
    };
  }
  const evidenceFingerprint = typeof latestExport.evidenceFingerprint === 'string'
    ? latestExport.evidenceFingerprint.toLowerCase()
    : '';
  const exportAuditId = typeof latestExport.exportAuditId === 'string' ? latestExport.exportAuditId : '';
  if (
    latestExport.action !== 'renewal_evidence_export_latest'
    || !/^[a-f0-9]{64}$/.test(evidenceFingerprint)
    || !/^[A-Za-z0-9_-]{1,128}$/.test(exportAuditId)
  ) {
    return { ok: false as const, code: 'LATEST_EXPORT_INVALID', status: 409, error: 'The latest pricing evidence pointer is invalid. Generate a new export.' };
  }
  if (!exportAudit || exportAudit.action !== 'renewal_evidence_export') {
    return { ok: false as const, code: 'EXPORT_NOT_FOUND', status: 409, error: 'The latest pricing evidence audit record is unavailable. Generate a new export.' };
  }
  const changes = exportAudit.changes && typeof exportAudit.changes === 'object'
    ? exportAudit.changes as Record<string, unknown>
    : {};
  const memoStatus = changes.combinedPricingMemoStatus;
  const memoOutcome = changes.combinedPricingMemoOutcome ?? null;
  const now = options.now || new Date().toISOString();
  const nowMs = Date.parse(now);
  const exportAt = typeof exportAudit.at === 'string' ? exportAudit.at : '';
  const exportAtMs = Date.parse(exportAt);
  const auditGeneratedAt = typeof changes.generatedAt === 'string' ? changes.generatedAt : '';
  const latestGeneratedAt = typeof latestExport.generatedAt === 'string' ? latestExport.generatedAt : '';
  if (
    changes.evidenceFingerprint !== evidenceFingerprint
    || !Number.isFinite(nowMs)
    || !Number.isFinite(exportAtMs)
    || !Number.isFinite(Date.parse(auditGeneratedAt))
    || auditGeneratedAt !== latestGeneratedAt
    || !['blocked', 'collecting', 'ready'].includes(String(memoStatus))
    || (memoStatus === 'ready' && !['pass', 'watch'].includes(String(memoOutcome)))
    || (memoStatus !== 'ready' && memoOutcome !== null)
    || changes.requiresHumanApproval !== true
    || changes.priceChangeAuthorized !== false
    || changes.entitlementChangeAuthorized !== false
    || changes.noStripeMutation !== true
  ) {
    return { ok: false as const, code: 'EXPORT_AUDIT_INVALID', status: 409, error: 'The latest pricing evidence audit record failed its no-change checks. Generate a new export.' };
  }
  const fresh = Number.isFinite(nowMs)
    && Number.isFinite(exportAtMs)
    && exportAtMs <= nowMs
    && nowMs - exportAtMs <= PRICING_MEMO_ACKNOWLEDGEMENT_MAX_AGE_MS;
  let canonicalAcknowledgement: null | {
    evidenceFingerprint: string;
    reviewedBy: string;
    acknowledgedAt: string;
    rationale: string;
    decision: 'no_change';
  } = null;
  if (acknowledgement) {
    const acknowledgementChanges = acknowledgement.changes && typeof acknowledgement.changes === 'object'
      ? acknowledgement.changes as Record<string, unknown>
      : {};
    const acknowledgedAt = typeof acknowledgement.at === 'string' ? acknowledgement.at : '';
    const acknowledgedAtMs = Date.parse(acknowledgedAt);
    if (
      acknowledgement.action !== 'pricing_memo_acknowledged'
      || typeof acknowledgement.by !== 'string'
      || !Number.isFinite(acknowledgedAtMs)
      || acknowledgedAtMs < exportAtMs
      || acknowledgedAtMs > nowMs
      || acknowledgementChanges.acknowledgementVersion !== PRICING_MEMO_ACKNOWLEDGEMENT_VERSION
      || acknowledgementChanges.evidenceFingerprint !== evidenceFingerprint
      || acknowledgementChanges.memoStatus !== memoStatus
      || (acknowledgementChanges.memoOutcome ?? null) !== memoOutcome
      || acknowledgementChanges.decision !== 'no_change'
      || typeof acknowledgementChanges.rationale !== 'string'
      || acknowledgementChanges.rationale.length < 20
      || acknowledgementChanges.rationale.length > 1_000
      || acknowledgementChanges.sourceExportAt !== new Date(exportAtMs).toISOString()
      || acknowledgementChanges.requiresHumanApproval !== true
      || acknowledgementChanges.priceChangeAuthorized !== false
      || acknowledgementChanges.entitlementChangeAuthorized !== false
      || acknowledgementChanges.noStripeMutation !== true
    ) {
      return { ok: false as const, code: 'ACKNOWLEDGEMENT_INVALID', status: 409, error: 'The latest pricing memo acknowledgement failed its audit checks.' };
    }
    canonicalAcknowledgement = {
      evidenceFingerprint,
      reviewedBy: acknowledgement.by,
      acknowledgedAt,
      rationale: acknowledgementChanges.rationale,
      decision: 'no_change',
    };
  }

  return {
    ok: true as const,
    reviewStatus: {
      available: true as const,
      memo: {
        generatedAt: auditGeneratedAt,
        exportedAt: exportAt,
        evidenceFingerprint,
        status: memoStatus as 'blocked' | 'collecting' | 'ready',
        outcome: memoOutcome as 'pass' | 'watch' | null,
        readyForHumanReview: memoStatus === 'ready',
        reason: canonicalAcknowledgement && fresh
          ? 'A master reviewer recorded a no-change decision for this current evidence snapshot.'
          : canonicalAcknowledgement
            ? 'This historical snapshot has a no-change review, but its evidence is older than 24 hours. Generate fresh evidence for the current decision.'
            : fresh
              ? 'The latest evidence snapshot is ready for an explicit human review decision.'
              : 'The latest unreviewed snapshot is older than 24 hours. Generate fresh evidence before review.',
        requiresHumanApproval: true as const,
        priceChangeAuthorized: false as const,
        entitlementChangeAuthorized: false as const,
        fresh,
      },
      acknowledgement: canonicalAcknowledgement,
      canAcknowledge: !canonicalAcknowledgement && fresh,
      requiresNewExport: !fresh,
    },
  };
}
