'use client';

import type { ReactNode } from 'react';

export interface ResumeStartPanelProps {
  children: ReactNode;
  onPaste: () => void;
  onBlank: () => void;
  onFromExperience?: () => void;
  onUpload?: () => void;
  hasExperience: boolean;
  onContinue?: () => void;
  compact?: boolean;
}

export function ResumeStartPanel({ children, onPaste, onBlank, onFromExperience, onUpload, hasExperience, onContinue, compact = false }: ResumeStartPanelProps) {
  if (compact) return <section className="resume-start-panel resume-start-panel--compact" aria-labelledby="resume-start-title">
    <div className="resume-start-panel__intro"><p className="experience-eyebrow">Keep moving</p><h2 id="resume-start-title">New resume</h2></div>
    <div className="resume-start-panel__alternatives" aria-label="Ways to start a resume" data-guide="resume-alternatives">
      {onContinue && <button type="button" className="resume-start-panel__continue" onClick={onContinue}>Continue editing</button>}
      {onUpload && <button type="button" data-guide="resume-start" className="resume-start-panel__upload" style={{ minHeight: 44, backgroundColor: 'var(--taco-action)', color: 'var(--taco-action-ink)', border: '1px solid var(--border)', paddingInline: 12, textDecoration: 'none' }} onClick={onUpload}>Upload resume</button>}
      <button type="button" onClick={onBlank}>Start blank</button>
      <button type="button" onClick={onPaste}>Paste resume text</button>
      {hasExperience && onFromExperience && <button type="button" onClick={onFromExperience}>Use saved career details</button>}
    </div>
  </section>;
  return <section className="resume-start-panel" aria-labelledby="resume-start-title">
    <div className="resume-start-panel__intro"><p className="experience-eyebrow">Step 1 · Upload</p><h2 id="resume-start-title">Upload your resume</h2><p>Bring your real experience. Check the facts, shape your resume and choose how to use it.</p></div>
    <div className="resume-start-panel__dropzone" aria-label="Upload a resume" data-guide="resume-start">{children}</div>
    <div className="resume-start-panel__alternatives" aria-label="Other ways to start" data-guide="resume-alternatives"><span>Or start another way</span><button type="button" onClick={onPaste}>Paste resume text</button><button type="button" onClick={onBlank}>Start blank</button>{hasExperience && onFromExperience && <button type="button" onClick={onFromExperience}>Use saved career details</button>}{onContinue && <button type="button" onClick={onContinue}>Continue</button>}</div>
  </section>;
}
