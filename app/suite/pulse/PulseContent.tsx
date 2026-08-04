'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolHeader, SuiteUnmeasured } from '@/components/suite/SuiteToolChrome';

interface PulseData {
  // Pipeline
  totalApps: number;
  /** Records actually marked as sent. The denominator for every rate here. */
  appliedApps: number;
  thisWeekApps: number;
  responded: number;
  interviews: number;
  offers: number;
  rejected: number;
  ghosted: number;
  // Velocity — applications sent per week, one decimal.
  weeklyRate: number;
  // Actions
  staleApps: { company: string; role: string; daysAgo: number }[];
  upcomingInterviews: { company: string; role: string; date: string }[];
  followUps: { company: string; role: string; daysSinceApply: number }[];
  // Morale
  moraleHistory: { week: string; score: number }[];
  /** Null until there is at least one application to divide by. */
  smartApplyRate?: number | null;
  morphedCount?: number;
  fitAnalyzedCount?: number;
}

export function PulseContent() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { user } = useStore();
  const router = useRouter();

  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [moraleScore, setMoraleScore] = useState<number | null>(null);
  const [savingMorale, setSavingMorale] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadPulse();
  }, [user]);

  const loadPulse = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/pulse');
      if (res.ok) {
        const data = await res.json();
        setPulse(data.pulse);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const saveMorale = async (score: number) => {
    setMoraleScore(score);
    setSavingMorale(true);
    try {
      await authFetch('/api/agent/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morale: score }),
      });
    } catch { /* silent */ }
    finally { setSavingMorale(false); }
  };

  const cardBg = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
  const cardBorder = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  /*
   * There is no health verdict here any more.
   *
   * It was `weeklyRate >= 5 ? 'On Track' : weeklyRate >= 3 ? 'Keep Pushing' :
   * 'Needs Attention'`, with a red broken-heart icon on the last branch. The 5
   * and the 3 were the "5-10 apps/week for active searchers" claim printed a
   * few lines below — step 6 deleted the citation and left the verdict it was
   * supposed to justify, so a user on day one was told their search needed
   * attention. There is no threshold in this product that the product can
   * source, so there is no badge.
   */

  const data = pulse || {
    totalApps: 0, appliedApps: 0, thisWeekApps: 0, responded: 0, interviews: 0,
    offers: 0, rejected: 0, ghosted: 0, weeklyRate: 0,
    staleApps: [], upcomingInterviews: [],
    followUps: [], moraleHistory: [],
  };

  // Rates divide by applications actually sent, and are null without one.
  const appliedApps = data.appliedApps ?? 0;
  const responseRate = appliedApps > 0 ? Math.round(data.responded / appliedApps * 100) : null;
  const funnelStages = [
    { label: 'Applied', value: appliedApps, color: '#3b82f6', icon: 'send' },
    { label: 'Responded', value: data.responded, color: '#06b6d4', icon: 'mark_email_read' },
    { label: 'Interviews', value: data.interviews, color: '#8b5cf6', icon: 'groups' },
    { label: 'Offers', value: data.offers, color: '#22c55e', icon: 'emoji_events' },
  ];

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
      <SuiteToolHeader
        tool="pulse"
        title="Weekly Career Pulse"
        subtitle="Pipeline health, velocity, and next actions"
        icon="monitor_heart"
        pageHelpId="pulse"
        actions={
          <button onClick={loadPulse}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]">
            <span className="material-symbols-rounded text-[14px]">refresh</span>
            Refresh
          </button>
        }
      />

      {loading && (
        <div className="space-y-4">
          <div className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
          <div className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        </div>
      )}

      {/* This week, stated. No ring scaled by a bare 15 (which quietly made
          6.67 apps/week the implied 100%), no red heart, no verdict. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-5 rounded-xl"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-elevated)', border: `1px solid ${cardBorder}` }}>
            <span className="material-symbols-rounded text-lg text-[var(--text-muted)]">monitor_heart</span>
          </div>
          <div className="min-w-0">
            <p className="whitespace-nowrap text-lg font-bold tabular-nums text-[var(--text-primary)]">
              {appliedApps > 0
                ? `${data.weeklyRate} sent / week`
                : 'Nothing sent yet'}
            </p>
            <p className="premium-copy-wrap text-xs text-[var(--text-muted)]">
              {appliedApps > 0
                ? `${data.responded} of ${appliedApps} answered${responseRate === null ? '' : ` — ${responseRate}%`}`
                : 'Mark an application as sent and this starts counting.'}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{data.thisWeekApps}</p>
          <p className="text-[10px] text-[var(--text-muted)]">this week</p>
        </div>
      </motion.div>

      {/* Pipeline Funnel */}
      <div className="grid grid-cols-4 gap-3">
        {funnelStages.map((stage, i) => (
          <motion.div
            key={stage.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl p-4 text-center"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center"
              style={{ background: `${stage.color}12`, border: `1px solid ${stage.color}20` }}>
              <span className="material-symbols-rounded text-lg" style={{ color: stage.color }}>{stage.icon}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stage.value}</p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold">{stage.label}</p>
            {i > 0 && funnelStages[i - 1].value > 0 && (
              <p className="text-[9px] mt-1" style={{ color: stage.color }}>
                {Math.round(stage.value / funnelStages[i - 1].value * 100)}% conversion
              </p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Outcome Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Rejected', value: data.rejected, color: '#ef4444', icon: 'cancel' },
          { label: 'Ghosted', value: data.ghosted, color: '#6b7280', icon: 'visibility_off' },
          { label: 'Awaiting reply', value: Math.max(0, appliedApps - data.responded), color: '#f59e0b', icon: 'hourglass_top' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.08 }}
            className="rounded-xl p-3.5 flex items-center gap-3"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <span className="material-symbols-rounded text-lg" style={{ color: stat.color }}>{stat.icon}</span>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">{stat.value}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Smart Apply Rate */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl p-5"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      >
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="material-symbols-rounded text-base" style={{ color: '#f59e0b' }}>verified</span>
          Smart Apply Rate
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">
          % of applications that used the full intelligence pipeline (morphed resume + fit analysis). Quality over volume.
        </p>
        {/* Gated on having applications. Without them the `??` fallback never
            fired (the route already returned a hard 0), so a new account was
            shown "0%" in red, "0/0 apps used full pipeline", and the
            "Spray & Pray" tier highlighted as their verdict. */}
        {data.totalApps === 0 ? (
          <SuiteUnmeasured
            label="No applications to measure"
            reason="This is the share of your applications that went through a resume morph. You have not tracked any applications yet, so there is no share to compute — not a share of zero."
          />
        ) : (() => {
          const smartRate = data.smartApplyRate ?? Math.round((data.morphedCount ?? 0) / data.totalApps * 100);
          const barColor = smartRate >= 70 ? '#22c55e' : smartRate >= 40 ? '#f59e0b' : '#ef4444';
          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl font-bold" style={{ color: barColor }}>{smartRate}%</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {data.morphedCount ?? 0}/{data.totalApps} apps used full pipeline
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, smartRate))}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                {[
                  { label: 'Spray & Pray', desc: 'No morph, no analysis', range: '0-30%', match: smartRate < 30 },
                  { label: 'Selective', desc: 'Some pipeline use', range: '30-70%', match: smartRate >= 30 && smartRate < 70 },
                  { label: 'Precision', desc: 'Full pipeline every time', range: '70-100%', match: smartRate >= 70 },
                ].map(tier => (
                  <div
                    key={tier.label}
                    className="flex-1 rounded-lg p-2 text-center"
                    style={{
                      background: tier.match ? `${barColor}10` : cardBg,
                      border: `1px solid ${tier.match ? `${barColor}30` : cardBorder}`,
                    }}
                  >
                    <p className="text-[10px] font-bold" style={{ color: tier.match ? barColor : 'var(--text-muted)' }}>{tier.label}</p>
                    <p className="text-[8px] text-[var(--text-muted)]">{tier.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Action Items */}
      {(data.staleApps.length > 0 || data.followUps.length > 0 || data.upcomingInterviews.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${cardBorder}` }}
        >
          <div className="px-4 py-3 flex items-center gap-2" style={{
            background: isLight ? 'rgba(139,92,246,0.04)' : 'rgba(139,92,246,0.06)',
            borderBottom: `1px solid ${cardBorder}`,
          }}>
            <span className="material-symbols-rounded text-sm text-purple-500">task_alt</span>
            <span className="text-xs font-bold text-[var(--text-primary)]">Action Items</span>
          </div>

          <div className="divide-y" style={{ borderColor: cardBorder }}>
            {data.upcomingInterviews.map((item, i) => (
              <div key={`int-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-rounded text-base text-purple-500">event</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Interview: {item.company} — {item.role}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                </div>
                <a href="/suite/interview-debrief" className="text-[10px] text-purple-500 font-bold">Prep →</a>
              </div>
            ))}

            {data.followUps.map((item, i) => (
              <div key={`fu-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-rounded text-base text-amber-500">forward_to_inbox</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">Follow up: {item.company} — {item.role}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Applied {item.daysSinceApply} days ago — in the response window</p>
                </div>
                <span className="text-[10px] text-amber-500 font-bold">Send follow-up</span>
              </div>
            ))}

            {data.staleApps.map((item, i) => (
              <div key={`stale-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-rounded text-base text-red-500">schedule</span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)]">{item.company} — {item.role}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{item.daysAgo} days with no response — consider archiving</p>
                </div>
                <span className="text-[10px] text-red-500 font-bold">Archive</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Velocity Context */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="rounded-xl p-5"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      >
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <span className="material-symbols-rounded text-base text-blue-500">speed</span>
          Application Velocity
        </h3>
        <div className="flex min-w-0 flex-wrap items-center gap-6">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-3xl font-bold tabular-nums text-[var(--text-primary)]">{data.weeklyRate}</p>
            <p className="text-[10px] text-[var(--text-muted)]">sent / week</p>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5 text-xs text-[var(--text-secondary)]">
            {data.totalApps > 0 ? (
              <>
                <p className="flex min-w-0 items-start gap-1.5">
                  <span className="material-symbols-rounded shrink-0 text-[14px] text-[var(--text-muted)]">inventory_2</span>
                  <span className="min-w-0">
                    <strong className="tabular-nums">{data.totalApps}</strong> tracked,{' '}
                    <strong className="tabular-nums">{appliedApps}</strong> marked as sent,{' '}
                    <strong className="tabular-nums">{data.thisWeekApps}</strong> in the last 7 days
                  </span>
                </p>
                <p className="flex min-w-0 items-start gap-1.5">
                  <span className="material-symbols-rounded shrink-0 text-[14px] text-[var(--text-muted)]">mark_email_read</span>
                  <span className="min-w-0">
                    {responseRate === null
                      ? 'No response rate yet — a rate needs an application marked as sent.'
                      : <>
                          <strong className="tabular-nums">{responseRate}%</strong> response rate across{' '}
                          {appliedApps} sent {appliedApps === 1 ? 'application' : 'applications'}
                        </>}
                  </span>
                </p>
              </>
            ) : (
              <p className="min-w-0 text-[var(--text-muted)]">
                Velocity is counted from the applications you track here. Nothing logged yet.
              </p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Morale Check-in */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="rounded-xl p-5"
        style={{ background: '#8b5cf608', border: '1px solid #8b5cf615' }}
      >
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <span className="material-symbols-rounded text-base" style={{ color: '#8b5cf6' }}>self_improvement</span>
          How Are You Feeling?
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-3">Job searching is tough. Track your morale to spot burnout early.</p>
        <div className="flex gap-3">
          {[
            { score: 1, icon: 'sentiment_very_dissatisfied', label: 'Struggling', color: '#ef4444' },
            { score: 2, icon: 'sentiment_dissatisfied', label: 'Low', color: '#f59e0b' },
            { score: 3, icon: 'sentiment_neutral', label: 'Neutral', color: '#6b7280' },
            { score: 4, icon: 'sentiment_satisfied', label: 'Good', color: '#22c55e' },
            { score: 5, icon: 'sentiment_very_satisfied', label: 'Great', color: '#10b981' },
          ].map(m => (
            <button
              key={m.score}
              onClick={() => saveMorale(m.score)}
              disabled={savingMorale}
              className="flex-1 py-3 rounded-xl text-center transition-all"
              style={{
                background: moraleScore === m.score ? '#8b5cf615' : cardBg,
                border: `2px solid ${moraleScore === m.score ? '#8b5cf6' : cardBorder}`,
              }}
            >
              <span className="material-symbols-rounded text-[24px] block" style={{ color: m.color }}>{m.icon}</span>
              <span className="text-[9px] text-[var(--text-muted)] mt-1 block">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Morale History */}
        {data.moraleHistory.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${cardBorder}` }}>
            <div className="flex items-end gap-1 h-12">
              {data.moraleHistory.slice(-8).map((m, i) => (
                <motion.div
                  key={m.week}
                  initial={{ height: 0 }}
                  animate={{ height: `${m.score * 20}%` }}
                  transition={{ delay: i * 0.05 }}
                  className="flex-1 rounded-t-sm"
                  title={`Week of ${m.week}: ${m.score}/5`}
                  style={{
                    background: m.score >= 4 ? '#22c55e' : m.score >= 3 ? '#f59e0b' : '#ef4444',
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
            <p className="text-[9px] text-[var(--text-muted)] text-center mt-1">Morale over last 8 weeks</p>
          </div>
        )}
      </motion.div>

      {/* Empty State */}
      {!loading && data.totalApps === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
          <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-teal-500/5" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-cyan-500">monitor_heart</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Your Pulse is Waiting</h3>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">
                Start tracking applications to see pipeline health, velocity metrics, and personalized action items.
              </p>
              <button
                onClick={() => router.push('/suite/applications')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #0d9488)', boxShadow: '0 4px 16px rgba(6,182,212,0.3)' }}
              >
                <span className="material-symbols-rounded text-sm">add</span>
                Track Your First Application
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
