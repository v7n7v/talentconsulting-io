'use client';

import type { ReactNode } from 'react';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';

export type ProofRequirementStatus = 'matched' | 'partial' | 'missing' | 'blocked';
export type ProofCheckTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface ProofEngineRequirement {
  label: string;
  status: ProofRequirementStatus;
  evidence: string;
  source?: string;
}

export interface ProofEngineFact {
  label: string;
  detail: string;
  tone: ProofCheckTone;
}

export interface ProofEngineClaim {
  claim: string;
  reason: string;
  decision: string;
}

export interface ProofEngineChange {
  before: string;
  after: string;
  rationale: string;
}

export interface ProofEngineFormatCheck {
  label: string;
  detail: string;
  tone: ProofCheckTone;
}

export interface ProofEngineReportData {
  title: string;
  description: string;
  score: number;
  scoreLabel: string;
  sourceLabel: string;
  requirements: ProofEngineRequirement[];
  preservedFacts: ProofEngineFact[];
  rejectedClaims: ProofEngineClaim[];
  changes: ProofEngineChange[];
  formattingChecks: ProofEngineFormatCheck[];
}

const requirementConfig: Record<ProofRequirementStatus, { label: string; icon: string; className: string }> = {
  matched: {
    label: 'Matched',
    icon: 'check_circle',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]',
  },
  partial: {
    label: 'Partial',
    icon: 'radio_button_partial',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
  missing: {
    label: 'Missing',
    icon: 'plagiarism',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
  blocked: {
    label: 'Blocked',
    icon: 'block',
    className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
  },
};

const toneIcon: Record<ProofCheckTone, { icon: string; className: string }> = {
  success: { icon: 'verified', className: 'icon-status-success' },
  warning: { icon: 'warning', className: 'icon-status-warning' },
  danger: { icon: 'error', className: 'icon-status-danger' },
  neutral: { icon: 'info', className: 'icon-neutral' },
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function RequirementBadge({ status }: { status: ProofRequirementStatus }) {
  const config = requirementConfig[status];

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border px-2 py-1 text-[11px] font-semibold ${config.className}`}>
      <Icon name={config.icon} className="text-[14px]" />
      {config.label}
    </span>
  );
}

function ProofSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <Icon name={icon} className="icon-neutral text-[17px]" />
        <h3 className="premium-heading-wrap text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function ProofEngineReport({
  report,
  className = '',
  compact = false,
}: {
  report: ProofEngineReportData;
  className?: string;
  compact?: boolean;
}) {
  const missingCount = report.requirements.filter(item => item.status === 'missing' || item.status === 'blocked').length;
  const checkedCount = report.requirements.length;
  const headerClassName = compact
    ? 'flex min-w-0 flex-col gap-4'
    : 'flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between';
  const statsClassName = compact
    ? 'grid w-full grid-cols-3 gap-2'
    : 'grid w-full shrink-0 grid-cols-3 gap-2 sm:min-w-[340px] xl:w-auto';
  const evidenceGridClassName = compact
    ? 'mt-5 grid gap-4'
    : 'mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]';
  const reviewGridClassName = compact
    ? 'mt-5 grid gap-4'
    : 'mt-5 grid gap-4 lg:grid-cols-2';

  return (
    <SuitePanel className={`p-5 ${className}`} as="article">
      <div className={headerClassName}>
        <div className="flex min-w-0 items-start gap-3">
          <SuiteToolIcon icon="science" size="md" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Proof Engine
            </p>
            <h2 className="premium-heading-wrap mt-1 text-lg font-bold text-[var(--text-primary)]">
              {report.title}
            </h2>
            <p className="premium-copy-wrap mt-1 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              {report.description}
            </p>
            <p className="mt-2 inline-flex rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
              Source: {report.sourceLabel}
            </p>
          </div>
        </div>
        <div className={statsClassName}>
          {[
            { label: report.scoreLabel, value: `${report.score}%` },
            { label: 'Checked', value: checkedCount },
            { label: 'Blocked', value: missingCount },
          ].map(item => (
            <div key={item.label} className="min-w-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              <p className="whitespace-nowrap text-lg font-black tabular-nums text-[var(--text-primary)]">{item.value}</p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={evidenceGridClassName}>
        <ProofSection title="Requirements and evidence" icon="fact_check">
          <div className="space-y-2" aria-label="Requirement evidence">
            {report.requirements.slice(0, 10).map(item => (
              <div key={`${item.label}-${item.status}`} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                  <span className="premium-copy-wrap mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{item.evidence}</span>
                  {item.source && (
                    <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">
                      Source: {item.source}
                    </span>
                  )}
                </span>
                <RequirementBadge status={item.status} />
              </div>
            ))}
            {checkedCount === 0 && (
              <p className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
                No requirements have been checked yet.
              </p>
            )}
          </div>
        </ProofSection>

        <div className="grid min-w-0 gap-4">
          <ProofSection title="Facts preserved" icon="verified">
            <div className="space-y-2">
              {report.preservedFacts.map(item => {
                const tone = toneIcon[item.tone];
                return (
                  <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[14px] bg-[var(--bg-elevated)] px-3 py-2.5">
                    <Icon name={tone.icon} className={`${tone.className} mt-0.5 shrink-0 text-[17px]`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                      <span className="premium-copy-wrap block text-xs leading-5 text-[var(--text-muted)]">{item.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </ProofSection>

          <ProofSection title="Claims blocked" icon="block">
            <div className="space-y-2">
              {report.rejectedClaims.length > 0 ? report.rejectedClaims.map(item => (
                <div key={item.claim} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.claim}</p>
                  <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-muted)]">{item.reason}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{item.decision}</p>
                </div>
              )) : (
                <p className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
                  No unsupported claims were added by this check.
                </p>
              )}
            </div>
          </ProofSection>
        </div>
      </div>

      <div className={reviewGridClassName}>
        <ProofSection title="Before and after explanation" icon="compare_arrows">
          <div className="space-y-2">
            {report.changes.map((item, index) => (
              <div key={`${item.before}-${index}`} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Before</p>
                    <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.before}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">After</p>
                    <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{item.after}</p>
                  </div>
                </div>
                <p className="premium-copy-wrap mt-3 border-t border-[var(--border-subtle)] pt-2 text-xs leading-5 text-[var(--text-muted)]">
                  {item.rationale}
                </p>
              </div>
            ))}
          </div>
        </ProofSection>

        <ProofSection title="ATS-safe checks" icon="rule">
          <div className="space-y-2">
            {report.formattingChecks.map(item => {
              const tone = toneIcon[item.tone];
              return (
                <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5">
                  <Icon name={tone.icon} className={`${tone.className} mt-0.5 shrink-0 text-[17px]`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                    <span className="premium-copy-wrap block text-xs leading-5 text-[var(--text-muted)]">{item.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </ProofSection>
      </div>

      {missingCount > 0 && (
        <p className="premium-copy-wrap mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs leading-5 text-[var(--text-muted)]">
          {missingCount} requirement{missingCount === 1 ? '' : 's'} need proof before they should appear in a resume, cover letter, or screening answer.
        </p>
      )}
    </SuitePanel>
  );
}
