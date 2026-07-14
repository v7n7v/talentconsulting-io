import { NextRequest, NextResponse } from 'next/server';
import { requireBillingAdmin } from '@/lib/admin-billing-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getBillingPrices } from '@/lib/billing-prices';
import { buildAdminPlanEconomics } from '@/lib/sona/admin-plan-economics';
import {
  buildSonaPricingOptionsDecision,
  compareSonaPricingOptionsDecisionReplay,
  parseSonaPricingOptionsDecisionInput,
  publicSonaPricingOptionsDecision,
} from '@/lib/sona/pricing-options-decision';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  const admin = await requireBillingAdmin(req);
  if (admin.error) return admin.error;
  const input = parseSonaPricingOptionsDecisionInput(await req.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: 'Invalid pricing review decision.' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const prices = await getBillingPrices({ force: true, skipCommercialReadiness: true });
  const economics = await buildAdminPlanEconomics(prices);
  const decision = buildSonaPricingOptionsDecision(input, economics.pricingOptionsMemo, admin.user!.email || admin.user!.uid);
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, code: decision.code }, { status: decision.status, headers: PRIVATE_HEADERS });
  }

  const db = getAdminDb();
  const ref = db.collection('admin').doc('billing').collection('pricingOptionsDecisions').doc(input.evidenceFingerprint);
  const record = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
    const replay = compareSonaPricingOptionsDecisionReplay(existing, input, admin.user!.email || admin.user!.uid);
    if (!replay.ok) throw new Error(replay.code);
    if (replay.alreadyRecorded) return replay.record;
    transaction.create(ref, decision.record);
    return decision.record;
  }).catch(error => {
    if (error instanceof Error && error.message === 'DECISION_CONFLICT') return null;
    throw error;
  });
  if (!record) {
    return NextResponse.json({ error: 'A different decision already exists for this evidence.', code: 'DECISION_CONFLICT' }, { status: 409, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json({ decision: publicSonaPricingOptionsDecision(record) }, { headers: PRIVATE_HEADERS });
}
