'use client';

import { useState } from 'react';
import type { ResumeVersion } from '@/lib/database-suite';
import { filterResumeVersionGroups, groupResumeVersions } from '@/lib/resume-library-groups';
import { normalizeResume } from '@/lib/resume-normalizer';
import { getSelectableTemplates, getPersistedResumeTemplateId, getPersistedResumePaletteId, getPersistedResumeDesign, getTemplateWithPalette } from '@/lib/resume-templates';
import { ResumeTemplate } from '@/components/resume-templates';

const TEMPLATES = getSelectableTemplates();

function ResumeMiniature({ version }: { version: ResumeVersion }) {
  const templateId = getPersistedResumeTemplateId(version);
  const template = TEMPLATES.find(item => item.id === templateId) || TEMPLATES[0];
  let normalized;
  try {
    normalized = normalizeResume(version.content);
  } catch {
    return <div className="experience-resume-miniature experience-resume-miniature--empty" aria-hidden="true"><span className="material-symbols-rounded">description</span></div>;
  }
  if (!template) return <div className="experience-resume-miniature experience-resume-miniature--empty" aria-hidden="true"><span className="material-symbols-rounded">description</span></div>;
  const selectedTemplate = getTemplateWithPalette(template, getPersistedResumePaletteId(version));
  return <div className="experience-resume-miniature" aria-hidden="true"><div className="experience-resume-miniature__page">
    <ResumeTemplate resume={normalized} templateId={selectedTemplate.id} colors={selectedTemplate.colors} design={getPersistedResumeDesign(version, normalized) || undefined} />
  </div></div>;
}

export function ResumeWorkspaceLibrary({ versions, loading, error, onRetry, onOpen, onTailor, onDuplicate, onUpdate }: {
  versions: ResumeVersion[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpen: (version: ResumeVersion) => void;
  onTailor?: (version: ResumeVersion) => void;
  onDuplicate: (version: ResumeVersion) => void | Promise<void>;
  onUpdate: (version: ResumeVersion, updates: { name?: string; archived?: boolean }) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const matches = (version: ResumeVersion) => {
    const archived = version.metadata?.archived === true;
    const targeted = Boolean(version.metadata?.jobDescription || version.metadata?.targetCompany || version.metadata?.workspace?.target?.company || version.metadata?.workspace?.target?.jobDescription);
    return (filter === 'archived' ? archived : !archived)
      && (filter !== 'general' || !targeted) && (filter !== 'targeted' || targeted)
      && [version.version_name, version.metadata?.targetRole, version.metadata?.targetCompany, version.metadata?.workspace?.target?.role, version.metadata?.workspace?.target?.company].join(' ').toLowerCase().includes(search.toLowerCase());
  };
  const groups = filterResumeVersionGroups(groupResumeVersions(versions), matches);
  const update = async (version: ResumeVersion, changes: { name?: string; archived?: boolean }) => {
    if (busy) return;
    setBusy(version.id); setLocalError('');
    try { await onUpdate(version, changes); setEditing(null); }
    catch (failure) { setLocalError(failure instanceof Error ? failure.message : 'This change could not be saved. Try again.'); }
    finally { setBusy(null); }
  };
  const duplicate = async (version: ResumeVersion) => {
    setLocalError('');
    try { await onDuplicate(version); }
    catch (failure) { setLocalError(failure instanceof Error ? failure.message : 'This resume could not be duplicated. Try again.'); }
  };
  return <section className="experience-library" aria-labelledby="resume-library-title">
    <div className="experience-section-title"><div><p className="experience-eyebrow">Your documents</p><h2 id="resume-library-title">Resume library</h2></div><span>{groups.length} {groups.length === 1 ? 'resume' : 'resumes'}</span></div>
    <div className="experience-library-filters">
      <label>Find a resume<input type="search" value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(12); }} placeholder="Name, role or company" /></label>
      <label>Show<select value={filter} onChange={event => { setFilter(event.target.value); setVisibleCount(12); }}><option value="active">All active</option><option value="general">General resumes</option><option value="targeted">Targeted resumes</option><option value="archived">Archived</option></select></label>
    </div>
    {loading && <p role="status">Loading your saved resumes…</p>}
    {(error || localError) && <div className="experience-notice" role="alert"><p>{localError || error}</p>{error && !localError && <button type="button" onClick={onRetry}>Try loading again</button>}</div>}
    {!loading && !error && groups.length === 0 && <div className="experience-empty"><h3>{search ? 'No matching resumes' : filter === 'archived' ? 'No archived resumes' : 'A place for your next version'}</h3><p>{search ? 'Try a different name, role or company.' : 'Create a general resume or a copy for a specific role. Your experience stays separate.'}</p></div>}
    <div className="experience-library-list">
      {groups.slice(0, visibleCount).map(group => {
        const version = group.versions[0];
        const targeted = Boolean(version.metadata?.jobDescription || version.metadata?.targetCompany || version.metadata?.workspace?.target?.company || version.metadata?.workspace?.target?.jobDescription);
        return <article key={group.id} className="experience-library-row">
          <ResumeMiniature version={version} />
          <div className="experience-library-row__details">
            <p className="experience-eyebrow">{targeted ? 'Targeted resume' : 'General resume'}{version.metadata?.archived ? ' · Archived' : ''}</p>
            {editing === version.id ? <form onSubmit={event => { event.preventDefault(); if (name.trim()) void update(version, { name: name.trim() }); }} className="experience-inline-form"><label>Resume name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} autoFocus /></label><button type="submit" disabled={Boolean(busy) || !name.trim()}>Save name</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></form> : <h3>{version.version_name || 'Untitled resume'}</h3>}
            <p>{[version.metadata?.targetRole || version.metadata?.workspace?.target?.role, version.metadata?.targetCompany || version.metadata?.workspace?.target?.company].filter(Boolean).join(' · ') || 'Ready to edit, design or export'}</p>
            <small>{Number.isFinite(Date.parse(version.updated_at || version.created_at)) ? new Date(version.updated_at || version.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'} · {version.metadata?.workspace?.parentVersionId ? 'Saved revision' : 'Original version'}</small>
            {group.versions.length > 1 && <details className="experience-version-history"><summary>Revision history ({group.versions.length})</summary><ul>{group.versions.map(revision => <li key={revision.id}><button type="button" onClick={() => onOpen(revision)}>{revision.version_name || 'Untitled resume'} <span>{Number.isFinite(Date.parse(revision.updated_at || revision.created_at)) ? new Date(revision.updated_at || revision.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'}</span></button></li>)}</ul></details>}
          </div>
          <div className="experience-row-actions">
            <button type="button" className="experience-row-actions__open" onClick={() => onOpen(version)} aria-label={`Open ${version.version_name || 'untitled resume'}`}>Open</button>
            {onTailor && <button type="button" onClick={() => onTailor(version)} aria-label={`Tailor ${version.version_name || 'untitled resume'} to a job`}>Tailor to a job</button>}
            <details className="experience-library-menu"><summary aria-label={`More actions for ${version.version_name || 'untitled resume'}`}><span aria-hidden="true">•••</span></summary><div className="experience-library-menu__items">
              <button type="button" disabled={Boolean(busy)} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditing(version.id); setName(version.version_name); }}>Rename</button>
              <button type="button" disabled={Boolean(busy)} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void duplicate(version); }}>Duplicate</button>
              <button type="button" disabled={Boolean(busy)} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void update(version, { archived: !version.metadata?.archived }); }}>{busy === version.id ? 'Saving…' : version.metadata?.archived ? 'Restore' : 'Archive'}</button>
            </div></details>
          </div>
        </article>;
      })}
    </div>
    {groups.length > visibleCount && <button type="button" onClick={() => setVisibleCount(count => count + 12)}>Show more resumes</button>}
  </section>;
}
