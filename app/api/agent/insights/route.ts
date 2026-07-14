/**
 * Sona Proactive Insights API — /api/agent/insights
 *
 * Background intelligence engine for Max-tier subscribers.
 * Generates actionable insights without user prompting:
 *   - Stale application detection (7+ days no update)
 *   - Skill gap analysis from recent applications
 *   - Application queue reminders
 *
 * Capped at 5 insights/week per user to manage LLM costs.
 * GET: Fetch unread insights
 * POST: Generate new insights (called by cron or on-demand)
 */

import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { getOrComputeTwin } from '@/lib/career-twin';
import { buildSonaBrief } from '@/lib/sona-context';

type InsightType = 'sona_brief' | 'stale_application' | 'skill_gap' | 'queue_reminder' | 'market_alert';

interface Insight {
  id?: string;
  type: InsightType;
  title: string;
  body: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionUrl?: string;
  read: boolean;
  createdAt: string;
}

// ── GET: Fetch user's insights ──
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const tier = guard.user.tier;

  // Max/God only
  if (tier !== 'studio' && tier !== 'god') {
    return new Response(JSON.stringify({
      insights: [],
      gated: true,
      message: 'Proactive insights are a Max feature. Upgrade to unlock them.',
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const db = getAdminDb();

  try {
    const snap = await db
      .collection('users').doc(uid)
      .collection('agent').doc('insights')
      .collection('items')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const insights: Insight[] = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    })) as Insight[];

    const unreadCount = insights.filter(i => !i.read).length;

    return new Response(JSON.stringify({ insights, unreadCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[insights] GET error:', err);
    monitor.critical('Tool: agent/insights', String(err));
    return new Response(JSON.stringify({ insights: [], unreadCount: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── POST: Generate new insights ──
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const tier = guard.user.tier;

  if (tier !== 'studio' && tier !== 'god') {
    return new Response(JSON.stringify({ error: 'Max tier required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const db = getAdminDb();

  // ── Weekly cap enforcement (5/week) ──
  const weekKey = getWeekKey();
  const capRef = db.collection('users').doc(uid).collection('agent').doc('insightsCap');
  const capSnap = await capRef.get();
  const capData = capSnap.exists ? capSnap.data()! : { weekKey: '', count: 0 };

  const weeklyCount = capData.weekKey === weekKey ? (capData.count || 0) : 0;
  if (weeklyCount >= 5) {
    return new Response(JSON.stringify({
      generated: 0,
      message: 'Weekly insight limit reached (5/week). New insights available next week.',
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const remaining = 5 - weeklyCount;

  try {
    const newInsights: Insight[] = [];

    // ── 0. Sona Brief: one best next move from Career Twin ──
    if (newInsights.length < remaining) {
      const today = new Date().toISOString().slice(0, 10);
      const existingBriefSnap = await db
        .collection('users').doc(uid)
        .collection('agent').doc('insights')
        .collection('items')
        .where('type', '==', 'sona_brief')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      const lastBrief = existingBriefSnap.docs[0]?.data()?.createdAt || '';
      if (!lastBrief.startsWith(today)) {
        const twin = await getOrComputeTwin(uid);
        const brief = buildSonaBrief(twin);
        newInsights.push({
          type: 'sona_brief',
          title: brief.title,
          body: brief.body,
          icon: 'auto_awesome',
          priority: brief.priority,
          actionLabel: brief.actionLabel,
          actionUrl: brief.actionUrl,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── 1. Stale Application Detection ──
    if (newInsights.length < remaining) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const appsSnap = await db
        .collection('users').doc(uid)
        .collection('applications')
        .where('status', '==', 'Applied')
        .orderBy('updatedAt', 'asc')
        .limit(5)
        .get();

      const staleApps = appsSnap.docs
        .filter(d => {
          const updated = d.data().updatedAt || d.data().createdAt || '';
          return updated < sevenDaysAgo;
        })
        .slice(0, 2);

      for (const doc of staleApps) {
        if (newInsights.length >= remaining) break;
        const app = doc.data();
        const company = app.companyName || app.company || 'Unknown';
        const role = app.jobTitle || app.role || 'Unknown role';
        const daysSince = Math.floor((Date.now() - new Date(app.updatedAt || app.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24));

        newInsights.push({
          type: 'stale_application',
          title: `${company} — ${daysSince} days with no update`,
          body: `Your application for ${role} at ${company} hasn't changed in ${daysSince} days. Consider sending a follow-up to stay on their radar, or update the status if you've heard back.`,
          icon: 'schedule',
          priority: daysSince > 14 ? 'high' : 'medium',
          actionLabel: 'Open Applications',
          actionUrl: '/suite/applications',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── 2. Application Queue Reminder ──
    if (newInsights.length < remaining) {
      const queueSnap = await db
        .collection('users').doc(uid)
        .collection('agent_queue')
        .where('status', 'in', ['pending', 'approved'])
        .get();

      if (queueSnap.size > 0) {
        const oldest = queueSnap.docs
            .map(d => d.data())
            .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];

        const daysSinceQueued = Math.floor(
          (Date.now() - new Date(oldest?.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)
        );

        newInsights.push({
          type: 'queue_reminder',
          title: `${queueSnap.size} application${queueSnap.size > 1 ? 's' : ''} ready to submit`,
          body: `You have ${queueSnap.size} prepared application${queueSnap.size > 1 ? 's' : ''} in your queue${daysSinceQueued > 2 ? `, the oldest sitting for ${daysSinceQueued} days` : ''}. Review and submit them before the roles fill up.`,
          icon: 'send',
          priority: queueSnap.size >= 3 ? 'high' : 'medium',
          actionLabel: 'Review Queue',
          actionUrl: '/suite/agent/queue',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ── 3. Skill Gap Pattern Detection ──
    if (newInsights.length < remaining) {
      // Check recent fit scores for patterns
      const recentConvsSnap = await db
        .collection('users').doc(uid)
        .collection('agent').doc('insights')
        .collection('items')
        .where('type', '==', 'skill_gap')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      // Only generate skill gap insight once per week
      const lastSkillGap = recentConvsSnap.docs[0]?.data()?.createdAt || '';
      const lastSkillGapDate = lastSkillGap ? new Date(lastSkillGap) : new Date(0);
      const daysSinceLastSkillGap = (Date.now() - lastSkillGapDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceLastSkillGap > 7) {
        // Get user's skills from vault
        const vaultSnap = await db
          .collection('users').doc(uid)
          .collection('vault')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (!vaultSnap.empty) {
          const resume = vaultSnap.docs[0].data().resume || vaultSnap.docs[0].data().parsed || {};
          const skills = (resume.skills || []).flatMap((s: any) => s.items || []);
          const experience = (resume.experience || []).length;

          if (skills.length > 0 && experience > 0) {
            // Simple heuristic: if the user has < 3 in-demand skills, suggest upskilling
            const inDemand = ['python', 'typescript', 'react', 'aws', 'docker', 'kubernetes', 'sql', 'next.js', 'node.js', 'graphql', 'terraform', 'ci/cd'];
            const userLower = skills.map((s: string) => s.toLowerCase());
            const missing = inDemand.filter(s => !userLower.some((u: string) => u.includes(s) || s.includes(u)));

            if (missing.length >= 4) {
              newInsights.push({
                type: 'skill_gap',
                title: 'Market skill gaps spotted in your resume',
                body: `Based on current market trends, adding any of these to your resume could open more doors: ${missing.slice(0, 4).join(', ')}. Consider picking one to learn this month.`,
                icon: 'trending_up',
                priority: 'low',
                actionLabel: 'Explore Skill Bridge',
                actionUrl: '/suite/skill-bridge',
                read: false,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    // ── Save insights to Firestore ──
    const insightsRef = db
      .collection('users').doc(uid)
      .collection('agent').doc('insights')
      .collection('items');

    for (const insight of newInsights) {
      await insightsRef.add(insight);
    }

    // Update weekly cap
    await capRef.set({
      weekKey,
      count: weeklyCount + newInsights.length,
    });

    return new Response(JSON.stringify({
      generated: newInsights.length,
      insights: newInsights,
      remaining: remaining - newInsights.length,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[insights] POST error:', err);
    monitor.critical('Tool: agent/insights', String(err));
    return new Response(JSON.stringify({ error: 'Failed to generate insights' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── PATCH: Mark insight as read ──
export async function PATCH(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;
  const body = await req.json();
  const { insightId } = body;

  if (!insightId) {
    return new Response(JSON.stringify({ error: 'insightId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const db = getAdminDb();
  try {
    await db
      .collection('users').doc(uid)
      .collection('agent').doc('insights')
      .collection('items').doc(insightId)
      .update({ read: true });

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Failed to mark read' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function getWeekKey(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay());
  return `${start.getFullYear()}-W${String(Math.ceil((start.getDate()) / 7)).padStart(2, '0')}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}
