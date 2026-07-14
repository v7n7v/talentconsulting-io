/**
 * Admin Stats API — Platform-wide KPI aggregation
 * GET /api/admin/stats
 * 
 * Returns: user counts by tier, MRR estimate, signup trend (14d),
 * active users (7d), top features by usage
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { isMasterAccount } from '@/lib/pricing-tiers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { calculateVerifiedMrr } from '@/lib/billing-metrics';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req);
    if (guard.error) return guard.error;
    if (!isMasterAccount(guard.user.email)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    // Fetch all users from Firebase Auth (paginated, up to 1000)
    const allUsers: {
      uid: string;
      email: string;
      displayName: string;
      createdAt: string;
      lastSignIn: string;
      disabled: boolean;
    }[] = [];

    let pageToken: string | undefined;
    do {
      const result = await auth.listUsers(1000, pageToken);
      for (const u of result.users) {
        allUsers.push({
          uid: u.uid,
          email: u.email || '',
          displayName: u.displayName || '',
          createdAt: u.metadata.creationTime || '',
          lastSignIn: u.metadata.lastSignInTime || '',
          disabled: u.disabled,
        });
      }
      pageToken = result.pageToken;
    } while (pageToken);

    // Fetch subscription tiers for all users
    const tierCounts = { free: 0, pro: 0, studio: 0, admin: 0, disabled: 0 };
    const tierMap: Record<string, string> = {};

    await Promise.all(
      allUsers.map(async (u) => {
        if (u.disabled) {
          tierCounts.disabled++;
          tierMap[u.uid] = 'disabled';
          return;
        }
        if (isMasterAccount(u.email)) {
          tierCounts.admin++;
          tierMap[u.uid] = 'admin';
          return;
        }
        try {
          const subDoc = await db.collection('users').doc(u.uid).collection('subscription').doc('current').get();
          if (subDoc.exists && subDoc.data()?.status === 'active') {
            const plan = subDoc.data()?.plan;
            if (plan === 'studio') { tierCounts.studio++; tierMap[u.uid] = 'studio'; }
            else if (plan === 'pro') { tierCounts.pro++; tierMap[u.uid] = 'pro'; }
            else { tierCounts.free++; tierMap[u.uid] = 'free'; }
          } else {
            tierCounts.free++;
            tierMap[u.uid] = 'free';
          }
        } catch {
          tierCounts.free++;
          tierMap[u.uid] = 'free';
        }
      })
    );

    // MRR is derived only from recurring subscription evidence.
    const subscriptionSnapshot = await db.collectionGroup('subscription').get();
    const verifiedRevenue = calculateVerifiedMrr(subscriptionSnapshot.docs.map(doc => doc.data()));
    const mrr = verifiedRevenue.mrrUsd;

    // Signup trend — last 14 days
    const now = new Date();
    const signupTrend: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = allUsers.filter(u => u.createdAt && u.createdAt.startsWith(dateStr.replace(/-/g, '/'))).length;
      // Firebase returns dates like "Mon, 21 Apr 2026 ..." so parse properly
      signupTrend.push({ date: dateStr, count: 0 });
    }
    // Re-count using proper date parsing
    for (const u of allUsers) {
      if (!u.createdAt) continue;
      const created = new Date(u.createdAt);
      const dateStr = created.toISOString().split('T')[0];
      const entry = signupTrend.find(s => s.date === dateStr);
      if (entry) entry.count++;
    }

    // Active users (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeWeek = allUsers.filter(u => u.lastSignIn && new Date(u.lastSignIn) >= sevenDaysAgo).length;
    const activeToday = allUsers.filter(u => u.lastSignIn && new Date(u.lastSignIn) >= oneDayAgo).length;

    // Top features by aggregated usage (sample first 100 users for speed)
    const featureUsage: Record<string, number> = {
      morphs: 0, gauntlets: 0, flashcards: 0, jdGenerations: 0,
      coverLetters: 0, resumeChecks: 0, linkedinProfiles: 0, writingTools: 0, galleryTools: 0,
    };
    const sampleUsers = allUsers.slice(0, 100);
    await Promise.all(
      sampleUsers.map(async (u) => {
        try {
          const usageDoc = await db.collection('users').doc(u.uid).collection('usage').doc('lifetime').get();
          if (usageDoc.exists) {
            const data = usageDoc.data()!;
            for (const key of Object.keys(featureUsage)) {
              featureUsage[key] += data[key] || 0;
            }
          }
        } catch { /* skip */ }
      })
    );

    // Recent signups (last 5)
    const recentSignups = [...allUsers]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(u => ({ ...u, tier: tierMap[u.uid] || 'free' }));

    return NextResponse.json({
      totalUsers: allUsers.length,
      tierCounts,
      mrr: Math.round(mrr * 100) / 100,
      verifiedRevenue,
      signupTrend,
      activeWeek,
      activeToday,
      featureUsage,
      recentSignups,
    });
  } catch (error) {
    console.error('[api/admin/stats] error:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
