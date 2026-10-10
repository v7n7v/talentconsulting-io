'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { getResumeVersions, type ResumeVersion } from '@/lib/database-suite';
import { showToast } from '@/components/Toast';
import { getPersistedResumeTemplateId } from '@/lib/resume-templates';
import { classifyResumeVerification } from '@/lib/server-resume';

interface ResumeLibraryPickerProps {
  onSelect: (resume: ResumeVersion) => void;
  selectedId?: string | null;
  selectedName?: string;
  compact?: boolean;
  presentation?: 'inline' | 'modal';
  showSearch?: boolean;
  showFilters?: boolean;
  triggerLabel?: string;
  confirmedSourcesOnly?: boolean;
}

type DateFilter = 'all' | '30' | '90' | '180';
type SortMode = 'newest' | 'oldest' | 'name';

function getResumeDate(resume: ResumeVersion) {
  const date = new Date(resume.created_at || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function resumeSubtitle(resume: ResumeVersion) {
  const parts = [getResumeDate(resume).toLocaleDateString()];
  if (resume.mode) parts.push(resume.mode);
  const template = getPersistedResumeTemplateId(resume);
  if (template) parts.push(template);
  return parts.join(' · ');
}

export default function ResumeLibraryPicker(props: ResumeLibraryPickerProps) {
  const owner = useStore(state => state.user?.uid || 'guest');
  return <OwnerResumeLibraryPicker key={owner} {...props} />;
}

function OwnerResumeLibraryPicker({
  onSelect,
  selectedId,
  selectedName,
  compact = false,
  presentation = 'inline',
  showSearch = true,
  showFilters = true,
  triggerLabel,
  confirmedSourcesOnly = false,
}: ResumeLibraryPickerProps) {
  const { user } = useStore();
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  useEffect(() => {
    let current = true;
    const uid = user?.uid;
    setResumes([]); setLoadError('');
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    getResumeVersions().then(result => {
      if (!current || useStore.getState().user?.uid !== uid) return;
      if (!result.success) throw new Error(result.error || 'Could not load saved resumes.');
      setResumes((result.data || []).filter(resume => !confirmedSourcesOnly || classifyResumeVerification(resume, 'resume_versions').verified));
    }).catch(error => {
      if (current && useStore.getState().user?.uid === uid) setLoadError(error instanceof Error ? error.message : 'Could not load saved resumes.');
    }).finally(() => { if (current && useStore.getState().user?.uid === uid) setLoading(false); });
    return () => { current = false; };
  }, [user?.uid, reload, confirmedSourcesOnly]);

  const visibleResumes = useMemo(() => {
    const now = Date.now();
    const maxAge = dateFilter === 'all' ? null : Number(dateFilter) * 24 * 60 * 60 * 1000;
    const normalizedQuery = query.trim().toLowerCase();

    return resumes
      .filter(resume => {
        if (maxAge && now - getResumeDate(resume).getTime() > maxAge) return false;
        if (!normalizedQuery) return true;
        const haystack = [
          resume.version_name,
          resume.mode,
          (resume.content as any)?.name,
          (resume.content as any)?.title,
          (resume.content as any)?.summary,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortMode === 'name') return a.version_name.localeCompare(b.version_name);
        const diff = getResumeDate(b).getTime() - getResumeDate(a).getTime();
        return sortMode === 'newest' ? diff : -diff;
      });
  }, [dateFilter, query, resumes, sortMode]);

  if (!user) return <a href="/suite/resume" className="text-xs text-[var(--accent)]">Add a resume</a>;

  const handleSelect = (rv: ResumeVersion) => {
    if (useStore.getState().user?.uid !== user.uid || !resumes.some(resume => resume.id === rv.id)) return;
    if (confirmedSourcesOnly && !classifyResumeVerification(rv, 'resume_versions').verified) return;
    onSelect(rv);
    setOpen(false);
    showToast(`Loaded: ${rv.version_name}`, 'check_circle');
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${compact ? '' : 'min-w-[128px]'}`}
      aria-label={selectedName ? `Change resume. Current resume: ${selectedName}` : 'Choose a saved resume'}
    >
      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">description</span>
      <span className="truncate">{triggerLabel || (selectedName ? 'Change resume' : resumes.length > 0 ? `Resumes (${resumes.length})` : 'Resumes')}</span>
    </button>
  );

  const selectedPill = selectedId && resumes.some(resume => resume.id === selectedId) ? (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--success)_25%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-3 py-2 ${compact ? 'w-full sm:w-auto' : ''}`}>
      <span className="material-symbols-rounded shrink-0 text-[16px] text-[var(--success)]" aria-hidden="true">check_circle</span>
      <span className={`text-xs font-semibold leading-4 text-[var(--success)] ${compact ? 'min-w-0 flex-1 truncate sm:max-w-[220px]' : 'max-w-[180px] truncate'}`}>
        {selectedName ? `Selected: ${selectedName}` : 'Resume selected'}
      </span>
    </div>
  ) : null;

  const pickerPanel = (
    <div className="elevation-raised rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Resume Library</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Select a resume to work with</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{confirmedSourcesOnly ? 'Confirmed source resumes only; generated drafts are excluded.' : 'Saved versions from your resume library.'}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          aria-label="Close resume picker"
        >
          <span className="material-symbols-rounded text-xl">close</span>
        </button>
      </div>

      {(showSearch || showFilters) && (
        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          {showSearch && (
            <label className="relative min-w-0">
              <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[var(--text-muted)]">search</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search resume name, role, or summary"
                className="h-11 w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] pl-10 pr-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
              />
            </label>
          )}
          {showFilters && (
            <>
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as DateFilter)}
                className="h-11 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="all">All dates</option>
                <option value="30">Last month</option>
                <option value="90">Last 3 months</option>
                <option value="180">Last 6 months</option>
              </select>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="h-11 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
              </select>
            </>
          )}
        </div>
      )}

      <div className="mt-4 max-h-[min(58vh,520px)] overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-secondary)]">Loading saved resumes...</div>
        ) : loadError ? (
          <div role="alert" className="p-4 text-sm text-[var(--danger)]">{loadError} <button type="button" onClick={() => setReload(value => value + 1)} className="underline">Retry loading resumes</button></div>
        ) : visibleResumes.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-secondary)]">No saved resumes match this view. <a href="/suite/resume" className="underline">Add or confirm a resume</a>.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {visibleResumes.map(rv => {
              const selected = selectedId === rv.id;
              const role = (rv.content as any)?.title || (rv.content as any)?.role || 'Saved resume';
              return (
                <button
                  key={rv.id}
                  type="button"
                  onClick={() => handleSelect(rv)}
                  aria-pressed={selected}
                  aria-label={`${selected ? 'Selected resume' : 'Select resume'}: ${rv.version_name}`}
                  className={`group min-w-0 rounded-[16px] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${selected ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] hover:border-[color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-[var(--accent-dim)]'}`}
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="wrap-natural text-sm font-semibold text-[var(--text-primary)]">{rv.version_name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{role}</p>
                      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{resumeSubtitle(rv)}</p>
                    </div>
                    <span className={`inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold ${selected ? 'border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)]' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                      <span className="material-symbols-rounded text-[15px]" aria-hidden="true">{selected ? 'check' : 'touch_app'}</span>
                      {selected ? 'Selected' : 'Use resume'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (presentation === 'modal') {
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {selectedPill}
          {trigger}
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[120] grid place-items-center bg-[color-mix(in_srgb,var(--bg-deep)_55%,transparent)] p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Select a resume"
                className="w-full max-w-[720px]"
                initial={{ opacity: 0, scale: 0.97, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 12 }}
                transition={{ duration: 0.18 }}
              >
                {pickerPanel}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <div className={compact ? 'flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center' : 'flex min-w-0 items-center gap-2'}>
        {selectedPill}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[var(--accent-dim)] px-3 py-1.5 text-[var(--accent)] transition-colors hover:bg-[var(--accent-dim)] ${compact ? 'w-full sm:w-auto' : ''}`}
          aria-label={selectedName ? `Change resume. Current resume: ${selectedName}` : 'Choose a saved resume'}
        >
          <span className="material-symbols-rounded shrink-0 text-[14px]" aria-hidden="true">description</span>
          <span className="truncate text-[11px] font-semibold">
            {selectedName ? 'Change resume' : resumes.length > 0 ? `Resumes (${resumes.length})` : 'Resumes'}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={compact
              ? 'absolute right-0 top-[calc(100%+10px)] z-[80] w-[min(520px,calc(100vw-2rem))] overflow-hidden'
              : 'overflow-hidden col-span-full'
            }
          >
            {pickerPanel}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
