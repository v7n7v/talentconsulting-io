import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  countsAsApplied,
  countsAsInterview,
  countsAsOffer,
  recordCountsAsEmployerResponse,
} from '@/lib/career-graph';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 86400000;
    const twoWeeksAgo = now - 14 * 86400000;

    // Fetch applications
    const appsSnap = await db.collection('users').doc(uid).collection('applications')
      .orderBy('createdAt', 'desc').limit(200).get();

    const apps = appsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    // Pipeline counts
    const totalApps = apps.length;
    const thisWeekApps = apps.filter((a: any) => new Date(a.createdAt).getTime() > oneWeekAgo).length;

    // Every funnel predicate comes from lib/career-graph so this tab and the
    // Overview tab on the same page cannot report different numbers for the
    // same user. Sharing only `countsAsApplied` and `countsAsEmployerResponse`
    // was not enough: career-graph reads the recorded outcome history and a
    // wider interview status list, so an application at `interview_scheduled`
    // counted as an interview there and not here — and that is the status the
    // outcome route writes for the commonest path.
    const statusCounts = { responded: 0, interviews: 0, offers: 0, rejected: 0, ghosted: 0 };
    let appliedApps = 0;
    let oldestSentTime = Infinity;
    apps.forEach((a: any) => {
      const s = (a.status || '').toLowerCase();
      // Counted inside the applied branch, exactly as career-graph does it: an
      // employer cannot reply to something that was never sent, and counting
      // it would put `responded` above `appliedApps`.
      if (countsAsApplied(s)) {
        appliedApps++;
        const sentTime = new Date(a.createdAt).getTime();
        if (Number.isFinite(sentTime) && sentTime < oldestSentTime) oldestSentTime = sentTime;

        if (countsAsInterview(a)) statusCounts.interviews++;
        if (countsAsOffer(a)) statusCounts.offers++;
        if (s === 'rejected' || s === 'declined') statusCounts.rejected++;
        if (s === 'ghosted' || s === 'no_response') statusCounts.ghosted++;
        if (recordCountsAsEmployerResponse(a)) statusCounts.responded++;
      }
    });

    // Velocity — one decimal, and over applications actually sent. An integer
    // round reported "0 apps/week" to someone with a tracked application, and
    // dating the window from the oldest record of any kind meant a resume
    // morphed twenty weeks ago dragged down the pace of applications sent last
    // week. Numerator and denominator describe the same thing.
    const weeksActive = Number.isFinite(oldestSentTime)
      ? Math.max(1, Math.ceil((now - oldestSentTime) / (7 * 86400000)))
      : 1;
    const weeklyRate = appliedApps > 0 ? Math.round((appliedApps / weeksActive) * 10) / 10 : 0;

    // Stale apps (applied > 30 days, no response)
    const staleApps = apps
      .filter((a: any) => {
        const s = (a.status || '').toLowerCase();
        const daysAgo = Math.floor((now - new Date(a.createdAt).getTime()) / 86400000);
        return (s === 'applied' || s === 'queued') && daysAgo > 30;
      })
      .slice(0, 5)
      .map((a: any) => ({
        company: a.company || a.companyName || '?',
        role: a.role || a.jobTitle || '?',
        daysAgo: Math.floor((now - new Date(a.createdAt).getTime()) / 86400000),
      }));

    // Follow-ups (applied 10-21 days ago, typical response window)
    const followUps = apps
      .filter((a: any) => {
        const s = (a.status || '').toLowerCase();
        const daysAgo = Math.floor((now - new Date(a.createdAt).getTime()) / 86400000);
        return (s === 'applied' || s === 'queued') && daysAgo >= 10 && daysAgo <= 21;
      })
      .slice(0, 5)
      .map((a: any) => ({
        company: a.company || a.companyName || '?',
        role: a.role || a.jobTitle || '?',
        daysSinceApply: Math.floor((now - new Date(a.createdAt).getTime()) / 86400000),
      }));

    /*
     * Upcoming interviews — deliberately NOT `countsAsInterview`.
     *
     * That predicate answers "did this ever reach an interview", which is the
     * right question for the funnel count and the wrong one for a list headed
     * "upcoming": it would include `interviewed`, `offer` and `accepted`, all
     * of which are in the past. What this list was missing is the opposite
     * problem — `interview_scheduled`, the status the outcome route writes
     * when a user reports an interview, and the one case that genuinely is
     * upcoming.
     */
    const UPCOMING_INTERVIEW_STATUSES = ['interview', 'interviewing', 'interview_scheduled'];
    const upcomingInterviews = apps
      .filter((a: any) => UPCOMING_INTERVIEW_STATUSES.includes((a.status || '').toLowerCase()))
      .slice(0, 3)
      .map((a: any) => ({
        company: a.company || a.companyName || '?',
        role: a.role || a.jobTitle || '?',
        date: a.interviewDate || a.updatedAt || a.createdAt,
      }));

    // Morale history
    const moraleSnap = await db.collection('users').doc(uid).collection('morale')
      .orderBy('week', 'desc').limit(8).get();
    const moraleHistory = moraleSnap.docs
      .map(doc => ({ week: doc.data().week, score: doc.data().score }))
      .reverse();

    // Smart Apply Rate (apps that used full pipeline). Null with no
    // applications — a share of nothing is unknown, not 0%.
    const morphedCount = apps.filter((a: any) => a.resume_version_id).length;
    const fitAnalyzedCount = apps.filter((a: any) => a.talent_density_score != null && a.talent_density_score > 0).length;
    const smartApplyRate = totalApps > 0 ? Math.round(morphedCount / totalApps * 100) : null;

    return new Response(JSON.stringify({
      pulse: {
        totalApps,
        appliedApps,
        thisWeekApps,
        ...statusCounts,
        weeklyRate,
        staleApps,
        upcomingInterviews,
        followUps,
        moraleHistory,
        morphedCount,
        fitAnalyzedCount,
        smartApplyRate,
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    const body = await req.json();
    const { morale } = body;

    if (!morale || morale < 1 || morale > 5) {
      return new Response(JSON.stringify({ error: 'Morale must be 1-5' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Week key (ISO week)
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    await db.collection('users').doc(uid).collection('morale').doc(weekKey).set({
      week: weekKey,
      score: morale,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return new Response(JSON.stringify({ success: true, week: weekKey }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
