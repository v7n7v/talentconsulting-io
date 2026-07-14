import 'server-only';
import Stripe from 'stripe';
import {
  buildSonaPaymentEvidencePreview,
  hasVerifiedSonaPaymentEvidence,
  type SonaPaymentEvidencePreview,
} from '@/lib/sona/economics';

export type SonaPaymentEvidenceLookupCode =
  | 'invoice_lookup_failed'
  | 'invoice_payment_lookup_failed'
  | 'invoice_lines_lookup_failed'
  | 'invoice_price_lookup_failed'
  | 'subscription_lookup_failed'
  | 'customer_lookup_failed';

export interface LegacySonaPaymentRecord {
  paymentReferenceId: string;
  uid?: unknown;
  invoiceId?: unknown;
  plan?: unknown;
  currency?: unknown;
  billingInterval?: unknown;
  billingReason?: unknown;
  evidenceStatus?: unknown;
  evidenceVersion?: unknown;
  evidenceSource?: unknown;
  evidenceRepair?: unknown;
}

function objectId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in value) {
    return String((value as { id?: string }).id || '') || null;
  }
  return null;
}

function invoiceLinePriceId(line: Stripe.InvoiceLineItem): string | null {
  return objectId(line.pricing?.price_details?.price)
    || objectId((line as any).price);
}

function invoicePaymentReferences(payment: Stripe.InvoicePayment): string[] {
  return [
    objectId(payment.payment?.payment_intent),
    objectId(payment.payment?.charge),
  ].filter((value): value is string => Boolean(value));
}

export function configuredSonaPaymentPriceIds() {
  return {
    pro: [process.env.STRIPE_PRO_PRICE_ID, process.env.STRIPE_PRO_ANNUAL_PRICE_ID].filter(Boolean) as string[],
    studio: [process.env.STRIPE_STUDIO_PRICE_ID, process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID].filter(Boolean) as string[],
  };
}

export async function inspectSonaPaymentEvidence(
  stripe: Stripe,
  payment: LegacySonaPaymentRecord,
): Promise<{
  preview: SonaPaymentEvidencePreview | null;
  lookupErrors: SonaPaymentEvidenceLookupCode[];
}> {
  const paymentReferenceId = String(payment.paymentReferenceId);
  const invoiceId = typeof payment.invoiceId === 'string' ? payment.invoiceId : null;
  const base = {
    paymentReferenceId,
    uid: typeof payment.uid === 'string' ? payment.uid : null,
    existingPlan: payment.plan,
    existingCurrency: payment.currency,
    existingBillingInterval: payment.billingInterval,
    existingBillingReason: payment.billingReason,
    existingEvidenceVerified: hasVerifiedSonaPaymentEvidence(payment),
    configuredPriceIds: configuredSonaPaymentPriceIds(),
  };
  if (!invoiceId) {
    return {
      preview: buildSonaPaymentEvidencePreview({ ...base, invoiceId: null }),
      lookupErrors: [],
    };
  }

  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(invoiceId);
  } catch (error: any) {
    if (error?.code === 'resource_missing') {
      return {
        preview: buildSonaPaymentEvidencePreview({ ...base, invoiceId, invoiceFound: false }),
        lookupErrors: [],
      };
    }
    return { preview: null, lookupErrors: ['invoice_lookup_failed'] };
  }

  const subscriptionId = objectId((invoice as any).subscription)
    || objectId((invoice as any).parent?.subscription_details?.subscription);
  const customerId = objectId(invoice.customer);
  const [subscriptionLookup, customerLookup, invoicePaymentLookup, invoiceLinesLookup] = await Promise.allSettled([
    subscriptionId ? stripe.subscriptions.retrieve(subscriptionId) : Promise.resolve(null),
    customerId ? stripe.customers.retrieve(customerId) : Promise.resolve(null),
    stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 100 }),
    stripe.invoices.listLineItems(invoiceId, { limit: 100 }),
  ]);
  const subscriptionLookupFailed = subscriptionLookup.status === 'rejected';
  const customerLookupFailed = customerLookup.status === 'rejected';
  const invoicePaymentLookupFailed = invoicePaymentLookup.status === 'rejected';
  const invoiceLinesLookupFailed = invoiceLinesLookup.status === 'rejected';
  const subscription = subscriptionLookup.status === 'fulfilled' ? subscriptionLookup.value : null;
  const customer = customerLookup.status === 'fulfilled' ? customerLookup.value : null;
  const invoicePayments = invoicePaymentLookup.status === 'fulfilled' ? invoicePaymentLookup.value.data : [];
  const invoiceLines = invoiceLinesLookup.status === 'fulfilled' ? invoiceLinesLookup.value.data : [];
  const invoiceLinesComplete = invoiceLinesLookup.status === 'fulfilled'
    && invoiceLinesLookup.value.has_more !== true;
  const lookupErrors: SonaPaymentEvidenceLookupCode[] = [];
  if (subscriptionLookupFailed) lookupErrors.push('subscription_lookup_failed');
  if (customerLookupFailed) lookupErrors.push('customer_lookup_failed');
  if (invoicePaymentLookupFailed) lookupErrors.push('invoice_payment_lookup_failed');
  if (invoiceLinesLookupFailed) lookupErrors.push('invoice_lines_lookup_failed');

  const configuredPriceIds = configuredSonaPaymentPriceIds();
  const invoicePriceIds = [...new Set(invoiceLines.map(invoiceLinePriceId).filter(Boolean))] as string[];
  const invoicePriceEvidenceConflict = invoicePriceIds.length > 1;
  const onlyInvoicePriceId = invoicePriceIds.length === 1 ? invoicePriceIds[0] : null;
  const stripePriceId = onlyInvoicePriceId && (
    configuredPriceIds.pro.includes(onlyInvoicePriceId)
    || configuredPriceIds.studio.includes(onlyInvoicePriceId)
  ) ? onlyInvoicePriceId : null;
  let invoicePrice: Stripe.Price | null = null;
  if (stripePriceId) {
    try {
      invoicePrice = await stripe.prices.retrieve(stripePriceId);
    } catch {
      lookupErrors.push('invoice_price_lookup_failed');
    }
  }
  const paymentReferenceVerified = invoicePayments.some(payment => (
    payment.status === 'paid'
    && invoicePaymentReferences(payment).includes(paymentReferenceId)
  ));

  return {
    preview: buildSonaPaymentEvidencePreview({
      ...base,
      invoiceId,
      invoiceFound: true,
      invoicePaid: invoice.status === 'paid',
      paymentReferenceVerified,
      invoicePriceEvidenceConflict,
      invoiceLinesComplete,
      customerDeleted: Boolean(customer?.deleted),
      customerLookupFailed,
      customerUid: customer && !customer.deleted ? customer.metadata?.firebaseUid || null : null,
      subscriptionLookupFailed,
      subscriptionUid: subscription?.metadata?.firebaseUid || null,
      stripePriceId,
      invoiceCurrency: invoice.currency,
      invoiceBillingReason: invoice.billing_reason,
      subscriptionBillingInterval: invoicePrice?.recurring?.interval,
    }),
    lookupErrors,
  };
}
