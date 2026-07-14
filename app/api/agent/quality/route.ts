/**
 * Sona Quality Dashboard API — /api/agent/quality
 *
 * Aggregates application metrics focused on quality, not volume:
 *   - Application Quality Score (avg fit score from queue)
 *   - Pipeline funnel (Applied → Interviewing → Offer → Rejected)
 *   - Tailored vs. generic ratio
 *   - Weekly velocity
 *   - Interview yield
 */

import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';

interface QualityMetrics {
  avgFitScore: number;
  totalApplications: number;
  tailoredCount: number;
  genericCount: number;
  tailoredRatio: number;
  pipeline: { applied: number; interviewing: number; offer: number; rejected: number };
  interviewYield: number;
  weeklyVelocity: number;
  queueSize: number;
  recentActivity: Array<{ company: string; role: string; status: string; date: string }>;
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const db = getAdminDb();

  try {
    // ── 1. Pipeline from applications collection ──
    const appsSnap = await db
      .collection('users').doc(uid)
      .collection('applications')
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get();

    const pipeline = { applied: 0, interviewing: 0, offer: 0, rejected: 0 };
    const statusMap: Record<string, keyof typeof pipeline> = {
      'Applied': 'applied',
      'Interviewing': 'interviewing',
      'Offer': 'offer',
      'Rejected': 'rejected',
    };

    const recentActivity: Array<{ company: string; role: string; status: string; date: string }> = [];

    for (const doc of appsSnap.docs) {
      const app = doc.data();
      const status = app.status || 'Applied';
      const key = statusMap[status];
      if (key) pipeline[key]++;

      if (recentActivity.length < 5) {
        recentActivity.push({
          company: app.companyName || app.company || 'Unknown',
          role: app.jobTitle || app.role || 'Unknown',
          status,
          date: app.updatedAt || app.createdAt || '',
        });
      }
    }

    const totalApplications = appsSnap.size;

    // Interview yield: % of applications that reached Interviewing or beyond
    const interviewPlusCount = pipeline.interviewing + pipeline.offer;
    const interviewYield = totalApplications > 0
      ? Math.round((interviewPlusCount / totalApplications) * 100)
      : 0;

    // ── 2. Agent Queue (tailored = those with a Sona fit score) ──
    const queueSnap = await db
      .collection('users').doc(uid)
      .collection('agent_queue')
      .get();

    let fitScoreSum = 0;
    let fitScoreCount = 0;
    let tailoredCount = 0;

    for (const doc of queueSnap.docs) {
      const q = doc.data();
      const score = q.match_score || q.fitScore || 0;
      if (score > 0) {
        fitScoreSum += score;
        fitScoreCount++;
        tailoredCount++;
      }
    }

    const avgFitScore = fitScoreCount > 0 ? Math.round(fitScoreSum / fitScoreCount) : 0;
    const genericCount = totalApplications - tailoredCount;
    const tailoredRatio = totalApplications > 0
      ? Math.round((tailoredCount / (totalApplications + queueSnap.size)) * 100)
      : 0;

    // ── 3. Weekly velocity ──
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thisWeekApps = appsSnap.docs.filter(d => {
      const created = d.data().createdAt || d.data().appliedAt || '';
      return created >= oneWeekAgo;
    });

    const metrics: QualityMetrics = {
      avgFitScore,
      totalApplications,
      tailoredCount,
      genericCount: Math.max(0, genericCount),
      tailoredRatio,
      pipeline,
      interviewYield,
      weeklyVelocity: thisWeekApps.length,
      queueSize: queueSnap.docs.filter(d => ['pending', 'approved'].includes(d.data().status)).length,
      recentActivity,
    };

    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[quality] Error:', err);
    monitor.critical('Tool: agent/quality', String(err));
    return new Response(JSON.stringify({
      avgFitScore: 0, totalApplications: 0, tailoredCount: 0, genericCount: 0,
      tailoredRatio: 0, pipeline: { applied: 0, interviewing: 0, offer: 0, rejected: 0 },
      interviewYield: 0, weeklyVelocity: 0, queueSize: 0, recentActivity: [],
    }), { headers: { 'Content-Type': 'application/json' } });
  }
}
