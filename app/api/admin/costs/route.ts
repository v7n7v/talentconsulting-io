import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { isMasterAccount } from '@/lib/pricing-tiers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { calculateVerifiedMrr } from '@/lib/billing-metrics';
import { getBillingPrices } from '@/lib/billing-prices';
import { buildAdminPlanEconomics } from '@/lib/sona/admin-plan-economics';
import { getSonaEconomicsSnapshot } from '@/lib/sona/economics';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const CACHE_TTL_MS = 60 * 60 * 1_000;

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req);
  if (guard.error) return guard.error;
  if (!isMasterAccount(guard.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: PRIVATE_HEADERS });
  }

  const db = getAdminDb();
  const cacheRef = db.collection('admin').doc('cache_costs_v8');
  const cached = await cacheRef.get().catch(() => null);
  if (cached?.exists && Date.now() - Number(cached.data()?.lastUpdated || 0) < CACHE_TTL_MS) {
    const billingPrices = await getBillingPrices({ force: true, skipCommercialReadiness: true });
    const planEconomics = await buildAdminPlanEconomics(billingPrices);
    return NextResponse.json({ ...cached.data()!.payload, billingPrices, planEconomics }, { headers: PRIVATE_HEADERS });
  }

  const auth = getAdminAuth();
  const users: any[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const subscriptionSnapshot = await db.collectionGroup('subscription').get();
  const verifiedRevenue = calculateVerifiedMrr(subscriptionSnapshot.docs.map(doc => doc.data()));
  const activeUsers = users.filter(user => {
    const last = Date.parse(user.metadata.lastSignInTime || '');
    return Number.isFinite(last) && last >= Date.now() - 30 * 86_400_000;
  }).length;

  let voiceSeconds = 0;
  let writtenWords = 0;
  let invocations = 0;
  await Promise.all(users.slice(0, 500).map(async user => {
    const [voice, writing, lifetime] = await Promise.all([
      db.collection('users').doc(user.uid).collection('usage').doc('voice_monthly').get(),
      db.collection('users').doc(user.uid).collection('usage').doc('writing_monthly').get(),
      db.collection('users').doc(user.uid).collection('usage').doc('lifetime').get(),
    ]);
    voiceSeconds += Number(voice.data()?.usedSeconds || 0);
    writtenWords += Number(writing.data()?.usedWords || 0);
    const usage = lifetime.data() || {};
    invocations += Number(usage.morphs || 0) + Number(usage.gauntlets || 0) + Number(usage.resumeChecks || 0);
  }));

  const geminiVoice = voiceSeconds * 0.000005;
  const geminiText = writtenWords * 0.0000015;
  const groq = invocations * 0.00005;
  const cloudRun = 5 + activeUsers * 0.05;
  const firebase = ((activeUsers * 2000) / 100000) * 0.036;
  const upstash = ((activeUsers * 500) / 100000) * 0.20;
  const aiTotal = geminiVoice + geminiText + groq;
  const infraTotal = cloudRun + firebase + upstash;
  const totalCost = aiTotal + infraTotal;
  const mrr = verifiedRevenue.mrrUsd;
  const billingPrices = await getBillingPrices({ force: true, skipCommercialReadiness: true });
  const planEconomics = await buildAdminPlanEconomics(billingPrices);
  const sonaEconomics = await getSonaEconomicsSnapshot(db, { windowDays: 30, sampleLimit: 1000 });
  const payload = {
    mrr,
    verifiedRevenue,
    totalCost: Number(totalCost.toFixed(2)),
    netProfit: Number((mrr - totalCost).toFixed(2)),
    profitMargin: mrr ? Number((((mrr - totalCost) / mrr) * 100).toFixed(1)) : 0,
    costPerUser: activeUsers ? Number((totalCost / activeUsers).toFixed(3)) : 0,
    activeUsers,
    breakdown: {
      ai: { geminiVoice, geminiText, groq, total: Number(aiTotal.toFixed(2)) },
      infra: { cloudRun, firebase, upstash, total: Number(infraTotal.toFixed(2)) },
    },
    metrics: { voiceSeconds, writtenWords, invocations },
    billingPrices,
    planEconomics,
    sonaEconomics,
  };
  await cacheRef.set({ lastUpdated: Date.now(), payload }).catch(() => undefined);
  return NextResponse.json(payload, { headers: PRIVATE_HEADERS });
}
