'use client';

import type { ReactNode } from 'react';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';

type ReviewStatus = 'empty' | 'loading' | 'ready' | 'needs_review' | 'blocked' | 'approved' | 'error';
type ProofTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface ReviewArtifact {
  label: string;
  description: string;
  status: ReviewStatus;
  icon: string;
  meta?: string;
}

export interface ProofItem {
  label: string;
  description: string;
  tone: ProofTone;
  icon: string;
}

export interface ReviewStateItem {
  label: string;
  description: string;
  status: ReviewStatus;
}

const statusConfig: Record<ReviewStatus, { label: string; icon: string; className: string }> = {
  empty: {
    label: 'Empty',
    icon: 'inventory_2',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]',
  },
  loading: {
    label: 'Preparing',
    icon: 'progress_activity',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]',
  },
  ready: {
    label: 'Ready',
    icon: 'task_alt',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]',
  },
  needs_review: {
    label: 'Review',
    icon: 'pending_actions',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
  blocked: {
    label: 'Blocked',
    icon: 'lock',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
  approved: {
    label: 'Approved',
    icon: 'verified',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]',
  },
  error: {
    label: 'Error',
    icon: 'error',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
};

const proofToneClass: Record<ProofTone, string> = {
  success: 'icon-status-success',
  warning: 'icon-status-warning',
  danger: 'icon-status-danger',
  neutral: 'icon-neutral',
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const config = statusConfig[status];

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border px-2 py-1 text-[11px] font-semibold ${config.className}`}>
      <Icon name={config.icon} className={`text-[14px] ${status === 'loading' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}

export function ApplicationPacketReview({
  title,
  description,
  artifacts,
  primaryAction,
  secondaryAction,
  className = '',
}: {
  title: string;
  description: string;
  artifacts: ReviewArtifact[];
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const pendingCount = artifacts.filter(item => ['needs_review', 'blocked', 'error'].includes(item.status)).length;

  return (
    <SuitePanel className={`p-5 ${className}`} as="article">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Application packet
          </p>
          <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        <SuiteToolIcon icon={pendingCount > 0 ? 'pending_actions' : 'approval_delegation'} size="sm" />
      </div>

      <div className="mt-4 space-y-2" aria-label="Application packet artifacts">
        {artifacts.map((artifact) => (
          <div
            key={artifact.label}
            className="flex min-w-0 items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5"
            aria-busy={artifact.status === 'loading'}
          >
            <Icon name={artifact.icon} className="icon-neutral shrink-0 text-[18px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{artifact.label}</span>
              <span className="block truncate text-xs text-[var(--text-muted)]">
                {artifact.meta ? `${artifact.description} · ${artifact.meta}` : artifact.description}
              </span>
            </span>
            <ReviewStatusBadge status={artifact.status} />
          </div>
        ))}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </SuitePanel>
  );
}

export function ProofChecklist({
  title,
  description,
  items,
  action,
  className = '',
}: {
  title: string;
  description: string;
  items: ProofItem[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <SuitePanel className={`p-5 ${className}`} as="article">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Proof Engine
          </p>
          <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        <SuiteToolIcon icon="science" size="sm" />
      </div>

      <div className="mt-4 space-y-2" aria-label="Proof checks">
        {items.map((item) => (
          <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[14px] bg-[var(--bg-elevated)] px-3 py-2.5">
            <Icon name={item.icon} className={`${proofToneClass[item.tone]} mt-0.5 shrink-0 text-[17px]`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
              <span className="block text-xs leading-5 text-[var(--text-muted)]">{item.description}</span>
            </span>
          </div>
        ))}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </SuitePanel>
  );
}

export function ReviewStateRail({
  states,
  className = '',
}: {
  states: ReviewStateItem[];
  className?: string;
}) {
  return (
    <SuitePanel className={`p-4 ${className}`} as="section">
      <div className="flex min-w-0 items-start gap-3">
        <SuiteToolIcon icon="rule" size="sm" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            State model
          </p>
          <h2 className="premium-heading-wrap mt-1 text-base font-bold text-[var(--text-primary)]">
            Every AI output gets a visible state.
          </h2>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {states.map((state) => (
          <div key={state.label} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
            <div className="flex items-center justify-between gap-2">
              <ReviewStatusBadge status={state.status} />
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{state.label}</p>
            <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-muted)]">{state.description}</p>
          </div>
        ))}
      </div>
    </SuitePanel>
  );
}
