type PromotionCoupon = {
  valid: boolean;
  percent_off: number | null;
  amount_off: number | null;
};

type PromotionCode = {
  id: string;
  promotion: { coupon: string | PromotionCoupon | null };
};

type StripePromotionReader = {
  promotionCodes: {
    list(input: {
      active: true;
      limit: 100;
      expand: ['data.promotion.coupon'];
      starting_after?: string;
    }): Promise<{ data: PromotionCode[]; has_more: boolean }>;
  };
};

export type StripePromotionAuditReason =
  | 'verified'
  | 'invalid_reviewed_ceiling'
  | 'coupon_evidence_missing'
  | 'fixed_amount_coupon'
  | 'unsupported_coupon'
  | 'ceiling_exceeded'
  | 'pagination_invalid'
  | 'pagination_limit'
  | 'audit_timeout';

export type StripePromotionAuditResult = {
  verified: boolean;
  reason: StripePromotionAuditReason;
  activeCodeCount: number;
  maxObservedPercent: number | null;
};

export async function auditStripePromotionDiscountCeiling(
  stripe: StripePromotionReader,
  reviewedCeilingPercent: number,
  options: { signal?: AbortSignal } = {},
): Promise<StripePromotionAuditResult> {
  const timeoutResult = () => ({
    verified: false,
    reason: 'audit_timeout' as const,
    activeCodeCount: 0,
    maxObservedPercent: null,
  });
  if (options.signal?.aborted) return timeoutResult();
  if (!Number.isFinite(reviewedCeilingPercent) || reviewedCeilingPercent < 0 || reviewedCeilingPercent > 100) {
    return { verified: false as const, reason: 'invalid_reviewed_ceiling' as const, activeCodeCount: 0, maxObservedPercent: null };
  }

  let startingAfter: string | undefined;
  let activeCodeCount = 0;
  let maxObservedPercent = 0;
  for (let page = 0; page < 10; page += 1) {
    if (options.signal?.aborted) return timeoutResult();
    const result = await stripe.promotionCodes.list({
      active: true,
      limit: 100,
      expand: ['data.promotion.coupon'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    if (options.signal?.aborted) return timeoutResult();
    activeCodeCount += result.data.length;
    for (const code of result.data) {
      const coupon = code.promotion.coupon;
      if (!coupon || typeof coupon === 'string' || coupon.valid !== true) {
        return { verified: false as const, reason: 'coupon_evidence_missing' as const, activeCodeCount, maxObservedPercent: null };
      }
      if (coupon.amount_off != null) {
        return { verified: false as const, reason: 'fixed_amount_coupon' as const, activeCodeCount, maxObservedPercent: null };
      }
      if (coupon.percent_off == null || !Number.isFinite(coupon.percent_off)) {
        return { verified: false as const, reason: 'unsupported_coupon' as const, activeCodeCount, maxObservedPercent: null };
      }
      maxObservedPercent = Math.max(maxObservedPercent, coupon.percent_off);
      if (coupon.percent_off > reviewedCeilingPercent) {
        return { verified: false as const, reason: 'ceiling_exceeded' as const, activeCodeCount, maxObservedPercent };
      }
    }
    if (!result.has_more) {
      return { verified: true as const, reason: 'verified' as const, activeCodeCount, maxObservedPercent };
    }
    const lastId = result.data.at(-1)?.id;
    if (!lastId) {
      return { verified: false as const, reason: 'pagination_invalid' as const, activeCodeCount, maxObservedPercent: null };
    }
    startingAfter = lastId;
  }
  return { verified: false as const, reason: 'pagination_limit' as const, activeCodeCount, maxObservedPercent: null };
}

export async function auditStripePromotionDiscountCeilingWithTimeout(
  stripe: StripePromotionReader,
  reviewedCeilingPercent: number,
  timeoutMs = 6_000,
): Promise<StripePromotionAuditResult> {
  const boundedTimeoutMs = Math.min(Math.max(Math.floor(timeoutMs), 1), 10_000);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<StripePromotionAuditResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        verified: false,
        reason: 'audit_timeout',
        activeCodeCount: 0,
        maxObservedPercent: null,
      });
    }, boundedTimeoutMs);
  });

  try {
    return await Promise.race([
      auditStripePromotionDiscountCeiling(stripe, reviewedCeilingPercent, { signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
