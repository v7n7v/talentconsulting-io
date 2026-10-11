'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { workspaceCompatibilityHref } from '@/lib/workspace-compatibility';

type ApplicationsContextProps = {
  active: 'tracking' | 'review' | 'search';
  context?: string;
};

const tabs = [
  { id: 'tracking', label: 'Tracking', href: '/suite/applications', icon: 'work' },
  { id: 'review', label: 'Needs review', href: '/suite/applications?view=review', icon: 'pending_actions' },
] as const;

export default function ApplicationsContext({ active, context }: ApplicationsContextProps) {
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());
  return (
    <nav className="taco-applications-context mb-4 flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-3" aria-label="Applications workspace">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Applications
      </span>
      {tabs.map(tab => (
        <Link
          key={tab.id}
          href={workspaceCompatibilityHref(tab.href, query)}
          aria-current={active === tab.id ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center gap-1.5 border px-3 text-xs font-semibold transition-colors ${active === tab.id
            ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-deep)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'}`}
        >
          <span className="material-symbols-rounded text-[15px]" aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </Link>
      ))}
      {context && <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">{context}</span>}
    </nav>
  );
}
