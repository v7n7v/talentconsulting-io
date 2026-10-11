'use client';

import { useRef, useState, type ReactNode } from 'react';
import { SuitePanel, SuiteToolIcon } from '@/components/suite/SuiteToolChrome';
import './proof-engine-report.css';

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
  score: number | null;
  scoreLabel: string;
  sourceLabel: string;
  requirements: ProofEngineRequirement[];
  preservedFacts: ProofEngineFact[];
  rejectedClaims: ProofEngineClaim[];
  changes: ProofEngineChange[];
  formattingChecks: ProofEngineFormatCheck[];
}

type ProofStage = 'requirements' | 'facts' | 'claims' | 'changes' | 'checks';

interface StageConfig {
  id: ProofStage;
  label: string;
  shortLabel: string;
  icon: string;
  count: number;
}

const requirementConfig: Record<ProofRequirementStatus, { label: string; icon: string }> = {
  matched: { label: 'Matched', icon: 'check_circle' },
  partial: { label: 'Partial', icon: 'radio_button_partial' },
  missing: { label: 'Missing', icon: 'plagiarism' },
  blocked: { label: 'Blocked', icon: 'block' },
};

const toneIcon: Record<ProofCheckTone, { icon: string; className: string }> = {
  success: { icon: 'verified', className: 'is-success' },
  warning: { icon: 'warning', className: 'is-warning' },
  danger: { icon: 'error', className: 'is-danger' },
  neutral: { icon: 'info', className: 'is-neutral' },
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-rounded ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

function RequirementBadge({ status }: { status: ProofRequirementStatus }) {
  const config = requirementConfig[status];

  return (
    <span className="proof-requirement-badge" data-status={status}>
      <Icon name={config.icon} />
      {config.label}
    </span>
  );
}

function SectionHeading({
  icon,
  title,
  count,
  action,
}: {
  icon: string;
  title: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <header className="proof-section-heading">
      <span className="proof-section-heading__title">
        <Icon name={icon} />
        <span>{title}</span>
        <span className="proof-count-badge">{count}</span>
      </span>
      {action}
    </header>
  );
}

function FactRows({ facts }: { facts: ProofEngineFact[] }) {
  if (facts.length === 0) {
    return <p className="proof-empty-state">No preserved-fact checks are available yet.</p>;
  }

  return (
    <div className="proof-detail-list">
      {facts.map(item => {
        const tone = toneIcon[item.tone];
        return (
          <article key={item.label} className="proof-detail-row">
            <Icon name={tone.icon} className={`proof-detail-row__icon ${tone.className}`} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function ClaimRows({
  claims,
  expandedClaim,
  onToggle,
}: {
  claims: ProofEngineClaim[];
  expandedClaim: string | null;
  onToggle: (claim: string) => void;
}) {
  if (claims.length === 0) {
    return <p className="proof-empty-state">No unsupported claims were added by this check.</p>;
  }

  return (
    <div className="proof-accordion-list">
      {claims.map((item, index) => {
        const expanded = expandedClaim === item.claim;
        return (
          <article
            key={`${item.claim}-${index}`}
            className="proof-accordion-row"
            data-expanded={expanded ? 'true' : 'false'}
          >
            <button
              type="button"
              className="proof-accordion-row__trigger"
              aria-expanded={expanded}
              onClick={() => onToggle(item.claim)}
            >
              <span className="proof-row-index">{index + 1}</span>
              <span className="proof-accordion-row__label">
                <strong>{item.claim}</strong>
                <small>{item.reason}</small>
              </span>
              <span className="proof-claim-status">Restored</span>
              <Icon name={expanded ? 'expand_less' : 'expand_more'} />
            </button>
            {expanded ? (
              <div className="proof-accordion-row__body">
                <span className="proof-inline-callout">
                  <Icon name="shield_lock" />
                  <span>
                    <small>Protected decision</small>
                    <strong>{item.decision}</strong>
                  </span>
                </span>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ChangeRows({ changes }: { changes: ProofEngineChange[] }) {
  if (changes.length === 0) {
    return <p className="proof-empty-state">No before-and-after explanation is available yet.</p>;
  }

  return (
    <div className="proof-change-list">
      {changes.map((item, index) => (
        <article key={`${item.before}-${index}`} className="proof-change-row">
          <div>
            <small>Before</small>
            <p>{item.before}</p>
          </div>
          <Icon name="arrow_forward" />
          <div>
            <small>After</small>
            <p>{item.after}</p>
          </div>
          <p className="proof-change-row__rationale">{item.rationale}</p>
        </article>
      ))}
    </div>
  );
}

function CheckRows({ checks }: { checks: ProofEngineFormatCheck[] }) {
  if (checks.length === 0) {
    return <p className="proof-empty-state">No ATS-safe checks are available yet.</p>;
  }

  return (
    <div className="proof-detail-list">
      {checks.map(item => {
        const tone = toneIcon[item.tone];
        return (
          <article key={item.label} className="proof-detail-row">
            <Icon name={tone.icon} className={`proof-detail-row__icon ${tone.className}`} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </article>
        );
      })}
    </div>
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
  const missingCount = report.requirements.filter(
    item => item.status === 'missing' || item.status === 'blocked',
  ).length;
  const checkedCount = report.requirements.length;
  const boundedScore = report.score == null || !Number.isFinite(report.score)
    ? null
    : Math.min(Math.max(Math.round(report.score), 0), 100);
  const firstGapIndex = Math.max(
    report.requirements.findIndex(item => item.status === 'missing' || item.status === 'blocked'),
    0,
  );
  const [activeStage, setActiveStage] = useState<ProofStage>('requirements');
  const [expandedRequirement, setExpandedRequirement] = useState<number | null>(
    report.requirements.length > 0 ? firstGapIndex : null,
  );
  const [expandedClaim, setExpandedClaim] = useState<string | null>(
    report.rejectedClaims[0]?.claim || null,
  );
  const [expandedSummary, setExpandedSummary] = useState<ProofStage | null>(null);
  const stagePanelRef = useRef<HTMLDivElement>(null);

  const stages: StageConfig[] = [
    {
      id: 'requirements',
      label: 'Requirements and evidence',
      shortLabel: 'Match evidence',
      icon: 'fact_check',
      count: report.requirements.length,
    },
    {
      id: 'facts',
      label: 'Facts preserved',
      shortLabel: 'Facts protected',
      icon: 'verified_user',
      count: report.preservedFacts.length,
    },
    {
      id: 'claims',
      label: 'Claims blocked',
      shortLabel: 'Claims blocked',
      icon: 'block',
      count: report.rejectedClaims.length,
    },
    {
      id: 'changes',
      label: 'Before and after',
      shortLabel: 'Rewrite explained',
      icon: 'compare_arrows',
      count: report.changes.length,
    },
    {
      id: 'checks',
      label: 'ATS-safe checks',
      shortLabel: 'Export checks',
      icon: 'rule',
      count: report.formattingChecks.length,
    },
  ];
  const activeIndex = stages.findIndex(stage => stage.id === activeStage);
  const activeConfig = stages[activeIndex] || stages[0];
  const verdict = missingCount > 0
    ? 'Safe rewrite, weak evidence match'
    : 'Evidence aligned, facts protected';
  const verdictDetail = missingCount > 0
    ? 'The rewrite stayed safe, but the source supports only part of the target. Review the gaps to strengthen fit.'
    : 'The rewrite stayed inside the source evidence and preserved protected facts.';

  const activateStage = (stage: ProofStage, focusPanel = false) => {
    setActiveStage(stage);
    if (focusPanel) {
      window.requestAnimationFrame(() => {
        stagePanelRef.current?.focus({ preventScroll: true });
        stagePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  const reviewGaps = () => {
    setExpandedRequirement(firstGapIndex);
    activateStage('requirements', true);
  };

  const renderStage = () => {
    if (activeStage === 'facts') {
      return <FactRows facts={report.preservedFacts} />;
    }
    if (activeStage === 'claims') {
      return (
        <ClaimRows
          claims={report.rejectedClaims}
          expandedClaim={expandedClaim}
          onToggle={claim => setExpandedClaim(current => (current === claim ? null : claim))}
        />
      );
    }
    if (activeStage === 'changes') {
      return <ChangeRows changes={report.changes} />;
    }
    if (activeStage === 'checks') {
      return <CheckRows checks={report.formattingChecks} />;
    }

    if (report.requirements.length === 0) {
      return <p className="proof-empty-state">No requirements have been checked yet.</p>;
    }

    return (
      <div className="proof-accordion-list" aria-label="Requirement evidence">
        {report.requirements.slice(0, 10).map((item, index) => {
          const expanded = expandedRequirement === index;
          return (
            <article
              key={`${item.label}-${item.status}-${index}`}
              className="proof-accordion-row"
              data-expanded={expanded ? 'true' : 'false'}
            >
              <button
                type="button"
                className="proof-accordion-row__trigger"
                aria-expanded={expanded}
                onClick={() => setExpandedRequirement(current => (current === index ? null : index))}
              >
                <span className="proof-row-index">{index + 1}</span>
                <span className="proof-accordion-row__label">
                  <strong>{item.label}</strong>
                  <small>{item.source ? `Source: ${item.source}` : item.evidence}</small>
                </span>
                <RequirementBadge status={item.status} />
                <Icon name={expanded ? 'expand_less' : 'expand_more'} />
              </button>
              {expanded ? (
                <div className="proof-accordion-row__body">
                  <p className="proof-evidence-callout">
                    <Icon name={item.status === 'matched' ? 'verified' : 'info'} />
                    <span>{item.evidence}</span>
                  </p>
                  <dl className="proof-evidence-meta">
                    <div>
                      <dt>Source</dt>
                      <dd>{item.source || 'Source resume'}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{requirementConfig[item.status].label}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{item.status === 'matched' ? 'Found and preserved' : 'Needs proof'}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  };

  const toggleSummary = (stage: ProofStage) => {
    setExpandedSummary(current => (current === stage ? null : stage));
  };

  return (
    <SuitePanel
      className={`proof-engine-cockpit ${compact ? 'proof-engine-cockpit--compact' : ''} ${className}`}
      as="article"
    >
      <header className="proof-command-header">
        <div className="proof-command-header__identity">
          <SuiteToolIcon icon="science" size="md" />
          <div>
            <p className="proof-eyebrow">Proof Engine</p>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <span className="proof-source-chip">Source: {report.sourceLabel}</span>
          </div>
        </div>

        <div className="proof-verdict">
          <Icon name={missingCount > 0 ? 'shield' : 'verified_user'} />
          <span>
            <strong>{verdict}</strong>
            <small>{verdictDetail}</small>
          </span>
        </div>

        <div className="proof-fit-cluster" aria-label={`${report.scoreLabel}: ${boundedScore == null ? 'not scored' : boundedScore + '%'}`}>
          <span className="proof-fit-marker">
            <strong>{boundedScore == null ? '—' : `${boundedScore}%`}</strong>
          </span>
          <span className="proof-fit-track">
            <span className="proof-fit-track__label">
              <small>{report.scoreLabel}</small>
              <small>{boundedScore == null ? 'Not scored' : `${boundedScore}%`}</small>
            </span>
            <progress max={100} value={boundedScore ?? 0}>
              {boundedScore == null ? 'Not scored' : `${boundedScore}%`}
            </progress>
            <span className="proof-fit-track__range">
              <small>0%</small>
              <small>100%</small>
            </span>
          </span>
          <span className="proof-metric">
            <strong>{checkedCount}</strong>
            <small>Checked</small>
          </span>
          <span className="proof-metric">
            <strong>{missingCount}</strong>
            <small>Blocked</small>
          </span>
          <button type="button" className="proof-primary-action" onClick={reviewGaps}>
            Review {missingCount} gap{missingCount === 1 ? '' : 's'}
            <Icon name="arrow_forward" />
          </button>
        </div>
      </header>

      <nav className="proof-stage-strip" aria-label="Proof report stages">
        <div role="tablist" aria-label="Proof report stages">
          {stages.map((stage, index) => (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={activeStage === stage.id}
              aria-controls="proof-stage-panel"
              className="proof-stage-tab"
              data-active={activeStage === stage.id ? 'true' : 'false'}
              onClick={() => activateStage(stage.id)}
            >
              <span className="proof-stage-tab__number">{index + 1}</span>
              <Icon name={stage.icon} />
              <span>{stage.shortLabel}</span>
              <span className="proof-count-badge">{stage.count}</span>
            </button>
          ))}
        </div>
        <progress max={stages.length} value={activeIndex + 1} aria-hidden="true">
          Stage {activeIndex + 1} of {stages.length}
        </progress>
      </nav>

      <div className="proof-cockpit-grid">
        <nav className="proof-section-nav" aria-label="Proof report sections">
          {stages.map(stage => (
            <button
              key={stage.id}
              type="button"
              data-active={activeStage === stage.id ? 'true' : 'false'}
              onClick={() => activateStage(stage.id)}
            >
              <Icon name={stage.icon} />
              <span>{stage.label}</span>
              <span className="proof-count-badge">{stage.count}</span>
            </button>
          ))}
        </nav>

        <section className="proof-stage-workspace">
          <SectionHeading
            icon={activeConfig.icon}
            title={activeConfig.label}
            count={activeConfig.count}
            action={activeStage === 'requirements' && report.requirements.length > 1 ? (
              <button
                type="button"
                className="proof-text-action"
                onClick={() => {
                  const everyExpanded = expandedRequirement === -1;
                  setExpandedRequirement(everyExpanded ? firstGapIndex : -1);
                }}
              >
                {expandedRequirement === -1 ? 'Collapse all' : 'Expand all'}
                <Icon name={expandedRequirement === -1 ? 'unfold_less' : 'unfold_more'} />
              </button>
            ) : null}
          />
          <div
            key={activeStage}
            id="proof-stage-panel"
            ref={stagePanelRef}
            className="proof-stage-panel"
            role="tabpanel"
            tabIndex={-1}
          >
            {activeStage === 'requirements' && expandedRequirement === -1 ? (
              <div className="proof-accordion-list" aria-label="Requirement evidence">
                {report.requirements.slice(0, 10).map((item, index) => (
                  <article
                    key={`${item.label}-${item.status}-${index}`}
                    className="proof-accordion-row"
                    data-expanded="true"
                  >
                    <div className="proof-accordion-row__trigger proof-accordion-row__trigger--static">
                      <span className="proof-row-index">{index + 1}</span>
                      <span className="proof-accordion-row__label">
                        <strong>{item.label}</strong>
                        <small>{item.source ? `Source: ${item.source}` : item.evidence}</small>
                      </span>
                      <RequirementBadge status={item.status} />
                    </div>
                    <div className="proof-accordion-row__body">
                      <p className="proof-evidence-callout">
                        <Icon name={item.status === 'matched' ? 'verified' : 'info'} />
                        <span>{item.evidence}</span>
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : renderStage()}
          </div>
        </section>

        <aside className="proof-glance-rail" aria-label="Proof summary at a glance">
          <h3>At a glance</h3>
          <FactRows facts={report.preservedFacts.slice(0, 5)} />
        </aside>
      </div>

      <div className="proof-summary-deck">
        <article className="proof-summary-drawer" data-expanded={expandedSummary === 'claims' ? 'true' : 'false'}>
          <button type="button" onClick={() => toggleSummary('claims')} aria-expanded={expandedSummary === 'claims'}>
            <Icon name="block" />
            <strong>Claims blocked</strong>
            <span className="proof-count-badge">{report.rejectedClaims.length}</span>
            <small>
              {report.rejectedClaims[0]
                ? <>Top blocked: <b>{report.rejectedClaims[0].claim}</b> — {report.rejectedClaims[0].decision}</>
                : 'No unsupported claims were added.'}
            </small>
            <Icon name={expandedSummary === 'claims' ? 'expand_less' : 'expand_more'} />
          </button>
          {expandedSummary === 'claims' ? (
            <div className="proof-summary-drawer__body">
              <ClaimRows
                claims={report.rejectedClaims}
                expandedClaim={expandedClaim}
                onToggle={claim => setExpandedClaim(current => (current === claim ? null : claim))}
              />
            </div>
          ) : null}
        </article>

        <article className="proof-summary-drawer" data-expanded={expandedSummary === 'changes' ? 'true' : 'false'}>
          <button type="button" onClick={() => toggleSummary('changes')} aria-expanded={expandedSummary === 'changes'}>
            <Icon name="compare_arrows" />
            <strong>Before and after explanation</strong>
            <span className="proof-count-badge">{report.changes.length}</span>
            <small>
              {report.changes[0]
                ? `${report.changes[0].before} ${report.changes[0].after}`
                : 'No comparison is available yet.'}
            </small>
            <Icon name={expandedSummary === 'changes' ? 'expand_less' : 'expand_more'} />
          </button>
          {expandedSummary === 'changes' ? (
            <div className="proof-summary-drawer__body">
              <ChangeRows changes={report.changes} />
            </div>
          ) : null}
        </article>

        <article className="proof-summary-drawer" data-expanded={expandedSummary === 'checks' ? 'true' : 'false'}>
          <button type="button" onClick={() => toggleSummary('checks')} aria-expanded={expandedSummary === 'checks'}>
            <Icon name="rule" />
            <strong>ATS-safe checks</strong>
            <span className="proof-count-badge">{report.formattingChecks.length}</span>
            <small>
              {report.formattingChecks.filter(item => item.tone === 'warning' || item.tone === 'danger').length} issues to review
              {' · '}
              {report.formattingChecks[0]?.detail || 'Export checks are available.'}
            </small>
            <Icon name={expandedSummary === 'checks' ? 'expand_less' : 'expand_more'} />
          </button>
          {expandedSummary === 'checks' ? (
            <div className="proof-summary-drawer__body">
              <CheckRows checks={report.formattingChecks} />
            </div>
          ) : null}
        </article>
      </div>
    </SuitePanel>
  );
}
