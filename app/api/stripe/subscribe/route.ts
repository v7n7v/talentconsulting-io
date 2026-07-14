/**
 * Stripe Subscribe API — Embedded Checkout Flow
 * Creates an embedded checkout session for the Pro plan.
 * Returns clientSecret for frontend EmbeddedCheckout or PaymentElement.
 * POST /api/stripe/subscribe
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { guardApiRoute } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { StripeSubscribeSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';
import { getAllowedStripeReturnOrigin } from '@/lib/stripe-return-url';
import { selectStripeCustomerForUser } from '@/lib/stripe-account-selection';
import { buildSonaPurchaseContractMetadata } from '@/lib/sona/purchase-contract';
import { getStripeRuntimeReadiness } from '@/lib/billing/stripe-runtime-readiness';
import { validateStripeCheckoutPriceContract } from '@/lib/billing/stripe-checkout-price-contract';
import {
  retrieveStripeCheckoutTierPrices,
  STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES,
  STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS,
} from '@/lib/billing/stripe-checkout-price-read';
import {
  buildStripeSubscriptionData,
  buildStripeTrialMetadata,
  decideStripeTrialOffer,
} from '@/lib/billing/stripe-trial-policy';
import {
  discoverStripeCheckoutCustomers,
  readStripeCheckoutSubscriptionHistory,
  StripeCheckoutAccountReviewRequiredError,
} from '@/lib/billing/stripe-checkout-account-read';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  releaseStripeCheckout,
  recordStripePendingCheckout,
  reserveStripeCheckout,
  shouldRetainStripeCheckoutReservation,
  STRIPE_CHECKOUT_SESSION_TTL_SECONDS,
} from '@/lib/billing/stripe-checkout-reservation';
import { uniqueStripeCheckoutAssociatedCustomerIds } from '@/lib/billing/stripe-checkout-account-policy';
import { prepareStripeCheckoutCustomer } from '@/lib/billing/stripe-checkout-customer-write';
import { createStripeCheckoutSession } from '@/lib/billing/stripe-checkout-session-write';
import { verifyStripeCheckoutEconomics } from '@/lib/billing/stripe-checkout-economics';

// Lazy-init Stripe to avoid crash if env var missing at module load
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, {
    apiVersion: '2026-02-25.clover',
    timeout: STRIPE_CHECKOUT_PRICE_READ_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_CHECKOUT_PRICE_READ_MAX_NETWORK_RETRIES,
  });
}

export async function POST(req: NextRequest) {
  let checkoutReservation: { uid: string; reservationId: string } | null = null;
  let checkoutSessionState: 'not_started' | 'attempted' | 'created' = 'not_started';
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (!getStripeRuntimeReadiness().configurationReady) {
      return NextResponse.json({
        code: 'STRIPE_CHECKOUT_NOT_READY',
        error: 'Secure checkout is temporarily unavailable. Please try again later.',
      }, { status: 503 });
    }

    const stripe = getStripe();
    const { uid, email } = guard.user;

    const validated = await validateBody(req, StripeSubscribeSchema);
    if (!validated.success) return validated.error;
    const { interval, plan, source } = validated.data;

    // Resolve price ID based on plan + interval
    const PRICE_MAP: Record<string, Record<string, string | undefined>> = {
      pro: {
        month: process.env.STRIPE_PRO_PRICE_ID,
        year: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
      },
      studio: {
        month: process.env.STRIPE_STUDIO_PRICE_ID,
        year: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
      },
    };

    const priceId = PRICE_MAP[plan]?.[interval];
    const proPriceId = PRICE_MAP.pro[interval];
    const studioPriceId = PRICE_MAP.studio[interval];

    if (!priceId || !proPriceId || !studioPriceId) {
      return NextResponse.json(
        { error: 'This plan is not ready for checkout yet. Please contact support.' },
        { status: 500 }
      );
    }

    let proPrice: Stripe.Price;
    let studioPrice: Stripe.Price;
    try {
      ({ proPrice, studioPrice } = await retrieveStripeCheckoutTierPrices(
        stripe,
        proPriceId,
        studioPriceId,
      ));
    } catch {
      console.warn(`[stripe/subscribe] Price verification unavailable for ${plan}/${interval}`);
      return NextResponse.json({
        code: 'STRIPE_PRICE_VERIFICATION_UNAVAILABLE',
        error: 'Stripe could not confirm this billing option. Your current plan remains unchanged.',
      }, { status: 503 });
    }
    const price = plan === 'studio' ? studioPrice : proPrice;
    const priceContract = validateStripeCheckoutPriceContract({
      plan,
      interval,
      selectedPriceId: priceId,
      pro: {
        id: proPrice.id,
        active: proPrice.active,
        type: proPrice.type,
        interval: proPrice.recurring?.interval || null,
        currency: proPrice.currency,
        unitAmount: proPrice.unit_amount,
      },
      studio: {
        id: studioPrice.id,
        active: studioPrice.active,
        type: studioPrice.type,
        interval: studioPrice.recurring?.interval || null,
        currency: studioPrice.currency,
        unitAmount: studioPrice.unit_amount,
      },
    });
    if (!priceContract.valid) {
      console.error(`[stripe/subscribe] Price contract failed for ${plan}/${interval}: ${priceContract.reason}`);
      return NextResponse.json(
        { error: 'This billing option is misconfigured. Please contact support.' },
        { status: 409 }
      );
    }

    const economicsDecision = await verifyStripeCheckoutEconomics(stripe, {
      plan,
      interval,
      selectedPrice: price,
    });
    if (!economicsDecision.ready) {
      console.warn(`[stripe/subscribe] Commercial readiness blocked for ${plan}/${interval}: ${economicsDecision.code}`);
      return NextResponse.json({
        code: economicsDecision.code,
        error: 'This billing option is temporarily unavailable while its commercial safeguards are reviewed.',
      }, { status: 503 });
    }

    const localSubscriptionSnapshot = await getAdminDb()
      .collection('users')
      .doc(uid)
      .collection('subscription')
      .doc('current')
      .get();
    const localSubscription = localSubscriptionSnapshot.data();

    const reservationId = randomUUID();
    const reservation = await reserveStripeCheckout(getAdminDb(), uid, reservationId);
    if (!reservation.acquire) {
      return NextResponse.json({
        code: 'STRIPE_CHECKOUT_IN_PROGRESS',
        error: 'A checkout is already in progress. Finish or close it before starting another.',
      }, { status: 409 });
    }
    checkoutReservation = { uid, reservationId };

    // Get or create Stripe customer
    let customers: Stripe.Customer[];
    let uidCustomers: Stripe.Customer[];
    try {
      ({ emailCustomers: customers, uidCustomers } = await discoverStripeCheckoutCustomers(
        stripe,
        { email: email!, uid },
      ));
    } catch {
      await releaseStripeCheckout(getAdminDb(), uid, reservationId).catch(() => {});
      checkoutReservation = null;
      return NextResponse.json({
        code: 'STRIPE_CUSTOMER_DISCOVERY_UNAVAILABLE',
        error: 'Stripe could not confirm this billing account. No checkout was created.',
      }, { status: 503 });
    }
    const knownCustomers = [...new Map(
      [...uidCustomers, ...customers].map(customer => [customer.id, customer]),
    ).values()];
    const selectedCustomer = selectStripeCustomerForUser(
      knownCustomers.map(customer => ({ id: customer.id, firebaseUid: customer.metadata?.firebaseUid || null })),
      uid,
      { allowUnclaimed: true },
    );
    let customerId: string;
    try {
      ({ customerId } = await prepareStripeCheckoutCustomer(stripe, {
        uid,
        email: email!,
        selectedCustomer,
        selectedCustomerMetadata: selectedCustomer
          ? knownCustomers.find(candidate => candidate.id === selectedCustomer.customerId)?.metadata || null
          : null,
      }));
    } catch {
      await releaseStripeCheckout(getAdminDb(), uid, reservationId).catch(() => {});
      checkoutReservation = null;
      return NextResponse.json({
        code: 'STRIPE_CUSTOMER_PREPARATION_UNAVAILABLE',
        error: 'Stripe could not prepare this billing account. No checkout was created.',
      }, { status: 503 });
    }

    const associatedCustomerIds = uniqueStripeCheckoutAssociatedCustomerIds({
      uidCustomerIds: knownCustomers
        .filter(customer => customer.metadata?.firebaseUid === uid)
        .map(customer => customer.id),
      selectedCustomerId: customerId,
      localCustomerId: typeof localSubscription?.stripeCustomerId === 'string'
        ? localSubscription.stripeCustomerId
        : null,
    });
    let subscriptionHistory: Awaited<ReturnType<typeof readStripeCheckoutSubscriptionHistory>>;
    try {
      subscriptionHistory = await readStripeCheckoutSubscriptionHistory(
        stripe,
        { customerIds: associatedCustomerIds },
      );
    } catch (error) {
      await releaseStripeCheckout(getAdminDb(), uid, reservationId).catch(() => {});
      checkoutReservation = null;
      if (error instanceof StripeCheckoutAccountReviewRequiredError) {
        return NextResponse.json({
          code: 'STRIPE_ACCOUNT_REVIEW_REQUIRED',
          error: 'This billing account needs review before checkout can continue. No checkout was created.',
        }, { status: 409 });
      }
      return NextResponse.json({
        code: 'STRIPE_SUBSCRIPTION_HISTORY_UNAVAILABLE',
        error: 'Stripe could not confirm prior subscription history. No checkout was created.',
      }, { status: 503 });
    }
    if (subscriptionHistory.blockingSubscription) {
      await releaseStripeCheckout(getAdminDb(), uid, reservationId);
      checkoutReservation = null;
      return NextResponse.json({
        code: 'STRIPE_SUBSCRIPTION_EXISTS',
        error: 'A billing plan already exists for this account. Manage it in billing settings.',
        manageBilling: true,
      }, { status: 409 });
    }
    const trialOffer = decideStripeTrialOffer(
      reservation.trialPreviouslyConsumed || subscriptionHistory.hasHistory,
    );
    const origin = getAllowedStripeReturnOrigin(req.headers.get('origin'));
    const purchaseContractMetadata = buildSonaPurchaseContractMetadata(plan, interval);
    const checkoutMetadata = {
      firebaseUid: uid,
      interval,
      plan,
      checkoutSource: source,
      checkoutReservationId: reservationId,
      ...purchaseContractMetadata,
      ...buildStripeTrialMetadata(trialOffer),
    };

    // Create embedded checkout session
    checkoutSessionState = 'attempted';
    const session = await createStripeCheckoutSession(stripe, {
      customer: customerId,
      client_reference_id: uid,
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/suite/settings?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
      expires_at: Math.floor(Date.now() / 1_000) + STRIPE_CHECKOUT_SESSION_TTL_SECONDS,
      subscription_data: buildStripeSubscriptionData(checkoutMetadata, trialOffer),
      metadata: checkoutMetadata,
    }, { idempotencyKey: `talent-subscribe-${uid}-${reservationId}` });
    checkoutSessionState = 'created';
    const pendingReceipt = await recordStripePendingCheckout(getAdminDb(), {
      uid,
      reservationId,
      checkoutSessionId: session.id,
      mode: 'embedded',
      plan,
      interval,
      expiresAtMs: session.expires_at * 1_000,
    });
    if (!pendingReceipt.recorded) {
      throw new Error('Checkout Session receipt could not be recorded');
    }

    monitor.info(
      trialOffer.eligible ? 'Trial Checkout Created' : 'Subscription Checkout Created',
      trialOffer.eligible ? `${plan} plan — ${trialOffer.days}-day trial offer` : `${plan} plan — returning subscriber`,
      [
      { name: 'Email', value: email || 'unknown' },
      { name: 'Plan', value: `${plan} (${interval}ly)` },
      { name: 'Trial eligibility', value: trialOffer.eligible ? 'eligible' : 'not eligible' },
      ],
    );

    return NextResponse.json({
      clientSecret: session.client_secret,
    });
  } catch (error: unknown) {
    const sessionOutcomeUncertain = checkoutSessionState === 'created'
      || (checkoutSessionState === 'attempted' && shouldRetainStripeCheckoutReservation(error));
    if (checkoutReservation && !sessionOutcomeUncertain) {
      await releaseStripeCheckout(
        getAdminDb(),
        checkoutReservation.uid,
        checkoutReservation.reservationId,
      ).catch(() => {});
    }
    console.error('[api/stripe/subscribe] Error:', error);
    monitor.critical('Tool: stripe/subscribe', String(error));
    if (checkoutSessionState === 'attempted' || checkoutSessionState === 'created') {
      return NextResponse.json({
        code: sessionOutcomeUncertain
          ? 'STRIPE_CHECKOUT_CONFIRMATION_PENDING'
          : 'STRIPE_CHECKOUT_CREATION_UNAVAILABLE',
        error: sessionOutcomeUncertain
          ? 'Stripe did not confirm whether checkout opened. New attempts are paused to prevent a duplicate checkout.'
          : 'Stripe rejected this checkout attempt. No checkout was created.',
      }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'Checkout is unavailable right now. Please try again.' },
      { status: 500 }
    );
  }
}
