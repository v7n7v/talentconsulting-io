import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getStripeRuntimeReadiness } from '@/lib/billing/stripe-runtime-readiness';
import { probeJobSupplyHealth } from '@/lib/job-supply-health';
import { getJobNotificationDeliveryReadinessForStore } from '@/lib/job-notification-readiness';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const db = getAdminDb();
  const stripeCheckout = getStripeRuntimeReadiness();
  const stripeCheckoutConfigurationReady = stripeCheckout.configurationReady;
  const jobSupply = await probeJobSupplyHealth();
  const notifications = await getJobNotificationDeliveryReadinessForStore(db);
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    stripeCheckout,
    jobSupply: {
      status: jobSupply.status,
      preparationReady: jobSupply.preparationReady,
      everJobs: jobSupply.preparationReady,
      safeSources: jobSupply.safeSources,
      missing: jobSupply.missing,
    },
    notifications: {
      name: 'Resend Email and Receipts',
      canSendTrackedEmail: notifications.canSendTrackedEmail,
      missing: notifications.missing,
    },
    operationalConfiguration: {
      cronConfigured: Boolean(process.env.CRON_SECRET),
      sonaReceiptSigningConfigured: Boolean(process.env.SONA_PREFLIGHT_SECRET || process.env.CRON_SECRET),
      costEvidenceCache: 'admin/cache_costs_v8',
      stripeCheckoutConfigurationReady,
    },
  }, { headers: PRIVATE_HEADERS });
}
