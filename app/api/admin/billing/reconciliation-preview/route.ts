import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { listBillingAccounts, previewCustomerBillingEvidence, type BillingAccountRecord } from '@/lib/billing-ledger';

const MAX_PREVIEW_ACCOUNTS = 20;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is unavailable.', writePerformed: false }, { status: 503, headers: PRIVATE_HEADERS });
  }
  const requested = Number(req.nextUrl.searchParams.get('limit') || MAX_PREVIEW_ACCOUNTS);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? Math.floor(requested) : MAX_PREVIEW_ACCOUNTS, 1), MAX_PREVIEW_ACCOUNTS);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover', timeout: 5_000, maxNetworkRetries: 0 });
  const accounts = await listBillingAccounts(limit) as BillingAccountRecord[];
  const previews = [];
  for (const account of accounts) {
    try {
      previews.push(await previewCustomerBillingEvidence(stripe, account));
    } catch {
      previews.push({ accountId: account.accountId, status: 'blocked', missing: ['provider_evidence_unavailable'] });
    }
  }
  return NextResponse.json({ previews, count: previews.length, bounded: true, writePerformed: false }, { headers: PRIVATE_HEADERS });
}
