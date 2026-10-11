'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolHeader, SuiteUnmeasured, SuiteEmptyState } from '@/components/suite/SuiteToolChrome';
import SuiteSignedOut from '@/components/suite/SuiteSignedOut';

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

// The elevated card anatomy from the Proof Engine reference: tinted token fill,
// hairline border, tokenised shadow. One place so no surface reinvents it.
const cardCn = 'elevation-card rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]';
const cellCn = 'elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]';

export function PulseContent() {
  const { user } = useStore();
  const router = useRouter();

  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [moraleScore, setMoraleScore] = useState<number | null>(null);
  const [savingMorale, setSavingMorale] = useState(false);

  useEffect(() => {
    /* Clear the flag on the way out. `loading` starts true and loadPulse is its
       only other writer, so a bare return left the skeleton below as the whole
       of /suite/pulse for a signed-out visitor - WorkspaceFrame renders suite
       routes signed out rather than redirecting. The signed-out panel below is
       gated separately, because merely clearing the flag would have shown the
       "no applications yet" empty state to someone with no account, which is a
       claim about a record they never had. */
    if (!user) { setLoading(false); return; }
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
  // `appliedApps` is a required, always-present count (the API sets it and the
  // no-data fallback object below sets it to 0), so it needs no `?? 0` guard.
  const appliedApps = data.appliedApps;
  const responseRate = appliedApps > 0 ? Math.round(data.responded / appliedApps * 100) : null;

  // The measured share of tracked applications sent with a tailored resume.
  // The API returns a real integer once there is an application to divide by,
  // and null before that — a share of nothing is unknown, not 0%. `?? null`
  // only normalises an undefined field to that same unknown; it invents nothing.
  const smartRate = data.smartApplyRate ?? null;

  // Progression, not evidence state — so it stays neutral. The counts carry it;
  // hue is reserved for interaction (accent) and evidence status elsewhere.
  const funnelStages = [
    { label: 'Applied', value: appliedApps, icon: 'send' },
    { label: 'Responded', value: data.responded, icon: 'mark_email_read' },
    { label: 'Interviews', value: data.interviews, icon: 'groups' },
    { label: 'Offers', value: data.offers, icon: 'emoji_events' },
  ];

  /* Signed out returns here rather than falling through. `data` is
     `pulse || {…zeros}`, and the funnel, the velocity row and the stat cards
     below are not gated on `loading` at all, so a visitor with no account
     would have been shown a full pipeline of measured zeros - the one thing
     this product does not do. Every hook above has already run, so the early
     return does not change hook order. */
  if (!user) {
    return (
      <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
        <SuiteToolHeader
          tool="pulse"
          title="Weekly Career Pulse"
          subtitle="Pipeline health, velocity, and next actions"
          icon="monitor_heart"
          pageHelpId="pulse"
        />
        <SuiteSignedOut
          title="Sign in to see your Career Pulse"
          description="Pulse counts the applications, replies and interviews saved to your account. Signed out there is nothing to count — not zero of them, none recorded."
        />
      </div>
    );
  }

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
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]">
            <span className="material-symbols-rounded text-[16px]" aria-hidden="true">refresh</span>
            Refresh
          </button>
        }
      />

      {loading && (
        <div className="space-y-4">
          <div className="h-24 rounded-[20px] animate-pulse border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-[16px] animate-pulse border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            ))}
          </div>
          <div className="h-32 rounded-[20px] animate-pulse border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
        </div>
      )}

      {/* Nothing tracked yet → a labelled absence, not a grid of measured zeros.
          A signed-in account with no applications was shown four "0" funnel
          cards, three "0" outcome cards and a velocity of 0 — the exact
          measured-zero this product forbids. The pipeline only renders once
          there is at least one tracked application to measure. */}
      {!loading && data.totalApps === 0 && (
        <SuiteEmptyState
          icon="monitor_heart"
          title="Your Pulse is waiting"
          description="Track applications to see pipeline health, velocity and next actions."
          action={
            <button
              onClick={() => router.push('/suite/applications')}
              className="btn-primary inline-flex items-center justify-center gap-2 px-5 text-sm font-semibold"
            >
              <span className="material-symbols-rounded text-[18px]" aria-hidden="true">add</span>
              Track your first application
            </button>
          }
        />
      )}

      {!loading && data.totalApps > 0 && (
        <>
          {/* This week, stated. No ring scaled by a bare 15 (which quietly made
              6.67 apps/week the implied 100%), no red heart, no verdict. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${cardCn} flex min-w-0 flex-wrap items-center justify-between gap-4 p-5`}
          >
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <span className="material-symbols-rounded text-[20px] text-[var(--text-muted)]" aria-hidden="true">monitor_heart</span>
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
              <p className="text-[11px] text-[var(--text-muted)]">this week</p>
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
                className={`${cellCn} p-4 text-center`}
              >
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <span className="material-symbols-rounded text-[20px] text-[var(--text-muted)]" aria-hidden="true">{stage.icon}</span>
                </div>
                <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{stage.value}</p>
                <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)]">{stage.label}</p>
                {i > 0 && funnelStages[i - 1].value > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {Math.round(stage.value / funnelStages[i - 1].value * 100)}% conversion
                  </p>
                )}
              </motion.div>
            ))}
          </div>

          {/* Outcome Breakdown — status hue only where it carries meaning:
              rejected reads danger, awaiting reads pending, ghosted is neutral. */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Rejected', value: data.rejected, tone: 'var(--danger)', icon: 'cancel' },
              { label: 'Ghosted', value: data.ghosted, tone: 'var(--text-muted)', icon: 'visibility_off' },
              { label: 'Awaiting reply', value: Math.max(0, appliedApps - data.responded), tone: 'var(--warning)', icon: 'hourglass_top' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className={`${cellCn} flex items-center gap-3 p-3.5`}
              >
                <span className="material-symbols-rounded text-[20px]" style={{ color: stat.tone }} aria-hidden="true">{stat.icon}</span>
                <div className="min-w-0">
                  <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{stat.value}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{stat.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Smart Apply Rate */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className={`${cardCn} p-5`}
          >
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">verified</span>
              Smart Apply Rate
            </h3>
            <p className="mb-3 text-[12px] text-[var(--text-muted)]">
              Share of your tracked applications sent with a tailored (morphed) resume.
            </p>
            {smartRate == null ? (
              <SuiteUnmeasured
                label="No applications to measure"
                reason="This is the share of your applications that used a tailored resume. You have not tracked any applications yet, so there is no share to compute — not a share of zero."
              />
            ) : (() => {
              const band = smartRate >= 70 ? 'var(--success)' : smartRate >= 40 ? 'var(--warning)' : 'var(--danger)';
              return (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-3xl font-bold tabular-nums" style={{ color: band }}>{smartRate}%</span>
                    <span className="min-w-0 text-[11px] text-[var(--text-muted)]">
                      {typeof data.morphedCount === 'number'
                        ? `${data.morphedCount} of ${data.totalApps} used a tailored resume`
                        : `across ${data.totalApps} tracked`}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: band }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, smartRate))}%` }}
                      transition={{ duration: 1 }}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {[
                      { label: 'Spray & Pray', desc: 'No tailored resume', match: smartRate < 30 },
                      { label: 'Selective', desc: 'Some tailored', match: smartRate >= 30 && smartRate < 70 },
                      { label: 'Precision', desc: 'Tailored every time', match: smartRate >= 70 },
                    ].map(tier => (
                      <div
                        key={tier.label}
                        className="flex-1 rounded-[12px] p-2 text-center"
                        style={{
                          background: tier.match ? `color-mix(in srgb, ${band} 12%, transparent)` : 'var(--bg-surface)',
                          border: `1px solid ${tier.match ? `color-mix(in srgb, ${band} 35%, transparent)` : 'var(--border-subtle)'}`,
                        }}
                      >
                        <p className="text-[11px] font-bold" style={{ color: tier.match ? band : 'var(--text-muted)' }}>{tier.label}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{tier.desc}</p>
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
              className={`${cardCn} overflow-hidden`}
            >
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3">
                <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]" aria-hidden="true">task_alt</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">Action Items</span>
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {data.upcomingInterviews.map((item, i) => (
                  <div key={`int-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">event</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-primary)]">Interview: {item.company} — {item.role}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    </div>
                    <a href="/suite/interview-debrief" className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-2 py-1 text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--bg-hover)]">Prep →</a>
                  </div>
                ))}

                {data.followUps.map((item, i) => (
                  <div key={`fu-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">forward_to_inbox</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-primary)]">Follow up: {item.company} — {item.role}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">Applied {item.daysSinceApply} days ago — in the response window</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">Send follow-up</span>
                  </div>
                ))}

                {data.staleApps.map((item, i) => (
                  <div key={`stale-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">schedule</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-primary)]">{item.company} — {item.role}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{item.daysAgo} days with no response — consider archiving</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)]">Archive</span>
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
            className={`${cardCn} p-5`}
          >
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">speed</span>
              Application Velocity
            </h3>
            <div className="flex min-w-0 flex-wrap items-center gap-6">
              <div className="min-w-0">
                <p className="whitespace-nowrap text-3xl font-bold tabular-nums text-[var(--text-primary)]">{data.weeklyRate}</p>
                <p className="text-[11px] text-[var(--text-muted)]">sent / week</p>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 text-xs text-[var(--text-secondary)]">
                {data.totalApps > 0 ? (
                  <>
                    <p className="flex min-w-0 items-start gap-1.5">
                      <span className="material-symbols-rounded shrink-0 text-[16px] text-[var(--text-muted)]" aria-hidden="true">inventory_2</span>
                      <span className="min-w-0">
                        <strong className="tabular-nums">{data.totalApps}</strong> tracked,{' '}
                        <strong className="tabular-nums">{appliedApps}</strong> marked as sent,{' '}
                        <strong className="tabular-nums">{data.thisWeekApps}</strong> in the last 7 days
                      </span>
                    </p>
                    <p className="flex min-w-0 items-start gap-1.5">
                      <span className="material-symbols-rounded shrink-0 text-[16px] text-[var(--text-muted)]" aria-hidden="true">mark_email_read</span>
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
        </>
      )}

      {/* Morale Check-in — independent of the pipeline, so it stays available
          whether or not there are applications to measure. */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`${cardCn} p-5`}
        >
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)]" aria-hidden="true">self_improvement</span>
            How Are You Feeling?
          </h3>
          <p className="mb-3 text-[12px] text-[var(--text-muted)]">Job searching is tough. Track your morale to spot burnout early.</p>
          <div className="flex gap-3">
            {[
              { score: 1, icon: 'sentiment_very_dissatisfied', label: 'Struggling' },
              { score: 2, icon: 'sentiment_dissatisfied', label: 'Low' },
              { score: 3, icon: 'sentiment_neutral', label: 'Neutral' },
              { score: 4, icon: 'sentiment_satisfied', label: 'Good' },
              { score: 5, icon: 'sentiment_very_satisfied', label: 'Great' },
            ].map(m => (
              <button
                key={m.score}
                onClick={() => saveMorale(m.score)}
                disabled={savingMorale}
                aria-pressed={moraleScore === m.score}
                className={`flex-1 min-h-[44px] rounded-[14px] border-2 py-3 text-center transition-colors ${
                  moraleScore === m.score
                    ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border)]'
                }`}
              >
                <span className="material-symbols-rounded block text-[24px] text-[var(--text-secondary)]" aria-hidden="true">{m.icon}</span>
                <span className="mt-1 block text-[11px] text-[var(--text-muted)]">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Morale History — real self-reported scores. Height carries the
              value (1-5); hue stays neutral so this scale is not read as an
              evidence-status signal. */}
          {data.moraleHistory.length > 0 && (
            <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
              <div className="flex h-12 items-end gap-1">
                {data.moraleHistory.slice(-8).map((m, i) => (
                  <motion.div
                    key={m.week}
                    initial={{ height: 0 }}
                    animate={{ height: `${m.score * 20}%` }}
                    transition={{ delay: i * 0.05 }}
                    className="flex-1 rounded-t-sm bg-[var(--text-muted)] opacity-70"
                    title={`Week of ${m.week}: ${m.score}/5`}
                  />
                ))}
              </div>
              <p className="mt-1 text-center text-[11px] text-[var(--text-muted)]">Morale over last 8 weeks</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
