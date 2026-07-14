'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import { getResumeVersions, type ResumeVersion } from '@/lib/database-suite';
import { showToast } from '@/components/Toast';

interface ResumeLibraryPickerProps {
  onSelect: (resume: ResumeVersion) => void;
  selectedId?: string | null;
  selectedName?: string;
  compact?: boolean;
  presentation?: 'inline' | 'modal';
  showSearch?: boolean;
  showFilters?: boolean;
  triggerLabel?: string;
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
  const template = (resume as any).template || (resume.content as any)?.template;
  if (template) parts.push(template);
  return parts.join(' · ');
}

export default function ResumeLibraryPicker({
  onSelect,
  selectedId,
  selectedName,
  compact = false,
  presentation = 'inline',
  showSearch = true,
  showFilters = true,
  triggerLabel,
}: ResumeLibraryPickerProps) {
  const { user } = useStore();
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getResumeVersions()
      .then(r => {
        if (r.success && r.data) setResumes(r.data);
      })
      .finally(() => setLoading(false));
  }, [user]);

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

  if (!user || (resumes.length === 0 && !loading)) return null;

  const handleSelect = (rv: ResumeVersion) => {
    onSelect(rv);
    setOpen(false);
    showToast(`Loaded: ${rv.version_name}`, 'check_circle');
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-500/15 focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:text-blue-300 ${compact ? '' : 'min-w-[128px]'}`}
      aria-label={selectedName ? `Change resume. Current resume: ${selectedName}` : 'Choose a saved resume'}
    >
      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">description</span>
      <span className="truncate">{triggerLabel || (selectedName ? 'Change resume' : resumes.length > 0 ? `Resumes (${resumes.length})` : 'Resumes')}</span>
    </button>
  );

  const selectedPill = selectedId ? (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 ${compact ? 'w-full sm:w-auto' : ''}`}>
      <span className="material-symbols-rounded shrink-0 text-[16px] text-emerald-600 dark:text-emerald-300" aria-hidden="true">check_circle</span>
      <span className={`text-xs font-semibold leading-4 text-emerald-700 dark:text-emerald-300 ${compact ? 'min-w-0 flex-1 truncate sm:max-w-[220px]' : 'max-w-[180px] truncate'}`}>
        {selectedName ? `Selected: ${selectedName}` : 'Resume selected'}
      </span>
    </div>
  ) : null;

  const pickerPanel = (
    <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.20)]">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Resume Library</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Select a resume to work with</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Saved versions from your resume library.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
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
                className="h-11 w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] pl-10 pr-3 text-sm outline-none transition focus:border-blue-500/40"
              />
            </label>
          )}
          {showFilters && (
            <>
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as DateFilter)}
                className="h-11 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500/40"
              >
                <option value="all">All dates</option>
                <option value="30">Last month</option>
                <option value="90">Last 3 months</option>
                <option value="180">Last 6 months</option>
              </select>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="h-11 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-blue-500/40"
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
        ) : visibleResumes.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 text-sm text-[var(--text-secondary)]">No saved resumes match this view.</div>
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
                  className={`group min-w-0 rounded-[16px] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${selected ? 'border-blue-500/35 bg-blue-500/10' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] hover:border-blue-500/25 hover:bg-blue-500/[0.04]'}`}
                >
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                      <p className="wrap-natural text-sm font-semibold text-[var(--text-primary)]">{rv.version_name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{role}</p>
                      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{resumeSubtitle(rv)}</p>
                    </div>
                    <span className={`inline-flex min-h-9 w-fit items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold ${selected ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
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
              className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm"
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
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-blue-500 transition-colors hover:bg-blue-500/20 ${compact ? 'w-full sm:w-auto' : ''}`}
          aria-label={selectedName ? `Change resume. Current resume: ${selectedName}` : 'Choose a saved resume'}
        >
          <span className="material-symbols-rounded shrink-0 text-[14px]" aria-hidden="true">description</span>
          <span className="truncate text-[11px] font-semibold">
            {selectedName ? 'Change resume' : resumes.length > 0 ? `Resumes (${resumes.length})` : 'Resumes'}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && resumes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={compact
              ? 'absolute right-0 top-[calc(100%+10px)] z-[80] w-[min(520px,calc(100vw-2rem))] overflow-hidden'
              : 'overflow-hidden col-span-full'
            }
          >
            <div className={`${compact ? '' : 'mt-3'} rounded-2xl p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-lg text-blue-500">description</span>
                  Select a resume to work with
                </h3>
                <button onClick={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-lg">close</span>
                </button>
              </div>
              <div className={`grid grid-cols-1 gap-2 overflow-y-auto pr-1 ${compact ? 'max-h-[320px]' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                {resumes.map(rv => (
                  <button
                    key={rv.id}
                    onClick={() => handleSelect(rv)}
                    aria-pressed={selectedId === rv.id}
                    aria-label={`${selectedId === rv.id ? 'Selected resume' : 'Select resume'}: ${rv.version_name}`}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selectedId === rv.id
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-[var(--border-subtle)] hover:border-[var(--text-tertiary)]'
                    }`}
                    style={{ background: selectedId === rv.id ? undefined : 'var(--bg-elevated)' }}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-bold text-[var(--text-primary)]">{rv.version_name}</span>
                        <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">{resumeSubtitle(rv)}</span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${selectedId === rv.id ? 'border-blue-500/30 text-blue-600 dark:text-blue-300' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}`}>
                        <span className="material-symbols-rounded text-[12px]" aria-hidden="true">{selectedId === rv.id ? 'check' : 'touch_app'}</span>
                        {selectedId === rv.id ? 'Selected' : 'Use'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
