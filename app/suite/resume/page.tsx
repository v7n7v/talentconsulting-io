'use client';

import { TacoName } from '@/components/BrandLogo';
import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { saveResumeVersion, getResumeVersions, createJobApplication, deleteResumeVersion, updateResumeVersion, type ResumeVersion } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import PageHelp from '@/components/PageHelp';
import { useToolGuidance } from '@/components/guidance/ToolGuidanceProvider';
import { createResumeGuidance, resumeGuidanceContext } from '@/lib/resume-guidance';
import { downloadResumePDF } from '@/lib/pdf-templates';
import { ResumeExportPreview } from '@/components/resume-studio/ResumeExportPreview';
import { ResumeDesignPanel } from '@/components/resume-studio/ResumeDesignPanel';
import { ResumeDesignStyles } from '@/components/resume-studio/ResumeDesignStyles';
import { ResumeDesignWorkbench } from '@/components/resume-studio/ResumeDesignWorkbench';
import { ResumeDesignPaper } from '@/components/resume-studio/ResumeDesignPaper';
import { ResumeFlagshipHTML } from '@/components/resume-templates/flagship';
import { createResumeFlagshipDesign, isResumeFlagshipDesign } from '@/lib/resume-design/flagship';
import { reconcileResumeEntryBreaks } from '@/lib/resume-design/source-breaks';
import { createResumeDesign, normalizeResumeDesign, readResumeDesign, switchResumeDesignTemplate, resumeDesignSignature, type ResumeDesignConfig } from '@/lib/resume-design';
import { cleanResumeText, isResumeTextMissing, normalizeResume, serializeResumeToText } from '@/lib/resume-normalizer';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { handoffGuestResumeDraft, previousResumeDraftKey, restorePreviousResumeDraft } from '@/lib/resume-auth-handoff';
import { generationNeedsRegeneration, retainPreviousGeneration, restoreResumeGeneration, resumeGenerationKey, resumeSectionStatuses, type ResumeGeneration, type ResumeGenerationInputs, type ResumeSection } from '@/lib/resume-workflow';
import { ResumeSourceDiagnosis } from '@/components/resume-studio/ResumeSourceDiagnosis';
import { prepareResumeForExport } from '@/lib/resume-export-truth';
import { ResumeTemplate as ResumeTemplateComponent } from '@/components/resume-templates';
import { CuratedTemplateMiniature } from '@/components/resume-templates/curated';
import { getHeaderPreset } from '@/components/resume-templates/header-system';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getDefaultPaletteId,
  getPersistedResumePaletteId,
  getPersistedResumeDesign,
  getPersistedResumeTemplateId,
  getRegisteredTemplate,
  getSelectableTemplates,
  getTemplatePalette,
  getTemplatePalettes,
  getTemplateWithPalette,
  isResumeTemplateSelectionEntitled,
  recommendTemplateIds,
  resolveEntitledTemplateIdForSelection,
  resolveInitialResumeTemplateId,
  resolveSelectableTemplateDeepLinkId,
  resolveTemplateIdForSelection,
  type ResumeTemplateMetadata,
  type StudioPaletteOption,
} from '@/lib/resume-templates';
import { useUserTier } from '@/hooks/use-user-tier';
import { PLAN_IDENTITIES } from '@/lib/plan-identity';
// docx is imported dynamically in downloadWord() to avoid naming conflicts with @react-pdf/renderer
import { saveAs } from 'file-saver';
import { authFetch } from '@/lib/auth-fetch';
import { analytics } from '@/lib/analytics';
import FileUploadDropzone from '@/components/FileUploadDropzone';
import SkillGapWarningModal from '@/components/modals/SkillGapWarningModal';
import UpgradeModal from '@/components/UpgradeModal';
import AuthModal from '@/components/modals/AuthModal';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import type { ProofResult } from '@/lib/tfidf-proof';
import { readResumeTrackingRecovery, writeResumeTrackingRecovery, clearResumeTrackingRecovery, stableResumeTrackingKey, resumeTrackingDraftKey, resumeTrackingIdempotencyKey, type ResumeTrackingRecovery } from '@/lib/resume-tracking-recovery';
import { mergeApplicationKitContext, resumeSnapshotToText, handoffApplicationKitContext } from '@/lib/application-kit';
import {
  ProofEngineReport,
  type ProofCheckTone,
  type ProofEngineReportData,
  type ProofRequirementStatus,
} from '@/components/suite/ProofEngineReport';
import {
  RESUME_MORPH_DEFAULT_MAX,
  RESUME_MORPH_FULL_UNLOCK,
  type ResumeMorphConsentStatus,
} from '@/lib/resume-morph-safety';
import { ResumeReviewWorkbench } from '@/components/resume-studio/ResumeReviewWorkbench';
import { ResumeContentEditor, createResumeEditorSession, type ResumeEditorSession } from '@/components/resume-studio/ResumeContentEditor';
import { YourExperienceNavigation, type ExperienceDestination } from '@/components/resume-studio/YourExperienceNavigation';
import { ResumeWorkspaceLibrary } from '@/components/resume-studio/ResumeWorkspaceLibrary';
import { ResumeStartPanel } from '@/components/resume-studio/ResumeStartPanel';
import { ResumeDocumentWorkspace } from '@/components/resume-studio/ResumeDocumentWorkspace';
import { ResumeTemplateBrowser } from '@/components/resume-studio/ResumeTemplateBrowser';
import { groupResumeVersions } from '@/lib/resume-library-groups';
import { resumeTextDraft } from '@/lib/resume-text-draft';
import { isIsolatedWorkspacePreview } from '@/lib/workspace-preview';
import { createWorkspaceMetadata, readWorkspaceVersion, stableWorkspaceContentHash, type WorkspaceSourceSnapshot, type WorkspaceOrigin } from '@/lib/resume-workspace';
import '@/components/resume-studio/experience-workspace.css';
import { ResumeIntakeReview } from '@/components/resume-intake/ResumeIntakeReview';
import { isCurrentSourceParse, resumeDraftStorageKey } from '@/lib/resume-intake';
import type { ResumeStudioStage } from '@/components/resume-studio/ResumeStudioProgress';
import { ResumeStudioHeader } from '@/components/resume-studio/ResumeStudioHeader';
import {
  DEFAULT_RESUME_REVIEW_STATE,
  sanitizeResumeReviewState,
  deriveResumeReviewLedger,
  applyResumeReviewDecisions,
  type ResumeReviewResume,
  type ResumeReviewState,
} from '@/lib/resume-review-ledger';
import '@/components/resume-studio/resume-review-workbench.css';
import '@/components/resume-studio/resume-source-console.css';
import '@/components/resume-studio/resume-studio-system.css';
import '@/components/resume-studio/resume-guided-workflow.css';

// ============ TYPES ============
interface ResumeData {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  website?: string;
  summary: string;
  experience: { company: string; role: string; duration: string; achievements: string[] }[];
  education: { degree: string; institution: string; year: string; details?: string }[];
  skills: { category: string; items: string[] }[];
  certifications?: string[];
  additionalSections?: CanonicalResume['additionalSections'];
}


interface ResumeMorphGuardrailReportView {
  requestedMorphPercentage?: number;
  effectiveMorphPercentage?: number;
  maxAllowedMorphPercentage?: number;
  consentUsed?: boolean;
  protectedFields?: string[];
  blockedChanges?: {
    path: string;
    original: string;
    attempted: string;
    action: 'restored' | 'removed';
  }[];
  blockedChangeCount?: number;
  blockedChangesTruncated?: boolean;
}

// ============ CONSTANTS ============
const EMPTY_RESUME: ResumeData = {
  name: '',
  title: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
};

const ENABLE_RESUME_REVIEW_WORKBENCH = true;

const TEMPLATES = getSelectableTemplates();
const PAID_TEMPLATE_PLAN_LABEL = PLAN_IDENTITIES.pro.label;

type ResumeTemplateOption = ResumeTemplateMetadata;
type TemplateColors = { primary: string; accent: string; text: string };

function resolveReplacementTemplate(templateId?: string): ResumeTemplateOption {
  const replacementId = resolveTemplateIdForSelection(templateId);
  return TEMPLATES.find(template => template.id === replacementId) || TEMPLATES[0];
}

function resolveEntitledReplacementTemplate(
  templateId: string | undefined,
  hasProAccess: boolean,
): ResumeTemplateOption {
  const entitledId = resolveEntitledTemplateIdForSelection(templateId, hasProAccess);
  return TEMPLATES.find(template => template.id === entitledId) || TEMPLATES[0];
}

interface TemplateExportProfile {
  preview: string;
  export: string;
  ats: string;
  audience: string;
  notes: string[];
}

function getTemplateExportProfile(templateId: string): TemplateExportProfile {
  const metadata = getRegisteredTemplate(templateId);
  if (templateId === 'editorial-authority') {
    return {
      preview: 'Editorial',
      export: 'Match + linear',
      ats: metadata?.atsClassification || 'Human-first',
      audience: 'Executive readers',
      notes: [
        'The PDF preserves the two-column editorial composition shown in the preview.',
        'The Word companion uses a deliberate linear reading order for easier reflow and parsing.',
        'Human-first means the content remains real text, but this editorial layout is not presented as universally ATS-safe.',
      ],
    };
  }

  if (templateId === 'technical-signal') {
    return {
      preview: 'Clean technical',
      export: 'Match + linear',
      ats: metadata?.atsClassification || 'ATS-conscious',
      audience: 'Engineering readers',
      notes: [
        'The PDF preserves the monospaced signal hierarchy and evidence-led section order.',
        'The Word companion remains deliberately linear with native headings and bullets.',
        'Quantified outcomes are emphasized without replacing or inventing resume content.',
      ],
    };
  }

  if (templateId === 'brutalist-voltage') {
    return {
      preview: 'Brutally vibrant',
      export: 'Match + linear',
      ats: metadata?.atsClassification || 'Human-first',
      audience: 'Creative readers',
      notes: [
        'The PDF preserves the electric color-block composition and high-impact hierarchy.',
        'The Word companion uses a clean linear order for accessibility and parsing.',
        'Use the linear Word companion when a highly conservative ATS workflow is required.',
      ],
    };
  }

  if (metadata && NEW_SIGNATURE_TEMPLATE_IDS.includes(templateId as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number])) {
    return {
      preview: metadata.structure.family.replace(/-/g, ' '),
      export: metadata.exportProfile.pdf === 'designed'
        ? 'Designed PDF + linear Word'
        : 'Linear PDF + linear Word',
      ats: metadata.atsClassification,
      audience: metadata.audience.join(' · '),
      notes: [
        metadata.atsLimitation,
        'The PDF preserves this template family while keeping resume content as real selectable text.',
        'The Word companion uses conventional headings and a deliberate linear reading order. ATS compatibility varies by system and is not guaranteed.',
      ],
    };
  }

  return {
    preview: 'Exact',
    export: 'PDF/Word',
    ats: 'Text-safe',
    audience: 'Role-aligned',
    notes: [
      'Exact preview uses the same template renderer as the final resume view.',
      'PDF export uses text-normalized, ATS-conscious section ordering.',
      'Word export preserves the selected visual language where supported.',
    ],
  };
}

function PaletteDots({
  colors,
  selected = false,
  locked = false,
  size = 'sm',
}: {
  colors: TemplateColors;
  selected?: boolean;
  locked?: boolean;
  size?: 'xs' | 'sm' | 'md';
}) {
  const dotClass = size === 'md' ? 'h-4 w-4' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span className={`relative inline-flex items-center gap-1 rounded-full border px-1.5 py-1 transition-all ${
      selected
        ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
    }`}>
      {[colors.primary, colors.accent, colors.text].map((color, index) => (
        <span
          key={`${color}-${index}`}
          className={`${dotClass} rounded-full border border-[var(--border-subtle)]`}
          style={{ backgroundColor: color }}
        />
      ))}
      {locked && !selected && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <span className="material-symbols-rounded text-[11px] text-[var(--text-muted)]">lock</span>
        </span>
      )}
    </span>
  );
}


// ============ HELPER: Check if resume has data ============
function hasResumeData(resume: ResumeData | null): resume is ResumeData {
  if (!resume) return false;
  return !!(resume.name || resume.title || resume.summary || resume.experience?.length || resume.education?.length || resume.skills?.length || resume.certifications?.length || resume.additionalSections?.some(section => section.items.length));
}

function skillLabels(resume: ResumeData | null) {
  if (!resume?.skills?.length) return [];
  return normalizeResume(resume).skills.flatMap(group => group.items).filter(Boolean);
}




const STARTING_POINTS = [
  { id: 'upload', label: 'Upload Resume', icon: 'upload_file', detail: 'Best when you have a PDF, Word, or TXT file ready.' },
  { id: 'paste', label: 'Paste Text', icon: 'content_paste', detail: 'Bring in clean resume text without a file.' },
  { id: 'recent', label: 'Use Recent Version', icon: 'history', detail: 'Start from a saved library resume.' },
  { id: 'scratch', label: 'Build From Scratch', icon: 'draw', detail: 'Create a clean resume with guided sections.' },
] as const;

const TEMPLATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'technical', label: 'Technical' },
  { id: 'professional', label: 'Specialist' },
  { id: 'career', label: 'Career paths' },
  { id: 'creative', label: 'Creative' },
] as const;

const OPTIMIZATION_MODES = [
  { id: 'conservative', label: 'Conservative', value: 55, detail: 'Preserve voice, tune keywords' },
  { id: 'balanced', label: 'Balanced', value: 72, detail: 'Best fit for most applications' },
  { id: 'strong', label: 'Strong', value: RESUME_MORPH_DEFAULT_MAX, detail: 'Sharper rewrite, still controlled' },
];

const JD_KEYWORD_LIBRARY = [
  'React', 'Next.js', 'TypeScript', 'JavaScript', 'Python', 'SQL', 'Excel', 'Tableau', 'Power BI',
  'AWS', 'Azure', 'GCP', 'Node.js', 'Java', 'Kubernetes', 'Docker', 'Salesforce', 'HubSpot',
  'Agile', 'Scrum', 'Roadmap', 'Analytics', 'Strategy', 'Leadership', 'Operations', 'Finance',
  'Stakeholder', 'Compliance', 'Security', 'Machine Learning', 'AI', 'API', 'CRM', 'SaaS',
];

function getResumeSnapshot(resume: ResumeData | null) {
  if (!resume) return { name: 'Resume', title: 'Target role pending', positions: 0, skills: 0, signal: 'Ready' };
  const skills = skillLabels(resume).length;
  return {
    name: resume.name || 'Resume',
    title: resume.title || 'Target role pending',
    positions: resume.experience?.length || 0,
    skills,
    signal: resume.summary && resume.experience?.length ? 'Strong base' : 'Needs context',
  };
}

function getMissingEducationInstitutions(resume: ResumeData | null) {
  if (!resume?.education?.length) return [];
  return normalizeResume(resume).education
    .map((edu, index) => ({ ...edu, index }))
    .filter(edu => Boolean(edu.degree || edu.year || edu.details) && isResumeTextMissing(edu.institution));
}

function getJobDescriptionSignals(jd: string) {
  const clean = jd.trim();
  const words = clean ? clean.split(/\s+/).filter(Boolean) : [];
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  const lower = clean.toLowerCase();
  const matchedKeywords = JD_KEYWORD_LIBRARY.filter(k => lower.includes(k.toLowerCase())).slice(0, 8);
  const seniority = /principal|staff|director|head of|vp|vice president/i.test(clean)
    ? 'Senior+'
    : /senior|lead|manager/i.test(clean)
      ? 'Mid-senior'
      : /intern|junior|associate|entry/i.test(clean)
        ? 'Early'
        : 'Open';
  const roleLine = lines.find(line => /title|role|position|job/i.test(line)) || lines[0] || '';
  const companyLine = lines.find(line => /company|about us|who we are/i.test(line)) || '';
  const role = roleLine
    .replace(/^(job\s*)?(title|role|position)\s*[:\-]\s*/i, '')
    .slice(0, 72) || 'Paste a job description';
  const company = (companyLine.match(/(?:company|about us|who we are)\s*[:\-]\s*(.+)$/i)?.[1] || '').slice(0, 48);
  return {
    wordCount: words.length,
    role,
    company: company || 'Not detected',
    seniority,
    keywords: matchedKeywords,
    readiness: words.length > 120 ? 'Ready to optimize' : words.length > 0 ? 'Add more detail if available' : 'Waiting for JD',
  };
}

function getRecommendedTemplateIds(signalText: string) {
  return new Set(recommendTemplateIds(signalText, 3));
}

function templateMatchesFilter(template: typeof TEMPLATES[number], filter: typeof TEMPLATE_FILTERS[number]['id']) {
  if (filter === 'all') return true;
  const groups: Record<Exclude<typeof TEMPLATE_FILTERS[number]['id'], 'all'>, string[]> = {
    leadership: ['executive', 'strategy', 'product', 'nonprofit', 'sales'],
    technical: ['technical', 'data'],
    professional: ['finance', 'legal', 'healthcare', 'academic', 'public-sector'],
    career: ['transition', 'early-career'],
    creative: ['creative', 'design', 'editorial'],
  };
  return groups[filter].includes(template.category);
}

function proofStatusFromMatch(match: ProofResult['topJDTerms'][number]['matchedIn']): ProofRequirementStatus {
  if (match === 'both') return 'matched';
  if (match === 'morphed_only' || match === 'original_only') return 'partial';
  return 'missing';
}

function proofEvidenceFromMatch(match: ProofResult['topJDTerms'][number]['matchedIn']) {
  if (match === 'both') return 'Found in the source resume and preserved in the optimized resume.';
  if (match === 'morphed_only') return 'Added by the morph because it appears in the job description. Review before using it.';
  if (match === 'original_only') return 'Found in the source resume, but it is weak or missing in the optimized version.';
  return 'Not found in the source resume or the optimized resume.';
}

function resumeHasContact(resume: ResumeData | null) {
  return Boolean(resume?.email || resume?.phone || resume?.linkedin || resume?.website);
}

function buildResumeMorphProofReport(input: {
  proof: ProofResult | null;
  guardrailReport: ResumeMorphGuardrailReportView | null;
  originalResume: ResumeData | null;
  optimizedResume: ResumeData | null;
  jobDescription: string;
  matchScore: number | null;
  morphPercentage: number;
  selectedTemplateName: string;
  educationInstitutionGaps: number;
}): ProofEngineReportData | null {
  const { proof, guardrailReport, originalResume, optimizedResume, jobDescription, matchScore, morphPercentage, selectedTemplateName, educationInstitutionGaps } = input;
  const hasMorphEvidence = Boolean(proof || guardrailReport || matchScore);
  if (!hasMorphEvidence || !optimizedResume) return null;

  const jdSignals = getJobDescriptionSignals(jobDescription);
  const protectedCount = guardrailReport?.protectedFields?.length || 0;
  const blockedChanges = guardrailReport?.blockedChanges || [];
  const blockedChangeCount = guardrailReport?.blockedChangeCount ?? blockedChanges.length;
  const effectiveStrength = guardrailReport?.effectiveMorphPercentage ?? morphPercentage;
  // MUST6: never coerce an unmeasured score to 0. Absent stays null so the
  // Proof Engine card renders "Not scored" instead of drawing a real 0 ring.
  const score = proof?.optimizedScore ?? matchScore ?? null;
  const sourceTerms = proof?.topJDTerms || [];
  const sortedTerms = [...sourceTerms].sort((a, b) => {
    const order = { neither: 0, original_only: 1, morphed_only: 2, both: 3 };
    return order[a.matchedIn] - order[b.matchedIn];
  });

  const requirements = sortedTerms.slice(0, 12).map(term => ({
    label: term.term,
    status: proofStatusFromMatch(term.matchedIn),
    evidence: proofEvidenceFromMatch(term.matchedIn),
    source: `JD weight ${term.weight}`,
  }));

  if (requirements.length === 0) {
    requirements.push(
      {
        label: jdSignals.role,
        status: jobDescription.trim() ? 'partial' : 'missing',
        evidence: jobDescription.trim()
          ? 'The role target is available, but keyword proof has not produced enough terms yet.'
          : 'Paste a job description before using this as an application-ready resume.',
        source: 'Role target',
      },
      {
        label: selectedTemplateName,
        status: 'matched',
        evidence: 'The selected template can be exported after final review.',
        source: 'Template',
      }
    );
  }

  const preservedFacts = [
    {
      label: 'Identity and contact locked',
      detail: resumeHasContact(originalResume)
        ? 'Contact fields come from the source resume and should not be rewritten by the morph.'
        : 'No contact field was detected. Add contact details before export.',
      tone: resumeHasContact(originalResume) ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
    {
      label: 'Education and credentials locked',
      detail: educationInstitutionGaps === 0
        ? 'Education, certifications, licenses, and schools stay tied to the uploaded resume.'
        : `${educationInstitutionGaps} education entry needs a school name before export, save, or tracking.`,
      tone: educationInstitutionGaps === 0 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
    {
      label: 'Work history locked',
      detail: 'Employers, job titles, dates, and role count are restored from the source resume after morphing.',
      tone: 'success' as ProofCheckTone,
    },
    {
      label: 'Protected fields checked',
      detail: protectedCount > 0
        ? `${protectedCount} protected field groups were checked after the rewrite.`
        : 'Protected field checks ran with the available guardrail report.',
      tone: blockedChangeCount > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
    },
    {
      label: 'Deterministic proof available',
      detail: proof
        ? `TF-IDF proof moved from ${proof.baselineScore}/100 to ${proof.optimizedScore}/100.`
        : 'No TF-IDF proof payload was returned, so review the generated resume manually before export.',
      tone: proof ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
  ];

  const rejectedClaims = blockedChanges.slice(0, 5).map(change => ({
    claim: change.path,
    reason: `The morph tried to ${change.action === 'removed' ? 'add or remove' : 'change'} a protected fact.`,
    decision: `Restored source value: ${change.original}`,
  }));

  const changes = proof?.gapsClosed?.length
    ? proof.gapsClosed.slice(0, 4).map(gap => ({
      before: `"${gap.term}" was not present in the source resume signal.`,
      after: `"${gap.term}" appears in the optimized resume because it matched the job description.`,
      rationale: 'Keep it only if the user can connect it to real work, tools, projects, or training.',
    }))
    : [
      {
        before: proof ? `Source resume match was ${proof.baselineScore}/100.` : 'Source resume was used as the locked baseline.',
        after: `Optimized resume match is ${score != null ? `${score}/100` : 'not scored yet'} at ${effectiveStrength}% morph strength.`,
        rationale: 'The rewrite can improve match language, but protected resume facts still control what can be claimed.',
      },
    ];

  const formattingChecks = [
    {
      label: 'No-invention guard',
      detail: blockedChangeCount > 0
        ? `${blockedChangeCount} protected edit${blockedChangeCount === 1 ? '' : 's'} were blocked or restored.`
        : 'No protected fact changes were reported by the guardrail layer.',
      tone: blockedChangeCount > 0 ? 'warning' as ProofCheckTone : 'success' as ProofCheckTone,
    },
    {
      label: 'Morph strength',
      detail: `${effectiveStrength}% rewrite strength was used. Maximum strength still keeps protected facts locked.`,
      tone: effectiveStrength >= RESUME_MORPH_FULL_UNLOCK ? 'warning' as ProofCheckTone : 'neutral' as ProofCheckTone,
    },
    {
      label: 'Template review',
      detail: `${selectedTemplateName} is selected. Confirm headings and spacing before export.`,
      tone: 'neutral' as ProofCheckTone,
    },
    {
      label: 'Export readiness',
      detail: educationInstitutionGaps === 0
        ? 'Final save, tracking, PDF, and Word export can proceed after user review.'
        : 'Export is blocked until missing school information is added.',
      tone: educationInstitutionGaps === 0 ? 'success' as ProofCheckTone : 'warning' as ProofCheckTone,
    },
  ];

  return {
    title: 'Proof report for this resume morph',
    description: 'This report turns the rewrite into evidence: what matched the job, what changed, which facts stayed locked, and what Talent Studio refused to invent.',
    score,
    scoreLabel: 'Morph fit',
    sourceLabel: jdSignals.role || 'Job description target',
    requirements,
    preservedFacts,
    rejectedClaims,
    changes,
    formattingChecks,
  };
}

function recoverAppliedGeneration(record: Record<string, any>): ResumeGeneration | null {
  const saved = restoreResumeGeneration(record.activeGeneration);
  if (saved) return saved;
  const source = record.reviewSourceSnapshot || record.originalResume;
  const candidate = record.morphedResume || record.candidateSnapshot;
  if (record.documentOrigin !== 'tailored' || !source || !candidate) return null;
  const percentage = record.optimizationStrength ?? record.morphPercentage ?? record.guardrailReport?.effectiveMorphPercentage;
  if (typeof percentage !== 'number') return null;
  return restoreResumeGeneration({ schemaVersion: 2, id: `legacy-${record.documentVersionId || record.savedAt || 'draft'}`,
    createdAt: new Date(record.savedAt || Date.now()).toISOString(),
    inputs: { source, jobDescription: record.jobDescription || '', role: record.applicationData?.jobTitle || record.targetRole || '',
      company: record.applicationData?.companyName || record.targetCompany || '', postingUrl: record.postingUrl || '',
      percentage, targetPageCount: record.targetPageCount || 'auto', unlocked100: record.guardrailReport?.consentUsed === true },
    effectivePercentage: record.guardrailReport?.effectiveMorphPercentage ?? percentage, candidate, review: record.resumeReview,
    score: record.matchScore, proof: record.proofData, guardrailReport: record.guardrailReport,
    presentation: { templateId: record.selectedTemplateId || record.template || '', paletteId: record.selectedPaletteId || record.paletteId || '', pageSize: record.pageSize || 'A4' } });
}

// ============ MAIN COMPONENT ============
export default function LiquidResumePage() {
  const owner = useStore(state => state.user?.uid || 'guest');
  return <ResumeWorkspace key={owner} />;
}

function ResumeWorkspace() {
  const { user } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const isolatedPreview = isIsolatedWorkspacePreview();
  const isReviewDemo = process.env.NODE_ENV !== 'production' && searchParams.get('reviewDemo') === '1';
  const isSourceConfirmDemo = process.env.NODE_ENV !== 'production' && searchParams.get('sourceConfirmDemo') === '1';
  const resumeRef = useRef<HTMLDivElement>(null);
  const mobileCheckFocusHandledRef = useRef(false);
  const templateDeepLinkHandledRef = useRef(false);
  const draftRestoreHandledRef = useRef(false);
  const reviewDemoWasActiveRef = useRef(false);
  const draftOwnerRef = useRef<string | null | undefined>(undefined);
  const sourceParseRequestRef = useRef(0);
  const sourceParseMountedRef = useRef(true);
  const sourceUploadOperationRef = useRef<{ id: string; cancel: () => void; revision: number; ownerId: string | null } | null>(null);

  // ===== STATE =====
  const [mode, setMode] = useState<'choose' | 'morph' | 'create'>('choose');
  const [step, setStep] = useState<'upload' | 'content' | 'jd' | 'morph' | 'enhance' | 'template' | 'preview'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [invalidDocumentError, setInvalidDocumentError] = useState(false);

  // Resume data
  const [originalResume, setOriginalResume] = useState<ResumeData | null>(null);
  const [morphedResume, setMorphedResume] = useState<ResumeData | null>(null);
  const [buildResume, setBuildResume] = useState<ResumeData>({ ...EMPTY_RESUME });
  const [sourceResumeMeta, setSourceResumeMeta] = useState<{ fileName?: string; sourceType?: 'direct' | 'storage' | 'paste' | 'library'; storagePath?: string; characterCount?: number; detectedType?: string; storagePathDeleted?: boolean }>({});

  // Career facts and document revisions have separate identities and save boundaries.
  const [workspaceDestination, setWorkspaceDestination] = useState<ExperienceDestination>('resumes');
  const [experienceDraft, setExperienceDraft] = useState<CanonicalResume>(() => normalizeResume(EMPTY_RESUME));
  const [experienceVersionId, setExperienceVersionId] = useState<string | null>(null);
  const [experienceDirty, setExperienceDirty] = useState(false);
  const [experienceStatus, setExperienceStatus] = useState('');
  const [experienceSaving, setExperienceSaving] = useState(false);
  const experienceSaveBusy = useRef(false);
  const experienceConfirmationRef = useRef<{ key: string; confirmedAt: string } | null>(null);
  const experienceLoadedRef = useRef(false);
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceSourceSnapshot | null>(null);
  const [documentVersionId, setDocumentVersionId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState('My resume');
  const [documentOrigin, setDocumentOrigin] = useState<WorkspaceOrigin>('user_authored');
  const [documentManualEdits, setDocumentManualEdits] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [emptyEditorSession] = useState(createResumeEditorSession);
  const [documentEditorSession, setDocumentEditorSession] = useState<{ epoch: number; value: ResumeEditorSession }>(() => ({ epoch: 0, value: createResumeEditorSession() }));
  const [documentViewSession, setDocumentViewSession] = useState<{ epoch: number; value: 'edit' | 'preview' }>({ epoch: 0, value: 'edit' });
  const [resumeReturn, setResumeReturn] = useState<{ mode: 'morph' | 'create'; step: typeof step }>({ mode: 'create', step: 'content' });
  const [rawSourceText, setRawSourceText] = useState('');
  const [intakeResume, setIntakeResume] = useState<ResumeData | null>(null);
  const [intakeWarnings, setIntakeWarnings] = useState<string[]>([]);
  const [intakeAcknowledged, setIntakeAcknowledged] = useState(false);
  const [alsoSaveExperience, setAlsoSaveExperience] = useState(false);
  const [intakeError, setIntakeError] = useState('');
  const sourceAbortRef = useRef<AbortController | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const libraryRequestRef = useRef(0);
  const documentSaveBusy = useRef(false);
  const [showImport, setShowImport] = useState(false);
  const [templateBrowsing, setTemplateBrowsing] = useState(false);
  const [showDocumentChecks, setShowDocumentChecks] = useState(false);
  const [pageSize, setPageSize] = useState<'A4' | 'LETTER'>('A4');
  const [designConfig, setDesignConfig] = useState<ResumeDesignConfig | null>(() => createResumeDesign(TEMPLATES[0].id));
  const [designSourceNotice, setDesignSourceNotice] = useState('');
  const designSourceRef = useRef<{ boundary:string; source:CanonicalResume; designKey:string } | null>(null);
  const [keepDesignStyle, setKeepDesignStyle] = useState(true);
  const [pdfExportMode, setPdfExportMode] = useState<'designed' | 'application'>('designed');
  const [isExporting, setIsExporting] = useState(false);
  const exportBusyRef = useRef(false);
  const pdfArtifactRef = useRef<{ signature: string; blob: Blob; pageCount: number | null } | null>(null);
  const [reviewedPdfSignature, setReviewedPdfSignature] = useState<string | null>(null);
  const workspaceDeepLinkRef = useRef(false);

  // Morph settings
  const [jobDescription, setJobDescription] = useState('');
  const [activeGeneration, setActiveGeneration] = useState<ResumeGeneration | null>(null);
  const [previousGenerations, setPreviousGenerations] = useState<ResumeGeneration[]>([]);
  const [selectedAppliedVersionId, setSelectedAppliedVersionId] = useState<string | null>(null);
  const morphAbortRef = useRef<AbortController | null>(null);
  const [postingUrl, setPostingUrl] = useState('');
  const [morphPercentage, setMorphPercentage] = useState(75);
  const [targetPageCount, setTargetPageCount] = useState<number | 'auto'>('auto');
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [proofData, setProofData] = useState<ProofResult | null>(null);
  const [morphConsent, setMorphConsent] = useState<ResumeMorphConsentStatus>({
    unlocked100: false,
    acceptedAt: null,
    consentVersion: '',
  });
  const [morphConsentLoading, setMorphConsentLoading] = useState(false);
  const [guardrailReport, setGuardrailReport] = useState<ResumeMorphGuardrailReportView | null>(null);

  // Day-Zero Blueprint
  const [blueprintContent, setBlueprintContent] = useState<string | null>(null);
  const [isBlueprintLoading, setIsBlueprintLoading] = useState(false);
  const [showBlueprintModal, setShowBlueprintModal] = useState(false);

  // Tier awareness
  const { tier, isPro, remaining, caps, loading: tierLoading } = useUserTier();

  // UI state
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [requestedLockedTemplateId, setRequestedLockedTemplateId] = useState<string | null>(null);
  const [selectedPaletteId, setSelectedPaletteId] = useState(getDefaultPaletteId(TEMPLATES[0].id));
  const [templatePaletteSelections, setTemplatePaletteSelections] = useState<Record<string, string>>({});
  const [showPaletteMenu, setShowPaletteMenu] = useState(false);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [activeStart, setActiveStart] = useState<typeof STARTING_POINTS[number]['id']>('upload');
  const [sourcePasteText, setSourcePasteText] = useState('');
  const [showSourceConfirmation, setShowSourceConfirmation] = useState(false);
  const [templateFilter, setTemplateFilter] = useState<typeof TEMPLATE_FILTERS[number]['id']>('all');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [processingStage, setProcessingStage] = useState<'uploading' | 'extracting' | 'parsing' | null>(null);

  // Enhance step state
  const [resumeReview, setResumeReview] = useState<ResumeReviewState>({
    ...DEFAULT_RESUME_REVIEW_STATE,
    decisions: {},
  });
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  // Modals
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const saveModalTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!showSaveModal) return;
    const dialog = document.querySelector<HTMLElement>('[aria-label="Save and track application"]');
    if (!dialog) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!trackingBusyRef.current) setShowSaveModal(false);
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]'));
      if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); saveModalTriggerRef.current?.focus(); };
  }, [showSaveModal]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [saveVersionName, setSaveVersionName] = useState('');
  const [saveCompanyName, setSaveCompanyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveInlineStatus, setSaveInlineStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [applicationData, setApplicationData] = useState({ companyName: '', jobTitle: '', notes: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Skill gap detection
  const [showSkillGapModal, setShowSkillGapModal] = useState(false);
  const [detectedNewSkills, setDetectedNewSkills] = useState<{ skill: string; category: 'technical' | 'soft' | 'domain' }[]>([]);
  const canUseTemplatePalettes = tier === 'studio' || tier === 'god';
  const activePaletteId = canUseTemplatePalettes ? selectedPaletteId : getDefaultPaletteId(selectedTemplate.id);
  const selectedPalette = getTemplatePalette(selectedTemplate, activePaletteId);
  const selectedTemplateWithPalette = getTemplateWithPalette(selectedTemplate, activePaletteId);
  const selectedTemplateColors = selectedTemplateWithPalette.colors;
  const selectedExportProfile = getTemplateExportProfile(selectedTemplate.id);

  const openMaxPaletteUpgrade = () => {
    setShowPaletteMenu(false);
    showToast('Extra resume palettes are included with Talent Max.', 'workspace_premium');
    router.push('/suite/upgrade?plan=studio');
  };

  const selectTemplate = (template: ResumeTemplateOption) => {
    const isLocked = template.tier === 'pro' && !isPro;
    if (isLocked) {
      showToast('Upgrade to Standard to unlock this template', 'info');
      return;
    }
    const savedPaletteId = templatePaletteSelections[template.id];
    const nextPaletteId = canUseTemplatePalettes
      ? getTemplatePalette(template, savedPaletteId || getDefaultPaletteId(template.id)).id
      : getDefaultPaletteId(template.id);
    setSelectedTemplate(template);
    setDesignConfig(previous => previous ? switchResumeDesignTemplate(previous, template.id, normalizeResume(getDisplayResume()), keepDesignStyle) : createResumeDesign(template.id, normalizeResume(getDisplayResume()), template.colors, pageSize));
    setSelectedPaletteId(nextPaletteId);
    setTemplatePaletteSelections(prev => ({ ...prev, [template.id]: nextPaletteId }));
    setShowPaletteMenu(false);
  };

  const selectTemplatePalette = (template: ResumeTemplateOption, palette: StudioPaletteOption) => {
    const isLocked = template.tier === 'pro' && !isPro;
    if (isLocked) {
      showToast('Upgrade to Standard to unlock this template', 'info');
      setShowPaletteMenu(false);
      return;
    }
    if (!palette.isDefault && !canUseTemplatePalettes) {
      openMaxPaletteUpgrade();
      return;
    }
    setSelectedTemplate(template);
    setDesignConfig(previous => {
      const source = normalizeResume(getDisplayResume());
      const next = previous
        ? previous.templateId === template.id ? normalizeResumeDesign(previous, template.id, source) : switchResumeDesignTemplate(previous, template.id, source, true)
        : createResumeDesign(template.id, source, palette.colors, pageSize);
      return { ...next, colors: { ...next.colors, ink: palette.colors.text, heading: palette.colors.primary, accent: palette.colors.accent } };
    });
    setSelectedPaletteId(palette.id);
    setTemplatePaletteSelections(prev => ({ ...prev, [template.id]: palette.id }));
    setShowPaletteMenu(false);
  };

  useEffect(() => {
    sourceParseMountedRef.current = true;
    return () => {
      sourceParseMountedRef.current = false;
      sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
      sourceAbortRef.current?.abort();
      morphAbortRef.current?.abort();
      sourceParseRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (tierLoading || templateDeepLinkHandledRef.current) return;
    const requestedSlug = searchParams.get('template');
    if (!requestedSlug) return;
    const requestedId = resolveSelectableTemplateDeepLinkId(requestedSlug);
    const requested = requestedId
      ? TEMPLATES.find(template => template.id === requestedId)
      : undefined;
    if (!requested) return;
    templateDeepLinkHandledRef.current = true;

    setTemplateFilter('all');
    if (requested.tier === 'pro' && !isPro) {
      setRequestedLockedTemplateId(requested.id);
      showToast(`${requested.name} is a Standard template. It remains visible in the collection until you upgrade.`, 'workspace_premium');
      return;
    }

    const nextPaletteId = getDefaultPaletteId(requested.id);
    setSelectedTemplate(requested);
    setSelectedPaletteId(nextPaletteId);
    setTemplatePaletteSelections(previous => ({ ...previous, [requested.id]: nextPaletteId }));
  }, [isPro, searchParams, tierLoading]);

  useEffect(() => {
    if (step !== 'template' || !requestedLockedTemplateId) return;
    requestAnimationFrame(() => {
      document.getElementById(`resume-template-card-${requestedLockedTemplateId}`)?.focus();
    });
  }, [requestedLockedTemplateId, step]);

  const [lastMatchScore, setLastMatchScore] = useState<number | undefined>(undefined);


  useEffect(() => {
    if (searchParams.get('mobileAction') !== 'check' || mobileCheckFocusHandledRef.current) return;
    mobileCheckFocusHandledRef.current = true;
    setMode('choose');
    setStep('upload');
    setActiveStart('upload');
    requestAnimationFrame(() => {
      // 'resume-import-workspace' lived inside a `{false && ...}` block, so this scroll
      // had been a no-op for every caller: CommandPalette, MobileWorkbench and the
      // suite-tool-registry all route ?mobileAction=check here.
      document.getElementById('resume-source-console')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [searchParams]);

  // ===== DERIVED STATE =====
  // This is the KEY fix - always compute which resume to display
  const getDisplayResume = (): ResumeData | null => {
    if (mode === 'morph') {
      // For morph mode: prefer morphed, fallback to original
      if (hasResumeData(morphedResume)) {
        const source = activeGeneration?.inputs.source || originalResume;
        if (source && documentOrigin === 'tailored' && !documentManualEdits) {
          const ledger = deriveResumeReviewLedger(source as ResumeReviewResume, morphedResume as ResumeReviewResume);
          return normalizeResume(applyResumeReviewDecisions(source as ResumeReviewResume, morphedResume as ResumeReviewResume, ledger.changes, resumeReview.decisions)) as ResumeData;
        }
        return normalizeResume(morphedResume) as ResumeData;
      }
      if (hasResumeData(originalResume)) return normalizeResume(originalResume) as ResumeData;
      return null;
    }
    if (mode === 'create') {
      // For create mode: use build resume
      if (hasResumeData(buildResume)) return normalizeResume(buildResume) as ResumeData;
      return null;
    }
    return null;
  };

  const currentDesign = designConfig ? normalizeResumeDesign({ ...designConfig, pageSize }, selectedTemplate.id, normalizeResume(getDisplayResume())) : undefined;
  const changeDesign = (next: ResumeDesignConfig) => { setDesignConfig(next); setPageSize(next.pageSize); setSaveInlineStatus(null); };
  // Content is also edited outside the design workbench. Positional page breaks
  // must never follow a replacement credential or additional item by accident.
  const designSource = normalizeResume(getDisplayResume());
  const designSourceKey = JSON.stringify(designSource);
  const designStateKey = JSON.stringify(designConfig);
  const designDocumentBoundary = JSON.stringify([user?.uid || null, documentVersionId, editorEpoch]);
  useEffect(() => {
    const previous = designSourceRef.current;
    designSourceRef.current = { boundary:designDocumentBoundary, source:designSource, designKey:designStateKey };
    if (!previous || previous.boundary !== designDocumentBoundary) { setDesignSourceNotice(''); return; }
    if (!designConfig || previous.designKey !== designStateKey || JSON.stringify(previous.source) === designSourceKey) return;
    const result = reconcileResumeEntryBreaks(previous.source, designSource, designConfig);
    if (result.invalidated.length) {
      const next = normalizeResumeDesign(result.design, selectedTemplate.id, designSource);
      designSourceRef.current.designKey = JSON.stringify(next);
      setDesignConfig(next);
      setDesignSourceNotice('Content changed. Page breaks for moved, removed or replaced items were cleared. Inspect the PDF again.');
    }
  }, [designDocumentBoundary, designStateKey, designSourceKey, designConfig, designSource, selectedTemplate.id]);

  // ===== SESSION PERSISTENCE =====
  // Persist in-progress work so navigating away doesn't lose progress
  // Drafts are account-scoped. A shared key let a second signed-in account
  // inherit the previous account's source resume and target context.
  const sessionKey = resumeDraftStorageKey(user?.uid) || 'taco:resume-guest-draft:v2';
  const [hasPreviousAccountDraft, setHasPreviousAccountDraft] = useState(false);

  useEffect(() => {
    const owner = user?.uid || null;
    if (draftOwnerRef.current === undefined) {
      draftOwnerRef.current = owner;
      return;
    }
    if (draftOwnerRef.current === owner) return;
    draftOwnerRef.current = owner;
    sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
    sourceParseRequestRef.current += 1;
    draftRestoreHandledRef.current = false;
    setOriginalResume(null);
    setMorphedResume(null);
    setBuildResume({ ...EMPTY_RESUME });
    setSourceResumeMeta({});
    setShowSourceConfirmation(false);
    setJobDescription('');
    setPostingUrl('');
    setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
  }, [user?.uid]);

  // Restore draft on mount
  useEffect(() => {
    if (tierLoading || !sessionKey || draftRestoreHandledRef.current) return;
    draftRestoreHandledRef.current = true;
    try {
      setHasPreviousAccountDraft(Boolean(user?.uid && sessionStorage.getItem(previousResumeDraftKey(user.uid))));
      const saved = sessionStorage.getItem(sessionKey);
      const currentDraft = saved ? JSON.parse(saved) : null;
      let recovery: ResumeTrackingRecovery | null = null;
      try { recovery = user?.uid ? readResumeTrackingRecovery(localStorage, user.uid) : null; }
      catch { setTrackingError('Saved tracking recovery could not be read. Keep this draft open; retrying the same inputs uses the same save identifier.'); }
      const matchingRecovery = recovery && (!currentDraft || resumeTrackingDraftKey(currentDraft) === recovery.draftKey) ? recovery : null;
      const draft = currentDraft || matchingRecovery?.draft;
      if (!draft) return;
      if (matchingRecovery) {
        trackingSaveKeyRef.current = { key: matchingRecovery.inputKey, idempotencyKey: matchingRecovery.idempotencyKey };
        savedTrackingRef.current = matchingRecovery.version ? { key: matchingRecovery.inputKey, version: matchingRecovery.version as ResumeVersion } : null;
        setSaveCompanyName(matchingRecovery.company); setSaveVersionName(matchingRecovery.versionName);
        setTrackingError(matchingRecovery.version ? 'Resume saved. Retry tracking to reuse this saved version.' : 'Save & Track was interrupted. Retry with the same inputs to resume safely.');
        setShowSaveModal(true);
      }
      // Recover career edits without letting the old destination override a resume visit.
      setWorkspaceDestination(searchParams.get('view') === 'experience' ? 'experience' : 'resumes');
      if (draft.experienceDraft) { setExperienceDraft(normalizeResume(draft.experienceDraft)); setExperienceDirty(Boolean(draft.experienceDirty)); experienceLoadedRef.current = true; }
      if (typeof draft.experienceVersionId === 'string') setExperienceVersionId(draft.experienceVersionId);
      if (draft.workspaceSource) setWorkspaceSource(draft.workspaceSource);
      if (typeof draft.documentVersionId === 'string') setDocumentVersionId(draft.documentVersionId);
      if (typeof draft.documentName === 'string') setDocumentName(draft.documentName);
      if (['user_upload', 'user_authored', 'tailored', 'legacy'].includes(draft.documentOrigin)) setDocumentOrigin(draft.documentOrigin);
      setDocumentManualEdits(draft.documentManualEdits === true);
      if (draft.targetPageCount === 'auto' || draft.targetPageCount === 1 || draft.targetPageCount === 2) setTargetPageCount(draft.targetPageCount);
      setProofData(draft.proofData || null); setGuardrailReport(draft.guardrailReport || null);
      if (draft.intakeResume || (draft.showSourceConfirmation && draft.originalResume)) setIntakeResume(normalizeResume(draft.intakeResume || draft.originalResume) as ResumeData);
      if (typeof draft.rawSourceText === 'string') setRawSourceText(draft.rawSourceText);
      if (typeof draft.intakeError === 'string') setIntakeError(draft.intakeError);
      if (typeof draft.sourcePasteText === 'string') setSourcePasteText(draft.sourcePasteText);
      setShowImport(draft.showImport === true); setIntakeAcknowledged(draft.intakeAcknowledged === true);
      if (draft.pageSize === 'A4' || draft.pageSize === 'LETTER') setPageSize(draft.pageSize);
      setDesignConfig(readResumeDesign(draft.designConfig, normalizeResume(draft.buildResume || draft.morphedResume || draft.originalResume)));
      setPdfExportMode(draft.pdfExportMode === 'application' ? 'application' : 'designed');
      if (Array.isArray(draft.intakeWarnings)) setIntakeWarnings(draft.intakeWarnings.filter((item: unknown) => typeof item === 'string'));
      if (draft.resumeReturn && ['morph', 'create'].includes(draft.resumeReturn.mode)) setResumeReturn(draft.resumeReturn);
      if (draft.originalResume) setOriginalResume(normalizeResume(draft.originalResume) as ResumeData);
      if (draft.morphedResume) setMorphedResume(normalizeResume(draft.morphedResume) as ResumeData);
      if (draft.sourceResumeMeta) setSourceResumeMeta(draft.sourceResumeMeta);
      if (draft.showSourceConfirmation) setShowSourceConfirmation(draft.showSourceConfirmation);
      if (draft.jobDescription) setJobDescription(draft.jobDescription);
      if (draft.postingUrl) setPostingUrl(draft.postingUrl);
      if (draft.morphPercentage) setMorphPercentage(draft.morphPercentage);
      if (typeof draft.matchScore === 'number') setMatchScore(draft.matchScore);
      const requestedQueryTemplateId = resolveSelectableTemplateDeepLinkId(searchParams.get('template'));
      const initialTemplateId = resolveInitialResumeTemplateId(
        requestedQueryTemplateId,
        draft.selectedTemplateId,
      );
      if (draft.selectedTemplateId && !requestedQueryTemplateId && initialTemplateId === draft.selectedTemplateId) {
        const requestedTemplate = resolveReplacementTemplate(draft.selectedTemplateId);
        const tmpl = resolveEntitledReplacementTemplate(draft.selectedTemplateId, isPro);
        if (requestedTemplate.id !== tmpl.id) {
          setRequestedLockedTemplateId(requestedTemplate.id);
        }
        if (tmpl) {
          setSelectedTemplate(tmpl);
          const restoredPaletteId = getTemplatePalette(tmpl, draft.selectedPaletteId).id;
          setSelectedPaletteId(restoredPaletteId);
          setTemplatePaletteSelections(prev => ({
            ...prev,
            ...(draft.templatePaletteSelections || {}),
            [tmpl.id]: restoredPaletteId,
          }));
        }
      }
      if (draft.mode && draft.mode !== 'choose') setMode(draft.mode);
      if (draft.step) setStep(draft.step);
      if (draft.buildResume) setBuildResume(normalizeResume(draft.buildResume) as ResumeData);
      if (draft.resumeReview) setResumeReview(sanitizeResumeReviewState(draft.resumeReview));
      setActiveGeneration(recoverAppliedGeneration(draft));
      setSelectedAppliedVersionId(typeof draft.selectedAppliedVersionId === 'string' && draft.selectedAppliedVersionId === draft.activeGeneration?.id ? draft.selectedAppliedVersionId : null);
      setPreviousGenerations(Array.isArray(draft.previousGenerations) ? draft.previousGenerations.map(restoreResumeGeneration).filter((item: ResumeGeneration | null): item is ResumeGeneration => Boolean(item)) : []);
      if (draft.applicationData) setApplicationData({ companyName: draft.applicationData.companyName || '', jobTitle: draft.applicationData.jobTitle || '', notes: draft.applicationData.notes || '' });
    } catch { /* ignore corrupt storage */ }
  }, [isPro, searchParams, sessionKey, tierLoading]);

  useEffect(() => {
    if (!isSourceConfirmDemo) return;
    setIntakeResume({
      name: 'Alula Gebreegziabher',
      title: 'Lead Project Manager',
      email: 'alula@example.com',
      phone: '(555) 014-2210',
      location: 'New York, NY',
      linkedin: 'linkedin.com/in/alula',
      summary: 'Technical project leader with experience guiding complex wireless testing programs.',
      experience: [{
        company: 'Tec Mahindra Americas',
        role: 'Field Test Engineer',
        duration: '2022 – 2023',
        achievements: ['Led wireless test programs across LTE and 5G networks.'],
      }],
      education: [{ degree: 'B.S. Cybersecurity and Information Assurance', institution: "Saint Peter's University", year: '2022' }],
      skills: [{
        category: 'Wireless tools',
        items: ['Inertial Explorer', 'QXDM', 'Keysight NEMO', 'ShannonDM', 'Link Master Logger', 'Wireshark', 'Linux', '5G / LTE protocols'],
      }],
      certifications: [],
    });
    setSourceResumeMeta({
      fileName: 'alula_gebreegziabher.pdf',
      sourceType: 'direct',
      characterCount: 4320,
      detectedType: 'pdf',
    });
    setMode('choose');
    setStep('upload');
    setShowSourceConfirmation(true);
    setInvalidDocumentError(false);
  }, [isSourceConfirmDemo]);

  useEffect(() => {
    if (!isReviewDemo) {
      if (reviewDemoWasActiveRef.current) {
        setMode('choose');
        setStep('upload');
        setOriginalResume(null);
        setMorphedResume(null);
        setGuardrailReport(null);
        setJobDescription('');
        setMatchScore(null);
        setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
        try { sessionStorage.removeItem('talent-resume-review-demo'); } catch {}
        const clearDemoGuard = window.setTimeout(() => {
          reviewDemoWasActiveRef.current = false;
        }, 0);
        return () => window.clearTimeout(clearDemoGuard);
      }
      return;
    }
    reviewDemoWasActiveRef.current = true;
    const demoSource: ResumeData = {
      name: 'Maya Chen',
      title: 'Senior Product Manager',
      email: 'maya.chen@example.com',
      phone: '(212) 555-0148',
      location: 'New York, NY',
      linkedin: 'linkedin.com/in/mayachen',
      summary: 'Product leader with 7+ years building useful software, aligning cross-functional teams, and improving customer outcomes.',
      experience: [
        {
          company: 'Northstar Labs',
          role: 'Senior Product Manager',
          duration: '2022 – Present',
          achievements: [
            'Improved activation by 18% through onboarding experiments.',
            'Led quarterly roadmap planning across product, design, and engineering.',
            'Interviewed 45 customers to prioritize the enterprise roadmap.',
          ],
        },
        {
          company: 'BrightPath Health',
          role: 'Product Manager',
          duration: '2019 – 2022',
          achievements: [
            'Launched a care navigation product used by 12,000 members.',
            'Reduced support volume by 21% through self-service improvements.',
          ],
        },
      ],
      education: [{ degree: 'B.S. Information Systems', institution: 'Baruch College', year: '2019' }],
      skills: [{ category: 'Product', items: ['Discovery', 'Roadmapping', 'Experimentation', 'Stakeholder alignment'] }],
      certifications: ['Certified Scrum Product Owner'],
    };
    const demoCandidate: ResumeData = {
      ...demoSource,
      experience: [
        {
          ...demoSource.experience[0],
          achievements: [
            demoSource.experience[0].achievements[1],
            demoSource.experience[0].achievements[0],
            demoSource.experience[0].achievements[2],
          ],
        },
        { ...demoSource.experience[1], achievements: [...demoSource.experience[1].achievements] },
      ],
      education: demoSource.education.map(entry => ({ ...entry })),
      skills: [{ ...demoSource.skills[0], items: ['Stakeholder alignment', 'Roadmapping', 'Discovery', 'Experimentation'] }],
      certifications: [...(demoSource.certifications || [])],
    };
    let demoReview = { ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} };
    try {
      demoReview = sanitizeResumeReviewState(JSON.parse(sessionStorage.getItem('talent-resume-review-demo') || '{}'));
    } catch {}
    setActiveGeneration({ schemaVersion: 2, id: 'fixture-review-v2', createdAt: '2026-10-07T00:00:00Z',
      inputs: { source: normalizeResume(demoSource), jobDescription: 'Senior Product Manager at Northstar Labs', role: '', company: '', postingUrl: '', percentage: 62, targetPageCount: 'auto', unlocked100: false },
      effectivePercentage: 62, candidate: normalizeResume(demoCandidate), review: demoReview, score: 86, proof: null,
      guardrailReport: { effectiveMorphPercentage: 62, protectedFields: ['name', 'email', 'phone', 'location', 'company', 'role', 'duration'], blockedChangeCount: 0 },
      presentation: { templateId: TEMPLATES[0].id, paletteId: getDefaultPaletteId(TEMPLATES[0].id), pageSize: 'A4' } });
    setOriginalResume(demoSource);
    setMorphedResume(demoCandidate);
    setDocumentOrigin('tailored'); setDocumentManualEdits(false);
    setJobDescription('Senior Product Manager at Northstar Labs');
    setMatchScore(86);
    setMorphPercentage(62);
    setGuardrailReport({
      effectiveMorphPercentage: 62,
      protectedFields: ['name', 'email', 'phone', 'location', 'company', 'role', 'duration'],
      blockedChangeCount: 0,
    });
    setResumeReview(demoReview);
    setMode('morph');
    setStep('enhance');
  }, [isReviewDemo]);

  useEffect(() => {
    if (!isReviewDemo) return;
    try {
      sessionStorage.setItem('talent-resume-review-demo', JSON.stringify(resumeReview));
      setDraftSaveState('saved');
      setDraftSavedAt(Date.now());
    } catch {
      setDraftSaveState('error');
    }
  }, [isReviewDemo, resumeReview]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromSonaPicks = params.get('source') === 'sona_picks' || params.get('utm_source') === 'sona_picks';
      if (!fromSonaPicks) return;
      const jobTitle = params.get('jobTitle') || '';
      const company = params.get('company') || '';
      const jobUrl = params.get('jobUrl') || '';
      if (!jobTitle && !company && !jobUrl) return;

      const contextText = [
        jobTitle ? `Job title: ${jobTitle}` : '',
        company ? `Company: ${company}` : '',
        jobUrl ? `Posting URL: ${jobUrl}` : '',
        '',
        'Paste the full job description here when you are ready to morph your resume.',
      ].filter(Boolean).join('\n');

      setMode('morph');
      setStep('jd');
      setApplicationData(prev => ({
        ...prev,
        jobTitle: jobTitle || prev.jobTitle,
        companyName: company || prev.companyName,
      }));
      if (company) setSaveCompanyName(company);
      if (jobUrl) setPostingUrl(jobUrl);
      setJobDescription(prev => prev || contextText);
      mergeApplicationKitContext({
        jobTitle,
        targetRole: jobTitle,
        company,
        jobDescription: contextText,
        applicationUrl: jobUrl || undefined,
      });
      analytics.digestClickPrepare('sona_picks');
      showToast('Career Picks by Taco job loaded into Resume Studio', 'radar');
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      // Ignore malformed email link params.
    }
  }, []);

  const createRecoveryDraft = useCallback(() => ({
    workflowSchemaVersion: 2, activeGeneration, previousGenerations, selectedAppliedVersionId, applicationData,
    workspaceDestination, experienceDraft, experienceVersionId, experienceDirty, workspaceSource,
    documentVersionId, documentName, documentOrigin, documentManualEdits, targetPageCount, pageSize, designConfig, pdfExportMode, sourcePasteText, showImport,
    proofData, guardrailReport, rawSourceText, intakeResume, intakeWarnings, intakeAcknowledged, intakeError, resumeReturn,
    originalResume,
    morphedResume,
    jobDescription,
    postingUrl,
    morphPercentage,
    matchScore,
    selectedTemplateId: selectedTemplate.id,
    selectedPaletteId: activePaletteId,
    templatePaletteSelections,
    sourceResumeMeta,
    showSourceConfirmation,
    mode,
    step,
    resumeReview,
    buildResume,
    savedAt: Date.now(),
  }), [activeGeneration, previousGenerations, selectedAppliedVersionId, applicationData, workspaceDestination, experienceDraft, experienceVersionId, experienceDirty, workspaceSource, documentVersionId, documentName, documentOrigin, documentManualEdits, targetPageCount, pageSize, designConfig, pdfExportMode, sourcePasteText, showImport, proofData, guardrailReport, rawSourceText, intakeResume, intakeWarnings, intakeAcknowledged, intakeError, resumeReturn, originalResume, morphedResume, jobDescription, postingUrl, morphPercentage, matchScore, selectedTemplate.id, activePaletteId, templatePaletteSelections, sourceResumeMeta, showSourceConfirmation, mode, step, resumeReview, buildResume]);

  // Auto-save draft when key state changes
  useEffect(() => {
    // Don't save if user hasn't started anything
    if (!sessionKey || isReviewDemo || isSourceConfirmDemo || reviewDemoWasActiveRef.current) return;
    if (mode === 'choose' && !originalResume && !buildResume?.name && !experienceDirty && !rawSourceText && !sourcePasteText) return;
    try {
      const draft = createRecoveryDraft();
      sessionStorage.setItem(sessionKey, JSON.stringify(draft));
      setDraftSaveState('saved');
      setDraftSavedAt(draft.savedAt);
    } catch {
      setDraftSaveState('error');
    }
  }, [createRecoveryDraft, isReviewDemo, isSourceConfirmDemo, sessionKey, mode, originalResume, buildResume, experienceDirty, rawSourceText, sourcePasteText]);

  const retainGuestDraftAfterSignIn = () => {
    const signedInUid = useStore.getState().user?.uid;
    if (user?.uid || !signedInUid || isReviewDemo || isSourceConfirmDemo) return;
    if (!originalResume && !intakeResume && !hasResumeData(buildResume) && !rawSourceText) return;
    try {
      const draft = createRecoveryDraft();
      if (rawSourceText && !originalResume && !intakeResume) draft.intakeError = 'Your extracted text was retained. Retry reading to finish importing after sign-in.';
      handoffGuestResumeDraft(sessionStorage, signedInUid, draft);
      sessionStorage.removeItem('taco:resume-guest-draft:v2');
    }
    catch { showToast('Your draft could not be kept after sign-in on this device.', 'warning'); }
  };
  const reopenPreviousAccountDraft = () => {
    if (!user?.uid) return;
    try { if (restorePreviousResumeDraft(sessionStorage, user.uid)) window.location.reload(); }
    catch { showToast('The previous tab draft could not be restored. Your current resume is retained.', 'warning'); }
  };

  // Clear draft when workflow completes (save/download)
  const clearDraft = () => {
    try { if (sessionKey) sessionStorage.removeItem(sessionKey); } catch {}
    try { if (user?.uid) clearResumeTrackingRecovery(localStorage, user.uid); } catch { setTrackingError('This device could not clear the saved recovery draft. Clear it before starting another recovery.'); }
  };

  const buildResumeVersionMetadata = (extra: Record<string, any> = {}) => {
    // Explicit overrides are used for asynchronous generated results, not stale React state.
    const resume = normalizeResume(extra.candidateSnapshot || getDisplayResume());
    const origin: WorkspaceOrigin = extra.documentOrigin || documentOrigin;
    const appliedSourceMetadata = activeGeneration?.sourceContext?.metadata || sourceResumeMeta;
    const appliedWorkspaceSource = activeGeneration?.sourceContext ? activeGeneration.sourceContext.workspaceSource : workspaceSource;
    const { candidateSnapshot: _candidate, documentOrigin: _origin, ...rest } = extra;
    return {
      sourceFileName: appliedSourceMetadata.fileName || null,
      sourceType: appliedSourceMetadata.sourceType || 'manual',
      parsedCharacterCount: appliedSourceMetadata.characterCount || null,
      detectedType: appliedSourceMetadata.detectedType || null,
      targetRole: activeGeneration?.inputs.role || applicationData.jobTitle || null,
      targetCompany: activeGeneration?.inputs.company || applicationData.companyName || saveCompanyName || null,
      matchScore, template: selectedTemplate.id, paletteId: activePaletteId, designConfig: currentDesign || null, pdfExportMode,
      paletteLabel: selectedPalette.label, paletteColors: selectedPalette.colors,
      workflowSchemaVersion: 2, activeGeneration: currentGenerationSnapshot(),
      optimizationStrength: origin === 'tailored' ? appliedPercentage : 0,
      targetPageCount: activeGeneration?.inputs.targetPageCount ?? targetPageCount, jobDescription: (activeGeneration?.inputs.jobDescription ?? jobDescription) || null, postingUrl: activeGeneration?.inputs.postingUrl ?? postingUrl,
      reviewSourceSnapshot: appliedSource, resumeReview, proofData, guardrailReport,
      documentManualEdits,
      workspace: createWorkspaceMetadata({
        kind: 'resume', origin, content: resume, parentVersionId: documentVersionId,
        sourceVersionId: appliedWorkspaceSource?.sourceVersionId,
        sourceSnapshot: appliedWorkspaceSource, sourceConfirmedAt: appliedWorkspaceSource?.confirmedAt,
        target: { role: activeGeneration?.inputs.role ?? applicationData.jobTitle, company: activeGeneration?.inputs.company ?? (applicationData.companyName || saveCompanyName), jobDescription: activeGeneration?.inputs.jobDescription ?? jobDescription, url: activeGeneration?.inputs.postingUrl ?? postingUrl },
        presentation: { template: selectedTemplate.id, paletteId: activePaletteId, targetPageCount, pageSize, design: currentDesign || null },
      }),
      ...rest,
    };
  };

  // ===== EFFECTS =====
  useEffect(() => { if (user) loadVersions(); }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setMorphConsent({ unlocked100: false, acceptedAt: null, consentVersion: '' });
      return;
    }

    const loadMorphConsent = async () => {
      setMorphConsentLoading(true);
      try {
        const res = await authFetch('/api/resume/morph-consent');
        if (res.ok) {
          const data = await res.json();
          setMorphConsent({
            unlocked100: data.unlocked100 === true,
            acceptedAt: data.acceptedAt || null,
            consentVersion: data.consentVersion || '',
            disabledAt: data.disabledAt || null,
          });
        }
      } catch {
        // Missing consent safely keeps the 80% cap.
      } finally {
        setMorphConsentLoading(false);
      }
    };

    loadMorphConsent();
  }, [user?.uid]);

  const maxMorphPercentage = morphConsent.unlocked100 ? RESUME_MORPH_FULL_UNLOCK : RESUME_MORPH_DEFAULT_MAX;

  useEffect(() => {
    if (morphConsentLoading) return;
    if (morphPercentage > maxMorphPercentage) {
      setMorphPercentage(maxMorphPercentage);
    }
  }, [maxMorphPercentage, morphPercentage, morphConsentLoading]);

  // ===== DATA LOADING =====
  const loadVersions = async () => {
    if (!user) return;
    const ownerId = user.uid;
    const request = ++libraryRequestRef.current;
    setLibraryLoading(true); setLibraryError('');
    const result = await getResumeVersions();
    if (!sourceParseMountedRef.current || useStore.getState().user?.uid !== ownerId || libraryRequestRef.current !== request) return;
    setLibraryLoading(false);
    if (!result.success) { setLibraryError('Your saved resumes could not be loaded. Your current work is still here.'); return; }
    const items = result.data || [];
    setVersions(items);
    if (!experienceLoadedRef.current) {
      experienceLoadedRef.current = true;
      const source = items.find(item => item.metadata?.workspace?.kind === 'experience' && !item.metadata?.archived);
      if (source) { setExperienceDraft(normalizeResume(source.content)); setExperienceVersionId(source.id); setExperienceStatus('Confirmed experience saved to your account'); }
    }
  };

  useEffect(() => {
    if (workspaceDeepLinkRef.current || tierLoading || libraryLoading) return;
    const requestedVersion = searchParams.get('version');
    if (requestedVersion && user && !experienceLoadedRef.current && !libraryError) return;
    workspaceDeepLinkRef.current = true;
    const view = searchParams.get('view');
    if (view === 'experience' || view === 'resumes' || view === 'templates') {
      setWorkspaceDestination(view === 'experience' ? 'experience' : 'resumes');
      setTemplateBrowsing(view === 'templates'); setMode('choose');
    }
    if (requestedVersion) {
      const version = versions.find(item => item.id === requestedVersion && item.metadata?.workspace?.kind !== 'experience');
      if (version) loadVersionToMorph(version);
      else setLibraryError('That resume could not be found in your account. Choose another version or retry.');
    }
  }, [searchParams, tierLoading, libraryLoading, versions, libraryError, user, isReviewDemo, isSourceConfirmDemo]);

  // ===== AI FUNCTIONS =====
  const parseResumeWithAI = async (text: string, signal?: AbortSignal): Promise<{ resume: ResumeData; warnings: string[] }> => {
    const res = await authFetch(isIsolatedWorkspacePreview() ? '/api/workspace-preview/resume-import' : '/api/resume/parse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !(res.status === 422 && data.requiresReview && data.resume)) {
      if (data.requiresAuth) setShowDownloadAuth('signup');
      throw new Error(data.message || data.error || 'Could not structure the resume. Your source text is retained for retry.');
    }
    return { resume: normalizeResume(data.resume) as ResumeData, warnings: Array.isArray(data.warnings) ? data.warnings.map((warning: any) => typeof warning === 'string' ? warning : warning.message).filter(Boolean) : [] };
  };

  const morphResumeToJD = async (resume: ResumeData, jd: string, percentage: number, pageCount: number | 'auto', signal?: AbortSignal, target?: { role: string; company: string }): Promise<{ morphed: ResumeData; score: number; proof?: ProofResult; guardrailReport?: any; effectiveMorphPercentage?: number }> => {
    const res = await authFetch('/api/resume/morph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobDescription: jd, morphPercentage: percentage, targetPageCount: pageCount, targetRole: target?.role, targetCompany: target?.company }), signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Morph failed' }));
      if (err.requiresAuth) { setShowDownloadAuth('signup'); throw new Error('Sign in to continue'); }
      if (err.limitReached) { setShowDownloadAuth('signup'); throw new Error(err.error || 'Free tier limit reached'); }
      if (err.requiresMorphConsent) {
        const error = new Error(err.error || 'Unlock 100% Morph in Settings > AI Safety before using maximum strength.');
        (error as any).requiresMorphConsent = true;
        throw error;
      }
      throw new Error(err.error || 'Failed to morph resume');
    }
    const data = await res.json();
    return {
      morphed: data.morphedResume,
      score: data.matchScore,
      proof: data.proof,
      guardrailReport: data.guardrailReport,
      effectiveMorphPercentage: data.effectiveMorphPercentage,
    };
  };

  const extractCompanyFromJD = async (jd: string): Promise<string> => {
    try {
      const res = await authFetch('/api/resume/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract_company', jobDescription: jd }),
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.company || '';
    } catch { return ''; }
  };

  // ===== HANDLERS =====
  const handleFileExtracted = async (text: string) => {
    sourceAbortRef.current?.abort();
    const controller = new AbortController(); sourceAbortRef.current = controller;
    const requestId = ++sourceParseRequestRef.current;
    const ownerId = user?.uid || null;
    const isCurrent = () => isCurrentSourceParse(requestId, sourceParseRequestRef.current, ownerId, useStore.getState().user?.uid || null, sourceParseMountedRef.current);
    setIsLoading(true); setInvalidDocumentError(false); setIntakeError('');
    setRawSourceText(text); setIntakeWarnings([]); setIntakeAcknowledged(false); setProcessingStage('parsing');
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const parsed = await Promise.race([parseResumeWithAI(text, controller.signal), new Promise<never>((_, reject) => { deadline = setTimeout(() => { reject(new Error('Reading your resume took too long. Retry, or continue with the extracted text.')); controller.abort(); }, 35_000); })]);
      if (!isCurrent()) return;
      setIntakeResume(parsed.resume); setIntakeWarnings(parsed.warnings);
      // Staging is local. Only confirmation publishes this exact corrected source.
      setShowSourceConfirmation(true); setShowImport(true);
      showToast('Check the extracted facts before confirming.', 'fact_check');
    } catch (error: any) {
      if (!isCurrent()) return;
      setIntakeError(error.message || 'Could not structure the resume. Try again or enter the facts yourself.');
    } finally {
      if (deadline) clearTimeout(deadline);
      if (isCurrent()) { setIsLoading(false); setProcessingStage(null); }
    }
  };

  const beginSourceUpload = () => {
    sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
    morphAbortRef.current?.abort(); morphRequestRef.current += 1;
    sourceAbortRef.current?.abort(); sourceParseRequestRef.current += 1;
    setIntakeError(''); setShowSourceConfirmation(false); setIntakeWarnings([]);
    setProcessingStage(null);
  };
  const handleSourceUploadStart = () => { beginSourceUpload(); setRawSourceText(''); setIntakeResume(null); setSourceResumeMeta({}); setProcessingStage('uploading'); };
  const registerSourceUploadOperation = (operation: { id: string; cancel: () => void }) => {
    sourceUploadOperationRef.current = { ...operation, revision: sourceParseRequestRef.current, ownerId: useStore.getState().user?.uid || null };
  };
  const isCurrentSourceUpload = useCallback((id: string) => sourceParseMountedRef.current &&
    sourceUploadOperationRef.current?.id === id && sourceUploadOperationRef.current.revision === sourceParseRequestRef.current &&
    sourceUploadOperationRef.current.ownerId === (useStore.getState().user?.uid || null), []);
  const handleSourceUploadError = (message: string, fileName: string) => { setIntakeError(message); setSourceResumeMeta({ fileName }); };
  const handleSourceUploadLoading = (loading: boolean) => { setIsLoading(loading); if (!loading) { sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null; setProcessingStage(null); } };

  const handlePastedResumeText = (text: string) => {
    const meta = {
      fileName: 'Pasted resume text',
      sourceType: 'paste' as const,
      characterCount: text.trim().length,
      detectedType: 'txt',
    };
    setSourceResumeMeta(meta);
    setMode('morph');
    handleFileExtracted(text);
  };

  const handleSourceConsolePaste = (text: string) => {
    const meta = {
      fileName: 'Pasted resume text',
      sourceType: 'paste' as const,
      characterCount: text.trim().length,
      detectedType: 'txt',
    };
    setSourceResumeMeta(meta);
    handleFileExtracted(text);
  };

  const outboundInputsRef = useRef('');
  outboundInputsRef.current = JSON.stringify([originalResume, morphedResume, documentManualEdits ? buildResume : null, jobDescription, morphPercentage, morphConsent.unlocked100, activeGeneration, selectedTemplate.id, activePaletteId, currentDesign, pdfExportMode, resumeReview, targetPageCount, pageSize, documentName, documentOrigin, workspaceSource, showSourceConfirmation]);
  const captureOutbound = () => {
    const uid = user?.uid || null;
    const source = outboundInputsRef.current;
    return () => sourceParseMountedRef.current && (useStore.getState().user?.uid || null) === uid && outboundInputsRef.current === source;
  };
  const savedTrackingRef = useRef<{ key: string; version: ResumeVersion } | null>(null);
  const [trackingError, setTrackingError] = useState('');
  const trackingBusyRef = useRef(false);
  const trackingSaveKeyRef = useRef<{ key: string; idempotencyKey: string } | null>(null);
  const trackingDraftSnapshot = createRecoveryDraft;

  const blueprintInputsRef = useRef('');
  blueprintInputsRef.current = JSON.stringify([originalResume, jobDescription]);
  const blueprintRequestRef = useRef(0);
  useEffect(() => { setBlueprintContent(null); setShowBlueprintModal(false); setIsBlueprintLoading(false); }, [originalResume, jobDescription]);

  // ── Day-Zero Blueprint ──
  const handleBlueprint = async () => {
    if (!originalResume || !jobDescription.trim()) return;
    if (isolatedPreview) {
      showToast('AI generation is unavailable in this local preview. You can still edit your resume.', 'info');
      return;
    }
    const uid = user?.uid || null;
    const inputs = blueprintInputsRef.current;
    const request = ++blueprintRequestRef.current;
    const isCurrent = () => sourceParseMountedRef.current && (useStore.getState().user?.uid || null) === uid && blueprintInputsRef.current === inputs && blueprintRequestRef.current === request;
    setIsBlueprintLoading(true);
    try {
      showToast('Generating your Day-Zero Blueprint...', 'content_paste');
      const res = await authFetch('/api/resume/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: originalResume, jobDescription }),
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Blueprint generation failed' }));
        // Return like the upgrade branch does. Throwing reached the catch,
        // which fires 'Failed to generate blueprint' as a red toast behind the
        // sign-in modal that had just opened - a failure notice about the
        // thing that is working.
        if (err.requiresAuth) { setShowDownloadAuth('signup'); return; }
        if (err.upgrade) {
          // Same pattern as the four sites below: the toast names the feature,
          // the modal is the way out. A toast alone was the whole block.
          setShowUpgradeModal(true);
          showToast('Day-Zero Blueprint is a Standard feature', 'lock');
          return;
        }
        throw new Error(err.error || 'Failed to generate blueprint');
      }
      const data = await res.json();
      if (!isCurrent()) return;
      setBlueprintContent(data.blueprint);
      setShowBlueprintModal(true);
      // Persist blueprint so it can be re-opened from Applications tracker
      try {
        if (!uid) throw new Error('Sign in to persist a blueprint');
        const storageKey = `tc_blueprints:${uid}`;
        const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
        stored.unshift({
          id: `bp_${Date.now()}`,
          content: data.blueprint, ownerId: uid, sourceResume: originalResume, jobDescription, sourceTool: "resume_studio",
          targetRole: originalResume.title || '',
          createdAt: new Date().toISOString(),
        });
        const trimmed = stored.slice(0, 10);
        localStorage.setItem(storageKey, JSON.stringify(trimmed));
      } catch {}
      showToast('Day-Zero Blueprint ready!', 'check_circle');
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Blueprint error:', error);
      showToast('Failed to generate blueprint', 'cancel');
    } finally {
      if (isCurrent()) setIsBlueprintLoading(false);
    }
  };

  const [tailoringError, setTailoringError] = useState('');
  const morphRequestRef = useRef(0);
  const morphInputsRef = useRef('');
  const requestedGenerationInputs: ResumeGenerationInputs = {
    source: normalizeResume(originalResume), jobDescription, role: applicationData.jobTitle,
    company: applicationData.companyName, postingUrl, percentage: morphPercentage,
    targetPageCount, unlocked100: morphConsent.unlocked100,
  };
  morphInputsRef.current = resumeGenerationKey(requestedGenerationInputs);
  const generationInputsChanged = generationNeedsRegeneration(activeGeneration, requestedGenerationInputs);
  const candidateOutdated = generationInputsChanged && selectedAppliedVersionId !== activeGeneration?.id;
  const appliedSource = activeGeneration?.inputs.source || originalResume;
  const appliedPercentage = activeGeneration?.effectivePercentage ?? guardrailReport?.effectiveMorphPercentage ?? morphPercentage;
  const appliedConsent = activeGeneration?.inputs.unlocked100 ?? morphConsent.unlocked100;
  const currentGenerationSnapshot = (): ResumeGeneration | null => activeGeneration && morphedResume ? {
    ...activeGeneration, candidate: normalizeResume(morphedResume), review: resumeReview,
    score: matchScore, proof: proofData, guardrailReport,
    presentation: { templateId: selectedTemplate.id, paletteId: activePaletteId, pageSize, design: currentDesign || null, pdfExportMode },
  } : null;
  const cancelMorph = () => {
    morphAbortRef.current?.abort(); morphRequestRef.current += 1;
    setIsLoading(false); setTailoringError('Morph cancelled. Your source and previous result are retained.');
  };

  const handleMorph = async () => {
    if (!originalResume || !hasResumeData(originalResume) || showSourceConfirmation || !jobDescription.trim()) return;
    if (isolatedPreview) {
      showToast('AI rewriting is unavailable in this local preview. You can still edit your resume.', 'info');
      return;
    }
    const uid = user?.uid || null;
    morphAbortRef.current?.abort();
    const controller = new AbortController(); morphAbortRef.current = controller;
    const requestInputs = { ...requestedGenerationInputs, source: normalizeResume(originalResume) };
    const sourceContext = { workspaceSource, rawText: rawSourceText, metadata: { ...sourceResumeMeta } };
    const priorResult = currentGenerationSnapshot();
    const request = ++morphRequestRef.current;
    const source = morphInputsRef.current;
    const ownsRequest = () => sourceParseMountedRef.current && (useStore.getState().user?.uid || null) === uid && morphRequestRef.current === request;
    const isCurrent = () => ownsRequest() && morphInputsRef.current === source;
    setTailoringError('');
    setIsLoading(true);
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      showToast(`Optimizing resume at ${morphPercentage}% strength...`, 'psychology');
      const { morphed, score, proof, guardrailReport: nextGuardrailReport, effectiveMorphPercentage } = await morphResumeToJD(requestInputs.source as ResumeData, requestInputs.jobDescription, requestInputs.percentage, requestInputs.targetPageCount, controller.signal, { role: requestInputs.role, company: requestInputs.company });

      if (!isCurrent()) return;
      // CRITICAL: Always ensure we have valid data before proceeding
      if (!hasResumeData(morphed)) throw new Error('AI returned no usable resume. Your previous result is retained.');
      const validResume = morphed;

      const preparedMorph = prepareResumeForExport({
        mode: 'morph',
        candidateResume: validResume,
        originalResume,
        requestedMorphPercentage: effectiveMorphPercentage || morphPercentage,
        hasFullConsent: morphConsent.unlocked100,
      });
      if (!preparedMorph.resume) throw new Error('The source resume could not be verified');
      const normalizedMorphed = preparedMorph.resume as ResumeData;
      setSelectedAppliedVersionId(null);
      setPreviousGenerations(history => retainPreviousGeneration(history, priorResult));
      setActiveGeneration({ schemaVersion: 2, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
        inputs: requestInputs, effectivePercentage: effectiveMorphPercentage ?? morphPercentage,
        candidate: normalizeResume(normalizedMorphed), sourceContext, review: { ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} },
        score: score ?? null, proof: proof || null, guardrailReport: nextGuardrailReport || null,
        presentation: { templateId: selectedTemplate.id, paletteId: activePaletteId, pageSize, design: currentDesign || null, pdfExportMode } });
      setMorphedResume(normalizedMorphed);
      setDocumentOrigin('tailored'); setDocumentManualEdits(false);
      setMatchScore(score);
      setProofData(proof || null);
      setGuardrailReport(nextGuardrailReport || null);
      // Clear stale enhance results from previous resume version
      setResumeCheckResult(null);
      setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
      setDraftSaveState('idle');
      if (workflowSectionRef.current === 'shape') setStep('enhance');
      showToast(`Resume optimized: ${score}% match · ${effectiveMorphPercentage || morphPercentage}% strength`, 'check_circle');
      analytics.toolUse('resume_morph');

      // ── Skill Gap Detection ──
      try {
        const originalSkills = (originalResume.skills || []).flatMap(s => s.items || []).map(s => s.toLowerCase().trim()).filter(Boolean);
        const morphedSkills = (validResume.skills || []).flatMap(s => s.items || []).map(s => s.toLowerCase().trim()).filter(Boolean);
        const originalSet = new Set(originalSkills);
        const newSkills = [...new Set(morphedSkills.filter(s => !originalSet.has(s)))];

        if (newSkills.length > 0) {
          // Classify skills (simple heuristic)
          const softSkills = new Set(['leadership', 'communication', 'teamwork', 'problem-solving', 'time management', 'adaptability', 'collaboration', 'critical thinking', 'mentoring', 'negotiation', 'presentation', 'conflict resolution', 'decision making', 'emotional intelligence']);
          const classified = newSkills.map(skill => ({
            skill: morphedSkills.find(ms => ms === skill) ? (validResume.skills || []).flatMap(s => s.items || []).find(item => item.toLowerCase().trim() === skill) || skill : skill,
            category: (softSkills.has(skill) ? 'soft' : 'technical') as 'technical' | 'soft' | 'domain',
          }));

          setDetectedNewSkills(classified);
          setLastMatchScore(score);

          // Save to localStorage for Skill Bridge
          localStorage.setItem(`tc_skill_gaps:${user?.uid || 'guest'}`, JSON.stringify({
            gaps: classified.map(c => ({ skill: c.skill, confidence: 'ai-added', category: c.category })),
            jdTitle: applicationData.jobTitle || 'Target Role',
            companyName: applicationData.companyName || '',
            timestamp: Date.now(),
          }));

          // Show warning modal after a brief delay
          setTimeout(() => { if (isCurrent()) setShowSkillGapModal(true); }, 800);
        }
      } catch (diffErr) {
        console.warn('Skill diff error (non-critical):', diffErr);
      }

    } catch (error) {
      if (!isCurrent()) return;
      setTailoringError(controller.signal.aborted ? 'AI took too long. Your previous result is retained; retry when ready.' : error instanceof Error ? error.message : 'Tailoring failed. Your resume is retained; try again.');
      if ((error as any)?.requiresMorphConsent) {
        showToast('Unlock 100% Morph in Settings > AI Safety first.', 'lock');
        router.push('/suite/settings?tab=ai-safety');
      } else {
        showToast('Tailoring could not finish. Your resume and job description are retained.', 'cancel');
      }
    } finally {
      clearTimeout(timeout);
      if (ownsRequest()) setIsLoading(false);
    }
  };

  const getPreparedOutboundResume = (actionLabel: string, candidateOverride?: ResumeData) => {
    let candidateResume = candidateOverride || getDisplayResume();
    if (documentOrigin === 'tailored' && candidateOutdated) {
      showToast('This rewrite uses previous inputs. Regenerate, restore its original inputs, or use your confirmed source.', 'fact_check');
      navigateSection('shape'); return null;
    }
    if (!candidateResume) return null;
    if (showSourceConfirmation) { showToast('Confirm the new source before saving or exporting.', 'fact_check'); navigateSection('source'); return null; }
    if (documentOrigin === 'tailored' && !documentManualEdits && appliedSource) {
      const ledger = deriveResumeReviewLedger(appliedSource as ResumeReviewResume, (candidateOverride || morphedResume || candidateResume) as ResumeReviewResume);
      if (ledger.changes.some(change => !resumeReview.decisions[change.id] || (change.kind === 'needs-review' && resumeReview.decisions[change.id] !== 'reverted'))) {
        showToast('Review the proposed changes before saving, exporting or handing off this version.', 'fact_check');
        setMode('morph'); setStep('enhance'); return null;
      }
      candidateResume = applyResumeReviewDecisions(appliedSource as ResumeReviewResume, (candidateOverride || morphedResume || candidateResume) as ResumeReviewResume, ledger.changes, resumeReview.decisions) as ResumeData;
    }

    const prepared = prepareResumeForExport({
      mode: documentManualEdits || documentOrigin !== 'tailored' ? 'create' : 'morph',
      candidateResume,
      originalResume: appliedSource,
      requestedMorphPercentage: appliedPercentage,
      hasFullConsent: appliedConsent,
    });
    if (prepared.blockedReason === 'missing_source' || !prepared.resume) {
      showToast(`Taco cannot verify the source resume before ${actionLabel}. Re-upload it or choose a verified version.`, 'shield');
      setStep('upload');
      setActiveStart('upload');
      return null;
    }
    return prepared;
  };


  const openWritingTool = (path: string) => {
    const prepared = getPreparedOutboundResume('writing handoff');
    if (!prepared?.resume) return;
    const source = mergeApplicationKitContext({ resumeVersionId: null, resumeVersionName: 'Reviewed Resume Studio draft', resumeSource: 'resume_studio',
      resumeSnapshot: prepared.resume, resumeText: resumeSnapshotToText(prepared.resume), jobDescription,
      company: applicationData.companyName || '', jobTitle: applicationData.jobTitle || prepared.resume.title || '', targetRole: prepared.resume.title || '' });
    router.push(handoffApplicationKitContext(path, source));
  };

  const saveVersionOnly = async () => {
    if (documentSaveBusy.current) return;
    const isCurrent = captureOutbound();
    setSaveInlineStatus(null);
    if (!user) {
      setSaveInlineStatus({ type: 'error', message: 'Sign in to save this resume to your library.' });
      setShowDownloadAuth('signup');
      return;
    }
    const prepared = getPreparedOutboundResume('saving');
    if (!prepared?.resume) {
      setSaveInlineStatus({ type: 'error', message: 'No resume data is available to save yet.' });
      showToast('No resume data to save', 'cancel');
      return;
    }
    const resume = prepared.resume as ResumeData;
    const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const versionName = documentName.trim() || `${resume.title || resume.name || 'Resume'} — ${stamp}`;
    documentSaveBusy.current = true; setIsSaving(true);
    try {
      const idempotencyKey = await resumeTrackingIdempotencyKey(user.uid, stableResumeTrackingKey(['resume-save', documentVersionId, versionName, resume, buildResumeVersionMetadata()]));
      if (!isCurrent()) return;
      const result = await saveResumeVersion(
        versionName,
        resume as any,
        { matchScore, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage },
        'technical',
        buildResumeVersionMetadata({ savedFrom: documentOrigin === 'tailored' ? 'resume_studio_tailored' : 'resume_studio_document' }),
        { idempotencyKey }
      );
      if (!isCurrent()) return;
      if (!result.success) throw new Error(result.error || 'Save failed');
      if (result.data) setDocumentVersionId(result.data.id);
      loadVersions();
      setSaveInlineStatus({ type: 'success', message: 'This document revision is saved to your account. Your experience record is unchanged.' });
      showToast('Resume version saved', 'check_circle');
    } catch (error: any) {
      if (!isCurrent()) return;
      setSaveInlineStatus({ type: 'error', message: error.message || 'Save failed. Please try again.' });
      showToast(error.message || 'Save failed', 'cancel');
    } finally {
      documentSaveBusy.current = false;
      if (sourceParseMountedRef.current) setIsSaving(false);
    }
  };

  const confirmSave = async () => {
    if (isSaving || trackingBusyRef.current) return;
    const isCurrent = captureOutbound();
    setTrackingError('');
    if (!saveCompanyName.trim()) {
      showToast('Enter a company name to track this application', 'cancel');
      return;
    }
    // Use a local variable for version name since setState is async
    const prepared = getPreparedOutboundResume('Save & Track');
    if (!prepared?.resume) {
      showToast('No verified resume data is available to save', 'cancel');
      return;
    }
    const resume = prepared.resume as ResumeData;
    const versionName = saveVersionName.trim() || resume.title || 'My Resume';
    if (!saveVersionName.trim()) {
      setSaveVersionName(versionName);
    }
    trackingBusyRef.current = true;
    setIsSaving(true);
    try {
      // 1. Save the resume version

      const ownerId = user?.uid;
      if (!ownerId) throw new Error('Sign in before saving and tracking.');
      const draft = trackingDraftSnapshot();
      const trackingKey = stableResumeTrackingKey([resume, versionName, saveCompanyName, jobDescription, postingUrl, selectedTemplate.id, activePaletteId, resumeReview, pageSize, targetPageCount, documentVersionId, workspaceSource, buildResumeVersionMetadata()]);
      const storedRecovery = readResumeTrackingRecovery(localStorage, ownerId);
      if (storedRecovery?.inputKey === trackingKey && storedRecovery.draftKey === resumeTrackingDraftKey(draft)) {
        trackingSaveKeyRef.current = { key: trackingKey, idempotencyKey: storedRecovery.idempotencyKey };
        savedTrackingRef.current = storedRecovery.version ? { key: trackingKey, version: storedRecovery.version as ResumeVersion } : null;
      }
      if (trackingSaveKeyRef.current?.key !== trackingKey) {
        const idempotencyKey = await resumeTrackingIdempotencyKey(ownerId, trackingKey);
        if (!isCurrent()) return;
        trackingSaveKeyRef.current = { key: trackingKey, idempotencyKey };
      }
      const retained = savedTrackingRef.current?.key === trackingKey ? savedTrackingRef.current.version : null;
      const receipt: ResumeTrackingRecovery = { schemaVersion: 1, ownerId, inputKey: trackingKey, draftKey: resumeTrackingDraftKey(draft),
        idempotencyKey: trackingSaveKeyRef.current.idempotencyKey, company: saveCompanyName, versionName, draft, version: retained };
      try { writeResumeTrackingRecovery(localStorage, receipt); }
      catch { throw new Error('Recovery could not be saved on this device. No new save or tracking request was started. Enable browser storage and retry.'); }
      const result = retained ? { success: true, data: retained, error: undefined } : await saveResumeVersion(
        `${versionName} — ${saveCompanyName}`,
        resume as any,
        { matchScore, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage },
        'technical',
        buildResumeVersionMetadata({
          savedFrom: 'resume_studio_track_modal',
          targetCompany: saveCompanyName,
          targetRole: resume.title || versionName,
        }),
        { idempotencyKey: trackingSaveKeyRef.current.idempotencyKey }
      );
      if (!isCurrent()) return;
      if (!result.success) {
        console.error('[Save & Track] Save failed:', result.error);
        showToast(result.error || 'Save failed — check your connection', 'cancel');
        if (sourceParseMountedRef.current) setIsSaving(false);
        return;
      }
      if (!result.data) throw new Error('Saved version identifier was not returned.');
      savedTrackingRef.current = { key: trackingKey, version: result.data };
      try { writeResumeTrackingRecovery(localStorage, { ...receipt, version: result.data }); }
      catch {
        setTrackingError('Resume saved, but its recovery receipt could not be updated on this device. Keep this page open and retry tracking; the original save identifier is retained.');
        return;
      }


      // 2. Auto-create an application entry
      const appResult = await createJobApplication({
        companyName: saveCompanyName,
        jobTitle: resume.title || versionName,
        jobDescription: jobDescription || undefined,
        resumeVersionId: result.data?.id,
        morphedResumeName: versionName,
        talentDensityScore: matchScore ?? undefined,
        applicationLink: postingUrl || undefined,
      });

      if (!isCurrent()) return;
      if (!appResult.success) {
        console.warn('[Save & Track] Application creation failed:', appResult.error);
        // Resume was saved, just the application entry failed — still proceed
        setTrackingError('Resume saved to your account. Application tracking failed; retry tracking to reuse the saved version.');
        loadVersions();
        return;
      } else {
        if (result.data?.id && appResult.data?.id) {
          updateResumeVersion(result.data.id, {
            metadata: {
              ...(result.data.metadata || {}),
              ...buildResumeVersionMetadata({
                savedFrom: 'resume_studio_track_modal',
                linkedApplicationId: appResult.data.id,
                targetCompany: saveCompanyName,
                targetRole: resume.title || versionName,
              }),
            },
          }).catch(err => console.warn('[Save & Track] Failed to link application metadata:', err));
        }

        showToast(`Saved & tracked for ${saveCompanyName}!`, 'check_circle');
      }

      // 3. Remove recovery only after both durable operations succeeded.
      try { clearResumeTrackingRecovery(localStorage, ownerId); } catch { setTrackingError('Saved and tracked, but this device could not clear the recovery notice. Retrying will reuse the same records.'); }
      try { if (user?.uid) clearResumeTrackingRecovery(localStorage, user.uid); } catch {}
      setSaveSuccess(true);
      loadVersions();

      // Auto-close after brief visual confirmation
      setTimeout(() => {
        if (!isCurrent()) return;
        setShowSaveModal(false);
        setSaveVersionName('');
        setSaveCompanyName('');
        setSaveSuccess(false);
      }, 1500);
    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('[Save & Track] Unexpected error:', error);
      setTrackingError(error.message || 'Save & Track could not finish. Your draft is preserved.');
      showToast(`Save failed: ${error.message || 'Please retry'}`, 'cancel');
    } finally {
      trackingBusyRef.current = false;
      if (sourceParseMountedRef.current) setIsSaving(false);
    }
  };

  const handleCreateApplication = () => {
    setSaveCompanyName(applicationData.companyName); setSaveVersionName(documentName);
    setShowApplicationModal(false); setShowSaveModal(true);
  };

  const handleDeleteVersion = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const result = await deleteResumeVersion(deleteConfirmId);
    if (result.success) {
      showToast('Version deleted', 'check_circle');
      loadVersions();
    }
    setDeleteConfirmId(null);
  };

  const loadVersionToMorph = (version: ResumeVersion, goal: 'edit' | 'tailor' = 'edit') => {
    if (tierLoading) { showToast('Your plan access is still loading. Try again in a moment.', 'hourglass_top'); return; }
    sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
    sourceAbortRef.current?.abort(); sourceParseRequestRef.current += 1; morphRequestRef.current += 1;
    morphAbortRef.current?.abort();
    const loaded = readWorkspaceVersion(version);
    const savedGeneration = recoverAppliedGeneration({ ...version.metadata, documentOrigin: loaded.origin, candidateSnapshot: version.metadata?.activeGeneration?.candidate || loaded.candidate, documentVersionId: version.id });
    setActiveGeneration(savedGeneration); setSelectedAppliedVersionId(savedGeneration?.id || null); setPreviousGenerations([]);
    if (savedGeneration) setMorphPercentage(savedGeneration.inputs.percentage);
    else setMorphPercentage(Math.min(version.metadata?.optimizationStrength || 75, maxMorphPercentage));
    const content = normalizeResume(loaded.candidate) as ResumeData;
    setBuildResume(content); setMorphedResume(null);
    setOriginalResume(version.metadata?.reviewSourceSnapshot ? normalizeResume(version.metadata.reviewSourceSnapshot) as ResumeData : loaded.sourceSnapshot?.content ? normalizeResume(loaded.sourceSnapshot.content) as ResumeData : loaded.origin !== 'tailored' ? content : null);
    setWorkspaceSource(savedGeneration?.sourceContext ? savedGeneration.sourceContext.workspaceSource : loaded.sourceSnapshot); setDocumentVersionId(version.id); setDocumentName(loaded.name);
    setDocumentOrigin(loaded.origin); setDocumentManualEdits(version.metadata?.documentManualEdits === true);
    setJobDescription(loaded.target.jobDescription || ''); setPostingUrl(loaded.target.url || loaded.target.postingUrl || '');
    setApplicationData({ companyName: loaded.target.company || loaded.target.targetCompany || '', jobTitle: loaded.target.role || loaded.target.targetRole || '', notes: '' });
    setSaveCompanyName(loaded.target.company || loaded.target.targetCompany || ''); setSaveVersionName(loaded.name);
    setPageSize(loaded.presentation.pageSize === 'LETTER' ? 'LETTER' : 'A4');
    setDesignConfig(getPersistedResumeDesign(version, normalizeResume(content)));
    setPdfExportMode(version.metadata?.pdfExportMode === 'application' ? 'application' : 'designed');
    setTargetPageCount(loaded.presentation.targetPageCount === 1 || loaded.presentation.targetPageCount === 2 ? loaded.presentation.targetPageCount : 'auto');
    setResumeReview(sanitizeResumeReviewState(version.metadata?.resumeReview));
    setMatchScore(typeof version.metadata?.matchScore === 'number' ? version.metadata.matchScore : null);
    setProofData(version.metadata?.proofData || null); setGuardrailReport(version.metadata?.guardrailReport || null);
    setResumeCheckResult(null); setBlueprintContent(null); setShowBlueprintModal(false); setIsBlueprintLoading(false);
    setIsLoading(false); setProcessingStage(null); setShowSourceConfirmation(false); setIntakeError('');
    setShowApplicationModal(false); setShowSaveModal(false); setSaveInlineStatus(null); setTrackingError('');
    setRawSourceText(savedGeneration?.sourceContext?.rawText ?? (typeof loaded.sourceSnapshot?.rawText === 'string' ? loaded.sourceSnapshot.rawText : '')); setIntakeWarnings([]); setEditorEpoch(epoch => epoch + 1);
    const versionTemplateId = resolveSelectableTemplateDeepLinkId(searchParams.get('template')) || getPersistedResumeTemplateId(version);
    const requestedTemplate = resolveReplacementTemplate(versionTemplateId);
    const versionTemplate = resolveEntitledReplacementTemplate(versionTemplateId, isPro);
    if (requestedTemplate.id !== versionTemplate.id) {
      setRequestedLockedTemplateId(requestedTemplate.id);
      setTemplateFilter('all');
      showToast(
        `${requestedTemplate.name} is a Standard template. Your resume was loaded with a free template until you upgrade.`,
        'workspace_premium',
      );
    }
    if (versionTemplate) {
      const restoredPaletteId = canUseTemplatePalettes
        ? getTemplatePalette(versionTemplate, getPersistedResumePaletteId(version)).id
        : getDefaultPaletteId(versionTemplate.id);
      setSelectedTemplate(versionTemplate);
      setSelectedPaletteId(restoredPaletteId);
      setTemplatePaletteSelections(prev => ({ ...prev, [versionTemplate.id]: restoredPaletteId }));
    }
    setSourceResumeMeta(savedGeneration?.sourceContext?.metadata || { fileName: version.version_name, sourceType: 'library', detectedType: 'library' });
    const source = version.metadata?.reviewSourceSnapshot || loaded.sourceSnapshot?.content;
    const review = sanitizeResumeReviewState(version.metadata?.resumeReview);
    const needsReview = loaded.origin === 'tailored' && version.metadata?.documentManualEdits !== true && Boolean(source) &&
      deriveResumeReviewLedger(source as ResumeReviewResume, content as ResumeReviewResume).changes.some(change => !review.decisions[change.id] || (change.kind === 'needs-review' && review.decisions[change.id] !== 'reverted'));
    setWorkspaceDestination('resumes'); setMode(needsReview || searchParams.get('template') ? 'morph' : 'create');
    setStep(needsReview ? 'enhance' : searchParams.get('template') ? 'template' : 'content');
    if (savedGeneration) { setMorphedResume(savedGeneration.candidate as ResumeData); setMode('morph'); setStep(needsReview ? 'enhance' : 'preview'); }
    else if (needsReview || searchParams.get('template')) setMorphedResume(content);
    setResumeReturn(needsReview ? { mode: 'morph', step: 'enhance' } : { mode: 'create', step: 'content' });
    if (goal === 'tailor' && !needsReview) beginJobTailoring(content, loaded.name);
    else showToast(needsReview && goal === 'tailor' ? 'Review this resume’s proposed changes before tailoring another copy.' : 'Saved resume opened for editing.', 'check_circle');
  };

  const updateEducationInstitution = (educationIndex: number, institution: string) => {
    const applyUpdate = (resume: ResumeData | null): ResumeData | null => {
      if (!resume) return resume;
      const normalized = normalizeResume(resume) as ResumeData;
      const education = [...(normalized.education || [])];
      if (!education[educationIndex]) return normalized;
      education[educationIndex] = {
        ...education[educationIndex],
        institution,
      };
      return { ...normalized, education };
    };

    if (mode === 'create') {
      setBuildResume(prev => applyUpdate(prev) || prev);
      if (step === 'upload') { invalidateTailoredResult(); setOriginalResume(prev => applyUpdate(prev)); }
      return;
    }
    if (activeGeneration) { invalidateTailoredResult(); setOriginalResume(prev => applyUpdate(prev)); setBuildResume(prev => applyUpdate(prev) || prev); return; }

    // A school entered here is an explicit user-confirmed source correction.
    // Keep the source and candidate aligned so truth-lock validation preserves it.
    setOriginalResume(prev => applyUpdate(prev));
    if (hasResumeData(morphedResume)) {
      setMorphedResume(prev => applyUpdate(prev));
    }
  };

  // ===== AUTH GATE FOR DOWNLOADS =====
  const [showDownloadAuth, setShowDownloadAuth] = useState<'login' | 'signup' | null>(null);

  const requireSelectedTemplateEntitlementBefore = (actionLabel: string) => {
    if (tierLoading) {
      showToast('Your plan access is still loading. Try again in a moment.', 'hourglass_top');
      return false;
    }
    if (isResumeTemplateSelectionEntitled(selectedTemplate.id, isPro)) return true;

    setRequestedLockedTemplateId(selectedTemplate.id);
    setTemplateFilter('all');
    setStep('template');
    showToast(
      `${selectedTemplate.name} requires Standard before ${actionLabel}. Choose a free template or upgrade.`,
      'workspace_premium',
    );
    return false;
  };

  // ===== DOWNLOAD FUNCTIONS =====
  const downloadPDF = async () => {
    if (exportBusyRef.current) return;
    const isCurrent = captureOutbound();
    // Gate: require sign-in before download
    if (!user) {
      setShowDownloadAuth('signup');
      return;
    }
    if (!requireSelectedTemplateEntitlementBefore('PDF export')) return;
    const prepared = getPreparedOutboundResume('PDF export');
    if (!prepared?.resume) {
      showToast('No resume data available', 'cancel');
      return;
    }
    exportBusyRef.current = true; setIsExporting(true);
    try {
      const signature = resumeDesignSignature(prepared.resume, selectedTemplate.id, selectedTemplateColors, pageSize, currentDesign, currentDesign ? pdfExportMode : 'designed');
      const artifact = pdfArtifactRef.current;
      if (artifact?.signature === signature && isCurrent()) saveAs(artifact.blob, `${prepared.resume.name?.replace(/\s+/g, '_') || 'resume'}.pdf`);
      else if (isResumeFlagshipDesign(currentDesign)) { showToast('Build and inspect the current PDF preview before downloading this layout.', 'info'); return; }
      else await downloadResumePDF(prepared.resume, selectedTemplateColors, undefined, selectedTemplate.id, isCurrent, pageSize, currentDesign, currentDesign ? pdfExportMode : 'designed');
      if (!isCurrent()) return;
      if (prepared.guardrailReport?.blockedChangeCount) {
        showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
      }
      showToast('PDF downloaded!', 'check_circle');
      analytics.resumeDownload('pdf');

    } catch (error: any) {
      if (!isCurrent()) return;
      console.error('PDF download error:', error);
      showToast(`PDF download failed: ${error.message || 'Unknown error'}`, 'cancel');
    }
    finally { exportBusyRef.current = false; if (sourceParseMountedRef.current) setIsExporting(false); }
  };

  const downloadWord = async () => {
    if (exportBusyRef.current) return;
    const isCurrent = captureOutbound();
    // Gate: require sign-in before download
    if (!user) {
      setShowDownloadAuth('signup');
      return;
    }
    if (!requireSelectedTemplateEntitlementBefore('Word export')) return;
    const prepared = getPreparedOutboundResume('Word export');
    if (!prepared?.resume) return;
    const resume = prepared.resume as ResumeData;
    exportBusyRef.current = true; setIsExporting(true);
    try {
    if (currentDesign) {
      const { buildResumeDesignDocxBlob } = await import('@/lib/resume-design/docx');
      const blob = await buildResumeDesignDocxBlob(normalizeResume(resume), currentDesign);
      if (!isCurrent()) return;
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
      showToast('Editable Word companion downloaded. Layout and font substitutes may differ.', 'check_circle');
      analytics.resumeDownload('word');
      return;
    }
    if (NEW_SIGNATURE_TEMPLATE_IDS.includes(selectedTemplate.id as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number])) {
      const { buildCuratedSignatureDocxBlob } = await import('@/lib/resume-signature-docx');
      const blob = await buildCuratedSignatureDocxBlob(normalizeResume(resume), selectedTemplate.id, {
        ...selectedTemplateColors,
        background: '#ffffff',
      }, pageSize);
      if (!isCurrent()) return;
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
      if (prepared.guardrailReport?.blockedChangeCount) {
        showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
      }
      showToast('Linear Word companion downloaded!', 'check_circle');
      analytics.resumeDownload('word');
      return;
    }
    // Dynamic import to avoid naming conflicts with @react-pdf/renderer
    const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } = await import('docx');
    const tc = selectedTemplateColors;
    const p = tc.primary.replace('#', '');
    const a = tc.accent.replace('#', '');
    const t = tc.text.replace('#', '');
    const contact = [resume.email, resume.phone, resume.location, resume.linkedin, resume.website].filter(Boolean);
    const noBorders = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } } as any;

    // ── Shared helpers ──
    const sectionHead = (label: string, opts?: { font?: string; borderColor?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }) => new Paragraph({
      spacing: { before: 200, after: 80 },
      alignment: opts?.align,
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: opts?.borderColor || 'E0E0E0' } },
      children: [new TextRun({ text: label, bold: true, size: 24, color: p, font: opts?.font || 'Calibri', allCaps: true })],
    });

    const expBlock = (exp: any, opts?: { font?: string; bullet?: string; companyFirst?: boolean }) => {
      const f = opts?.font || 'Calibri';
      const bul = opts?.bullet || '•';
      const rows: any[] = [];
      if (opts?.companyFirst) {
        rows.push(new Paragraph({
          spacing: { before: 100, after: 20 },
          tabStops: [{ type: 'right' as any, position: 9000 }],
          children: [
            new TextRun({ text: exp.company, bold: true, size: 22, color: t, font: f }),
            new TextRun({ text: ', ', size: 20, color: '555555', font: f }),
            new TextRun({ text: exp.role, italics: true, size: 20, color: '555555', font: f }),
            new TextRun({ text: `\t${exp.duration}`, size: 18, color: '666666', font: f }),
          ],
        }));
      } else {
        rows.push(new Paragraph({
          spacing: { before: 100, after: 20 },
          tabStops: [{ type: 'right' as any, position: 9000 }],
          children: [
            new TextRun({ text: exp.role, bold: true, size: 22, color: t, font: f }),
            new TextRun({ text: `\t${exp.duration}`, italics: true, size: 18, color: '666666', font: f }),
          ],
        }));
        rows.push(new Paragraph({
          spacing: { after: 50 },
          children: [new TextRun({ text: exp.company, size: 20, color: a, font: f })],
        }));
      }
      exp.achievements?.forEach((ach: string) => {
        rows.push(new Paragraph({
          spacing: { after: 25 },
          indent: { left: 360 },
          children: [new TextRun({ text: `${bul}  ${ach}`, size: 19, color: '333333', font: f })],
        }));
      });
      rows.push(new Paragraph({ spacing: { after: 60 }, text: '' }));
      return rows;
    };

    const eduBlock = (edu: any, opts?: { font?: string }) => {
      const f = opts?.font || 'Calibri';
      const degree = cleanResumeText(edu.degree);
      const institution = cleanResumeText(edu.institution);
      const year = cleanResumeText(edu.year);
      const children = [
        ...(degree ? [new TextRun({ text: degree, bold: true, size: 21, color: t, font: f })] : []),
        ...(institution ? [new TextRun({ text: `${degree ? '  —  ' : ''}${institution}`, size: 20, color: '555555', font: f })] : []),
        ...(year ? [new TextRun({ text: `  (${year})`, size: 18, color: '777777', font: f })] : []),
      ];
      return new Paragraph({
        spacing: { after: 50 },
        children: children.length ? children : [new TextRun({ text: '', size: 20, font: f })],
      });
    };

    const skillBlock = (cat: any, opts?: { font?: string }) => new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: `${cat.category}: `, bold: true, size: 20, color: p, font: opts?.font || 'Calibri' }),
        new TextRun({ text: cat.items.join(', '), size: 20, color: '444444', font: opts?.font || 'Calibri' }),
      ],
    });

    const certBlocks = () => resume.certifications?.length ? [
      sectionHead('CERTIFICATIONS'),
      ...resume.certifications.map(c => new Paragraph({ spacing: { after: 25 }, indent: { left: 360 }, children: [new TextRun({ text: `•  ${c}`, size: 19, color: '333333' })] })),
    ] : [];

    const getDocxHeaderScale = (templateId: string) => {
      const preset = getHeaderPreset(templateId);
      const name = cleanResumeText(resume.name) || 'Resume';
      const title = cleanResumeText(resume.title);
      const longestNameToken = name.split(/\s+/).reduce((max, token) => Math.max(max, token.length), 0);
      const pressure = name.length + title.length * 0.35 + Math.max(0, longestNameToken - 12) * 1.4;
      if (preset.density === 'hero') {
        if (pressure > 42) return { name: 40, title: 21 };
        if (pressure > 32) return { name: 44, title: 22 };
        return { name: 50, title: 24 };
      }
      if (preset.density === 'compact') {
        if (pressure > 38) return { name: 32, title: 18 };
        return { name: 36, title: 19 };
      }
      if (pressure > 40) return { name: 36, title: 19 };
      if (pressure > 30) return { name: 40, title: 20 };
      return { name: 44, title: 22 };
    };

    const safeDocxHeader = (templateId: string, opts?: { font?: string; nameColor?: string; titleColor?: string; contactColor?: string }) => {
      const preset = getHeaderPreset(templateId);
      const scale = getDocxHeaderScale(templateId);
      const font = opts?.font || (['harvard', 'academic', 'elegant'].includes(templateId) ? 'Georgia' : templateId === 'technical' ? 'Courier New' : 'Calibri');
      const centered = ['minimal', 'harvard', 'academic', 'elegant', 'nordic', 'ats-optimized', 'federal'].includes(templateId);
      const uppercase = templateId === 'elegant';
      const name = cleanResumeText(resume.name) || 'Resume';
      const title = cleanResumeText(resume.title);
      const contactText = contact.join(`  ${preset.contactSeparator || '•'}  `);
      const alignment = centered ? AlignmentType.CENTER : undefined;
      const nameText = uppercase ? name.toUpperCase() : name;
      const titleText = uppercase ? title.toUpperCase() : title;
      const headerRows: any[] = [];

      if (preset.eyebrow) {
        headerRows.push(new Paragraph({
          alignment,
          spacing: { after: 28 },
          children: [new TextRun({ text: preset.eyebrow.toUpperCase(), size: 15, color: opts?.contactColor || '777777', font, allCaps: true })],
        }));
      }

      headerRows.push(new Paragraph({
        alignment,
        spacing: { after: title ? 44 : 70 },
        children: [new TextRun({ text: templateId === 'creative' ? `[${name.split(/\s+/).map((n: string) => n[0]).join('').slice(0, 2)}]  ${nameText}` : nameText, bold: templateId !== 'elegant', size: scale.name, color: opts?.nameColor || p, font })],
      }));

      if (titleText) {
        headerRows.push(new Paragraph({
          alignment,
          spacing: { after: 70 },
          children: [new TextRun({ text: titleText, size: scale.title, color: opts?.titleColor || a, font })],
        }));
      }

      headerRows.push(new Paragraph({
        alignment,
        spacing: { after: 180 },
        border: { bottom: { style: BorderStyle.SINGLE, size: templateId === 'executive' ? 5 : 2, color: opts?.nameColor || p } },
        children: [new TextRun({ text: contactText, size: 17, color: opts?.contactColor || '666666', font })],
      }));

      return headerRows;
    };

      let children: any[] = [];
      const tmpl = selectedTemplate.id;

      if (tmpl === 'editorial-authority') {
        const editorialHeading = (label: string) => new Paragraph({
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: 260, after: 90 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: a } },
          children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 22, color: p, font: 'Calibri', allCaps: true })],
        });
        const editorialRoleHeading = (exp: any) => new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          spacing: { before: 150, after: 35 },
          tabStops: [{ type: 'right' as any, position: 9000 }],
          children: [
            new TextRun({ text: cleanResumeText(exp.role), bold: true, size: 23, color: t, font: 'Georgia' }),
            ...(cleanResumeText(exp.duration) ? [new TextRun({ text: `\t${cleanResumeText(exp.duration)}`, size: 17, color: '666666', font: 'Calibri' })] : []),
          ],
        });
        children = [
          new Paragraph({
            spacing: { after: 45 },
            children: [new TextRun({ text: cleanResumeText(resume.name) || 'Resume', size: 52, color: p, font: 'Georgia' })],
          }),
          ...(cleanResumeText(resume.title) ? [new Paragraph({
            spacing: { after: 90 },
            children: [new TextRun({ text: cleanResumeText(resume.title).toUpperCase(), bold: true, size: 20, color: a, font: 'Calibri', allCaps: true })],
          })] : []),
          ...(contact.length ? [
            editorialHeading('Contact'),
            new Paragraph({
              spacing: { after: 110 },
              children: [new TextRun({ text: contact.map(item => cleanResumeText(item)).join('  |  '), size: 18, color: '555555', font: 'Calibri' })],
            }),
          ] : []),
          ...(cleanResumeText(resume.summary) ? [
            editorialHeading('Executive Profile'),
            new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: cleanResumeText(resume.summary), size: 20, color: '333333', font: 'Georgia' })],
            }),
          ] : []),
          ...(resume.experience?.length ? [
            editorialHeading('Experience'),
            ...resume.experience.flatMap(exp => [
              editorialRoleHeading(exp),
              ...(cleanResumeText(exp.company) ? [new Paragraph({
                keepNext: true,
                spacing: { after: 55 },
                children: [new TextRun({ text: cleanResumeText(exp.company).toUpperCase(), bold: true, size: 18, color: a, font: 'Calibri', allCaps: true })],
              })] : []),
              ...exp.achievements.map((achievement: string) => new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 35 },
                children: [new TextRun({ text: cleanResumeText(achievement), size: 19, color: '333333', font: 'Calibri' })],
              })),
            ]),
          ] : []),
          ...(resume.skills?.length ? [
            editorialHeading('Areas of Expertise'),
            ...resume.skills.map(category => new Paragraph({
              spacing: { after: 45 },
              children: [
                new TextRun({ text: `${cleanResumeText(category.category)}: `, bold: true, size: 19, color: p, font: 'Calibri' }),
                new TextRun({ text: category.items.map(item => cleanResumeText(item)).filter(Boolean).join(', '), size: 19, color: '444444', font: 'Calibri' }),
              ],
            })),
          ] : []),
          ...(resume.education?.length ? [
            editorialHeading('Education'),
            ...resume.education.map(education => new Paragraph({
              spacing: { after: 55 },
              children: [
                ...(cleanResumeText(education.degree) ? [new TextRun({ text: cleanResumeText(education.degree), bold: true, size: 20, color: t, font: 'Georgia' })] : []),
                ...([cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).length ? [new TextRun({
                  text: `${cleanResumeText(education.degree) ? ' — ' : ''}${[cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).join(' · ')}`,
                  size: 18,
                  color: '555555',
                  font: 'Calibri',
                })] : []),
              ],
            })),
          ] : []),
          ...(resume.certifications?.length ? [
            editorialHeading('Certifications'),
            ...resume.certifications.map(certification => new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 30 },
              children: [new TextRun({ text: cleanResumeText(certification), size: 19, color: '333333', font: 'Calibri' })],
            })),
          ] : []),
        ];
      } else if (tmpl === 'technical-signal' || tmpl === 'brutalist-voltage') {
        const isTechnicalSignal = tmpl === 'technical-signal';
        const companionFont = isTechnicalSignal ? 'Courier New' : 'Arial';
        const companionHeadingColor = isTechnicalSignal ? a : p;
        const companionAccentColor = isTechnicalSignal ? '0A9F36' : 'FF4A36';
        const companionHeading = (label: string) => new Paragraph({
          heading: HeadingLevel.HEADING_1,
          keepNext: true,
          spacing: { before: 240, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: isTechnicalSignal ? 2 : 8, color: companionHeadingColor } },
          children: [new TextRun({
            text: `${isTechnicalSignal ? '// ' : ''}${label.toUpperCase()}`,
            bold: true,
            size: isTechnicalSignal ? 21 : 24,
            color: companionHeadingColor,
            font: companionFont,
            allCaps: true,
          })],
        });
        const companionRoleHeading = (exp: any) => new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: true,
          spacing: { before: 145, after: 35 },
          tabStops: [{ type: 'right' as any, position: 9000 }],
          children: [
            new TextRun({ text: cleanResumeText(exp.role), bold: true, size: 22, color: t, font: companionFont }),
            ...(cleanResumeText(exp.duration) ? [new TextRun({ text: `\t${cleanResumeText(exp.duration)}`, bold: !isTechnicalSignal, size: 17, color: '555555', font: companionFont })] : []),
          ],
        });

        children = [
          new Paragraph({
            spacing: { after: 35 },
            border: isTechnicalSignal ? undefined : { top: { style: BorderStyle.SINGLE, size: 12, color: p } },
            children: [new TextRun({
              text: cleanResumeText(resume.name).toUpperCase() || 'RESUME',
              bold: true,
              size: isTechnicalSignal ? 48 : 56,
              color: isTechnicalSignal ? t : '090909',
              font: companionFont,
            })],
          }),
          ...(cleanResumeText(resume.title) ? [new Paragraph({
            spacing: { after: 65 },
            children: [new TextRun({
              text: cleanResumeText(resume.title).toUpperCase(),
              bold: true,
              size: isTechnicalSignal ? 20 : 23,
              color: isTechnicalSignal ? a : companionAccentColor,
              font: companionFont,
              allCaps: true,
            })],
          })] : []),
          ...(contact.length ? [
            companionHeading('Contact'),
            new Paragraph({
              spacing: { after: 100 },
              children: [new TextRun({ text: contact.map(item => cleanResumeText(item)).join('  |  '), size: 18, color: '444444', font: companionFont })],
            }),
          ] : []),
          ...(cleanResumeText(resume.summary) ? [
            companionHeading(isTechnicalSignal ? 'Technical Summary' : 'Point of View'),
            new Paragraph({
              spacing: { after: 110 },
              shading: isTechnicalSignal ? undefined : { type: ShadingType.SOLID, color: 'F2F0E8' },
              children: [new TextRun({ text: cleanResumeText(resume.summary), size: 20, color: '333333', font: companionFont })],
            }),
          ] : []),
          ...(resume.skills?.length ? [
            companionHeading(isTechnicalSignal ? 'Technical Capabilities Index' : 'Capabilities'),
            ...resume.skills.map(category => new Paragraph({
              spacing: { after: 42 },
              children: [
                new TextRun({ text: `${cleanResumeText(category.category)}${isTechnicalSignal ? ' /' : ''}: `, bold: true, size: 19, color: companionHeadingColor, font: companionFont }),
                new TextRun({ text: category.items.map(item => cleanResumeText(item)).filter(Boolean).join(', '), size: 19, color: '333333', font: companionFont }),
              ],
            })),
          ] : []),
          ...(resume.experience?.length ? [
            companionHeading('Experience'),
            ...resume.experience.flatMap(exp => [
              companionRoleHeading(exp),
              ...(cleanResumeText(exp.company) ? [new Paragraph({
                keepNext: true,
                spacing: { after: 45 },
                children: [new TextRun({ text: cleanResumeText(exp.company).toUpperCase(), bold: true, size: 18, color: isTechnicalSignal ? a : p, font: companionFont, allCaps: true })],
              })] : []),
              ...exp.achievements.map((achievement: string) => new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 32 },
                children: [new TextRun({ text: cleanResumeText(achievement), size: 19, color: '333333', font: companionFont })],
              })),
            ]),
          ] : []),
          ...(resume.education?.length ? [
            companionHeading('Education'),
            ...resume.education.map(education => new Paragraph({
              spacing: { after: 50 },
              children: [
                ...(cleanResumeText(education.degree) ? [new TextRun({ text: cleanResumeText(education.degree), bold: true, size: 20, color: t, font: companionFont })] : []),
                ...([cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).length ? [new TextRun({
                  text: `${cleanResumeText(education.degree) ? ' — ' : ''}${[cleanResumeText(education.institution), cleanResumeText(education.year)].filter(Boolean).join(' · ')}`,
                  size: 18,
                  color: '555555',
                  font: companionFont,
                })] : []),
              ],
            })),
          ] : []),
          ...(resume.certifications?.length ? [
            companionHeading(isTechnicalSignal ? 'Selected Credentials' : 'Recognition'),
            ...resume.certifications.map(certification => new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 30 },
              children: [new TextRun({ text: cleanResumeText(certification), size: 19, color: '333333', font: companionFont })],
            })),
          ] : []),
        ];
      } else if (tmpl === 'minimal') {
        // ── MINIMAL: centered, light, dash bullets ──
        children = [
          ...safeDocxHeader('minimal', { nameColor: t, titleColor: '777777', contactColor: '999999' }),
          ...(resume.summary ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: resume.summary, size: 20, color: '555555' })] })] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: 'EXPERIENCE', size: 18, color: '999999', allCaps: true, font: 'Calibri' })] }),
            ...resume.experience.flatMap(exp => expBlock(exp, { bullet: '–' })),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: 'EDUCATION', size: 18, color: '999999', allCaps: true })] }),
            ...resume.education.map(edu => eduBlock(edu)),
          ] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: 'SKILLS', size: 18, color: '999999', allCaps: true })] }),
            new Paragraph({ children: [new TextRun({ text: resume.skills.flatMap(s => s.items).join(',  '), size: 20, color: '555555' })] }),
          ] : []),
        ];
      } else if (tmpl === 'creative') {
        // ── CREATIVE: initials prefix, emoji heading icons, triangle bullets ──
        children = [
          ...safeDocxHeader('creative', { titleColor: '666666', contactColor: '555555' }),
          ...(resume.summary ? [new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: resume.summary, size: 20, color: '555555' })] })] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'EXPERIENCE', bold: true, size: 24, color: p })] }),
            ...resume.experience.flatMap(exp => expBlock(exp, { bullet: 'arrow_right' })),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'EDUCATION', bold: true, size: 24, color: p })] }),
            ...resume.education.map(edu => eduBlock(edu)),
          ] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'SKILLS', bold: true, size: 24, color: p })] }),
            ...resume.skills.map(cat => skillBlock(cat)),
          ] : []),
        ];
      } else if (tmpl === 'harvard') {
        // ── HARVARD: centered name, education FIRST, company-first experience ──
        children = [
          ...safeDocxHeader('harvard', { font: 'Georgia', contactColor: '555555' }),
          ...(resume.education?.length ? [
            sectionHead('EDUCATION', { font: 'Georgia', borderColor: `${p}66` }),
            ...resume.education.flatMap(edu => [
              new Paragraph({ spacing: { after: 20 }, tabStops: [{ type: 'right' as any, position: 9000 }], children: [new TextRun({ text: edu.institution, bold: true, size: 22, color: t, font: 'Georgia' }), new TextRun({ text: `\t${edu.year}`, size: 18, color: '666666', font: 'Georgia' })] }),
              new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: edu.degree, italics: true, size: 20, color: '555555', font: 'Georgia' })] }),
            ]),
          ] : []),
          ...(resume.experience?.length ? [
            sectionHead('EXPERIENCE', { font: 'Georgia', borderColor: `${p}66` }),
            ...resume.experience.flatMap(exp => expBlock(exp, { font: 'Georgia', companyFirst: true })),
          ] : []),
          ...(resume.skills?.length ? [
            sectionHead('SKILLS & INTERESTS', { font: 'Georgia', borderColor: `${p}66` }),
            ...resume.skills.map(cat => skillBlock(cat, { font: 'Georgia' })),
          ] : []),
          ...(resume.summary ? [
            sectionHead('SUMMARY', { font: 'Georgia', borderColor: `${p}66` }),
            new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: resume.summary, size: 20, color: '555555', font: 'Georgia' })] }),
          ] : []),
        ];
      } else if (tmpl === 'elegant') {
        // ── ELEGANT: centered name, wide tracking, italic quoted summary, em-dash bullets ──
        children = [
          ...safeDocxHeader('elegant', { font: 'Georgia', contactColor: '888888' }),
          ...(resume.summary ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 250 }, children: [new TextRun({ text: `\u201C${resume.summary}\u201D`, italics: true, size: 20, color: '666666', font: 'Georgia' })] })] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: '—  EXPERIENCE  —', size: 20, color: p, font: 'Georgia', allCaps: true })] }),
            ...resume.experience.flatMap(exp => expBlock(exp, { font: 'Georgia', bullet: '—' })),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: '—  EDUCATION  —', size: 20, color: p, font: 'Georgia', allCaps: true })] }),
            ...resume.education.map(edu => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 50 }, children: [new TextRun({ text: `${edu.degree}  —  ${edu.institution}  —  ${edu.year}`, size: 20, color: '555555', font: 'Georgia' })] })),
          ] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: '—  EXPERTISE  —', size: 20, color: p, font: 'Georgia', allCaps: true })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: resume.skills.flatMap(s => s.items).join('    '), size: 18, color: '666666', font: 'Georgia' })] }),
          ] : []),
        ];
      } else if (tmpl === 'compact') {
        // ── COMPACT: dense small fonts, skills before experience, tight spacing ──
        children = [
          ...safeDocxHeader('compact', { titleColor: '666666', contactColor: '666666' }),
          ...(resume.summary ? [new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: resume.summary, size: 18, color: '555555' })] })] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ spacing: { before: 100, after: 50 }, children: [new TextRun({ text: 'CORE COMPETENCIES', bold: true, size: 18, color: p, allCaps: true })] }),
            new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: resume.skills.flatMap(s => s.items).join('  |  '), size: 17, color: p })] }),
          ] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ spacing: { before: 100, after: 50 }, children: [new TextRun({ text: 'PROFESSIONAL EXPERIENCE', bold: true, size: 18, color: p, allCaps: true })] }),
            ...resume.experience.flatMap(exp => [
              new Paragraph({ spacing: { before: 60, after: 15 }, tabStops: [{ type: 'right' as any, position: 9000 }], children: [new TextRun({ text: `${exp.role}`, bold: true, size: 20, color: t }), new TextRun({ text: ` @ ${exp.company}`, size: 18, color: '666666' }), new TextRun({ text: `\t${exp.duration}`, size: 16, color: '999999' })] }),
              ...exp.achievements.map((ach: string) => new Paragraph({ spacing: { after: 15 }, indent: { left: 240 }, children: [new TextRun({ text: `•  ${ach}`, size: 17, color: '444444' })] })),
            ]),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ spacing: { before: 100, after: 50 }, children: [new TextRun({ text: 'EDUCATION', bold: true, size: 18, color: p, allCaps: true })] }),
            ...resume.education.map(edu => new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${edu.degree}`, bold: true, size: 18, color: t }), new TextRun({ text: `  •  ${edu.institution}  •  ${edu.year}`, size: 17, color: '666666' })] })),
          ] : []),
        ];
      } else if (tmpl === 'nordic') {
        // ── NORDIC: duration/company left column via tabs, airy spacing ──
        children = [
          ...safeDocxHeader('nordic', { nameColor: t, titleColor: a, contactColor: a }),
          ...(resume.summary ? [new Paragraph({ spacing: { after: 250 }, children: [new TextRun({ text: resume.summary, size: 20, color: `${t}cc` })] })] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ spacing: { before: 200, after: 120 }, children: [new TextRun({ text: 'EXPERIENCE', size: 18, color: a, allCaps: true })] }),
            ...resume.experience.flatMap(exp => [
              new Paragraph({ spacing: { before: 80 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: exp.duration, size: 18, color: a }), new TextRun({ text: `\t${exp.role}`, bold: true, size: 22, color: t })] }),
              new Paragraph({ spacing: { after: 50 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: exp.company, size: 16, color: a }), new TextRun({ text: '\t' })] }),
              ...exp.achievements.map((ach: string) => new Paragraph({ spacing: { after: 30 }, indent: { left: 2800 }, children: [new TextRun({ text: ach, size: 19, color: '555555' })] })),
              new Paragraph({ spacing: { after: 80 }, text: '' }),
            ]),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ spacing: { before: 200, after: 80 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: 'EDUCATION', size: 18, color: a, allCaps: true })] }),
            ...resume.education.map(edu => new Paragraph({ spacing: { after: 50 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: edu.year, size: 18, color: a }), new TextRun({ text: `\t${edu.degree}  —  ${edu.institution}`, size: 20, color: t })] })),
          ] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ spacing: { before: 200, after: 80 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: 'SKILLS', size: 18, color: a, allCaps: true })] }),
            new Paragraph({ spacing: { after: 80 }, tabStops: [{ type: 'left' as any, position: 2800 }], children: [new TextRun({ text: '\t' }), new TextRun({ text: resume.skills.flatMap(s => s.items).join('    '), size: 18, color: '555555' })] }),
          ] : []),
        ];
      } else if (tmpl === 'technical') {
        // ── TECHNICAL: Courier monospace, // prefixed headings, → bullets, skills first ──
        const f = 'Courier New';
        children = [
          ...safeDocxHeader('technical', { font: f, contactColor: '666666' }),
          ...(resume.summary ? [
            new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: '// SUMMARY', bold: true, size: 22, color: p, font: f, allCaps: true })] }),
            new Paragraph({ spacing: { after: 160 }, border: { left: { style: BorderStyle.SINGLE, size: 8, color: a } }, indent: { left: 200 }, children: [new TextRun({ text: resume.summary, size: 19, color: '555555', font: f })] }),
          ] : []),
          ...(resume.skills?.length ? [
            new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: '// TECHNICAL SKILLS', bold: true, size: 22, color: p, font: f, allCaps: true })] }),
            ...resume.skills.map(cat => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${cat.category}: `, bold: true, size: 19, color: t, font: f }), new TextRun({ text: cat.items.join(', '), size: 19, color: '555555', font: f })] })),
          ] : []),
          ...(resume.experience?.length ? [
            new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: '// EXPERIENCE', bold: true, size: 22, color: p, font: f, allCaps: true })] }),
            ...resume.experience.flatMap(exp => expBlock(exp, { font: f, bullet: '→' })),
          ] : []),
          ...(resume.education?.length ? [
            new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: '// EDUCATION', bold: true, size: 22, color: p, font: f, allCaps: true })] }),
            ...resume.education.map(edu => eduBlock(edu, { font: f })),
          ] : []),
        ];
      } else if (tmpl === 'modern' || tmpl === 'cascade' || tmpl === 'double-column') {
        // ── MODERN / CASCADE / DOUBLE-COLUMN: sidebar table layout ──
        const sidebarScale = getDocxHeaderScale(tmpl);
        const sidebarPreset = getHeaderPreset(tmpl);
        const sidebarContent: any[] = [
          ...(sidebarPreset.eyebrow ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: sidebarPreset.eyebrow.toUpperCase(), bold: true, size: 14, color: 'AAAAAA', allCaps: true })] })] : []),
          new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: cleanResumeText(resume.name) || 'Resume', bold: true, size: Math.min(sidebarScale.name, 34), color: 'FFFFFF' })] }),
          ...(cleanResumeText(resume.title) ? [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: cleanResumeText(resume.title), size: Math.min(sidebarScale.title, 19), color: 'DDDDDD' })] })] : []),
          // Contact
          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'CONTACT', bold: true, size: 16, color: 'AAAAAA', allCaps: true })] }),
          ...contact.map(c => new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: cleanResumeText(c), size: 16, color: 'CCCCCC' })] })),
        ];
        // Sidebar skills
        if (resume.skills?.length) {
          sidebarContent.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: 'SKILLS', bold: true, size: 16, color: 'AAAAAA', allCaps: true })] }));
          resume.skills.forEach(cat => {
            sidebarContent.push(new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: cat.category, bold: true, size: 18, color: 'FFFFFF' })] }));
            sidebarContent.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: cat.items.join(', '), size: 17, color: 'BBBBBB' })] }));
          });
        }
        // Sidebar education
        if (resume.education?.length) {
          sidebarContent.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: 'EDUCATION', bold: true, size: 16, color: 'AAAAAA', allCaps: true })] }));
          resume.education.forEach(edu => {
            sidebarContent.push(new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: edu.degree, bold: true, size: 18, color: 'FFFFFF' })] }));
            sidebarContent.push(new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: edu.institution, size: 17, color: 'CCCCCC' })] }));
            sidebarContent.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: edu.year, size: 16, color: 'AAAAAA' })] }));
          });
        }

        const mainContent: any[] = [];
        if (resume.summary) {
          mainContent.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: tmpl === 'cascade' ? 'PROFILE' : 'ABOUT ME', bold: true, size: 22, color: p, allCaps: true })] }));
          mainContent.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: resume.summary, size: 20, color: '555555' })] }));
        }
        if (resume.experience?.length) {
          mainContent.push(new Paragraph({ spacing: { before: 100, after: 80 }, children: [new TextRun({ text: tmpl === 'cascade' ? 'WORK EXPERIENCE' : 'EXPERIENCE', bold: true, size: 22, color: p, allCaps: true })] }));
          resume.experience.forEach(exp => mainContent.push(...expBlock(exp)));
        }

        const sidebarCell = new TableCell({
          width: { size: 3200, type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: tc.primary },
          borders: noBorders,
          children: sidebarContent,
        });
        const mainCell = new TableCell({
          width: { size: 6800, type: WidthType.DXA },
          borders: noBorders,
          children: mainContent.length > 0 ? mainContent : [new Paragraph('')],
        });

        children = [new Table({
          rows: [new TableRow({ children: [sidebarCell, mainCell] })],
          width: { size: 10000, type: WidthType.DXA },
          borders: noBorders as any,
        })];
      } else {
        // ── EXECUTIVE (default) — classic professional layout ──
        children = [
          ...safeDocxHeader(tmpl),
          ...(resume.summary ? [sectionHead('PROFESSIONAL SUMMARY'), new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: resume.summary, size: 21, color: '444444' })] })] : []),
          ...(resume.experience?.length ? [sectionHead('EXPERIENCE'), ...resume.experience.flatMap(exp => expBlock(exp))] : []),
          ...(resume.education?.length ? [sectionHead('EDUCATION'), ...resume.education.map(edu => eduBlock(edu))] : []),
          ...(resume.skills?.length ? [sectionHead('SKILLS'), ...resume.skills.map(cat => skillBlock(cat))] : []),
          ...certBlocks(),
        ];
      }

      for (const section of resume.additionalSections || []) {
        if (!section.items.length) continue;
        children.push(sectionHead(section.title), ...section.items.map(item => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: item, size: 21 })] })));
      }
      const extraLinks = normalizeResume(resume).links || [];
      if (extraLinks.length) children.push(sectionHead('LINKS'), ...extraLinks.map(link => new Paragraph({ children: [new TextRun({ text: link, size: 21 })] })));
      const doc = new DocxDocument({
        styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '333333' } } } },
        sections: [{ properties: { page: { size: pageSize === 'LETTER' ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 }, margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      if (!isCurrent()) return;
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
    if (prepared.guardrailReport?.blockedChangeCount) {
      showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
    }
    showToast('Word document downloaded!', 'check_circle');
      analytics.resumeDownload('word');
    } catch (e) { if (isCurrent()) { console.error('Word download error:', e); showToast('Download failed', 'cancel'); } }
    finally { exportBusyRef.current = false; if (sourceParseMountedRef.current) setIsExporting(false); }
  };

  // ===== DUAL-AI TOOLS STATE =====

  const [resumeCheckResult, setResumeCheckResult] = useState<any>(null);
  const [resumeCheckLoading, setResumeCheckLoading] = useState(false);



  // ===== DUAL-AI HANDLERS =====

  // Skills serialization and normalization are handled by lib/resume-normalizer.ts
  // Use normalizeResume() for data, serializeResumeToText() for AI prompts

  const checkResume = async () => {
    const displayResume = getDisplayResume();
    if (!displayResume) return showToast('No resume data available', 'cancel');
    setResumeCheckLoading(true);
    setResumeCheckResult(null);
    try {
      const resumeText = serializeResumeToText(normalizeResume(displayResume));

      const res = await authFetch('/api/resume/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, targetJD: jobDescription || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        /* Signed out is 401 + requiresAuth, not 403, and this page is reachable
           signed out: the landing's Resume mode card links straight at
           /suite/resume, WorkspaceFrame does not redirect, and /api/resume/parse
           allows anonymous, so the resume renders and every Quality Scan button
           is live. Without this the answer was a bare red toast. Same shape the
           parse and morph handlers already use above. */
        // Return, not throw - see the note in the cover-letter handler.
        if (data.requiresAuth) { setShowDownloadAuth('signup'); return; }
        // Post-entitlement-fix this route no longer 403s free users; it 429s
        // with limitReached once FREE_CAPS.resumeChecks is spent, and that body
        // carries `upgrade`, so the same test catches both. The server's own
        // sentence is used because those two cases need different words and
        // only the server knows which one it sent.
        if (data.upgrade || res.status === 403) {
          setShowUpgradeModal(true);
          showToast(data.error || 'Resume Check is a Standard feature', 'lock');
          return;
        }
        throw new Error(data.error || 'Failed to check resume');
      }
      setResumeCheckResult(data);
      showToast(`Resume graded: ${data.overallGrade} (ATS: ${data.atsScore}/100)`, 'check_circle');
    } catch (err: any) {
      showToast(err.message || 'Failed to check resume', 'cancel');
    } finally { setResumeCheckLoading(false); }
  };




  const generateSummary = async () => {
    if (!buildResume.title) return showToast('Add a job title first', 'cancel');
    setAiSuggesting(true);
    try {
      const res = await authFetch('/api/resume/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_summary',
          text: serializeResumeToText(normalizeResume(buildResume)),
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        if (errData.upgrade || res.status === 403) setShowUpgradeModal(true);
        throw new Error(errData.error || 'Failed');
      }
      const data = await res.json();
      setBuildResume(prev => ({ ...prev, summary: data.summary }));
      showToast('Summary generated!', 'check_circle');
    } catch { showToast('Failed to generate', 'cancel'); }
    finally { setAiSuggesting(false); }
  };

  const generateAchievements = async (expIndex: number) => {
    const exp = buildResume.experience[expIndex];
    if (!exp?.role) return;
    const sourceAchievements = (exp.achievements || []).map(item => item.trim()).filter(Boolean);
    if (sourceAchievements.length === 0) {
      showToast('Add one real responsibility or result first. AI can rewrite your evidence, but it will not invent it.', 'cancel');
      return;
    }
    setAiSuggesting(true);
    try {
      const res = await authFetch('/api/resume/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_achievements',
          text: `Role: ${exp.role}\nCompany: ${exp.company}\nSource evidence:\n${sourceAchievements.map(item => `- ${item}`).join('\n')}`,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        if (errData.upgrade || res.status === 403) setShowUpgradeModal(true);
        throw new Error(errData.error || 'Failed');
      }
      const data = await res.json();
      const newExp = [...buildResume.experience];
      newExp[expIndex] = { ...exp, achievements: data.achievements };
      setBuildResume(prev => ({ ...prev, experience: newExp }));
      showToast('Achievement evidence rewritten', 'check_circle');
    } catch { showToast('Failed to generate', 'cancel'); }
    finally { setAiSuggesting(false); }
  };


  const resetAll = () => {
    sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
    sourceParseRequestRef.current += 1; sourceAbortRef.current?.abort(); morphRequestRef.current += 1; morphAbortRef.current?.abort();
    setActiveGeneration(null); setSelectedAppliedVersionId(null); setPreviousGenerations([]);
    setIsLoading(false); setTailoringError(''); setProcessingStage(null); setPostingUrl(''); setProofData(null); setTargetPageCount('auto');
    setDocumentVersionId(null); setDocumentName('My resume'); setDocumentOrigin('user_authored'); setDocumentManualEdits(false); setWorkspaceSource(null);
    setRawSourceText(''); setIntakeResume(null); setIntakeWarnings([]); setIntakeError(''); setEditorEpoch(epoch => epoch + 1);
    setMode('choose');
    setStep('upload');
    setOriginalResume(null);
    setMorphedResume(null);
    setGuardrailReport(null);
    setBuildResume({ ...EMPTY_RESUME });
    setSourceResumeMeta({});
    setShowSourceConfirmation(false);
    setActiveStart('upload');
    setSourcePasteText('');
    setTemplateFilter('all');
    setSaveInlineStatus(null);
    setJobDescription('');
    setMatchScore(null);
    setMorphPercentage(75);
    setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
    setDraftSaveState('idle');
    setDraftSavedAt(null);
    if (isReviewDemo) {
      try { sessionStorage.removeItem('talent-resume-review-demo'); } catch {}
    }
    clearDraft();
  };


  const navigateWorkspace = (destination: ExperienceDestination) => {
    if (mode !== 'choose') setResumeReturn({ mode, step });
    setMode('choose');
    setWorkspaceDestination(destination); setShowImport(false); setTemplateBrowsing(false);
    try { if (user?.uid) sessionStorage.setItem(`taco:experience-destination:${user.uid}`, destination); } catch {}
  };

  const clearDocumentContext = () => {
    sourceUploadOperationRef.current?.cancel(); sourceUploadOperationRef.current = null;
    sourceAbortRef.current?.abort(); sourceParseRequestRef.current += 1; morphRequestRef.current += 1;
    morphAbortRef.current?.abort(); setActiveGeneration(null); setSelectedAppliedVersionId(null); setPreviousGenerations([]);
    setIsLoading(false); setProcessingStage(null); setMorphedResume(null); setOriginalResume(null);
    setJobDescription(''); setPostingUrl(''); setMatchScore(null); setProofData(null); setGuardrailReport(null);
    setResumeCheckResult(null); setBlueprintContent(null); setShowBlueprintModal(false); setIsBlueprintLoading(false);
    setApplicationData({ companyName: '', jobTitle: '', notes: '' }); setSaveCompanyName('');
    setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
    setShowApplicationModal(false); setShowSaveModal(false); setSaveInlineStatus(null); setTrackingError('');
    setShowSourceConfirmation(false); setDocumentVersionId(null); setDocumentOrigin('user_authored');
    setDocumentManualEdits(false); setEditorEpoch(epoch => epoch + 1);
  };

  const startDocument = (resume: CanonicalResume = normalizeResume(EMPTY_RESUME), source: WorkspaceSourceSnapshot | null = null) => {
    clearDocumentContext(); setWorkspaceSource(source); setBuildResume(resume); setOriginalResume(resume);
    setDesignConfig(createResumeDesign(selectedTemplate.id, resume, selectedTemplateColors, pageSize));
    setDocumentName(resume.name ? `${resume.name} — general resume` : 'My resume');
    setWorkspaceDestination('resumes'); setMode('create'); setStep('upload');
    setResumeReturn({ mode: 'create', step: 'content' }); setShowImport(false); setTemplateBrowsing(false);
    if (searchParams.get('template') && hasResumeData(resume)) { setMorphedResume(resume); setMode('morph'); setStep('template'); }
  };

  const saveExperienceRevision = async (value: CanonicalResume, origin: 'user_upload' | 'user_authored'): Promise<WorkspaceSourceSnapshot | null> => {
    if (experienceSaveBusy.current) return null;
    if (!value.additionalSections?.some(section => section.items.length) && !hasResumeData(value)) {
      setExperienceStatus('Add a name, a role, a skill, or another experience detail first.'); return null;
    }
    experienceSaveBusy.current = true; setExperienceSaving(true); setExperienceStatus('');
    const ownerId = user?.uid || null;
    const request = sourceParseRequestRef.current;
    const isCurrent = () => isCurrentSourceParse(request, sourceParseRequestRef.current, ownerId, useStore.getState().user?.uid || null, sourceParseMountedRef.current);
    try {
      const resume = normalizeResume(value);
      const contentHash = await stableWorkspaceContentHash(resume);
      const key = await resumeTrackingIdempotencyKey(ownerId || 'local', stableResumeTrackingKey(['experience', experienceVersionId, resume, origin]));
      if (!isCurrent()) return null;
      // A retry must carry the same confirmation receipt, including after a tab reload.
      if (experienceConfirmationRef.current?.key !== key) {
        let confirmedAt = new Date().toISOString();
        try {
          const stored = sessionStorage.getItem(`taco:experience-confirmation:${ownerId || 'local'}:${key}`);
          if (stored && Number.isFinite(Date.parse(stored))) confirmedAt = stored;
          else sessionStorage.setItem(`taco:experience-confirmation:${ownerId || 'local'}:${key}`, confirmedAt);
        } catch { /* In-memory retries remain available when device storage is denied. */ }
        experienceConfirmationRef.current = { key, confirmedAt };
      }
      const { confirmedAt } = experienceConfirmationRef.current;
      const source: WorkspaceSourceSnapshot = { sourceVersionId: ownerId ? `handoff_${key}` : null, content: resume, contentHash, confirmedAt };
      if (ownerId) {
        const result = await saveResumeVersion(`${resume.name || 'My'} — experience`, resume as any, {}, 'technical', {
          savedFrom: 'experience_confirmed', resumeProvenance: { verified: true, origin },
          workspace: createWorkspaceMetadata({ kind: 'experience', origin, contentHash, content: resume,
            parentVersionId: experienceVersionId, sourceVersionId: source.sourceVersionId, sourceSnapshot: source,
            sourceHash: contentHash, sourceConfirmedAt: confirmedAt }),
        }, { idempotencyKey: key });
        if (!isCurrent()) return null;
        if (!result.success || !result.data) throw new Error(result.error || 'Experience could not be saved. Your edits are still here.');
        setExperienceVersionId(result.data.id); source.sourceVersionId = result.data.id;
        void loadVersions();
      }
      if (!isCurrent()) return null;
      setExperienceDraft(resume); setExperienceDirty(false); experienceLoadedRef.current = true;
      setExperienceStatus(ownerId ? 'Confirmed experience saved to your account. Existing resumes are unchanged.' : 'Confirmed for this session. Sign in to keep an account copy.');
      mergeApplicationKitContext({ resumeVersionId: source.sourceVersionId || null, resumeVersionName: 'Confirmed experience',
        resumeSnapshot: resume, resumeText: resumeSnapshotToText(resume), resumeSource: ownerId ? 'library' : 'resume_studio',
        applicationId: null, company: '', jobTitle: '', targetRole: '', jobDescription: '', applicationUrl: '' });
      return source;
    } catch (error) {
      if (isCurrent()) setExperienceStatus(error instanceof Error ? error.message : 'Could not save. Your edits are retained.');
      return null;
    } finally { experienceSaveBusy.current = false; if (sourceParseMountedRef.current) setExperienceSaving(false); }
  };

  const confirmImportedSource = async (nextStep: 'content' | 'design' | 'job' = 'content') => {
    if (!intakeResume || (intakeWarnings.length > 0 && !intakeAcknowledged)) return;
    const destination = workspaceDestination;
    const value = normalizeResume(intakeResume);
    if (destination === 'experience' || alsoSaveExperience) {
      const source = await saveExperienceRevision(value, 'user_upload');
      if (!source) return;
      setShowSourceConfirmation(false); setShowImport(false);
      if (destination === 'resumes') {
        if (originalResume && hasResumeData(originalResume)) {
          invalidateTailoredResult(); setOriginalResume(value as ResumeData); setBuildResume(value as ResumeData); setWorkspaceSource(source);
          if (nextStep === 'design') { setPreviousGenerations(history => retainPreviousGeneration(history, currentGenerationSnapshot())); setActiveGeneration(null); setMorphedResume(value as ResumeData); setDocumentOrigin('user_upload'); setDocumentManualEdits(false); setMatchScore(null); setProofData(null); setGuardrailReport(null); setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} }); navigateSection('design'); }
          else navigateSection(nextStep === 'job' ? 'target' : 'source');
          return;
        }
        startDocument(value, source); setDocumentOrigin('user_upload');
        if (nextStep === 'design') { setMorphedResume(value as ResumeData); setMode('morph'); setStep('template'); }
        if (nextStep === 'job') beginJobTailoring(value as ResumeData, value.name ? `${value.name} — general resume` : 'My resume');
      }
      else { setMode('choose'); setWorkspaceDestination('experience'); }
      return;
    }
    // Resume editing does not depend on publishing a shared career record.
    const owner = user?.uid || null;
    const request = sourceParseRequestRef.current;
    setExperienceSaving(true);
    try {
      const contentHash = await stableWorkspaceContentHash(value);
      if (!isCurrentSourceParse(request, sourceParseRequestRef.current, owner, useStore.getState().user?.uid || null, sourceParseMountedRef.current)) return;
      if (originalResume && hasResumeData(originalResume)) {
        invalidateTailoredResult(); setOriginalResume(value as ResumeData); setBuildResume(value as ResumeData);
        setWorkspaceSource({ sourceVersionId: null, content: value, contentHash, confirmedAt: new Date().toISOString(), rawText: rawSourceText });
        setShowSourceConfirmation(false); setShowImport(false);
        if (nextStep === 'design') { setPreviousGenerations(history => retainPreviousGeneration(history, currentGenerationSnapshot())); setActiveGeneration(null); setMorphedResume(value as ResumeData); setDocumentOrigin('user_upload'); setDocumentManualEdits(false); setMatchScore(null); setProofData(null); setGuardrailReport(null); setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} }); navigateSection('design'); }
        else navigateSection(nextStep === 'job' ? 'target' : 'source');
        return;
      }
      startDocument(value, { sourceVersionId: null, content: value, contentHash, confirmedAt: new Date().toISOString(), rawText: rawSourceText });
      setDocumentOrigin('user_upload');
      if (nextStep === 'design') { setMorphedResume(value as ResumeData); setMode('morph'); setStep('template'); }
      if (nextStep === 'job') beginJobTailoring(value as ResumeData, value.name ? `${value.name} — general resume` : 'My resume');
    } finally { if (sourceParseMountedRef.current) setExperienceSaving(false); }
  };

  const createResumeFromCareerDetails = async () => {
    const saved = versions.find(version => version.id === experienceVersionId);
    const source = !experienceDirty && saved
      ? readWorkspaceVersion(saved).sourceSnapshot
      : await saveExperienceRevision(experienceDraft, 'user_authored');
    if (source) startDocument(normalizeResume(experienceDraft), source);
  };

  const editDocument = () => {
    sourceAbortRef.current?.abort(); morphRequestRef.current += 1; setIsLoading(false);
    const current = getPreparedOutboundResume('editing');
    if (!current?.resume) return;
    setBuildResume(current.resume as ResumeData); setMode('create'); setStep('content'); setWorkspaceDestination('resumes');
  };

  const designDocument = () => {
    if (!buildResume.additionalSections?.some(section => section.items.length) && !hasResumeData(buildResume)) {
      showToast('Add some resume content before choosing a design.', 'info'); return;
    }
    const candidate = normalizeResume(buildResume) as ResumeData;
    if (documentManualEdits || documentOrigin !== 'tailored') {
      // Manual content becomes the next tailoring source. Keep its immutable
      // imported snapshot in workspaceSource rather than reverting these edits.
      setOriginalResume(candidate); setDocumentOrigin('user_authored');
      setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
      setMatchScore(null); setProofData(null); setGuardrailReport(null);
    }
    setMorphedResume(candidate); setMode('morph'); setStep('template');
  };

  const beginJobTailoring = (resume: ResumeData, name: string) => {
    sourceAbortRef.current?.abort(); morphRequestRef.current += 1;
    setIsLoading(false); setProcessingStage(null);
    morphAbortRef.current?.abort(); setActiveGeneration(null); setSelectedAppliedVersionId(null); setPreviousGenerations([]);
    setOriginalResume(normalizeResume(resume) as ResumeData); setBuildResume(normalizeResume(resume) as ResumeData); setMorphedResume(null);
    setDocumentName(`${name.replace(/ — (tailored )?copy$/, '') || 'My resume'} — copy`);
    setDocumentVersionId(null); setDocumentOrigin('user_authored');
    setJobDescription(''); setPostingUrl(''); setApplicationData({ companyName: '', jobTitle: '', notes: '' }); setSaveCompanyName('');
    setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} }); setMatchScore(null); setProofData(null); setGuardrailReport(null);
    setResumeCheckResult(null); setSaveInlineStatus(null); setShowDocumentChecks(false);
    setDocumentManualEdits(false); setWorkspaceDestination('resumes'); setTemplateBrowsing(false); setShowImport(false);
    setEditorEpoch(epoch => epoch + 1); setMode('morph'); setStep('jd'); setResumeReturn({ mode: 'morph', step: 'jd' });
  };

  const tailorDocument = (candidate?: ResumeData) => {
    const prepared = getPreparedOutboundResume('tailoring', candidate);
    if (prepared?.resume) beginJobTailoring(prepared.resume as ResumeData, documentName);
  };

  const browseTemplates = () => {
    navigateSection('design');
  };
  const resumeDraft = resumeReturn.mode === 'morph'
    ? hasResumeData(morphedResume) ? morphedResume : hasResumeData(originalResume) ? originalResume : null
    : hasResumeData(buildResume) ? buildResume : null;
  const applyBrowsingTemplate = (templateId: string) => {
    const template = TEMPLATES.find(item => item.id === templateId);
    if (!template || tierLoading || !isResumeTemplateSelectionEntitled(template.id, isPro)) return;
    selectTemplate(template); setTemplateBrowsing(false);
    if (resumeDraft) { setMode(resumeReturn.mode); setStep(resumeReturn.mode === 'create' ? 'content' : resumeReturn.step); }
    else { setRawSourceText(''); setIntakeResume(null); setSourceResumeMeta({}); startDocument(); }
  };
  const invalidateTailoredResult = () => {
    setSelectedAppliedVersionId(null);
    morphAbortRef.current?.abort(); morphRequestRef.current += 1;
    setIsLoading(false); setTailoringError(''); setResumeCheckResult(null); setSaveInlineStatus(null);
  };
  const backToSource = () => navigateSection('source');
  const continueSourceToTailor = () => {
    if (!hasResumeData(buildResume)) return;
    setOriginalResume(normalizeResume(buildResume) as ResumeData);
    navigateSection('target');
  };
  const skipTailoring = () => {
    if (showSourceConfirmation || !originalResume || !hasResumeData(originalResume)) { navigateSection('source'); return; }
    setPreviousGenerations(history => retainPreviousGeneration(history, currentGenerationSnapshot()));
    setActiveGeneration(null); setSelectedAppliedVersionId(null);
    setMorphedResume(normalizeResume(originalResume));
    setDocumentOrigin('user_authored'); setDocumentManualEdits(true);
    setMatchScore(null); setProofData(null); setGuardrailReport(null);
    setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
    setMode('morph'); setStep('template');
  };
  const workflowSection: ResumeSection = mode === 'choose' || mode === 'create' || step === 'upload' || step === 'content' ? 'source' : step === 'jd' ? 'target' : step === 'morph' || step === 'enhance' ? 'shape' : step === 'template' ? 'design' : 'ship';
  const workflowSectionRef = useRef<ResumeSection>(workflowSection);
  useEffect(() => { workflowSectionRef.current = workflowSection; }, [workflowSection]);
  const navigateSection = (section: ResumeSection) => {
    setWorkspaceDestination('resumes'); setTemplateBrowsing(false);
    if (section === 'source') {
      if (showSourceConfirmation || !hasResumeData(originalResume)) { setMode('choose'); setStep('upload'); }
      else { setBuildResume(normalizeResume(originalResume)); setMode('create'); setStep('upload'); }
    } else {
      setMode('morph');
      setStep(section === 'target' ? 'jd' : section === 'shape' ? (morphedResume && documentOrigin === 'tailored' && !candidateOutdated ? 'enhance' : 'morph') : section === 'design' ? 'template' : 'preview');
    }
  };
  const needsReview = documentOrigin === 'tailored' && !documentManualEdits && Boolean(appliedSource && morphedResume && deriveResumeReviewLedger(appliedSource as ResumeReviewResume, morphedResume as ResumeReviewResume).changes.some(change => !resumeReview.decisions[change.id] || (change.kind === 'needs-review' && resumeReview.decisions[change.id] !== 'reverted')));
  const sectionStatuses = resumeSectionStatuses({ hasSource: hasResumeData(originalResume) && !showSourceConfirmation,
    sourcePending: Boolean(processingStage), sourceError: Boolean(intakeError), sourceWarnings: showSourceConfirmation,
    hasJob: Boolean(jobDescription.trim()), generating: isLoading && !processingStage,
    hasCandidate: hasResumeData(morphedResume), outdated: candidateOutdated,
    needsReview, hasTemplateAccess: !tierLoading && isResumeTemplateSelectionEntitled(selectedTemplate.id, isPro), saved: saveInlineStatus?.type === 'success' });
  useToolGuidance(createResumeGuidance({
    contextKey: resumeGuidanceContext(documentVersionId, workspaceSource?.sourceVersionId, workspaceSource?.contentHash, editorEpoch),
    section: templateBrowsing ? 'design' : workflowSection,
    start: mode === 'choose' && workspaceDestination === 'resumes' && !templateBrowsing && !showSourceConfirmation,
    confirming: showSourceConfirmation,
    editing: mode === 'create',
    reviewing: mode === 'morph' && step === 'enhance',
    hasSource: hasResumeData(originalResume) && !showSourceConfirmation,
    hasJob: Boolean(jobDescription.trim()),
    pending: isLoading || Boolean(processingStage) || experienceSaving,
    sourceError: Boolean(intakeError),
    hasCandidate: hasResumeData(morphedResume),
    stale: candidateOutdated,
    reviewRequired: needsReview,
    templateAllowed: !tierLoading && isResumeTemplateSelectionEntitled(selectedTemplate.id, isPro),
    careerDetails: mode === 'choose' && workspaceDestination === 'experience',
  }));
  const restoreGeneration = (generation: ResumeGeneration) => {
    beginSourceUpload();
    invalidateTailoredResult();
    const current = currentGenerationSnapshot();
    if (current && current.id !== generation.id) setPreviousGenerations(history => retainPreviousGeneration(history, current).filter(item => item.id !== generation.id));
    setActiveGeneration(generation); setSelectedAppliedVersionId(generation.id); setOriginalResume(generation.inputs.source as ResumeData);
    setWorkspaceSource(generation.sourceContext?.workspaceSource || null);
    setRawSourceText(generation.sourceContext?.rawText || ''); setSourceResumeMeta(generation.sourceContext?.metadata || {});
    setIntakeResume(null); setIntakeWarnings([]);
    setBuildResume(generation.inputs.source as ResumeData); setMorphedResume(generation.candidate as ResumeData);
    setJobDescription(generation.inputs.jobDescription); setPostingUrl(generation.inputs.postingUrl);
    setApplicationData({ jobTitle: generation.inputs.role, companyName: generation.inputs.company, notes: '' });
    setMorphPercentage(Math.min(generation.inputs.percentage, maxMorphPercentage)); setTargetPageCount(generation.inputs.targetPageCount);
    setResumeReview(generation.review); setMatchScore(generation.score); setProofData(generation.proof); setGuardrailReport(generation.guardrailReport);
    setDocumentOrigin('tailored'); setDocumentManualEdits(false);
    const template = resolveEntitledReplacementTemplate(generation.presentation.templateId, isPro);
    setSelectedTemplate(template); setSelectedPaletteId(getTemplatePalette(template, generation.presentation.paletteId).id); setPageSize(generation.presentation.pageSize);
    setDesignConfig(readResumeDesign(generation.presentation.design, generation.candidate));
    setPdfExportMode(generation.presentation.pdfExportMode === 'application' ? 'application' : 'designed');
    setMode('morph'); setStep('enhance');
  };
  const generationNotice = activeGeneration ? <aside className="experience-notice" aria-label="Applied AI settings">
    <strong>{candidateOutdated ? 'Needs regeneration' : generationInputsChanged ? 'Selected previous version' : 'Current AI version'}</strong>
    <p>Generated at {appliedPercentage}% strength{activeGeneration.inputs.role ? ` for ${activeGeneration.inputs.role}` : ''}. Requested: {morphPercentage}% · {targetPageCount === 'auto' ? 'automatic length' : `${targetPageCount} ${targetPageCount === 1 ? 'page' : 'pages'}`}.</p>
    {generationInputsChanged && !candidateOutdated && <p>You selected this version with its original applied settings. Current strength limits apply to your next AI run.</p>}
    {!activeGeneration.sourceContext && selectedAppliedVersionId === activeGeneration.id && <p>This older version has no linked original file. Its stored source fields remain available for comparison.</p>}
    {candidateOutdated && <><p>Your source, target or settings have changed. The previous result and review decisions are retained.</p><div className="experience-actions"><button type="button" onClick={() => { setMode('morph'); setStep('morph'); }}>Regenerate with current inputs</button><button type="button" onClick={() => restoreGeneration(currentGenerationSnapshot() || activeGeneration)}>Use this version with its original inputs</button><button type="button" onClick={skipTailoring}>Use confirmed source without AI</button></div></>}
  </aside> : null;
  const generationHistory = previousGenerations.length ? <details className="resume-workflow-library"><summary>Previous AI versions ({previousGenerations.length})</summary><div className="experience-actions">{previousGenerations.map(item => <button type="button" key={item.id} onClick={() => restoreGeneration(item)}>{item.inputs.role || 'Resume'} · {item.effectivePercentage}% · {new Date(item.createdAt).toLocaleString()}</button>)}</div></details> : null;
  const workspaceNavigation = <details className="resume-workflow-library"><summary>My workspace</summary><YourExperienceNavigation current={mode === 'choose' ? workspaceDestination : 'resumes'} onNavigate={navigateWorkspace} onTemplates={browseTemplates} templatesActive={mode === 'choose' && templateBrowsing} /></details>;
  const importEditor = intakeResume ? <ResumeContentEditor key={`intake-${editorEpoch}`} value={intakeResume as CanonicalResume} context={workspaceDestination === 'experience' ? 'experience' : 'resume'} title="Edit your imported resume" sourceText={rawSourceText} warnings={intakeWarnings} disabled={experienceSaving}
    onChange={next => { setIntakeResume(next as ResumeData); setIntakeAcknowledged(false); }} /> : null;
  const sourceReview = showSourceConfirmation && intakeResume ? <section aria-label="Review imported resume" data-guide="resume-source-review">
    <ResumeSourceDiagnosis resume={intakeResume} rawText={rawSourceText || undefined} warnings={intakeWarnings} fileName={sourceResumeMeta.fileName} />
    <div className="resume-import-toolbar">
      <p className="experience-eyebrow">Your import is ready to edit</p><h2>Check your imported resume</h2>
      <p className="experience-status">Correct the content below and compare it with your original text. Then continue to Job Description with your confirmed resume.</p>
      {intakeWarnings.length > 0 && <label className="experience-notice"><input type="checkbox" checked={intakeAcknowledged} onChange={event => setIntakeAcknowledged(event.target.checked)} /> I compared these differences with my source and corrected or confirmed the facts.</label>}
      {workspaceDestination === 'resumes' && <label className="experience-status"><input type="checkbox" checked={alsoSaveExperience} onChange={event => setAlsoSaveExperience(event.target.checked)} /> Also save these details to my reusable career details</label>}
      <div className="experience-actions"><button type="button" data-guide="resume-source-confirm" className="is-primary" disabled={experienceSaving || (intakeWarnings.length > 0 && !intakeAcknowledged)} onClick={() => void confirmImportedSource(workspaceDestination === 'experience' ? 'content' : 'job')}>{experienceSaving ? 'Confirming…' : workspaceDestination === 'experience' ? 'Confirm career details' : 'Continue to Job Description'}</button>
        {workspaceDestination === 'resumes' && <button type="button" disabled={experienceSaving || (intakeWarnings.length > 0 && !intakeAcknowledged)} onClick={() => void confirmImportedSource('design')}>Use without AI tailoring</button>}
        <button type="button" disabled={experienceSaving} onClick={() => { beginSourceUpload(); setIntakeResume(null); setRawSourceText(''); setIntakeWarnings([]); setActiveStart('upload'); }}>Replace this import</button></div>
      {experienceStatus && <p className="experience-status" role="status">{experienceStatus}</p>}
    </div>
    {workspaceDestination === 'experience' ? importEditor : <ResumeDocumentWorkspace templateName={selectedTemplate.name} preview={<ResponsiveResumePreview resume={intakeResume} template={selectedTemplateWithPalette} design={currentDesign} />}>{importEditor}</ResumeDocumentWorkspace>}
  </section> : null;

  const resumeUpload = <FileUploadDropzone variant="arrival" onUploadStart={handleSourceUploadStart} onUploadOperation={registerSourceUploadOperation} canContinueUpload={isCurrentSourceUpload} onUploadError={handleSourceUploadError} onUploadSuccess={(text, fileName, meta) => { setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, characterCount: meta?.characterCount, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted }); return handleFileExtracted(text); }} isUploading={isLoading} setIsUploading={handleSourceUploadLoading} processingStage={processingStage} uploadContext="studio" />;
  const importRecovery = <>
    {(intakeError || processingStage) && <ResumeSourceDiagnosis resume={intakeResume} rawText={rawSourceText || undefined} warnings={intakeWarnings} fileName={sourceResumeMeta.fileName} error={intakeError} isProcessing={Boolean(processingStage)} />}
    {isLoading && processingStage === 'parsing' && <div className="experience-actions"><p role="status">Organizing your resume. Your extracted text is retained.</p><button type="button" onClick={() => { beginSourceUpload(); setIsLoading(false); setProcessingStage(null); setIntakeError('Processing cancelled. You can retry or edit the extracted text.'); }}>Cancel processing</button></div>}
    {intakeError && <div className="experience-notice" role="alert"><p>{intakeError}</p>{rawSourceText && <><div className="experience-actions"><button type="button" disabled={isLoading} onClick={() => void handleFileExtracted(rawSourceText)}>Retry reading</button><button type="button" disabled={isLoading} onClick={() => { setIntakeResume(resumeTextDraft(rawSourceText) as ResumeData); setIntakeWarnings(['Automatic field extraction was unavailable. Your original text is preserved in editable sections; review it before continuing.']); setIntakeAcknowledged(false); setIntakeError(''); setShowSourceConfirmation(true); setShowImport(true); }}>Edit extracted text</button></div><details className="experience-source-comparison"><summary>Your extracted text</summary><pre>{rawSourceText}</pre></details></>}</div>}
  </>;

  const newestExperience = versions.find(version => version.metadata?.workspace?.kind === 'experience' && !version.metadata?.archived);
  const newerExperienceSource = newestExperience ? readWorkspaceVersion(newestExperience).sourceSnapshot : null;
  const experienceUpdateNotice = workspaceSource && newerExperienceSource && newerExperienceSource.contentHash !== workspaceSource.contentHash ? <aside className="experience-notice" aria-label="Experience update available">
    <strong>Your experience has a newer revision.</strong><p>This resume still uses its original record. Compare the two before starting an updated copy.</p>
    <details className="experience-source-comparison"><summary>Compare experience revisions</summary><h3>This resume’s source</h3><pre>{resumeSnapshotToText(workspaceSource.content)}</pre><h3>Latest confirmed experience</h3><pre>{resumeSnapshotToText(newerExperienceSource.content)}</pre></details>
    <button type="button" onClick={() => { const name = documentName; startDocument(normalizeResume(newerExperienceSource.content), newerExperienceSource); setDocumentName(`${name} — updated copy`); }}>Start a new draft from latest experience</button>
    <p>Saved resumes stay unchanged. This starts a new draft; any unsaved document edits are not carried into it.</p>
  </aside> : null;

  const documentToolbar = <div className="resume-document-bar" data-guide="resume-save">
    <div className="experience-document-toolbar">
      <label>Resume name<input value={documentName} maxLength={160} onChange={event => { setDocumentName(event.target.value); setSaveInlineStatus(null); }} /></label>
    </div>
    <p className="experience-status" role="status">{saveInlineStatus?.message || (draftSaveState === 'error' ? 'Recovery could not be saved. Keep this tab open until you save your resume.' : draftSaveState === 'saved' ? 'Draft retained in this tab · Save resume to keep it in your account' : 'Not saved yet')}</p>
  </div>;

  // ===== RENDER: Experience and Resume destinations =====
  if (mode === 'choose') {
    const sourceVersions = versions.filter(version => version.metadata?.workspace?.kind === 'experience' && !version.metadata?.archived);
    const documentVersions = versions.filter(version => version.metadata?.workspace?.kind !== 'experience');
    const latestDocument = documentVersions.filter(version => !version.metadata?.archived).sort((a, b) => (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0))[0];
    const returnContent = resumeDraft || (latestDocument ? normalizeResume(latestDocument.content) as ResumeData : null);
    return <SuiteToolShell variant="editor" className="experience-workspace resume-studio-system-shell resume-guided-workflow">
      {workspaceNavigation}
      {workspaceDestination === 'resumes' && <ResumeStudioHeader current={templateBrowsing ? 'design' : 'source'} onNavigate={navigateSection} statuses={sectionStatuses} candidateName={documentName} stageDescription={templateBrowsing ? 'Explore layouts, then choose one for your real resume.' : 'Upload your resume, check the extracted facts, then add the job description.'} />}
      {workspaceDestination === 'experience' && <div className="flex min-w-0 justify-end"><PageHelp toolId="resume" /></div>}
      <section id="resume-source-console" aria-label="Resume upload workspace">
        {sourceReview || (showImport ? <section>
          <div className="experience-section-title"><div><p className="experience-eyebrow">Bring your content</p><h2>Import and review</h2><p>We’ll extract your text, then you can correct the facts before saving them.</p></div><div className="experience-actions"><button type="button" onClick={() => { beginSourceUpload(); setIsLoading(false); setShowImport(false); }}>Close import</button></div></div>
          <div className="experience-editor-tabs" aria-label="Import method"><button type="button" aria-current={activeStart === 'upload' ? 'page' : undefined} onClick={() => { beginSourceUpload(); setIsLoading(false); setActiveStart('upload'); }}>Upload file</button><button type="button" aria-current={activeStart === 'paste' ? 'page' : undefined} onClick={() => { beginSourceUpload(); setIsLoading(false); setActiveStart('paste'); }}>Paste text</button></div>
          {activeStart === 'paste' ? <div><label>Resume or career text<textarea value={sourcePasteText} onChange={event => setSourcePasteText(event.target.value)} placeholder="Paste your work, education, skills and other experience." /></label><div className="experience-actions"><button type="button" disabled={isLoading || sourcePasteText.trim().length < 20} onClick={() => handleSourceConsolePaste(sourcePasteText)}>{isLoading ? 'Structuring text…' : 'Extract for review'}</button></div></div> : resumeUpload}
          {importRecovery}
          <p className="experience-status">Review the imported content, then continue to your resume. Saving a reusable experience record is optional. On the live app, text is sent to the AI service to organize fields.</p>
        </section> : workspaceDestination === 'experience' ? <section>
          <div className="experience-section-title"><div><p className="experience-eyebrow">Optional, reusable information</p><h2>Your career details</h2><p>Keep roles, achievements and skills ready to reuse. Saving here won’t change your existing resumes.</p></div><div className="experience-actions"><button type="button" onClick={() => { setShowImport(true); setActiveStart('upload'); }}>Import career details</button><button type="button" className="is-primary" data-guide="experience-save" disabled={experienceSaving} onClick={() => void saveExperienceRevision(experienceDraft, 'user_authored')}>{experienceSaving ? 'Saving…' : 'Confirm and save details'}</button></div></div>
          {experienceStatus && <p className="experience-notice" role="status">{experienceStatus}</p>}
          {libraryError && <div className="experience-notice" role="alert">{libraryError}<button type="button" onClick={() => void loadVersions()}>Retry loading</button></div>}
          <ResumeContentEditor key={`experience-${experienceVersionId || 'new'}`} value={experienceDraft} context="experience" disabled={experienceSaving} onChange={next => { setExperienceDraft(next); setExperienceDirty(true); setExperienceStatus('Unsaved experience changes'); }} />
          <div className="experience-actions"><button type="button" className="is-primary" data-guide="experience-reuse" disabled={experienceSaving} onClick={() => void createResumeFromCareerDetails()}>Use these details in a resume</button><button type="button" onClick={() => router.push('/suite/agent/stories')}>Open Story Bank</button></div>
          {sourceVersions.length > 0 && <details className="experience-profile-history"><summary>Experience history · {sourceVersions.length} {sourceVersions.length === 1 ? 'revision' : 'revisions'}</summary>{sourceVersions.map(version => <button type="button" key={version.id} onClick={() => { setExperienceDraft(normalizeResume(version.content)); setExperienceVersionId(version.id); setExperienceDirty(false); setExperienceStatus('Viewing a confirmed experience revision. New edits will save as another revision.'); }}>{version.version_name} · {new Date(version.updated_at || version.created_at).toLocaleDateString()}</button>)}</details>}
        </section> : templateBrowsing ? <ResumeTemplateBrowser selectedTemplateId={selectedTemplate.id} hasProAccess={isPro} loadingAccess={tierLoading} onSelect={applyBrowsingTemplate} resume={resumeDraft ? normalizeResume(resumeDraft) : undefined} /> : <section className="resume-home-stack">
          {returnContent && <details className="resume-workflow-library"><summary>Continue a previous resume</summary><article className="resume-return-card" aria-label="Continue your resume">
            <div><p className="experience-eyebrow">{resumeDraft ? 'Your current draft' : 'Your most recent resume'}</p><h2>{resumeDraft ? documentName : latestDocument?.version_name}</h2><p>{resumeDraft ? 'Your work is retained in this tab. Pick up where you left off.' : 'Saved to your account. Open it to edit, change the design or export.'}</p><div className="experience-actions"><button type="button" className="is-primary" onClick={() => { if (resumeDraft) { setMode(resumeReturn.mode); setStep(resumeReturn.step); } else if (latestDocument) loadVersionToMorph(latestDocument); }}>Continue editing</button><button type="button" onClick={() => { if (resumeDraft) tailorDocument(resumeDraft); else if (latestDocument) loadVersionToMorph(latestDocument, 'tailor'); }}>Tailor to a job</button><button type="button" onClick={browseTemplates}>Explore templates</button></div><p className="experience-status">Paste a job description, morph a separate copy, then review the changes.</p></div>
            <div className="resume-return-card__thumbnail" aria-hidden="true"><div><ResumeTemplate resume={returnContent} template={resumeDraft ? selectedTemplateWithPalette : getTemplateWithPalette(resolveReplacementTemplate(getPersistedResumeTemplateId(latestDocument)), getPersistedResumePaletteId(latestDocument))} design={resumeDraft ? currentDesign : getPersistedResumeDesign(latestDocument, normalizeResume(latestDocument.content)) || undefined} /></div></div>
          </article></details>}
          <ResumeStartPanel onUpload={() => { beginSourceUpload(); setIsLoading(false); setShowImport(true); setActiveStart('upload'); }} onPaste={() => { beginSourceUpload(); setIsLoading(false); setShowImport(true); setActiveStart('paste'); }} onBlank={() => { setRawSourceText(''); setIntakeResume(null); setSourceResumeMeta({}); startDocument(); }} hasExperience={Boolean(sourceVersions.length || hasResumeData(experienceDraft))} onFromExperience={() => void createResumeFromCareerDetails()}>
            {resumeUpload}
          </ResumeStartPanel>
          {importRecovery}
          <details className="resume-workflow-library"><summary data-guide="resume-library">Open a saved resume</summary>{hasPreviousAccountDraft && <div className="experience-notice"><p>Your account had another tab draft before sign-in. Both drafts are retained.</p><button type="button" onClick={reopenPreviousAccountDraft}>Switch to the previous tab draft</button></div>}<ResumeWorkspaceLibrary versions={documentVersions} loading={libraryLoading} error={libraryError} onRetry={() => void loadVersions()} onOpen={loadVersionToMorph} onTailor={version => loadVersionToMorph(version, 'tailor')} onDuplicate={version => { loadVersionToMorph(version); setDocumentVersionId(null); setDocumentName(`${version.version_name} — copy`); }} onUpdate={async (version, updates) => {
            const ownerId = user?.uid;
            const related = updates.archived === undefined ? [version] : groupResumeVersions(documentVersions).find(group => group.versions.some(item => item.id === version.id))?.versions || [version];
            try {
              for (const item of related) {
                if (useStore.getState().user?.uid !== ownerId) throw new Error('Your account changed. Reload your resumes before making this change.');
                const result = await updateResumeVersion(item.id, { ...(updates.name ? { version_name: updates.name } : {}), ...(updates.archived !== undefined ? { is_active: !updates.archived, metadata: { ...item.metadata, archived: updates.archived } } : {}) });
                if (!result.success) throw new Error(result.error || 'Some revisions could not be updated. Your library will refresh; retry to finish the change.');
              }
            } finally { if (useStore.getState().user?.uid === ownerId) await loadVersions(); }
          }} /></details>
        </section>)}
      </section>
      {showDownloadAuth && <AuthModal mode={showDownloadAuth} postAuthRedirect={null} onAuthSuccess={retainGuestDraftAfterSignIn} onClose={() => setShowDownloadAuth(null)} onSwitchMode={() => setShowDownloadAuth(showDownloadAuth === 'login' ? 'signup' : 'login')} />}
    </SuiteToolShell>;
  }

  if (mode === 'create') {
    const content = buildResume as CanonicalResume;
    return <SuiteToolShell variant="editor" className="experience-workspace resume-studio-system-shell resume-guided-workflow">
      {workspaceNavigation}
      <ResumeStudioHeader current="source" onNavigate={navigateSection} statuses={sectionStatuses} candidateName={documentName}
        stageDescription={step === 'upload' ? 'Correct the source if needed. Your job description and template are retained; edits require a fresh AI rewrite.' : 'Add or correct your resume content, then continue to Job Description.'}
        backAction={<button type="button" className="resume-studio-header__secondary" onClick={() => navigateWorkspace('resumes')}>Back</button>}
        primaryAction={<button type="button" className="resume-studio-header__primary" disabled={!buildResume.additionalSections?.some(section => section.items.length) && !hasResumeData(buildResume)} onClick={continueSourceToTailor}>Continue to Job Description</button>}
        secondaryAction={<button type="button" className="resume-studio-header__secondary" onClick={step === 'upload' ? skipTailoring : designDocument}>Use without AI tailoring</button>} />
      {generationNotice}{generationHistory}
      <ResumeSourceDiagnosis resume={content} rawText={rawSourceText || undefined} fileName={sourceResumeMeta.fileName} warnings={intakeWarnings} />
      <ResumeDocumentWorkspace templateName={selectedTemplate.name} mobileView={documentViewSession.epoch === editorEpoch ? documentViewSession.value : 'edit'} onMobileViewChange={value => setDocumentViewSession({ epoch: editorEpoch, value })} preview={<ResponsiveResumePreview resume={content} template={selectedTemplateWithPalette} design={currentDesign} />}>
      {showDocumentChecks ? <section className="experience-checks"><h2>Review this document</h2><p className="experience-document-meta">These checks describe your content. They don’t verify credentials or predict hiring outcomes.</p><ul>
        <li>{content.email || content.phone ? 'Contact details present.' : 'Consider adding an email or phone number.'}</li>
        <li>{content.experience.length || content.additionalSections?.length ? 'Experience or additional sections included.' : 'Add work, projects, education or another section that represents your experience.'}</li>
        <li>{content.education.some(item => (item.degree || item.year) && !item.institution) ? 'An education entry is missing its institution. Add the name or remove the incomplete entry.' : 'No missing institution names in the education entries.'}</li>
        <li>{workspaceSource?.sourceVersionId ? 'Linked to your saved experience. Document edits do not change that record.' : workspaceSource ? 'Your reviewed import is retained with this resume.' : 'Original source is not linked. You can still edit this document; source comparison is unavailable.'}</li>
        <li>Check actual PDF pages in Export. Requested page length is a preference, not a guarantee.</li>
      </ul><div className="experience-actions"><button type="button" onClick={() => setShowDocumentChecks(false)}>Back to content</button><button type="button" onClick={designDocument}>Design and export</button></div></section> : <ResumeContentEditor key={`document-${editorEpoch}`} value={content} session={documentEditorSession.epoch === editorEpoch ? documentEditorSession.value : emptyEditorSession} onSessionChange={action => setDocumentEditorSession(previous => ({ epoch: editorEpoch, value: typeof action === 'function' ? action(previous.epoch === editorEpoch ? previous.value : createResumeEditorSession()) : action }))} sourceText={rawSourceText || (workspaceSource ? resumeSnapshotToText(workspaceSource.content) : undefined)} onChange={next => { if (step !== 'upload' && documentOrigin === 'tailored' && !documentManualEdits && !getPreparedOutboundResume('editing')) return; setBuildResume(next as ResumeData); if (step === 'upload') { setOriginalResume(next as ResumeData); invalidateTailoredResult(); } else { if (activeGeneration) setPreviousGenerations(history => retainPreviousGeneration(history, currentGenerationSnapshot())); setActiveGeneration(null); setOriginalResume(next as ResumeData); setMorphedResume(next as ResumeData); setDocumentOrigin('user_authored'); setDocumentManualEdits(true); setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} }); setMatchScore(null); setProofData(null); setGuardrailReport(null); } setSaveInlineStatus(null); setResumeCheckResult(null); }} />}
      </ResumeDocumentWorkspace>
      {showDownloadAuth && <AuthModal mode={showDownloadAuth} postAuthRedirect={null} onAuthSuccess={retainGuestDraftAfterSignIn} onClose={() => setShowDownloadAuth(null)} onSwitchMode={() => setShowDownloadAuth(showDownloadAuth === 'login' ? 'signup' : 'login')} />}
    </SuiteToolShell>;
  }

  // ===== RENDER: Morph Flow =====
  if (mode === 'morph') {
    const displayResume = getDisplayResume();
    const resumeSnapshot = getResumeSnapshot(originalResume);
    const jdSignals = getJobDescriptionSignals(jobDescription);
    const optimizationModes = morphConsent.unlocked100
      ? [
        ...OPTIMIZATION_MODES,
        { id: 'maximum', label: 'Maximum', value: RESUME_MORPH_FULL_UNLOCK, detail: 'Full rewrite strength, truth locks still on' },
      ]
      : OPTIMIZATION_MODES;
    const activeOptimizationMode = optimizationModes.reduce((closest, mode) => (
      Math.abs(mode.value - morphPercentage) < Math.abs(closest.value - morphPercentage) ? mode : closest
    ), optimizationModes[1]);
    const templateSignalText = [
      jdSignals.role,
      jdSignals.keywords.join(' '),
      jobDescription,
      displayResume?.title,
      displayResume?.summary,
      skillLabels(displayResume).join(' '),
    ].filter(Boolean).join(' ');
    const recommendedTemplateIds = getRecommendedTemplateIds(templateSignalText);
    const filteredTemplates = TEMPLATES.filter(template => templateMatchesFilter(template, templateFilter));
    const pendingGeneratedReview = needsReview;
    const exportCandidate = displayResume && !pendingGeneratedReview && !candidateOutdated && !showSourceConfirmation ? prepareResumeForExport({
      mode: documentManualEdits || documentOrigin !== 'tailored' ? 'create' : 'morph',
      candidateResume: displayResume, originalResume: appliedSource, requestedMorphPercentage: appliedPercentage, hasFullConsent: appliedConsent,
    }).resume : null;
    const canPreviewExport = Boolean(user && !tierLoading && isResumeTemplateSelectionEntitled(selectedTemplate.id, isPro) && exportCandidate);
    const educationInstitutionGaps = getMissingEducationInstitutions(displayResume);
    const exportReadiness = [
      { label: 'Contact present', ready: Boolean(displayResume?.email || displayResume?.phone), icon: 'alternate_email' },
      { label: displayResume?.summary ? 'Summary included (optional)' : 'No summary (optional)', ready: true, icon: 'notes' },
      { label: 'Experience, education or projects included', ready: Boolean(displayResume?.experience?.length || displayResume?.education?.length || displayResume?.additionalSections?.length), icon: 'work_history' },
      { label: 'School names present', ready: educationInstitutionGaps.length === 0, icon: educationInstitutionGaps.length === 0 ? 'school' : 'priority_high' },
      { label: 'Template selected', ready: Boolean(selectedTemplate?.id), icon: 'palette' },
      { label: user ? 'Library save available' : 'Sign-in needed for library', ready: Boolean(user), icon: user ? 'cloud_done' : 'lock' },
    ];
    const morphProofReport = buildResumeMorphProofReport({
      proof: proofData,
      guardrailReport,
      originalResume,
      optimizedResume: displayResume,
      jobDescription,
      matchScore,
      morphPercentage,
      selectedTemplateName: selectedTemplate.name,
      educationInstitutionGaps: educationInstitutionGaps.length,
    });

    if (ENABLE_RESUME_REVIEW_WORKBENCH && step === 'enhance') {
      return (
        <div className="experience-workspace resume-guided-workflow" data-guide="resume-review">{workspaceNavigation}{generationNotice}{generationHistory}<div className="experience-actions"><button type="button" onClick={() => setStep('morph')}>AI strength and regenerate</button></div><ResumeReviewWorkbench
          sourceResume={appliedSource as ResumeReviewResume | null}
          candidateResume={morphedResume as ResumeReviewResume | null}
          reviewState={resumeReview}
          onReviewStateChange={(nextReviewState) => {
            setDraftSaveState('idle');
            setResumeReview(nextReviewState);
          }}
          onContinue={() => navigateSection('design')}
          onNavigate={navigateSection} statuses={sectionStatuses}
          onBack={() => { setStep('morph'); }}
          onStartOver={resetAll}
          targetLabel={applicationData.jobTitle || morphedResume?.title || originalResume?.title || ''}
          morphStrength={appliedPercentage}
          fitScore={matchScore ?? proofData?.optimizedScore ?? null}
          atsScore={resumeCheckResult?.atsScore ?? null}
          proofScore={proofData?.optimizedScore ?? null}
          protectedCount={guardrailReport?.protectedFields?.length ?? null}
          saveState={draftSaveState}
          savedAt={draftSavedAt}
          isPro={isPro}
          onRunAtsScan={checkResume}
          atsScanLoading={resumeCheckLoading}
        /></div>
      );
    }

    return (
      <SuiteToolShell variant="editor" className="experience-workspace resume-studio-system-shell resume-guided-workflow">
          {workspaceNavigation}
          <ResumeStudioHeader onNavigate={navigateSection} statuses={sectionStatuses}
            stageDescription={step === 'jd' ? 'Add the job description and correct the role or company details. AI settings are in the next section.' : step === 'morph' ? 'Choose rewrite intensity, generate and review. Protected facts remain locked at every strength.' : step === 'template' ? 'Choose a template and colors, then continue to export or save.' : 'Name this version, inspect the actual pages, download it or save it to your account.'}
            backAction={<button type="button" className="resume-studio-header__secondary" onClick={() => navigateSection(step === 'preview' ? 'design' : step === 'template' ? 'shape' : step === 'morph' ? 'target' : 'source')}>Back</button>}
            sourceLabel={workspaceSource?.sourceVersionId ? 'Saved experience linked' : workspaceSource ? 'Original import retained' : 'Original source not linked'}
            current={workflowSection}
            candidateName={documentName || displayResume?.name || originalResume?.name}
            candidateDetail={displayResume?.name || originalResume?.name || 'Resume document'}
            targetLabel={jobDescription.trim() ? applicationData.jobTitle || jdSignals.role || displayResume?.title || originalResume?.title : undefined}
            saveLabel={draftSaveState === 'error' ? 'Draft save failed' : draftSaveState === 'saved' ? 'Draft saved in this tab' : 'Not saved'}
            secondaryAction={
              <button type="button" onClick={resetAll} className="resume-studio-header__secondary">
                Start over
              </button>
            }
            primaryAction={step === 'template' || step === 'jd' ? (
              <button type="button" onClick={() => navigateSection(step === 'jd' ? 'shape' : 'ship')} className="resume-studio-header__primary">
                {step === 'jd' ? 'Continue to AI Morph' : 'Continue to Export & Save'}
                <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
              </button>
            ) : undefined}
          />

          {generationNotice}{generationHistory}
          {showSourceConfirmation && <aside className="experience-notice"><p>Your new import needs confirmation. You can browse any section while it is retained.</p><button type="button" onClick={() => navigateSection('source')}>Confirm imported source</button></aside>}
          {step === 'preview' && documentToolbar}
          {experienceUpdateNotice}
          {step === 'preview' && displayResume && <details className="resume-workflow-library"><summary>More tools for this application</summary><div className="flex flex-wrap gap-2 py-3">
            <button type="button" onClick={editDocument} className="btn-secondary min-h-[44px] px-3 text-sm">Edit resume content</button>
            <button type="button" onClick={() => openWritingTool('/suite/cover-letter')} className="btn-secondary min-h-[44px] px-3 text-sm">Use this draft for a cover letter</button>
            <button type="button" onClick={() => openWritingTool('/suite/linkedin')} className="btn-secondary min-h-[44px] px-3 text-sm">Use this draft for LinkedIn</button>
          </div></details>}

          {educationInstitutionGaps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="elevation-card mb-6 rounded-[18px] border p-4 md:p-5 border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[13px] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                    <span className="material-symbols-rounded icon-status-danger text-[22px]">school</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--danger)] font-semibold"><TacoName /> needs school info</p>
                    <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">Add the institution before this resume leaves the studio.</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      A degree without a school name can look fabricated or incomplete. Talent Studio will not export, save, or track this version until the missing school is added.
                    </p>
                  </div>
                </div>
                <div className="grid w-full gap-2 lg:max-w-[460px]">
                  {educationInstitutionGaps.map((edu) => (
                    <label key={`${edu.index}-${edu.degree}-${edu.year}`} className="grid gap-1.5 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                        {[cleanResumeText(edu.degree) || 'Education entry', cleanResumeText(edu.year)].filter(Boolean).join(' · ')}
                      </span>
                      <input
                        type="text"
                        value={displayResume?.education?.[edu.index]?.institution || ''}
                        onChange={(event) => updateEducationInstitution(edu.index, event.target.value)}
                        placeholder="School or university name"
                        className="min-h-[44px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step Content */}
          <AnimatePresence mode="wait">
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <motion.div className="resume-studio-stage resume-studio-source-stage" key="upload" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <AnimatePresence mode="wait">
                {showSourceConfirmation && intakeResume ? (sourceReview
                    ) : invalidDocumentError ? (
                      <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="elevation-card w-full max-w-2xl mx-auto p-8 rounded-[20px] text-center space-y-5 border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)]">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] icon-status-danger"><span className="material-symbols-rounded align-middle mr-1">description</span><span className="material-symbols-rounded align-middle mr-1">cancel</span></div>
                        <div>
                          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">This doesn't look like a resume</h3>
                          <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto leading-relaxed">
                            Our AI parser couldn't detect standard structural elements like Work Experience, Education, or Skills in the uploaded file.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-4">
                          <button onClick={() => setInvalidDocumentError(false)} className="min-h-[44px] w-full sm:w-auto px-6 py-3 rounded-[12px] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-all font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            Try Another File
                          </button>
                          <button onClick={() => { setInvalidDocumentError(false); setMode('create'); }} className="btn-primary min-h-[44px] w-full sm:w-auto px-6 py-3 rounded-[12px] font-bold">
                            Build from the ground up <span className="material-symbols-rounded align-middle mr-1">auto_awesome</span>
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <FileUploadDropzone
                          onUploadStart={handleSourceUploadStart}
                          onUploadOperation={registerSourceUploadOperation}
                          canContinueUpload={isCurrentSourceUpload}
                          onUploadError={handleSourceUploadError}
	                          onUploadSuccess={(text, fileName, meta) => {
	                            setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, storagePath: meta?.storagePath, characterCount: meta?.characterCount || text.trim().length, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted });
	                            handleFileExtracted(text);
	                          }}
                          showPasteFallback
                          onPasteText={handlePastedResumeText}
                          uploadContext="studio"
                          isUploading={isLoading}
                          setIsUploading={handleSourceUploadLoading}
                          processingStage={processingStage}
                          variant="large"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
              </motion.div>
            )}

            {/* Step 2: JD */}
            {step === 'jd' && (
              <motion.div className="resume-studio-stage resume-studio-target-stage" key="jd" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ResumeDocumentWorkspace templateName={selectedTemplate.name} preview={displayResume ? <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} design={currentDesign} /> : <div className="experience-notice"><p>Upload and confirm a resume to see your document here.</p><button type="button" onClick={() => navigateSection('source')}>Upload resume</button></div>}>
                  <section className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="p-5 md:p-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Role target</p>
                        <h2 className="text-[20px] md:text-[22px] font-semibold text-[var(--text-primary)] mt-1">Paste the job description.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-2xl">Keep the full posting here. Confirm the target details before moving to AI Morph.</p>
                      </div>
                      <div className="hidden sm:flex h-10 w-10 rounded-[10px] bg-[var(--accent-dim)] border border-[var(--border-subtle)] text-[var(--accent)] items-center justify-center flex-shrink-0">
                        <span className="material-symbols-rounded text-[20px]">my_location</span>
                      </div>
                    </div>

                    <div className="p-5 md:p-6 space-y-4">
                      <textarea
                        data-guide="resume-job"
                        value={jobDescription}
                        onChange={(e) => {
                          invalidateTailoredResult();
                          setJobDescription(e.target.value);
                          mergeApplicationKitContext({ jobDescription: e.target.value });
                        }}
                        aria-label="Job description for optional tailoring" placeholder="Paste the full job description here. Include responsibilities, requirements, company context, and preferred qualifications when available."
                        className="w-full min-h-[260px] px-4 py-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] resize-y leading-relaxed text-[16px]"
                      />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="resume-workflow-field">Role (optional)<input value={applicationData.jobTitle} placeholder={jdSignals.role === 'Not detected' ? 'Job title' : jdSignals.role} onChange={event => { invalidateTailoredResult(); setApplicationData(prev => ({ ...prev, jobTitle: event.target.value })); }} /></label>
                        <label className="resume-workflow-field">Company (optional)<input value={applicationData.companyName} placeholder={jdSignals.company === 'Not detected' ? 'Company name' : jdSignals.company} onChange={event => { invalidateTailoredResult(); setApplicationData(prev => ({ ...prev, companyName: event.target.value })); }} /></label>
                        <label className="resume-workflow-field sm:col-span-2">Posting URL (optional)<input type="url" value={postingUrl} placeholder="https://" onChange={event => { invalidateTailoredResult(); setPostingUrl(event.target.value); }} /></label>
                      </div>
                      {originalResume && jdSignals.keywords.length > 0 && <p className="experience-status">Terms to compare with your source: {jdSignals.keywords.filter(word => !resumeSnapshotToText(originalResume).toLowerCase().includes(word.toLowerCase())).join(', ') || 'The detected terms also appear in your source.'} These text checks do not verify qualifications.</p>}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                          { label: 'Role', value: applicationData.jobTitle.trim() || jdSignals.role },
                          { label: 'Company', value: applicationData.companyName.trim() || jdSignals.company },
                          { label: 'Seniority', value: jdSignals.seniority },
                          { label: 'Detail', value: `${jdSignals.wordCount} words` },
                        ].map(signal => (
                          <div key={signal.label} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-3 min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">{signal.label}</p>
                            <p className="text-[12px] text-[var(--text-primary)] font-medium mt-1 truncate">{signal.value}</p>
                          </div>
                        ))}
                      </div>

                      {jdSignals.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {jdSignals.keywords.map(keyword => (
                            <span key={keyword} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--accent-dim)] border border-[var(--border-subtle)] text-[var(--accent)]">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </ResumeDocumentWorkspace>
              </motion.div>
            )}
            {step === 'morph' && (
              <motion.div className="resume-studio-stage resume-studio-shape-stage" key="morph" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ResumeDocumentWorkspace templateName={selectedTemplate.name} preview={displayResume ? <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} design={currentDesign} /> : <div className="experience-notice"><p>Upload and confirm a resume to see your document here.</p><button type="button" onClick={() => navigateSection('source')}>Upload resume</button></div>}>
                  {(!originalResume || !hasResumeData(originalResume) || showSourceConfirmation || !jobDescription.trim()) && <aside className="experience-notice"><strong>Before running AI</strong><p>Confirm a readable resume and add the full job description. Your settings remain here while you move between sections.</p><div className="experience-actions"><button type="button" onClick={() => navigateSection('source')}>Upload &amp; Diagnose</button><button type="button" onClick={() => navigateSection('target')}>Job Description</button></div></aside>}

                    <section className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Optimization</p>
                          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mt-1">Choose the rewrite strength</h3>
                        </div>
                        <span className="text-[12px] text-[var(--text-muted)]">{morphPercentage}%</span>
                      </div>
                      <div className="space-y-2">
                        {optimizationModes.map(modeOption => {
                          const isSelected = morphPercentage === modeOption.value;
                          return (
                            <button
                              key={modeOption.id}
                              onClick={() => {
                                if (modeOption.value !== morphPercentage) invalidateTailoredResult();
                                setMorphPercentage(modeOption.value);
                              }}
                              className={`w-full text-left p-3 rounded-[12px] border transition-all ${
                                isSelected
                                  ? 'bg-[var(--accent-dim)] border-[var(--accent)]'
                                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{modeOption.label}</p>
                                {isSelected && <span className="material-symbols-rounded text-[16px] text-[var(--accent)]">check_circle</span>}
                              </div>
                              <p className="text-[11px] text-[var(--text-secondary)] mt-1">{modeOption.detail}</p>
                            </button>
                          );
                        })}
                      </div>

                      <p className="experience-status">Percentage controls rewrite intensity. It is not a fit score or a promise about how many words will change.</p>
                      <details className="mt-4 group" open>
                        <summary className="list-none cursor-pointer flex items-center justify-between text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                          Advanced intensity
                          <span className="material-symbols-rounded text-[16px] group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="mt-3">
                          <input
                            type="range"
                            data-guide="resume-strength"
                            min="25"
                            max={maxMorphPercentage}
                            value={morphPercentage}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              invalidateTailoredResult();
                              setMorphPercentage(Math.min(val, maxMorphPercentage));
                            }}
                            aria-label="Rewrite intensity percentage" className="w-full accent-[var(--accent)]"
                          />
                          <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-1">
                            <span>Light</span>
                            <span>Balanced</span>
                            <span>Maximum</span>
                          </div>
                        </div>
                      </details>

                      {!morphConsent.unlocked100 && (
                        <div className="mt-3 rounded-[12px] border p-3 border-[color-mix(in_srgb,var(--warning)_20%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-rounded icon-status-warning text-[17px] mt-0.5">lock</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-[var(--text-primary)]">100% Morph is locked</p>
                              <p className="text-[11px] mt-1 leading-relaxed text-[var(--text-secondary)]">
                                Resume Morph is capped at {RESUME_MORPH_DEFAULT_MAX}% until you unlock maximum strength in Settings. Education and other protected facts stay locked either way.
                              </p>
                              <button
                                type="button"
                                onClick={() => router.push('/suite/settings?tab=ai-safety')}
                                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--border)]"
                              >
                                <span className="material-symbols-rounded text-[15px]">settings</span>
                                Open AI Safety settings
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {morphConsent.unlocked100 && morphPercentage === RESUME_MORPH_FULL_UNLOCK && (
                        <div className="mt-3 rounded-[12px] border p-3 border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]">
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-rounded icon-status-success text-[17px] mt-0.5">verified_user</span>
                            <div>
                              <p className="text-[12px] font-semibold text-[var(--text-primary)]">Maximum rewrite, truth locks still on</p>
                              <p className="text-[11px] mt-1 leading-relaxed text-[var(--text-secondary)]">
                                The system can rewrite more aggressively, but schools, degrees, credentials, employers, titles, dates, and contact fields are restored from your source resume.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-5">
                        <p className="text-[12px] font-semibold text-[var(--text-primary)] mb-2">Target length</p>
                        <div className="grid grid-cols-3 gap-2">
                        {(['auto', 1, 2] as const).map((pc) => (
                          <button
                            key={pc}
                            onClick={() => { if (pc !== targetPageCount) invalidateTailoredResult(); setTargetPageCount(pc); }}
                            className={`py-2 rounded-[10px] text-[12px] font-medium border transition-all ${targetPageCount === pc
                              ? 'bg-[var(--text-primary)] text-[var(--bg-deep)] border-[var(--text-primary)]'
                              : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                            }`}
                          >
                            {pc === 'auto' ? 'Auto' : `${pc} Page${pc > 1 ? 's' : ''}`}
                          </button>
                        ))}
                        </div>
                      </div>

                      <button
                        data-guide="resume-generate" onClick={handleMorph}
                        disabled={isolatedPreview || isLoading || !originalResume || !hasResumeData(originalResume) || showSourceConfirmation || !jobDescription.trim() || morphConsentLoading}
                        aria-describedby={isolatedPreview ? 'resume-preview-ai-notice' : undefined}
                        className={`w-full mt-5 py-3.5 rounded-[12px] font-semibold text-sm transition-all text-center ${
                          isolatedPreview || !jobDescription.trim() || morphConsentLoading
                            ? 'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                            : 'bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90'
                        }`}
                      >
                        {isolatedPreview ? 'AI rewrite unavailable in preview' : isLoading && processingStage ? 'Resume is still processing' : isLoading ? <><span className="material-symbols-rounded align-middle mr-1">psychology</span> Optimizing...</> : !jobDescription.trim() ? 'Paste a job description first' : morphConsentLoading ? 'Checking safety settings...' : 'Morph resume'}
                      </button>
                      {isLoading && !processingStage && <button type="button" className="resume-studio-header__secondary mt-3" onClick={cancelMorph}>Cancel Morph</button>}
                      {tailoringError && <p className="experience-notice mt-3" role="alert">{tailoringError}</p>}
                      <div className="experience-actions mt-3">
                        {morphedResume && documentOrigin === 'tailored' && <button type="button" disabled={isLoading} data-guide="resume-open-review" onClick={() => setStep('enhance')}>Review this rewrite</button>}
                        <button type="button" disabled={isLoading || !hasResumeData(originalResume) || showSourceConfirmation} onClick={skipTailoring}>Continue without AI tailoring</button>
                      </div>
                      {isolatedPreview && (
                        <p id="resume-preview-ai-notice" className="mt-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                          AI rewriting and blueprint generation are unavailable in this local preview. You can still edit your resume and choose a template.
                        </p>
                      )}
                      {isLoading && !processingStage && (
                        <div className="mt-3">
                          <AssistantThinkingTile
                            variant="resume"
                            icon="auto_fix_high"
                            title="Taco is morphing the resume"
                            description="Preserving facts, mapping proof to the JD, and checking ATS fit."
                            activeStage="optimizing"
                            stages={['Facts', 'Keywords', 'Proof', 'ATS']}
                            compact
                          />
                        </div>
                      )}
                    </section>
                  <details className="resume-workflow-library"><summary>Optional: first 90 days plan</summary><p className="experience-status">Create a talking plan from the confirmed source and target job. {!isPro && <span>{PAID_TEMPLATE_PLAN_LABEL} feature</span>}</p><button type="button" className="resume-studio-header__secondary" disabled={isolatedPreview || isBlueprintLoading || !originalResume || !jobDescription.trim() || isLoading} onClick={handleBlueprint}>{isBlueprintLoading ? 'Creating plan…' : 'Create Day-Zero Blueprint'}</button></details>
                </ResumeDocumentWorkspace>
              </motion.div>
            )}

            {/* Step 3: Resume Intelligence (Pro Only) */}

            {/* Step 4: Template Selection */}
            {step === 'template' && (
              <motion.div className="resume-studio-stage resume-studio-design-stage" key="template" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {displayResume ? (
                  <div className="space-y-5">
                    {designSourceNotice && <p className="experience-notice" role="status">{designSourceNotice}</p>}
                    <section className="experience-notice" aria-label="Taco Signature layout">
                      <h2 className="text-[18px] font-semibold">{isResumeFlagshipDesign(currentDesign) ? 'Taco Signature is active' : 'Try Taco Signature'}</h2>
                      <p className="mt-2">An editorial résumé with focused section controls, readable typography and a restrained section-label gutter. Your content stays with this document.</p>
                      <div className="experience-actions mt-3">
                        {isResumeFlagshipDesign(currentDesign)
                          ? <button type="button" onClick={() => changeDesign(switchResumeDesignTemplate(currentDesign!, selectedTemplate.id, normalizeResume(displayResume), keepDesignStyle))}>Use {selectedTemplate.name} layout</button>
                          : <button type="button" onClick={() => changeDesign(createResumeFlagshipDesign(normalizeResume(displayResume), currentDesign))}>Use Taco Signature</button>}
                      </div>
                    </section>
                    <div className="experience-actions"><label><input type="checkbox" checked={keepDesignStyle} onChange={event => setKeepDesignStyle(event.target.checked)} /> Keep my fonts, colors and spacing when changing templates</label></div>
                    {currentDesign && isResumeFlagshipDesign(currentDesign) ? <ResumeDesignWorkbench
                      key={`${user?.uid || 'guest'}:${documentVersionId || 'draft'}:${editorEpoch}:signature`}
                      resume={normalizeResume(displayResume)} value={currentDesign} onChange={changeDesign} title="Taco Signature" singleColumnComposition
                      onReset={() => createResumeFlagshipDesign(normalizeResume(displayResume), createResumeDesign(selectedTemplate.id, normalizeResume(displayResume), undefined, currentDesign.pageSize))}
                      onInspect={() => setStep('preview')}
                      personalStyles={commit => <details className="resume-workflow-library"><summary>Personal styles · save this look</summary><ResumeDesignStyles key={user?.uid || 'guest'} ownerId={user?.uid || null} resume={normalizeResume(displayResume)} value={currentDesign} onChange={commit} /></details>}
                      renderDocument={(selectedSectionId, onSelectSection) => <ResumeDesignPaper pageSize={currentDesign.pageSize}><ResumeFlagshipHTML resume={normalizeResume(displayResume)} design={currentDesign} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} /></ResumeDesignPaper>}
                    /> : currentDesign ? <div className="resume-design-workbench">
                      <div className="resume-design-workbench__controls"><ResumeDesignPanel resume={normalizeResume(displayResume)} value={currentDesign} onChange={changeDesign} onReset={() => changeDesign(createResumeDesign(selectedTemplate.id, normalizeResume(displayResume), selectedTemplateColors, pageSize))} onUseLegacy={() => { setDesignConfig(null); setPdfExportMode('designed'); }} /><details className="resume-workflow-library"><summary>Personal styles · save this look</summary><ResumeDesignStyles key={user?.uid || 'guest'} ownerId={user?.uid || null} resume={normalizeResume(displayResume)} value={currentDesign} onChange={changeDesign} /></details></div>
                      <aside className="resume-design-workbench__preview" aria-label="Live design preview"><div className="resume-design-workbench__preview-heading"><div><p className="experience-eyebrow">Live design</p><h2>{selectedTemplate.name}</h2></div><span>{currentDesign.pageSize}</span></div><div className="resume-design-workbench__paper"><ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} design={currentDesign} /></div><p className="experience-status">Changes appear here as you edit. Check the actual PDF pages before sending.</p><button type="button" className="resume-studio-header__secondary" onClick={() => setStep('preview')}>Inspect PDF pages &amp; export</button></aside>
                    </div> : <div className="experience-notice"><p>This document uses its original layout. Upgrade this draft to customize fonts, margins, sections and page flow.</p><button type="button" onClick={() => changeDesign(createResumeDesign(selectedTemplate.id, normalizeResume(displayResume), selectedTemplateColors, pageSize))}>Use customizable layout</button></div>}
                    <details className="resume-workflow-library" open={!currentDesign}><summary>Choose a template · {TEMPLATES.length} layouts</summary>
                    {isResumeFlagshipDesign(currentDesign) && <p className="experience-status">Choosing a template applies that template’s layout. Your content is retained.</p>}
                    <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                        <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Visual system</p>
                        <h2 className="text-[22px] font-semibold text-[var(--text-primary)] mt-1">Choose the format that fits the audience.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2">Your reviewed content stays fixed while you compare readable, ATS-conscious presentation systems.</p>
                        {ENABLE_RESUME_REVIEW_WORKBENCH && documentOrigin === 'tailored' && (
                          <button
                            type="button"
                            onClick={() => setStep('enhance')}
                            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                          >
                            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">arrow_back</span>
                            Review changes
                          </button>
                        )}
                        </div>
                        <div className="hidden grid grid-cols-3 gap-2 lg:min-w-[320px]">
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{TEMPLATES.length}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">Signature</p>
                          </div>
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{TEMPLATE_FILTERS.length - 1}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">Collections</p>
                          </div>
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{matchScore ? `${matchScore}%` : 'Ready'}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">Match</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[0.82fr_1.18fr] gap-6 items-stretch">
                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 xl:h-[986px] flex flex-col">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Template Menu</p>
                            <p className="text-[13px] font-semibold text-[var(--text-primary)] mt-1">{selectedTemplate.name}</p>
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)]">{filteredTemplates.length} formats</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {TEMPLATE_FILTERS.map(filter => (
                            <button
                              key={filter.id}
                              type="button"
                              onClick={() => setTemplateFilter(filter.id)}
                              className={`px-2.5 py-1.5 rounded-full border text-[11px] font-medium transition-all ${
                                templateFilter === filter.id
                                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
                          {filteredTemplates.map((template) => {
                            const isLocked = template.tier === 'pro' && !isPro;
                            const isSelected = selectedTemplate.id === template.id;
                            const recommended = recommendedTemplateIds.has(template.id);
                            const cardPaletteId = canUseTemplatePalettes
                              ? templatePaletteSelections[template.id] || (isSelected ? activePaletteId : getDefaultPaletteId(template.id))
                              : getDefaultPaletteId(template.id);
                            const cardPalette = getTemplatePalette(template, cardPaletteId);
                            const cardThumbnail = template.thumbnail;
                            const isCurated = NEW_SIGNATURE_TEMPLATE_IDS.includes(template.id as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number]);
                            return (
                              <div
                                key={template.id}
                                id={`resume-template-card-${template.id}`}
                                role="button"
                                aria-pressed={isSelected}
                                aria-disabled={isLocked}
                                tabIndex={0}
                                onClick={() => selectTemplate(template)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    selectTemplate(template);
                                  }
                                }}
                                className={`w-full p-3 rounded-[12px] border transition-all text-left relative overflow-hidden group ${
                                  isLocked
                                    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] opacity-70 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                                    : isSelected
                                      ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] cursor-pointer'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  {cardThumbnail ? (
                                    <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-[9px] border border-[var(--border-subtle)] bg-[var(--paper)]">
                                      <img src={cardThumbnail} alt="" className="h-full w-full object-cover object-top" />
                                    </div>
                                  ) : isCurated ? (
                                    <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-[9px] border border-[var(--border-subtle)] bg-[var(--paper)]">
                                      <CuratedTemplateMiniature template={{ ...template, colors: { ...template.colors, ...cardPalette.colors } }} />
                                    </div>
                                  ) : (
                                    <div
                                      className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 border"
                                      style={!isLocked ? { backgroundColor: `${cardPalette.colors.primary}14`, color: cardPalette.colors.primary, borderColor: `${cardPalette.colors.primary}28` } : {}}
                                    >
                                      <span className="material-symbols-rounded text-[20px]">{isLocked ? 'lock' : template.icon}</span>
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold text-[13px] leading-snug text-[var(--text-primary)] text-pretty">{template.name}</p>
                                        <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-1 text-pretty">{template.description}</p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {template.tier === 'pro' && <span className="text-[11px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--border-subtle)]">{PAID_TEMPLATE_PLAN_LABEL}</span>}
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-bold whitespace-nowrap">{template.atsClassification}</span>
                                        {recommended && <span className="text-[11px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--border-subtle)]">RECOMMENDED</span>}
                                      </div>
                                    </div>
                                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                                      <PaletteDots colors={cardPalette.colors} selected={isSelected} />
                                      <span className="ml-1 min-w-0 text-[11px] text-[var(--text-muted)]">
                                        <span className="font-medium text-[var(--text-secondary)]">{cardPalette.label}</span>
                                        {!canUseTemplatePalettes && <span> · {cardPalette.isDefault ? 'Included' : 'Max palette'}</span>}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 xl:sticky xl:top-6 xl:min-h-[986px]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Selected</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">{selectedTemplate.name}</h3>
                            <span className="text-[11px] px-1.5 py-0.5 rounded border font-bold bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--border-subtle)]">
                              {selectedTemplate.tier === 'pro' ? PAID_TEMPLATE_PLAN_LABEL : selectedTemplate.tier.toUpperCase()}
                            </span>
                            {recommendedTemplateIds.has(selectedTemplate.id) && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded border font-bold bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--border-subtle)]">
                                RECOMMENDED
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{selectedTemplate.description}</p>
                        </div>
                        <button onClick={() => setStep('preview')} className="hidden min-h-[44px] px-4 py-2.5 rounded-[12px] font-medium text-sm bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 transition-all whitespace-nowrap self-start sm:self-auto">
                          Export →
                        </button>
                      </div>

                      <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                        <div className="hidden mb-3 grid grid-cols-3 gap-2">
                          {[
                            { label: 'Preview', value: selectedExportProfile.preview },
                            { label: 'Export', value: selectedExportProfile.export },
                            { label: 'ATS', value: selectedExportProfile.ats },
                          ].map(item => (
                            <div key={item.label} className="rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                              <p className="text-[11px] font-semibold text-[var(--text-primary)] mt-0.5 truncate">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mb-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Palette</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  canUseTemplatePalettes
                                    ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]'
                                }`}>
                                  {canUseTemplatePalettes ? 'MAX ACTIVE' : 'MAX PALETTES'}
                                </span>
                              </div>
                              <p className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Choose a three-color set for this exact resume design.</p>
                            </div>
                            {!canUseTemplatePalettes && (
                              <button
                                type="button"
                                onClick={openMaxPaletteUpgrade}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-[10px] border border-[var(--accent)] bg-[var(--accent-dim)] px-3 text-[11px] font-semibold text-[var(--accent)] transition-all hover:opacity-90"
                              >
                                <span className="material-symbols-rounded text-[15px]">workspace_premium</span>
                                Unlock Max
                              </button>
                            )}
                          </div>

                          <div className="relative mt-3">
                            <button
                              type="button"
                              aria-haspopup="listbox"
                              aria-expanded={showPaletteMenu}
                              onClick={() => setShowPaletteMenu(open => !open)}
                              className="flex w-full min-w-0 min-h-[44px] items-center justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2.5 text-left transition-all hover:border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <PaletteDots colors={selectedPalette.colors} selected size="md" />
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</span>
                                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{selectedPalette.isDefault ? 'Included palette' : 'Max palette'} · Choose palette</span>
                                </span>
                              </span>
                              <span className="material-symbols-rounded shrink-0 text-[18px] text-[var(--text-muted)]">
                                {showPaletteMenu ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                              </span>
                            </button>

                            <AnimatePresence>
                              {showPaletteMenu && (
                                <motion.div
                                  initial={{ opacity: 0, y: -6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -6 }}
                                  transition={{ duration: 0.16 }}
                                  className="elevation-raised absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[320px] overflow-y-auto rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2"
                                  role="listbox"
                                  aria-label={`${selectedTemplate.name} palette choices`}
                                >
                                  {getTemplatePalettes(selectedTemplate).map(palette => {
                                    const paletteSelected = activePaletteId === palette.id;
                                    const paletteLocked = !palette.isDefault && !canUseTemplatePalettes;
                                    return (
                                      <button
                                        key={palette.id}
                                        type="button"
                                        role="option"
                                        aria-selected={paletteSelected}
                                        aria-label={`${selectedTemplate.name} ${palette.label} palette${paletteLocked ? ', Talent Max' : ''}`}
                                        onClick={() => selectTemplatePalette(selectedTemplate, palette)}
                                        className={`flex w-full min-w-0 min-h-[44px] items-center gap-2.5 rounded-[11px] border px-2.5 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                                          paletteSelected
                                            ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                                            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                                        }`}
                                      >
                                        <PaletteDots colors={palette.colors} selected={paletteSelected} locked={paletteLocked} size="md" />
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{palette.label}</span>
                                          <span className="block truncate text-[11px] text-[var(--text-muted)]">{palette.isDefault ? 'Included' : canUseTemplatePalettes ? 'Max palette' : 'Max locked'}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="relative max-h-[720px] overflow-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-deep)] p-2 sm:p-4">
                          <ResponsiveResumePreview
                            key={selectedTemplate.id}
                            resume={displayResume}
                            template={selectedTemplateWithPalette}
                            design={currentDesign}
                          />
                        </div>

                        <button
                          onClick={() => setStep('preview')}
                          className="mt-3 w-full min-h-[44px] py-2.5 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all"
                        >
                          Open full-size preview
                        </button>
                      </div>
                    </div>
                    </div>
                    </details>

                    {morphProofReport && <details className="experience-source-comparison"><summary>Source comparison and role coverage</summary><p className="experience-status">These checks compare this document with its source. They do not verify credentials or predict hiring outcomes.</p><ProofEngineReport report={morphProofReport} /></details>}

                    <details className="group elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                      <summary className="list-none cursor-pointer p-5 flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="icon-shell-neutral w-10 h-10 rounded-[11px] border flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-rounded text-[20px]">tune</span>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Template and keyword details</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">ATS proof, template reasoning, and export context when you want the deeper read.</p>
                          </div>
                        </div>
                        <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)] group-open:rotate-180 transition-transform">expand_more</span>
                      </summary>
                      <div className="px-5 pb-5 grid lg:grid-cols-[0.95fr_1.05fr] gap-4">
                        {proofData ? (
                          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[12px] font-semibold text-[var(--text-primary)]">TF-IDF proof summary</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
                                  Deterministic keyword similarity improved from source to optimized resume.
                                </p>
                              </div>
                              <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold border-[color-mix(in_srgb,var(--success)_20%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]">
                                +{proofData.delta} pts
                              </span>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                              {[
                                { label: 'Source', value: proofData.baselineScore },
                                { label: 'Optimized', value: proofData.optimizedScore },
                                { label: 'Gaps closed', value: proofData.gapsClosed.length },
                              ].map(item => (
                                <div key={item.label} className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                                  <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                                  <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{item.value}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {proofData.topJDTerms.slice(0, 8).map(term => (
                                <span
                                  key={`${term.term}-${term.matchedIn}`}
                                  className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
                                    term.matchedIn === 'both'
                                      ? 'border-[color-mix(in_srgb,var(--success)_18%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]'
                                      : term.matchedIn === 'morphed_only'
                                        ? 'border-[var(--border-subtle)] bg-[var(--accent-dim)] text-[var(--accent)]'
                                        : 'border-[color-mix(in_srgb,var(--warning)_18%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] text-[var(--warning)]'
                                  }`}
                                >
                                  {term.term}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)]">ATS Proof Engine</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">Run optimization or Resume Intelligence to see TF-IDF match proof, gaps closed, and keyword coverage here.</p>
                          </div>
                        )}
                        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Why This Template Fits</p>
                          <div className="mt-4 grid sm:grid-cols-3 gap-2">
                            {[
                              { label: 'Audience', value: selectedExportProfile.audience },
                              { label: 'Match', value: matchScore ? `${matchScore}%` : 'Not assessed' },
                              { label: 'Export', value: 'PDF + Word' },
                            ].map(item => (
                              <div key={item.label} className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                                <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                                <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 space-y-2">
                            {selectedExportProfile.notes.map(item => (
                              <div key={item} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                                <span className="material-symbols-rounded icon-status-success text-[14px] mt-0.5">check_circle</span>
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div><p className="experience-notice">Browse templates now. These previews use sample content until you confirm your resume.</p><ResumeTemplateBrowser selectedTemplateId={selectedTemplate.id} hasProAccess={isPro} loadingAccess={tierLoading} onSelect={templateId => { const template = TEMPLATES.find(item => item.id === templateId); if (template) selectTemplate(template); }} /></div>
                )}
              </motion.div>
            )}

            {/* Step 4: Preview */}
            {step === 'preview' && (
              <motion.div className="resume-studio-stage resume-studio-ship-stage" key="preview" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {displayResume ? (
                  <div className="grid lg:grid-cols-3 gap-6">
                    <div className="space-y-4">
                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Step 5 · Export & Save</p>
                        <h3 className="text-[19px] font-semibold text-[var(--text-primary)] mt-1">Check your resume, then keep it.</h3>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-2 mb-4">Designed PDF preserves the layout. Editable Word uses a simpler reading order. Saving and application tracking are separate actions.</p>
                        <label className="experience-page-size">Page size<select value={pageSize} onChange={event => setPageSize(event.target.value as 'A4' | 'LETTER')}><option value="A4">A4 · 210 × 297 mm</option><option value="LETTER">US Letter · 8.5 × 11 in</option></select></label>

                        {currentDesign && <label className="experience-page-size">PDF format<select value={pdfExportMode} onChange={event => setPdfExportMode(event.target.value as 'designed' | 'application')}><option value="designed">Designed PDF · selected layout</option><option value="application">Application PDF · single column</option></select></label>}
                        {currentDesign && <p className="experience-status">Application PDFs use white paper and readable inks. Word is a linear companion on white paper and uses installed font substitutes. Preview the PDF to check exact pages.</p>}

                        {/* Free-tier usage counter */}
                        {!isPro && user && caps?.morphs != null && (
                          <div className="mb-3 px-3 py-2 rounded-[10px] flex items-center gap-2 border border-[color-mix(in_srgb,var(--warning)_15%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
                            <span className="material-symbols-rounded icon-status-warning text-[16px]">token</span>
                            <span className="text-xs text-[var(--text-secondary)]">{remaining('morphs')} of {caps.morphs} free uses left</span>
                          </div>
                        )}
                        {!user && (
                          <div className="mb-3 px-3 py-2 rounded-[10px] flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                            <span className="material-symbols-rounded text-[16px] text-[var(--text-secondary)]">lock_open</span>
                            <span className="text-xs text-[var(--text-secondary)]">Sign in to download your resume</span>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-2">
                            <button onClick={downloadPDF} disabled={isExporting || candidateOutdated || pendingGeneratedReview || showSourceConfirmation || (isResumeFlagshipDesign(currentDesign) && reviewedPdfSignature !== resumeDesignSignature(exportCandidate, selectedTemplate.id, selectedTemplateColors, pageSize, currentDesign, pdfExportMode))} className="w-full min-h-[44px] py-3 rounded-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 transition-all disabled:opacity-50 text-sm">
                              {isExporting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">description</span> Download PDF</>}
                            </button>
                            <button onClick={downloadWord} disabled={isExporting || candidateOutdated || pendingGeneratedReview || showSourceConfirmation} className="w-full min-h-[44px] py-3 rounded-[12px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-50 text-sm">
                              {isExporting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">edit_document</span> Download Word</>}
                            </button>
                          </div>
                          {isResumeFlagshipDesign(currentDesign) && <p className="experience-status">Build the PDF preview below to enable download of those exact pages.</p>}
                          <button type="button" onClick={() => void saveVersionOnly()} disabled={isSaving || candidateOutdated || pendingGeneratedReview || showSourceConfirmation} className="w-full min-h-[44px] py-3 rounded-[12px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] disabled:opacity-50">
                            {isSaving ? 'Saving…' : saveInlineStatus?.type === 'success' ? 'Saved to your account' : 'Save resume'}
                          </button>
                          <details className="resume-workflow-library"><summary>Optional: track this application</summary><button type="button" onClick={event => { saveModalTriggerRef.current = event.currentTarget; setSaveCompanyName(applicationData.companyName); setSaveVersionName(documentName); setShowSaveModal(true); }} className="min-h-[44px] px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] text-sm">Track Application</button></details>
                          {saveInlineStatus && (
                            <div className={`rounded-[10px] border px-3 py-2 text-[11px] leading-relaxed ${
                              saveInlineStatus.type === 'success'
                                ? 'border-[color-mix(in_srgb,var(--success)_18%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] text-[var(--success)]'
                                : 'border-[color-mix(in_srgb,var(--danger)_18%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)] text-[var(--danger)]'
                            }`}>
                              {saveInlineStatus.message}
                            </div>
                          )}
                        </div>
                      </div>


                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Export readiness</p>
                            <h4 className="text-[14px] font-semibold text-[var(--text-primary)] mt-1">Final checks</h4>
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)]">{exportReadiness.filter(item => item.ready).length}/{exportReadiness.length}</span>
                        </div>
                        <div className="space-y-2">
                          {exportReadiness.map(item => (
                            <div key={item.label} className="resume-ship-readiness__item flex items-center gap-3 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                              <span className={`material-symbols-rounded text-[17px] ${item.ready ? 'icon-status-success' : 'icon-status-warning'}`}>{item.ready ? 'check_circle' : item.icon}</span>
                              <span className="text-[12px] text-[var(--text-secondary)]">{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {matchScore != null && matchScore > 0 && (
                        <div className="elevation-card rounded-[16px] bg-[var(--bg-surface)] border p-5 border-[color-mix(in_srgb,var(--success)_15%,transparent)]">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-[12px] flex items-center justify-center border border-[color-mix(in_srgb,var(--success)_15%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]">
                              <span className="text-lg font-semibold text-[var(--success)]">{matchScore}%</span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-[var(--text-primary)]">Role match</h4>
                              <div className="h-2 w-32 bg-[var(--bg-card)] rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-[var(--success)] rounded-full" style={{ width: `${matchScore}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <h4 className="font-semibold text-[var(--text-primary)] mb-2">{isResumeFlagshipDesign(currentDesign) ? 'Taco Signature' : selectedTemplate.name}</h4>
                        <p className="text-xs text-[var(--text-secondary)]">{isResumeFlagshipDesign(currentDesign) ? 'Editorial hierarchy, section labels and one sequence of candidate content.' : selectedTemplate.description}</p>
                      </div>
                    </div>

                    <div className="min-w-0 lg:col-span-2">
                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        {canPreviewExport && exportCandidate ? <ResumeExportPreview resume={normalizeResume(exportCandidate)} templateId={selectedTemplate.id} colors={selectedTemplateColors} pageSize={pageSize} design={currentDesign} mode={currentDesign ? pdfExportMode : 'designed'} onArtifact={artifact => {
                          pdfArtifactRef.current = artifact ? { ...artifact, signature: resumeDesignSignature(exportCandidate, selectedTemplate.id, selectedTemplateColors, pageSize, currentDesign, currentDesign ? pdfExportMode : 'designed') } : null;
                          setReviewedPdfSignature(pdfArtifactRef.current?.signature || null);
                        }} /> : <div className="experience-notice"><p>{candidateOutdated ? 'Regenerate or restore the original inputs before exporting this previous version.' : pendingGeneratedReview ? 'Review the proposed changes before building an export preview.' : !user ? 'Sign in to build and download the PDF.' : 'Choose an available template to build the PDF.'}</p><button type="button" onClick={() => { if (candidateOutdated) navigateSection('shape'); else if (pendingGeneratedReview) setStep('enhance'); else if (!user) setShowDownloadAuth('signup'); else setStep('template'); }}>Continue</button></div>}
                        <details className="mt-4"><summary>Quick editing preview</summary><div ref={resumeRef}>
                          <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} design={currentDesign} />
                        </div></details>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-lg mx-auto text-center py-12">
                    <div className="elevation-card rounded-[20px] border p-8 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                      <span className="text-5xl block mb-4 icon-status-danger"><span className="material-symbols-rounded text-inherit align-middle">warning</span></span>
                      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Confirm your resume to export or save</h3><p className="text-[var(--text-secondary)] mb-4">Your template and settings are retained. Upload a resume or enter your facts first.</p>
                      <button onClick={() => navigateSection('source')} className="btn-primary min-h-[44px] px-6 py-3 rounded-[12px] font-bold">Upload &amp; Diagnose</button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        {/* Upgrade Modal */}
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onSuccess={() => {
            setShowUpgradeModal(false);
            showToast('Upgrade successful! Features unlocked.', 'celebration');
            // Hard reload to refresh user tier
            window.location.reload();
          }}
        />

        {/* Auth Gate Modal — appears when anonymous user tries to download */}
        {showDownloadAuth && (
          <AuthModal
            mode={showDownloadAuth}
            postAuthRedirect={null}
            onAuthSuccess={retainGuestDraftAfterSignIn}
            onClose={() => setShowDownloadAuth(null)}
            onSwitchMode={() => setShowDownloadAuth(showDownloadAuth === 'login' ? 'signup' : 'login')}
          />
        )}

        {/* Skill Gap Warning Modal */}
        <SkillGapWarningModal
          isOpen={showSkillGapModal}
          onClose={() => setShowSkillGapModal(false)}
          newSkills={detectedNewSkills}
          matchScore={lastMatchScore}
        />

        {/* Day-Zero Blueprint Modal */}
        <AnimatePresence>
          {showBlueprintModal && blueprintContent && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBlueprintModal(false)} className="fixed inset-0 z-50 bg-[var(--bg-deep)]/70" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="elevation-raised relative w-full max-w-2xl max-h-[85vh] rounded-[20px] overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                  {/* Header */}
                  <div className="relative p-6 border-b border-[var(--border-subtle)]">
                    <div className="relative flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]"><span className="material-symbols-rounded text-inherit align-middle">content_paste</span> Day-Zero Blueprint</h2>
                        <p className="text-sm mt-1 text-[var(--text-secondary)]">Your strategic &quot;First 90 Days&quot; proposal</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(blueprintContent);
                            showToast('Blueprint copied to clipboard!', 'content_paste');
                          }}
                          className="min-h-[44px] px-3 py-1.5 rounded-[10px] text-xs font-medium border transition-all border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)] hover:opacity-90"
                        >
                          Copy
                        </button>
                        <button onClick={() => setShowBlueprintModal(false)} className="w-11 h-11 rounded-full flex items-center justify-center transition-all bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"><span className="material-symbols-rounded">close</span></button>
                      </div>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="p-6 overflow-y-auto max-h-[65vh]">
                    <div className="prose prose-sm max-w-none">
                      {blueprintContent.split('\n').map((line, i) => {
                        if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-2 mb-3 text-[var(--text-primary)]">{line.slice(2)}</h1>;
                        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-4 mb-2 text-[var(--accent)]">{line.slice(3)}</h2>;
                        if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-4 mb-2 text-[var(--accent)]">{line.slice(4)}</h3>;
                        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold mt-2 text-[var(--text-primary)]">{line.slice(2, -2)}</p>;
                        if (line.startsWith('- ')) return <li key={i} className="ml-4 mb-1 list-disc text-[var(--text-secondary)]">{line.slice(2)}</li>;
                        if (line.trim() === '') return <div key={i} className="h-2" />;
                        return <p key={i} className="mb-1 text-[var(--text-secondary)]">{line}</p>;
                      })}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="p-4 border-t flex justify-between items-center border-[var(--border-subtle)] bg-[var(--bg-card)]">
                    <span className="text-[11px] text-[var(--text-muted)]">Generated by TalentConsulting.io</span>
                    <button onClick={() => setShowBlueprintModal(false)} className="min-h-[44px] px-4 py-2 rounded-[12px] text-sm font-medium border transition-all border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)] hover:opacity-90">
                      Done
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showApplicationModal && displayResume && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowApplicationModal(false)} className="fixed inset-0 bg-[var(--bg-deep)]/70 z-50" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="elevation-raised relative w-full max-w-lg rounded-[20px] overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                  <div className="relative p-8 text-center border-b border-[var(--border-subtle)]">
                    <div className="relative">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 bg-[color-mix(in_srgb,var(--success)_18%,transparent)] icon-status-success">
                        <span className="text-4xl"><span className="material-symbols-rounded text-inherit align-middle">my_location</span></span>
                      </motion.div>
                      <h2 className="text-2xl font-bold text-[var(--text-primary)]">Track this Application?</h2>
                      <p className="text-[var(--text-secondary)] mt-2">We'll save this morphed resume with your application</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Company Name *</label>
                      <input type="text" value={applicationData.companyName} onChange={(e) => setApplicationData(prev => ({ ...prev, companyName: e.target.value }))} placeholder="e.g., Google" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Job Title</label>
                      <input type="text" value={applicationData.jobTitle} onChange={(e) => setApplicationData(prev => ({ ...prev, jobTitle: e.target.value }))} placeholder={displayResume.title || 'Position'} className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                    </div>
                  </div>
                  <div className="p-6 pt-0 flex gap-3">
                    <button onClick={() => { setShowApplicationModal(false); setStep('preview'); }} className="flex-1 min-h-[44px] px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors font-medium">Skip & Preview Resume</button>
                    <button onClick={handleCreateApplication} disabled={isLoading || !applicationData.companyName.trim()} className="btn-primary flex-1 min-h-[44px] px-4 py-3 rounded-[12px] font-bold disabled:opacity-50">
                      {isLoading ? 'Creating...' : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">my_location</span> Track Application</>}
                    </button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Save Modal */}
        <AnimatePresence>
          {showSaveModal && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!isSaving) { setShowSaveModal(false); setSaveVersionName(''); setSaveCompanyName(''); }}} className="fixed inset-0 bg-[var(--bg-deep)]/70 z-50" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} role="dialog" tabIndex={-1} aria-modal="true" aria-label="Save and track application" className="elevation-raised relative w-full max-w-md rounded-[20px] overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]">
                  {saveSuccess ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-12 text-center">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }} className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--success)_18%,transparent)] border-2 border-[var(--success)] icon-status-success">
                        <span className="text-4xl"><span className="material-symbols-rounded text-inherit align-middle">check_circle</span></span>
                      </motion.div>
                      <h3 className="text-xl font-bold text-[var(--text-primary)]">Saved & Tracked!</h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-2">Resume saved for <span className="text-[var(--accent)] font-semibold">{saveCompanyName}</span></p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">View in Applications tab →</p>
                    </motion.div>
                  ) : (
                    <>
                      <div className="relative p-6 border-b border-[var(--border-subtle)]">
                        <div className="relative flex items-center gap-4">
                          <div className="w-12 h-12 rounded-[12px] flex items-center justify-center bg-[var(--accent-dim)] border border-[var(--border-subtle)] text-[var(--accent)]"><span className="text-2xl"><span className="material-symbols-rounded text-inherit align-middle">save</span></span></div>
                          <div><h3 className="text-xl font-bold text-[var(--text-primary)]">Save & Track</h3><p className="text-sm text-[var(--text-secondary)]">Save this resume and track the application</p></div>
                        </div>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Company Name <span className="text-[var(--danger)]">*</span></label>
                          <input aria-label="Company name for tracking" disabled={isSaving} type="text" value={saveCompanyName} onChange={(e) => setSaveCompanyName(e.target.value)} placeholder="e.g., Google, Meta, Stripe" autoFocus className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Resume Version Name</label>
                          <input aria-label="Resume version name for tracking" disabled={isSaving} type="text" value={saveVersionName} onChange={(e) => setSaveVersionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveCompanyName.trim() && saveVersionName.trim()) confirmSave(); }} placeholder="e.g., Senior PM Resume" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div className="rounded-[12px] p-3 border border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                          <p className="text-xs text-[var(--text-secondary)]"><span className="material-symbols-rounded text-inherit align-middle text-[var(--accent)]">lightbulb</span> This will save your resume <strong>and</strong> create an application entry you can track in the Applications tab.</p>
                        </div>
                      </div>
                      {trackingError && <p role="alert" className="px-6 pb-3 text-sm text-[var(--warning)]">{trackingError}</p>}
                      <div className="p-6 pt-0 flex gap-3">
                        <button onClick={() => { setShowSaveModal(false); setSaveVersionName(''); setSaveCompanyName(''); }} disabled={isSaving} className="flex-1 min-h-[44px] px-4 py-3 rounded-[12px] font-medium transition-colors border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Cancel</button>
                        <button onClick={confirmSave} disabled={!saveCompanyName.trim() || isSaving} className="btn-primary flex-1 min-h-[44px] px-4 py-3 rounded-[12px] font-bold transition-all disabled:opacity-50">
                          {isSaving ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1 animate-spin">hourglass_top</span> Saving...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">save</span> {trackingError ? 'Retry tracking' : 'Save & Track'}</>}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>
      </SuiteToolShell>
    );
  }

  // Fallback
  return null;
}

// ============ RESUME TEMPLATE COMPONENT ============
// Delegates to the extracted ATS-safe templates in components/resume-templates/
function ResumeTemplate({ resume, template, design }: { resume: ResumeData; template: typeof TEMPLATES[0]; design?: ResumeDesignConfig }) {
  // Normalize to canonical format before rendering — guarantees {category, items} skills etc.
  const normalized = normalizeResume(resume);
  return (
    <ResumeTemplateComponent
      resume={normalized}
      templateId={template.id}
      colors={template.colors}
      design={design}
    />
  );
}

const MemoizedResumeTemplate = memo(ResumeTemplate);

function ResponsiveResumePreview({
  resume,
  template,
  design,
}: {
  resume: ResumeData;
  template: typeof TEMPLATES[0];
  design?: ResumeDesignConfig;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [previewMetrics, setPreviewMetrics] = useState({ scale: 1, height: 1123 });
  const designWidth = design?.pageSize === 'LETTER' ? 816 : 794;
  const designHeight = design?.pageSize === 'LETTER' ? 1056 : 1123;

  useEffect(() => {
    const frame = frameRef.current;
    const documentNode = documentRef.current;
    if (!frame || !documentNode) return;

    const updateMetrics = () => {
      const scale = Math.min(1, frame.clientWidth / designWidth);
      const height = Math.max(designHeight, documentNode.scrollHeight) * scale;
      setPreviewMetrics(current => (
        Math.abs(current.scale - scale) < 0.001 && Math.abs(current.height - height) < 1
          ? current
          : { scale, height }
      ));
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(frame);
    observer.observe(documentNode);
    return () => observer.disconnect();
  }, [resume, template.id, template.colors.primary, template.colors.accent, template.colors.text, design, designWidth, designHeight]);

  return (
    <div
      ref={frameRef}
      className="elevation-raised mx-auto min-w-0 w-full max-w-[794px] overflow-hidden rounded-[10px] bg-[var(--paper)]"
      style={{ height: `${previewMetrics.height}px`, position: 'relative', maxWidth: designWidth }}
    >
      <div
        ref={documentRef}
        className="w-[794px]"
        style={{
          width: designWidth,
          left: 0,
          position: 'absolute',
          top: 0,
          zoom: previewMetrics.scale,
        }}
      >
        <MemoizedResumeTemplate resume={resume} template={template} design={design} />
      </div>
    </div>
  );
}
