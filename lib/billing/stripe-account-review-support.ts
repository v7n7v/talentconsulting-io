export const STRIPE_ACCOUNT_REVIEW_CONTEXT = 'billing-account-review';
export const STRIPE_ACCOUNT_REVIEW_ISSUE_CODE = 'stripe_account_review_required';

export const STRIPE_ACCOUNT_REVIEW_MESSAGE =
  'Checkout stopped because my billing account history needs review. Please review the Stripe customer records connected to my account so I can continue safely.';

export function issueCodeForStripeAccountReviewContext(value: unknown) {
  return value === STRIPE_ACCOUNT_REVIEW_CONTEXT
    ? STRIPE_ACCOUNT_REVIEW_ISSUE_CODE
    : null;
}

export function normalizeStripeAccountReviewIssueCode(value: unknown) {
  return value === STRIPE_ACCOUNT_REVIEW_ISSUE_CODE
    ? STRIPE_ACCOUNT_REVIEW_ISSUE_CODE
    : null;
}
