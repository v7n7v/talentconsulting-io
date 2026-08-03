'use client';

import { useId, useRef, useState } from 'react';

type Category = 'bug' | 'feature' | 'general' | 'other';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'other', label: 'Other' },
];

/** The route's own ceiling (app/api/contact/route.ts): over this it answers 400. */
const MESSAGE_MAX = 5000;

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; caseId: string }
  | { kind: 'error'; message: string };

export default function ContactForm() {
  const [category, setCategory] = useState<Category>('general');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const resultRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const nameId = `${id}-name`;
  const emailId = `${id}-email`;
  const categoryId = `${id}-category`;
  const messageId = `${id}-message`;
  const countId = `${id}-count`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind === 'sending') return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, category, message }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; caseId?: string; error?: string }
        | null;

      if (res.status === 429) {
        // The route sets Retry-After in seconds. Saying how long beats "try later".
        const retryAfter = Number(res.headers.get('Retry-After'));
        const minutes = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter / 60) : null;
        setStatus({
          kind: 'error',
          message: minutes
            ? `That is three messages in an hour, which is our limit. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
            : 'That is three messages in an hour, which is our limit. Try again a little later.',
        });
        return;
      }
      if (!res.ok || !data?.success || !data.caseId) {
        setStatus({ kind: 'error', message: data?.error || 'The message could not be sent. Please try again.' });
        return;
      }
      setStatus({ kind: 'sent', caseId: data.caseId });
    } catch {
      setStatus({ kind: 'error', message: 'The message could not be sent. Check your connection and try again.' });
    } finally {
      // Move focus to the outcome so a screen reader is not left on a button
      // whose label no longer describes what happened.
      window.setTimeout(() => resultRef.current?.focus(), 0);
    }
  }

  if (status.kind === 'sent') {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        role="status"
        className="glass-card mt-8 max-w-xl p-6 outline-none"
      >
        <h2 className="text-lg font-semibold tracking-tight">Message received</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Your reference is{' '}
          <span className="font-semibold tabular-nums text-[var(--text-primary)]">{status.caseId}</span>. A
          confirmation is on its way to the address you gave.
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          We stored your name, email address, category and message so we can reply. Nothing else was
          collected, and it is not used for marketing.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-xl">
      {/* Nothing here autofills or prefills: this collects personal data from
          someone who may not have an account, and guessing at their identity
          would be inventing it. */}
      <div className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor={nameId} className="text-sm font-medium text-[var(--text-primary)]">
            Your name
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            required
            maxLength={200}
            autoComplete="off"
            className="min-h-[44px] w-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)]"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor={emailId} className="text-sm font-medium text-[var(--text-primary)]">
            Email address
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="off"
            className="min-h-[44px] w-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)]"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor={categoryId} className="text-sm font-medium text-[var(--text-primary)]">
            What is this about?
          </label>
          <select
            id={categoryId}
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="min-h-[44px] w-full border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label htmlFor={messageId} className="text-sm font-medium text-[var(--text-primary)]">
            Message
          </label>
          <textarea
            id={messageId}
            name="message"
            required
            rows={7}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={countId}
            className="w-full resize-y border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3 text-sm leading-6 text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)]"
          />
          <p id={countId} className="text-xs tabular-nums text-[var(--text-muted)]">
            {message.length.toLocaleString()} of {MESSAGE_MAX.toLocaleString()} characters
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status.kind === 'sending'}
          className="btn-secondary inline-flex min-h-[44px] items-center disabled:opacity-60"
        >
          {status.kind === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        <p className="text-xs text-[var(--text-muted)]">Three messages an hour, per address.</p>
      </div>

      <div ref={resultRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {status.kind === 'error' ? (
          <p className="mt-4 flex gap-2 text-sm text-[var(--danger)]">
            <span aria-hidden="true" className="material-symbols-rounded shrink-0 text-base">error</span>
            <span className="min-w-0">{status.message}</span>
          </p>
        ) : null}
      </div>
    </form>
  );
}
