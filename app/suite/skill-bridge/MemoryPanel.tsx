'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/auth-fetch';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  getAllStudyProgress,
  getJobApplications,
  getResumeVersions,
  type JobApplication,
  type ResumeVersion,
  type StudyProgress,
} from '@/lib/database-suite';
import type { PrepMemoryItem, PrepMemoryType } from '@/lib/prep-memory';
import { showToast } from '@/components/Toast';

type MemoryFilter = 'all' | PrepMemoryType | 'resumes';

const FILTERS: { key: MemoryFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'folder_open' },
  { key: 'skill-bridge', label: 'Skill Bridge', icon: 'route' },
  { key: 'interview', label: 'Interview', icon: 'mic' },
  { key: 'flashcards', label: 'Flashcards', icon: 'edit_document' },
  { key: 'resumes', label: 'Resumes', icon: 'description' },
];

const TYPE_CONFIG: Record<PrepMemoryType, { label: string; icon: string; tone: string; actionLabel: string; actionPath: string }> = {
  'skill-bridge': {
    label: 'Skill Bridge',
    icon: 'route',
    tone: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-300',
    actionLabel: 'Continue bridge',
    actionPath: '/suite/skill-bridge',
  },
  interview: {
    label: 'Interview',
    icon: 'mic',
    tone: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-300',
    actionLabel: 'Practice again',
    actionPath: '/suite/interview-sim?mode=quick_drill',
  },
  flashcards: {
    label: 'Flashcards',
    icon: 'edit_document',
    tone: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-300',
    actionLabel: 'Review cards',
    actionPath: '/suite/interview-sim?mode=study_cards',
  },
};

function renderMarkdown(text: string) {
  let html = text
    .replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold text-[var(--text-primary)] mt-5 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-[var(--text-primary)] mt-6 mb-3 border-b border-[var(--border-subtle)] pb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-xl font-black text-[var(--text-primary)] mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-[var(--text-primary)] font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em class="text-[var(--text-secondary)] italic">$1</em>')
    .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-5 list-disc text-[var(--text-secondary)] mb-1.5 marker:text-[var(--accent)] pl-1">$1</li>')
    .replace(/\[ \]/gim, '<span class="inline-block h-3.5 w-3.5 rounded border border-[var(--border)] mr-1.5 align-middle"></span>')
    .replace(/\[x\]/gim, '<span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded bg-emerald-500/30 border border-emerald-500/50 mr-1.5 align-middle text-emerald-500 text-[9px]">✓</span>')
    .replace(/\n\n/gim, '</p><p class="text-[var(--text-secondary)] leading-relaxed mb-4 mt-2">')
    .replace(/\n(?!\s*<)/gim, '<br/>');

  html = `<p class="text-[var(--text-secondary)] leading-relaxed mb-4 mt-2">${html}</p>`;
  return html.replace(/<p[^>]*>\s*<\/p>/g, '');
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MemoryPanel({ isPro, onOpenSkill }: { isPro: boolean; onOpenSkill: (skill: string) => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<MemoryFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<PrepMemoryItem[]>([]);
  const [activeItem, setActiveItem] = useState<PrepMemoryItem | null>(null);
  const [activeResume, setActiveResume] = useState<ResumeVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resumes, setResumes] = useState<ResumeVersion[]>([]);
  const [studyProgress, setStudyProgress] = useState<StudyProgress[]>([]);
  const [jobApps, setJobApps] = useState<JobApplication[]>([]);
  const [resumeDataLoaded, setResumeDataLoaded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadItems = useCallback(async (mode: 'replace' | 'append' = 'replace') => {
    if (filter === 'resumes') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        type: filter,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (mode === 'append' && nextCursor) params.set('cursor', nextCursor);
      const res = await authFetch(`/api/vault/list?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load memory');
      const nextItems = (data.items || data.notes || []) as PrepMemoryItem[];
      setItems(prev => mode === 'append' ? [...prev, ...nextItems] : nextItems);
      setNextCursor(data.nextCursor || null);
      if (mode === 'replace') {
        setActiveItem(nextItems[0] || null);
        setActiveResume(null);
      }
    } catch (error: any) {
      showToast(error.message || 'Could not load Skill Bridge Memory', 'cancel');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, nextCursor]);

  const loadResumeData = useCallback(async () => {
    if (resumeDataLoaded) return;
    setLoading(true);
    try {
      const [resumeResult, progressResult, appResult] = await Promise.all([
        getResumeVersions(),
        getAllStudyProgress(),
        getJobApplications(),
      ]);
      if (resumeResult.success && resumeResult.data) setResumes(resumeResult.data);
      if (progressResult.success && progressResult.data) setStudyProgress(progressResult.data);
      if (appResult.success && appResult.data) setJobApps(appResult.data);
      setResumeDataLoaded(true);
    } catch {
      showToast('Could not load resume-linked memory', 'cancel');
    } finally {
      setLoading(false);
    }
  }, [resumeDataLoaded]);

  useEffect(() => {
    if (filter === 'resumes') {
      loadResumeData();
      setActiveItem(null);
    } else {
      loadItems('replace');
    }
  }, [debouncedSearch, filter, loadItems, loadResumeData]);

  useEffect(() => {
    const refresh = () => {
      if (filter !== 'resumes') loadItems('replace');
    };
    window.addEventListener('prep-memory:refresh', refresh);
    return () => window.removeEventListener('prep-memory:refresh', refresh);
  }, [filter, loadItems]);

  const filteredResumes = useMemo(() => {
    if (!debouncedSearch) return resumes;
    return resumes.filter(resume =>
      (resume.version_name || '').toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [debouncedSearch, resumes]);

  const linkedProgress = useCallback((resume: ResumeVersion) => {
    const linkedAppIds = jobApps.filter(app => app.resume_version_id === resume.id).map(app => app.id);
    const byApp = studyProgress.filter(progress => progress.application_ids?.some(id => linkedAppIds.includes(id)));
    if (byApp.length) return byApp;

    const rawSkills = (resume.content as any)?.skills || [];
    const resumeSkills: string[] = rawSkills.flatMap((skill: any) =>
      typeof skill === 'string' ? [skill.toLowerCase()] : (skill.items || []).map((item: string) => item.toLowerCase())
    );
    return studyProgress.filter(progress =>
      resumeSkills.some(skill => progress.skill.toLowerCase().includes(skill) || skill.includes(progress.skill.toLowerCase()))
    );
  }, [jobApps, studyProgress]);

  const selectItem = async (item: PrepMemoryItem) => {
    setActiveResume(null);
    setActiveItem(item);
    if (item.content) return;
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/vault/item/${encodeURIComponent(item.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load memory item');
      setActiveItem(data.item);
    } catch (error: any) {
      showToast(error.message || 'Could not load memory item', 'cancel');
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await authFetch('/api/vault/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete memory item');
      setItems(prev => prev.filter(item => item.id !== id));
      if (activeItem?.id === id) setActiveItem(null);
      showToast('Memory item deleted', 'delete');
    } catch (error: any) {
      showToast(error.message || 'Could not delete memory item', 'cancel');
    } finally {
      setDeletingId(null);
    }
  };

  const openItemAction = (item: PrepMemoryItem) => {
    if (item.skill && item.type === 'skill-bridge') {
      onOpenSkill(item.skill);
      return;
    }
    router.push(TYPE_CONFIG[item.type].actionPath);
  };

  return (
    <section className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Skill Bridge Memory</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Memory is yours to review. Pro unlocks new plans, proofs, and saved progress.
          </p>
        </div>
        {!isPro && (
          <span className="inline-flex items-center gap-1.5 rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
            <span className="material-symbols-rounded text-[14px]">visibility</span>
            Read-only
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-[12px] border px-3 py-2 text-xs font-bold transition-colors ${
                filter === tab.key
                  ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="material-symbols-rounded text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 lg:w-[320px]">
          <span className="material-symbols-rounded pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-[var(--text-muted)]">search</span>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search memory..."
            className="w-full rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-emerald-500/60"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(280px,390px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {loading && (
            [...Array(4)].map((_, index) => (
              <div key={index} className="h-[86px] animate-pulse rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]" />
            ))
          )}

          {!loading && filter === 'resumes' && filteredResumes.length === 0 && <MemoryEmpty message="No resume memory yet. Save a resume in Resume Studio to connect skills to prep." />}
          {!loading && filter !== 'resumes' && items.length === 0 && <MemoryEmpty message="No memory items match this view yet. Saved plans, proofs, interviews, and flashcards will appear here." />}

          {filter === 'resumes' ? filteredResumes.map(resume => {
            const linked = linkedProgress(resume);
            const active = activeResume?.id === resume.id;
            return (
              <button
                key={resume.id}
                type="button"
                onClick={() => { setActiveResume(resume); setActiveItem(null); }}
                className={`w-full rounded-[16px] border p-4 text-left transition-colors ${active ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border)]'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="material-symbols-rounded mt-0.5 text-[22px] text-blue-500">description</span>
                  <div className="min-w-0 flex-1">
                    <p className="wrap-natural text-sm font-bold text-[var(--text-primary)]">{resume.version_name || 'Resume'}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{linked.length} linked skill{linked.length === 1 ? '' : 's'} in training</p>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)]">{formatDate(resume.created_at)}</span>
                </div>
              </button>
            );
          }) : items.map(item => {
            const cfg = TYPE_CONFIG[item.type];
            const active = activeItem?.id === item.id;
            return (
              <article key={item.id} className={`rounded-[16px] border transition-colors ${active ? 'border-emerald-500/35 bg-emerald-500/10' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border)]'}`}>
                <button type="button" onClick={() => selectItem(item)} className="w-full p-4 text-left">
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-[9px] border px-2 py-1 text-[11px] font-bold ${cfg.tone}`}>
                      <span className="material-symbols-rounded text-[13px]">{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)]">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="wrap-natural text-sm font-bold text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">{item.excerpt}</p>
                </button>
              </article>
            );
          })}

          {filter !== 'resumes' && nextCursor && (
            <button
              type="button"
              onClick={() => loadItems('append')}
              disabled={loading}
              className="w-full rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
            >
              Load more
            </button>
          )}
        </div>

        <div className="min-h-[420px] rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <AnimatePresence mode="wait">
            {activeResume ? (
              <ResumeMemoryReader key={activeResume.id} resume={activeResume} linked={linkedProgress(activeResume)} router={router} />
            ) : activeItem ? (
              <motion.div key={activeItem.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex h-full flex-col">
                <div className="border-b border-[var(--border-subtle)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="wrap-natural text-lg font-bold text-[var(--text-primary)]">{activeItem.title}</h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{TYPE_CONFIG[activeItem.type].label} · {formatDate(activeItem.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => openItemAction(activeItem)} className="rounded-[12px] bg-emerald-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
                        {TYPE_CONFIG[activeItem.type].actionLabel}
                      </button>
                      <button type="button" onClick={() => deleteItem(activeItem.id)} disabled={deletingId === activeItem.id} className="rounded-[12px] border border-[var(--border-subtle)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-60">
                        {deletingId === activeItem.id ? 'Deleting' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  {activeItem.skill && (
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <span className="material-symbols-rounded text-[14px]">psychology</span>
                      {activeItem.skill}
                    </span>
                  )}
                </div>
                <div className="max-h-[58vh] flex-1 overflow-y-auto p-5 text-sm">
                  {detailLoading ? (
                    <div className="space-y-3">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-elevated)]" />
                      <div className="h-4 w-full animate-pulse rounded bg-[var(--bg-elevated)]" />
                      <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--bg-elevated)]" />
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(activeItem.content || activeItem.excerpt)) }} />
                  )}
                </div>
              </motion.div>
            ) : (
              <MemoryBlank />
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function MemoryEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
      <span className="material-symbols-rounded text-[32px] text-[var(--text-muted)]">inventory_2</span>
      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Nothing here yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}

function MemoryBlank() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <span className="material-symbols-rounded text-[36px] text-[var(--text-muted)]">menu_book</span>
      <h3 className="mt-3 text-sm font-bold text-[var(--text-primary)]">Select a memory item</h3>
      <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">Plans, proof notes, interview feedback, flashcards, and resume-linked prep open here.</p>
    </div>
  );
}

function ResumeMemoryReader({ resume, linked, router }: { resume: ResumeVersion; linked: StudyProgress[]; router: ReturnType<typeof useRouter> }) {
  const content = resume.content as any;
  const rawSkills = content?.skills || [];
  const skills: string[] = rawSkills.flatMap((skill: any) => typeof skill === 'string' ? [skill] : (skill.items || []));

  return (
    <motion.div key={resume.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex h-full flex-col">
      <div className="border-b border-[var(--border-subtle)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="wrap-natural text-lg font-bold text-[var(--text-primary)]">{resume.version_name || 'Resume'}</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{resume.mode} resume · {formatDate(resume.created_at)}</p>
          </div>
          <button type="button" onClick={() => router.push('/suite/resume')} className="rounded-[12px] bg-emerald-600 px-3 py-2 text-xs font-bold text-[oklch(0.99_0.004_160)] hover:bg-emerald-700">
            Open Studio
          </button>
        </div>
      </div>
      <div className="max-h-[58vh] flex-1 overflow-y-auto p-5">
        <section>
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Resume Skills</h4>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {skills.length ? skills.map((skill, index) => (
              <span key={`${skill}-${index}`} className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{skill}</span>
            )) : <p className="text-xs text-[var(--text-secondary)]">No parsed skills found for this resume.</p>}
          </div>
        </section>

        <section className="mt-6">
          <h4 className="text-sm font-bold text-[var(--text-primary)]">Linked Skill Bridge Progress</h4>
          <div className="mt-3 space-y-2">
            {linked.length ? linked.map(progress => {
              const pct = progress.total_days > 0 ? Math.round((progress.completed_days.length / progress.total_days) * 100) : 0;
              return (
                <div key={progress.id} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{progress.skill}</p>
                    <span className="text-xs font-black tabular-nums text-[var(--text-primary)]">{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-[14px] border border-dashed border-[var(--border-subtle)] p-4 text-center text-sm text-[var(--text-secondary)]">
                No Skill Bridge plans are linked to this resume yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

