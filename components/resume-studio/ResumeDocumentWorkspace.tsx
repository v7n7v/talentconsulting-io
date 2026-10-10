'use client';

import { useId, useState, type ReactNode } from 'react';
import './resume-first-workspace.css';

export function ResumeDocumentWorkspace({ children, preview, templateName, mobileView: controlledView, onMobileViewChange }: {
  children: ReactNode;
  preview: ReactNode;
  templateName: string;
  mobileView?: 'edit' | 'preview';
  onMobileViewChange?: (view: 'edit' | 'preview') => void;
}) {
  const [localView, setLocalView] = useState<'edit' | 'preview'>('edit');
  const mobileView = controlledView || localView;
  const setMobileView = onMobileViewChange || setLocalView;
  const id = useId();
  return <section className="resume-document-workspace" data-mobile-view={mobileView} aria-label="Resume content and preview">
    <div className="resume-document-workspace__switch" aria-label="Workspace view">
      <button type="button" aria-pressed={mobileView === 'edit'} aria-controls={`${id}-edit`} onClick={() => setMobileView('edit')}>Edit</button>
      <button type="button" aria-pressed={mobileView === 'preview'} aria-controls={`${id}-preview`} onClick={() => setMobileView('preview')}>Preview</button>
    </div>
    <div id={`${id}-edit`} className="resume-document-workspace__editor">{children}</div>
    <aside id={`${id}-preview`} className="resume-document-workspace__preview" aria-label="Live resume preview">
      <header><div><p className="experience-eyebrow">Live preview</p><h2>{templateName}</h2></div><span>Updates as you edit</span></header>
      <p className="resume-document-workspace__caption">Inspect the actual PDF pages in Export before sending.</p>
      <div className="resume-document-workspace__paper">{preview}</div>
    </aside>
  </section>;
}
