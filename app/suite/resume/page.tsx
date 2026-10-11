'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { saveResumeVersion, getResumeVersions, createJobApplication, deleteResumeVersion, updateResumeVersion, type ResumeVersion } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import { downloadResumePDF } from '@/lib/pdf-templates';
import { cleanResumeText, isResumeTextMissing, normalizeResume, serializeResumeToText } from '@/lib/resume-normalizer';
import { canPersistPreparedResume, prepareResumeForExport } from '@/lib/resume-export-truth';
import { ResumeTemplate as ResumeTemplateComponent } from '@/components/resume-templates';
import { CuratedTemplateMiniature } from '@/components/resume-templates/curated';
import { getHeaderPreset } from '@/components/resume-templates/header-system';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  getDefaultPaletteId,
  getPersistedResumePaletteId,
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
import { mergeApplicationKitContext, resumeSnapshotToText } from '@/lib/application-kit';
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
import type { ResumeStudioStage } from '@/components/resume-studio/ResumeStudioProgress';
import { ResumeStudioHeader } from '@/components/resume-studio/ResumeStudioHeader';
import {
  DEFAULT_RESUME_REVIEW_STATE,
  sanitizeResumeReviewState,
  type ResumeReviewResume,
  type ResumeReviewState,
} from '@/lib/resume-review-ledger';
import '@/components/resume-studio/resume-review-workbench.css';
import '@/components/resume-studio/resume-source-console.css';
import '@/components/resume-studio/resume-studio-system.css';

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
  return !!(resume.name || resume.summary || resume.experience?.length || resume.education?.length);
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

// ============ MAIN COMPONENT ============
export default function LiquidResumePage() {
  const { user } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const isReviewDemo = process.env.NODE_ENV !== 'production' && searchParams.get('reviewDemo') === '1';
  const isSourceConfirmDemo = process.env.NODE_ENV !== 'production' && searchParams.get('sourceConfirmDemo') === '1';
  const resumeRef = useRef<HTMLDivElement>(null);
  const mobileCheckFocusHandledRef = useRef(false);
  const templateDeepLinkHandledRef = useRef(false);
  const draftRestoreHandledRef = useRef(false);
  const reviewDemoWasActiveRef = useRef(false);

  // ===== STATE =====
  const [mode, setMode] = useState<'choose' | 'morph' | 'create'>('choose');
  const [step, setStep] = useState<'upload' | 'jd' | 'enhance' | 'template' | 'preview'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [invalidDocumentError, setInvalidDocumentError] = useState(false);

  // Resume data
  const [originalResume, setOriginalResume] = useState<ResumeData | null>(null);
  const [morphedResume, setMorphedResume] = useState<ResumeData | null>(null);
  const [buildResume, setBuildResume] = useState<ResumeData>({ ...EMPTY_RESUME });
  const [sourceResumeMeta, setSourceResumeMeta] = useState<{ fileName?: string; sourceType?: 'direct' | 'storage' | 'paste' | 'library'; storagePath?: string; characterCount?: number; detectedType?: string; storagePathDeleted?: boolean }>({});

  // Morph settings
  const [jobDescription, setJobDescription] = useState('');
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
    setSelectedPaletteId(palette.id);
    setTemplatePaletteSelections(prev => ({ ...prev, [template.id]: palette.id }));
    setShowPaletteMenu(false);
  };

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
      if (hasResumeData(morphedResume)) return normalizeResume(morphedResume) as ResumeData;
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

  // ===== SESSION PERSISTENCE =====
  // Persist in-progress work so navigating away doesn't lose progress
  const SESSION_KEY = 'talent-resume-draft';

  // Restore draft on mount
  useEffect(() => {
    if (tierLoading || draftRestoreHandledRef.current) return;
    draftRestoreHandledRef.current = true;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.originalResume) setOriginalResume(normalizeResume(draft.originalResume) as ResumeData);
      if (draft.morphedResume) setMorphedResume(normalizeResume(draft.morphedResume) as ResumeData);
      if (draft.sourceResumeMeta) setSourceResumeMeta(draft.sourceResumeMeta);
      if (draft.showSourceConfirmation) setShowSourceConfirmation(draft.showSourceConfirmation);
      if (draft.jobDescription) setJobDescription(draft.jobDescription);
      if (draft.postingUrl) setPostingUrl(draft.postingUrl);
      if (draft.morphPercentage) setMorphPercentage(draft.morphPercentage);
      if (draft.matchScore) setMatchScore(draft.matchScore);
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
    } catch { /* ignore corrupt storage */ }
  }, [isPro, searchParams, tierLoading]);

  useEffect(() => {
    if (!isSourceConfirmDemo) return;
    setOriginalResume({
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
    setOriginalResume(demoSource);
    setMorphedResume(demoCandidate);
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

  // Auto-save draft when key state changes
  useEffect(() => {
    // Don't save if user hasn't started anything
    if (isReviewDemo || isSourceConfirmDemo || reviewDemoWasActiveRef.current) return;
    if (mode === 'choose' && !originalResume && !buildResume?.name) return;
    try {
      const draft = {
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
        buildResume: mode === 'create' ? buildResume : undefined,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft));
      setDraftSaveState('saved');
      setDraftSavedAt(draft.savedAt);
    } catch {
      setDraftSaveState('error');
    }
  }, [originalResume, morphedResume, jobDescription, postingUrl, morphPercentage, matchScore, selectedTemplate, activePaletteId, templatePaletteSelections, sourceResumeMeta, showSourceConfirmation, mode, step, buildResume, resumeReview, isReviewDemo, isSourceConfirmDemo]);

  // Clear draft when workflow completes (save/download)
  const clearDraft = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  };

  const buildResumeVersionMetadata = (extra: Record<string, any> = {}) => {
    const resume = getDisplayResume();
    const isDirectUserSource = !hasResumeData(morphedResume) && (
      mode === 'create'
      || (Boolean(sourceResumeMeta.fileName) && sourceResumeMeta.sourceType !== 'library')
    );
    return {
      sourceFileName: sourceResumeMeta.fileName || null,
      sourceType: sourceResumeMeta.sourceType || (mode === 'create' ? 'manual' : null),
      storagePath: sourceResumeMeta.storagePath || null,
      parsedCharacterCount: sourceResumeMeta.characterCount || null,
      detectedType: sourceResumeMeta.detectedType || null,
      targetRole: applicationData.jobTitle || resume?.title || originalResume?.title || null,
      targetCompany: applicationData.companyName || saveCompanyName || null,
      matchScore,
      template: selectedTemplate.id,
      paletteId: activePaletteId,
      paletteLabel: selectedPalette.label,
      paletteColors: selectedPalette.colors,
      optimizationStrength: morphPercentage,
      targetPageCount,
      jobDescription: jobDescription ? jobDescription.slice(0, 30_000) : null,
      ...(isDirectUserSource ? {
        resumeProvenance: {
          verified: true,
          origin: mode === 'create' ? 'user_authored' : 'user_upload',
        },
      } : {}),
      ...extra,
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
    if (morphPercentage > maxMorphPercentage) {
      setMorphPercentage(maxMorphPercentage);
    }
  }, [maxMorphPercentage, morphPercentage]);

  // ===== DATA LOADING =====
  const loadVersions = async () => {
    // Guard: don't hit Firestore without authentication
    if (!user) return;
    const result = await getResumeVersions();
    if (result.success && result.data) setVersions(result.data);
  };

  // ===== AI FUNCTIONS =====
  const parseResumeWithAI = async (text: string): Promise<ResumeData> => {
    const res = await authFetch('/api/resume/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Parse failed' }));
      if (err.requiresAuth) { setShowDownloadAuth('signup'); throw new Error('Sign in to continue'); }
      throw new Error(err.error || 'Failed to parse resume');
    }
    const data = await res.json();
    return normalizeResume(data.resume) as ResumeData;
  };

  const morphResumeToJD = async (resume: ResumeData, jd: string, percentage: number, pageCount: number | 'auto'): Promise<{ morphed: ResumeData; score: number; proof?: ProofResult; guardrailReport?: any; effectiveMorphPercentage?: number }> => {
    const res = await authFetch('/api/resume/morph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobDescription: jd, morphPercentage: percentage, targetPageCount: pageCount }),
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
    setIsLoading(true);
    setInvalidDocumentError(false);
    setProcessingStage('extracting');
    try {
      setProcessingStage('parsing');
      showToast('Parsing resume with AI...', 'psychology');
      const parsed = await parseResumeWithAI(text);
      setOriginalResume(parsed);
      mergeApplicationKitContext({
        resumeSnapshot: parsed,
        resumeText: resumeSnapshotToText(parsed),
        resumeSource: sourceResumeMeta.sourceType === 'library' ? 'library' : 'resume_studio',
      });
      showToast('Resume parsed successfully!', 'check_circle');
      setShowSourceConfirmation(true);
      setStep('upload');
    } catch (error: any) {
      console.error('AI parsing error:', error);
      if (error.message?.includes('INVALID_DOCUMENT') || error.message?.includes('look like a resume')) {
        setInvalidDocumentError(true);
      } else {
        showToast(error.message || 'Failed to process resume with AI', 'cancel');
      }
    } finally {
      setIsLoading(false);
      setProcessingStage(null);
    }
  };

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

  // ── Day-Zero Blueprint ──
  const handleBlueprint = async () => {
    if (!originalResume || !jobDescription.trim()) return;
    setIsBlueprintLoading(true);
    try {
      showToast('Generating your Day-Zero Blueprint...', 'content_paste');
      const res = await authFetch('/api/resume/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: originalResume, jobDescription }),
      });
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
      setBlueprintContent(data.blueprint);
      setShowBlueprintModal(true);
      // Persist blueprint so it can be re-opened from Applications tracker
      try {
        const stored = JSON.parse(localStorage.getItem('tc_blueprints') || '[]');
        stored.unshift({
          id: `bp_${Date.now()}`,
          content: data.blueprint,
          targetRole: originalResume.title || '',
          createdAt: new Date().toISOString(),
        });
        const trimmed = stored.slice(0, 10);
        localStorage.setItem('tc_blueprints', JSON.stringify(trimmed));
      } catch {}
      showToast('Day-Zero Blueprint ready!', 'check_circle');
    } catch (error) {
      console.error('Blueprint error:', error);
      showToast('Failed to generate blueprint', 'cancel');
    } finally {
      setIsBlueprintLoading(false);
    }
  };

  const handleMorph = async () => {
    if (!originalResume || !jobDescription.trim()) return;
    setIsLoading(true);
    try {
      showToast(`Optimizing resume at ${morphPercentage}% strength...`, 'psychology');
      const { morphed, score, proof, guardrailReport: nextGuardrailReport, effectiveMorphPercentage } = await morphResumeToJD(originalResume, jobDescription, morphPercentage, targetPageCount);

      // CRITICAL: Always ensure we have valid data before proceeding
      const validResume = hasResumeData(morphed) ? morphed : originalResume;

      const preparedMorph = prepareResumeForExport({
        mode: 'morph',
        candidateResume: validResume,
        originalResume,
        requestedMorphPercentage: effectiveMorphPercentage || morphPercentage,
        hasFullConsent: morphConsent.unlocked100,
      });
      if (!preparedMorph.resume) throw new Error('The source resume could not be verified');
      const normalizedMorphed = preparedMorph.resume as ResumeData;
      setMorphedResume(normalizedMorphed);
      mergeApplicationKitContext({
        resumeSnapshot: normalizedMorphed,
        resumeText: resumeSnapshotToText(normalizedMorphed),
        resumeSource: 'resume_studio',
        jobDescription,
        targetRole: normalizedMorphed.title || originalResume.title || '',
        jobTitle: normalizedMorphed.title || originalResume.title || '',
      });
      setMatchScore(score);
      setProofData(proof || null);
      setGuardrailReport(nextGuardrailReport || null);
      // Clear stale enhance results from previous resume version
      setResumeCheckResult(null);
      setResumeReview({ ...DEFAULT_RESUME_REVIEW_STATE, decisions: {} });
      setDraftSaveState('idle');
      setStep(ENABLE_RESUME_REVIEW_WORKBENCH ? 'enhance' : isPro ? 'enhance' : 'template');
      showToast(`Resume optimized: ${score}% match · ${effectiveMorphPercentage || morphPercentage}% strength`, 'check_circle');
      analytics.toolUse('resume_morph');

      if (user && canPersistPreparedResume(preparedMorph)) {
        try {
          const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const autoSaveName = `${normalizedMorphed.title || normalizedMorphed.name || 'Optimized Resume'} — ${stamp}`;
          const autoSave = await saveResumeVersion(
            autoSaveName,
            normalizedMorphed as any,
            { matchScore: score, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage: effectiveMorphPercentage || morphPercentage, guardrailReport: nextGuardrailReport || null },
            'technical',
            buildResumeVersionMetadata({
              autoSaved: true,
              savedFrom: 'resume_studio_optimize',
              targetRole: applicationData.jobTitle || normalizedMorphed.title || originalResume.title || null,
              targetCompany: applicationData.companyName || saveCompanyName || null,
              matchScore: score,
              optimizationStrength: effectiveMorphPercentage || morphPercentage,
              guardrailReport: nextGuardrailReport || null,
            })
          );
          if (autoSave.success) loadVersions();
        } catch (saveErr) {
          console.warn('Auto-save optimized resume failed:', saveErr);
        }
      }

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
          localStorage.setItem('tc_skill_gaps', JSON.stringify({
            gaps: classified.map(c => ({ skill: c.skill, confidence: 'ai-added', category: c.category })),
            jdTitle: applicationData.jobTitle || 'Target Role',
            companyName: applicationData.companyName || '',
            timestamp: Date.now(),
          }));

          // Show warning modal after a brief delay
          setTimeout(() => setShowSkillGapModal(true), 800);
        }
      } catch (diffErr) {
        console.warn('Skill diff error (non-critical):', diffErr);
      }

      // Extract company name (non-blocking)
      try {
        if (!applicationData.companyName) {
          const company = await extractCompanyFromJD(jobDescription);
          if (company) setApplicationData(prev => ({ ...prev, companyName: company }));
        }
      } catch { /* non-critical */ }
    } catch (error) {
      console.error('Optimization error:', error);
      if ((error as any)?.requiresMorphConsent) {
        showToast('Unlock 100% Morph in Settings > AI Safety first.', 'lock');
        router.push('/suite/settings?tab=ai-safety');
      } else {
        showToast('Failed to optimize resume', 'cancel');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getPreparedOutboundResume = (actionLabel: string) => {
    const candidateResume = getDisplayResume();
    if (!candidateResume) return null;
    const prepared = prepareResumeForExport({
      mode,
      candidateResume,
      originalResume,
      requestedMorphPercentage: morphPercentage,
      hasFullConsent: morphConsent.unlocked100,
    });
    if (prepared.blockedReason === 'missing_source' || !prepared.resume) {
      showToast(`Taco cannot verify the source resume before ${actionLabel}. Re-upload it or choose a verified version.`, 'shield');
      setStep('upload');
      setActiveStart('upload');
      return null;
    }
    return prepared;
  };


  const saveVersionOnly = async () => {
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
    if (!requireEducationInstitutionBefore('saving', resume)) {
      setSaveInlineStatus({ type: 'error', message: 'Add the missing school name before saving this resume.' });
      return;
    }
    const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const versionName = `${resume.title || resume.name || 'Resume'} — ${stamp}`;
    setIsSaving(true);
    try {
      const result = await saveResumeVersion(
        versionName,
        resume as any,
        { matchScore, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage },
        'technical',
        buildResumeVersionMetadata({ savedFrom: 'resume_studio', targetRole: resume.title || null })
      );
      if (!result.success) throw new Error(result.error || 'Save failed');
      clearDraft();
      loadVersions();
      setSaveInlineStatus({ type: 'success', message: 'Saved to Resume Library. This version is now available across your tools.' });
      showToast('Resume version saved', 'check_circle');
    } catch (error: any) {
      setSaveInlineStatus({ type: 'error', message: error.message || 'Save failed. Please try again.' });
      showToast(error.message || 'Save failed', 'cancel');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSave = async () => {
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
    if (!requireEducationInstitutionBefore('Save & Track', resume)) return;
    setIsSaving(true);
    try {
      // 1. Save the resume version
      console.log('[Save & Track] Saving resume version:', versionName, 'for', saveCompanyName);
      const result = await saveResumeVersion(
        `${versionName} — ${saveCompanyName}`,
        resume as any,
        { matchScore, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage },
        'technical',
        buildResumeVersionMetadata({
          savedFrom: 'resume_studio_track_modal',
          targetCompany: saveCompanyName,
          targetRole: resume.title || versionName,
        })
      );
      if (!result.success) {
        console.error('[Save & Track] Save failed:', result.error);
        showToast(result.error || 'Save failed — check your connection', 'cancel');
        setIsSaving(false);
        return;
      }
      console.log('[Save & Track] Resume saved, creating application entry...');

      // 2. Auto-create an application entry
      const appResult = await createJobApplication({
        companyName: saveCompanyName,
        jobTitle: resume.title || versionName,
        jobDescription: jobDescription || undefined,
        resumeVersionId: result.data?.id,
        morphedResumeName: versionName,
        talentDensityScore: matchScore || undefined,
        applicationLink: postingUrl || undefined,
      });

      if (!appResult.success) {
        console.warn('[Save & Track] Application creation failed:', appResult.error);
        // Resume was saved, just the application entry failed — still proceed
        showToast(`Resume saved for ${saveCompanyName}! (Application tracking may need retry)`, 'check_circle');
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
        console.log('[Save & Track] Application created successfully');
        showToast(`Saved & tracked for ${saveCompanyName}!`, 'check_circle');
      }

      // 3. Show success state & clear draft
      clearDraft();
      setSaveSuccess(true);
      loadVersions();

      // Auto-close after brief visual confirmation
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveVersionName('');
        setSaveCompanyName('');
        setSaveSuccess(false);
      }, 1500);
    } catch (error: any) {
      console.error('[Save & Track] Unexpected error:', error);
      showToast(`Save failed: ${error.message || 'Unknown error — check console'}`, 'cancel');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateApplication = async () => {
    if (!applicationData.companyName.trim()) {
      showToast('Please enter a company name', 'cancel');
      return;
    }
    if (!user) {
      setShowDownloadAuth('signup');
      return;
    }
    setIsLoading(true);
    try {
      const prepared = getPreparedOutboundResume('application tracking');
      if (!prepared?.resume) {
        showToast('No resume data to track', 'cancel');
        return;
      }
      const resume = prepared.resume as ResumeData;
      if (!requireEducationInstitutionBefore('application tracking', resume)) return;
      const roleName = applicationData.jobTitle || resume.title || 'Position';
      const versionName = `${roleName} — ${applicationData.companyName.trim()}`;
      const savedResume = await saveResumeVersion(
        versionName,
        resume as any,
        { matchScore, template: selectedTemplate.id, paletteId: activePaletteId, paletteColors: selectedPalette.colors, morphPercentage },
        'technical',
        buildResumeVersionMetadata({
          savedFrom: 'resume_studio_application_modal',
          targetCompany: applicationData.companyName.trim(),
          targetRole: roleName,
        })
      );
      if (!savedResume.success) {
        showToast(savedResume.error || 'Resume could not be saved for tracking', 'cancel');
        return;
      }
      const result = await createJobApplication({
        companyName: applicationData.companyName.trim(),
        jobTitle: roleName,
        jobDescription: jobDescription || undefined,
        resumeVersionId: savedResume.data?.id,
        morphedResumeName: versionName,
        talentDensityScore: matchScore || undefined,
        applicationLink: postingUrl || undefined,
      });
      if (result.success) {
        if (savedResume.data?.id && result.data?.id) {
          updateResumeVersion(savedResume.data.id, {
            metadata: {
              ...(savedResume.data.metadata || {}),
              ...buildResumeVersionMetadata({
                savedFrom: 'resume_studio_application_modal',
                linkedApplicationId: result.data.id,
                targetCompany: applicationData.companyName.trim(),
                targetRole: roleName,
              }),
            },
          }).catch(err => console.warn('[Application] Failed to link application metadata:', err));
        }
        clearDraft();
        loadVersions();
        showToast('Resume saved and application tracked', 'check_circle');
        setShowApplicationModal(false);
        setApplicationData({ companyName: '', jobTitle: '', notes: '' });
      } else {
        showToast(result.error || 'Failed to create application', 'cancel');
      }
    } catch (error: any) {
      console.error('Application error:', error);
      showToast(`Failed: ${error.message || 'Unknown error'}`, 'cancel');
    } finally {
      setIsLoading(false);
    }
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

  const loadVersionToMorph = (version: ResumeVersion) => {
    if (tierLoading) {
      showToast('Your plan access is still loading. Try again in a moment.', 'hourglass_top');
      return;
    }
    setOriginalResume(normalizeResume(version.content) as ResumeData);
    const versionTemplateId = getPersistedResumeTemplateId(version);
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
    setSourceResumeMeta({
      fileName: version.version_name || 'Saved resume version',
      sourceType: 'library',
      detectedType: 'library',
    });
    setShowSourceConfirmation(false);
    setMode('morph');
    setStep('jd');
    showToast('Resume loaded!', 'check_circle');
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
      return;
    }

    // A school entered here is an explicit user-confirmed source correction.
    // Keep the source and candidate aligned so truth-lock validation preserves it.
    setOriginalResume(prev => applyUpdate(prev));
    if (hasResumeData(morphedResume)) {
      setMorphedResume(prev => applyUpdate(prev));
    }
  };

  const requireEducationInstitutionBefore = (actionLabel: string, resume = getDisplayResume()) => {
    const missingSchools = getMissingEducationInstitutions(resume);
    if (missingSchools.length === 0) return true;
    showToast(`Taco needs the school name before ${actionLabel}. Add it in the education check.`, 'school');
    setStep(mode === 'create' ? 'preview' : ENABLE_RESUME_REVIEW_WORKBENCH ? 'enhance' : isPro ? 'enhance' : 'template');
    return false;
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
    if (!requireEducationInstitutionBefore('PDF export', prepared.resume as ResumeData)) return;
    setIsLoading(true);
    try {
      await downloadResumePDF(prepared.resume, selectedTemplateColors, undefined, selectedTemplate.id);
      if (prepared.guardrailReport?.blockedChangeCount) {
        showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
      }
      showToast('PDF downloaded!', 'check_circle');
      analytics.resumeDownload('pdf');
      clearDraft();
    } catch (error: any) {
      console.error('PDF download error:', error);
      showToast(`PDF download failed: ${error.message || 'Unknown error'}`, 'cancel');
    }
    finally { setIsLoading(false); }
  };

  const downloadWord = async () => {
    // Gate: require sign-in before download
    if (!user) {
      setShowDownloadAuth('signup');
      return;
    }
    if (!requireSelectedTemplateEntitlementBefore('Word export')) return;
    const prepared = getPreparedOutboundResume('Word export');
    if (!prepared?.resume) return;
    const resume = prepared.resume as ResumeData;
    if (!requireEducationInstitutionBefore('Word export', resume)) return;
    setIsLoading(true);
    try {
    if (NEW_SIGNATURE_TEMPLATE_IDS.includes(selectedTemplate.id as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number])) {
      const { buildCuratedSignatureDocxBlob } = await import('@/lib/resume-signature-docx');
      const blob = await buildCuratedSignatureDocxBlob(normalizeResume(resume), selectedTemplate.id, {
        ...selectedTemplateColors,
        background: '#ffffff',
      });
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
      if (prepared.guardrailReport?.blockedChangeCount) {
        showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
      }
      showToast('Linear Word companion downloaded!', 'check_circle');
      analytics.resumeDownload('word');
      clearDraft();
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

      const doc = new DocxDocument({
        styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '333333' } } } },
        sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${resume.name?.replace(/\s+/g, '_') || 'resume'}.docx`);
    if (prepared.guardrailReport?.blockedChangeCount) {
      showToast(`Truth locks restored ${prepared.guardrailReport.blockedChangeCount} protected change${prepared.guardrailReport.blockedChangeCount === 1 ? '' : 's'} before export.`, 'verified_user');
    }
    showToast('Word document downloaded!', 'check_circle');
      analytics.resumeDownload('word');
      clearDraft();
    } catch (e) { console.error('Word download error:', e); showToast('Download failed', 'cancel'); }
    finally { setIsLoading(false); }
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


  // ===== RENDER: Mode Selection =====
  if (mode === 'choose') {
    return (
      <SuiteToolShell
        variant="editor"
        className="resume-source-shell resume-studio-system-shell"
        contentClassName="resume-source-shell__content"
      >
          <motion.main
            id="resume-source-console"
            className="resume-source-console"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          >
            <ResumeStudioHeader
              current="source"
              candidateName={originalResume?.name}
              candidateDetail={originalResume?.title || 'Choose or create a source'}
              targetLabel={originalResume?.title}
              saveLabel={draftSaveState === 'error' ? 'Save needs attention' : 'Saved locally'}
            />

            {!showSourceConfirmation && (
            <nav className="resume-source-console__modes" aria-label="Choose a resume source">
              {STARTING_POINTS.filter(point => ['upload', 'paste', 'scratch'].includes(point.id)).map(point => {
                const selected = activeStart === point.id;
                return (
                  <button
                    key={point.id}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? 'is-active' : undefined}
                    onClick={() => {
                      setActiveStart(point.id);
                      if (point.id === 'scratch') setMode('create');
                    }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">{point.icon}</span>
                    <span>{point.label.replace('Resume', '').trim()}</span>
                  </button>
                );
              })}
            </nav>
            )}

            <section className="resume-source-console__workspace" aria-live="polite">
              <AnimatePresence mode="wait">
                {showSourceConfirmation && originalResume ? (
                  <motion.section
                    key="source-confirmed"
                    className="resume-source-confirmation"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.24 }}
                    aria-labelledby="resume-source-confirmation-title"
                  >
                    <div className="resume-source-confirmation__top">
                      <div className="resume-source-confirmation__intro">
                        <span className="resume-source-confirmation__icon material-symbols-rounded" aria-hidden="true">task_alt</span>
                        <div>
                          <p>Resume source · verified</p>
                          <h2 id="resume-source-confirmation-title">Your source is clean and ready.</h2>
                          <span>We preserved the resume structure and found the core evidence we need. Confirm this source, then bring in the role you want to target.</span>
                        </div>
                      </div>
                      <div className="resume-source-confirmation__buttons">
                        <button
                          type="button"
                          className="resume-source-confirmation__replace"
                          onClick={() => {
                            setShowSourceConfirmation(false);
                            setOriginalResume(null);
                            setSourceResumeMeta({});
                            setSourcePasteText('');
                            setInvalidDocumentError(false);
                            setActiveStart('upload');
                          }}
                        >
                          <span className="material-symbols-rounded" aria-hidden="true">refresh</span>
                          Replace
                        </button>
                        <button
                          type="button"
                          className="resume-source-confirmation__continue"
                          onClick={() => {
                            setShowSourceConfirmation(false);
                            setMode('morph');
                            setStep('jd');
                          }}
                        >
                          Continue to Role Target
                          <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                        </button>
                      </div>
                    </div>

                    <div className="resume-source-confirmation__meta" aria-label="Imported resume details">
                      {[
                        { icon: 'description', label: 'Source', value: sourceResumeMeta.fileName || 'Resume source' },
                        { icon: 'data_object', label: 'Characters', value: sourceResumeMeta.characterCount ? sourceResumeMeta.characterCount.toLocaleString() : 'Parsed' },
                        { icon: 'cloud_done', label: 'Import method', value: sourceResumeMeta.sourceType === 'paste' ? 'Pasted text' : sourceResumeMeta.sourceType === 'storage' ? 'Secure upload' : 'Direct upload' },
                        { icon: 'verified', label: 'Detected', value: sourceResumeMeta.detectedType?.toUpperCase() || 'Resume' },
                      ].map(item => (
                        <div key={item.label} className="resume-source-confirmation__meta-item">
                          <span className="material-symbols-rounded" aria-hidden="true">{item.icon}</span>
                          <div>
                            <p>{item.label}</p>
                            <strong title={item.value}>{item.value}</strong>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="resume-source-confirmation__resume">
                      <div className="resume-source-confirmation__resume-heading">
                        <span className="material-symbols-rounded" aria-hidden="true">person</span>
                        <div>
                          <p>{originalResume.name || 'Imported resume'}</p>
                          <span>{originalResume.title || 'Target role pending'}</span>
                        </div>
                      </div>
                      <div className="resume-source-confirmation__skills" aria-label="Skills detected in resume">
                        {skillLabels(originalResume).slice(0, 8).map(skill => (
                          <span key={skill}>{skill}</span>
                        ))}
                      </div>
                    </div>

                    <div className="resume-source-confirmation__assurance">
                      <span><span className="material-symbols-rounded" aria-hidden="true">account_tree</span>Sections mapped</span>
                      <span><span className="material-symbols-rounded" aria-hidden="true">fact_check</span>Evidence retained</span>
                      <span><span className="material-symbols-rounded" aria-hidden="true">shield_lock</span>Ready for guarded morphing</span>
                    </div>
                  </motion.section>
                ) : invalidDocumentError ? (
                  <motion.section
                    key="source-invalid"
                    className="resume-source-error"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    aria-labelledby="resume-source-error-title"
                  >
                    <span className="resume-source-error__icon material-symbols-rounded" aria-hidden="true">scan_delete</span>
                    <div>
                      <p>Source needs attention</p>
                      <h2 id="resume-source-error-title">This doesn’t look like a complete resume.</h2>
                      <span>We couldn’t find enough recognizable experience, education, or skills to build a reliable source.</span>
                    </div>
                    <div className="resume-source-error__actions">
                      <button type="button" onClick={() => setInvalidDocumentError(false)}>Try another file</button>
                      <button
                        type="button"
                        onClick={() => {
                          setInvalidDocumentError(false);
                          setActiveStart('paste');
                        }}
                      >
                        Paste resume text
                      </button>
                    </div>
                  </motion.section>
                ) : activeStart === 'upload' ? (
                  <FileUploadDropzone
                    onUploadSuccess={(text, fileName, meta) => {
                      setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, storagePath: meta?.storagePath, characterCount: meta?.characterCount || text.trim().length, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted });
                      handleFileExtracted(text);
                    }}
                    uploadContext="studio"
                    isUploading={isLoading}
                    setIsUploading={(state) => {
                      setIsLoading(state);
                      if (state) setProcessingStage('uploading');
                    }}
                    processingStage={processingStage}
                    variant="arrival"
                  />
                ) : (
                  <div className="resume-source-console__paste">
                    <div className="resume-source-console__paste-copy">
                      <span className="material-symbols-rounded" aria-hidden="true">content_paste</span>
                      <div>
                        <h2>Paste your resume text</h2>
                        <p>Use the complete resume so roles, dates, skills, and proof stay connected.</p>
                      </div>
                    </div>
                    <textarea
                      value={sourcePasteText}
                      onChange={(event) => setSourcePasteText(event.target.value)}
                      rows={7}
                      placeholder="Paste your resume text here."
                      aria-label="Resume text"
                    />
                    <button
                      type="button"
                      disabled={sourcePasteText.trim().length < 40 || isLoading}
                      onClick={() => handleSourceConsolePaste(sourcePasteText.trim())}
                    >
                      Continue with pasted text
                      <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                    </button>
                  </div>
                )}
              </AnimatePresence>
            </section>

            {!showSourceConfirmation && !invalidDocumentError && (
            <section className="resume-source-console__recent" aria-labelledby="resume-recent-heading">
              <div className="resume-source-console__section-heading">
                <div>
                  <p>Resume vault</p>
                  <h2 id="resume-recent-heading">Recent resume versions</h2>
                </div>
                {versions.length > 0 && <span>{versions.length} saved</span>}
              </div>

              {versions.length > 0 ? (
                <div className="resume-source-console__table" role="table" aria-label="Recent resume versions">
                  <div className="resume-source-console__table-head" role="row">
                    <span role="columnheader">Name</span>
                    <span role="columnheader">Last modified</span>
                    <span role="columnheader">Role target</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">Actions</span>
                  </div>
                  {versions.slice(0, 4).map(version => (
                    <div className="resume-source-console__version" role="row" key={version.id}>
                      <button
                        type="button"
                        role="cell"
                        className="resume-source-console__version-name"
                        onClick={() => loadVersionToMorph(version)}
                      >
                        <span className="material-symbols-rounded" aria-hidden="true">description</span>
                        <span>{version.version_name}</span>
                      </button>
                      <span role="cell">
                        {new Date(version.updated_at || version.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span role="cell">{version.metadata?.targetRole || version.content?.personal?.title || 'General resume'}</span>
                      <span role="cell" className="resume-source-console__status">Saved locally</span>
                      <span role="cell" className="resume-source-console__actions">
                        <button type="button" onClick={() => loadVersionToMorph(version)} aria-label={`Open ${version.version_name}`}>
                          <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                        </button>
                        <button type="button" onClick={(event) => handleDeleteVersion(event, version.id)} aria-label={`Delete resume version ${version.version_name}`}>
                          <span className="material-symbols-rounded" aria-hidden="true">delete</span>
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="resume-source-console__empty">
                  <span className="material-symbols-rounded" aria-hidden="true">draft</span>
                  <div>
                    <h3>No recent resumes yet</h3>
                    <p>Upload, paste, or build to create your first saved version.</p>
                  </div>
                </div>
              )}
            </section>
            )}

            <footer className="resume-source-console__footer">
              <span><span className="material-symbols-rounded" aria-hidden="true">verified_user</span>Structure preserved</span>
              <span><span className="material-symbols-rounded" aria-hidden="true">sync_saved_locally</span>Draft saved locally</span>
              <span className="resume-source-console__privacy"><span className="material-symbols-rounded" aria-hidden="true">lock</span>Your files stay private on this device.</span>
            </footer>
          </motion.main>



          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteConfirmId && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirmId(null)} className="fixed inset-0 bg-[var(--bg-deep)]/70 z-50 transition-all" />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="elevation-raised w-full max-w-sm rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
                    <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">Delete Resume?</h3>
                    <p className="text-[12px] text-[var(--text-secondary)] mb-6">This action cannot be undone.</p>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setDeleteConfirmId(null)} className="min-h-[44px] px-4 py-2 rounded-[10px] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">Cancel</button>
                      <button onClick={confirmDelete} className="min-h-[44px] px-4 py-2 rounded-[10px] text-[12px] font-semibold text-[var(--danger)] transition-all bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)]">Delete</button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
      </SuiteToolShell>
    );
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
    const educationInstitutionGaps = getMissingEducationInstitutions(displayResume);
    const exportReadiness = [
      { label: 'Contact present', ready: Boolean(displayResume?.email || displayResume?.phone), icon: 'alternate_email' },
      { label: 'Summary present', ready: Boolean(displayResume?.summary), icon: 'notes' },
      { label: 'Experience entry', ready: Boolean(displayResume?.experience?.length), icon: 'work_history' },
      { label: 'School names verified', ready: educationInstitutionGaps.length === 0, icon: educationInstitutionGaps.length === 0 ? 'school' : 'priority_high' },
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
        <ResumeReviewWorkbench
          sourceResume={originalResume as ResumeReviewResume | null}
          candidateResume={morphedResume as ResumeReviewResume | null}
          reviewState={resumeReview}
          onReviewStateChange={(nextReviewState) => {
            setDraftSaveState('idle');
            setResumeReview(nextReviewState);
          }}
          onContinue={(reviewedResume) => {
            setMorphedResume(reviewedResume as ResumeData);
            setStep('template');
          }}
          onBack={() => setStep('jd')}
          onStartOver={resetAll}
          targetLabel={applicationData.jobTitle || morphedResume?.title || originalResume?.title || ''}
          morphStrength={guardrailReport?.effectiveMorphPercentage ?? morphPercentage}
          fitScore={matchScore ?? proofData?.optimizedScore ?? null}
          atsScore={resumeCheckResult?.atsScore ?? null}
          proofScore={proofData?.optimizedScore ?? null}
          protectedCount={guardrailReport?.protectedFields?.length ?? null}
          saveState={draftSaveState}
          savedAt={draftSavedAt}
          isPro={isPro}
          onRunAtsScan={checkResume}
          atsScanLoading={resumeCheckLoading}
        />
      );
    }

    return (
      <SuiteToolShell variant="editor" className="resume-studio-system-shell">
          <ResumeStudioHeader
            current={(
              step === 'upload'
                ? 'source'
                : step === 'jd'
                  ? isLoading ? 'shape' : 'target'
                  : step === 'template'
                    ? 'design'
                    : 'ship'
            ) as ResumeStudioStage}
            candidateName={displayResume?.name || originalResume?.name}
            candidateDetail={displayResume?.title || originalResume?.title || 'Candidate'}
            targetLabel={applicationData.jobTitle || jdSignals.role || displayResume?.title || originalResume?.title}
            saveLabel={draftSaveState === 'error' ? 'Save needs attention' : user ? 'Saved locally' : 'Local draft'}
            secondaryAction={
              <button type="button" onClick={resetAll} className="resume-studio-header__secondary">
                Start over
              </button>
            }
            primaryAction={step === 'template' ? (
              <button type="button" onClick={() => setStep('preview')} className="resume-studio-header__primary">
                Continue to Ship
                <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
              </button>
            ) : undefined}
          />

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
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--danger)] font-semibold">Taco needs school info</p>
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
                    {showSourceConfirmation && originalResume ? (
                      <motion.div key="source-ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="elevation-card max-w-4xl mx-auto rounded-[18px] border bg-[var(--bg-surface)] p-5 md:p-6 border-[color-mix(in_srgb,var(--success)_25%,transparent)]">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0 bg-[color-mix(in_srgb,var(--success)_10%,transparent)] border border-[color-mix(in_srgb,var(--success)_20%,transparent)]">
                              <span className="material-symbols-rounded icon-status-success text-[24px]">task_alt</span>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Resume source</p>
                              <h2 className="text-[20px] font-semibold text-[var(--text-primary)] mt-1">We have a clean source to work from.</h2>
                              <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-xl leading-relaxed">
                                Confirm the imported resume, then paste the job description so the studio can optimize against a real target.
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowSourceConfirmation(false);
                                setOriginalResume(null);
                                setSourceResumeMeta({});
                              }}
                              className="min-h-[44px] px-4 py-2.5 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSourceConfirmation(false);
                                setStep('jd');
                              }}
                              className="min-h-[44px] px-4 py-2.5 rounded-[11px] bg-[var(--text-primary)] text-[var(--bg-deep)] text-[12px] font-semibold hover:opacity-90"
                            >
                              Continue to Role Target
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'File', value: sourceResumeMeta.fileName || 'Resume source' },
                            { label: 'Characters', value: sourceResumeMeta.characterCount ? sourceResumeMeta.characterCount.toLocaleString() : 'Parsed' },
                            { label: 'Source type', value: sourceResumeMeta.sourceType === 'paste' ? 'Pasted text' : sourceResumeMeta.sourceType === 'storage' ? 'Secure upload' : 'Direct upload' },
                            { label: 'Detected', value: sourceResumeMeta.detectedType?.toUpperCase() || 'Resume' },
                          ].map(item => (
                            <div key={item.label} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                              <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{originalResume.name || 'Imported resume'}</p>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{originalResume.title || 'Target role pending'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {skillLabels(originalResume).slice(0, 8).map(skill => (
                              <span key={skill} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)] border border-[color-mix(in_srgb,var(--success)_18%,transparent)]">{skill}</span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
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
	                          onUploadSuccess={(text, fileName, meta) => {
	                            setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, storagePath: meta?.storagePath, characterCount: meta?.characterCount || text.trim().length, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted });
	                            handleFileExtracted(text);
	                          }}
                          showPasteFallback
                          onPasteText={handlePastedResumeText}
                          uploadContext="studio"
                          isUploading={isLoading}
                          setIsUploading={(state) => {
                            setIsLoading(state);
                            if (state) setProcessingStage('uploading');
                          }}
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
              <motion.div className="resume-studio-stage resume-studio-target-stage" key="jd" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-5 md:gap-6">
                  <section className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="p-5 md:p-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Role target</p>
                        <h2 className="text-[20px] md:text-[22px] font-semibold text-[var(--text-primary)] mt-1">Paste the job. We will shape the resume around it.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-2xl">The optimizer uses the job description to tune summary, bullets, skills, title language, ATS terms, and final page length.</p>
                      </div>
                      <div className="hidden sm:flex h-10 w-10 rounded-[10px] bg-[var(--accent-dim)] border border-[var(--border-subtle)] text-[var(--accent)] items-center justify-center flex-shrink-0">
                        <span className="material-symbols-rounded text-[20px]">my_location</span>
                      </div>
                    </div>

                    <div className="p-5 md:p-6 space-y-4">
                      <textarea
                        value={jobDescription}
                        onChange={(e) => {
                          setJobDescription(e.target.value);
                          mergeApplicationKitContext({ jobDescription: e.target.value });
                        }}
                        placeholder="Paste the full job description here. Include responsibilities, requirements, company context, and preferred qualifications when available."
                        className="w-full min-h-[260px] px-4 py-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] resize-y leading-relaxed text-[16px]"
                      />

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                          { label: 'Role', value: jdSignals.role },
                          { label: 'Company', value: jdSignals.company },
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

                  <aside className="space-y-4">
                    <section className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-rounded text-[18px]">description</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{resumeSnapshot.name}</p>
                          <p className="text-[11px] text-[var(--text-secondary)] truncate">{resumeSnapshot.title}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Signal', value: resumeSnapshot.signal },
                          { label: 'Roles', value: resumeSnapshot.positions },
                          { label: 'Skills', value: resumeSnapshot.skills },
                        ].map(item => (
                          <div key={item.label} className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-center">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)]">{item.value}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </section>

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
                          const isSelected = activeOptimizationMode.id === modeOption.id;
                          return (
                            <button
                              key={modeOption.id}
                              onClick={() => {
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

                      <details className="mt-4 group">
                        <summary className="list-none cursor-pointer flex items-center justify-between text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                          Advanced intensity
                          <span className="material-symbols-rounded text-[16px] group-open:rotate-180 transition-transform">expand_more</span>
                        </summary>
                        <div className="mt-3">
                          <input
                            type="range"
                            min="25"
                            max={maxMorphPercentage}
                            value={morphPercentage}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setMorphPercentage(Math.min(val, maxMorphPercentage));
                            }}
                            className="w-full accent-[var(--accent)]"
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
                            onClick={() => setTargetPageCount(pc)}
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
                        onClick={handleMorph}
                        disabled={isLoading || !jobDescription.trim() || morphConsentLoading}
                        className={`w-full mt-5 py-3.5 rounded-[12px] font-semibold text-sm transition-all text-center ${
                          !jobDescription.trim() || morphConsentLoading
                            ? 'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                            : 'bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90'
                        }`}
                      >
                        {isLoading ? <><span className="material-symbols-rounded align-middle mr-1">psychology</span> Optimizing...</> : !jobDescription.trim() ? 'Paste a job description first' : morphConsentLoading ? 'Checking safety settings...' : 'Optimize Resume'}
                      </button>
                      {isLoading && (
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

                    <button
                      onClick={handleBlueprint}
                      disabled={isBlueprintLoading || !jobDescription.trim() || isLoading}
                      className="elevation-card w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-rounded text-[18px]">{isBlueprintLoading ? 'hourglass_top' : 'content_paste'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {isBlueprintLoading ? 'Generating blueprint...' : 'Day-Zero Blueprint'} {!isPro && <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--accent-dim)] border border-[var(--border-subtle)] text-[var(--accent)] font-bold">{PAID_TEMPLATE_PLAN_LABEL}</span>}
                          </p>
                          <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">Create a first-90-days talking plan from this role target.</p>
                        </div>
                      </div>
                    </button>
                  </aside>
                </div>
              </motion.div>
            )}

            {/* Step 3: Resume Intelligence (Pro Only) */}

            {/* Step 4: Template Selection */}
            {step === 'template' && (
              <motion.div className="resume-studio-stage resume-studio-design-stage" key="template" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {displayResume ? (
                  <div className="space-y-5">
                    <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                        <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Visual system</p>
                        <h2 className="text-[22px] font-semibold text-[var(--text-primary)] mt-1">Choose the format that fits the audience.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2">Your reviewed content stays fixed while you compare readable, ATS-conscious presentation systems.</p>
                        {ENABLE_RESUME_REVIEW_WORKBENCH && (
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

                    {morphProofReport && <ProofEngineReport report={morphProofReport} />}

                    <details className="group elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                      <summary className="list-none cursor-pointer p-5 flex items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="icon-shell-neutral w-10 h-10 rounded-[11px] border flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-rounded text-[20px]">tune</span>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Power User Details</p>
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
                              { label: 'Match', value: matchScore ? `${matchScore}%` : 'Role-ready' },
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
                  <div className="max-w-lg mx-auto text-center py-12">
                    <div className="elevation-card rounded-[20px] border p-8 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                      <span className="text-5xl block mb-4 icon-status-danger"><span className="material-symbols-rounded text-inherit align-middle">warning</span></span>
                      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Resume Data Missing</h3>
                      <p className="text-[var(--text-secondary)] mb-6">Something went wrong loading your resume.</p>
                      <div className="flex gap-3 justify-center">
                        <button onClick={() => setStep('jd')} className="min-h-[44px] px-6 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)]"><span className="material-symbols-rounded text-[14px] align-middle mr-1">arrow_back</span> Back to role target</button>
                        <button onClick={() => { if (originalResume) setMorphedResume(originalResume); }} className="btn-primary min-h-[44px] px-6 py-3 rounded-[12px] font-bold">Use Original Resume</button>
                      </div>
                    </div>
                  </div>
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
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Export station</p>
                        <h3 className="text-[19px] font-semibold text-[var(--text-primary)] mt-1">Your resume is ready.</h3>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-2 mb-4">Download, save a reusable version, or attach it to an application pipeline.</p>

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
                            <button onClick={downloadPDF} disabled={isLoading} className="w-full min-h-[44px] py-3 rounded-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 transition-all disabled:opacity-50 text-sm">
                              {isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">description</span> Download PDF</>}
                            </button>
                            <button onClick={downloadWord} disabled={isLoading} className="w-full min-h-[44px] py-3 rounded-[12px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-50 text-sm">
                              {isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">edit_document</span> Download Word</>}
                            </button>
                          </div>
                          <button onClick={() => setShowApplicationModal(true)} className="w-full min-h-[44px] py-3 rounded-[12px] font-medium text-sm transition-all border border-[color-mix(in_srgb,var(--success)_15%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] text-[var(--success)] hover:bg-[color-mix(in_srgb,var(--success)_12%,transparent)]">
                            <span className="material-symbols-rounded align-middle mr-1">my_location</span> Track Application
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={saveVersionOnly} disabled={isSaving} className="min-h-[44px] py-2.5 rounded-[10px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm disabled:opacity-50">
                              {isSaving ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1 animate-spin">hourglass_top</span> Saving...</> : saveInlineStatus?.type === 'success' ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">check_circle</span> Saved</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">save</span> Save</>}
                            </button>
                            <button onClick={() => setStep('template')} className="min-h-[44px] py-2.5 rounded-[10px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm"><span className="material-symbols-rounded text-[14px] align-middle mr-1">palette</span> Template</button>
                          </div>
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
                        <h4 className="font-semibold text-[var(--text-primary)] mb-2">{selectedTemplate.name}</h4>
                        <p className="text-xs text-[var(--text-secondary)]">{selectedTemplate.description}</p>
                      </div>
                    </div>

                    <div className="min-w-0 lg:col-span-2">
                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div ref={resumeRef}>
                          <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-lg mx-auto text-center py-12">
                    <div className="elevation-card rounded-[20px] border p-8 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]">
                      <span className="text-5xl block mb-4 icon-status-danger"><span className="material-symbols-rounded text-inherit align-middle">warning</span></span>
                      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">No Resume Data</h3>
                      <button onClick={() => setStep('upload')} className="btn-primary min-h-[44px] px-6 py-3 rounded-[12px] font-bold">Start Over</button>
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
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="elevation-raised relative w-full max-w-md rounded-[20px] overflow-hidden border border-[var(--border-subtle)] bg-[var(--card-bg)]">
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
                          <input type="text" value={saveCompanyName} onChange={(e) => setSaveCompanyName(e.target.value)} placeholder="e.g., Google, Meta, Stripe" autoFocus className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Resume Version Name</label>
                          <input type="text" value={saveVersionName} onChange={(e) => setSaveVersionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveCompanyName.trim() && saveVersionName.trim()) confirmSave(); }} placeholder="e.g., Senior PM Resume" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        </div>
                        <div className="rounded-[12px] p-3 border border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                          <p className="text-xs text-[var(--text-secondary)]"><span className="material-symbols-rounded text-inherit align-middle text-[var(--accent)]">lightbulb</span> This will save your resume <strong>and</strong> create an application entry you can track in the Applications tab.</p>
                        </div>
                      </div>
                      <div className="p-6 pt-0 flex gap-3">
                        <button onClick={() => { setShowSaveModal(false); setSaveVersionName(''); setSaveCompanyName(''); }} disabled={isSaving} className="flex-1 min-h-[44px] px-4 py-3 rounded-[12px] font-medium transition-colors border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Cancel</button>
                        <button onClick={confirmSave} disabled={!saveCompanyName.trim() || isSaving} className="btn-primary flex-1 min-h-[44px] px-4 py-3 rounded-[12px] font-bold transition-all disabled:opacity-50">
                          {isSaving ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1 animate-spin">hourglass_top</span> Saving...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">save</span> Save & Track</>}
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

  // ===== RENDER: Create Flow =====
  if (mode === 'create') {
    const displayResume = buildResume;

    return (
      <SuiteToolShell variant="editor" className="resume-studio-create-shell resume-studio-system-shell">
          <ResumeStudioHeader
            current={(
              step === 'upload' || step === 'jd'
                ? 'source'
                : step === 'template'
                    ? 'design'
                    : 'ship'
            ) as ResumeStudioStage}
            candidateName={buildResume.name}
            candidateDetail={buildResume.title || 'Build from scratch'}
            targetLabel={buildResume.title}
            saveLabel="Local draft"
            secondaryAction={
              <button type="button" onClick={resetAll} className="resume-studio-header__secondary">
                Start over
              </button>
            }
          />

          {/* Steps */}
          <AnimatePresence mode="wait">
            {step === 'upload' && (
              <motion.div className="resume-create-stage" key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Personal Info */}
                  <div className="resume-create-section elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Personal Information</h3>
                    <div className="space-y-4">
                      <input type="text" value={buildResume.name} onChange={(e) => setBuildResume(prev => ({ ...prev, name: e.target.value }))} placeholder="Full Name" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      <input type="text" value={buildResume.title} onChange={(e) => setBuildResume(prev => ({ ...prev, title: e.target.value }))} placeholder="Job Title (e.g., Senior Software Engineer)" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      <input type="email" value={buildResume.email} onChange={(e) => setBuildResume(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      <input type="text" value={buildResume.phone} onChange={(e) => setBuildResume(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      <input type="text" value={buildResume.location} onChange={(e) => setBuildResume(prev => ({ ...prev, location: e.target.value }))} placeholder="Location (e.g., San Francisco, CA)" className="w-full px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="resume-create-section elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">Professional Summary</h3>
                      <button onClick={generateSummary} disabled={aiSuggesting} className="min-h-[44px] px-3 py-1 rounded-[10px] text-sm bg-[var(--accent-dim)] text-[var(--accent)] hover:opacity-90 disabled:opacity-50">
                        {aiSuggesting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Generating...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">auto_awesome</span> Generate with AI</>}
                      </button>
                    </div>
                    <textarea value={buildResume.summary} onChange={(e) => setBuildResume(prev => ({ ...prev, summary: e.target.value }))} placeholder="Write a brief professional summary..." className="w-full h-48 px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none resize-none" />
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button onClick={() => setStep('jd')} disabled={!buildResume.name || !buildResume.title} className="min-h-[44px] px-4 py-2 rounded-[12px] font-medium text-sm bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)] hover:opacity-90 disabled:opacity-50 transition-all">
                    Add Experience →
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'jd' && (
              <motion.div className="resume-create-stage" key="exp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="resume-create-section elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 mb-6">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Work Experience</h3>
                  {buildResume.experience.map((exp, i) => (
                    <div key={i} className="mb-4 p-4 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                      <div className="grid md:grid-cols-3 gap-3 mb-3">
                        <input type="text" value={exp.role} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].role = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Job Title" className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[16px] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        <input type="text" value={exp.company} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].company = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Company" className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[16px] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                        <input type="text" value={exp.duration} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].duration = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Duration (e.g., 2020-Present)" className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[16px] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-[var(--text-muted)]">Achievements</span>
                        <button onClick={() => generateAchievements(i)} disabled={aiSuggesting} className="min-h-[44px] px-2 py-1 rounded-[8px] text-xs bg-[var(--accent-dim)] text-[var(--accent)]">{aiSuggesting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">auto_awesome</span> Generate</>}</button>
                      </div>
                      {exp.achievements.map((a, j) => (
                        <input key={j} type="text" value={a} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].achievements[j] = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder={`Achievement ${j + 1}`} className="w-full mb-2 px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] text-[16px] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none" />
                      ))}
                      <button onClick={() => { const newExp = [...buildResume.experience]; newExp[i].achievements.push(''); setBuildResume(prev => ({ ...prev, experience: newExp })); }} className="min-h-[44px] text-xs text-[var(--accent)]">+ Add Achievement</button>
                    </div>
                  ))}
                  <button onClick={() => setBuildResume(prev => ({ ...prev, experience: [...prev.experience, { role: '', company: '', duration: '', achievements: [''] }] }))} className="w-full min-h-[44px] py-2.5 rounded-[12px] border border-dashed border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-all text-sm">
                    + Add Experience
                  </button>
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep('upload')} className="min-h-[44px] px-4 py-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text-primary)] text-sm"><span className="material-symbols-rounded text-[14px] align-middle mr-1">arrow_back</span> Back</button>
                  <button
                    onClick={() => {
                      setOriginalResume(buildResume);
                      setMorphedResume(null);
                      setMode('morph');
                      setStep('jd');
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-[12px] font-medium text-sm bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)] hover:opacity-90 transition-all"
                  >
                    Continue to Target <span aria-hidden="true">→</span>
                  </button>
                </div>
              </motion.div>
            )}

            {(step === 'template' || step === 'preview') && hasResumeData(displayResume) && (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid lg:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    {step === 'template' && (
                      <>
                        <h3 className="text-xl font-bold text-[var(--text-primary)]">Choose Template</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {TEMPLATES.map((t) => {
                            const isLocked = t.tier === 'pro' && !isPro;
                            const isSelected = selectedTemplate.id === t.id;
                            const cardPaletteId = canUseTemplatePalettes
                              ? templatePaletteSelections[t.id] || (isSelected ? activePaletteId : getDefaultPaletteId(t.id))
                              : getDefaultPaletteId(t.id);
                            const cardPalette = getTemplatePalette(t, cardPaletteId);
                            const cardThumbnail = t.thumbnail;
                            const isCurated = NEW_SIGNATURE_TEMPLATE_IDS.includes(t.id as (typeof NEW_SIGNATURE_TEMPLATE_IDS)[number]);
                            return (
                              <div
                                key={t.id}
                                id={`resume-template-card-${t.id}`}
                                role="button"
                                aria-pressed={isSelected}
                                aria-disabled={isLocked}
                                tabIndex={0}
                                onClick={() => selectTemplate(t)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    selectTemplate(t);
                                  }
                                }}
                                className={`p-3 rounded-[12px] border text-left text-sm relative transition-all ${
                                  isLocked
                                    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] opacity-70 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                                    : isSelected
                                      ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] cursor-pointer'
                                }`}
                              >
                                {isLocked && <span className="absolute top-1 right-1 z-10 text-[11px] px-1 py-0.5 rounded font-bold bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)]">{PAID_TEMPLATE_PLAN_LABEL}</span>}
                                {cardThumbnail ? (
                                  <span className="mb-2 block aspect-[2/3] overflow-hidden rounded-[9px] border border-[var(--border-subtle)] bg-[var(--paper)]">
                                    <img src={cardThumbnail} alt="" className="h-full w-full object-cover object-top" />
                                  </span>
                                ) : isCurated ? (
                                  <span className="mb-2 block aspect-[2/3] overflow-hidden rounded-[9px] border border-[var(--border-subtle)] bg-[var(--paper)]">
                                    <CuratedTemplateMiniature template={{ ...t, colors: { ...t.colors, ...cardPalette.colors } }} />
                                  </span>
                                ) : (
                                  <span
                                    className="mb-2 flex h-8 w-8 items-center justify-center rounded-[9px] border text-xl"
                                    style={!isLocked ? { backgroundColor: `${cardPalette.colors.primary}14`, color: cardPalette.colors.primary, borderColor: `${cardPalette.colors.primary}28` } : undefined}
                                  >
                                    <span className="material-symbols-rounded text-[18px]">{isLocked ? 'lock' : t.icon}</span>
                                  </span>
                                )}
                                <span className="block font-medium text-[var(--text-primary)]">{t.name}</span>
                                <span className="mt-1 block text-[11px] font-semibold text-[var(--text-secondary)]">{t.atsClassification}</span>
                                <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">
                                  <span className="font-medium text-[var(--text-secondary)]">{cardPalette.label}</span>
                                  {!canUseTemplatePalettes && <span> · {cardPalette.isDefault ? 'Included' : 'Max palette'}</span>}
                                </span>
                                <div className="mt-2">
                                  <PaletteDots colors={cardPalette.colors} selected={isSelected} size="xs" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Palette</p>
                              <p className="mt-0.5 truncate text-[12px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</p>
                            </div>
                            {!canUseTemplatePalettes && (
                              <button
                                type="button"
                                onClick={openMaxPaletteUpgrade}
                                className="shrink-0 min-h-[44px] rounded-[10px] border border-[var(--accent)] bg-[var(--accent-dim)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--accent)] hover:opacity-90"
                              >
                                Unlock Max
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              aria-haspopup="listbox"
                              aria-expanded={showPaletteMenu}
                              onClick={() => setShowPaletteMenu(open => !open)}
                              className="flex w-full min-w-0 min-h-[44px] items-center justify-between gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-2 text-left transition-all hover:border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <PaletteDots colors={selectedPalette.colors} selected />
                                <span className="min-w-0">
                                  <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</span>
                                  <span className="block truncate text-[11px] text-[var(--text-muted)]">Choose palette</span>
                                </span>
                              </span>
                              <span className="material-symbols-rounded shrink-0 text-[17px] text-[var(--text-muted)]">
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
                                  className="elevation-raised absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[260px] overflow-y-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5"
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
                                        className={`flex w-full min-w-0 min-h-[44px] items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                                          paletteSelected
                                            ? 'border-[var(--accent)] bg-[var(--accent-dim)]'
                                            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                                        }`}
                                      >
                                        <PaletteDots colors={palette.colors} selected={paletteSelected} locked={paletteLocked} />
                                        <span className="min-w-0">
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
                        <button onClick={() => setStep('preview')} className="w-full min-h-[44px] py-2.5 rounded-[12px] font-medium text-sm bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)] hover:opacity-90 transition-all">Preview & Export →</button>
                      </>
                    )}
                    {step === 'preview' && (
                      <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-3">
                        <h3 className="font-semibold text-[var(--text-primary)] mb-4">Export</h3>

                        {/* Free-tier usage counter */}
                        {!isPro && user && caps?.morphs != null && (
                          <div className="mb-1 px-3 py-2 rounded-[10px] flex items-center gap-2 border border-[color-mix(in_srgb,var(--warning)_15%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
                            <span className="material-symbols-rounded icon-status-warning text-[16px]">token</span>
                            <span className="text-xs text-[var(--text-secondary)]">{remaining('morphs')} of {caps.morphs} free uses left</span>
                          </div>
                        )}
                        {!user && (
                          <div className="mb-1 px-3 py-2 rounded-[10px] flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--accent-dim)]">
                            <span className="material-symbols-rounded text-[16px] text-[var(--accent)]">lock_open</span>
                            <span className="text-xs text-[var(--text-secondary)]">Sign in to download your resume</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={downloadPDF} disabled={isLoading} className="min-h-[44px] py-2.5 rounded-[12px] font-semibold bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)] hover:opacity-90 transition-all disabled:opacity-50 text-sm">{isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">description</span> PDF</>}</button>
                          <button onClick={downloadWord} disabled={isLoading} className="min-h-[44px] py-2.5 rounded-[12px] font-semibold bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-50 text-sm">{isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">edit_document</span> Word</>}</button>
                        </div>
                        <button onClick={saveVersionOnly} disabled={isSaving} className="w-full min-h-[44px] py-2.5 rounded-[12px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-primary)] transition-all text-sm disabled:opacity-50">
                          {isSaving ? <><span className="material-symbols-rounded text-inherit align-middle animate-spin">hourglass_top</span> Saving...</> : saveInlineStatus?.type === 'success' ? <><span className="material-symbols-rounded text-inherit align-middle">check_circle</span> Saved</> : <><span className="material-symbols-rounded text-inherit align-middle">save</span> Save Version</>}
                        </button>
                        {saveInlineStatus && (
                          <div className={`rounded-[12px] border px-3 py-2 text-xs ${
                            saveInlineStatus.type === 'success'
                              ? 'border-[color-mix(in_srgb,var(--success)_18%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] text-[var(--success)]'
                              : 'border-[color-mix(in_srgb,var(--danger)_18%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] text-[var(--danger)]'
                          }`}>
                            {saveInlineStatus.message}
                          </div>
                        )}
                        <button onClick={() => setStep('template')} className="w-full min-h-[44px] py-2.5 rounded-[12px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm"><span className="material-symbols-rounded text-inherit align-middle">palette</span> Change Template</button>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 lg:col-span-2">
                    <div className="elevation-card rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                      <div ref={resumeRef}>
                        <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
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
function ResumeTemplate({ resume, template }: { resume: ResumeData; template: typeof TEMPLATES[0] }) {
  // Normalize to canonical format before rendering — guarantees {category, items} skills etc.
  const normalized = normalizeResume(resume);
  return (
    <ResumeTemplateComponent
      resume={normalized}
      templateId={template.id}
      colors={template.colors}
    />
  );
}

const MemoizedResumeTemplate = memo(ResumeTemplate);

function ResponsiveResumePreview({
  resume,
  template,
}: {
  resume: ResumeData;
  template: typeof TEMPLATES[0];
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [previewMetrics, setPreviewMetrics] = useState({ scale: 1, height: 1123 });

  useEffect(() => {
    const frame = frameRef.current;
    const documentNode = documentRef.current;
    if (!frame || !documentNode) return;

    const updateMetrics = () => {
      const scale = Math.min(1, frame.clientWidth / 794);
      const height = Math.max(1123, documentNode.scrollHeight) * scale;
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
  }, [resume, template.id, template.colors.primary, template.colors.accent, template.colors.text]);

  return (
    <div
      ref={frameRef}
      className="elevation-raised mx-auto min-w-0 w-full max-w-[794px] overflow-hidden rounded-[10px] bg-[var(--paper)]"
      style={{ height: `${previewMetrics.height}px`, position: 'relative' }}
    >
      <div
        ref={documentRef}
        className="w-[794px]"
        style={{
          left: 0,
          position: 'absolute',
          top: 0,
          zoom: previewMetrics.scale,
        }}
      >
        <MemoizedResumeTemplate resume={resume} template={template} />
      </div>
    </div>
  );
}
