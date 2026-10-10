'use client';

export type ResumeStudioStage = 'source' | 'target' | 'shape' | 'review' | 'design' | 'ship';
export type ResumeStudioSection = 'source' | 'target' | 'shape' | 'design' | 'ship';
export type ResumeStudioSectionStatus = 'not-started' | 'in-progress' | 'ready' | 'attention' | 'outdated';

const STAGES: { id: ResumeStudioSection; label: string; currentFor: ResumeStudioStage[] }[] = [
  { id: 'source', label: 'Upload & Diagnose', currentFor: ['source'] },
  { id: 'target', label: 'Job Description', currentFor: ['target'] },
  { id: 'shape', label: 'AI Morph', currentFor: ['shape', 'review'] },
  { id: 'design', label: 'Template', currentFor: ['design'] },
  { id: 'ship', label: 'Export & Save', currentFor: ['ship'] },
];

export interface ResumeStudioProgressProps {
  current: ResumeStudioStage;
  onNavigate?: (stage: ResumeStudioSection) => void;
  statuses?: Record<ResumeStudioSection, ResumeStudioSectionStatus>;
}

const STATUS_LABELS: Record<ResumeStudioSectionStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  ready: 'Ready',
  attention: 'Needs attention',
  outdated: 'Needs regeneration',
};

export function ResumeStudioProgress({ current, onNavigate, statuses }: ResumeStudioProgressProps) {
  return (
    <nav className="resume-studio-progress resume-guided-workflow__progress" aria-label="Resume Studio sections">
      <ol>
        {STAGES.map((stage) => {
          const isCurrent = stage.currentFor.includes(current);
          const status = statuses?.[stage.id] ?? (isCurrent ? 'in-progress' : 'not-started');
          const statusLabel = STATUS_LABELS[status];
          return (
            <li key={stage.id} className={isCurrent ? 'is-current' : undefined} data-status={status}>
              <button
                type="button"
                className="resume-guided-workflow__section-button"
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${stage.label}: ${statusLabel}${isCurrent ? ', current section' : ''}`}
                onClick={() => onNavigate?.(stage.id)}
              >
                <span className="resume-studio-progress__marker" aria-hidden="true">{STAGES.indexOf(stage) + 1}</span>
                <span className="resume-guided-workflow__section-copy">
                  <span className="resume-studio-progress__label">{stage.label}</span>
                  <span className="resume-guided-workflow__status">{statusLabel}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
