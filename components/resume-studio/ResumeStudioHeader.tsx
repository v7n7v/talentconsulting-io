'use client';

import type { ReactNode } from 'react';
import PageHelp from '@/components/PageHelp';
import { ToolGuidanceInvitation } from '@/components/guidance/ToolGuidanceProvider';
import { ResumeStudioProgress, type ResumeStudioProgressProps, type ResumeStudioStage } from './ResumeStudioProgress';

interface ResumeStudioHeaderProps {
  current: ResumeStudioStage;
  candidateName?: string;
  candidateDetail?: string;
  targetLabel?: string;
  saveLabel?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  showProgress?: boolean;
  sourceLabel?: string;
  backAction?: ReactNode;
  stageDescription?: string;
  onNavigate?: ResumeStudioProgressProps['onNavigate'];
  statuses?: ResumeStudioProgressProps['statuses'];
}

export function ResumeStudioHeader({
  current,
  candidateName,
  candidateDetail,
  targetLabel,
  saveLabel = 'Not saved',
  primaryAction,
  secondaryAction,
  showProgress = true,
  sourceLabel = 'Source-aware editing',
  backAction,
  stageDescription,
  onNavigate,
  statuses,
}: ResumeStudioHeaderProps) {
  return (
    <header className="resume-studio-header resume-guided-workflow" data-guide="resume-context">
      <div className="resume-studio-header__top">
        <div className="resume-studio-header__brand">
          {backAction && <span className="resume-guided-workflow__back">{backAction}</span>}
          <span className="material-symbols-rounded" aria-hidden="true">description</span>
          <h1 className="resume-studio-title">Resume Studio</h1>
        </div>

        {showProgress && <ResumeStudioProgress current={current} onNavigate={onNavigate} statuses={statuses} />}

        <div className="resume-studio-header__context" aria-label="Resume Studio context">
          <div className="resume-studio-header__context-item">
            <span className="material-symbols-rounded" aria-hidden="true">person</span>
            <p>
              <strong>{candidateName || 'New resume'}</strong>
              <span>{candidateDetail || 'Candidate'}</span>
            </p>
          </div>
          <div className="resume-studio-header__context-item">
            <span className="material-symbols-rounded" aria-hidden="true">work</span>
            <p>
              <strong>{targetLabel || 'General resume'}</strong>
              <span>{targetLabel ? 'Target role' : 'Job targeting is optional'}</span>
            </p>
          </div>
          <div className="resume-studio-header__context-item is-trust">
            <span className="material-symbols-rounded" aria-hidden="true">verified_user</span>
            <p>
              <strong>{sourceLabel}</strong>
              <span>{saveLabel}</span>
            </p>
          </div>
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="resume-studio-header__actions">
            {secondaryAction}
            <span data-guide="resume-next">{primaryAction}</span>
          </div>
        )}
        <div className="resume-guided-workflow__help"><PageHelp toolId="resume" /></div>
      </div>
      {stageDescription && (
        <div className="resume-guided-workflow__description" aria-live="polite">
          {stageDescription}
        </div>
      )}
      <ToolGuidanceInvitation toolId="resume" />
    </header>
  );
}
