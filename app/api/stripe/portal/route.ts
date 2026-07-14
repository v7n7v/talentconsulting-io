/**
 * Stripe Customer Portal API
 * Creates a portal session for managing subscriptions.
 * POST /api/stripe/portal
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { guardApiRoute } from '@/lib/api-auth';
import { monitor } from '@/lib/monitor';
import { getAllowedStripeReturnOrigin } from '@/lib/stripe-return-url';
import { selectStripeCustomerForUser } from '@/lib/stripe-account-selection';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }
    const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });

    const { email, uid } = guard.user;

    const customers = await stripe.customers.list({ email: email!, limit: 10 });
    const selectedCustomer = selectStripeCustomerForUser(
      customers.data.map(customer => ({ id: customer.id, firebaseUid: customer.metadata?.firebaseUid || null })),
      uid,
    );
    if (!selectedCustomer) {
      return NextResponse.json(
        { error: 'No active billing account found. Choose a plan to start.' },
        { status: 404 }
      );
    }

    const origin = getAllowedStripeReturnOrigin(req.headers.get('origin'));

    const session = await stripe.billingPortal.sessions.create({
      customer: selectedCustomer.customerId,
      return_url: `${origin}/suite/settings?tab=subscription&billing=returned`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal session error:', error);
    monitor.critical('Tool: stripe/portal', String(error));
    return NextResponse.json(
      { error: 'Billing is unavailable right now. Please try again.' },
      { status: 500 }
    );
  }
}
