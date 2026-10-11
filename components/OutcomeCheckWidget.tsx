'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { authFetch } from '@/lib/auth-fetch';
import { showToast } from '@/components/Toast';

interface PendingOutcome {
  id: string;
  company_name: string;
  job_title: string;
  applied_at: string;
  days_ago: number;
  talent_density_score: number | null;
}

const OUTCOMES = [
  { id: 'callback',  label: 'Callback',  icon: 'call',         color: 'var(--success)' },
  { id: 'interview', label: 'Interview', icon: 'mic',          color: 'var(--accent)' },
  { id: 'offer',     label: 'Offer!',    icon: 'celebration',  color: 'var(--warning)' },
  { id: 'rejection', label: 'Rejected',  icon: 'cancel',       color: 'var(--danger)' },
  { id: 'ghosted',   label: 'Ghosted',   icon: 'visibility_off', color: 'var(--text-muted)' },
];

const DISMISS_KEY = 'talent-outcome-check-dismissed';

export default function OutcomeCheckWidget() {
  const user = useStore((s) => s.user);
  const [pending, setPending] = useState<PendingOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;

    // Check dismiss timestamp
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    authFetch('/api/applications/outcome')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.pending?.length > 0) {
          setPending(data.pending.slice(0, 3));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleReport = async (appId: string, outcome: string) => {
    setReportingId(appId);
    try {
      const res = await authFetch('/api/applications/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: appId, outcome, source: 'user_prompt' }),
      });
      const data = await res.json();
      if (data.success) {
        setPending(prev => prev.filter(p => p.id !== appId));
        const outcomeLabel = OUTCOMES.find(o => o.id === outcome)?.label || outcome;
        showToast(`Logged: ${outcomeLabel}`, 'check_circle');
      }
    } catch {
      showToast('Failed to log outcome', 'cancel');
    }
    setReportingId(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  if (!user || loading || dismissed || pending.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-dim)] border border-[var(--border-subtle)] flex items-center justify-center">
            <span className="material-symbols-rounded text-[var(--accent)] text-[13px]">update</span>
          </div>
          <h2 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Any Updates?
          </h2>
          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
            {pending.length}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="inline-flex min-h-[44px] items-center text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors gap-1"
        >
          Skip for now
          <span className="material-symbols-rounded text-[13px]">close</span>
        </button>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {pending.map((app, i) => (
            <motion.div
              key={app.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0 }}
              transition={{ delay: 0.05 * i }}
              className="rounded-xl border p-4 transition-all"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[var(--accent)]">
                    {app.company_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                      {app.company_name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {app.job_title || 'Position'} · {app.days_ago}d ago
                    </p>
                  </div>
                </div>
                {app.talent_density_score && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                    app.talent_density_score >= 80 ? 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]' :
                    app.talent_density_score >= 60 ? 'bg-[var(--accent-dim)] text-[var(--accent)]' :
                    'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]'
                  }`}>
                    {app.talent_density_score}%
                  </span>
                )}
              </div>

              {/* Outcome buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {OUTCOMES.map(o => (
                  <button
                    key={o.id}
                    onClick={() => handleReport(app.id, o.id)}
                    disabled={reportingId === app.id}
                    className="flex min-h-[44px] items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
                    style={{
                      borderColor: `color-mix(in srgb, ${o.color} 25%, transparent)`,
                      background: `color-mix(in srgb, ${o.color} 8%, transparent)`,
                      color: o.color,
                    }}
                  >
                    <span className="material-symbols-rounded text-[14px]">{o.icon}</span>
                    {o.label}
                  </button>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
