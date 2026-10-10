'use client';

import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { buildToolStory, storyStep } from '@/lib/tool-story-adapters';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuitePanel, SuiteEmptyState, EvidenceBadge } from '@/components/suite/SuiteToolChrome';
import { authFetch } from '@/lib/auth-fetch';
import { useAuthGate } from '@/hooks/useAuthGate';
import ApplicationKitContextBar from '@/components/ApplicationKitContextBar';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { getMissingKeywordsFromAts, resumeVersionToApplicationKitContext } from '@/lib/application-kit';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Copied!', 'content_copy');
    setTimeout(() => setCopied(false), 1500);
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-[11px] font-semibold transition-all ${
        copied ? 'text-[var(--success)]' : 'text-[var(--accent)] hover:opacity-80'
      }`}
      style={{
        background: copied
          ? 'color-mix(in srgb, var(--success) 16%, transparent)'
          : 'var(--accent-dim)',
      }}
    >
      <span className="material-symbols-rounded text-[15px]">{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface OptimizeResult {
  headline: { current: string; optimized: string; score: number; tips: string[] };
  about: { current: string; optimized: string; score: number; tips: string[] };
  overallScore: number;
  keywordsMissing: string[];
  profileStrengths: string[];
  quickWins: string[];
}

function ScoreRing({ score, size = 56, label = 'Not scored' }: { score?: number | null; size?: number; label?: string }) {
  // This is an LLM-generated subjective score (source: app/api/agent/
  // linkedin-optimize/route.ts — Groq is prompted to "Score each section 0-100").
  // Per refined MUST6 it is a product-judgment signal and the ring is kept — but a
  // 0/absent/undefined score must NOT draw a danger-tinted 0-fill ring with a
  // literal "0" (that renders "we measured, and the answer is nothing"). When there
  // is no measured value, render a labelled absence instead of a ring.
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return (
      <div
        role="img"
        aria-label={label}
        title={label}
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)]"
        style={{ width: size, height: size }}
      >
        <span
          className="material-symbols-rounded leading-none"
          aria-hidden="true"
          style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}
        >
          remove
        </span>
      </div>
    );
  }

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = (score / 100) * circumference;
  // Status ramp only — kept distinct from the blue --accent, which is reserved
  // for interaction. Three status hues exist (success/warning/danger), so the
  // original 80/60 "excellent vs good" split collapses into one success band;
  // the 60 and 40 boundaries are preserved exactly.
  const stroke = score >= 60 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" style={{ stroke: 'var(--border-subtle)' }} strokeWidth="4" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" style={{ stroke }} strokeWidth="4" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${fill} ${circumference}` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color: stroke }}>{score}</span>
      </div>
    </div>
  );
}

export default function LinkedInOptimizerPage() {
  const { context: kitContext, updateContext, captureGuard } = useApplicationKitContext();
  /* Same block, same shape as Cover Letter Studio: /api/agent/linkedin-optimize
     403s a free user with `upgrade: true`, and a red toast was the whole
     answer. This page is linked from the Gallery and from the landing rail. */
  const { handleApiError, renderAuthModal } = useAuthGate();
  const [headline, setHeadline] = useState('');
  const [about, setAbout] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [activeSection, setActiveSection] = useState<'headline' | 'about'>('headline');
  const [resumeContext, setResumeContext] = useState<any>(null);
  const [hasResumeContext, setHasResumeContext] = useState(false);

  useToolGuidance(buildToolStory({
    toolId: 'linkedin', title: 'LinkedIn profile', contextKey: JSON.stringify([kitContext.scopeId, kitContext.resumeVersionId, activeSection]),
    purpose: 'Prepare source-based profile wording you can review and copy to LinkedIn yourself.',
    pending: loading, hasResult: Boolean(result), failed: kitContext.linkedinResult?.status === 'error', stale: kitContext.linkedinResult?.status === 'stale',
    work: [storyStep('headline', 'Bring your real profile', 'Paste your current headline and About text, or choose a genuine resume in the source bar.', 'linkedin-headline'), storyStep('target', 'Set a profile target', 'Name the role you want this profile to address. This does not change application requirements.', 'linkedin-target'), storyStep('optimize', 'Prepare suggested wording', 'Choose Optimize when ready. Review the existing account or plan message if this action is unavailable.', 'linkedin-optimize')],
    result: [storyStep('review', 'Review this section', 'Read the editable source-based wording and check every fact. Select another section yourself to review it.', 'linkedin-result'), storyStep('copy', 'Use only the wording you approve', 'The section copy control copies text; it does not update or publish your LinkedIn profile.', 'linkedin-result')],
    recovery: [storyStep('retry', 'Review the source and retry', 'A failed attempt does not create a new profile. Your existing inputs remain editable; choose Optimize again when ready.', 'linkedin-optimize')],
  }));

  useEffect(() => {
    setResumeContext(kitContext.resumeSnapshot || null);
    setHasResumeContext(Boolean(kitContext.resumeSnapshot));
    setTargetRole(kitContext.profileTargetRole || '');
    setHeadline(kitContext.profileHeadline || '');
    setAbout(kitContext.profileAbout || '');
    const output = kitContext.linkedinResult;
    setResult(output?.status === 'success' && output.data ? output.data as OptimizeResult : null);
  }, [kitContext.ownerId, kitContext.scopeId, kitContext.revision, kitContext.linkedinResult]);

  useEffect(() => { setLoading(false); }, [kitContext.ownerId, kitContext.scopeId, kitContext.revision]);

  const handleOptimize = async () => {
    updateContext({
      profileTargetRole: targetRole,
      linkedinResult: { status: 'loading', updatedAt: new Date().toISOString() },
    });
    const isCurrent = captureGuard('linkedinResult');
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline,
          about,
          targetRole,
          resumeVersionId: kitContext.resumeVersionId,
          // Send morphed resume directly if available
          ...(resumeContext ? { resumeData: resumeContext } : {}),
        }),
      });
      const data = await res.json();
      if (!isCurrent()) return;
      if (data.success) {
        setResult(data);
        updateContext({ linkedinResult: { status: 'success', data, updatedAt: new Date().toISOString() } });
        showToast('Profile analyzed!', 'person');
      } else {
        updateContext({ linkedinResult: { status: 'error', error: data.error || 'Failed', updatedAt: new Date().toISOString() } });
        if (!handleApiError(data)) showToast(data.error || 'Failed', 'cancel');
      }
    } catch (error: any) {
      if (!isCurrent()) return;
      updateContext({ linkedinResult: { status: 'error', error: error.message || 'Something went wrong', updatedAt: new Date().toISOString() } });
      showToast('Something went wrong', 'cancel');
    }
    if (isCurrent()) setLoading(false);
  };

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto px-4 py-3 md:p-6">
      {renderAuthModal()}
      <SuiteToolHeader
        tool="linkedin"
        title="LinkedIn Optimizer"
        subtitle="Select relevant source evidence, review your draft, and copy it to LinkedIn."
        icon="badge"
        pageHelpId="linkedin"
        className="mb-4 md:mb-6"
        actions={
          <ResumeLibraryPicker
            onSelect={(rv) => {
              const patch = resumeVersionToApplicationKitContext(rv);
              updateContext(patch);
              setResumeContext(rv.content);
              setHasResumeContext(true);
              const resumeTitle = (rv.content as any)?.title;
              if (resumeTitle && !targetRole) updateContext({ profileTargetRole: resumeTitle });
            }}
            selectedId={kitContext.resumeVersionId}
            selectedName={kitContext.resumeVersionName}
            compact
          />
        }
      />

      <ApplicationKitContextBar
        context={kitContext}
        activeTool="linkedin"
        onChange={(patch) => {
          updateContext(patch);
          // Profile positioning has its own target; application labels do not replace it.
          if (patch.resumeSnapshot) {
            setResumeContext(patch.resumeSnapshot);
            setHasResumeContext(true);
          }
        }}
      />

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Input */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <SuitePanel className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="material-symbols-rounded text-[var(--accent)] text-lg">edit</span>
              {hasResumeContext ? 'Your resume is loaded — paste your current LinkedIn to compare, or leave blank to generate fresh.' : 'Paste Your Current LinkedIn'}
            </h3>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">
                Headline <span className="opacity-50">(the text under your name)</span>
              </label>
              <input data-guide="linkedin-headline"
                value={headline}
                maxLength={220}
                onChange={e => { setHeadline(e.target.value); updateContext({ profileHeadline: e.target.value }); }}
                placeholder="e.g. Software Engineer at Acme Corp"
                className="w-full px-3 py-2.5 rounded-xl text-base bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              />
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{headline.length}/220 characters</p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">
                About Section <span className="opacity-50">(your summary)</span>
              </label>
              <textarea
                value={about}
                maxLength={2600}
                onChange={e => { setAbout(e.target.value); updateContext({ profileAbout: e.target.value }); }}
                placeholder="Paste your current About section here... or leave blank to generate fresh from your resume."
                rows={6}
                className="w-full px-3 py-2.5 rounded-xl text-base bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
              />
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{about.length}/2600 characters</p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">Target Role</label>
              <input data-guide="linkedin-target"
                value={targetRole}
                onChange={e => {
                  setTargetRole(e.target.value);
                  updateContext({ profileTargetRole: e.target.value });
                }}
                placeholder="What role do you want recruiters to find you for?"
                className="w-full px-3 py-2.5 rounded-xl text-base bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="p-3 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-subtle)]">
              <p className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                <span className="material-symbols-rounded text-[14px] text-[var(--accent)] mt-0.5 shrink-0">lightbulb</span>
                {hasResumeContext
                  ? 'Your selected resume supplies evidence. Your profile target is separate from application requirements.'
                  : 'Paste your current profile or select a resume. Drafts never add missing qualifications.'}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              data-guide="linkedin-optimize"
            onClick={handleOptimize}
              disabled={loading || (!hasResumeContext && !headline.trim() && !about.trim())}
              className="btn-primary w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? (
                <div
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent-on) 35%, transparent)',
                    borderTopColor: 'var(--accent-on)',
                  }}
                />
              ) : (
                <span className="material-symbols-rounded text-lg">auto_fix_high</span>
              )}
              {loading ? 'Analyzing...' : 'Optimize Profile'}
            </motion.button>

            {loading && (
              <AssistantThinkingTile
                variant="jobs"
                icon="badge"
                title="Taco is shaping your recruiter signal"
                description="Tuning headline, about section, keywords, and profile checklist."
                activeStage="optimizing"
                stages={['Headline', 'About', 'Keywords', 'Checklist']}
                compact
              />
            )}

            {kitContext.linkedinResult?.status === 'error' && (
              <div
                className="rounded-xl border px-3 py-2 text-xs"
                role="alert"
                style={{
                  borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)',
                  background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                  color: 'var(--danger)',
                }}
              >
                {kitContext.linkedinResult.error || 'LinkedIn optimization failed. Try again with a resume or target role loaded.'}
              </div>
            )}
            {kitContext.linkedinResult?.status === 'success' && result && (
              <div
                className="rounded-xl border px-3 py-2 text-xs"
                style={{
                  borderColor: 'color-mix(in srgb, var(--success) 35%, transparent)',
                  background: 'color-mix(in srgb, var(--success) 10%, transparent)',
                  color: 'var(--success)',
                }}
              >
                LinkedIn positioning is ready and available to the rest of this application kit.
              </div>
            )}
          </SuitePanel>
        </motion.div>

        {/* Results */}
        <div>
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <SuiteEmptyState
                  icon="person_search"
                  title="Enter Your Profile"
                  description={hasResumeContext
                    ? 'Your resume is loaded. Paste your headline & about to compare, or let us generate fresh.'
                    : 'Paste your headline & about, or let us generate from your resume.'}
                  className="flex min-h-[400px] flex-col items-center justify-center"
                />
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Overall Score */}
                <SuitePanel className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">Source-based draft</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Selected source wording is preserved. Review your edits before copying; recruiter outcomes are not scored.</p>
                  </div>
                  {typeof result.overallScore === 'number' && result.overallScore > 0 ? (
                    <ScoreRing score={result.overallScore} />
                  ) : (
                    /* No measured score — labelled absence, never a 0-fill ring. */
                    <EvidenceBadge state="missing" label="Not scored" />
                  )}
                </SuitePanel>

                {/* Section Tabs */}
                <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)]" style={{ border: '1px solid var(--border-subtle)' }}>
                  {(['headline', 'about'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveSection(s)}
                      className={`flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeSection === s
                          ? 'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]'
                          : 'text-[var(--text-tertiary)] border border-transparent'
                      }`}
                    >
                      {typeof result[s].score === 'number' && <ScoreRing score={result[s].score} size={24} />}
                      {s === 'headline' ? 'Headline' : 'About Section'}
                    </button>
                  ))}
                </div>

                {/* Section Content */}
                <SuitePanel className="space-y-4">
                  <AnimatePresence mode="wait">
                    <motion.div key={activeSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {/* Current */}
                      {result[activeSection].current && result[activeSection].current !== 'Not provided' && (
                        <div className="mb-3">
                          <label className="text-[12px] font-bold text-[var(--text-muted)] block mb-1">CURRENT</label>
                          <div className="p-3 rounded-xl text-sm text-[var(--text-tertiary)] line-through opacity-60 bg-[var(--bg-elevated)]">
                            {result[activeSection].current}
                          </div>
                        </div>
                      )}

                      {/* Optimized */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[12px] font-bold text-[var(--success)]">EDITABLE DRAFT</label>
                          <CopyButton text={result[activeSection].optimized} />
                        </div>
                        <textarea data-guide="linkedin-result"
                          aria-label={`Editable optimized ${activeSection}`}
                          maxLength={activeSection === 'headline' ? 220 : 2600}
                          value={result[activeSection].optimized}
                          onChange={(event) => {
                            const data = { ...result, [activeSection]: { ...result[activeSection], optimized: event.target.value } };
                            setResult(data); updateContext({ linkedinResult: { status: 'success', data, updatedAt: new Date().toISOString() } });
                          }}
                          className="min-h-[120px] w-full resize-y rounded-xl border p-3 text-sm leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)',
                            background: 'color-mix(in srgb, var(--success) 8%, transparent)',
                          }}
                        />
                      </div>

                      {/* Tips */}
                      {result[activeSection].tips.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[12px] font-bold text-[var(--text-tertiary)]">TIPS</label>
                          {result[activeSection].tips.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                              <span className="material-symbols-rounded text-[14px] text-[var(--accent)] mt-0.5 shrink-0">tips_and_updates</span>
                              {t}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </SuitePanel>

                {/* Keywords & Quick Wins */}
                <div className="grid grid-cols-2 gap-3">
                  <SuitePanel as="div">
                    <h4 className="text-[12px] font-bold text-[var(--warning)] mb-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[14px]">key</span> Missing Keywords
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {result.keywordsMissing.map((k, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[11px] font-medium border"
                          style={{
                            color: 'var(--warning)',
                            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                          }}
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </SuitePanel>

                  <SuitePanel as="div">
                    <h4 className="text-[12px] font-bold text-[var(--success)] mb-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[14px]">bolt</span> Quick Wins
                    </h4>
                    <div className="space-y-1">
                      {result.quickWins.map((w, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                          <span className="text-[var(--success)] shrink-0">•</span> {w}
                        </p>
                      ))}
                    </div>
                  </SuitePanel>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
