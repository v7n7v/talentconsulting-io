export type StripeCheckoutRecoveryCode =
  | 'STRIPE_SUBSCRIPTION_EXISTS'
  | 'STRIPE_CHECKOUT_IN_PROGRESS'
  | 'STRIPE_CHECKOUT_NOT_READY'
  | 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE'
  | 'CHECKOUT_PROMOTION_POLICY_INVALID'
  | 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED'
  | 'CHECKOUT_ECONOMICS_BLOCKED'
  | 'STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE'
  | 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE'
  | 'STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE'
  | 'STRIPE_ACCOUNT_REVIEW_REQUIRED'
  | 'STRIPE_CHECKOUT_CREATION_UNAVAILABLE'
  | 'STRIPE_CHECKOUT_CONFIRMATION_PENDING'
  | 'CHECKOUT_FAILED';

export type StripeCheckoutRecovery = {
  code: StripeCheckoutRecoveryCode;
  title: string;
  message: string;
  primaryAction: 'manage_billing' | 'retry' | 'check_availability' | 'contact_support' | 'resume_checkout';
  primaryLabel: string;
  retryAllowed: boolean;
};

function payloadRecord(payload: unknown) {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

export function resolveStripeCheckoutRecovery(
  payload: unknown,
): StripeCheckoutRecovery {
  const data = payloadRecord(payload);
  const code = typeof data.code === 'string' ? data.code : '';

  if (code === 'STRIPE_SUBSCRIPTION_EXISTS' || data.manageBilling === true) {
    return {
      code: 'STRIPE_SUBSCRIPTION_EXISTS',
      title: 'Your billing plan already exists',
      message: 'Open billing settings to manage the current subscription, invoices, or plan changes.',
      primaryAction: 'manage_billing',
      primaryLabel: 'Manage billing',
      retryAllowed: false,
    };
  }
  if (code === 'STRIPE_CHECKOUT_IN_PROGRESS') {
    return {
      code: 'STRIPE_CHECKOUT_IN_PROGRESS',
      title: 'Checkout is already open',
      message: 'Finish or close the other Stripe checkout. If it was abandoned, you can try again after it expires.',
      primaryAction: 'retry',
      primaryLabel: 'Check again',
      retryAllowed: true,
    };
  }
  if (code === 'STRIPE_CHECKOUT_NOT_READY') {
    return {
      code: 'STRIPE_CHECKOUT_NOT_READY',
      title: 'Checkout is temporarily unavailable',
      message: 'Secure checkout is temporarily unavailable. Your current plan remains unchanged.',
      primaryAction: 'check_availability',
      primaryLabel: 'Check availability',
      retryAllowed: false,
    };
  }
  if (code === 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE') {
    return {
      code: 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE',
      title: 'Price verification is unavailable',
      message: 'Stripe could not confirm this billing option. Your current plan remains unchanged.',
      primaryAction: 'check_availability',
      primaryLabel: 'Check prices',
      retryAllowed: false,
    };
  }
  if (code === 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED') {
    return {
      code: 'CHECKOUT_PROMOTION_INVENTORY_UNVERIFIED',
      title: 'Billing safety check is unavailable',
      message: 'Checkout is paused until the current offer can be verified. No checkout was created and your plan remains unchanged.',
      primaryAction: 'check_availability',
      primaryLabel: 'Check availability',
      retryAllowed: false,
    };
  }
  if (code === 'CHECKOUT_PROMOTION_POLICY_INVALID' || code === 'CHECKOUT_ECONOMICS_BLOCKED') {
    return {
      code,
      title: 'This billing option is under review',
      message: 'Checkout is paused while the plan safeguards are reviewed. No checkout was created and your plan remains unchanged.',
      primaryAction: 'check_availability',
      primaryLabel: 'Check availability',
      retryAllowed: false,
    };
  }
  if (
    code === 'STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE'
    || code === 'STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE'
  ) {
    return {
      code,
      title: 'Billing history check is unavailable',
      message: 'Stripe could not confirm this account history. No checkout was created and your current plan remains unchanged.',
      primaryAction: 'retry',
      primaryLabel: 'Try again',
      retryAllowed: true,
    };
  }
  if (code === 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE') {
    return {
      code: 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE',
      title: 'Billing account preparation is unavailable',
      message: 'Stripe could not finish preparing this account. No checkout was created and your current plan remains unchanged.',
      primaryAction: 'retry',
      primaryLabel: 'Try again',
      retryAllowed: true,
    };
  }
  if (code === 'STRIPE_CHECKOUT_CREATION_UNAVAILABLE') {
    return {
      code: 'STRIPE_CHECKOUT_CREATION_UNAVAILABLE',
      title: 'Checkout could not be opened',
      message: 'Stripe rejected this checkout attempt. No checkout was created and your current plan remains unchanged.',
      primaryAction: 'retry',
      primaryLabel: 'Try again',
      retryAllowed: true,
    };
  }
  if (code === 'STRIPE_CHECKOUT_CONFIRMATION_PENDING') {
    return {
      code: 'STRIPE_CHECKOUT_CONFIRMATION_PENDING',
      title: 'Checkout confirmation is pending',
      message: 'Stripe did not confirm whether checkout opened. We paused new attempts to prevent a duplicate checkout.',
      primaryAction: 'check_availability',
      primaryLabel: 'Check status',
      retryAllowed: false,
    };
  }
  if (code === 'STRIPE_ACCOUNT_REVIEW_REQUIRED') {
    return {
      code: 'STRIPE_ACCOUNT_REVIEW_REQUIRED',
      title: 'Billing account needs review',
      message: 'Stripe returned more account history than checkout can verify safely. No checkout was created. Contact support to continue.',
      primaryAction: 'contact_support',
      primaryLabel: 'Get help',
      retryAllowed: false,
    };
  }
  return {
    code: 'CHECKOUT_FAILED',
    title: 'Checkout needs attention',
    message: 'Checkout could not be opened. Check your connection and try again.',
    primaryAction: 'retry',
    primaryLabel: 'Retry checkout',
    retryAllowed: true,
  };
}
