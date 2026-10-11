'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import {
  SuiteToolShell,
  SuiteToolHeader,
  SuitePanel,
  SuiteMetricCard,
  SuiteUnmeasured,
  SuiteEmptyState,
} from '@/components/suite/SuiteToolChrome';
import SuiteSignedOut from '@/components/suite/SuiteSignedOut';

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

// Status hue is a supporting channel only — the text label carries the meaning.
// Kept distinct from the blue --accent so hue still reads as pipeline state.
const STATUS_TOKEN: Record<string, string> = {
  Applied: 'var(--text-muted)',
  Interviewing: 'var(--warning)',
  Offer: 'var(--success)',
  Rejected: 'var(--danger)',
};

function ScoreRing({ score, size = 100, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={5} className="text-[var(--border-subtle)] opacity-30" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            strokeDasharray={circumference}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-[var(--text-primary)]">{score}%</span>
        </div>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-2 font-medium">{label}</p>
    </div>
  );
}

function FunnelBar({ label, count, total, color, delay }: { label: string; count: number; total: number; color: string; delay: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay }}
        />
      </div>
    </div>
  );
}

export default function QualityDashboard() {
  const { user } = useStore();
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clear the flag on the way out - `loading` starts true and loadMetrics is
    // its only other writer, so a bare return left the skeleton below as the
    // whole page for a signed-out visitor. WorkspaceFrame renders suite routes
    // signed out rather than redirecting, so this is reachable.
    if (!user) { setLoading(false); return; }
    loadMetrics();
  }, [user]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/quality');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Never rendered: every metrics block below is gated on `metrics` being
  // present AND `totalApplications > 0`, so this zero-object only backstops the
  // destructure and cannot reach the screen as measured data.
  const metricsData = metrics || { avgFitScore: 0, totalApplications: 0, tailoredCount: 0, genericCount: 0, tailoredRatio: 0, pipeline: { applied: 0, interviewing: 0, offer: 0, rejected: 0 }, interviewYield: 0, weeklyVelocity: 0, queueSize: 0, recentActivity: [] } as QualityMetrics;
  const { avgFitScore, totalApplications, tailoredCount, tailoredRatio, pipeline, interviewYield, weeklyVelocity, queueSize, recentActivity } = metricsData;

  return (
    <SuiteToolShell variant="standard">
      <SuiteToolHeader
        tool="quality"
        title="Application Quality"
        subtitle="Quality over quantity: every metric that matters."
        icon="monitoring"
        pageHelpId="quality"
        actions={
          <button
            onClick={loadMetrics}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="material-symbols-rounded text-[18px]">refresh</span>
            Refresh
          </button>
        }
      />

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            ))}
          </div>
        </div>
      )}

      {/* `metricsData` a few lines up is `metrics || {…zeros}`, so this state
          has to exist: with the load flag cleared and nothing gating it, an
          account-less visitor would read a quality dashboard of measured
          zeros. Everything below stays behind `metrics`. */}
      {!loading && !user && (
        <SuiteSignedOut
          title="Sign in to see your application quality"
          description="These metrics are computed from the applications and packets saved to your account. Signed out there is nothing to compute them from."
        />
      )}

      {/* Real data present. Zeros never render alongside the empty state: the
          whole cockpit is gated on totalApplications > 0, and avgFitScore has
          its own absence path since it can be unscored while applications
          exist. */}
      {!loading && metrics && totalApplications > 0 && (<>

      {/* ═══ TOP METRICS ROW — plain measured counts ═══ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SuiteMetricCard label="Interview yield" value={`${interviewYield}%`} icon="trending_up" description="Reached interviewing or beyond" />
        <SuiteMetricCard label="This week" value={String(weeklyVelocity)} icon="speed" description="Applications tracked in the last 7 days" />
        <SuiteMetricCard label="Queue ready" value={String(queueSize)} icon="send" description="Pending or approved in the agent queue" />
      </div>

      {/* ═══ MIDDLE ROW: Fit Score + Pipeline + Tailored Ratio ═══ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Application quality score — a ring of a real measured value, with a
            labelled absence when nothing has been scored yet. */}
        <SuitePanel className="flex flex-col items-center justify-center">
          {avgFitScore > 0 ? (
            <>
              <ScoreRing score={avgFitScore} label="Application quality score" />
              <p className="text-[11px] text-[var(--text-muted)] mt-3 text-center">
                {avgFitScore >= 80 ? 'Excellent — your applications are well-targeted' :
                 avgFitScore >= 60 ? 'Good — some room to improve targeting' :
                 'Needs work — try the Fit Gate before applying'}
              </p>
            </>
          ) : (
            <SuiteUnmeasured
              label="Application quality score"
              reason="No applications carry a Taco fit score yet. Run the Fit Gate before applying to score each match."
            />
          )}
        </SuitePanel>

        {/* Pipeline Funnel */}
        <SuitePanel>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]">filter_alt</span>
            Pipeline funnel
          </p>
          <div className="space-y-3">
            <FunnelBar label="Applied" count={pipeline.applied} total={totalApplications} color="var(--text-muted)" delay={0.4} />
            <FunnelBar label="Interviewing" count={pipeline.interviewing} total={totalApplications} color="var(--warning)" delay={0.5} />
            <FunnelBar label="Offer" count={pipeline.offer} total={totalApplications} color="var(--success)" delay={0.6} />
            <FunnelBar label="Rejected" count={pipeline.rejected} total={totalApplications} color="var(--danger)" delay={0.7} />
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-3">{totalApplications} total applications tracked</p>
        </SuitePanel>

        {/* Tailored vs Generic */}
        <SuitePanel>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]">tune</span>
            Tailored vs. generic
          </p>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">{tailoredRatio}%</p>
              <p className="text-[11px] text-[var(--text-muted)]">tailored</p>
            </div>
            <div className="w-px h-12 bg-[var(--border-subtle)]" />
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">{100 - tailoredRatio}%</p>
              <p className="text-[11px] text-[var(--text-muted)]">generic</p>
            </div>
          </div>
          {/* Ratio bar */}
          <div className="h-3 rounded-full bg-[var(--bg-hover)] overflow-hidden flex">
            <motion.div
              className="h-full rounded-l-full"
              style={{ background: 'var(--success)' }}
              initial={{ width: 0 }}
              animate={{ width: `${tailoredRatio}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
            />
            <motion.div
              className="h-full rounded-r-full"
              style={{ background: 'var(--border-subtle)' }}
              initial={{ width: 0 }}
              animate={{ width: `${100 - tailoredRatio}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
            />
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-3">
            {tailoredCount} tailored via Taco · {metrics.genericCount} generic
          </p>
        </SuitePanel>
      </div>

      {/* ═══ RECENT ACTIVITY ═══ */}
      {recentActivity.length > 0 && (
        <SuitePanel>
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]">history</span>
            Recent activity
          </p>
          <div className="space-y-2">
            {recentActivity.map((a, i) => {
              const token = STATUS_TOKEN[a.status] || STATUS_TOKEN.Applied;
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate font-medium">{a.company}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{a.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-hover)]"
                      style={{ color: token }}
                    >
                      {a.status}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{formatDate(a.date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SuitePanel>
      )}
      </>)}

      {/* Empty state — the only thing a signed-in user with no applications
          sees. No zeros, no fabricated dashboard. */}
      {!loading && metrics && totalApplications === 0 && (
        <SuiteEmptyState
          icon="monitoring"
          title="No application data yet"
          description="Start tracking applications and using Taco's Fit Gate to see quality metrics."
          action={
            <a
              href="/suite/applications"
              className="btn-primary inline-flex items-center gap-2 px-5 text-sm font-semibold"
            >
              <span className="material-symbols-rounded text-[18px]">send</span>
              Go to Applications
            </a>
          }
        />
      )}
    </SuiteToolShell>
  );
}
