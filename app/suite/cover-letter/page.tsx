'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader } from '@/components/suite/SuiteToolChrome';
import { saveCoverLetter, getCoverLetters, deleteCoverLetter, type CoverLetter } from '@/lib/database-suite';
import { exportDocument, downloadBlob } from '@/lib/doc-export';
import { authFetch } from '@/lib/auth-fetch';
import { useAuthGate } from '@/hooks/useAuthGate';
import ApplicationKitContextBar from '@/components/ApplicationKitContextBar';
import ResumeLibraryPicker from '@/components/ResumeLibraryPicker';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import {
  type ApplicationKitContext,
  getMissingKeywordsFromAts,
  inferCompanyFromJobDescription,
  inferRoleFromJobDescription,
  resumeSnapshotToText,
  resumeVersionToApplicationKitContext,
} from '@/lib/application-kit';
import {
  ProofEngineReport,
  type ProofCheckTone,
  type ProofEngineReportData,
  type ProofRequirementStatus,
} from '@/components/suite/ProofEngineReport';

function CopyButton({ text, label = 'Copy', className: cn }: { text: string; label?: string; className?: string }) {
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
      className={cn || `flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
        copied ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20'
      }`}
    >
      <span className="material-symbols-rounded text-[14px]">{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Copied!' : label}
    </button>
  );
}

interface CoverLetterResult {
  coverLetter: string;
  subject: string;
  keyHighlights: string[];
  wordCount: number;
  toneScore: number;
}

function normalizeForProof(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function keywordStatusToRequirement(status: string): ProofRequirementStatus {
  if (status === 'matched') return 'matched';
  if (status === 'partial') return 'partial';
  return 'missing';
}

function extractRequirementTerms(jobDescription: string): string[] {
  const matches = jobDescription.match(/\b[A-Z]?[a-z0-9+#.]+(?:[\s/-]+[A-Z]?[a-z0-9+#.]+){0,2}\b/g) || [];
  const blocked = new Set([
    'and', 'the', 'with', 'for', 'from', 'that', 'this', 'you', 'your', 'our', 'role', 'work',
    'team', 'will', 'are', 'have', 'has', 'job', 'description', 'company', 'experience',
  ]);
  const seen = new Set<string>();

  return matches
    .map(term => term.trim())
    .filter(term => term.length > 3)
    .filter(term => !blocked.has(term.toLowerCase()))
    .filter(term => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function buildCoverLetterProofReport(input: {
  result: CoverLetterResult;
  company: string;
  jobTitle: string;
  jobDescription: string;
  resumeContext: any;
  kitContext: ApplicationKitContext;
  tone: string;
  template: string;
}): ProofEngineReportData {
  const { result, company, jobTitle, jobDescription, resumeContext, kitContext, tone, template } = input;
  const resumeText = kitContext.resumeText || resumeSnapshotToText(resumeContext || kitContext.resumeSnapshot);
  const letterText = normalizeForProof(result.coverLetter);
  const normalizedResume = normalizeForProof(resumeText);
  const atsKeywords = Array.isArray(kitContext.atsResult?.data?.keywords) ? kitContext.atsResult?.data?.keywords : [];
  const missingKeywords = getMissingKeywordsFromAts(kitContext.atsResult?.data);
  const requirements: ProofEngineReportData['requirements'] = [];

  if (atsKeywords.length > 0) {
    const order: Record<string, number> = { missing: 0, partial: 1, matched: 2 };
    [...atsKeywords]
      .sort((a: any, b: any) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
      .slice(0, 10)
      .forEach((keyword: any) => {
        const label = String(keyword.keyword || '').trim();
        const inLetter = label ? letterText.includes(normalizeForProof(label)) : false;
        requirements.push({
          label: label || 'Job requirement',
          status: keywordStatusToRequirement(keyword.status),
          evidence: inLetter
            ? 'The letter mentions this requirement. Confirm it is tied to a real resume fact.'
            : keyword.status === 'matched'
              ? 'The resume has this signal, but the letter may not foreground it.'
              : 'This remains a gap. Do not claim it unless the user can prove it.',
          source: keyword.category ? String(keyword.category).replace('_', ' ') : 'ATS context',
        });
      });
  } else {
    extractRequirementTerms(jobDescription).forEach(term => {
      const normalizedTerm = normalizeForProof(term);
      const inLetter = letterText.includes(normalizedTerm);
      const inResume = normalizedResume.includes(normalizedTerm);
      requirements.push({
        label: term,
        status: inLetter && inResume ? 'matched' : inLetter ? 'partial' : 'missing',
        evidence: inLetter && inResume
          ? 'This appears in both the resume context and cover letter.'
          : inLetter
            ? 'This appears in the letter. Confirm resume evidence before using it.'
            : 'This job-description signal is not visible in the letter.',
        source: 'Job description',
      });
    });
  }

  if (requirements.length === 0) {
    requirements.push(
      {
        label: company || 'Target company',
        status: company ? 'matched' : 'missing',
        evidence: company ? 'The letter is attached to a named company.' : 'Add a company before using this letter.',
        source: 'Target details',
      },
      {
        label: jobTitle || 'Target role',
        status: jobTitle ? 'matched' : 'missing',
        evidence: jobTitle ? 'The letter is attached to a named role.' : 'Add a role before using this letter.',
        source: 'Target details',
      }
    );
  }

  result.keyHighlights.slice(0, Math.max(0, 10 - requirements.length)).forEach(highlight => {
    const normalizedHighlight = normalizeForProof(highlight);
    requirements.push({
      label: highlight.slice(0, 90),
      status: normalizedResume.includes(normalizedHighlight) ? 'matched' : 'partial',
      evidence: 'This highlight was used by the letter draft. Check it against the resume before sending.',
      source: 'Key highlight',
    });
  });

  const rejectedClaims = missingKeywords.slice(0, 5).map(keyword => ({
    claim: keyword,
    reason: 'ATS context marks this as missing or partial.',
    decision: 'Block from the cover letter until the user provides evidence',
  }));

  if (!resumeText.trim()) {
    rejectedClaims.push({
      claim: 'Resume-specific achievements',
      reason: 'No resume context is loaded for this cover letter.',
      decision: 'Use only general positioning until a resume is selected',
    });
  }

  return {
    title: 'Cover letter proof report',
    description: 'This report checks whether the draft is grounded in the resume, tied to the job description, and still safe for user review before copy, save, or export.',
    score: Math.max(0, Math.min(100, Math.round(result.toneScore || kitContext.atsResult?.data?.overallScore || 0))),
    scoreLabel: 'Draft trust',
    sourceLabel: jobDescription.trim() ? 'Cover Letter Studio job description' : 'Cover Letter Studio target fields',
    requirements: requirements.slice(0, 12),
    preservedFacts: [
      {
        label: 'Resume context',
        detail: resumeText.trim()
          ? 'The draft had resume context available. Review exact titles, metrics, dates, and employers before use.'
          : 'No resume context was loaded, so proof is limited.',
        tone: resumeText.trim() ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Company and role',
        detail: `${company || 'Company missing'} and ${jobTitle || 'role missing'} define the target for this draft.`,
        tone: company && jobTitle ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Highlights used',
        detail: result.keyHighlights.length > 0
          ? `${result.keyHighlights.length} highlight${result.keyHighlights.length === 1 ? '' : 's'} were used and should be checked against the resume.`
          : 'No key highlights were returned by the generator.',
        tone: result.keyHighlights.length > 0 ? 'warning' as ProofCheckTone : 'neutral' as ProofCheckTone,
      },
      {
        label: 'Style settings',
        detail: `${tone} tone and ${template} structure were used for this draft.`,
        tone: 'neutral' as ProofCheckTone,
      },
    ],
    rejectedClaims,
    changes: [
      {
        before: 'The user had target details, resume context, and a blank letter state.',
        after: `Taco produced a ${result.wordCount}-word draft for ${company || 'the company'}.`,
        rationale: 'The draft becomes useful only after the user checks proof, edits claims, and approves it.',
      },
      {
        before: 'Job-description terms were outside the letter workflow.',
        after: requirements.length > 0
          ? 'The draft now exposes matched, partial, and missing signals in the same result state.'
          : 'The draft still needs a job description or ATS context for stronger evidence.',
        rationale: 'This makes cover-letter writing part of the review-first packet system.',
      },
    ],
    formattingChecks: [
      {
        label: 'Word count',
        detail: `${result.wordCount} words. Recruiter-friendly cover letters usually stay near 250 to 350 words.`,
        tone: result.wordCount >= 200 && result.wordCount <= 375 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'Tone score',
        detail: `${result.toneScore}/100 tone score from the cover-letter generator.`,
        tone: result.toneScore >= 80 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
      },
      {
        label: 'No-invention guard',
        detail: missingKeywords.length > 0
          ? `${missingKeywords.length} keyword gap${missingKeywords.length === 1 ? '' : 's'} remain. Treat them as prompts, not claims.`
          : 'No ATS keyword gaps are attached to this cover-letter context.',
        tone: missingKeywords.length > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
      },
      {
        label: 'Review before use',
        detail: 'Copy, save, and export actions should happen after the user checks the proof report.',
        tone: 'warning' as ProofCheckTone,
      },
    ],
  };
}

const TONES = [
  { id: 'conversational', icon: 'chat', label: 'Conversational', desc: 'Warm & natural' },
  { id: 'professional', icon: 'business_center', label: 'Professional', desc: 'Formal & polished' },
  { id: 'confident', icon: 'bolt', label: 'Confident', desc: 'Bold & assertive' },
  { id: 'storytelling', icon: 'auto_stories', label: 'Storytelling', desc: 'Personal anecdote' },
];

const TEMPLATES = [
  { id: 'classic', icon: 'article', label: 'Classic', desc: '3 paragraphs' },
  { id: 'modern', icon: 'view_list', label: 'Modern', desc: 'Bullet-point style' },
  { id: 'impact', icon: 'trending_up', label: 'Impact-Led', desc: 'Lead with achievements' },
  { id: 'pain_point', icon: 'psychology', label: 'Pain Point', desc: 'Solve their problem' },
];

export default function CoverLetterPage() {
  const { user } = useStore();
  const { context: kitContext, updateContext } = useApplicationKitContext();
  /* /api/agent/cover-letter answers a free user with 403 + `upgrade: true`, and
     this page used to render that as a red toast with no way out. The page is a
     click away from the Gallery's Career Writing row and from the landing rail,
     so the block had to stop looking like a failure. */
  const { handleApiError, renderAuthModal } = useAuthGate();
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [tone, setTone] = useState('conversational');
  const [template, setTemplate] = useState('classic');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoverLetterResult | null>(null);
  const [resumeContext, setResumeContext] = useState<any>(null);
  const [hasResumeContext, setHasResumeContext] = useState(false);

  // Cover letter persistence
  const [savedLetters, setSavedLetters] = useState<CoverLetter[]>([]);
  const [showSavedLetters, setShowSavedLetters] = useState(false);
  const [saving, setSaving] = useState(false);

  // Preview mode
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (kitContext.resumeSnapshot) {
      setResumeContext(kitContext.resumeSnapshot);
      setHasResumeContext(true);
    }
    if (kitContext.company && !company) setCompany(kitContext.company);
    if ((kitContext.jobTitle || kitContext.targetRole) && !jobTitle) setJobTitle(kitContext.jobTitle || kitContext.targetRole || '');
    if (kitContext.jobDescription && !jobDescription) setJobDescription(kitContext.jobDescription);
    if (kitContext.coverLetterResult?.status === 'success' && kitContext.coverLetterResult.data && !result) {
      setResult(kitContext.coverLetterResult.data as CoverLetterResult);
    }
  }, [kitContext.updatedAt]);

  // Auto-populate from Resume Studio draft (sessionStorage)
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem('talent-resume-draft');
      if (!draft) return;
      const parsed = JSON.parse(draft);

      const contextPatch: any = {};

      // Set resume context for API
      if (parsed.morphedResume) {
        setResumeContext(parsed.morphedResume);
        setHasResumeContext(true);
        contextPatch.resumeSnapshot = parsed.morphedResume;
        contextPatch.resumeSource = 'resume_studio';
      }

      // Auto-fill company from explicit field, then fallback to regex
      if (parsed.companyName) {
        setCompany(parsed.companyName);
        contextPatch.company = parsed.companyName;
      } else if (parsed.jobDescription) {
        const jd = parsed.jobDescription;
        const companyMatch = jd.match(/(?:at|@|company[:\s]+|employer[:\s]+)\s*([A-Z][A-Za-z0-9\s&.,']+?)(?:\s*[-–—]|\s*\n|\s*is\s|\s*,)/i);
        if (companyMatch) {
          setCompany(companyMatch[1].trim());
          contextPatch.company = companyMatch[1].trim();
        }
      }

      // Auto-fill job title from explicit field or morphed resume title
      if (parsed.jobTitle) {
        setJobTitle(parsed.jobTitle);
        contextPatch.jobTitle = parsed.jobTitle;
        contextPatch.targetRole = parsed.jobTitle;
      } else if (parsed.morphedResume?.title) {
        setJobTitle(parsed.morphedResume.title);
        contextPatch.jobTitle = parsed.morphedResume.title;
        contextPatch.targetRole = parsed.morphedResume.title;
      }

      // Auto-fill JD if available
      if (parsed.jobDescription) {
        setJobDescription(parsed.jobDescription);
        contextPatch.jobDescription = parsed.jobDescription;
      }

      if (Object.keys(contextPatch).length) updateContext(contextPatch);

      showToast('Resume data loaded from your morph. Ready to generate.', 'check_circle');
    } catch (e) {
      // Silently fail — sessionStorage might not be available
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved cover letters
  useEffect(() => {
    if (!user) return;
    getCoverLetters().then(r => { if (r.success && r.data) setSavedLetters(r.data); });
  }, [user]);

  const handleSaveLetter = async () => {
    if (!result || !company) return;
    setSaving(true);
    try {
      const res = await saveCoverLetter({
        resumeVersionId: kitContext.resumeVersionId || undefined,
        company,
        jobTitle,
        content: result.coverLetter,
        subject: result.subject,
        tone,
        template,
        keyHighlights: result.keyHighlights,
        wordCount: result.wordCount,
        toneScore: result.toneScore,
        jobDescription: jobDescription || undefined,
        metadata: {
          resumeVersionId: kitContext.resumeVersionId || null,
          company,
          jobTitle,
          jobDescription,
          atsScore: kitContext.atsResult?.data?.overallScore || null,
          keywordGaps: getMissingKeywordsFromAts(kitContext.atsResult?.data),
          sourceTool: 'cover_letter',
        },
      });
      if (res.success) {
        showToast('Cover letter saved!', 'check_circle');
        getCoverLetters().then(r => { if (r.success && r.data) setSavedLetters(r.data); });
      } else {
        showToast(res.error || 'Save failed', 'cancel');
      }
    } catch { showToast('Save failed', 'cancel'); }
    setSaving(false);
  };

  const handleDownloadPDF = async () => {
    if (!result) return;
    try {
      const { blob, filename } = await exportDocument(result.coverLetter, {
        title: `Cover Letter - ${company} - ${jobTitle}`,
        format: 'docx',
      });
      downloadBlob(blob, filename);
      showToast('Downloaded!', 'download');
    } catch { showToast('Download failed', 'cancel'); }
  };

  const loadSavedLetter = (letter: CoverLetter) => {
    setResult({
      coverLetter: letter.content,
      subject: letter.subject,
      keyHighlights: letter.key_highlights || [],
      wordCount: letter.word_count,
      toneScore: letter.tone_score,
    });
    setCompany(letter.company);
    setJobTitle(letter.job_title);
    setTone(letter.tone);
    setTemplate(letter.template);
    if (letter.job_description) setJobDescription(letter.job_description);
    setShowSavedLetters(false);
    showToast(`Loaded letter for ${letter.company}`, 'check_circle');
  };

  const handleDeleteLetter = async (id: string) => {
    const res = await deleteCoverLetter(id);
    if (res.success) {
      setSavedLetters(prev => prev.filter(l => l.id !== id));
      showToast('Deleted', 'check_circle');
    }
  };

  const handleGenerate = async () => {
    if (!company || !jobTitle) {
      showToast('Company and job title are required', 'warning');
      return;
    }
    const keywordGaps = getMissingKeywordsFromAts(kitContext.atsResult?.data);
    updateContext({
      company,
      jobTitle,
      targetRole: jobTitle,
      jobDescription,
      coverLetterResult: { status: 'loading', updatedAt: new Date().toISOString() },
    });
    setLoading(true);
    try {
      const res = await authFetch('/api/agent/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          jobTitle,
          jobDescription: keywordGaps.length
            ? `${jobDescription || ''}\n\nATS keyword gaps to address naturally: ${keywordGaps.join(', ')}`
            : jobDescription,
          tone,
          template,
          // Send morphed resume directly if available — API will use this instead of Firestore
          ...(resumeContext ? { resumeData: resumeContext } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        updateContext({ coverLetterResult: { status: 'success', data, updatedAt: new Date().toISOString() } });
        showToast('Cover letter generated!', 'edit_document');
      } else {
        updateContext({ coverLetterResult: { status: 'error', error: data.error || 'Failed', updatedAt: new Date().toISOString() } });
        if (!handleApiError(data)) showToast(data.error || 'Failed', 'cancel');
      }
    } catch (error: any) {
      updateContext({ coverLetterResult: { status: 'error', error: error.message || 'Something went wrong', updatedAt: new Date().toISOString() } });
      showToast('Something went wrong', 'cancel');
    }
    setLoading(false);
  };

  const coverProofReport = result ? buildCoverLetterProofReport({
    result,
    company,
    jobTitle,
    jobDescription,
    resumeContext,
    kitContext,
    tone,
    template,
  }) : null;

  return (
    <div className="mobile-app-content min-h-dvh max-w-4xl mx-auto px-4 py-3 md:p-6">
      {renderAuthModal()}
      <SuiteToolHeader
        tool="cover-letter"
        title="Cover Letter Studio"
        subtitle="AI-crafted cover letters from your resume."
        icon="edit_document"
        pageHelpId="cover-letter"
        className="mb-4 md:mb-6"
        actions={
          <ResumeLibraryPicker
            onSelect={(rv) => {
              const patch = resumeVersionToApplicationKitContext(rv);
              updateContext(patch);
              setResumeContext(rv.content);
              setHasResumeContext(true);
            }}
            selectedId={kitContext.resumeVersionId}
            selectedName={kitContext.resumeVersionName}
            compact
          />
        }
      />

      <ApplicationKitContextBar
        context={kitContext}
        activeTool="cover-letter"
        onChange={(patch) => {
          updateContext(patch);
          if (patch.company !== undefined) setCompany(patch.company || '');
          if (patch.jobTitle !== undefined || patch.targetRole !== undefined) setJobTitle(patch.jobTitle || patch.targetRole || '');
          if (patch.jobDescription !== undefined) {
            setJobDescription(patch.jobDescription || '');
            if (!company && patch.jobDescription) setCompany(inferCompanyFromJobDescription(patch.jobDescription));
            if (!jobTitle && patch.jobDescription) setJobTitle(inferRoleFromJobDescription(patch.jobDescription));
          }
          if (patch.resumeSnapshot) {
            setResumeContext(patch.resumeSnapshot);
            setHasResumeContext(true);
          }
        }}
      />



      {/* Saved Cover Letters Panel */}
      <AnimatePresence>
        {showSavedLetters && savedLetters.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
            <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="material-symbols-rounded text-rose-500 text-lg">folder</span>
                  Saved Cover Letters
                </h3>
                <button onClick={() => setShowSavedLetters(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <span className="material-symbols-rounded text-lg">close</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {savedLetters.map(letter => (
                  <div key={letter.id} className="p-3 rounded-xl border border-[var(--border-subtle)] group relative" style={{ background: 'var(--bg-elevated)' }}>
                    <button onClick={() => loadSavedLetter(letter)} className="text-left w-full">
                      <p className="text-[12px] font-bold text-[var(--text-primary)] truncate">{letter.company}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">{letter.job_title}</p>
                      <p className="text-[9px] text-[var(--text-tertiary)] mt-1">{new Date(letter.created_at).toLocaleDateString()} • {letter.word_count} words</p>
                    </button>
                    <button onClick={() => handleDeleteLetter(letter.id)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 text-red-500 hover:bg-red-500/20">
                      <span className="material-symbols-rounded text-[14px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        {/* Input Panel */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="rounded-2xl p-5 space-y-4" style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          }}>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="material-symbols-rounded text-rose-500 text-lg">work</span>
              Target Position
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">Company *</label>
                <input value={company} onChange={e => { setCompany(e.target.value); updateContext({ company: e.target.value }); }} placeholder="e.g. Stripe"
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-rose-500/50" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">Job Title *</label>
                <input value={jobTitle} onChange={e => { setJobTitle(e.target.value); updateContext({ jobTitle: e.target.value, targetRole: e.target.value }); }} placeholder="e.g. Senior PM"
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-rose-500/50" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-tertiary)] block mb-1">Job Description <span className="opacity-50">(optional but recommended)</span></label>
              <textarea value={jobDescription} onChange={e => { setJobDescription(e.target.value); updateContext({ jobDescription: e.target.value }); }}
                placeholder="Paste the job description here for the best results..."
                rows={5}
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-rose-500/50 resize-none" />
            </div>
          </div>

          {/* Tone Picker */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-2.5 flex items-center gap-1.5">
              <span className="material-symbols-rounded text-[14px] text-rose-500">tune</span> Tone
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TONES.map(t => (
                <button key={t.id} onClick={() => setTone(t.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${
                    tone === t.id ? 'border-2 border-rose-500/40' : 'border border-[var(--border-subtle)]'
                  }`}
                  style={{ background: tone === t.id ? 'rgba(244,63,94,0.06)' : 'var(--bg-elevated)' }}
                >
                  <span className={`material-symbols-rounded text-lg ${tone === t.id ? 'text-rose-500' : 'text-[var(--text-tertiary)]'}`}>{t.icon}</span>
                  <div>
                    <p className={`text-[11px] font-bold ${tone === t.id ? 'text-rose-500' : 'text-[var(--text-primary)]'}`}>{t.label}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)]">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Template Picker */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-2.5 flex items-center gap-1.5">
              <span className="material-symbols-rounded text-[14px] text-rose-500">dashboard</span> Template
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all ${
                    template === t.id ? 'border-2 border-rose-500/40' : 'border border-[var(--border-subtle)]'
                  }`}
                  style={{ background: template === t.id ? 'rgba(244,63,94,0.06)' : 'var(--bg-elevated)' }}
                >
                  <span className={`material-symbols-rounded text-lg ${template === t.id ? 'text-rose-500' : 'text-[var(--text-tertiary)]'}`}>{t.icon}</span>
                  <div>
                    <p className={`text-[11px] font-bold ${template === t.id ? 'text-rose-500' : 'text-[var(--text-primary)]'}`}>{t.label}</p>
                    <p className="text-[9px] text-[var(--text-tertiary)]">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.995 }}
            onClick={handleGenerate}
            disabled={loading || !company || !jobTitle}
            className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white disabled:opacity-40 relative overflow-hidden group"
            style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)', boxShadow: '0 4px 20px rgba(244,63,94,0.2)' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <span className="material-symbols-rounded text-lg">auto_fix_high</span>}
            {loading ? 'Writing...' : 'Generate Cover Letter'}
          </motion.button>

          {loading && (
            <AssistantThinkingTile
              variant="resume"
              accentColor="#f43f5e"
              icon="edit_document"
              title="Taco is drafting your cover letter"
              description="Personalizing the opening, mapping resume proof, and checking tone."
              activeStage="writing"
              stages={['Company hook', 'Resume proof', 'JD coverage', 'Polish']}
              compact
            />
          )}

          {kitContext.coverLetterResult?.status === 'error' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-500" role="alert">
              {kitContext.coverLetterResult.error || 'Cover letter generation failed. Check the target details and try again.'}
            </div>
          )}
          {kitContext.coverLetterResult?.status === 'success' && result && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-500">
              Cover letter ready. Copy, export DOCX, save, or continue to LinkedIn.
            </div>
          )}
        </motion.div>

        {/* Results Panel */}
        <div>
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center min-h-[500px] rounded-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                    <span className="material-symbols-rounded text-3xl text-rose-500">draw</span>
                  </div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Your Cover Letter</h3>
                  <p className="text-sm text-[var(--text-tertiary)] max-w-xs">
                    {hasResumeContext
                      ? 'Your morphed resume is loaded. Choose tone & template, then generate.'
                      : 'Choose your tone and template, then generate. We\'ll pull from your resume automatically.'}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Meta bar + Actions */}
                <div className="rounded-2xl p-4 flex items-center justify-between" style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                }}>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-black text-[var(--text-primary)]">{result.wordCount}</p>
                      <p className="text-[9px] text-[var(--text-tertiary)]">words</p>
                    </div>
                    <div className="w-px h-8" style={{ background: 'var(--border-subtle)' }} />
                    <div className="text-center">
                      <p className="text-lg font-black text-rose-500">{result.toneScore}</p>
                      <p className="text-[9px] text-[var(--text-tertiary)]">tone score</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setShowPreview(!showPreview)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        showPreview ? 'bg-rose-500/20 text-rose-500 border-rose-500/30' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-rose-500/30'
                      }`}>
                      <span className="material-symbols-rounded text-[14px]">{showPreview ? 'edit_note' : 'preview'}</span>
                      {showPreview ? 'Raw' : 'Preview'}
                    </button>
                  </div>
                </div>

                {coverProofReport && (
                  <ProofEngineReport report={coverProofReport} compact />
                )}

                <div className="rounded-2xl p-4" style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                }}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Review actions</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Use these after checking evidence, blocked claims, and missing requirements.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <CopyButton text={result.coverLetter} label="Copy letter" />
                      <button onClick={handleDownloadPDF}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">
                        <span className="material-symbols-rounded text-[14px]">download</span>DOCX
                      </button>
                      {user && (
                        <button onClick={handleSaveLetter} disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50">
                          <span className="material-symbols-rounded text-[14px]">{saving ? 'hourglass_top' : 'save'}</span>Save
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject line */}
                <div className="rounded-xl p-3 flex items-center justify-between" style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                }}>
                  <div>
                    <p className="text-[10px] font-bold text-[var(--text-tertiary)] mb-0.5">EMAIL SUBJECT</p>
                    <p className="text-sm text-[var(--text-primary)]">{result.subject}</p>
                  </div>
                  <CopyButton text={result.subject} label="" className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-rose-500 hover:bg-rose-500/10 transition-all" />
                </div>

                {/* Cover Letter — Preview or Raw */}
                {showPreview ? (
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                    <div className="bg-white p-8 md:p-12 text-slate-800 min-h-[400px]" style={{ fontFamily: "'Georgia', serif" }}>
                      {/* Letter header */}
                      <div className="mb-8">
                        <p className="text-sm text-slate-500">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p className="text-sm text-slate-500 mt-1">{company} Hiring Team</p>
                      </div>
                      {/* Letter body */}
                      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700">
                        {result.coverLetter.split('\n\n').filter(Boolean).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl p-5" style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  }}>
                    <div className="prose prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap text-sm">
                      {result.coverLetter}
                    </div>
                  </div>
                )}

                {/* Key Highlights */}
                {result.keyHighlights.length > 0 && (
                  <div className="rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <h4 className="text-[10px] font-bold text-rose-500 mb-2 flex items-center gap-1">
                      <span className="material-symbols-rounded text-[14px]">star</span> KEY HIGHLIGHTS USED
                    </h4>
                    <div className="space-y-1.5">
                      {result.keyHighlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="material-symbols-rounded text-[14px] text-rose-400 mt-0.5 shrink-0">check_circle</span>
                          {h}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regenerate */}
                <button onClick={handleGenerate} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 text-[var(--text-secondary)] border transition-all hover:border-rose-500/30"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
                >
                  <span className="material-symbols-rounded text-[14px]">refresh</span> Regenerate with same settings
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
