'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';

interface JobApplication {
  id: string;
  status: string;
  company: string;
  role: string;
  matchScore?: number;
  appliedDate?: string;
  created_at?: any;
}

const STATUS_FLOW = ['not_applied', 'applied', 'screening', 'interviewing', 'offer', 'accepted', 'rejected'];
const STATUS_LABELS: Record<string, string> = {
  not_applied: 'Saved', applied: 'Applied', screening: 'Screening',
  interviewing: 'Interview', offer: 'Offer', accepted: 'Accepted', rejected: 'Rejected',
};
// Colour is the last channel: every status also carries its text label. Each
// value is a token, mapped by meaning (progress → accent, attention → warning,
// success → success, terminal-negative → danger, dormant → muted).
const STATUS_TOKENS: Record<string, string> = {
  not_applied: 'var(--text-muted)',
  applied: 'var(--accent)',
  screening: 'var(--accent)',
  interviewing: 'var(--warning)',
  offer: 'var(--success)',
  accepted: 'var(--success)',
  rejected: 'var(--danger)',
};

// A tint derived from a token, never a hex. Used for soft surfaces behind a
// status glyph so the fill still resolves per-theme.
const tint = (token: string, pct: number) => `color-mix(in srgb, ${token} ${pct}%, transparent)`;

export function AnalyticsContent() {
  const { user } = useStore();
  const router = useRouter();
  const [apps, setApps] = useState<JobApplication[]>([]);

  const token = (user as any)?.accessToken || (user as any)?.stsTokenManager?.accessToken;

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/agent/applications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.applications) setApps(data.applications);
      } catch { /* */ }
    })();
  }, [token]);

  // Computed analytics
  const analytics = useMemo(() => {
    const total = apps.length;
    const statusCounts: Record<string, number> = {};
    STATUS_FLOW.forEach(s => statusCounts[s] = apps.filter(a => a.status === s).length);

    const active = total - (statusCounts.rejected || 0) - (statusCounts.accepted || 0);

    // Rates are measured against the count of applications actually submitted.
    // When nothing has been applied to, the rate is not measurable — it is null,
    // rendered as a labelled absence, never a fabricated percentage from a
    // floored denominator.
    const rateBase = statusCounts.applied || 0;
    const responseRate = rateBase > 0
      ? Math.round(((statusCounts.screening || 0) + (statusCounts.interviewing || 0) + (statusCounts.offer || 0) + (statusCounts.accepted || 0)) / rateBase * 100)
      : null;
    const interviewRate = rateBase > 0
      ? Math.round(((statusCounts.interviewing || 0) + (statusCounts.offer || 0) + (statusCounts.accepted || 0)) / rateBase * 100)
      : null;
    const offerRate = rateBase > 0
      ? Math.round(((statusCounts.offer || 0) + (statusCounts.accepted || 0)) / rateBase * 100)
      : null;

    // Average match is only meaningful over applications that carry a score.
    // With none scored, it is null (absence) rather than a measured zero.
    const scored = apps.filter(a => typeof a.matchScore === 'number');
    const avgScore = scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + (a.matchScore || 0), 0) / scored.length)
      : null;

    // Weekly velocity (apps per week in last 4 weeks)
    const now = Date.now();
    const fourWeeksAgo = now - 28 * 86400000;
    const recentApps = apps.filter(a => {
      const d = a.appliedDate || a.created_at?.toDate?.()?.toISOString?.() || a.created_at;
      return d && new Date(d).getTime() > fourWeeksAgo;
    });
    const weeklyVelocity = Math.round(recentApps.length / 4 * 10) / 10;

    // Top companies
    const companyCounts: Record<string, number> = {};
    apps.forEach(a => { if (a.company) companyCounts[a.company] = (companyCounts[a.company] || 0) + 1; });
    const topCompanies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // 4-week heatmap grid (7 cols × 4 rows)
    const heatmapData: { date: string; count: number; dayLabel: string }[] = [];
    const today = new Date();
    for (let d = 27; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short' });
      const count = apps.filter(a => {
        const aDate = a.appliedDate || a.created_at?.toDate?.()?.toISOString?.() || a.created_at;
        return aDate && aDate.startsWith(dateStr);
      }).length;
      heatmapData.push({ date: dateStr, count, dayLabel });
    }

    // Smart insight. Tone is a token key, never a hex — the branch decides which
    // measured condition holds, the render maps the key to a token surface.
    let smartInsight = '';
    let insightIcon = 'lightbulb';
    let insightTone: 'accent' | 'success' | 'warning' | 'danger' = 'warning';
    const daysSinceLastApp = recentApps.length > 0
      ? Math.floor((now - Math.max(...recentApps.map(a => new Date(a.appliedDate || a.created_at?.toDate?.()?.toISOString?.() || a.created_at || 0).getTime()))) / 86400000)
      : -1;

    if (daysSinceLastApp > 5 && daysSinceLastApp >= 0) {
      smartInsight = `You haven't applied in ${daysSinceLastApp} days. Momentum matters in a job search — even 2-3 targeted apps per week keeps your pipeline active.`;
      insightIcon = 'trending_down';
      insightTone = 'warning';
    } else if (interviewRate !== null && interviewRate > 20) {
      smartInsight = `Your interview rate is ${interviewRate}% across ${total} tracked applications.`;
      insightIcon = 'trending_up';
      insightTone = 'success';
    } else if (weeklyVelocity < 3 && total > 0) {
      smartInsight = `You are applying at ${weeklyVelocity} per week. Resume Morph tailors for more roles in the same time.`;
      insightIcon = 'speed';
      insightTone = 'accent';
    } else if ((statusCounts.rejected || 0) > (statusCounts.interviewing || 0) + (statusCounts.offer || 0)) {
      smartInsight = 'More rejections than interviews. Try running your resume through ATS Preview to optimize keyword matching.';
      insightIcon = 'troubleshoot';
      insightTone = 'danger';
    } else if (responseRate !== null && total > 0) {
      smartInsight = `You're tracking ${total} applications with a ${responseRate}% response rate. Keep the focus on high-fit roles.`;
      insightIcon = 'insights';
      insightTone = 'accent';
    } else if (total > 0) {
      smartInsight = `You're tracking ${total} applications. Apply to a role to start measuring your response and interview rates.`;
      insightIcon = 'insights';
      insightTone = 'accent';
    }

    return {
      total, active, statusCounts, responseRate, interviewRate, offerRate,
      avgScore, weeklyVelocity, topCompanies, heatmapData, smartInsight, insightIcon, insightTone,
    };
  }, [apps]);

  const insightToneColor: Record<'accent' | 'success' | 'warning' | 'danger', string> = {
    accent: 'var(--accent)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)',
  };
  const insightColor = insightToneColor[analytics.insightTone];

  // Funnel data
  const funnelStages = ['applied', 'screening', 'interviewing', 'offer', 'accepted'];
  const funnelMax = Math.max(...funnelStages.map(s => analytics.statusCounts[s] || 0), 1);

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto px-4 py-3 md:p-6">
      <SuiteToolHeader
        tool="analytics"
        title="Application Analytics"
        subtitle="Visual insights on your job search pipeline"
        icon="analytics"
        pageHelpId="analytics"
        className="mb-4 md:mb-6"
      />

      {apps.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="max-w-sm mx-auto rounded-2xl p-8 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--accent-dim)] flex items-center justify-center">
              <span className="material-symbols-rounded text-3xl text-[var(--accent)]">bar_chart</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Pipeline Data Yet</h3>
            <p className="text-sm text-[var(--text-tertiary)] mb-5">Start tracking applications to unlock visual analytics, conversion funnels, and smart insights.</p>
            <button
              onClick={() => router.push('/suite/applications')}
              className="btn-primary inline-flex items-center gap-2 px-5"
            >
              <span className="material-symbols-rounded text-base">add</span>
              Track Your First Application
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: String(analytics.total), icon: 'inbox' },
              { label: 'Active', value: String(analytics.active), icon: 'pending' },
              { label: 'Response Rate', value: analytics.responseRate === null ? null : `${analytics.responseRate}%`, icon: 'reply' },
              { label: 'Interview Rate', value: analytics.interviewRate === null ? null : `${analytics.interviewRate}%`, icon: 'mic' },
              { label: 'Offer Rate', value: analytics.offerRate === null ? null : `${analytics.offerRate}%`, icon: 'celebration' },
              { label: 'Avg Match', value: analytics.avgScore === null ? null : `${analytics.avgScore}%`, icon: 'target' },
            ].map((kpi, i) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-3 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--accent-dim)]">
                    <span className="material-symbols-rounded text-[14px] text-[var(--accent)]">{kpi.icon}</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">{kpi.label}</span>
                </div>
                {kpi.value === null ? (
                  <p className="text-[11px] font-medium text-[var(--text-muted)]">Not yet measured</p>
                ) : (
                  <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">{kpi.value}</p>
                )}
              </motion.div>
            ))}
          </div>

          {/* Smart Insight + Heatmap Row */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Smart Insight Card */}
            {analytics.smartInsight && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="rounded-2xl p-4 flex items-start gap-3 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: tint(insightColor, 15) }}>
                  <span className="material-symbols-rounded text-lg" style={{ color: insightColor }}>{analytics.insightIcon}</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: insightColor }}>Insight</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{analytics.smartInsight}</p>
                </div>
              </motion.div>
            )}

            {/* 4-Week Heatmap */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-2xl p-4 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="material-symbols-rounded text-[var(--accent)] text-lg">calendar_month</span>
                28-Day Activity
              </h3>
              <div className="grid grid-cols-7 gap-1.5">
                {analytics.heatmapData.map((day, i) => {
                  const maxCount = Math.max(...analytics.heatmapData.map(d => d.count), 1);
                  const intensity = day.count > 0 ? Math.max(0.2, day.count / maxCount) : 0;
                  const isToday = i === analytics.heatmapData.length - 1;
                  return (
                    <div key={day.date} className="relative group">
                      <div
                        className={`aspect-square rounded-md transition-all border border-[var(--border-subtle)] ${isToday ? 'ring-1 ring-[var(--accent)]' : ''}`}
                        style={{
                          background: day.count > 0
                            ? tint('var(--accent)', Math.round(intensity * 100))
                            : 'var(--bg-elevated)',
                        }}
                      />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none elevation-card">
                        {day.count} app{day.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-[var(--text-muted)]">4 weeks ago</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[var(--text-muted)] mr-1">Less</span>
                  {[0, 0.2, 0.5, 0.8, 1].map((v, i) => (
                    <div key={i} className="w-2.5 h-2.5 rounded-sm border border-[var(--border-subtle)]" style={{ background: v === 0 ? 'var(--bg-elevated)' : tint('var(--accent)', Math.round(v * 100)) }} />
                  ))}
                  <span className="text-[11px] text-[var(--text-muted)] ml-1">More</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Today</span>
              </div>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Pipeline Funnel */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl p-5 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-[var(--accent)] text-lg">filter_alt</span>
                Pipeline Funnel
              </h3>
              <div className="space-y-3">
                {funnelStages.map((stage, i) => {
                  const count = analytics.statusCounts[stage] || 0;
                  const pct = (count / funnelMax) * 100;
                  const color = STATUS_TOKENS[stage] || 'var(--text-muted)';
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">{STATUS_LABELS[stage]}</span>
                        <span className="text-xs font-black tabular-nums" style={{ color }}>{count}</span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden bg-[var(--bg-elevated)]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: i * 0.1, duration: 0.5 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Status Distribution */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl p-5 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-[var(--accent)] text-lg">donut_large</span>
                Status Breakdown
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_FLOW.map(status => {
                  const count = analytics.statusCounts[status] || 0;
                  if (count === 0) return null;
                  const color = STATUS_TOKENS[status] || 'var(--text-muted)';
                  const pct = Math.round((count / analytics.total) * 100);
                  return (
                    <div key={status} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: tint(color, 8) }}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-[var(--text-primary)]">{STATUS_LABELS[status]}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{count} ({pct}%)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Velocity */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-[var(--accent)] text-lg">speed</span>
                Application Velocity
              </h3>
              <div className="flex items-center gap-4 mb-3">
                <p className="text-4xl font-black text-[var(--text-primary)] tabular-nums">{analytics.weeklyVelocity}</p>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">apps/week</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Last 4 weeks average</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <span className="material-symbols-rounded text-[14px]">info</span>
                Top career coaches recommend 10-15 targeted applications per week.
              </div>
            </motion.div>

            {/* Top Companies */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 elevation-card border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-[var(--accent)] text-lg">apartment</span>
                Top Companies
              </h3>
              {analytics.topCompanies.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No company data yet.</p>
              ) : (
                <div className="space-y-2">
                  {analytics.topCompanies.map(([company, count], i) => (
                    <div key={company} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-[var(--text-tertiary)] w-4 tabular-nums">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{company}</p>
                      </div>
                      <span className="text-xs font-bold text-[var(--accent)] tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
