import { STRIPE_ACCOUNT_REVIEW_ISSUE_CODE } from '@/lib/billing/stripe-account-review-support';
import type { StripeAccountReviewStatus } from '@/lib/billing/stripe-account-review-case';

const SAFE_CASE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type StripeAccountReviewReceipt = {
  caseId: string;
  status: StripeAccountReviewStatus;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
};

export function normalizeStripeAccountReviewReceipt(value: unknown): StripeAccountReviewReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.issueCode !== STRIPE_ACCOUNT_REVIEW_ISSUE_CODE
    || typeof data.caseId !== 'string'
    || !SAFE_CASE_ID.test(data.caseId)
    || (data.status !== 'new' && data.status !== 'reviewing' && data.status !== 'resolved')
  ) return null;
  const optionalDate = (date: unknown) => typeof date === 'string' ? date : null;
  return {
    caseId: data.caseId,
    status: data.status,
    createdAt: optionalDate(data.createdAt),
    updatedAt: optionalDate(data.updatedAt),
    resolvedAt: optionalDate(data.resolvedAt),
  };
}

export function stripeAccountReviewReceiptPresentation(status: StripeAccountReviewStatus) {
  if (status === 'resolved') {
    return {
      title: 'Billing review complete',
      message: 'Support completed the account review. You can return to checkout; every safety check will run again before a session is created.',
      actionLabel: 'Return to checkout',
      tone: 'ready' as const,
    };
  }
  if (status === 'reviewing') {
    return {
      title: 'Billing review in progress',
      message: 'Support is reviewing the account history. Your current plan is unchanged and checkout remains closed.',
      actionLabel: null,
      tone: 'working' as const,
    };
  }
  return {
    title: 'Billing review queued',
    message: 'Your request is in the support queue. Your current plan is unchanged and no checkout was created.',
    actionLabel: null,
    tone: 'queued' as const,
  };
}
