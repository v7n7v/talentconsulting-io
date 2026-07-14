import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  normalizeStripePendingCheckoutReceipt,
  readStripeCheckoutGuard,
  releaseStripeCheckout,
} from '@/lib/billing/stripe-checkout-reservation';
import { reconcileStripeCheckoutSession } from '@/lib/billing/stripe-checkout-reconciliation';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
type PublicStatus = 'idle' | 'pending' | 'open' | 'complete' | 'expired';

function statusResponse(status: PublicStatus) {
  return NextResponse.json({ status }, { headers: PRIVATE_HEADERS });
}

function pendingReceipt(guard: Awaited<ReturnType<typeof readStripeCheckoutGuard>>) {
  return normalizeStripePendingCheckoutReceipt(guard);
}

export async function GET(req: NextRequest) {
  const guardResult = await guardApiRoute(req, { rateLimit: 20, skipUsageCap: true });
  if (guardResult.error) return guardResult.error;
  const db = getAdminDb();
  const checkoutGuard = await readStripeCheckoutGuard(db, guardResult.user.uid);
  if (!checkoutGuard?.activeReservationId) return statusResponse('idle');

  const reservationExpiresAtMs = Date.parse(checkoutGuard.reservationExpiresAt || '');
  const reservationStartedAtMs = Date.parse(checkoutGuard.reservationStartedAt || '');
  const reservationExpired = !Number.isFinite(reservationExpiresAtMs) || reservationExpiresAtMs <= Date.now();
  const receipt = pendingReceipt(checkoutGuard);
  if (receipt === undefined || !guardResult.user.email || !Number.isFinite(reservationStartedAtMs) || !process.env.STRIPE_SECRET_KEY) {
    return statusResponse('pending');
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0,
  });
  const result = await reconcileStripeCheckoutSession(stripe, {
    uid: guardResult.user.uid,
    email: guardResult.user.email,
    reservationId: checkoutGuard.activeReservationId,
    reservationStartedAtMs,
    receipt,
  });
  if (result.status === 'expired' || (result.status === 'not_found' && reservationExpired)) {
    await releaseStripeCheckout(db, guardResult.user.uid, checkoutGuard.activeReservationId);
  }
  if (result.status === 'not_found' || result.status === 'ambiguous') return statusResponse('pending');
  return statusResponse(result.status);
}
