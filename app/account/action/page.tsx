'use client';

import { TacoWordmark } from '@/components/BrandLogo';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type AccountAction = 'deactivate' | 'delete';
type PageState = 'checking' | 'ready' | 'submitting' | 'success' | 'error';

function AccountActionContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [state, setState] = useState<PageState>('checking');
  const [action, setAction] = useState<AccountAction | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/account/lifecycle/confirm?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async response => ({ response, payload: await response.json() as { action?: AccountAction } }))
      .then(({ response, payload }) => {
        if (cancelled) return;
        if (!response.ok || !payload.action) throw new Error('invalid');
        setAction(payload.action);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setError('This confirmation link is invalid, expired, or already used.');
        setState('error');
      });
    return () => { cancelled = true; };
  }, [token]);

  async function confirm() {
    setState('submitting');
    const response = await fetch('/api/account/lifecycle/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    if (!response?.ok) {
      setError('This action could not be confirmed. The link may have expired or already been used.');
      setState('error');
      return;
    }
    setState('success');
  }

  const deleting = action === 'delete';
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-deep)] px-4 py-12 text-[var(--text-primary)]">
      <section className="elevation-raised w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 sm:p-8" aria-labelledby="account-action-title">
        <Link href="/" aria-label="Taco home"><TacoWordmark className="h-auto w-56 max-w-full" /></Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Account security</p>
        <h1 id="account-action-title" className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
          {state === 'success' ? 'Request confirmed' : deleting ? 'Confirm permanent deletion' : 'Confirm account deactivation'}
        </h1>
        {state === 'checking' ? <p className="mt-5 text-sm text-[var(--text-secondary)]" role="status">Checking your secure link…</p> : null}
        {state === 'ready' || state === 'submitting' ? (
          <div className="mt-5">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">{deleting
              ? 'Confirming records your permanent deletion request for secure processing under the retention policy. Data and access may not be recoverable after completion.'
              : 'Confirming pauses optional email and records your account as deactivated. Your retained data remains subject to the privacy policy.'}</p>
            <button type="button" onClick={confirm} disabled={state === 'submitting'} className={`mt-6 min-h-12 w-full rounded-xl px-5 py-3 text-sm font-bold text-[var(--accent-on)] transition hover:opacity-90 disabled:opacity-60 ${deleting ? 'bg-[var(--danger)]' : 'bg-[var(--warning)]'}`}>
              {state === 'submitting' ? 'Confirming…' : deleting ? 'Confirm deletion request' : 'Deactivate my account'}
            </button>
          </div>
        ) : null}
        {state === 'success' ? <div className="mt-5 rounded-2xl border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] p-4 text-sm leading-6 text-[var(--text-primary)]" role="status">{deleting ? 'Your deletion request is confirmed and queued for secure processing.' : 'Your account is deactivated and optional email is paused.'}</div> : null}
        {state === 'error' ? <div className="mt-5 rounded-2xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] p-4 text-sm text-[var(--text-primary)]" role="alert">{error}</div> : null}
        <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-[var(--accent)] underline underline-offset-4">Return to TalentConsulting.io</Link>
      </section>
    </main>
  );
}

export default function AccountActionPage() {
  return <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-[var(--bg-deep)] text-sm text-[var(--text-secondary)]">Checking your secure link…</main>}><AccountActionContent /></Suspense>;
}
