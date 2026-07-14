export const VERIFIED_MRR_BASIS_VERSION = 'verified-mrr-v1-2026-07-10';
export const BILLING_EVIDENCE_VERSION = 'billing-evidence-v1-2026-07-10';

export interface RecurringBillingRecord {
  plan?: unknown;
  status?: unknown;
  billingInterval?: unknown;
  recurringAmountCents?: unknown;
  recurringCurrency?: unknown;
  interval?: unknown;
  amount?: unknown;
  currency?: unknown;
  billingEvidenceStatus?: unknown;
}

function positiveAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function buildSubscriptionBillingEvidence(input: {
  ownerUid?: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  plan: unknown;
  interval: unknown;
  amountCents: unknown;
  currency: unknown;
  stripePriceId: unknown;
  currentPeriodEnd?: string | null;
  syncedAt?: string;
}) {
  const syncedAt = input.syncedAt || new Date().toISOString();
  const plan = input.plan === 'pro' || input.plan === 'studio' ? input.plan : null;
  const interval = input.interval === 'month' || input.interval === 'year' ? input.interval : null;
  const amountCents = positiveAmount(input.amountCents);
  const currency = typeof input.currency === 'string' ? input.currency.toLowerCase() : null;
  const stripePriceId = typeof input.stripePriceId === 'string' && input.stripePriceId ? input.stripePriceId : null;
  const missing: string[] = [];

  if (!input.ownerUid) missing.push('owner_uid');
  if (!plan) missing.push('plan');
  if (!interval) missing.push('interval');
  if (amountCents == null) missing.push('amount');
  if (!currency) missing.push('currency');
  else if (currency !== 'usd') missing.push('currency_conversion');
  if (!stripePriceId) missing.push('price_id');

  const patch: Record<string, unknown> = {
    status: input.status,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    currentPeriodEnd: input.currentPeriodEnd || null,
    billingEvidenceVersion: BILLING_EVIDENCE_VERSION,
    billingEvidenceStatus: missing.length ? 'incomplete' : 'complete',
    billingEvidenceMissing: missing,
    billingEvidenceSyncedAt: syncedAt,
    billingEvidenceSource: 'stripe_sync',
    updatedAt: syncedAt,
    ...(plan ? { plan } : {}),
    ...(interval ? { interval, billingInterval: interval } : {}),
    ...(amountCents != null ? { amount: amountCents, recurringAmountCents: amountCents } : {}),
    ...(currency ? { currency, recurringCurrency: currency } : {}),
    ...(stripePriceId ? { priceId: stripePriceId, stripePriceId } : {}),
  };

  return {
    complete: missing.length === 0,
    missing,
    patch,
  };
}

export function calculateVerifiedMrr(records: RecurringBillingRecord[]) {
  let activePaidAccounts = 0;
  let pricedActiveAccounts = 0;
  let mrrCents = 0;
  const unresolved = {
    evidence: 0,
    plan: 0,
    amount: 0,
    interval: 0,
    currency: 0,
  };
  const byPlan = {
    pro: { activeAccounts: 0, pricedAccounts: 0, mrrCents: 0 },
    studio: { activeAccounts: 0, pricedAccounts: 0, mrrCents: 0 },
  };

  records.forEach(record => {
    if (record.status !== 'active') return;
    activePaidAccounts += 1;

    if (record.billingEvidenceStatus === 'incomplete') {
      unresolved.evidence += 1;
      return;
    }

    const plan = record.plan === 'pro' || record.plan === 'studio' ? record.plan : null;
    if (!plan) {
      unresolved.plan += 1;
      return;
    }
    byPlan[plan].activeAccounts += 1;

    const amountCents = positiveAmount(record.recurringAmountCents ?? record.amount);
    if (amountCents == null) {
      unresolved.amount += 1;
      return;
    }
    const interval = record.billingInterval ?? record.interval;
    if (interval !== 'month' && interval !== 'year') {
      unresolved.interval += 1;
      return;
    }
    const currency = record.recurringCurrency ?? record.currency;
    if (String(currency || '').toLowerCase() !== 'usd') {
      unresolved.currency += 1;
      return;
    }

    const monthlyCents = interval === 'year' ? amountCents / 12 : amountCents;
    mrrCents += monthlyCents;
    pricedActiveAccounts += 1;
    byPlan[plan].pricedAccounts += 1;
    byPlan[plan].mrrCents += monthlyCents;
  });

  const unresolvedActiveAccounts = activePaidAccounts - pricedActiveAccounts;
  return {
    basisVersion: VERIFIED_MRR_BASIS_VERSION,
    source: 'server-owned active subscription records',
    mrrUsd: Number((mrrCents / 100).toFixed(2)),
    activePaidAccounts,
    pricedActiveAccounts,
    unresolvedActiveAccounts,
    coveragePercent: activePaidAccounts
      ? Number(((pricedActiveAccounts / activePaidAccounts) * 100).toFixed(1))
      : 100,
    complete: unresolvedActiveAccounts === 0,
    unresolved,
    byPlan: {
      pro: { ...byPlan.pro, mrrUsd: Number((byPlan.pro.mrrCents / 100).toFixed(2)) },
      studio: { ...byPlan.studio, mrrUsd: Number((byPlan.studio.mrrCents / 100).toFixed(2)) },
    },
  };
}
