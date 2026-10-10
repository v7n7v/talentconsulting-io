'use client';

import { TacoName } from '@/components/BrandLogo';
import { useMemo } from 'react';
import {
  applyResumeReviewDecisions,
  deriveResumeReviewLedger,
  getResumeReviewDecisionScope,
  updateResumeReviewDecision,
  type ResumeReviewChange,
  type ResumeReviewResume,
  type ResumeReviewState,
} from '@/lib/resume-review-ledger';
import { ResumeStudioHeader } from './ResumeStudioHeader';
import type { ResumeStudioSection, ResumeStudioSectionStatus } from './ResumeStudioProgress';

interface ResumeReviewWorkbenchProps {
  onNavigate?: (section: ResumeStudioSection) => void;
  statuses?: Record<ResumeStudioSection, ResumeStudioSectionStatus>;
  sourceResume: ResumeReviewResume | null;
  candidateResume: ResumeReviewResume | null;
  reviewState: ResumeReviewState;
  onReviewStateChange: (state: ResumeReviewState) => void;
  onContinue: (resume: ResumeReviewResume) => void;
  onBack: () => void;
  onStartOver: () => void;
  targetLabel: string;
  morphStrength: number;
  fitScore: number | null;
  atsScore: number | null;
  proofScore: number | null;
  protectedCount: number | null;
  saveState: 'idle' | 'saved' | 'error';
  savedAt: number | null;
  isPro: boolean;
  onRunAtsScan: () => void;
  atsScanLoading: boolean;
}

function normalizeLine(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function selectedLine(value: string, selectedTexts: string[]) {
  const normalized = normalizeLine(value);
  return selectedTexts.some(item => normalizeLine(item) === normalized);
}

function ResumeDocument({
  resume,
  label,
  selectedSection,
  selectedTexts,
  documentKey,
}: {
  resume: ResumeReviewResume;
  label: 'Source resume' | 'Tailored resume';
  selectedSection?: ResumeReviewChange['section'];
  selectedTexts: string[];
  documentKey: 'source' | 'tailored';
}) {
  return (
    <article
      data-resume-document={documentKey}
      className={`resume-review-document is-${documentKey}`}
      tabIndex={0}
      aria-label={label}
    >
      <div className="resume-review-document__tag">{label}</div>
      <header className={selectedSection === 'identity' ? 'is-selected-section' : undefined}>
        <div>
          <h2>{resume.name || 'Candidate name'}</h2>
          <p className="resume-review-document__title">{resume.title || 'Professional title'}</p>
        </div>
        <address>
          {[resume.email, resume.phone, resume.location].filter(Boolean).map(value => (
            <span key={value}>{value}</span>
          ))}
        </address>
      </header>

      {resume.summary && (
        <section className={selectedSection === 'summary' ? 'is-selected-section' : undefined}>
          <h3>Professional summary</h3>
          <p className={selectedLine(resume.summary, selectedTexts) ? 'is-selected-line' : undefined}>
            {resume.summary}
          </p>
        </section>
      )}

      {!!resume.experience?.length && (
        <section className={selectedSection === 'experience' ? 'is-selected-section' : undefined}>
          <h3>Experience</h3>
          {resume.experience.map((entry, index) => (
            <div className="resume-review-document__entry" key={`${entry.company}-${entry.role}-${index}`}>
              <div className="resume-review-document__entry-heading">
                <div>
                  <h4>{entry.role}</h4>
                  <p>{entry.company}</p>
                </div>
                <span>{entry.duration}</span>
              </div>
              {!!entry.achievements?.length && (
                <ul>
                  {entry.achievements.map((achievement, achievementIndex) => (
                    <li
                      key={`${achievement}-${achievementIndex}`}
                      className={selectedLine(achievement, selectedTexts) ? 'is-selected-line' : undefined}
                    >
                      {achievement}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {!!resume.education?.length && (
        <section className={selectedSection === 'education' ? 'is-selected-section' : undefined}>
          <h3>Education</h3>
          {resume.education.map((entry, index) => (
            <div className="resume-review-document__entry" key={`${entry.institution}-${index}`}>
              <div className="resume-review-document__entry-heading">
                <div>
                  <h4>{entry.degree}</h4>
                  <p>{entry.institution}</p>
                </div>
                <span>{entry.year}</span>
              </div>
              {entry.details && <p>{entry.details}</p>}
            </div>
          ))}
        </section>
      )}

      {!!resume.skills?.length && (
        <section className={selectedSection === 'skills' ? 'is-selected-section' : undefined}>
          <h3>Skills</h3>
          <div className="resume-review-document__skills">
            {resume.skills.map((group, index) => {
              const line = `${group.category}: ${group.items.join(', ')}`;
              return (
                <p key={`${group.category}-${index}`} className={selectedLine(line, selectedTexts) ? 'is-selected-line' : undefined}>
                  <strong>{group.category}:</strong> {group.items.join(', ')}
                </p>
              );
            })}
          </div>
        </section>
      )}

      {!!resume.certifications?.length && (
        <section className={selectedSection === 'certifications' ? 'is-selected-section' : undefined}>
          <h3>Certifications</h3>
          <p>{resume.certifications.join(' · ')}</p>
        </section>
      )}
    </article>
  );
}

export function ResumeReviewWorkbench({
  sourceResume,
  candidateResume,
  reviewState,
  onReviewStateChange,
  onContinue,
  onBack,
  onStartOver,
  targetLabel,
  morphStrength,
  fitScore,
  atsScore,
  proofScore,
  protectedCount,
  saveState,
  savedAt,
  isPro,
  onRunAtsScan,
  atsScanLoading,
  onNavigate, statuses,
}: ResumeReviewWorkbenchProps) {
  const ledger = useMemo(
    () => deriveResumeReviewLedger(sourceResume, candidateResume),
    [sourceResume, candidateResume],
  );
  const validChanges = ledger.changes;
  const selected = validChanges.find(change => change.id === reviewState.selectedId) || validChanges[0] || null;
  const selectedIndex = selected ? validChanges.findIndex(change => change.id === selected.id) : -1;
  const selectedScope = selected ? getResumeReviewDecisionScope(selected) : null;
  const selectedScopeLines = selectedScope
    ? validChanges
      .filter(change => getResumeReviewDecisionScope(change) === selectedScope)
      .reduce((sum, change) => sum + change.affectedLines, 0)
    : 0;

  const reviewedResume = useMemo(() => {
    if (!sourceResume || !candidateResume) return null;
    return applyResumeReviewDecisions(sourceResume, candidateResume, validChanges, reviewState.decisions);
  }, [candidateResume, reviewState.decisions, sourceResume, validChanges]);

  const unsupportedCount = validChanges.filter(change => (
    change.kind === 'needs-review' && reviewState.decisions[change.id] !== 'reverted'
  )).length;
  const reviewedCount = validChanges.filter(change => Boolean(reviewState.decisions[change.id])).length;
  const allReviewed = reviewedCount === validChanges.length;
  const canContinue = Boolean(reviewedResume && unsupportedCount === 0 && allReviewed);

  const updateState = (patch: Partial<ResumeReviewState>) => {
    onReviewStateChange({ ...reviewState, ...patch, version: 1 });
  };

  const decide = (change: ResumeReviewChange, decision: 'accepted' | 'reverted') => {
    if (change.kind === 'needs-review' && decision === 'accepted') return;
    updateState({
      decisions: updateResumeReviewDecision(validChanges, reviewState.decisions, change.id, decision),
    });
  };

  const selectNext = () => {
    if (!validChanges.length) return;
    const next = validChanges[(selectedIndex + 1) % validChanges.length];
    updateState({ selectedId: next.id });
  };

  const saveLabel = saveState === 'saved'
    ? `Saved locally${savedAt ? ` · ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
    : saveState === 'error'
      ? 'Save needs attention'
      : 'Saving locally';
  // fitScore null means the alignment was never measured (no scorable job description),
  // not "fit is zero". It renders as the missing-evidence treatment, never a number.
  const atsLabel = atsScore === null ? 'ATS pending' : `ATS ${atsScore}`;
  const proofLabel = proofScore === null ? 'Comparison unavailable' : 'Source comparison available';

  return (
    <section className="resume-workbench resume-studio-system-shell" aria-label="Resume review workbench">
      <ResumeStudioHeader
        current="review" onNavigate={onNavigate} statuses={statuses}
        stageDescription="Check the proposed AI changes. Accept or revert each one, then continue to your template."
        backAction={<button type="button" className="resume-studio-header__secondary" onClick={onBack}>Back</button>}
        candidateName={candidateResume?.name || sourceResume?.name}
        candidateDetail={candidateResume?.title || sourceResume?.title || 'Candidate'}
        targetLabel={targetLabel}
        saveLabel={saveLabel}
        secondaryAction={
          <button type="button" className="resume-studio-header__secondary" onClick={onStartOver}>
            Start over
          </button>
        }
        primaryAction={
          <button
            type="button"
            className="resume-studio-header__primary"
            disabled={!canContinue && validChanges.length > 0}
            data-guide="resume-review-next"
            onClick={() => reviewedResume && onContinue(reviewedResume)}
          >
            Continue to Template
            <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </button>
        }
      />

      <section className="resume-review-toolbar" aria-label="Review status and view">
        <div className="resume-review-toolbar__signals">
          {fitScore === null ? (
            <span className="resume-review-signal-missing" title="Add a job description to score role alignment">
              Fit — not scored yet
            </span>
          ) : (
            <span><strong>Fit {fitScore}</strong></span>
          )}
          {/* There was a `Clarity strong` chip here. It was a hardcoded string - no
              clarityScore, no computeClarity, nothing anywhere in the codebase produced
              it. Sat between Fit and Proof, both of which are real, so it read as a
              measured verdict. In a product whose whole claim is that nothing is
              invented, an invented verdict is the worst possible thing to leave in the
              one surface that shows the user their own evidence. */}
          <span className="is-verified">{proofLabel}</span>
          <span>Truth Lock · {protectedCount === null ? 'Protected' : `${protectedCount} fields`}</span>
          <span>Morph {morphStrength}%</span>
          {isPro && (
            <button type="button" onClick={onRunAtsScan} disabled={atsScanLoading}>
              <span className="material-symbols-rounded" aria-hidden="true">
                {atsScanLoading ? 'progress_activity' : 'scanner'}
              </span>
              {atsScanLoading ? 'Scanning' : atsLabel}
            </button>
          )}
        </div>
        <div className="resume-review-toolbar__views" role="group" aria-label="Review view">
          <button
            type="button"
            aria-pressed={reviewState.view === 'comparison'}
            disabled={!ledger.available}
            onClick={() => updateState({ view: 'comparison' })}
          >
            <span className="material-symbols-rounded" aria-hidden="true">view_column_2</span>
            Compare
          </button>
          <button
            type="button"
            aria-pressed={reviewState.view === 'focused'}
            onClick={() => updateState({ view: 'focused', documentTab: 'tailored' })}
          >
            <span className="material-symbols-rounded" aria-hidden="true">visibility</span>
            Preview
          </button>
        </div>
      </section>

      {!ledger.available || !sourceResume || !candidateResume || !reviewedResume ? (
        <section className="resume-review-unavailable">
          <span className="material-symbols-rounded" aria-hidden="true">difference</span>
          <div>
            <h2>Source comparison is unavailable</h2>
            <p>This draft does not include an immutable imported source. <TacoName /> will not invent one or relabel another version as the original.</p>
          </div>
          <button type="button" onClick={onBack}>Return to Target</button>
        </section>
      ) : (
        <section className={`resume-review-stage is-${reviewState.view}`}>
          <div className="resume-review-documents">
            <div className="resume-review-documents__scroller" aria-label="Source and tailored resume comparison">
              <ResumeDocument
                resume={sourceResume}
                label="Source resume"
                documentKey="source"
                selectedSection={selected?.section}
                selectedTexts={selected?.sourceText || []}
              />
              <div className="resume-review-bridge" aria-hidden="true">
                <span>Change</span>
                <strong>{validChanges.length ? `${selectedIndex + 1} of ${validChanges.length}` : '0 of 0'}</strong>
                <i className="material-symbols-rounded">sync_alt</i>
              </div>
              <ResumeDocument
                resume={reviewedResume}
                label="Tailored resume"
                documentKey="tailored"
                selectedSection={selected?.section}
                selectedTexts={selected?.candidateText || []}
              />
            </div>
          </div>

          <footer className="resume-review-decision-dock">
            <div className="resume-review-decision-dock__summary">
              {/* Three distinct states, told honestly. The old copy said "Review complete /
                  No source differences need a decision" whenever nothing was selected -
                  which read as success even when the tailoring pass had changed NOTHING at
                  all (0 of 0). That is the "maximum morph did nothing" the owner flagged.
                  The safe pass only reorders your own lines; when your order already fits,
                  it moves nothing, and saying so is more honest than implying it worked. */}
              <span>{selected ? 'Selected change' : validChanges.length === 0 ? 'Nothing to reorder' : 'Review complete'}</span>
              <strong>
                {selected?.title
                  || (validChanges.length === 0
                    ? 'Your lines already sit in a strong order for this role'
                    : 'Every change has a decision')}
              </strong>
              <p>
                {selected?.description
                  || (validChanges.length === 0
                    ? 'The safe pass only reorders your existing lines, and it found none worth moving — so your order and wording are unchanged. Rewriting lines to fit the role is a separate, reviewed step.'
                    : 'The tailored version preserves the source order and wording you approved.')}
              </p>
              {selected && (
                <small>
                  <span className="material-symbols-rounded" aria-hidden="true">fact_check</span>
                  {selectedScopeLines} {selectedScopeLines === 1 ? 'line' : 'lines'} tied to source evidence
                </small>
              )}
            </div>

            <div className="resume-review-decision-dock__actions">
              <button type="button" onClick={onBack}>
                <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
                Back
              </button>
              {selected && (
                <>
                  <button
                    type="button"
                    aria-pressed={reviewState.decisions[selected.id] === 'reverted'}
                    onClick={() => decide(selected, 'reverted')}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">undo</span>
                    Keep source
                  </button>
                  <button
                    type="button"
                    className="is-primary"
                    aria-pressed={reviewState.decisions[selected.id] === 'accepted'}
                    disabled={selected.kind === 'needs-review'}
                    onClick={() => decide(selected, 'accepted')}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">check_circle</span>
                    Accept change
                  </button>
                  <button type="button" className="is-next" onClick={selectNext}>
                    <span>Next change</span>
                    <strong>{validChanges.length ? `${selectedIndex + 1} of ${validChanges.length}` : '0 of 0'}</strong>
                    <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                  </button>
                </>
              )}
            </div>
          </footer>
        </section>
      )}
    </section>
  );
}
