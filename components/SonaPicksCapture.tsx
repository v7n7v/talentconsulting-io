'use client';

import { useState } from 'react';
import Link from 'next/link';
import { analytics } from '@/lib/analytics';
import { authFetch } from '@/lib/auth-fetch';
import { readStoredAttribution } from '@/lib/attribution';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';

interface SonaPicksCaptureProps {
  className?: string;
  sourcePath?: string;
  tone?: 'dark' | 'light' | 'system';
}

export default function SonaPicksCapture({ className = '', sourcePath = 'public_capture', tone = 'system' }: SonaPicksCaptureProps) {
  const user = useStore((s) => s.user);
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState(false);
  const isLight = tone === 'light';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (user) {
        const res = await authFetch('/api/jobs/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            enabled: true,
            frequency: 'weekly',
            consentAcknowledged: true,
            source: sourcePath,
          }),
        });
        if (!res.ok) throw new Error('Could not enable Sona Picks');
        analytics.newsletterSubscribe(sourcePath, 'weekly');
        setCaptured(true);
        showToast('Sona Picks enabled', 'check_circle');
      } else {
        const attribution = readStoredAttribution();
        const res = await fetch('/api/newsletter/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            frequency: 'weekly',
            sourcePath,
            referrer: typeof document !== 'undefined' ? document.referrer : null,
            ...attribution,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not save email');
        }
        analytics.newsletterSubscribe(sourcePath, 'weekly');
        setCaptured(true);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save subscription', 'cancel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className={`rounded-[18px] border p-5 shadow-sm ${className}`}
      style={{
        background: isLight ? 'linear-gradient(135deg,#ffffff,#ecfeff)' : 'linear-gradient(135deg,rgba(6,182,212,0.08),rgba(16,185,129,0.08))',
        borderColor: isLight ? 'rgba(6,182,212,0.16)' : 'rgba(6,182,212,0.18)',
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-[10px] border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-500">
            <span className="material-symbols-rounded text-[14px]">radar</span>
            Sona Picks
          </div>
          <h2 className={`text-xl font-semibold tracking-tight ${isLight ? 'text-gray-950' : 'text-[var(--text-primary)]'}`}>
            Get crafted jobs in your inbox.
          </h2>
          <p className={`mt-2 text-sm leading-6 ${isLight ? 'text-gray-600' : 'text-[var(--text-secondary)]'}`}>
            Sona turns your target roles into a weekly short list of job matches with fit reasons, salary signals, and one-click application prep.
          </p>
        </div>

        <form onSubmit={submit} className="w-full max-w-md space-y-3">
          <div className="rounded-[12px] border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-left">
            <span className="block text-xs font-semibold text-[var(--text-primary)]">Weekly Sona Picks</span>
            <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">Best matches every Monday</span>
          </div>
          {!user && (
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-11 w-full rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-cyan-500/25"
            />
          )}
          <button
            type="submit"
            disabled={submitting || captured}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:opacity-90 disabled:opacity-60"
          >
            <span className="material-symbols-rounded text-[18px]">{captured ? 'check_circle' : 'mail'}</span>
            {captured ? 'Sona Picks saved' : submitting ? 'Saving...' : 'Get crafted jobs'}
          </button>
          {!user && captured && (
            <p className="text-center text-[11px] leading-5 text-[var(--text-muted)]">
              Create a free account to personalize matches from your resume. <Link href="/suite" className="font-semibold text-cyan-500">Open Talent Studio</Link>
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
