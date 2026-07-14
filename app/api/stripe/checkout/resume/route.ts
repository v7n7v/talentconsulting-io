import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  normalizeStripePendingCheckoutReceipt,
  readStripeCheckoutGuard,
  recordStripePendingCheckout,
  releaseStripeCheckout,
} from '@/lib/billing/stripe-checkout-reservation';
import { findStripeCheckoutSession } from '@/lib/billing/stripe-checkout-reconciliation';
import { buildStripeCheckoutResumePayload } from '@/lib/billing/stripe-checkout-resume';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  const auth = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000, skipUsageCap: true });
  if (auth.error) return auth.error;
  const db = getAdminDb();
  const checkoutGuard = await readStripeCheckoutGuard(db, auth.user.uid);
  if (!checkoutGuard?.activeReservationId) {
    return NextResponse.json({ status: 'idle' }, { headers: PRIVATE_HEADERS });
  }
  const receipt = normalizeStripePendingCheckoutReceipt(checkoutGuard);
  const reservationStartedAtMs = Date.parse(checkoutGuard.reservationStartedAt || '');
  const reservationExpiresAtMs = Date.parse(checkoutGuard.reservationExpiresAt || '');
  if (receipt === undefined || !auth.user.email || !Number.isFinite(reservationStartedAtMs) || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ status: 'pending', recovery: 'retry' }, { status: 409, headers: PRIVATE_HEADERS });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0,
  });
  const result = await findStripeCheckoutSession(stripe, {
    uid: auth.user.uid,
    email: auth.user.email,
    reservationId: checkoutGuard.activeReservationId,
    reservationStartedAtMs,
    receipt,
  });

  if (result.status === 'expired' || (result.status === 'not_found' && reservationExpiresAtMs <= Date.now())) {
    await releaseStripeCheckout(db, auth.user.uid, checkoutGuard.activeReservationId);
    return NextResponse.json({ status: 'expired' }, { headers: PRIVATE_HEADERS });
  }
  if (result.status !== 'open' || !result.session) {
    return NextResponse.json({ status: result.status === 'complete' ? 'complete' : 'pending', recovery: 'retry' }, { headers: PRIVATE_HEADERS });
  }
  const payload = buildStripeCheckoutResumePayload(result.session);
  if (!payload || !receipt) {
    return NextResponse.json({ status: 'pending', recovery: 'restart' }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const recorded = await recordStripePendingCheckout(db, {
    uid: auth.user.uid,
    reservationId: checkoutGuard.activeReservationId,
    checkoutSessionId: result.session.id,
    mode: receipt.mode,
    plan: receipt.plan,
    interval: receipt.interval,
    expiresAtMs: result.session.expires_at * 1_000,
  });
  if (!recorded.recorded) {
    return NextResponse.json({ status: 'pending', recovery: 'retry' }, { status: 409, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS });
}
