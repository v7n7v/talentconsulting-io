'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
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
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
        copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
      }`}
    >
      <span className="material-symbols-rounded text-[12px]">{copied ? 'check' : 'content_copy'}</span>
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

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#06b6d4' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${fill} ${circumference}` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

export default function LinkedInOptimizerPage() {
  const { context: kitContext, updateContext } = useApplicationKitContext();
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

  useEffect(() => {
    if (kitContext.resumeSnapshot) {
      setResumeContext(kitContext.resumeSnapshot);
      setHasResumeContext(true);
    }
    if ((kitContext.targetRole || kitContext.jobTitle) && !targetRole) {
      setTargetRole(kitContext.targetRole || kitContext.jobTitle || '');
    }
    if (kitContext.linkedinResult?.status === 'success' && kitContext.linkedinResult.data && !result) {
      setResult(kitContext.linkedinResult.data as OptimizeResult);
    }
  }, [kitContext.updatedAt]);

  // Auto-populate from Resume Studio draft (sessionStorage)
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('talent-resume-draft');
      if (!draft) return;
      const parsed = JSON.parse(draft);

      if (parsed.morphedResume) {
        setResumeContext(parsed.morphedResume);
        setHasResumeContext(true);
        updateContext({
          resumeSnapshot: parsed.morphedResume,
          resumeSource: 'resume_studio',
          targetRole: parsed.morphedResume.title || parsed.jobTitle || '',
          jobTitle: parsed.jobTitle || parsed.morphedResume.title || '',
          jobDescription: parsed.jobDescription || '',
        });

        // Auto-fill target role from resume title
        if (parsed.morphedResume.title && !targetRole) {
          setTargetRole(parsed.morphedResume.title);
        }
      }

      showToast('Resume data loaded from your morph. Ready to optimize.', 'check_circle');
    } catch (e) {
      // Silently fail
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOptimize = async () => {
    const keywordGaps = getMissingKeywordsFromAts(kitContext.atsResult?.data);
    updateContext({
      targetRole,
      linkedinResult: { status: 'loading', updatedAt: new Date().toISOString() },
    });
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/linkedin-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline,
          about,
          targetRole: [
            targetRole || kitContext.targetRole || kitContext.jobTitle || '',
            keywordGaps.length ? `Recruiter keywords to cover: ${keywordGaps.join(', ')}` : '',
            kitContext.jobDescription ? `Target JD: ${kitContext.jobDescription.slice(0, 4000)}` : '',
          ].filter(Boolean).join('\n\n'),
          // Send morphed resume directly if available
          ...(resumeContext ? { resumeData: resumeContext } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        updateContext({ linkedinResult: { status: 'success', data, updatedAt: new Date().toISOString() } });
        showToast('Profile analyzed!', 'person');
      } else {
        updateContext({ linkedinResult: { status: 'error', error: data.error || 'Failed', updatedAt: new Date().toISOString() } });
        if (!handleApiError(data)) showToast(data.error || 'Failed', 'cancel');
      }
    } catch (error: any) {
      updateContext({ linkedinResult: { status: 'error', error: error.message || 'Something went wrong', updatedAt: new Date().toISOString() } });
      showToast('Something went wrong', 'cancel');
    }
    setLoading(false);
  };

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto px-4 py-3 md:p-6">
      {renderAuthModal()}
      <SuiteToolHeader
        tool="linkedin"
        title="LinkedIn Optimizer"
        subtitle="Get found by recruiters: optimize your headline and about section."
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
              if (resumeTitle && !targetRole) setTargetRole(resumeTitle);
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
          if (patch.targetRole !== undefined || patch.jobTitle !== undefined) setTargetRole(patch.targetRole || patch.jobTitle || '');
          if (patch.resumeSnapshot) {
            setResumeContext(patch.resumeSnapshot);
            setHasResumeContext(true);
          }
        }}
      />

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Input */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="rounded-2xl p-5 space-y-4" style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="material-symbols-rounded text-blue-500 text-lg">edit</span>
              {hasResumeContext ? 'Your resume is loaded — paste your current LinkedIn to compare, or leave blank to generate fresh.' : 'Paste Your Current LinkedIn'}
            </h3>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">
                Headline <span className="opacity-50">(the text under your name)</span>
              </label>
              <input
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                placeholder="e.g. Software Engineer at Acme Corp"
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-blue-500/50"
              />
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{headline.length}/220 characters</p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">
                About Section <span className="opacity-50">(your summary)</span>
              </label>
              <textarea
                value={about}
                onChange={e => setAbout(e.target.value)}
                placeholder="Paste your current About section here... or leave blank to generate fresh from your resume."
                rows={6}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-blue-500/50 resize-none"
              />
              <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{about.length}/2600 characters</p>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">Target Role</label>
              <input
                value={targetRole}
                onChange={e => {
                  setTargetRole(e.target.value);
                  updateContext({ targetRole: e.target.value, jobTitle: e.target.value });
                }}
                placeholder="What role do you want recruiters to find you for?"
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-blue-500/50"
              />
            </div>

            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <p className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                <span className="material-symbols-rounded text-[14px] text-blue-400 mt-0.5 shrink-0">lightbulb</span>
                {hasResumeContext
                  ? 'Your resume is loaded. Leave fields blank to auto-generate from your application kit and ATS keyword gaps.'
                  : 'Leave fields blank to auto-generate from your saved resume context.'}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.005 }}
              whileTap={{ scale: 0.995 }}
              onClick={handleOptimize}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white disabled:opacity-40 relative overflow-hidden group"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                boxShadow: '0 4px 20px rgba(59,130,246,0.2)',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-500" role="alert">
                {kitContext.linkedinResult.error || 'LinkedIn optimization failed. Try again with a resume or target role loaded.'}
              </div>
            )}
            {kitContext.linkedinResult?.status === 'success' && result && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-500">
                LinkedIn positioning is ready and available to the rest of this application kit.
              </div>
            )}
          </div>
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
                className="h-full flex items-center justify-center min-h-[400px] rounded-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <span className="material-symbols-rounded text-3xl text-blue-500">person_search</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Enter Your Profile</h3>
                  <p className="text-sm text-[var(--text-tertiary)] max-w-xs">
                    {hasResumeContext
                      ? 'Your resume is loaded. Paste your headline & about to compare, or let us generate fresh.'
                      : 'Paste your headline & about, or let us generate from your resume.'}
                  </p>
                </div>
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
                <div className="rounded-2xl p-4 flex items-center justify-between" style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">Profile Score</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Based on recruiter visibility, keyword density, and hook strength</p>
                  </div>
                  <ScoreRing score={result.overallScore} />
                </div>

                {/* Section Tabs */}
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  {(['headline', 'about'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveSection(s)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeSection === s
                          ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                          : 'text-[var(--text-tertiary)]'
                      }`}
                    >
                      <ScoreRing score={result[s].score} size={24} />
                      {s === 'headline' ? 'Headline' : 'About Section'}
                    </button>
                  ))}
                </div>

                {/* Section Content */}
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <AnimatePresence mode="wait">
                    <motion.div key={activeSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {/* Current */}
                      {result[activeSection].current && result[activeSection].current !== 'Not provided' && (
                        <div className="mb-3">
                          <label className="text-[10px] font-bold text-red-400/60 block mb-1">CURRENT</label>
                          <div className="p-3 rounded-xl text-sm text-[var(--text-tertiary)] line-through opacity-60" style={{ background: 'var(--bg-elevated)' }}>
                            {result[activeSection].current}
                          </div>
                        </div>
                      )}

                      {/* Optimized */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-emerald-400">OPTIMIZED</label>
                          <CopyButton text={result[activeSection].optimized} />
                        </div>
                        <div className="p-3 rounded-xl text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap border border-emerald-500/20" style={{ background: 'rgba(16,185,129,0.05)' }}>
                          {result[activeSection].optimized}
                        </div>
                      </div>

                      {/* Tips */}
                      {result[activeSection].tips.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[var(--text-tertiary)]">TIPS</label>
                          {result[activeSection].tips.map((t, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                              <span className="material-symbols-rounded text-[14px] text-blue-400 mt-0.5 shrink-0">tips_and_updates</span>
                              {t}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Keywords & Quick Wins */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <h4 className="text-[10px] font-bold text-amber-400 mb-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[14px]">key</span> Missing Keywords
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {result.keywordsMissing.map((k, i) => (
                        <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">{k}</span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <h4 className="text-[10px] font-bold text-emerald-400 mb-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[14px]">bolt</span> Quick Wins
                    </h4>
                    <div className="space-y-1">
                      {result.quickWins.map((w, i) => (
                        <p key={i} className="text-[11px] text-[var(--text-secondary)] flex items-start gap-1.5">
                          <span className="text-emerald-400 shrink-0">•</span> {w}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
