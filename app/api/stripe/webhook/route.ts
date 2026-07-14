/**
 * Stripe Webhook Handler
 * Processes subscription lifecycle events from Stripe.
 * POST /api/stripe/webhook
 *
 * Events handled:
 * - checkout.session.completed → create subscription record
 * - customer.subscription.updated → update status
 * - customer.subscription.deleted → revert to free
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { triggerReferralReward } from '@/lib/referral';
import {
  sendCancellationEmailResult,
  sendCustomEmailResult,
  sendPlanChangeEmailResult,
  sendSubscriptionEmailResult,
  sendTrialEndingEmailResult,
  type EmailSendResult,
} from '@/lib/email';
import {
  appendLedgerEntry,
  claimStripeEventProcessing,
  logBillingCommunication,
  markStripeEventProcessed,
  postDisputeToLedger,
  postInvoiceToLedger,
  postRefundToLedger,
  recordStripeEvent,
  stripeDashboardUrl,
  syncCustomerAccount,
  toIso,
  upsertBillingAccount,
} from '@/lib/billing-ledger';
import {
  recordSonaCheckoutConversion,
  recordSonaPaidInvoice,
  recordSonaRefund,
} from '@/lib/sona/economics';
import { resolveStripeFirebaseUid } from '@/lib/stripe-account-selection';
import { normalizeCheckoutAttributionSource } from '@/lib/billing/checkout-attribution';
import {
  decideStripeSubscriptionStateWrite,
  resolveStripePlanFromConfiguredPrice,
} from '@/lib/billing/stripe-subscription-contract';
import { getStripeWebhookReadiness } from '@/lib/billing/stripe-runtime-readiness';
import {
  resolveExpectedStripeLiveMode,
  verifyStripeWebhookEnvelope,
} from '@/lib/billing/stripe-webhook-envelope';
import { resolveStripeCheckoutWebhookEvidence } from '@/lib/billing/stripe-checkout-webhook-evidence';
import { isHandledStripeWebhookEvent } from '@/lib/billing/stripe-webhook-events';
import {
  preserveStripeTrialQuarantine,
  resolveStripeSubscriptionTrialState,
  resolveStripeTrialEvidence,
} from '@/lib/billing/stripe-trial-policy';
import { completeStripeCheckoutReservation } from '@/lib/billing/stripe-checkout-reservation';

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });
  return _stripe;
}

async function writeSubscription(
  uid: string,
  data: Record<string, unknown>,
  event: Stripe.Event,
  subscriptionId?: string | null,
  subscriptionCreated?: number | null,
) {
  const ref = getAdminDb()
    .collection('users')
    .doc(uid)
    .collection('subscription')
    .doc('current');

  return getAdminDb().runTransaction(async transaction => {
    const current = await transaction.get(ref);
    const effectiveData = preserveStripeTrialQuarantine(current.data(), data);
    const incomingEntitled = (effectiveData.plan === 'pro' || effectiveData.plan === 'studio')
      && (effectiveData.status === 'active' || effectiveData.status === 'trialing');
    const checkoutEvidenceTransition = event.type === 'checkout.session.completed'
      && effectiveData.status === 'trialing'
      && (effectiveData.stripeCheckoutEvidenceVerified === true || effectiveData.trialPolicyQuarantined === true);
    const decision = checkoutEvidenceTransition
      ? { apply: true, resumeSideEffects: true, reason: 'checkout_evidence' as const, priority: 10 }
      : decideStripeSubscriptionStateWrite(current.data(), {
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      subscriptionId,
      subscriptionCreated,
      entitled: incomingEntitled,
      });
    if (!decision.apply) return decision;
    transaction.set(ref, {
      ...effectiveData,
      stripeStateEventId: event.id,
      stripeStateEventType: event.type,
      stripeStateEventCreated: event.created,
      stripeStateEventPriority: decision.priority,
      stripeStateSubscriptionId: subscriptionId || null,
      stripeStateSubscriptionCreated: subscriptionCreated || null,
      stripeStateEntitled: incomingEntitled,
    }, { merge: true });
    return decision;
  });
}

function formatStripePrice(price?: Stripe.Price | null) {
  if (!price?.unit_amount) return undefined;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price.unit_amount / 100);
  const interval = price.recurring?.interval === 'year' ? 'yr' : 'mo';
  return `${amount}/${interval}`;
}

function verifiedWebhookUid(customer: Stripe.Customer, subscription?: Stripe.Subscription | null) {
  const identity = resolveStripeFirebaseUid({
    customerUid: customer.metadata?.firebaseUid || null,
    subscriptionUid: subscription?.metadata?.firebaseUid || null,
  });
  if (identity.conflict) {
    monitor.critical('Stripe Identity Conflict', `Customer ${customer.id} and subscription ${subscription?.id || 'unknown'} have different Firebase owners.`);
    return null;
  }
  return identity.uid;
}

function objectId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in value) return String((value as { id?: string }).id || '');
  return null;
}

function invoicePaymentReference(invoice: Stripe.Invoice) {
  const invoicePayment = invoice.payments?.data.find(payment => payment.status === 'paid')
    || invoice.payments?.data[0];
  return objectId(invoicePayment?.payment?.payment_intent)
    || objectId(invoicePayment?.payment?.charge)
    || objectId((invoice as any).payment_intent);
}

function refundPaymentReference(refund: Stripe.Refund) {
  return objectId((refund as any).payment_intent) || objectId(refund.charge);
}

function queueBillingEmailAndLog(
  communication: Parameters<typeof logBillingCommunication>[0],
  sendEmail: (idempotencyKey: string) => Promise<EmailSendResult>,
  stripeEventId: string,
) {
  void (async () => {
    const idempotencyKey = `stripe:${stripeEventId}:${communication.template}`;
    const result = await sendEmail(idempotencyKey);
    await logBillingCommunication({
      ...communication,
      idempotencyKey,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.id || null,
      error: result.ok ? null : result.error || 'Email provider returned failure',
    });
  })().catch((error) => {
    console.error('[stripe] Billing email/log failed:', error);
  });
}

export async function POST(req: NextRequest) {
  if (!getStripeWebhookReadiness().configurationReady) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let envelope;

  try {
    envelope = verifyStripeWebhookEnvelope({
      stripe: getStripe(),
      body,
      signature: sig,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      expectedLiveMode: resolveExpectedStripeLiveMode(process.env.STRIPE_SECRET_KEY),
    });
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = envelope.event;
  if (!envelope.accepted) {
    await recordStripeEvent(event).catch(() => false);
    await markStripeEventProcessed(event.id, 'ignored', 'Stripe event mode did not match configured key mode').catch(() => {});
    monitor.warn('Stripe Webhook Ignored', `Mode mismatch for event ${event.id}`);
    return NextResponse.json({ received: true, ignored: true });
  }

  if (!isHandledStripeWebhookEvent(event.type)) {
    await recordStripeEvent(event).catch(() => false);
    await markStripeEventProcessed(event.id, 'ignored', 'Stripe event type is not handled').catch(() => {});
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const processingClaim = await claimStripeEventProcessing(event);
    if (!processingClaim.acquire) {
      if (processingClaim.reason === 'in_progress') {
        return NextResponse.json({ received: false, retry: true, status: 'processing' }, { status: 409 });
      }
      return NextResponse.json({ received: true, duplicate: true, status: processingClaim.reason });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id;
        if (!uid) {
          throw new Error(`Checkout session ${session.id} is missing its Firebase owner.`);
        }
        if (session.metadata?.firebaseUid && session.metadata.firebaseUid !== uid) {
          monitor.critical('Stripe Identity Conflict', `Checkout session ${session.id} has conflicting Firebase owners.`);
          throw new Error(`Checkout session ${session.id} has conflicting Firebase owners.`);
        }

        const checkoutSource = normalizeCheckoutAttributionSource(session.metadata?.checkoutSource);

        const subId = session.subscription as string;
        let status: string = 'active';
        let trialStart: string | null = null;
        let trialEnd: string | null = null;
        const checkoutAmountCents = Number((session as any).amount_total || 0);
        let amount = checkoutAmountCents;
        let currency = session.currency || 'usd';
        let interval = session.metadata?.interval || 'month';
        let priceId: string | null = null;
        let priceDisplay: string | undefined;
        let verifiedSubscription: Stripe.Subscription | null = null;
        let subscriptionCreated: number | null = null;
        if (subId) {
          try {
            const stripe2 = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });
            const sub = await stripe2.subscriptions.retrieve(subId);
            const price = sub.items?.data?.[0]?.price;
            verifiedSubscription = sub;
            subscriptionCreated = sub.created;
            amount = price?.unit_amount ?? amount;
            currency = price?.currency || currency;
            interval = price?.recurring?.interval || interval;
            priceId = price?.id || null;
            priceDisplay = formatStripePrice(price);
            status = sub.status;
            if (sub.status === 'trialing') {
              trialStart = sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null;
              trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
            }
          } catch (error) {
            throw new Error(`Could not verify checkout subscription ${subId}: ${error instanceof Error ? error.message : 'Stripe lookup failed'}`);
          }
        }
        const checkoutEvidence = resolveStripeCheckoutWebhookEvidence({
          sessionMetadata: session.metadata,
          subscription: verifiedSubscription,
          proPriceIds: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID],
          studioPriceIds: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
        });
        if (!checkoutEvidence.valid) {
          throw new Error(`Checkout price could not be mapped to a configured plan (${checkoutEvidence.status}).`);
        }
        const { plan, planResolution, purchaseContract, billingInterval } = checkoutEvidence;
        const trialEvidence = resolveStripeTrialEvidence({
          sessionMetadata: session.metadata,
          subscriptionMetadata: verifiedSubscription?.metadata,
          subscriptionStatus: status,
          trialStart: verifiedSubscription?.trial_start,
          trialEnd: verifiedSubscription?.trial_end,
          checkoutCreated: session.created,
        });
        priceId = checkoutEvidence.priceId;
        interval = billingInterval;
        const trialPolicyQuarantined = status === 'trialing'
          && trialEvidence.status !== 'verified'
          && trialEvidence.status !== 'legacy_missing';
        const entitlementPlan = ['active', 'trialing'].includes(status) && !trialPolicyQuarantined
          ? plan
          : 'free';
        if (planResolution.status === 'metadata_conflict') {
          monitor.critical('Stripe Plan Metadata Conflict', `Checkout ${session.id} metadata disagreed with price ${priceId}.`);
        }
        if (trialEvidence.status !== 'verified' && trialEvidence.status !== 'legacy_missing') {
          monitor.critical('Stripe Trial Policy Conflict', `Checkout ${session.id} has ${trialEvidence.status} trial evidence.`);
        }
        const subscriptionWrite = await writeSubscription(uid, {
          plan: entitlementPlan,
          status,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subId || (session.subscription as string),
          amount,
          currency,
          interval,
          priceId,
          billingInterval,
          recurringAmountCents: amount,
          recurringCurrency: currency,
          stripePriceId: priceId,
          sonaPurchaseContractStatus: purchaseContract.status,
          sonaPurchaseContract: purchaseContract.contract,
          sonaPurchaseContractFingerprint: purchaseContract.contract?.fingerprint || null,
          sonaPurchaseContractRecordedAt: FieldValue.serverTimestamp(),
          stripeTrialPolicyStatus: trialEvidence.status,
          stripeTrialPolicyVersion: trialEvidence.offer?.policyVersion || null,
          trialEligibleAtCheckout: trialEvidence.offer?.eligible ?? null,
          trialStarted: trialEvidence.trialStarted,
          trialWindowValid: trialEvidence.trialWindowValid,
          trialPolicyQuarantined,
          stripeCheckoutEvidenceVerified: !trialPolicyQuarantined,
          trialPolicyPendingCheckout: false,
          canceledAt: entitlementPlan === 'free' && !trialPolicyQuarantined ? FieldValue.serverTimestamp() : null,
          cancelAtPeriodEnd: false,
          ...(trialStart ? { trialStart } : {}),
          ...(trialEnd ? { trialEnd } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, event, subId, subscriptionCreated);
        if (!subscriptionWrite.resumeSideEffects) {
          monitor.warn('Stripe Subscription State Ignored', `${event.type} ${event.id} was ${subscriptionWrite.reason}.`);
          break;
        }

        await completeStripeCheckoutReservation(getAdminDb(), {
          uid,
          reservationId: session.metadata?.checkoutReservationId,
          checkoutSessionId: session.id,
          stripeEventId: event.id,
          consumeTrial: trialEvidence.trialStarted,
          nowMs: event.created * 1_000,
        });

        await upsertBillingAccount({
          accountId: session.customer as string,
          uid,
          email: (session as any).customer_details?.email || null,
          name: (session as any).customer_details?.name || null,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subId || (session.subscription as string),
          plan: entitlementPlan,
          status,
          billingInterval: interval === 'year' ? 'year' : 'month',
          recurringAmountCents: amount,
          recurringCurrency: currency,
          stripePriceId: priceId,
          taxStatus: (session as any).automatic_tax?.status || null,
        });
        await appendLedgerEntry({
          accountId: session.customer as string,
          uid,
          stripeCustomerId: session.customer as string,
          stripeObjectId: session.id,
          stripeEventId: event.id,
          type: 'checkout',
          status,
          amount,
          currency,
          taxAmount: Number((session as any).total_details?.amount_tax || 0),
          occurredAt: toIso(event.created),
          source: 'stripe_webhook',
          description: 'Checkout session completed in Stripe',
          links: {
            customer: stripeDashboardUrl('customers', session.customer as string),
            ...(subId ? { subscription: stripeDashboardUrl('subscriptions', subId) } : {}),
          },
          metadata: {
            plan,
            interval,
            mode: session.mode,
            checkoutSource,
            sonaPurchaseContractStatus: purchaseContract.status,
            sonaPurchaseContractFingerprint: purchaseContract.contract?.fingerprint || null,
            stripePlanEvidenceStatus: planResolution.status,
            stripeTrialPolicyStatus: trialEvidence.status,
            stripeTrialPolicyVersion: trialEvidence.offer?.policyVersion || null,
            trialEligibleAtCheckout: trialEvidence.offer?.eligible ?? null,
            trialStarted: trialEvidence.trialStarted,
            trialWindowValid: trialEvidence.trialWindowValid,
            trialPolicyQuarantined,
          },
        });
        if (!trialPolicyQuarantined) {
          await recordSonaCheckoutConversion(getAdminDb(), {
            uid,
            stripeEventId: event.id,
            checkoutSessionId: session.id,
            plan,
            interval,
            checkoutValueCents: checkoutAmountCents,
            currency,
            occurredAt: toIso(event.created),
            checkoutSource,
          });
        }

        console.log(`[stripe] checkout.completed uid=${uid.slice(0, 8)}… plan=${plan}`);
        monitor.info(trialPolicyQuarantined ? 'Trial Quarantined' : 'New Subscription', `Plan: ${plan}${status === 'trialing' ? ' (trialing)' : ''}`, [
          { name: 'UID', value: uid.slice(0, 8) + '…' },
          { name: 'Plan', value: plan },
          { name: 'Status', value: status },
          { name: 'Amount', value: `$${(amount / 100).toFixed(2)}` },
        ]);

        const customerEmail = (session as any).customer_details?.email;
        if (customerEmail && entitlementPlan !== 'free') {
          triggerReferralReward(uid, customerEmail).catch(() => {});
          const customerName = (session as any).customer_details?.name || customerEmail.split('@')[0];
          queueBillingEmailAndLog({
            accountId: session.customer as string,
            uid,
            email: customerEmail,
            subject: 'Your subscription is active',
            bodyPreview: `${plan} subscription confirmed through Stripe.`,
            template: 'subscription_confirmed',
            sentBy: 'stripe_webhook',
          }, idempotencyKey => sendSubscriptionEmailResult(
            customerEmail,
            customerName,
            plan,
            interval,
            priceDisplay,
            { idempotencyKey },
          ), event.id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Handles Stripe Elements flow (subscription created with default_incomplete)
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string;
        if (!subscriptionId || !invoice.customer) break;

        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const customer = await getStripe().customers.retrieve(invoice.customer as string) as Stripe.Customer;
        const uid = verifiedWebhookUid(customer, subscription);
        if (!uid) {
          throw new Error(`Invoice ${invoice.id} subscription owner could not be verified.`);
        }

        // Get subscription to read interval and plan from metadata
        const subscriptionPrice = subscription.items?.data?.[0]?.price;
        const interval = subscriptionPrice?.recurring?.interval || subscription.metadata?.interval || 'month';

        const invoicePriceId = (invoice as any).lines?.data?.[0]?.price?.id;
        const planResolution = resolveStripePlanFromConfiguredPrice({
          priceId: subscriptionPrice?.id || invoicePriceId,
          metadataPlan: subscription.metadata?.plan,
          proPriceIds: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID],
          studioPriceIds: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
        });
        if (!planResolution.plan) {
          throw new Error(`Invoice ${invoice.id} price could not be mapped to a configured plan (${planResolution.status}).`);
        }
        const subPlan = planResolution.plan;
        const subscriptionStatus = subscription.status;
        const lifecycleTrial = resolveStripeSubscriptionTrialState(subscription);
        const entitlementPlan = ['active', 'trialing'].includes(subscriptionStatus) && !lifecycleTrial.quarantined
          ? subPlan
          : 'free';
        if (lifecycleTrial.quarantined) {
          monitor.critical('Stripe Trial Policy Conflict', `Invoice ${invoice.id} has ${lifecycleTrial.evidence.status} trial evidence.`);
        }

        const subscriptionWrite = await writeSubscription(uid, {
          plan: entitlementPlan,
          status: subscriptionStatus,
          stripeCustomerId: invoice.customer as string,
          stripeSubscriptionId: subscriptionId,
          interval,
          amount: subscriptionPrice?.unit_amount ?? invoice.amount_paid,
          currency: subscriptionPrice?.currency || invoice.currency,
          priceId: subscriptionPrice?.id || null,
          billingInterval: interval === 'year' ? 'year' : 'month',
          recurringAmountCents: subscriptionPrice?.unit_amount ?? invoice.amount_paid,
          recurringCurrency: subscriptionPrice?.currency || invoice.currency,
          stripePriceId: subscriptionPrice?.id || null,
          stripeTrialPolicyStatus: lifecycleTrial.evidence.status,
          stripeTrialPolicyVersion: lifecycleTrial.evidence.offer?.policyVersion || null,
          trialEligibleAtCheckout: lifecycleTrial.evidence.offer?.eligible ?? null,
          trialStarted: lifecycleTrial.evidence.trialStarted,
          trialWindowValid: lifecycleTrial.evidence.trialWindowValid,
          trialPolicyQuarantined: lifecycleTrial.quarantined,
          stripeCheckoutEvidenceVerified: false,
          trialPolicyPendingCheckout: subscriptionStatus === 'trialing',
          canceledAt: entitlementPlan === 'free' && !lifecycleTrial.quarantined ? FieldValue.serverTimestamp() : null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, event, subscriptionId, subscription.created);
        if (!subscriptionWrite.resumeSideEffects) {
          monitor.warn('Stripe Subscription State Ignored', `${event.type} ${event.id} was ${subscriptionWrite.reason}.`);
          break;
        }

        await syncCustomerAccount(getStripe(), invoice.customer as string, {
          uid,
          stripeSubscriptionId: subscriptionId,
          stripeLatestInvoiceId: invoice.id,
          plan: entitlementPlan,
          status: subscriptionStatus,
        });
        await postInvoiceToLedger(invoice, event.id);
        await recordSonaPaidInvoice(getAdminDb(), {
          uid,
          stripeEventId: event.id,
          invoiceId: invoice.id,
          paymentReferenceId: invoicePaymentReference(invoice),
          plan: subPlan,
          billingInterval: interval === 'year' ? 'year' : 'month',
          billingReason: invoice.billing_reason || null,
          amountPaidCents: invoice.amount_paid,
          currency: invoice.currency,
          occurredAt: toIso(event.created),
        });

        console.log(`[stripe] invoice.paid uid=${uid.slice(0, 8)}… plan=${subPlan} interval=${interval}`);
        monitor.info('Invoice Paid', `Renewal for ${subPlan}`, [
          { name: 'UID', value: uid.slice(0, 8) + '…' },
          { name: 'Plan', value: subPlan as string },
          { name: 'Amount', value: `$${((invoice.amount_paid ?? 0) / 100).toFixed(2)}` },
        ]);
        break;
      }

      case 'invoice.payment_failed':
      case 'invoice.finalized': {
        const invoice = event.data.object as Stripe.Invoice;
        await postInvoiceToLedger(
          invoice,
          event.id,
          'stripe_webhook',
          event.type === 'invoice.payment_failed' ? 'invoice_failed' : 'invoice_finalized',
        );
        if (event.type === 'invoice.payment_failed') {
          const customerId = objectId(invoice.customer);
          if (!customerId) {
            throw new Error(`Failed invoice ${invoice.id} is missing its Stripe customer.`);
          }
          if (customerId) {
            const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
            const failedSubscriptionId = objectId((invoice as any).subscription);
            const failedSubscription = failedSubscriptionId
              ? await getStripe().subscriptions.retrieve(failedSubscriptionId)
              : null;
            const uid = verifiedWebhookUid(customer, failedSubscription);
            if (failedSubscriptionId && !uid) {
              throw new Error(`Failed invoice ${invoice.id} subscription owner could not be verified.`);
            }
            if (uid && failedSubscriptionId) {
              const subscriptionWrite = await writeSubscription(uid, {
                status: 'past_due',
                stripeCustomerId: customerId,
                updatedAt: FieldValue.serverTimestamp(),
              }, event, failedSubscriptionId, failedSubscription?.created || null);
              if (!subscriptionWrite.resumeSideEffects) {
                monitor.warn('Stripe Subscription State Ignored', `${event.type} ${event.id} was ${subscriptionWrite.reason}.`);
                break;
              }
            }
            if (customer.email) {
              const subject = 'We could not process your payment';
              const body = 'Stripe reported that your latest subscription payment did not go through. Please update your billing method in settings to keep access active.';
              queueBillingEmailAndLog({
                accountId: customerId,
                uid: uid || null,
                email: customer.email,
                subject,
                bodyPreview: body,
                template: 'payment_failed',
                sentBy: 'stripe_webhook',
              }, idempotencyKey => sendCustomEmailResult(
                customer.email!,
                subject,
                body,
                'Update billing',
                '/suite/settings?tab=subscription',
                { idempotencyKey },
              ), event.id);
            }
          }
          monitor.warn('Invoice Payment Failed', `Invoice ${invoice.id}`, [
            { name: 'Customer', value: customerId || 'unknown' },
            { name: 'Amount', value: `$${((invoice.amount_due || 0) / 100).toFixed(2)}` },
          ]);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = await getStripe().subscriptions.retrieve(eventSubscription.id);
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        const uid = verifiedWebhookUid(customer, subscription);
        if (!uid) {
          throw new Error(`Subscription ${subscription.id} owner could not be verified.`);
        }

        const status = subscription.status; // active, trialing, past_due, canceled, etc.

        const subPriceId = subscription.items?.data?.[0]?.price?.id;
        const subscriptionPrice = subscription.items?.data?.[0]?.price;
        const planResolution = resolveStripePlanFromConfiguredPrice({
          priceId: subPriceId,
          metadataPlan: subscription.metadata?.plan,
          proPriceIds: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID],
          studioPriceIds: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
        });
        if (!planResolution.plan) {
          throw new Error(`Subscription ${subscription.id} price could not be mapped to a configured plan (${planResolution.status}).`);
        }
        const updPlan = planResolution.plan;
        if (planResolution.status === 'metadata_conflict') {
          monitor.critical('Stripe Plan Metadata Conflict', `Subscription ${subscription.id} metadata disagreed with price ${subPriceId}.`);
        }

        const lifecycleTrial = resolveStripeSubscriptionTrialState(subscription);
        if (lifecycleTrial.quarantined) {
          monitor.critical('Stripe Trial Policy Conflict', `Subscription ${subscription.id} has ${lifecycleTrial.evidence.status} trial evidence.`);
        }
        const subscriptionWrite = await writeSubscription(uid, {
          plan: ['active', 'trialing'].includes(status) && !lifecycleTrial.quarantined ? updPlan : 'free',
          status,
          stripeSubscriptionId: subscription.id,
          stripeTrialPolicyStatus: lifecycleTrial.evidence.status,
          stripeTrialPolicyVersion: lifecycleTrial.evidence.offer?.policyVersion || null,
          trialEligibleAtCheckout: lifecycleTrial.evidence.offer?.eligible ?? null,
          trialStarted: lifecycleTrial.evidence.trialStarted,
          trialWindowValid: lifecycleTrial.evidence.trialWindowValid,
          trialPolicyQuarantined: lifecycleTrial.quarantined,
          stripeCheckoutEvidenceVerified: false,
          trialPolicyPendingCheckout: status === 'trialing',
          ...(subscriptionPrice ? {
            interval: subscriptionPrice.recurring?.interval || subscription.metadata?.interval || 'month',
            amount: subscriptionPrice.unit_amount,
            currency: subscriptionPrice.currency,
            priceId: subscriptionPrice.id,
            billingInterval: subscriptionPrice.recurring?.interval === 'year' ? 'year' : 'month',
            recurringAmountCents: subscriptionPrice.unit_amount,
            recurringCurrency: subscriptionPrice.currency,
            stripePriceId: subscriptionPrice.id,
          } : {}),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toISOString()
            : null,
          updatedAt: FieldValue.serverTimestamp(),
        }, event, subscription.id, subscription.created);
        if (!subscriptionWrite.resumeSideEffects) {
          monitor.warn('Stripe Subscription State Ignored', `${event.type} ${event.id} was ${subscriptionWrite.reason}.`);
          break;
        }

        await syncCustomerAccount(getStripe(), customerId, {
          uid,
          email: customer.email || null,
          name: customer.name || null,
          stripeSubscriptionId: subscription.id,
          plan: updPlan,
          status,
        });
        await appendLedgerEntry({
          accountId: customerId,
          uid,
          stripeCustomerId: customerId,
          stripeObjectId: subscription.id,
          stripeEventId: event.id,
          type: 'subscription_updated',
          status,
          amount: subscription.items?.data?.[0]?.price?.unit_amount || 0,
          currency: subscription.items?.data?.[0]?.price?.currency || 'usd',
          taxAmount: 0,
          occurredAt: toIso((subscription as any).created || event.created),
          source: 'stripe_webhook',
          description: `Subscription updated: ${status}`,
          links: { subscription: stripeDashboardUrl('subscriptions', subscription.id), customer: stripeDashboardUrl('customers', customerId) },
          metadata: { plan: updPlan, cancelAtPeriodEnd: subscription.cancel_at_period_end },
        });

        console.log(`[stripe] subscription.updated uid=${uid.slice(0, 8)}… plan=${updPlan} status=${status}`);

        // Detect plan change and send notification email
        const prevAttrs = (event.data as any).previous_attributes;
        if (prevAttrs && status === 'active' && customer.email) {
          const prevPriceId = prevAttrs?.items?.data?.[0]?.price?.id;
          if (prevPriceId && prevPriceId !== subPriceId) {
            const previousResolution = resolveStripePlanFromConfiguredPrice({
              priceId: prevPriceId,
              metadataPlan: null,
              proPriceIds: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID],
              studioPriceIds: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID],
            });
            const prevPlan = previousResolution.plan;
            if (prevPlan && prevPlan !== updPlan) {
              const changeName = customer.name || customer.email.split('@')[0];
              queueBillingEmailAndLog({
                accountId: customerId,
                uid,
                email: customer.email,
                subject: `Your plan changed to ${updPlan}`,
                bodyPreview: `Plan changed from ${prevPlan} to ${updPlan}.`,
                template: 'plan_changed',
                sentBy: 'stripe_webhook',
              }, idempotencyKey => sendPlanChangeEmailResult(
                customer.email!,
                changeName,
                prevPlan,
                updPlan,
                { idempotencyKey },
              ), event.id);
              monitor.info('Plan Changed', `${prevPlan} → ${updPlan}`, [
                { name: 'UID', value: uid.slice(0, 8) + '…' },
              ]);
            }
          }
        }

        if (customer.email && subscription.cancel_at_period_end && prevAttrs?.cancel_at_period_end === false) {
          const cancelName = customer.name || customer.email.split('@')[0];
          const accessEndsAt = (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : undefined;
          queueBillingEmailAndLog({
            accountId: customerId,
            uid,
            email: customer.email,
            subject: 'Your subscription cancellation is scheduled',
            bodyPreview: `Cancellation scheduled. Access ends ${accessEndsAt || 'at period end'}.`,
            template: 'subscription_cancel_scheduled',
            sentBy: 'stripe_webhook',
          }, idempotencyKey => sendCancellationEmailResult(
            customer.email!,
            cancelName,
            accessEndsAt,
            { idempotencyKey },
          ), event.id);
          monitor.info('Subscription Cancel Scheduled', 'User will retain access through the billing period', [
            { name: 'UID', value: uid.slice(0, 8) + '…' },
            { name: 'Access ends', value: accessEndsAt || 'period end' },
          ]);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        const uid = verifiedWebhookUid(customer, subscription);
        if (!uid) {
          throw new Error(`Canceled subscription ${subscription.id} owner could not be verified.`);
        }

        const subscriptionWrite = await writeSubscription(uid, {
          plan: 'free',
          status: 'canceled',
          canceledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, event, subscription.id, subscription.created);
        if (!subscriptionWrite.resumeSideEffects) {
          monitor.warn('Stripe Subscription State Ignored', `${event.type} ${event.id} was ${subscriptionWrite.reason}.`);
          break;
        }

        await upsertBillingAccount({
          accountId: customerId,
          uid,
          email: customer.email || null,
          name: customer.name || null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan: 'free',
          status: 'canceled',
        });
        await appendLedgerEntry({
          accountId: customerId,
          uid,
          stripeCustomerId: customerId,
          stripeObjectId: subscription.id,
          stripeEventId: event.id,
          type: 'subscription_canceled',
          status: 'canceled',
          amount: 0,
          currency: subscription.items?.data?.[0]?.price?.currency || 'usd',
          taxAmount: 0,
          occurredAt: toIso((subscription as any).canceled_at || event.created),
          source: 'stripe_webhook',
          description: 'Subscription canceled in Stripe',
          links: { subscription: stripeDashboardUrl('subscriptions', subscription.id), customer: stripeDashboardUrl('customers', customerId) },
        });

        console.log(`[stripe] subscription.deleted uid=${uid.slice(0, 8)}…`);
        monitor.warn('Subscription Canceled', 'User downgraded to free', [
          { name: 'UID', value: uid.slice(0, 8) + '…' },
        ]);

        // Send cancellation email
        if (customer.email) {
          const cancelName = customer.name || customer.email.split('@')[0];
          const accessEndsAt = (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : undefined;
          queueBillingEmailAndLog({
            accountId: customerId,
            uid,
            email: customer.email,
            subject: 'Your subscription has been canceled',
            bodyPreview: `Subscription canceled. Access ends ${accessEndsAt || 'at period end'}.`,
            template: 'subscription_canceled',
            sentBy: 'stripe_webhook',
          }, idempotencyKey => sendCancellationEmailResult(
            customer.email!,
            cancelName,
            accessEndsAt,
            { idempotencyKey },
          ), event.id);
        }
        break;
      }

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        const refund = event.data.object as Stripe.Refund;
        const refundLedger = await postRefundToLedger(refund, event.id);
        if (refund.status === 'succeeded' && refundLedger.account.uid) {
          await recordSonaRefund(getAdminDb(), {
            uid: refundLedger.account.uid,
            stripeEventId: event.id,
            refundId: refund.id,
            paymentReferenceId: refundPaymentReference(refund),
            amountRefundedCents: refund.amount,
            currency: refund.currency || 'usd',
            occurredAt: toIso(refund.created),
          });
        }
        if (event.type === 'refund.failed') {
          monitor.warn('Refund Failed', refund.id, [
            { name: 'Refund', value: refund.id },
            { name: 'Amount', value: `$${((refund.amount || 0) / 100).toFixed(2)}` },
          ]);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const refunds = charge.refunds?.data || [];
        await Promise.all(refunds.map(async refund => {
          const refundLedger = await postRefundToLedger(refund, event.id);
          if (refund.status === 'succeeded' && refundLedger.account.uid) {
            await recordSonaRefund(getAdminDb(), {
              uid: refundLedger.account.uid,
              stripeEventId: event.id,
              refundId: refund.id,
              paymentReferenceId: refundPaymentReference(refund),
              amountRefundedCents: refund.amount,
              currency: refund.currency || charge.currency || 'usd',
              occurredAt: toIso(refund.created),
            });
          }
        }));
        break;
      }

      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        await postDisputeToLedger(dispute, event.id);
        const severity = event.type === 'charge.dispute.closed' ? 'warn' : 'critical';
        monitor[severity]('Stripe Dispute', `${dispute.status}: ${dispute.reason || 'no reason'}`, [
          { name: 'Dispute', value: dispute.id },
          { name: 'Amount', value: `$${((dispute.amount || 0) / 100).toFixed(2)}` },
          { name: 'Due', value: (dispute as any).evidence_details?.due_by ? new Date((dispute as any).evidence_details.due_by * 1000).toISOString() : 'n/a' },
        ]);
        break;
      }

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const customerId = objectId(paymentIntent.customer);
        const account = customerId ? await syncCustomerAccount(getStripe(), customerId) : await upsertBillingAccount({ uid: paymentIntent.metadata?.firebaseUid || null });
        await appendLedgerEntry({
          accountId: account?.accountId || customerId || paymentIntent.id,
          uid: account?.uid || paymentIntent.metadata?.firebaseUid || null,
          stripeCustomerId: customerId,
          stripeObjectId: paymentIntent.id,
          stripeEventId: event.id,
          type: event.type === 'payment_intent.succeeded' ? 'payment_succeeded' : 'payment_failed',
          status: paymentIntent.status,
          amount: paymentIntent.amount_received || paymentIntent.amount || 0,
          currency: paymentIntent.currency || 'usd',
          taxAmount: 0,
          occurredAt: toIso(paymentIntent.created || event.created),
          source: 'stripe_webhook',
          description: event.type === 'payment_intent.succeeded' ? 'Payment succeeded in Stripe' : 'Payment failed in Stripe',
          links: { payment: stripeDashboardUrl('payments', paymentIntent.latest_charge as string || paymentIntent.id) },
          metadata: { failureMessage: paymentIntent.last_payment_error?.message || null },
        });
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        const custId = sub.customer as string;
        const cust = await getStripe().customers.retrieve(custId) as Stripe.Customer;
        const uid = verifiedWebhookUid(cust, sub);
        if (!uid) break;
        monitor.info('Trial Ending Soon', '3 days left', [
          { name: 'UID', value: uid.slice(0, 8) + '…' },
          { name: 'Email', value: cust.email || 'unknown' },
          { name: 'Auto-Renew', value: sub.cancel_at_period_end ? 'No' : 'Yes' },
        ]);

        if (cust.email) {
          const trialName = cust.name || cust.email.split('@')[0];
          const daysLeft = sub.trial_end
            ? Math.max(1, Math.ceil((sub.trial_end * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
            : 3;
          queueBillingEmailAndLog({
            accountId: custId,
            uid,
            email: cust.email,
            subject: 'Your trial is ending soon',
            bodyPreview: `Trial ending in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
            template: 'trial_ending',
            sentBy: 'stripe_webhook',
          }, idempotencyKey => sendTrialEndingEmailResult(
            cust.email!,
            trialName,
            daysLeft,
            { idempotencyKey },
          ), event.id);
        }
        break;
      }

      default:
        break;
    }
    await markStripeEventProcessed(event.id, 'processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    await markStripeEventProcessed(event.id, 'failed', String(error)).catch(() => {});
    monitor.critical('Stripe Webhook Error', String(error));
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
