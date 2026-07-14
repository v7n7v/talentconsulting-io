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
const STATUS_COLORS: Record<string, string> = {
  not_applied: '#64748b', applied: '#3b82f6', screening: '#06b6d4',
  interviewing: '#f59e0b', offer: '#10b981', accepted: '#22c55e', rejected: '#ef4444',
};

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
    const responseRate = total > 0
      ? Math.round(((statusCounts.screening || 0) + (statusCounts.interviewing || 0) + (statusCounts.offer || 0) + (statusCounts.accepted || 0)) / Math.max(statusCounts.applied || 1, 1) * 100)
      : 0;
    const interviewRate = total > 0
      ? Math.round(((statusCounts.interviewing || 0) + (statusCounts.offer || 0) + (statusCounts.accepted || 0)) / Math.max(statusCounts.applied || 1, 1) * 100)
      : 0;
    const offerRate = total > 0
      ? Math.round(((statusCounts.offer || 0) + (statusCounts.accepted || 0)) / Math.max(statusCounts.applied || 1, 1) * 100)
      : 0;

    const avgScore = apps.filter(a => a.matchScore).length > 0
      ? Math.round(apps.filter(a => a.matchScore).reduce((s, a) => s + (a.matchScore || 0), 0) / apps.filter(a => a.matchScore).length)
      : 0;

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

    // Smart insight
    let smartInsight = '';
    let insightIcon = 'lightbulb';
    let insightColor = '#f59e0b';
    const daysSinceLastApp = recentApps.length > 0
      ? Math.floor((now - Math.max(...recentApps.map(a => new Date(a.appliedDate || a.created_at?.toDate?.()?.toISOString?.() || a.created_at || 0).getTime()))) / 86400000)
      : -1;

    if (daysSinceLastApp > 5 && daysSinceLastApp >= 0) {
      smartInsight = `You haven't applied in ${daysSinceLastApp} days. Momentum matters in a job search — even 2-3 targeted apps per week keeps your pipeline active.`;
      insightIcon = 'trending_down';
      insightColor = '#f59e0b';
    } else if (interviewRate > 20) {
      smartInsight = `Your interview rate is ${interviewRate}% — that's well above the 10-15% industry average. Your targeting strategy is working.`;
      insightIcon = 'trending_up';
      insightColor = '#10b981';
    } else if (weeklyVelocity < 3 && total > 0) {
      smartInsight = `At ${weeklyVelocity} apps/week, you're below the recommended 10-15. Consider using Resume Morph to tailor for more roles.`;
      insightIcon = 'speed';
      insightColor = '#3b82f6';
    } else if (statusCounts.rejected > statusCounts.interviewing + statusCounts.offer) {
      smartInsight = 'More rejections than interviews. Try running your resume through ATS Preview to optimize keyword matching.';
      insightIcon = 'troubleshoot';
      insightColor = '#f43f5e';
    } else if (total > 0) {
      smartInsight = `You're tracking ${total} applications with a ${responseRate}% response rate. Keep the focus on high-fit roles.`;
      insightIcon = 'insights';
      insightColor = '#6366f1';
    }

    return {
      total, active, statusCounts, responseRate, interviewRate, offerRate,
      avgScore, weeklyVelocity, topCompanies, heatmapData, smartInsight, insightIcon, insightColor,
    };
  }, [apps]);

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
          <div className="max-w-sm mx-auto rounded-2xl p-8 relative overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <span className="material-symbols-rounded text-3xl text-blue-500">bar_chart</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">No Pipeline Data Yet</h3>
              <p className="text-sm text-[var(--text-tertiary)] mb-5">Start tracking applications to unlock visual analytics, conversion funnels, and smart insights.</p>
              <button
                onClick={() => router.push('/suite/applications')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}
              >
                <span className="material-symbols-rounded text-sm">add</span>
                Track Your First Application
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: analytics.total, icon: 'inbox', color: '#6366f1' },
              { label: 'Active', value: analytics.active, icon: 'pending', color: '#3b82f6' },
              { label: 'Response Rate', value: `${analytics.responseRate}%`, icon: 'reply', color: '#06b6d4' },
              { label: 'Interview Rate', value: `${analytics.interviewRate}%`, icon: 'mic', color: '#f59e0b' },
              { label: 'Offer Rate', value: `${analytics.offerRate}%`, icon: 'celebration', color: '#10b981' },
              { label: 'Avg Match', value: analytics.avgScore > 0 ? `${analytics.avgScore}%` : '—', icon: 'target', color: '#f43f5e' },
            ].map((kpi, i) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                    <span className="material-symbols-rounded text-[14px]" style={{ color: kpi.color }}>{kpi.icon}</span>
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium">{kpi.label}</span>
                </div>
                <p className="text-xl font-black text-[var(--text-primary)] tabular-nums">{kpi.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Smart Insight + Heatmap Row */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Smart Insight Card */}
            {analytics.smartInsight && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="rounded-2xl p-4 flex items-start gap-3" style={{ background: `${analytics.insightColor}08`, border: `1px solid ${analytics.insightColor}20` }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${analytics.insightColor}15` }}>
                  <span className="material-symbols-rounded text-lg" style={{ color: analytics.insightColor }}>{analytics.insightIcon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: analytics.insightColor }}>Insight</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{analytics.smartInsight}</p>
                </div>
              </motion.div>
            )}

            {/* 4-Week Heatmap */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span className="material-symbols-rounded text-blue-500 text-lg">calendar_month</span>
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
                        className={`aspect-square rounded-md transition-all ${isToday ? 'ring-1 ring-blue-500/40' : ''}`}
                        style={{
                          background: day.count > 0 ? `rgba(59, 130, 246, ${intensity})` : 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-sm">
                        {day.count} app{day.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-[var(--text-muted)]">4 weeks ago</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--text-muted)] mr-1">Less</span>
                  {[0, 0.2, 0.5, 0.8, 1].map((v, i) => (
                    <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: v === 0 ? 'var(--bg-elevated)' : `rgba(59, 130, 246, ${v})`, border: '1px solid var(--border-subtle)' }} />
                  ))}
                  <span className="text-[10px] text-[var(--text-muted)] ml-1">More</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">Today</span>
              </div>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Pipeline Funnel */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-blue-500 text-lg">filter_alt</span>
                Pipeline Funnel
              </h3>
              <div className="space-y-3">
                {funnelStages.map((stage, i) => {
                  const count = analytics.statusCounts[stage] || 0;
                  const pct = (count / funnelMax) * 100;
                  const color = STATUS_COLORS[stage] || '#64748b';
                  return (
                    <div key={stage}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">{STATUS_LABELS[stage]}</span>
                        <span className="text-xs font-black tabular-nums" style={{ color }}>{count}</span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
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
              className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-blue-500 text-lg">donut_large</span>
                Status Breakdown
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_FLOW.map(status => {
                  const count = analytics.statusCounts[status] || 0;
                  if (count === 0) return null;
                  const color = STATUS_COLORS[status];
                  const pct = Math.round((count / analytics.total) * 100);
                  return (
                    <div key={status} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: `${color}08` }}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-[var(--text-primary)]">{STATUS_LABELS[status]}</p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">{count} ({pct}%)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Velocity */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-blue-500 text-lg">speed</span>
                Application Velocity
              </h3>
              <div className="flex items-center gap-4 mb-3">
                <p className="text-4xl font-black text-[var(--text-primary)] tabular-nums">{analytics.weeklyVelocity}</p>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">apps/week</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">Last 4 weeks average</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <span className="material-symbols-rounded text-[14px]">info</span>
                Top career coaches recommend 10-15 targeted applications per week.
              </div>
            </motion.div>

            {/* Top Companies */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="material-symbols-rounded text-blue-500 text-lg">apartment</span>
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
                      <span className="text-xs font-bold text-blue-500 tabular-nums">{count}</span>
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
