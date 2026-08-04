'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Applied: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
  Interviewing: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
  Offer: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
  Rejected: { bg: 'rgba(244,63,94,0.1)', text: '#f43f5e' },
};

function ScoreRing({ score, size = 100, label }: { score: number; size?: number; label: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';

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
  const { theme } = useTheme();
  const isLight = theme === 'light';
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

  // Moved loading/empty into main render return

  const metricsData = metrics || { avgFitScore: 0, totalApplications: 0, tailoredCount: 0, genericCount: 0, tailoredRatio: 0, pipeline: { applied: 0, interviewing: 0, offer: 0, rejected: 0 }, interviewYield: 0, weeklyVelocity: 0, queueSize: 0, recentActivity: [] } as QualityMetrics;
  const { avgFitScore, totalApplications, tailoredCount, tailoredRatio, pipeline, interviewYield, weeklyVelocity, queueSize, recentActivity } = metricsData;

  return (
    <div className="mobile-app-content min-h-dvh max-w-5xl mx-auto space-y-5 px-4 py-3 md:space-y-6 md:p-6">
      <SuiteToolHeader
        tool="quality"
        title="Application Quality"
        subtitle="Quality over quantity: every metric that matters."
        icon="monitoring"
        pageHelpId="quality"
        actions={
          <button
            onClick={loadMetrics}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="material-symbols-rounded text-[14px]">refresh</span>
            Refresh
          </button>
        }
      />

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
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

      {!loading && metrics && (<>

      {/* ═══ TOP METRICS ROW ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Avg Fit Score', value: `${avgFitScore}%`, icon: 'target', color: avgFitScore >= 80 ? '#10b981' : avgFitScore >= 60 ? '#f59e0b' : '#f43f5e' },
          { label: 'Interview Yield', value: `${interviewYield}%`, icon: 'trending_up', color: interviewYield >= 20 ? '#10b981' : interviewYield >= 10 ? '#f59e0b' : '#f43f5e' },
          { label: 'This Week', value: String(weeklyVelocity), icon: 'speed', color: '#3b82f6' },
          { label: 'Queue Ready', value: String(queueSize), icon: 'send', color: '#a855f7' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl p-4"
            style={{
              background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-rounded text-[16px]" style={{ color: stat.color }}>{stat.icon}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ═══ MIDDLE ROW: Score Ring + Pipeline + Tailored Ratio ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Quality Score Ring */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl p-5 flex flex-col items-center justify-center"
          style={{
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <ScoreRing score={avgFitScore} label="Application Quality Score" />
          <p className="text-[10px] text-[var(--text-muted)] mt-3 text-center">
            {avgFitScore >= 80 ? 'Excellent — your applications are well-targeted' :
             avgFitScore >= 60 ? 'Good — some room to improve targeting' :
             avgFitScore > 0 ? 'Needs work — try using the Fit Gate before applying' :
             'No scored applications yet'}
          </p>
        </motion.div>

        {/* Pipeline Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl p-5"
          style={{
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-blue-400">filter_alt</span>
            Pipeline Funnel
          </p>
          <div className="space-y-3">
            <FunnelBar label="Applied" count={pipeline.applied} total={totalApplications} color="#3b82f6" delay={0.4} />
            <FunnelBar label="Interviewing" count={pipeline.interviewing} total={totalApplications} color="#f59e0b" delay={0.5} />
            <FunnelBar label="Offer" count={pipeline.offer} total={totalApplications} color="#10b981" delay={0.6} />
            <FunnelBar label="Rejected" count={pipeline.rejected} total={totalApplications} color="#f43f5e" delay={0.7} />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-3">{totalApplications} total applications tracked</p>
        </motion.div>

        {/* Tailored vs Generic */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl p-5"
          style={{
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-green-400">tune</span>
            Tailored vs. Generic
          </p>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">{tailoredRatio}%</p>
              <p className="text-[10px] text-[var(--text-muted)]">tailored</p>
            </div>
            <div className="w-px h-12 bg-[var(--border-subtle)]" />
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">{100 - tailoredRatio}%</p>
              <p className="text-[10px] text-[var(--text-muted)]">generic</p>
            </div>
          </div>
          {/* Ratio bar */}
          <div className="h-3 rounded-full bg-[var(--bg-hover)] overflow-hidden flex">
            <motion.div
              className="h-full rounded-l-full"
              style={{ background: '#10b981' }}
              initial={{ width: 0 }}
              animate={{ width: `${tailoredRatio}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
            />
            <motion.div
              className="h-full rounded-r-full"
              style={{ background: 'rgba(244,63,94,0.3)' }}
              initial={{ width: 0 }}
              animate={{ width: `${100 - tailoredRatio}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-3">
            {tailoredCount} tailored via Taco · {metrics.genericCount} generic
          </p>
        </motion.div>
      </div>

      {/* ═══ RECENT ACTIVITY ═══ */}
      {recentActivity.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl p-5"
          style={{
            background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[16px] text-amber-400">history</span>
            Recent Activity
          </p>
          <div className="space-y-2">
            {recentActivity.map((a, i) => {
              const sc = STATUS_COLORS[a.status] || STATUS_COLORS.Applied;
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)] last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate font-medium">{a.company}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{a.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: sc.bg, color: sc.text }}
                    >
                      {a.status}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{formatDate(a.date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {totalApplications === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
          <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-pink-500/5" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-rose-500">monitoring</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Application Data Yet</h3>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">Start tracking applications and using Taco&apos;s Fit Gate to see quality metrics.</p>
              <a href="/suite/applications"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #f43f5e, #db2777)', boxShadow: '0 4px 16px rgba(244,63,94,0.3)' }}>
                <span className="material-symbols-rounded text-sm">send</span>
                Go to Applications
              </a>
            </div>
          </div>
        </motion.div>
      )}
      </>)}
    </div>
  );
}
