'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import AnimatedToolIcon from '@/components/AnimatedToolIcon';
import { AssistantMark } from '@/components/assistant';
import { EvidenceBadge, SuiteEmptyState, SuiteMetricCard, SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';

type PrivacyRisk = 'low' | 'medium' | 'high';

interface StarStory {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[];
  source: string;
  sourceTool?: string;
  category: string;
  competencies: string[];
  company?: string | null;
  role?: string | null;
  applicationId?: string | null;
  resumeVersionId?: string | null;
  contactId?: string | null;
  confidence: number;
  proofScore: number;
  privacyRisk: PrivacyRisk;
  usageCount: number;
  lastUsedAt?: string | null;
  createdAt: string;
}

interface CoverageMap {
  covered: { category: string; storyCount: number }[];
  uncovered: string[];
  totalStories: number;
  /** The fixed denominator - BEHAVIORAL_CATEGORIES.length. */
  total: number;
  coveragePercent: number;
}

interface MatchResult {
  category: string;
  categories: { category: string; confidence: number }[];
  rankedStories: Array<{
    id: string;
    title: string;
    fitScore: number;
    category: string;
    reason: string;
    answerAngle: string;
    risks?: string[];
  }>;
  recommendedStoryId: string | null;
  answerVariants: Array<{
    label: 'screening' | 'sixty_second' | 'ninety_second' | 'follow_up';
    title: string;
    answer: string;
  }>;
  gaps: string[];
  qualityWarnings: string[];
  story?: StarStory | null;
  answer?: string;
  source?: string;
}

interface QualityReport {
  proofScore: number;
  privacyRisk: PrivacyRisk;
  missingMetrics: string[];
  clarityIssues: string[];
  confidentialityWarnings: string[];
  suggestedImprovements: string[];
  strengths: string[];
}

type StoryForm = Pick<StarStory, 'title' | 'situation' | 'task' | 'action' | 'result' | 'reflection'> & {
  tags: string;
  category: string;
  company: string;
  role: string;
  applicationId: string;
  resumeVersionId: string;
  contactId: string;
};

const EMPTY_FORM: StoryForm = {
  title: '',
  situation: '',
  task: '',
  action: '',
  result: '',
  reflection: '',
  tags: '',
  category: '',
  company: '',
  role: '',
  applicationId: '',
  resumeVersionId: '',
  contactId: '',
};

const SOURCE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'manual', label: 'Manual' },
  { id: 'chat', label: 'Taco' },
  { id: 'interview_debrief', label: 'Debrief' },
  { id: 'fit_analysis', label: 'Fit Gate' },
  { id: 'resume', label: 'Resume' },
];

const EXTRACT_SOURCES = [
  { id: 'manual_text', label: 'Paste accomplishment', icon: 'edit_note' },
  { id: 'resume', label: 'From resume', icon: 'description' },
  { id: 'debrief', label: 'From debrief', icon: 'rate_review' },
  { id: 'conversation', label: 'From Taco chat', icon: 'auto_awesome' },
] as const;

// Interactive/brand emphasis (was the old cyan accent). Blue --accent.
const ACCENT_CHIP = 'border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] text-[var(--accent)]';
const NEUTRAL_CHIP = 'border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]';

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Proof strength is an evidence-status signal, so it uses the status hues
// (--success / --warning) and a neutral middle — never --accent, which is
// reserved for interaction. Callers guard the unscored (0) case as a labelled
// absence before invoking this.
function scoreTone(score: number) {
  if (score >= 78) return { text: 'text-[var(--success)]', bg: 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)]', border: 'border-[color-mix(in_srgb,var(--success)_30%,transparent)]', icon: 'verified' };
  if (score >= 55) return { text: 'text-[var(--text-secondary)]', bg: 'bg-[var(--bg-elevated)]', border: 'border-[var(--border-subtle)]', icon: 'offline_bolt' };
  return { text: 'text-[var(--warning)]', bg: 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]', border: 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)]', icon: 'construction' };
}

function riskTone(risk: PrivacyRisk) {
  if (risk === 'high') return 'text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] border-[color-mix(in_srgb,var(--danger)_30%,transparent)]';
  if (risk === 'medium') return 'text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] border-[color-mix(in_srgb,var(--warning)_30%,transparent)]';
  return 'text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)] border-[color-mix(in_srgb,var(--success)_30%,transparent)]';
}

function sourceLabel(source?: string) {
  const found = SOURCE_FILTERS.find(item => item.id === source);
  if (found) return found.label;
  return source ? source.replace(/_/g, ' ') : 'Story';
}

function formFromStory(story: StarStory | null): StoryForm {
  if (!story) return EMPTY_FORM;
  return {
    title: story.title || '',
    situation: story.situation || '',
    task: story.task || '',
    action: story.action || '',
    result: story.result || '',
    reflection: story.reflection || '',
    tags: (story.tags || []).join(', '),
    category: story.category || '',
    company: story.company || '',
    role: story.role || '',
    applicationId: story.applicationId || '',
    resumeVersionId: story.resumeVersionId || '',
    contactId: story.contactId || '',
  };
}

function payloadFromForm(form: StoryForm) {
  return {
    ...form,
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    company: form.company || null,
    role: form.role || null,
    applicationId: form.applicationId || null,
    resumeVersionId: form.resumeVersionId || null,
    contactId: form.contactId || null,
  };
}

export default function StoryBankPage() {
  const router = useRouter();
  const { user } = useStore();
  const { context, updateContext } = useApplicationKitContext();

  const [stories, setStories] = useState<StarStory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Story Bank is ready.');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [composerMode, setComposerMode] = useState<'manual' | 'extract' | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<StoryForm>(EMPTY_FORM);

  const [extractSource, setExtractSource] = useState<(typeof EXTRACT_SOURCES)[number]['id']>('manual_text');
  const [extractText, setExtractText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [draftStories, setDraftStories] = useState<StarStory[]>([]);

  const [matchQuestion, setMatchQuestion] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [activeAnswer, setActiveAnswer] = useState(0);

  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);

  const selectedStory = useMemo(
    () => stories.find(story => story.id === selectedId) || stories[0] || null,
    [selectedId, stories],
  );

  const categories = useMemo(() => {
    const fromStories = stories.map(story => story.category).filter(Boolean);
    const fromCoverage = [...(coverage?.covered || []), ...(coverage?.uncovered || []).map(category => ({ category, storyCount: 0 }))].map(item => item.category);
    return ['all', ...Array.from(new Set([...fromStories, ...fromCoverage]))].slice(0, 18);
  }, [coverage, stories]);

  const stats = useMemo(() => {
    const strong = stories.filter(story => story.proofScore >= 78).length;
    const needsMetrics = stories.filter(story => story.proofScore < 55).length;
    const linked = stories.filter(story => story.applicationId || story.contactId || story.resumeVersionId).length;
    return { strong, needsMetrics, linked };
  }, [stories]);

  const loadStories = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      params.set('limit', '120');

      const [storyRes, coverageRes] = await Promise.all([
        authFetch(`/api/agent/stories?${params.toString()}`),
        authFetch('/api/agent/stories/coverage'),
      ]);

      if (!storyRes.ok) throw new Error('Could not load Story Bank.');
      const storyData = await storyRes.json();
      setStories(storyData.stories || []);
      if (!selectedId && storyData.stories?.[0]) setSelectedId(storyData.stories[0].id);
      if (storyData.migratedCount > 0) setStatus(`${storyData.migratedCount} legacy stories were brought into Story Bank.`);

      if (coverageRes.ok) setCoverage(await coverageRes.json());
    } catch (loadError: any) {
      setError(loadError.message || 'Story Bank could not load.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search, selectedId, sourceFilter, user]);

  useEffect(() => {
    const timer = setTimeout(() => { loadStories(); }, search ? 220 : 0);
    return () => clearTimeout(timer);
  }, [loadStories, search]);

  useEffect(() => {
    setForm(formFromStory(editMode ? selectedStory : null));
    setQuality(null);
  }, [editMode, selectedStory?.id]);

  async function saveStory(mode: 'create' | 'update' = 'create', draft?: StarStory) {
    const sourceForm = draft ? formFromStory(draft) : form;
    if (!sourceForm.title.trim() || !sourceForm.situation.trim()) {
      setStatus('Add at least a title and situation before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/agent/stories', {
        method: mode === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'update' ? { storyId: selectedStory?.id } : {}),
          ...payloadFromForm(sourceForm),
          source: draft?.source || 'manual',
          sourceTool: draft?.sourceTool || 'story_bank',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save story.');
      setStatus(mode === 'update' ? 'Story updated.' : 'Story saved to your proof engine.');
      setComposerMode(null);
      setEditMode(false);
      setDraftStories(prev => draft ? prev.filter(item => item.title !== draft.title) : prev);
      setForm(EMPTY_FORM);
      await loadStories();
      if (data.story?.id) setSelectedId(data.story.id);
    } catch (saveError: any) {
      setError(saveError.message || 'Could not save story.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteStory(storyId: string) {
    setSaving(true);
    try {
      const res = await authFetch('/api/agent/stories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      });
      if (!res.ok) throw new Error('Could not delete story.');
      setStatus('Story removed.');
      setSelectedId(null);
      await loadStories();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Could not delete story.');
    } finally {
      setSaving(false);
    }
  }

  async function runExtraction() {
    if (!extractText.trim()) {
      setStatus('Paste a resume bullet, debrief note, or accomplishment first.');
      return;
    }
    setExtracting(true);
    setDraftStories([]);
    setError('');
    try {
      const res = await authFetch('/api/agent/stories/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: extractSource,
          text: extractText,
          company: context.company,
          role: context.jobTitle || context.targetRole,
          applicationId: undefined,
          resumeVersionId: context.resumeVersionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not extract stories.');
      setDraftStories(data.stories || []);
      setStatus(`${data.stories?.length || 0} draft stories are ready for review.`);
    } catch (extractError: any) {
      setError(extractError.message || 'Could not extract stories.');
    } finally {
      setExtracting(false);
    }
  }

  async function runMatch() {
    if (!matchQuestion.trim()) {
      setStatus('Paste an interview or application question first.');
      return;
    }
    setMatching(true);
    setMatchResult(null);
    setActiveAnswer(0);
    setError('');
    try {
      const res = await authFetch('/api/agent/stories/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: matchQuestion,
          company: context.company,
          role: context.jobTitle || context.targetRole,
          jobDescription: context.jobDescription,
          maxAnswers: 4,
        }),
      });
      // `res.json()` first would throw a raw SyntaxError on any non-JSON
      // response, which is what the user saw: the parser's complaint about an
      // HTML error page, presented as if it were a Story Bank message.
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Story matching is not available right now, so nothing was matched.');
      }
      setMatchResult(data);
      if (data.recommendedStoryId) setSelectedId(data.recommendedStoryId);
      setStatus(data.recommendedStoryId ? 'Taco matched the best proof story.' : 'No strong proof match yet. Add a story for this category.');
    } catch (matchError: any) {
      setError(matchError.message || 'Could not match stories.');
    } finally {
      setMatching(false);
    }
  }

  async function loadQuality(story: StarStory) {
    setQualityLoading(true);
    setQuality(null);
    try {
      const res = await authFetch('/api/agent/stories/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not assess story.');
      setQuality(data.report);
      setStatus('Proof quality reviewed.');
    } catch (qualityError: any) {
      setError(qualityError.message || 'Could not assess story.');
    } finally {
      setQualityLoading(false);
    }
  }

  function routeWithStory(path: string, story = selectedStory) {
    if (story) {
      updateContext({
        company: story.company || context.company || '',
        jobTitle: story.role || context.jobTitle || '',
        targetRole: story.role || context.targetRole || '',
        resumeVersionId: story.resumeVersionId || context.resumeVersionId || null,
      });
    }
    router.push(path);
  }

  async function copyText(text?: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied.');
    } catch {
      setStatus('Copy failed. Select the text manually.');
    }
  }

  if (!user) {
    return (
      <SuiteToolShell variant="workbench">
        <SuiteToolHeader tool="stories" />
        <SuiteEmptyState
          icon="auto_stories"
          title="Sign in to use Story Bank"
          description="Your stories, proof gaps, and interview answers are saved privately to your workspace."
        />
      </SuiteToolShell>
    );
  }

  return (
    <SuiteToolShell variant="workbench" contentClassName="gap-4">
        <SuiteToolHeader
          tool="stories"
          subtitle="Capture truthful STAR stories, match them to hard questions, and send proof into interviews, CRM outreach, resumes, and applications."
          actions={
            <>
              <button
                type="button"
                onClick={() => setComposerMode(composerMode === 'manual' ? null : 'manual')}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--accent-hover)] ${ACCENT_CHIP}`}
              >
                <span className="material-symbols-rounded text-[18px]">add</span>
                New story
              </button>
              <button
                type="button"
                onClick={() => setComposerMode(composerMode === 'extract' ? null : 'extract')}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border px-3 py-2 text-sm font-semibold transition hover:bg-[var(--accent-hover)] ${ACCENT_CHIP}`}
              >
                <AssistantMark size="xs" state={extracting || matching ? 'thinking' : 'idle'} />
                Extract proof
              </button>
              <Link
                href="/suite/agent"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-hover)]"
              >
                <span className="material-symbols-rounded text-[18px]">forum</span>
                Taco
              </Link>
            </>
          }
        />

        <section className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex min-w-0 items-center gap-2 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2">
                <span className="material-symbols-rounded shrink-0 text-[20px] text-[var(--text-muted)]">search</span>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search stories, companies, skills, outcomes..."
                  className="h-11 min-w-0 flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </label>
              <div className="flex min-w-0 flex-wrap gap-2">
                {SOURCE_FILTERS.map(source => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setSourceFilter(source.id)}
                    className={`inline-flex min-h-[44px] items-center rounded-[13px] border px-3 py-2 text-xs font-semibold transition ${sourceFilter === source.id ? ACCENT_CHIP : NEUTRAL_CHIP}`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
              {categories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setCategoryFilter(category)}
                  className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${categoryFilter === category ? ACCENT_CHIP : NEUTRAL_CHIP}`}
                >
                  {category === 'all' ? 'All categories' : category}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <SuiteMetricCard label="Stories" value={stories.length} icon="library_books" />
            <SuiteMetricCard label="Strong proof" value={stats.strong} icon="verified" />
            <SuiteMetricCard label="Linked" value={stats.linked} icon="account_tree" />
            <SuiteMetricCard
              label="Categories"
              value={coverage ? `${coverage.covered.length}/${coverage.total}` : '—'}
              icon="radar"
              description="Behavioral coverage"
            />
          </div>
        </section>

        {(composerMode || error) && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            {composerMode === 'manual' && (
              <StoryComposer
                form={form}
                setForm={setForm}
                saving={saving}
                title="Add proof story"
                description="Keep it truthful. Taco can polish the framing later, but the facts need to be yours."
                primaryLabel="Save story"
                onCancel={() => { setComposerMode(null); setForm(EMPTY_FORM); }}
                onSave={() => saveStory('create')}
              />
            )}
            {composerMode === 'extract' && (
              <ExtractionPanel
                extractSource={extractSource}
                setExtractSource={setExtractSource}
                extractText={extractText}
                setExtractText={setExtractText}
                extracting={extracting}
                draftStories={draftStories}
                onExtract={runExtraction}
                onSaveDraft={draft => saveStory('create', draft)}
                onCancel={() => { setComposerMode(null); setDraftStories([]); }}
              />
            )}
            <StatusPanel error={error} status={status} />
          </section>
        )}

        {!composerMode && !error && <StatusPanel error="" status={status} compact />}

        <main className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(320px,390px)]">
          <section className="elevation-card min-w-0 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Story deck</p>
                <h2 className="premium-heading-wrap text-lg font-semibold text-[var(--text-primary)]">Your proof library</h2>
              </div>
              <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">{stories.length}</span>
            </div>

            {loading ? (
              <StorySkeleton />
            ) : stories.length === 0 ? (
              <FirstRunPanel onManual={() => setComposerMode('manual')} onExtract={() => setComposerMode('extract')} />
            ) : (
              <div className="flex max-h-[760px] flex-col gap-2 overflow-y-auto pr-1">
                {stories.map(story => (
                  <StoryDeckCard
                    key={story.id}
                    story={story}
                    active={selectedStory?.id === story.id}
                    onSelect={() => { setSelectedId(story.id); setEditMode(false); }}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-4">
            <SelectedStoryPanel
              story={selectedStory}
              editMode={editMode}
              form={form}
              setForm={setForm}
              saving={saving}
              quality={quality}
              qualityLoading={qualityLoading}
              onEdit={() => { setEditMode(true); setForm(formFromStory(selectedStory)); }}
              onCancelEdit={() => { setEditMode(false); setForm(EMPTY_FORM); }}
              onSave={() => saveStory('update')}
              onDelete={() => selectedStory && deleteStory(selectedStory.id)}
              onQuality={() => selectedStory && loadQuality(selectedStory)}
              onPractice={() => routeWithStory('/suite/interview-sim')}
              onResume={() => routeWithStory('/suite/resume')}
            />

            <CoveragePanel coverage={coverage} />
          </section>

          <aside className="min-w-0 space-y-4">
            <AnswerStudio
              question={matchQuestion}
              setQuestion={setMatchQuestion}
              matching={matching}
              result={matchResult}
              activeAnswer={activeAnswer}
              setActiveAnswer={setActiveAnswer}
              onMatch={runMatch}
              onCopy={copyText}
              onPractice={() => routeWithStory('/suite/interview-sim', matchResult?.story || selectedStory)}
              onCoverLetter={() => routeWithStory('/suite/cover-letter', matchResult?.story || selectedStory)}
              onLinkedIn={() => routeWithStory('/suite/linkedin', matchResult?.story || selectedStory)}
            />
            <ConnectedMoves onNavigate={routeWithStory} />
          </aside>
        </main>
    </SuiteToolShell>
  );
}

function StatusPanel({ status, error, compact = false }: { status: string; error: string; compact?: boolean }) {
  return (
    <div className={`elevation-card rounded-[18px] border ${error ? 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]' : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'} ${compact ? 'px-4 py-3' : 'p-4'}`}>
      <div className="flex min-w-0 items-center gap-3">
        <AssistantMark size="xs" state={error ? 'error' : 'success'} />
        <p className={`wrap-natural text-sm font-medium ${error ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>
          {error || status}
        </p>
      </div>
    </div>
  );
}

function StoryDeckCard({ story, active, onSelect }: { story: StarStory; active: boolean; onSelect: () => void }) {
  // proofScore is an LLM/deterministic proof score. An unscored story (0) is a
  // labelled absence, never a rendered "0".
  const scored = story.proofScore > 0;
  const tone = scored ? scoreTone(story.proofScore) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group min-w-0 rounded-[18px] border p-3 text-left transition ${active ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)] bg-[var(--card-bg)] hover:bg-[var(--bg-hover)]'}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border ${tone ? `${tone.bg} ${tone.border} ${tone.text}` : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
          <span className="material-symbols-rounded text-[20px]">{tone ? tone.icon : 'auto_stories'}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="wrap-natural min-w-0 text-sm font-semibold leading-5 text-[var(--text-primary)]">{story.title}</p>
            {scored ? (
              <span className="whitespace-nowrap rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{story.proofScore}</span>
            ) : (
              <span className="whitespace-nowrap rounded-full border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">Not scored</span>
            )}
          </div>
          <p className="mt-1 wrap-natural text-xs capitalize text-[var(--text-secondary)]">{story.category}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--text-muted)]">{sourceLabel(story.source)}</span>
            {story.tags.slice(0, 2).map(tag => (
              <span key={tag} className="wrap-anywhere rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function SelectedStoryPanel({
  story,
  editMode,
  form,
  setForm,
  saving,
  quality,
  qualityLoading,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onQuality,
  onPractice,
  onResume,
}: {
  story: StarStory | null;
  editMode: boolean;
  form: StoryForm;
  setForm: (form: StoryForm) => void;
  saving: boolean;
  quality: QualityReport | null;
  qualityLoading: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  onQuality: () => void;
  onPractice: () => void;
  onResume: () => void;
}) {
  if (!story) {
    return (
      <div className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
        <AnimatedToolIcon icon="auto_stories" tone="amber" size="sm" className="mx-auto" />
        <h2 className="premium-heading-wrap mt-4 text-xl font-semibold text-[var(--text-primary)]">Choose a proof story</h2>
        <p className="premium-copy-wrap mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
          Select a saved story or extract one from your resume, debriefs, or Taco conversations.
        </p>
      </div>
    );
  }

  const scored = story.proofScore > 0;
  const tone = scored ? scoreTone(story.proofScore) : null;

  return (
    <div className="elevation-card min-w-0 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
      {!editMode ? (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {scored && tone ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
                    <span className="material-symbols-rounded text-[15px]">{tone.icon}</span>
                    {story.proofScore}/100 proof
                  </span>
                ) : (
                  <EvidenceBadge state="missing" label="Proof not scored" />
                )}
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${riskTone(story.privacyRisk)}`}>
                  <span className="material-symbols-rounded text-[15px]">shield</span>
                  {story.privacyRisk} privacy risk
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--text-secondary)]">{story.category}</span>
              </div>
              <h2 className="premium-heading-wrap mt-4 text-2xl font-semibold leading-tight text-[var(--text-primary)]">{story.title}</h2>
              <p className="mt-2 wrap-natural text-sm text-[var(--text-secondary)]">
                {story.company || story.role ? [story.role, story.company].filter(Boolean).join(' at ') : `Saved ${formatDate(story.createdAt)}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={onQuality} disabled={qualityLoading} className={`inline-flex min-h-[44px] items-center justify-center rounded-[12px] border px-3 py-2 text-xs font-semibold transition hover:bg-[var(--accent-hover)] disabled:opacity-60 ${ACCENT_CHIP}`}>
                {qualityLoading ? 'Reviewing...' : 'Review proof'}
              </button>
              <button type="button" onClick={onEdit} className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Edit</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <StarSection label="Situation" icon="location_on" text={story.situation} />
            <StarSection label="Task" icon="task_alt" text={story.task} />
            <StarSection label="Action" icon="bolt" text={story.action} />
            <StarSection label="Result" icon="emoji_events" text={story.result} />
          </div>

          {story.reflection && (
            <div className="mt-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Reflection</p>
              <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">{story.reflection}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {story.competencies.slice(0, 8).map(item => (
              <span key={item} className="wrap-anywhere rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium capitalize text-[var(--text-secondary)]">{item}</span>
            ))}
          </div>

          {quality && (
            <div className="mt-4 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Proof quality review</p>
                <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-secondary)]">{quality.proofScore > 0 ? `${quality.proofScore}/100` : 'Not scored'}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <InsightList title="Strengths" items={quality.strengths} empty="Grounded STAR structure is present." />
                <InsightList title="Improve" items={[...quality.missingMetrics, ...quality.clarityIssues, ...quality.suggestedImprovements]} empty="No major gaps found." />
              </div>
              {quality.confidentialityWarnings.length > 0 && <InsightList title="Privacy" items={quality.confidentialityWarnings} />}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onPractice} className="inline-flex min-h-[44px] items-center justify-center rounded-[13px] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-deep)]">Practice interview</button>
            <button type="button" onClick={onResume} className="inline-flex min-h-[44px] items-center justify-center rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Turn into resume proof</button>
            <button type="button" onClick={onDelete} className="inline-flex min-h-[44px] items-center justify-center rounded-[13px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)]">Delete</button>
          </div>
        </>
      ) : (
        <StoryComposer
          form={form}
          setForm={setForm}
          saving={saving}
          title="Edit proof story"
          description="Keep the factual core intact. Add links and metrics so other tools can reuse it."
          primaryLabel="Save changes"
          onCancel={onCancelEdit}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function StarSection({ label, icon, text }: { label: string; icon: string; text?: string }) {
  return (
    <div className="min-w-0 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-rounded text-[18px] text-[var(--accent)]">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      </div>
      <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text || 'Add this detail to make the story interview-ready.'}</p>
    </div>
  );
}

function StoryComposer({ form, setForm, saving, title, description, primaryLabel, onSave, onCancel }: {
  form: StoryForm;
  setForm: (form: StoryForm) => void;
  saving: boolean;
  title: string;
  description: string;
  primaryLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const fields = [
    { key: 'situation', label: 'Situation', placeholder: 'What was happening?' },
    { key: 'task', label: 'Task', placeholder: 'What were you responsible for?' },
    { key: 'action', label: 'Action', placeholder: 'What did you do?' },
    { key: 'result', label: 'Result', placeholder: 'What changed, improved, or got measured?' },
  ] as const;

  return (
    <div className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Story editor</p>
          <h2 className="premium-heading-wrap mt-1 text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
        <button type="button" onClick={onCancel} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="Close editor">
          <span className="material-symbols-rounded text-[18px]">close</span>
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <InputField label="Title" value={form.title} onChange={value => setForm({ ...form, title: value })} placeholder="Cut deployment review time by 40%" />
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map(field => (
            <TextAreaField
              key={field.key}
              label={field.label}
              value={form[field.key]}
              onChange={value => setForm({ ...form, [field.key]: value })}
              placeholder={field.placeholder}
            />
          ))}
        </div>
        <TextAreaField label="Reflection" value={form.reflection} onChange={value => setForm({ ...form, reflection: value })} placeholder="What did you learn, or what would you repeat?" rows={2} />
        <div className="grid gap-3 md:grid-cols-3">
          <InputField label="Tags" value={form.tags} onChange={value => setForm({ ...form, tags: value })} placeholder="leadership, security, cloud" />
          <InputField label="Company" value={form.company} onChange={value => setForm({ ...form, company: value })} placeholder="Optional" />
          <InputField label="Role" value={form.role} onChange={value => setForm({ ...form, role: value })} placeholder="Optional" />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <InputField label="Category" value={form.category} onChange={value => setForm({ ...form, category: value })} placeholder="Auto if blank" />
          <InputField label="Application ID" value={form.applicationId} onChange={value => setForm({ ...form, applicationId: value })} placeholder="Optional" />
          <InputField label="Resume ID" value={form.resumeVersionId} onChange={value => setForm({ ...form, resumeVersionId: value })} placeholder="Optional" />
          <InputField label="Contact ID" value={form.contactId} onChange={value => setForm({ ...form, contactId: value })} placeholder="Optional" />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="inline-flex min-h-[44px] items-center justify-center rounded-[13px] border border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">Cancel</button>
          <button type="button" onClick={onSave} disabled={saving || !form.title.trim() || !form.situation.trim()} className="inline-flex min-h-[44px] items-center justify-center rounded-[13px] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-deep)] disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Saving...' : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full min-w-0 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full min-w-0 resize-none rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-base leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
      />
    </label>
  );
}

function ExtractionPanel({
  extractSource,
  setExtractSource,
  extractText,
  setExtractText,
  extracting,
  draftStories,
  onExtract,
  onSaveDraft,
  onCancel,
}: {
  extractSource: (typeof EXTRACT_SOURCES)[number]['id'];
  setExtractSource: (value: (typeof EXTRACT_SOURCES)[number]['id']) => void;
  extractText: string;
  setExtractText: (value: string) => void;
  extracting: boolean;
  draftStories: StarStory[];
  onExtract: () => void;
  onSaveDraft: (draft: StarStory) => void;
  onCancel: () => void;
}) {
  return (
    <div className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Proof extraction</p>
          <h2 className="premium-heading-wrap mt-1 text-lg font-semibold text-[var(--text-primary)]">Turn raw material into STAR stories</h2>
          <p className="premium-copy-wrap mt-1 text-sm leading-6 text-[var(--text-secondary)]">Paste a resume bullet, interview note, or rough accomplishment. Taco will draft stories for review before saving.</p>
        </div>
        <button type="button" onClick={onCancel} className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]" aria-label="Close extraction">
          <span className="material-symbols-rounded text-[18px]">close</span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXTRACT_SOURCES.map(source => (
          <button
            key={source.id}
            type="button"
            onClick={() => setExtractSource(source.id)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-[13px] border px-3 py-2 text-xs font-semibold transition ${extractSource === source.id ? ACCENT_CHIP : NEUTRAL_CHIP}`}
          >
            <span className="material-symbols-rounded text-[16px]">{source.icon}</span>
            {source.label}
          </button>
        ))}
      </div>

      <textarea
        value={extractText}
        onChange={event => setExtractText(event.target.value)}
        placeholder="Paste the raw accomplishment or debrief notes here..."
        rows={6}
        className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 text-base leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
      />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onExtract} disabled={extracting || !extractText.trim()} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[13px] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-deep)] disabled:cursor-not-allowed disabled:opacity-50">
          <AssistantMark size="xs" state={extracting ? 'thinking' : 'idle'} />
          {extracting ? 'Extracting...' : 'Draft stories'}
        </button>
      </div>

      {draftStories.length > 0 && (
        <div className="mt-4 grid gap-2">
          {draftStories.map((draft, index) => (
            <div key={`${draft.title}-${index}`} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="wrap-natural text-sm font-semibold text-[var(--text-primary)]">{draft.title}</p>
                  <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{draft.action || draft.situation}</p>
                </div>
                <button type="button" onClick={() => onSaveDraft(draft)} className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[12px] border px-3 py-2 text-xs font-semibold transition hover:bg-[var(--accent-hover)] ${ACCENT_CHIP}`}>Save</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerStudio({
  question,
  setQuestion,
  matching,
  result,
  activeAnswer,
  setActiveAnswer,
  onMatch,
  onCopy,
  onPractice,
  onCoverLetter,
  onLinkedIn,
}: {
  question: string;
  setQuestion: (value: string) => void;
  matching: boolean;
  result: MatchResult | null;
  activeAnswer: number;
  setActiveAnswer: (index: number) => void;
  onMatch: () => void;
  onCopy: (text?: string) => void;
  onPractice: () => void;
  onCoverLetter: () => void;
  onLinkedIn: () => void;
}) {
  const answer = result?.answerVariants?.[activeAnswer];
  return (
    <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Answer studio</p>
          <h2 className="premium-heading-wrap text-lg font-semibold text-[var(--text-primary)]">Match a hard question</h2>
        </div>
        <AssistantMark size="sm" state={matching ? 'thinking' : result ? 'success' : 'idle'} />
      </div>

      <textarea
        value={question}
        onChange={event => setQuestion(event.target.value)}
        placeholder='Paste a behavioral or application question, for example "Tell me about a time you handled conflict."'
        rows={5}
        className="mt-4 w-full resize-none rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 text-base leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]"
      />
      <button type="button" onClick={onMatch} disabled={matching || !question.trim()} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-deep)] disabled:cursor-not-allowed disabled:opacity-50">
        <span className="material-symbols-rounded text-[18px]">{matching ? 'progress_activity' : 'neurology'}</span>
        {matching ? 'Taco is matching proof...' : 'Find best story'}
      </button>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {result.categories?.slice(0, 3).map(category => (
                <span key={category.category} className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${ACCENT_CHIP}`}>
                  {category.category}{category.confidence > 0 ? ` ${category.confidence}%` : ''}
                </span>
              ))}
            </div>

            {result.rankedStories?.length > 0 ? (
              <div className="space-y-2">
                {result.rankedStories.slice(0, 3).map(story => (
                  <div key={story.id} className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="wrap-natural min-w-0 text-sm font-semibold text-[var(--text-primary)]">{story.title}</p>
                      {story.fitScore > 0 ? (
                        <span className="whitespace-nowrap rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{story.fitScore}%</span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">Fit n/a</span>
                      )}
                    </div>
                    <p className="premium-copy-wrap mt-1 text-xs leading-5 text-[var(--text-secondary)]">{story.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[16px] border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] p-4 text-sm text-[var(--warning)]">No strong story match yet. Add one for this category.</div>
            )}

            {result.answerVariants?.length > 0 && (
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  {result.answerVariants.map((variant, index) => (
                    <button
                      key={`${variant.label}-${index}`}
                      type="button"
                      onClick={() => setActiveAnswer(index)}
                      className={`inline-flex min-h-[44px] items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${activeAnswer === index ? ACCENT_CHIP : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}`}
                    >
                      {variant.title}
                    </button>
                  ))}
                </div>
                <p className="premium-copy-wrap text-sm leading-6 text-[var(--text-secondary)]">{answer?.answer}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onCopy(answer?.answer)} className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">Copy</button>
                  <button type="button" onClick={onPractice} className={`inline-flex min-h-[44px] items-center justify-center rounded-[12px] border px-3 py-2 text-xs font-semibold transition hover:bg-[var(--accent-hover)] ${ACCENT_CHIP}`}>Practice</button>
                  <button type="button" onClick={onCoverLetter} className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">Cover letter</button>
                  <button type="button" onClick={onLinkedIn} className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">LinkedIn</button>
                </div>
              </div>
            )}

            {[...(result.gaps || []), ...(result.qualityWarnings || [])].length > 0 && (
              <InsightList title="Taco noticed" items={[...(result.gaps || []), ...(result.qualityWarnings || [])]} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function CoveragePanel({ coverage }: { coverage: CoverageMap | null }) {
  const items = [
    ...(coverage?.covered || []).map(item => ({ ...item, status: 'covered' as const })),
    ...(coverage?.uncovered || []).map(category => ({ category, storyCount: 0, status: 'gap' as const })),
  ].slice(0, 15);

  return (
    <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Coverage map</p>
          <h2 className="premium-heading-wrap text-lg font-semibold text-[var(--text-primary)]">Behavioral category coverage</h2>
        </div>
        <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-secondary)]">{coverage ? `${coverage.covered.length} of ${coverage.total} categories` : '...'}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {items.map(item => (
          <div key={item.category} className={`min-w-0 rounded-[14px] border p-3 ${item.status === 'covered' ? 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : 'border-dashed border-[var(--border-subtle)] bg-[var(--card-bg)]'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`material-symbols-rounded text-[17px] ${item.status === 'covered' ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>{item.status === 'covered' ? 'check_circle' : 'radio_button_unchecked'}</span>
              {/* A gap has no stories by definition — render the absence, not a "0". */}
              {item.status === 'covered'
                ? <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{item.storyCount}</span>
                : <span className="text-[11px] font-medium text-[var(--text-muted)]">Gap</span>}
            </div>
            <p className="wrap-natural mt-2 text-xs font-semibold capitalize text-[var(--text-primary)]">{item.category}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConnectedMoves({ onNavigate }: { onNavigate: (path: string) => void }) {
  const moves = [
    { label: 'Network CRM', detail: 'Use this story as an outreach angle', icon: 'contacts', path: '/suite/network' },
    { label: 'Applications', detail: 'Attach proof to an interview stage', icon: 'work', path: '/suite/applications' },
    { label: 'Market Oracle', detail: 'Check if proof gaps block the role', icon: 'travel_explore', path: '/suite/market-oracle' },
  ];

  return (
    <section className="elevation-card rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Connected next moves</p>
      <div className="mt-3 grid gap-2">
        {moves.map(move => (
          <button key={move.path} type="button" onClick={() => onNavigate(move.path)} className="flex min-h-[44px] min-w-0 items-center gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-left hover:bg-[var(--bg-hover)]">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border ${ACCENT_CHIP}`}>
              <span className="material-symbols-rounded text-[19px]">{move.icon}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">{move.label}</span>
              <span className="premium-copy-wrap block text-xs leading-5 text-[var(--text-muted)]">{move.detail}</span>
            </span>
            <span className="material-symbols-rounded shrink-0 text-[18px] text-[var(--text-muted)]">arrow_forward</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function InsightList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  const list = items.filter(Boolean);
  return (
    <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{title}</p>
      {list.length ? (
        <ul className="mt-2 space-y-1.5">
          {list.slice(0, 5).map(item => (
            <li key={item} className="flex min-w-0 gap-2 text-xs leading-5 text-[var(--text-secondary)]">
              <span className="material-symbols-rounded mt-0.5 shrink-0 text-[14px] text-[var(--accent)]">check</span>
              <span className="wrap-natural min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{empty || 'Nothing flagged.'}</p>
      )}
    </div>
  );
}

function FirstRunPanel({ onManual, onExtract }: { onManual: () => void; onExtract: () => void }) {
  const actions = [
    { label: 'Extract from resume', icon: 'description', onClick: onExtract },
    { label: 'Import debrief', icon: 'rate_review', onClick: onExtract },
    { label: 'Tell Taco a story', icon: 'forum', onClick: onManual },
    { label: 'Paste accomplishment', icon: 'edit_note', onClick: onExtract },
  ];

  return (
    <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5">
      <AssistantMark size="sm" state="idle" />
      <h3 className="premium-heading-wrap mt-4 text-lg font-semibold text-[var(--text-primary)]">Start with one real win</h3>
      <p className="premium-copy-wrap mt-2 text-sm leading-6 text-[var(--text-secondary)]">Story Bank becomes powerful after a few proof stories. Add one now and Taco can reuse it across the suite.</p>
      <div className="mt-4 grid gap-2">
        {actions.map(action => (
          <button key={action.label} type="button" onClick={action.onClick} className="flex min-h-[44px] items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-left hover:bg-[var(--bg-hover)]">
            <span className="material-symbols-rounded text-[19px] text-[var(--accent)]">{action.icon}</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StorySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3].map(item => (
        <div key={item} className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-[13px] bg-[var(--bg-elevated)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-[var(--bg-elevated)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
