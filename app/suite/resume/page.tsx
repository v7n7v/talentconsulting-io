'use client';

import { memo, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { saveResumeVersion, getResumeVersions, createJobApplication, deleteResumeVersion, updateResumeVersion, type ResumeVersion } from '@/lib/database-suite';
import { useStore } from '@/lib/store';
import { showToast } from '@/components/Toast';
import { SuiteToolHeader, SuiteToolShell } from '@/components/suite/SuiteToolChrome';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { downloadResumePDF } from '@/lib/pdf-templates';
import { cleanResumeText, isResumeTextMissing, normalizeResume, serializeResumeToText } from '@/lib/resume-normalizer';
import { canPersistPreparedResume, prepareResumeForExport } from '@/lib/resume-export-truth';
import { ResumeTemplate as ResumeTemplateComponent } from '@/components/resume-templates';
import { CuratedTemplateMiniature } from '@/components/resume-templates/curated';
import { getHeaderPreset } from '@/components/resume-templates/header-system';
import {
  NEW_SIGNATURE_TEMPLATE_IDS,
  TEMPLATE_CATALOG,
  getContrastSafeTemplateColors,
  getPersistedResumePaletteId,
  getPersistedResumeTemplateId,
  getRegisteredTemplate,
  getSelectableTemplates,
  isResumeTemplateSelectionEntitled,
  recommendTemplateIds,
  resolveEntitledTemplateIdForSelection,
  resolveInitialResumeTemplateId,
  resolveSelectableTemplateDeepLinkId,
  resolveTemplateIdForSelection,
  type ResumeTemplateMetadata,
} from '@/lib/resume-templates';
import { useUserTier } from '@/hooks/use-user-tier';
import { useTheme } from '@/components/ThemeProvider';
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
import { ResumeStudioProgress, type ResumeStudioStage } from '@/components/resume-studio/ResumeStudioProgress';
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

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

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

interface RecommendationDeckItem {
  id: string;
  text: string;
  why: string;
  direction: string;
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

const ALL_TEMPLATES = TEMPLATE_CATALOG;
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

interface TemplatePalette {
  id: string;
  label: string;
  colors: TemplateColors;
  isDefault?: boolean;
}

const TEMPLATE_PALETTE_GROUPS: Record<string, TemplatePalette[]> = {
  executive: [
    { id: 'oxford-blue', label: 'Oxford Blue', colors: { primary: '#1e3a5f', accent: '#2b6cb0', text: '#111827' } },
    { id: 'boardroom-teal', label: 'Boardroom Teal', colors: { primary: '#102a43', accent: '#0f766e', text: '#1f2937' } },
    { id: 'charcoal-slate', label: 'Charcoal Slate', colors: { primary: '#1f2937', accent: '#64748b', text: '#111827' } },
    { id: 'evergreen', label: 'Evergreen', colors: { primary: '#064e3b', accent: '#0f766e', text: '#111827' } },
    { id: 'capital-navy', label: 'Capital Navy', colors: { primary: '#172554', accent: '#2563eb', text: '#111827' } },
    { id: 'bronze-ledger', label: 'Bronze Ledger', colors: { primary: '#78350f', accent: '#b45309', text: '#1c1917' } },
    { id: 'executive-ink', label: 'Executive Ink', colors: { primary: '#111827', accent: '#475569', text: '#111827' } },
  ],
  modern: [
    { id: 'teal-signal', label: 'Teal Signal', colors: { primary: '#0f766e', accent: '#14b8a6', text: '#1e293b' } },
    { id: 'cobalt-cyan', label: 'Cobalt Cyan', colors: { primary: '#1d4ed8', accent: '#0891b2', text: '#111827' } },
    { id: 'copper-ink', label: 'Copper Ink', colors: { primary: '#7c2d12', accent: '#ea580c', text: '#1c1917' } },
    { id: 'sage-modern', label: 'Sage Modern', colors: { primary: '#36594f', accent: '#5f7f72', text: '#1f2937' } },
    { id: 'plum-pulse', label: 'Plum Pulse', colors: { primary: '#581c87', accent: '#be185d', text: '#1f2937' } },
    { id: 'graphite-blue', label: 'Graphite Blue', colors: { primary: '#334155', accent: '#2563eb', text: '#111827' } },
    { id: 'emerald-line', label: 'Emerald Line', colors: { primary: '#064e3b', accent: '#10b981', text: '#111827' } },
  ],
  minimal: [
    { id: 'clean-ink', label: 'Clean Ink', colors: { primary: '#111827', accent: '#6b7280', text: '#111827' } },
    { id: 'soft-slate', label: 'Soft Slate', colors: { primary: '#475569', accent: '#94a3b8', text: '#334155' } },
    { id: 'warm-stone', label: 'Warm Stone', colors: { primary: '#44403c', accent: '#78716c', text: '#292524' } },
    { id: 'quiet-teal', label: 'Quiet Teal', colors: { primary: '#134e4a', accent: '#0f766e', text: '#111827' } },
    { id: 'editorial-navy', label: 'Editorial Navy', colors: { primary: '#1e3a5f', accent: '#64748b', text: '#111827' } },
    { id: 'paper-olive', label: 'Paper Olive', colors: { primary: '#3f4f3f', accent: '#6b7f5f', text: '#1f2937' } },
    { id: 'silver-rule', label: 'Silver Rule', colors: { primary: '#374151', accent: '#9ca3af', text: '#111827' } },
  ],
  technical: [
    { id: 'signal-blue', label: 'Signal Blue', colors: { primary: '#0f172a', accent: '#2563eb', text: '#111827' } },
    { id: 'terminal-green', label: 'Terminal Green', colors: { primary: '#1f2937', accent: '#059669', text: '#111827' } },
    { id: 'systems-teal', label: 'Systems Teal', colors: { primary: '#134e4a', accent: '#0f766e', text: '#111827' } },
    { id: 'data-indigo', label: 'Data Indigo', colors: { primary: '#312e81', accent: '#4f46e5', text: '#111827' } },
    { id: 'cloud-cyan', label: 'Cloud Cyan', colors: { primary: '#164e63', accent: '#0891b2', text: '#111827' } },
    { id: 'security-navy', label: 'Security Navy', colors: { primary: '#172554', accent: '#1d4ed8', text: '#0f172a' } },
    { id: 'operator-slate', label: 'Operator Slate', colors: { primary: '#334155', accent: '#0ea5e9', text: '#111827' } },
  ],
  creative: [
    { id: 'plum-editorial', label: 'Plum Editorial', colors: { primary: '#581c87', accent: '#be185d', text: '#1f2937' } },
    { id: 'violet-studio', label: 'Violet Studio', colors: { primary: '#6d28d9', accent: '#8b5cf6', text: '#1f2937' } },
    { id: 'ocean-studio', label: 'Ocean Studio', colors: { primary: '#0f766e', accent: '#0891b2', text: '#111827' } },
    { id: 'ember-creative', label: 'Ember Creative', colors: { primary: '#7c2d12', accent: '#ea580c', text: '#1c1917' } },
    { id: 'rose-ink', label: 'Rose Ink', colors: { primary: '#831843', accent: '#be185d', text: '#1f2937' } },
    { id: 'blueprint', label: 'Blueprint', colors: { primary: '#1e40af', accent: '#3b82f6', text: '#1e293b' } },
    { id: 'forest-story', label: 'Forest Story', colors: { primary: '#14532d', accent: '#16a34a', text: '#1f2937' } },
  ],
  traditional: [
    { id: 'burgundy-review', label: 'Burgundy Review', colors: { primary: '#7f1d1d', accent: '#b91c1c', text: '#1c1917' } },
    { id: 'cambridge-blue', label: 'Cambridge Blue', colors: { primary: '#1e3a5f', accent: '#475569', text: '#111827' } },
    { id: 'library-ink', label: 'Library Ink', colors: { primary: '#111827', accent: '#6b7280', text: '#111827' } },
    { id: 'federal-navy', label: 'Federal Navy', colors: { primary: '#1e3a5f', accent: '#1d4ed8', text: '#111827' } },
    { id: 'academic-copper', label: 'Academic Copper', colors: { primary: '#7c2d12', accent: '#c2410c', text: '#1c1917' } },
    { id: 'honors-green', label: 'Honors Green', colors: { primary: '#14532d', accent: '#15803d', text: '#111827' } },
    { id: 'archive-slate', label: 'Archive Slate', colors: { primary: '#334155', accent: '#64748b', text: '#111827' } },
  ],
};

function getTemplatePaletteGroup(templateId: string) {
  const category = getRegisteredTemplate(templateId)?.paletteGroup;
  if (category && ['executive', 'strategy', 'finance'].includes(category)) return 'executive';
  if (category && ['product', 'nonprofit', 'sales', 'transition', 'early-career'].includes(category)) return 'modern';
  if (category && ['technical', 'data'].includes(category)) return 'technical';
  if (category && ['legal', 'healthcare', 'academic', 'public-sector'].includes(category)) return 'traditional';
  if (category && ['creative', 'design', 'editorial'].includes(category)) return 'creative';
  if (['editorial-authority', 'executive', 'boardroom', 'deloitte', 'finance-ledger'].includes(templateId)) return 'executive';
  if (['modern', 'product-brief', 'infographic', 'startup', 'venture'].includes(templateId)) return 'modern';
  if (['minimal', 'compact', 'elegant', 'nordic'].includes(templateId)) return 'minimal';
  if (['technical-signal', 'technical', 'operator', 'data-signal', 'faang', 'ats-optimized', 'double-column'].includes(templateId)) return 'technical';
  if (['harvard', 'academic', 'federal'].includes(templateId)) return 'traditional';
  return 'creative';
}

function getDefaultPaletteId(_templateId: string) {
  return 'classic';
}

function getTemplatePalettes(template: ResumeTemplateOption): TemplatePalette[] {
  const group = getTemplatePaletteGroup(template.id);
  return [
    { id: getDefaultPaletteId(template.id), label: 'Classic', colors: template.colors, isDefault: true },
    ...TEMPLATE_PALETTE_GROUPS[group],
  ].slice(0, 8);
}

function getTemplatePalette(template: ResumeTemplateOption, paletteId?: string) {
  const palettes = getTemplatePalettes(template);
  return palettes.find(palette => palette.id === paletteId) || palettes[0];
}

function getTemplateWithPalette(template: ResumeTemplateOption, paletteId?: string) {
  const palette = getTemplatePalette(template, paletteId);
  return {
    ...template,
    colors: getContrastSafeTemplateColors({
      ...template.colors,
      ...palette.colors,
      background: template.colors.background || '#ffffff',
    }, template.colors),
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
        ? 'border-amber-400/80 bg-amber-400/10 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
    }`}>
      {[colors.primary, colors.accent, colors.text].map((color, index) => (
        <span
          key={`${color}-${index}`}
          className={`${dotClass} rounded-full border border-[var(--border-subtle)] shadow-sm`}
          style={{ backgroundColor: color }}
        />
      ))}
      {locked && !selected && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <span className="material-symbols-rounded text-[9px] text-[var(--text-muted)]">lock</span>
        </span>
      )}
    </span>
  );
}

const SKILL_CATEGORIES = [
  'Technical', 'Programming Languages', 'Frameworks', 'Tools & Platforms',
  'Soft Skills', 'Leadership', 'Languages', 'Certifications'
];

// ============ HELPER: Check if resume has data ============
function hasResumeData(resume: ResumeData | null): resume is ResumeData {
  if (!resume) return false;
  return !!(resume.name || resume.summary || resume.experience?.length || resume.education?.length);
}

function skillLabels(resume: ResumeData | null) {
  if (!resume?.skills?.length) return [];
  return normalizeResume(resume).skills.flatMap(group => group.items).filter(Boolean);
}

const STUDIO_FLOW = [
  { icon: 'upload_file', label: 'Import', detail: 'PDF, Word, or TXT' },
  { icon: 'my_location', label: 'Target', detail: 'Paste a role and company brief' },
  { icon: 'auto_awesome', label: 'Improve', detail: 'Rewrite, score, and verify fit' },
  { icon: 'file_download', label: 'Export', detail: 'Save, track, or download' },
];

const CONNECTED_ACTIONS = [
  { icon: 'work_history', label: 'Applications', detail: 'Attach this version to a tracked opportunity' },
  { icon: 'edit_note', label: 'Cover Letter', detail: 'Carry resume context into a tailored letter' },
  { icon: 'badge', label: 'LinkedIn', detail: 'Turn resume proof into a profile refresh' },
  { icon: 'record_voice_over', label: 'Interview Prep', detail: 'Practice from the exact role narrative' },
];

const STUDIO_ASSURANCES = [
  { label: 'Formats', value: 'PDF · DOCX · TXT' },
  { label: 'Workflow', value: 'Draft saved locally' },
  { label: 'Output', value: 'PDF and Word export' },
];

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
  const score = proof?.optimizedScore ?? matchScore ?? 0;
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
        after: `Optimized resume match is ${score}/100 at ${effectiveStrength}% morph strength.`,
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

// ============ LIVE DEMO ANIMATION ============
const demoRoles = [
  { title: 'Frontend Engineer', company: 'Vercel', skills: ['React', 'TypeScript', 'Next.js', 'Tailwind', 'GraphQL'], color: '#00F5FF' },
  { title: 'Data Scientist', company: 'OpenAI', skills: ['Python', 'PyTorch', 'TensorFlow', 'SQL', 'MLOps'], color: '#22C55E' },
  { title: 'Product Manager', company: 'Stripe', skills: ['Strategy', 'Analytics', 'Agile', 'Roadmaps', 'UX'], color: '#F59E0B' },
];

function ResumeMorphDemo() {
  const [roleIdx, setRoleIdx] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRoleIdx(prev => (prev + 1) % demoRoles.length);
      setScore(0);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const target = 82 + Math.floor(Math.random() * 15);
    let cur = 0;
    const tick = setInterval(() => {
      cur += 2;
      if (cur >= target) { cur = target; clearInterval(tick); }
      setScore(cur);
    }, 20);
    return () => clearInterval(tick);
  }, [roleIdx]);

  const role = demoRoles[roleIdx];

  return (
    <div className="elevation-1 p-5 md:p-6">
      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        {/* Left: "Original" resume */}
        <div className="flex-1 rounded-xl bg-[var(--theme-bg-input)] border border-[var(--theme-border)] p-4">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-3">Your Resume</div>
          <div className="space-y-2">
            <div className="h-3 w-3/4 rounded bg-white/10" />
            <div className="h-2 w-1/2 rounded bg-white/[0.06]" />
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 w-full rounded bg-white/[0.05]" />
              <div className="h-1.5 w-5/6 rounded bg-white/[0.05]" />
              <div className="h-1.5 w-4/5 rounded bg-white/[0.04]" />
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
              {['JavaScript', 'Node.js', 'HTML/CSS', 'Git', 'REST'].map(s => (
                <span key={s} className="px-1.5 py-0.5 rounded text-[8px] bg-white/[0.04] text-slate-500 border border-white/[0.06]">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Arrow + JD */}
        <div className="flex md:flex-col items-center justify-center gap-2 py-2">
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <span className="text-xs"><span className="material-symbols-rounded text-inherit align-middle">psychology</span></span>
          </div>
          <div className="h-px md:h-8 w-8 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent" />
          <AnimatePresence mode="wait">
            <motion.div
              key={role.company}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="px-2 py-1 rounded-md text-[8px] font-medium border whitespace-nowrap"
              style={{ backgroundColor: `${role.color}08`, borderColor: `${role.color}20`, color: role.color }}
            >
              JD: {role.company}
            </motion.div>
          </AnimatePresence>
          <div className="h-px md:h-8 w-8 md:w-px bg-gradient-to-r md:bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent" />
          <svg className="w-5 h-5 text-cyan-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>

        {/* Right: "Morphed" resume */}
        <div className="flex-1 rounded-xl border p-4 transition-all duration-500" style={{ borderColor: `${role.color}20`, backgroundColor: `${role.color}03` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: role.color }}>Morphed</div>
            <motion.div className="text-[10px] font-bold" style={{ color: role.color }}>{score}%</motion.div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-3/4 rounded" style={{ backgroundColor: `${role.color}15` }} />
            <AnimatePresence mode="wait">
              <motion.div
                key={role.title}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-[9px] font-medium" style={{ color: role.color }}
              >{role.title}</motion.div>
            </AnimatePresence>
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 w-full rounded" style={{ backgroundColor: `${role.color}08` }} />
              <div className="h-1.5 w-5/6 rounded" style={{ backgroundColor: `${role.color}08` }} />
              <div className="h-1.5 w-4/5 rounded" style={{ backgroundColor: `${role.color}06` }} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={role.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap gap-1 mt-3"
              >
                {role.skills.map((s, i) => (
                  <motion.span
                    key={s}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                    style={{ backgroundColor: `${role.color}12`, color: role.color, border: `1px solid ${role.color}25` }}
                  >{s}</motion.span>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          {/* ATS bar */}
          <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${role.color}10` }}>
            <motion.div className="h-full rounded-full" style={{ backgroundColor: role.color }} animate={{ width: `${score}%` }} transition={{ duration: 0.1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
// ============ WORKFLOW ANIMATION ============
const workflowSteps = [
  { id: 'upload', step: '01', icon: 'outbox', title: 'Upload Resume', desc: 'PDF, Word, or text' },
  { id: 'paste', step: '02', icon: 'content_paste', title: 'Paste JD', desc: 'Target job description' },
  { id: 'morph', step: '03', icon: 'psychology', title: 'AI Morph', desc: 'Smart rewrite engine' },
  { id: 'download', step: '04', icon: 'arrow_downward', title: 'Download', desc: 'PDF + linear Word' },
];

function WorkflowAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [morphScore, setMorphScore] = useState(0);
  const [morphSkills, setMorphSkills] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % 4);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Reset morph state when entering step 2 (morph)
  useEffect(() => {
    if (activeStep === 2) {
      setMorphScore(0);
      setMorphSkills([]);
      const skills = ['React', 'TypeScript', 'Next.js', 'Node.js', 'GraphQL'];
      skills.forEach((skill, i) => {
        setTimeout(() => setMorphSkills(prev => [...prev, skill]), 400 + i * 350);
      });
      const target = 88 + Math.floor(Math.random() * 9);
      let cur = 0;
      const scoreInterval = setInterval(() => {
        cur += 3;
        if (cur >= target) { cur = target; clearInterval(scoreInterval); }
        setMorphScore(cur);
      }, 40);
      return () => clearInterval(scoreInterval);
    }
  }, [activeStep]);

  return (
    <div className="elevation-1 p-5 md:p-6 overflow-hidden">
      {/* Step indicators */}
      <div className="grid grid-cols-4 gap-2 md:gap-3 mb-6">
        {workflowSteps.map((ws, i) => {
          const isActive = activeStep === i;
          const isPast = activeStep > i;
          return (
            <motion.button
              key={ws.id}
              onClick={() => setActiveStep(i)}
              className={`relative p-3 md:p-4 rounded-xl border transition-all duration-500 text-left overflow-hidden ${
                isActive
                  ? 'border-cyan-500/40 bg-cyan-500/[0.05]'
                  : isPast
                    ? 'border-cyan-500/10 bg-cyan-500/[0.02]'
                    : 'border-white/[0.06] bg-white/[0.01]'
              }`}
            >
              {/* Active glow */}
              {isActive && (
                <motion.div
                  layoutId="stepGlow"
                  className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: '0 0 30px rgba(0,245,255,0.08), inset 0 0 20px rgba(0,245,255,0.03)' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              {/* Progress bar at top */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-white/[0.03]">
                {isActive && (
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3.5, ease: 'linear' }}
                    key={`progress-${activeStep}-${i}`}
                  />
                )}
                {isPast && <div className="h-full w-full bg-cyan-500/30" />}
              </div>

              <div className="relative">
                <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-cyan-400' : isPast ? 'text-cyan-500/30' : 'text-white/20'}`}>{ws.step}</span>
                <motion.div
                  className="text-xl md:text-2xl mt-1"
                  animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.6 }}
                >{ws.icon}</motion.div>
                <h3 className={`text-xs md:text-sm font-semibold mt-1 transition-colors ${isActive ? 'text-white' : 'text-slate-500'}`}>{ws.title}</h3>
                <p className={`text-[10px] md:text-xs mt-0.5 transition-colors hidden md:block ${isActive ? 'text-slate-400' : 'text-slate-600'}`}>{ws.desc}</p>
              </div>

              {/* Checkmark for completed */}
              {isPast && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Animated stage content */}
      <div className="relative min-h-[160px] rounded-xl bg-[var(--theme-bg-input)] border border-[var(--theme-border)] overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Step 0: Upload */}
          {activeStep === 0 && (
            <motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="p-6 flex flex-col items-center justify-center h-[160px]">
              <motion.div
                initial={{ y: -40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="text-4xl mb-3"
              ><span className="material-symbols-rounded text-inherit align-middle">description</span></motion.div>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="px-4 py-2 rounded-xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/[0.03] text-xs text-cyan-400 flex items-center gap-2"
              >
                <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>↑</motion.span>
                resume_v3.pdf uploaded
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-3 flex items-center gap-3 text-[10px] text-slate-500"
              >
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />PDF parsed</span>
                <span>•</span>
                <span>3 pages</span>
                <span>•</span>
                <span>12 skills detected</span>
              </motion.div>
            </motion.div>
          )}

          {/* Step 1: Paste JD */}
          {activeStep === 1 && (
            <motion.div key="paste" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="p-6 h-[160px]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-slate-500">Target:</span>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-xs font-medium text-cyan-400">Senior Frontend Engineer — Vercel</motion.span>
              </div>
              <div className="space-y-2 font-mono">
                {[
                  'Looking for a Senior Frontend Engineer...',
                  'Requirements: React, TypeScript, Next.js',
                  'Experience with design systems, A11y...',
                  'Bonus: GraphQL, testing frameworks',
                ].map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.4 }}
                    className="text-[11px] text-slate-500 flex items-center gap-2"
                  >
                    <span className="text-cyan-500/40">|</span>
                    <motion.span
                      initial={{ width: 0 }}
                      animate={{ width: 'auto' }}
                      transition={{ delay: 0.5 + i * 0.4, duration: 0.3 }}
                      className="overflow-hidden whitespace-nowrap"
                    >{line}</motion.span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: AI Morph */}
          {activeStep === 2 && (
            <motion.div key="morph" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="p-6 h-[160px]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full"
                    />
                    <span className="text-xs text-cyan-400 font-medium">Morphing in progress...</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {morphSkills.map((skill, i) => (
                      <motion.span
                        key={skill}
                        initial={{ opacity: 0, scale: 0.5, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      >{skill}</motion.span>
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: morphScore > 0 ? 1 : 0 }}
                    className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"
                  >
                    <span>Keywords injected</span>
                    <span className="text-cyan-500/40">•</span>
                    <span>Skills reordered</span>
                    <span className="text-cyan-500/40">•</span>
                    <span>Format optimized</span>
                  </motion.div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-[10px] text-slate-500 mb-1">ATS Match</div>
                  <motion.div className="text-2xl font-bold text-cyan-400">{morphScore}%</motion.div>
                  <div className="w-20 h-1.5 rounded-full bg-white/[0.04] mt-1 overflow-hidden">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" animate={{ width: `${morphScore}%` }} transition={{ duration: 0.05 }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Download */}
          {activeStep === 3 && (
            <motion.div key="download" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="p-6 flex flex-col items-center justify-center h-[160px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-3"
              >
                <motion.svg initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4, duration: 0.5 }} className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <motion.path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.5 }} />
                </motion.svg>
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-sm font-semibold text-white mb-1">Resume Ready</motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex items-center gap-3">
                <button className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-medium text-cyan-400 flex items-center gap-1">
                  <span className="material-symbols-rounded align-middle mr-1">description</span> PDF
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400 flex items-center gap-1">
                  <span className="material-symbols-rounded align-middle mr-1">edit_document</span> Word
                </button>
                <span className="text-[10px] text-green-400 font-bold">92% Match</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function LiquidResumePage() {
  const { user } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const prefersReducedMotion = useReducedMotion();
  const isReviewDemo = process.env.NODE_ENV !== 'production' && searchParams.get('reviewDemo') === '1';
  const isSourceConfirmDemo = process.env.NODE_ENV !== 'production' && searchParams.get('sourceConfirmDemo') === '1';
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const { tier, isPro, canUse, remaining, caps, loading: tierLoading, refetch: refetchUsage } = useUserTier();

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
  const [dragActive, setDragActive] = useState(false);
  const [buildStep, setBuildStep] = useState(0);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [processingStage, setProcessingStage] = useState<'uploading' | 'extracting' | 'parsing' | null>(null);

  // Enhance step state
  const [enhancePhase, setEnhancePhase] = useState<'idle' | 'checking' | 'fixing' | 'cover-letter' | 'linkedin'>('idle');
  const [enhancePipelineStage, setEnhancePipelineStage] = useState(0); // 0=idle, 1=AI writing, 2=AI checking, 3=refining
  const [autoFixing, setAutoFixing] = useState(false);
  const [preFixScore, setPreFixScore] = useState<number | null>(null);
  const [handledRecommendations, setHandledRecommendations] = useState<Record<string, 'applied' | 'kept' | 'passed' | 'ignored'>>({});
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

  const selectTemplatePalette = (template: ResumeTemplateOption, palette: TemplatePalette) => {
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

  // No-navigate sent state for Cover Letter / LinkedIn
  const [coverLetterSent, setCoverLetterSent] = useState(false);
  const [linkedInSent, setLinkedInSent] = useState(false);

  // Saved blueprints from localStorage
  const [savedBlueprints, setSavedBlueprints] = useState<{ id: string; content: string; targetRole: string; createdAt: string }[]>([]);
  const [showSavedBlueprints, setShowSavedBlueprints] = useState(false);

  // Load saved blueprints on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('tc_blueprints') || '[]');
      setSavedBlueprints(stored);
    } catch {}
  }, []);

  useEffect(() => {
    if (searchParams.get('mobileAction') !== 'check' || mobileCheckFocusHandledRef.current) return;
    mobileCheckFocusHandledRef.current = true;
    setMode('choose');
    setStep('upload');
    setActiveStart('upload');
    requestAnimationFrame(() => {
      document.getElementById('resume-import-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // ===== FILE EXTRACTION =====
  const extractFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  };

  const extractFromWord = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
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
      // Brief pause so user sees the "extracting" stage
      await new Promise(r => setTimeout(r, 800));
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
        const companyName = originalResume.experience?.[0]?.company || 'Unknown';
        const stored = JSON.parse(localStorage.getItem('tc_blueprints') || '[]');
        stored.unshift({
          id: `bp_${Date.now()}`,
          content: data.blueprint,
          targetRole: originalResume.title || '',
          createdAt: new Date().toISOString(),
        });
        const trimmed = stored.slice(0, 10);
        localStorage.setItem('tc_blueprints', JSON.stringify(trimmed));
        setSavedBlueprints(trimmed);
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
      setPreFixScore(null);
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

  const handleSave = () => {
    const prepared = getPreparedOutboundResume('saving or tracking');
    if (!prepared?.resume) return;
    const resume = prepared.resume as ResumeData;
    if (!requireEducationInstitutionBefore('saving or tracking', resume)) return;
    setSaveVersionName(resume.title || 'My Resume');
    setSaveCompanyName(applicationData.companyName || '');
    setSaveSuccess(false);
    setShowSaveModal(true);
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
    const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType, TableBorders } = await import('docx');
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
  const [coverLetterResult, setCoverLetterResult] = useState<{ coverLetter: string; score: number; refined: boolean; modelAgreement: string } | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState<'professional' | 'friendly' | 'bold'>('professional');
  const [coverLetterCompany, setCoverLetterCompany] = useState('');
  const [showCoverLetterPanel, setShowCoverLetterPanel] = useState(false);

  const [resumeCheckResult, setResumeCheckResult] = useState<any>(null);
  const [resumeCheckLoading, setResumeCheckLoading] = useState(false);
  const [showResumeCheckPanel, setShowResumeCheckPanel] = useState(false);

  useEffect(() => {
    setHandledRecommendations({});
  }, [resumeCheckResult?.atsScore, resumeCheckResult?.issues?.join('|'), resumeCheckResult?.suggestions?.join('|')]);

  const [linkedinResult, setLinkedinResult] = useState<any>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [showLinkedinPanel, setShowLinkedinPanel] = useState(false);

  // ===== DUAL-AI HANDLERS =====
  const generateCoverLetter = async () => {
    const displayResume = getDisplayResume();
    if (!displayResume) return showToast('No resume data available', 'cancel');
    setCoverLetterLoading(true);
    setCoverLetterResult(null);
    setShowCoverLetterPanel(true);
    try {
      const resumeText = [
        displayResume.name, displayResume.title, displayResume.email, displayResume.phone,
        displayResume.summary,
        ...(displayResume.experience || []).map((e: any) => `${e.title} at ${e.company}: ${(e.achievements || []).join('. ')}`),
        ...(displayResume.skills || []),
      ].filter(Boolean).join('\n');

      const res = await authFetch('/api/resume/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          jobDescription: jobDescription || 'General professional position',
          companyName: coverLetterCompany,
          tone: coverLetterTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 401 + requiresAuth is the signed-out answer; the upgrade modal is the
        // wrong door for someone who has no account yet.
        /* Return, do not throw. The catch below turns anything thrown into a
           red `cancel` toast, so opening a modal and throwing fired both at
           once - the way out and a failure notice about it, together. The
           Blueprint handler above already had this right: raise the door, say
           why with a lock icon, stop. */
        if (data.requiresAuth) { setShowDownloadAuth('signup'); return; }
        if (data.upgrade || res.status === 403) {
          setShowUpgradeModal(true);
          showToast(data.error || 'Cover Letter is a Standard feature', 'lock');
          return;
        }
        throw new Error(data.error || 'Failed to generate cover letter');
      }
      setCoverLetterResult(data);
      showToast(`Cover letter generated! Score: ${data.score}/100${data.refined ? ' (Dual-AI refined)' : ''}`, 'check_circle');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate cover letter', 'cancel');
    } finally { setCoverLetterLoading(false); }
  };

  // Skills serialization and normalization are handled by lib/resume-normalizer.ts
  // Use normalizeResume() for data, serializeResumeToText() for AI prompts

  const checkResume = async () => {
    const displayResume = getDisplayResume();
    if (!displayResume) return showToast('No resume data available', 'cancel');
    setResumeCheckLoading(true);
    setResumeCheckResult(null);
    setShowResumeCheckPanel(true);
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

  const generateLinkedIn = async () => {
    const displayResume = getDisplayResume();
    if (!displayResume) return showToast('No resume data available', 'cancel');
    setLinkedinLoading(true);
    setLinkedinResult(null);
    setShowLinkedinPanel(true);
    try {
      const resumeText = serializeResumeToText(normalizeResume(displayResume));

      const res = await authFetch('/api/resume/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, targetRole: displayResume.title }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Return, not throw - see the note in the cover-letter handler.
        if (data.requiresAuth) { setShowDownloadAuth('signup'); return; }
        if (data.upgrade || res.status === 403) {
          setShowUpgradeModal(true);
          showToast(data.error || 'LinkedIn Optimizer is a Standard feature', 'lock');
          return;
        }
        throw new Error(data.error || 'Failed to generate LinkedIn profile');
      }
      setLinkedinResult(data);
      showToast(`LinkedIn profile generated! Score: ${data.score}/100${data.refined ? ' (Dual-AI refined)' : ''}`, 'check_circle');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate LinkedIn profile', 'cancel');
    } finally { setLinkedinLoading(false); setEnhancePhase('idle'); setEnhancePipelineStage(0); }
  };

  const autoFixResume = async () => {
    if (!resumeCheckResult?.suggestions?.length && !resumeCheckResult?.issues?.length) return showToast('Run Resume Check first', 'cancel');
    const currentResume = getDisplayResume();
    if (!currentResume) return;
    setAutoFixing(true);
    setEnhancePhase('fixing');
    setEnhancePipelineStage(1);
    setPreFixScore(resumeCheckResult.atsScore);
    try {
      const resumeText = serializeResumeToText(normalizeResume(currentResume));

      setEnhancePipelineStage(2);
      const res = await authFetch('/api/resume/auto-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          resume: currentResume,
          suggestions: [...(resumeCheckResult.suggestions || []), ...(resumeCheckResult.issues || [])],
          targetJD: jobDescription || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade || res.status === 403) setShowUpgradeModal(true);
        throw new Error(data.error || 'Failed to auto-fix resume');
      }

      setEnhancePipelineStage(3);
      // Apply improved resume data
      if (data.improvedResume) {
        // Use centralized normalizer — handles skills format, field names, etc.
        const improved = normalizeResume({
          ...currentResume,
          ...data.improvedResume,
        }, currentResume) as any;
        if (mode === 'morph') setMorphedResume(improved);
        else setBuildResume(improved);
        showToast(`Resume improved. Score: ${data.score}/100`, 'check_circle');

        // Save skill gap analysis for Skill Bridge
        try {
          const originalSkills = (currentResume.skills || []).flatMap((s: any) => s.items || []).map((s: string) => s.toLowerCase().trim());
          const improvedSkills = (improved.skills || []).flatMap((s: any) => s.items || []).map((s: string) => s.toLowerCase().trim());
          const aiAddedSkills = improvedSkills.filter((s: string) => !originalSkills.includes(s));
          const existingSkills = improvedSkills.filter((s: string) => originalSkills.includes(s));
          const gaps = [
            ...aiAddedSkills.map((s: string) => ({ skill: s.charAt(0).toUpperCase() + s.slice(1), confidence: 'ai-added', category: 'technical' })),
            ...existingSkills.slice(0, 2).map((s: string) => ({ skill: s.charAt(0).toUpperCase() + s.slice(1), confidence: 'weak', category: 'technical' })),
          ];
          if (gaps.length > 0) {
            localStorage.setItem('tc_skill_gaps', JSON.stringify({ gaps, timestamp: Date.now() }));
          }
        } catch {}

        // Re-run check for before/after comparison
        setTimeout(() => checkResume(), 500);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to auto-fix resume', 'cancel');
    } finally { setAutoFixing(false); setEnhancePhase('idle'); setEnhancePipelineStage(0); }
  };

  const resolveRecommendation = (id: string, action: 'applied' | 'kept' | 'passed' | 'ignored') => {
    setHandledRecommendations(prev => ({ ...prev, [id]: action }));
    const message = action === 'applied'
      ? 'Recommendation applied to the review deck'
      : action === 'kept'
        ? 'Recommendation kept for later'
        : action === 'passed'
          ? 'Recommendation passed'
          : 'Recommendation ignored';
    showToast(message, action === 'ignored' ? 'visibility_off' : 'check_circle');
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

  const suggestSkills = async () => {
    if (!buildResume.title) return showToast('Add a job title first', 'cancel');
    const sourceSkills = buildResume.skills.flatMap(group => group.items || []).map(item => item.trim()).filter(Boolean);
    if (sourceSkills.length === 0) {
      showToast('Add your real skills first. AI can organize them, but it will not infer skills from a job title.', 'cancel');
      return;
    }
    setAiSuggesting(true);
    try {
      const res = await authFetch('/api/resume/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest_skills', text: `Source skills:\n${sourceSkills.join('\n')}` }),
      });
      if (!res.ok) {
        const errData = await res.json();
        if (errData.upgrade || res.status === 403) setShowUpgradeModal(true);
        throw new Error(errData.error || 'Failed');
      }
      const data = await res.json();
      setBuildResume(prev => ({ ...prev, skills: data.skills || [] }));
      showToast('Skills suggested!', 'check_circle');
    } catch { showToast('Failed to suggest', 'cancel'); }
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
    setBuildStep(0);
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

          {false && <div>
          <SuiteToolHeader
            tool="resume"
            title="Build, tailor, score, and ship the right resume."
            subtitle="Turn one master resume into role-ready versions that stay connected to applications, cover letters, LinkedIn, and interview prep."
          />

          <div className="space-y-5">
            <motion.section
              id="resume-import-workspace"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="scroll-mt-24 overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            >
              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.36fr)]">
                <div className="p-4 sm:p-6 lg:p-7">
                  <div className="mb-5 max-w-2xl">
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Start with your resume</p>
                    <h2 className="mt-1.5 text-[20px] font-semibold text-[var(--text-primary)]">Add the version you want to work on.</h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      We will keep its structure, then guide you through targeting, improvements, and export.
                    </p>
                  </div>

                  <FileUploadDropzone
                    onUploadSuccess={(text, fileName, meta) => {
                      setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, storagePath: meta?.storagePath, characterCount: meta?.characterCount || text.trim().length, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted });
                      setMode('morph');
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
                    variant="studio"
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-[15px]">verified</span>
                      Structure preserved
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="material-symbols-rounded text-[15px]">sync_saved_locally</span>
                      Draft saved locally
                    </span>
                  </div>
                </div>

                <aside className="border-t border-[var(--border-subtle)] p-4 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Or continue</p>
                      <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">From a saved version</h3>
                    </div>
                    {versions.length > 0 && (
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{versions.length} saved</span>
                    )}
                  </div>

                  <div className="mt-4 border-y border-[var(--border-subtle)]">
                    {versions.length > 0 ? (
                      versions.slice(0, 4).map((version) => (
                        <div key={version.id} className="group relative border-b border-[var(--border-subtle)] last:border-b-0">
                          <button
                            type="button"
                            onClick={() => loadVersionToMorph(version)}
                            className="flex w-full items-center gap-3 py-3 pr-8 text-left transition-colors hover:text-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/35"
                          >
                            <span className="material-symbols-rounded icon-neutral text-[18px]">description</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium text-[var(--text-primary)]">{version.version_name}</span>
                              <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                                {new Date(version.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </span>
                            <span className="material-symbols-rounded text-[17px] text-[var(--text-muted)]">arrow_forward</span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => handleDeleteVersion(event, version.id)}
                            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 group-focus-within:opacity-100"
                            aria-label={`Delete resume version ${version.version_name}`}
                          >
                            <span className="material-symbols-rounded text-[14px]">close</span>
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-[12px] leading-relaxed text-[var(--text-muted)]">Saved versions will appear here after your first export.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className="group mt-4 flex w-full items-center justify-between gap-3 rounded-[9px] py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35"
                  >
                    <span>
                      <span className="block text-[12px] font-medium text-[var(--text-primary)]">No resume yet?</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Build one from scratch</span>
                    </span>
                    <span className="material-symbols-rounded text-[18px] text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
                  </button>
                </aside>
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Then we guide you through</p>
                <ol className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                  {STUDIO_FLOW.slice(1).map((item, index) => (
                    <li key={item.label} className="flex items-center gap-2">
                      {index > 0 && <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)]">arrow_forward</span>}
                      <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                      <span className="hidden text-[var(--text-muted)] sm:inline">— {item.detail}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </motion.section>
          </div>
          </div>}

          <div className="hidden">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]"
            >
              <section className="flex h-full flex-col rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:p-5">
                <div className="flex items-center justify-between gap-3 pb-3 sm:pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Choose your starting point</p>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-1">Start simple, then let the workflow reveal only what you need next.</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span className="material-symbols-rounded text-[15px]">sync_saved_locally</span>
                    Draft saved locally
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {STARTING_POINTS.filter(point => point.id !== 'scratch').map(point => {
                    const selected = activeStart === point.id;
                    const disabledRecent = point.id === 'recent' && versions.length === 0;
                    return (
                      <button
                        key={point.id}
                        type="button"
                        onClick={() => {
                          if (disabledRecent) {
                            showToast('Save a resume version first, then it will appear here.', 'info');
                            return;
                          }
                          setActiveStart(point.id);
                          if (point.id === 'recent') showToast('Choose a version from Recent versions.', 'info');
                        }}
                        className={`rounded-[13px] border p-3 text-left transition-all ${
                          selected
                            ? 'border-cyan-500/35 bg-cyan-500/[0.07]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)]'
                        } ${disabledRecent ? 'opacity-60' : ''} min-h-[76px] md:min-h-[100px] md:p-4`}
                      >
                        <div className="flex items-start gap-2.5 md:gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] md:h-11 md:w-11">
                            <span className={`material-symbols-rounded text-[19px] ${selected ? 'text-cyan-600 dark:text-cyan-300' : 'icon-neutral'}`}>{point.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold leading-tight text-[var(--text-primary)] sm:text-[13px]">{point.label}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)] sm:mt-1.5 sm:text-[12px]">{point.detail}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveStart('scratch');
                    setMode('create');
                  }}
                  className={`group mt-2 flex min-h-[64px] w-full items-center gap-2.5 rounded-[14px] border p-3 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/25 sm:mt-3 sm:min-h-[88px] sm:gap-3 sm:p-4 ${
                    activeStart === 'scratch'
                      ? 'border-cyan-500/35 bg-cyan-500/[0.07]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="icon-shell-neutral flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[11px] border sm:h-11 sm:w-11 sm:rounded-[12px]">
                    <span className={`material-symbols-rounded text-[19px] sm:text-[21px] ${activeStart === 'scratch' ? 'text-cyan-600 dark:text-cyan-300' : ''}`}>draw</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-tight text-[var(--text-primary)] sm:text-[14px]">Build from scratch</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-secondary)] sm:mt-1.5 sm:text-[12px]">Use guided sections and AI suggestions when you do not have a clean base resume yet.</p>
                  </div>
                  <span className="material-symbols-rounded text-[22px] text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]">arrow_forward</span>
                </button>
                <div className="mt-2 grid flex-1 grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
                  {STUDIO_ASSURANCES.map(item => (
                    <div key={item.label} className="flex min-h-[58px] flex-col justify-center rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-2 md:min-h-[86px] md:px-4 md:py-3">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] font-medium sm:text-[10px] sm:tracking-[0.12em]">{item.label}</p>
                      <p className="mt-1 text-[10.5px] font-medium leading-snug text-[var(--text-primary)] sm:text-[12px]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 lg:block">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Resume vault</p>
                    <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mt-1">Recent versions</h2>
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[12px] font-medium tabular-nums text-[var(--text-muted)]">{versions.length}</span>
                </div>
                {versions.length > 0 ? (
                  <div className="space-y-2">
                    {versions.slice(0, 4).map((v) => (
                      <div
                        key={v.id}
                        onClick={() => loadVersionToMorph(v)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            loadVersionToMorph(v);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="group relative flex cursor-pointer items-start gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                        aria-label={`Load resume version ${v.version_name}`}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDeleteVersion(e, v.id)}
                          className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--text-muted)] opacity-100 transition-opacity hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                          aria-label={`Delete resume version ${v.version_name}`}
                        >
                          <span className="material-symbols-rounded text-[14px]">close</span>
                        </button>
                        <div className="icon-shell-neutral flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border">
                          <span className="material-symbols-rounded text-[16px]">description</span>
                        </div>
                        <div className="min-w-0 flex-1 pr-8">
                          <h4 className="truncate text-[12px] font-medium text-[var(--text-primary)]">{v.version_name}</h4>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                    <div className="icon-shell-neutral mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] border">
                      <span className="material-symbols-rounded text-[18px]">folder_open</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No saved versions yet.</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Upload or build one to start your vault.</p>
                  </div>
                )}
              </section>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
              className="space-y-4"
            >
              <section id="resume-import-workspace-legacy" className="scroll-mt-24 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden shadow-sm">
                <div className="px-5 py-4 md:px-6 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Start here</p>
                    <h2 className="text-[17px] font-semibold text-[var(--text-primary)] mt-1">Import a resume</h2>
                    <p className="text-[12px] text-[var(--text-secondary)] mt-1">A richer upload step that becomes the source for every downstream tool.</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                    <span className="material-symbols-rounded icon-neutral text-[17px]">verified</span>
                    Keeps structure intact
                  </div>
                </div>
                <FileUploadDropzone
	                  onUploadSuccess={(text, fileName, meta) => {
	                    setSourceResumeMeta({ fileName, sourceType: meta?.sourceType, storagePath: meta?.storagePath, characterCount: meta?.characterCount || text.trim().length, detectedType: meta?.detectedType, storagePathDeleted: meta?.storagePathDeleted });
	                    setMode('morph');
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
              </section>

              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 lg:hidden">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Resume vault</p>
                    <h2 className="mt-1 text-[16px] font-semibold text-[var(--text-primary)]">Recent versions</h2>
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[12px] font-medium tabular-nums text-[var(--text-muted)]">{versions.length}</span>
                </div>
                {versions.length > 0 ? (
                  <div className="space-y-2">
                    {versions.slice(0, 3).map((v) => (
                      <div
                        key={v.id}
                        onClick={() => loadVersionToMorph(v)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            loadVersionToMorph(v);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="group relative flex cursor-pointer items-start gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                        aria-label={`Load resume version ${v.version_name}`}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDeleteVersion(e, v.id)}
                          className="absolute right-2 top-2 rounded-md p-1.5 text-[var(--text-muted)] transition-opacity hover:text-red-500"
                          aria-label={`Delete resume version ${v.version_name}`}
                        >
                          <span className="material-symbols-rounded text-[14px]">close</span>
                        </button>
                        <div className="icon-shell-neutral flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border">
                          <span className="material-symbols-rounded text-[16px]">description</span>
                        </div>
                        <div className="min-w-0 flex-1 pr-8">
                          <h4 className="truncate text-[12px] font-medium text-[var(--text-primary)]">{v.version_name}</h4>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                    <div className="icon-shell-neutral mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] border">
                      <span className="material-symbols-rounded text-[18px]">folder_open</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No saved versions yet.</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Upload or build one to start your vault.</p>
                  </div>
                )}
              </section>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="grid grid-cols-1 gap-4"
            >
              <section className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 md:p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Operating model</p>
                    <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mt-1">Studio workflow</h2>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    <motion.span
                      className="h-2 w-2 rounded-full bg-cyan-500"
                      animate={prefersReducedMotion ? undefined : { opacity: [0.45, 1, 0.45], scale: [0.92, 1.14, 0.92] }}
                      transition={prefersReducedMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    Sequential scan
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {STUDIO_FLOW.map((item, index) => (
                    <motion.div
                      key={item.label}
                      className="relative flex min-h-[112px] min-w-0 overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.14 + index * 0.04 }}
                    >
                      <motion.div
                        className="absolute inset-x-0 top-0 h-1 opacity-0"
                        style={{
                          backgroundImage: 'linear-gradient(90deg, rgba(6,182,212,0), rgba(6,182,212,0.95), rgba(16,185,129,0.9), rgba(6,182,212,0))',
                          backgroundSize: '220% 100%',
                        }}
                        animate={prefersReducedMotion ? { opacity: 0.45 } : { opacity: [0, 1, 0], backgroundPosition: ['0% 50%', '220% 50%', '220% 50%'] }}
                        transition={prefersReducedMotion ? undefined : { duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: index * 1.2 }}
                      />
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0"
                        style={{
                          background: 'linear-gradient(135deg, rgba(6,182,212,0.13), rgba(16,185,129,0.08), transparent 60%)',
                        }}
                        animate={prefersReducedMotion ? { opacity: 0.04 } : { opacity: [0, 0.18, 0] }}
                        transition={prefersReducedMotion ? undefined : { duration: 4.8, repeat: Infinity, ease: 'easeInOut', delay: index * 1.2 }}
                      />
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="icon-shell-neutral flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] border">
                          <span className="material-symbols-rounded text-[18px]">{item.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Step {index + 1}</p>
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{item.label}</p>
                          <p className="mt-1 text-[12px] leading-snug text-[var(--text-secondary)]">{item.detail}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium mb-4">Connected next</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {CONNECTED_ACTIONS.map(action => (
                    <div key={action.label} className="flex items-start gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                      <div className="icon-shell-neutral flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border">
                        <span className="material-symbols-rounded text-[17px]">{action.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{action.label}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">{action.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </motion.div>
          </div>

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {deleteConfirmId && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirmId(null)} className="fixed inset-0 bg-[var(--bg-elevated)]/50 backdrop-blur-sm z-50 transition-all" />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="w-full max-w-sm rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-2xl">
                    <h3 className="text-[14px] font-medium text-[var(--text-primary)] mb-2">Delete Resume?</h3>
                    <p className="text-[12px] text-[var(--text-secondary)] mb-6">This action cannot be undone.</p>
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-[6px] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">Cancel</button>
                      <button onClick={confirmDelete} className="px-4 py-2 rounded-[6px] text-[12px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all">Delete</button>
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
    const intelligenceScores = [
      { label: 'Role Fit', value: matchScore || proofData?.optimizedScore || 0, icon: 'my_location', hint: 'JD alignment' },
      { label: 'ATS', value: resumeCheckResult?.atsScore || matchScore || 0, icon: 'fact_check', hint: 'Machine readability' },
      { label: 'Clarity', value: resumeCheckResult?.sectionScores?.content || resumeCheckResult?.sectionScores?.summary || resumeCheckResult?.atsScore || 0, icon: 'notes', hint: 'Readable signal' },
      { label: 'Proof Strength', value: proofData?.optimizedScore || matchScore || 0, icon: 'verified', hint: 'Evidence density' },
    ];
    const recommendationGroups = [
      {
        id: 'safe-polish',
        label: 'Safe Polish',
        kicker: 'Highest impact',
        icon: 'shield',
        tone: 'emerald',
        items: (resumeCheckResult?.issues || []).slice(0, 3).map((text: string, index: number) => ({
          id: `safe-polish-${index}-${text.slice(0, 36)}`,
          text,
          why: 'This is the kind of mismatch recruiters and ATS notice before they read deeply.',
          direction: 'Use precise, role-aligned evidence while preserving the facts already in your resume.',
        })),
        empty: 'No high-priority cleanup items found yet.',
      },
      {
        id: 'should-improve',
        label: 'Should Improve',
        kicker: 'Strength builders',
        icon: 'tune',
        tone: 'amber',
        items: (resumeCheckResult?.suggestions || []).slice(0, 4).map((text: string, index: number) => ({
          id: `should-improve-${index}-${text.slice(0, 36)}`,
          text,
          why: 'These changes raise skim value and make the resume easier to match to the job.',
          direction: 'Clarify scope, keywords, tools, and outcomes without over-writing your experience.',
        })),
        empty: 'Run the scan to reveal targeted improvements.',
      },
      {
        id: 'polish',
        label: 'Polish',
        kicker: 'Final pass',
        icon: 'auto_fix_high',
        tone: 'cyan',
        items: [
          'Tighten the opening summary around the target role.',
          'Keep quantified outcomes near the top of each role.',
          'Confirm the final template preserves conventional, clearly labeled headings.',
        ].map((text, index) => ({
          id: `polish-${index}-${text.slice(0, 36)}`,
          text,
          why: 'Small presentation choices change what a recruiter remembers after the first skim.',
          direction: 'Keep the final version concise, evidence-led, and easy to scan.',
        })),
        empty: '',
      },
    ].map(group => ({
      ...group,
      visibleItems: group.items.filter((item: RecommendationDeckItem) => !handledRecommendations[item.id]),
      handledItems: group.items.filter((item: RecommendationDeckItem) => handledRecommendations[item.id]),
    }));
    const visibleRecommendations = recommendationGroups.flatMap(group => group.visibleItems);
    const missingKeywords = proofData?.topJDTerms?.filter(term => term.matchedIn === 'neither' || term.matchedIn === 'original_only').slice(0, 8) || [];
    const coveredKeywords = proofData?.topJDTerms?.filter(term => term.matchedIn === 'both' || term.matchedIn === 'morphed_only').slice(0, 8) || [];
    const skimHighlights = [
      displayResume?.title,
      displayResume?.summary?.split('.').filter(Boolean)[0],
      skillLabels(displayResume).slice(0, 5).join(', '),
    ].filter(Boolean);
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
          {false && <>
          <SuiteToolHeader
            tool="resume"
            subtitle="Import, target, polish, template, and export."
            actions={
              <>
              <button onClick={resetAll} className="px-3 md:px-4 py-2 rounded-xl bg-[var(--theme-bg-elevated)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-hover)] hover:text-[var(--theme-text)] transition-all text-sm">
                ← Start Over
              </button>
              </>
            }
          />

          {/* Progress Steps */}
          {ENABLE_RESUME_REVIEW_WORKBENCH ? (
            <ResumeStudioProgress
              current={(
                step === 'upload'
                  ? 'source'
                  : step === 'jd'
                    ? isLoading ? 'shape' : 'target'
                    : step === 'template'
                      ? 'design'
                      : 'ship'
              ) as ResumeStudioStage}
            />
          ) : (
          <div className="max-w-5xl mx-auto mb-8">
            <div className="flex items-center justify-between">
              {[
                { id: 'upload', label: 'Upload', icon: 'description' },
                { id: 'jd', label: 'Role Target', icon: 'work' },
                { id: 'enhance', label: 'Resume Intelligence', icon: 'auto_awesome', pro: true },
                { id: 'template', label: 'Template', icon: 'palette' },
                { id: 'preview', label: 'Export', icon: 'arrow_downward' },
              ].map((s, i) => {
                const isEnhanceLocked = s.id === 'enhance' && !isPro;
                const canNavigate = s.id === 'upload'
                  || (s.id === 'jd' && hasResumeData(originalResume))
                  || (s.id === 'enhance' && isPro && displayResume)
                  || ((s.id === 'template' || s.id === 'preview') && displayResume);
                return (
                <div key={s.id} className="flex items-center">
                  <button
                    onClick={() => {
                      if (isEnhanceLocked) { showToast('Resume Intelligence is a Standard feature', 'info'); return; }
                      if (canNavigate) setStep(s.id as any);
                    }}
                    className={`flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2.5 rounded-xl transition-all text-xs md:text-sm whitespace-nowrap shadow-sm ${
                      step === s.id ? (s.pro ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20') :
                      isEnhanceLocked ? 'bg-[var(--bg-surface)] opacity-60 border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed' :
                      canNavigate ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--text-secondary)] border border-[var(--border-subtle)]' :
                      'bg-[var(--bg-surface)] opacity-60 border border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                    }`}
                  >
                    <span className="material-symbols-rounded text-[18px] md:text-[20px]">{isEnhanceLocked ? 'lock' : s.icon}</span>
                    <span className="hidden md:inline font-medium whitespace-nowrap">{s.label}</span>
                    {s.pro && <span className={`hidden md:inline text-[8px] px-1.5 py-0.5 rounded-md ${isPro ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'bg-[var(--border-subtle)] border border-[var(--text-muted)] text-[var(--text-secondary)]'} font-black tracking-widest`}>{PAID_TEMPLATE_PLAN_LABEL}</span>}
                  </button>
                  {i < 4 && <div className={`w-4 md:w-10 h-px mx-1 hidden sm:block ${s.id === 'enhance' || (s.id === 'jd' && isPro) ? 'bg-emerald-500/30' : 'bg-[var(--border-subtle)]'}`} />}
                </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-[13px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="material-symbols-rounded text-[16px] text-emerald-500">{user ? 'cloud_done' : 'sync_saved_locally'}</span>
                {user ? 'Draft saved locally · save to library when ready' : 'Draft saved locally · sign in to save everywhere'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Recommended next: {step === 'jd' ? 'Optimize' : step === 'enhance' ? 'Choose Template' : step === 'template' ? 'Export or Save' : 'Confirm source'}
              </div>
            </div>
          </div>
          )}
          </>}

          {educationInstitutionGaps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-[18px] border border-rose-500/25 bg-rose-500/[0.06] p-4 md:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[13px] border border-rose-500/20 bg-rose-500/10">
                    <span className="material-symbols-rounded text-[22px] text-rose-600">school</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-rose-600 font-semibold">Taco needs school info</p>
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
                        className="min-h-[44px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-[16px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/10 md:text-[14px]"
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
                      <motion.div key="source-ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-4xl mx-auto rounded-[18px] border border-emerald-500/20 bg-[var(--bg-surface)] p-5 md:p-6">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-[14px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-rounded text-[24px] text-emerald-500">task_alt</span>
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
                              className="px-4 py-2.5 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowSourceConfirmation(false);
                                setStep('jd');
                              }}
                              className="px-4 py-2.5 rounded-[11px] bg-[var(--text-primary)] text-[var(--bg-deep)] text-[12px] font-semibold hover:opacity-90"
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
                              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                              <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                          <p className="text-[12px] font-semibold text-[var(--text-primary)]">{originalResume.name || 'Imported resume'}</p>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{originalResume.title || 'Target role pending'}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {skillLabels(originalResume).slice(0, 8).map(skill => (
                              <span key={skill} className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 text-[10px] font-medium">{skill}</span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    ) : invalidDocumentError ? (
                      <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-2xl mx-auto p-8 rounded-2xl bg-red-500/[0.05] border border-red-500/20 text-center space-y-5 backdrop-blur-md">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-3xl mx-auto border border-red-500/20"><span className="material-symbols-rounded align-middle mr-1">description</span><span className="material-symbols-rounded align-middle mr-1">cancel</span></div>
                        <div>
                          <h3 className="text-xl font-bold text-white mb-2">This doesn't look like a resume</h3>
                          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
                            Our AI parser couldn't detect standard structural elements like Work Experience, Education, or Skills in the uploaded file.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-4">
                          <button onClick={() => setInvalidDocumentError(false)} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/5 transition-all font-medium text-slate-300 border border-white/10">
                            Try Another File
                          </button>
                          <button onClick={() => { setInvalidDocumentError(false); setMode('create'); }} className="w-full sm:w-auto px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 transition-all font-bold text-white shadow-[0_4px_15px_rgba(6,182,212,0.3)]">
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
                  <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="p-5 md:p-6 border-b border-[var(--border-subtle)] flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Role target</p>
                        <h2 className="text-[20px] md:text-[22px] font-semibold text-[var(--text-primary)] mt-1">Paste the job. We will shape the resume around it.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-2xl">The optimizer uses the job description to tune summary, bullets, skills, title language, ATS terms, and final page length.</p>
                      </div>
                      <div className="hidden sm:flex h-10 w-10 rounded-[10px] bg-amber-500/10 border border-amber-500/15 text-amber-600 items-center justify-center flex-shrink-0">
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
                        className="w-full min-h-[260px] px-4 py-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 resize-y leading-relaxed text-[14px]"
                      />

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                          { label: 'Role', value: jdSignals.role },
                          { label: 'Company', value: jdSignals.company },
                          { label: 'Seniority', value: jdSignals.seniority },
                          { label: 'Detail', value: `${jdSignals.wordCount} words` },
                        ].map(signal => (
                          <div key={signal.label} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-3 min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">{signal.label}</p>
                            <p className="text-[12px] text-[var(--text-primary)] font-medium mt-1 truncate">{signal.value}</p>
                          </div>
                        ))}
                      </div>

                      {jdSignals.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {jdSignals.keywords.map(keyword => (
                            <span key={keyword} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 border border-amber-500/15 text-amber-600">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <aside className="space-y-4">
                    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-9 h-9 rounded-[10px] bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)] flex items-center justify-center flex-shrink-0">
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
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
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
                                  ? 'bg-amber-500/[0.08] border-amber-500/25'
                                  : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border)]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{modeOption.label}</p>
                                {isSelected && <span className="material-symbols-rounded text-[16px] text-amber-600">check_circle</span>}
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
                            className="w-full accent-amber-500"
                          />
                          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                            <span>Light</span>
                            <span>Balanced</span>
                            <span>Maximum</span>
                          </div>
                        </div>
                      </details>

                      {!morphConsent.unlocked100 && (
                        <div className="mt-3 rounded-[12px] border border-amber-500/20 bg-amber-500/[0.08] p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-rounded text-[17px] text-amber-600 mt-0.5">lock</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-semibold text-[var(--text-primary)]">100% Morph is locked</p>
                              <p className="text-[11px] mt-1 leading-relaxed text-[var(--text-secondary)]">
                                Resume Morph is capped at {RESUME_MORPH_DEFAULT_MAX}% until you unlock maximum strength in Settings. Education and other protected facts stay locked either way.
                              </p>
                              <button
                                type="button"
                                onClick={() => router.push('/suite/settings?tab=ai-safety')}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-600 hover:bg-amber-500/15"
                              >
                                <span className="material-symbols-rounded text-[15px]">settings</span>
                                Open AI Safety settings
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {morphConsent.unlocked100 && morphPercentage === RESUME_MORPH_FULL_UNLOCK && (
                        <div className="mt-3 rounded-[12px] border border-emerald-500/20 bg-emerald-500/[0.08] p-3">
                          <div className="flex items-start gap-2.5">
                            <span className="material-symbols-rounded text-[17px] text-emerald-600 mt-0.5">verified_user</span>
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
                            : 'bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 shadow-sm'
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
                      className="w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-amber-500/25 transition-all p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-rounded text-[18px]">{isBlueprintLoading ? 'hourglass_top' : 'content_paste'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                            {isBlueprintLoading ? 'Generating blueprint...' : 'Day-Zero Blueprint'} {!isPro && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 font-bold">{PAID_TEMPLATE_PLAN_LABEL}</span>}
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
            {step === 'enhance' && (
              <motion.div key="enhance" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <div className="max-w-6xl mx-auto">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide mb-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <span className="material-symbols-rounded text-[14px]">verified</span>
                        Resume Intelligence
                      </div>
                      <h2 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">Polish the version before it leaves the studio.</h2>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-2xl">Run a quality scan, apply focused improvements, and send the same resume context into follow-up tools when you are ready.</p>
                    </div>
                    <button onClick={() => setStep('template')} className="px-4 py-2.5 rounded-[12px] font-medium text-sm transition-all bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90">
                      Continue to Template →
                    </button>
                  </div>

                  {/* Animated Pipeline Indicator */}
                  {enhancePipelineStage > 0 && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 p-4 rounded-xl border overflow-hidden relative ${
                      isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.06]'
                    }`}>
                      <div className={`absolute inset-0 ${isLight ? 'bg-gradient-to-r from-slate-50/50 via-indigo-50/30 to-slate-50/50' : 'bg-gradient-to-r from-white/[0.01] via-indigo-500/[0.02] to-white/[0.01]'}`} />
                      <div className="relative flex items-center gap-4">
                        {[
                          { label: 'Writing', stage: 1 },
                          { label: 'Checking', stage: 2 },
                          { label: 'Refining', stage: 3 },
                        ].map((p) => (
                          <div key={p.stage} className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                              enhancePipelineStage > p.stage ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
                              enhancePipelineStage === p.stage ? (isLight ? 'bg-cyan-500 animate-pulse shadow-[0_0_12px_rgba(6,182,212,0.5)]' : 'bg-cyan-400 animate-pulse shadow-[0_0_12px_rgba(6,182,212,0.8)]') :
                              isLight ? 'bg-slate-200' : 'bg-white/10'
                            }`} />
                            <span className={`text-xs font-medium ${
                              enhancePipelineStage > p.stage ? (isLight ? 'text-emerald-600' : 'text-emerald-400') :
                              enhancePipelineStage === p.stage ? (isLight ? 'text-cyan-600' : 'text-cyan-400') :
                              isLight ? 'text-slate-400' : 'text-slate-600'
                            }`}>{p.label}</span>
                            {p.stage < 3 && <div className={`w-8 h-px ${enhancePipelineStage > p.stage ? (isLight ? 'bg-emerald-300' : 'bg-emerald-500/40') : (isLight ? 'bg-slate-200' : 'bg-white/10')}`} />}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {intelligenceScores.map(score => (
                      <div key={score.label} className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">{score.label}</p>
                            <p className="mt-2 text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">{score.value ? `${score.value}` : '—'}<span className="text-[12px] font-medium text-[var(--text-muted)]">{score.value ? '/100' : ''}</span></p>
                          </div>
                          <div className="w-9 h-9 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center justify-center">
                            <span className="material-symbols-rounded text-[17px] text-[var(--text-secondary)]">{score.icon}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-3">{score.hint}</p>
                      </div>
                    ))}
                  </div>

                  {guardrailReport && (
                    <div className="mb-6 rounded-[16px] border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-rounded text-[22px] text-emerald-600">verified_user</span>
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">Truth guardrails applied</p>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                              Protected facts were checked after the rewrite. Education, credentials, employers, job titles, dates, and contact fields stay tied to your source resume.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)]">
                            {guardrailReport.effectiveMorphPercentage}% strength
                          </span>
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[var(--text-secondary)]">
                            {guardrailReport.blockedChangeCount || 0} protected edits blocked
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {morphProofReport && (
                    <div className="mb-6">
                      <ProofEngineReport report={morphProofReport} />
                    </div>
                  )}

                  <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6 items-start">
                    {/* Left: Resume Check + Apply Improvements */}
                    <div className="space-y-4">
                      {/* Resume Quality Check */}
                      <div className="rounded-[16px] p-5 border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--text-primary)]"><span className="material-symbols-rounded text-inherit align-middle">search</span> Quality Scan</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">ATS + clarity</span>
                          </div>
                          <button onClick={() => { setEnhancePhase('checking'); setEnhancePipelineStage(2); checkResume(); }} disabled={resumeCheckLoading} className="px-3 py-1.5 rounded-[9px] text-xs font-medium transition-all disabled:opacity-50 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)]">
                            {resumeCheckLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">search</span> Scanning...</> : resumeCheckResult ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">sync</span> Re-scan</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">play_arrow</span> Run Scan</>}
                          </button>
                        </div>

                        {/* Check Loading Animation */}
                        {resumeCheckLoading && (
                          <div className="py-4">
                            <AssistantThinkingTile
                              variant="resume"
                              icon="fact_check"
                              title="Taco is reviewing resume intelligence"
                              description="Parsing structure, ATS compatibility, keyword quality, and priority suggestions."
                              activeStage="scanning"
                              stages={['Structure', 'ATS', 'Keywords', 'Suggestions']}
                              compact
                            />
                          </div>
                        )}

                        {/* Check Results */}
                        {resumeCheckResult && !resumeCheckLoading && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                            {/* Score Header */}
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div className={`text-4xl font-black ${resumeCheckResult.atsScore >= 80 ? 'text-green-400' : resumeCheckResult.atsScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {resumeCheckResult.overallGrade}
                                </div>
                                {preFixScore && preFixScore < resumeCheckResult.atsScore && (
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-3 text-[9px] px-1 py-0.5 rounded bg-green-500/20 border border-green-500/30 text-green-400 font-bold">
                                    +{resumeCheckResult.atsScore - preFixScore}
                                  </motion.div>
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className={isLight ? 'text-slate-500' : 'text-white/50'}>ATS Score</span>
                                  <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>{resumeCheckResult.atsScore}/100</span>
                                </div>
                                <div className={`h-2 rounded-full mt-1 overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-white/5'}`}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${resumeCheckResult.atsScore}%` }} transition={{ duration: 1, ease: 'easeOut' }} className={`h-full rounded-full ${resumeCheckResult.atsScore >= 80 ? 'bg-green-500' : resumeCheckResult.atsScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} />
                                </div>
                              </div>
                            </div>

                            {/* Section Scores */}
                            {resumeCheckResult.sectionScores && (
                              <div className="grid grid-cols-5 gap-1.5">
                                {Object.entries(resumeCheckResult.sectionScores).map(([key, val]: [string, any]) => (
                                  <div key={key} className={`text-center p-2 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                                    <div className={`text-[9px] capitalize ${isLight ? 'text-slate-500' : 'text-white/40'}`}>{key}</div>
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className={`text-sm font-bold ${val >= 80 ? (isLight ? 'text-green-600' : 'text-green-400') : val >= 60 ? (isLight ? 'text-amber-600' : 'text-amber-400') : (isLight ? 'text-red-600' : 'text-red-400')}`}>{val}</motion.div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Suggestions */}
                            {resumeCheckResult.suggestions?.length > 0 && (
                              <div className="space-y-1.5">
                                <div className={`text-xs font-semibold ${isLight ? 'text-slate-500' : 'text-white/50'}`}><span className="material-symbols-rounded text-inherit align-middle">lightbulb</span> Suggestions</div>
                                {resumeCheckResult.suggestions.map((s: string, i: number) => (
                                  <motion.div key={i} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className={`text-[11px] flex gap-1.5 p-2.5 rounded-lg ${isLight ? 'text-slate-700 bg-slate-50 border border-slate-200' : 'text-white/60 bg-white/[0.02] border border-white/[0.05]'}`}>
                                    <span className={`shrink-0 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`}>→</span> {s}
                                  </motion.div>
                                ))}
                              </div>
                            )}

                            {/* Auto-Fix Button */}
                            <button
                              onClick={autoFixResume}
                              disabled={autoFixing}
                              className={`w-full py-3 rounded-xl font-bold text-sm border transition-all disabled:opacity-50 relative overflow-hidden ${
                                isLight
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-gradient-to-r from-emerald-500/[0.1] to-cyan-500/[0.1] border-emerald-500/[0.2] text-emerald-400 hover:from-emerald-500/[0.15] hover:to-cyan-500/[0.15]'
                              }`}
                            >
                              {autoFixing ? (
                                <span className="flex items-center justify-center gap-2">
                                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><span className="material-symbols-rounded text-inherit align-middle">sync</span></motion.span>
                                  Applying improvements...
                                </span>
                              ) : (
                                <><span className="material-symbols-rounded text-inherit align-middle">build</span> Apply Recommended Improvements</>
                              )}
                              {autoFixing && <motion.div className={`absolute bottom-0 left-0 h-0.5 ${isLight ? 'bg-emerald-500' : 'bg-emerald-400'}`} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 15, ease: 'linear' }} />}
                            </button>

                            {/* Skill Bridge CTA */}
                            {resumeCheckResult && !autoFixing && (
                              <button
                                onClick={() => router.push(`/suite/skill-bridge`)}
                                className={`w-full py-2.5 rounded-xl text-[11px] font-semibold border transition-all flex items-center justify-center gap-2 ${
                                  isLight
                                    ? 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'
                                    : 'bg-gradient-to-r from-cyan-500/[0.06] to-emerald-500/[0.06] border-cyan-500/[0.12] text-cyan-400 hover:from-cyan-500/[0.1] hover:to-emerald-500/[0.1]'
                                }`}
                              >
                                <span className="material-symbols-rounded text-[16px]">bridge</span> Bridge Your Gaps
                              </button>
                            )}
                          </motion.div>
                        )}
                      </div>

                      <div className="rounded-[16px] p-5 border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Priority Review</p>
                            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mt-1">What deserves attention first</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {resumeCheckResult && visibleRecommendations.length > 0 && (
                              <button
                                onClick={() => {
                                  setHandledRecommendations(prev => ({
                                    ...prev,
                                    ...Object.fromEntries(visibleRecommendations.map(item => [item.id, 'applied'] as const)),
                                  }));
                                  autoFixResume();
                                }}
                                disabled={resumeCheckLoading || autoFixing}
                                className="px-3 py-2 rounded-[10px] bg-emerald-500/10 border border-emerald-500/20 text-[12px] font-semibold text-emerald-600 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
                              >
                                Apply All
                              </button>
                            )}
                            <button
                              onClick={resumeCheckResult ? autoFixResume : checkResume}
                              disabled={resumeCheckLoading || autoFixing}
                              className="px-3 py-2 rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-50"
                            >
                              {resumeCheckResult ? 'Safe Polish' : 'Run Scan'}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {recommendationGroups.map(group => (
                            <div
                              key={group.label}
                              className="relative overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3"
                            >
                              <div
                                className={`pointer-events-none absolute inset-x-3 top-11 h-px ${
                                  group.tone === 'emerald'
                                    ? 'bg-gradient-to-r from-emerald-500/30 via-transparent to-transparent'
                                    : group.tone === 'amber'
                                      ? 'bg-gradient-to-r from-amber-500/30 via-transparent to-transparent'
                                      : 'bg-gradient-to-r from-cyan-500/30 via-transparent to-transparent'
                                }`}
                              />
                              <div className="flex items-center gap-2 mb-3">
                                <span className={`material-symbols-rounded text-[17px] ${
                                  group.tone === 'emerald' ? 'text-emerald-500' : group.tone === 'amber' ? 'text-amber-500' : 'text-cyan-500'
                                }`}>{group.icon}</span>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">{group.label}</p>
                                  <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{group.kicker}</p>
                                </div>
                                <span className="ml-auto rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                                  {group.visibleItems.length}/{group.items.length}
                                </span>
                              </div>
                              <div className="relative min-h-[150px]">
                                <AnimatePresence mode="popLayout">
                                  {group.visibleItems.length > 0 ? group.visibleItems.map((item: RecommendationDeckItem, index: number) => (
                                  <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1, rotate: index === 0 ? 0 : index % 2 === 0 ? 0.45 : -0.45 }}
                                    exit={{ opacity: 0, x: 48, scale: 0.96, filter: 'blur(4px)' }}
                                    transition={{ type: 'spring', bounce: 0.18, duration: 0.42 }}
                                    className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
                                    style={{
                                      marginTop: index === 0 ? 0 : -4,
                                      zIndex: group.visibleItems.length - index,
                                    }}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div
                                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border ${
                                          group.tone === 'emerald'
                                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                                            : group.tone === 'amber'
                                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-600'
                                              : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600'
                                        }`}
                                      >
                                        <span className="material-symbols-rounded text-[15px]">{index === 0 ? 'priority' : 'task_alt'}</span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[12px] leading-relaxed text-[var(--text-primary)]">{item.text}</p>
                                        <div className="grid sm:grid-cols-2 gap-2 mt-3">
                                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-2.5">
                                            <p className="text-[9px] uppercase tracking-[0.11em] text-[var(--text-muted)]">Why it matters</p>
                                            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-1">{item.why}</p>
                                          </div>
                                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-2.5">
                                            <p className="text-[9px] uppercase tracking-[0.11em] text-[var(--text-muted)]">Better direction</p>
                                            <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-1">{item.direction}</p>
                                          </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <button
                                            onClick={() => {
                                              resolveRecommendation(item.id, 'applied');
                                              if (resumeCheckResult && !autoFixing) autoFixResume();
                                            }}
                                            disabled={!resumeCheckResult || autoFixing}
                                            className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 transition hover:bg-emerald-500/15 disabled:opacity-50"
                                          >
                                            <span className="material-symbols-rounded text-[14px]">check</span>
                                            Apply
                                          </button>
                                          <button
                                            onClick={() => resolveRecommendation(item.id, 'kept')}
                                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                                          >
                                            Keep
                                          </button>
                                          <button
                                            onClick={() => resolveRecommendation(item.id, 'passed')}
                                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                                          >
                                            Pass
                                          </button>
                                          <button
                                            onClick={() => resolveRecommendation(item.id, 'ignored')}
                                            className="inline-flex items-center gap-1.5 rounded-[10px] border border-transparent px-2 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)]"
                                          >
                                            Ignore
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )) : (
                                  <motion.div
                                    key={`${group.id}-empty`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="flex min-h-[132px] items-center justify-center rounded-[14px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-5 text-center"
                                  >
                                    <div className="w-full max-w-[320px]">
                                      <span className="material-symbols-rounded text-[20px] text-emerald-500">check_circle</span>
                                      <p className="mt-2 text-[12px] font-semibold text-[var(--text-primary)]">
                                        {group.handledItems.length > 0
                                          ? `${group.handledItems.length} of ${group.items.length} reviewed`
                                          : group.items.length > 0
                                            ? `${group.items.length} of ${group.items.length} clear`
                                            : 'Nothing pending yet'}
                                      </p>
                                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{group.empty || 'This deck is clear.'}</p>
                                      {group.handledItems.length > 0 && (
                                        <div className="mt-3 grid grid-cols-4 gap-1.5">
                                          {[
                                            { label: 'Applied', value: group.handledItems.filter((item: RecommendationDeckItem) => handledRecommendations[item.id] === 'applied').length, tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/15' },
                                            { label: 'Kept', value: group.handledItems.filter((item: RecommendationDeckItem) => handledRecommendations[item.id] === 'kept').length, tone: 'text-cyan-600 bg-cyan-500/10 border-cyan-500/15' },
                                            { label: 'Passed', value: group.handledItems.filter((item: RecommendationDeckItem) => handledRecommendations[item.id] === 'passed').length, tone: 'text-amber-600 bg-amber-500/10 border-amber-500/15' },
                                            { label: 'Ignored', value: group.handledItems.filter((item: RecommendationDeckItem) => handledRecommendations[item.id] === 'ignored').length, tone: 'text-[var(--text-muted)] bg-[var(--bg-card)] border-[var(--border-subtle)]' },
                                          ].map(metric => (
                                            <div key={metric.label} className={`rounded-[10px] border px-2 py-1.5 ${metric.tone}`}>
                                              <p className="text-[12px] font-semibold leading-none">{metric.value}</p>
                                              <p className="mt-1 text-[8px] uppercase tracking-[0.08em] opacity-80">{metric.label}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                                </AnimatePresence>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Next Steps: Cover Letter & LinkedIn ── */}
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <div className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wider">Connected next moves</div>
                        <div className="space-y-2.5">
                          {/* Cover Letter — No-Navigate */}
                          <button
                            onClick={() => {
                              const displayResume = getDisplayResume();
                              if (displayResume) {
                                sessionStorage.setItem('talent-resume-draft', JSON.stringify({
                                  morphedResume: displayResume,
                                  originalResume: originalResume,
                                  jobDescription: jobDescription,
                                  companyName: applicationData.companyName || '',
                                  jobTitle: displayResume.title || applicationData.jobTitle || '',
                                }));
                              }
                              setCoverLetterSent(true);
                              showToast('Resume & JD sent to Cover Letter tool. Open it anytime from the sidebar.', 'check_circle');
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all group text-left ${
                              coverLetterSent
                                ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)]'
                            }`}
                          >
                            <div className="icon-shell-neutral w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0">
                              <span className={`material-symbols-rounded text-[18px] ${coverLetterSent ? 'icon-status-success' : ''}`}>{coverLetterSent ? 'check_circle' : 'mail'}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{coverLetterSent ? '✓ Sent to Cover Letter' : 'Generate Cover Letter'}</p>
                              <p className="text-[11px] text-[var(--text-muted)]">{coverLetterSent ? 'Resume & JD ready. Open from sidebar when you\'re done here' : 'Auto-filled with this resume and role target'}</p>
                            </div>
                            {coverLetterSent ? (
                              <span
                                onClick={(e) => { e.stopPropagation(); router.push('/suite/cover-letter'); }}
                                className="text-[11px] font-medium text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer whitespace-nowrap"
                              >Open →</span>
                            ) : (
                              <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">send</span>
                            )}
                          </button>

                          {/* LinkedIn — No-Navigate */}
                          <button
                            onClick={() => {
                              const displayResume = getDisplayResume();
                              if (displayResume) {
                                sessionStorage.setItem('talent-resume-draft', JSON.stringify({
                                  morphedResume: displayResume,
                                  originalResume: originalResume,
                                  jobDescription: jobDescription,
                                  companyName: applicationData.companyName || '',
                                  jobTitle: displayResume.title || applicationData.jobTitle || '',
                                }));
                              }
                              setLinkedInSent(true);
                              showToast('Resume & JD sent to LinkedIn Optimizer. Open it anytime from the sidebar.', 'check_circle');
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all group text-left ${
                              linkedInSent
                                ? 'border-blue-500/30 bg-blue-500/[0.04]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)]'
                            }`}
                          >
                            <div className="icon-shell-neutral w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0">
                              <span className={`material-symbols-rounded text-[18px] ${linkedInSent ? 'icon-status-success' : ''}`}>{linkedInSent ? 'check_circle' : 'work'}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{linkedInSent ? '✓ Sent to LinkedIn Optimizer' : 'Optimize LinkedIn Profile'}</p>
                              <p className="text-[11px] text-[var(--text-muted)]">{linkedInSent ? 'Resume & JD ready. Open from sidebar when you\'re done here' : 'Headline, about, skills optimized for recruiter search'}</p>
                            </div>
                            {linkedInSent ? (
                              <span
                                onClick={(e) => { e.stopPropagation(); router.push('/suite/linkedin'); }}
                                className="text-[11px] font-medium text-blue-500 hover:text-blue-400 transition-colors cursor-pointer whitespace-nowrap"
                              >Open →</span>
                            ) : (
                              <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">send</span>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              const displayResume = getDisplayResume();
                              if (displayResume) {
                                // Format resume to text for interview sim
                                const parts: string[] = [];
                                if (displayResume.name) parts.push(displayResume.name);
                                if (displayResume.title) parts.push(displayResume.title);
                                if (displayResume.summary) parts.push(displayResume.summary);
                                if (displayResume.skills?.length) parts.push(`Skills: ${skillLabels(displayResume).join(', ')}`);
                                if (displayResume.experience?.length) {
                                  parts.push('Experience:');
                                  displayResume.experience.forEach((e: any) => {
                                    parts.push(`${e.role || e.title} at ${e.company} (${e.duration || e.date || ''})`);
                                    if (e.achievements?.length) e.achievements.forEach((a: string) => parts.push(`• ${a}`));
                                    if (e.description) parts.push(e.description);
                                  });
                                }
                                sessionStorage.setItem('tc_morphed_resume', parts.join('\n\n'));
                              }
                              if (jobDescription) {
                                sessionStorage.setItem('tc_morphed_jd', jobDescription);
                              }
                              router.push('/suite/interview-sim?mode=full_mock');
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] transition-all group text-left"
                          >
                            <div className="icon-shell-neutral w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-rounded text-[18px]">swords</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Practice Interview</p>
                              <p className="text-[11px] text-[var(--text-muted)]">Interview Studio with this JD + resume</p>
                            </div>
                            <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">arrow_forward</span>
                          </button>
                        </div>
                      </div>

                      <div className="lg:hidden space-y-4">
                      {/* ── Saved Blueprints ── */}
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <button
                          onClick={() => {
                            setShowSavedBlueprints(!showSavedBlueprints);
                            // Refresh from localStorage
                            try { setSavedBlueprints(JSON.parse(localStorage.getItem('tc_blueprints') || '[]')); } catch {}
                          }}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-rounded icon-neutral text-[16px]">content_paste</span>
                            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Saved Blueprints</span>
                            {savedBlueprints.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold">{savedBlueprints.length}</span>
                            )}
                          </div>
                          <span className={`material-symbols-rounded text-[16px] text-[var(--text-muted)] transition-transform duration-200 ${showSavedBlueprints ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        <AnimatePresence>
                          {showSavedBlueprints && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 space-y-2">
                                {savedBlueprints.length === 0 ? (
                                  <p className="text-[11px] text-[var(--text-muted)] text-center py-3">No blueprints yet. Generate one from the JD step.</p>
                                ) : (
                                  savedBlueprints.map((bp) => (
                                    <div
                                      key={bp.id}
                                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] transition-all group cursor-pointer"
                                      onClick={() => {
                                        setBlueprintContent(bp.content);
                                        setShowBlueprintModal(true);
                                      }}
                                    >
                                      <div className="icon-shell-neutral w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-rounded text-[16px]">description</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{bp.targetRole || 'Day-Zero Blueprint'}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">{new Date(bp.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = savedBlueprints.filter(b => b.id !== bp.id);
                                          setSavedBlueprints(updated);
                                          localStorage.setItem('tc_blueprints', JSON.stringify(updated));
                                          showToast('Blueprint deleted', 'delete');
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10"
                                        title="Delete blueprint"
                                      >
                                        <span className="material-symbols-rounded text-[14px] text-red-400">close</span>
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Quick Stats */}
                      <div className={`rounded-xl p-4 border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                        <div className={`text-xs font-semibold mb-3 ${isLight ? 'text-slate-400' : 'text-white/40'}`}>Session Summary</div>
                        <div className="grid grid-cols-1 gap-3 text-center">
                          <div className={`p-3 rounded-lg ${isLight ? 'bg-slate-50' : 'bg-white/[0.03]'}`}>
                            <div className={`text-2xl font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>{resumeCheckResult?.atsScore || '—'}</div>
                            <div className={`text-[9px] mt-1 ${isLight ? 'text-slate-400' : 'text-white/40'}`}>ATS Score</div>
                          </div>
                        </div>
                      </div>

                      {/* Navigation */}
                      <div className="flex gap-3">
                        <button onClick={() => setStep('jd')} className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${isLight ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12]'}`}>
                          ← Back to role target
                        </button>
                        <button onClick={() => setStep('template')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${isLight ? 'bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100' : 'bg-indigo-500/[0.08] border border-indigo-500/[0.15] text-indigo-400 hover:bg-indigo-500/[0.12]'}`}>
                          Choose Template →
                        </button>
                      </div>
                      </div>
                    </div>

                    <div className="hidden lg:block space-y-4 sticky top-6">
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Live Preview</p>
                            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mt-1">{displayResume?.title || 'Optimized resume'}</h3>
                          </div>
                          <button onClick={() => setStep('template')} className="px-3 py-2 rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all">
                            Templates
                          </button>
                        </div>
                        {displayResume && (
                          <div className="h-[620px] overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-white">
                            <div className="origin-top scale-[0.72] w-[138.5%] pointer-events-none">
                              <MemoizedResumeTemplate resume={displayResume} template={selectedTemplateWithPalette} />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={resumeCheckResult ? autoFixResume : checkResume}
                          disabled={resumeCheckLoading || autoFixing}
                          className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--border)] transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-rounded text-[18px] text-emerald-500">auto_fix_high</span>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-2">Safe Polish</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">Low-risk cleanup only.</p>
                        </button>
                        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                          <span className="material-symbols-rounded text-[18px] text-cyan-500">travel_explore</span>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-2">Keyword Map</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(coveredKeywords.length ? coveredKeywords : jdSignals.keywords.slice(0, 5).map(term => ({ term }))).map((term: any) => (
                              <span key={term.term} className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] border border-emerald-500/15">{term.term}</span>
                            ))}
                            {missingKeywords.slice(0, 3).map(term => (
                              <span key={term.term} className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[10px] border border-amber-500/15">{term.term}</span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                          <span className="material-symbols-rounded text-[18px] text-violet-500">rule</span>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-2">Proof Checker</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-1">{proofData ? `${proofData.gapsClosed.length} keyword gaps closed. ${proofData.improvement}.` : 'Run optimization proof to flag vague claims.'}</p>
                        </div>
                        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                          <span className="material-symbols-rounded text-[18px] text-amber-500">visibility</span>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-2">Skim Test</p>
                          <div className="mt-2 space-y-1">
                            {skimHighlights.slice(0, 3).map((highlight, index) => (
                              <p key={index} className="text-[11px] text-[var(--text-secondary)] line-clamp-1">{highlight}</p>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-rounded text-[17px] text-[var(--text-secondary)]">compare_arrows</span>
                          <p className="text-[12px] font-semibold text-[var(--text-primary)]">Version Compare</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Original', value: sourceResumeMeta.fileName ? 'Uploaded' : 'Draft' },
                            { label: 'Optimized', value: matchScore ? `${matchScore}%` : 'Ready' },
                            { label: 'Final', value: selectedTemplate.name },
                          ].map(item => (
                            <div key={item.label} className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                              <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                              <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Finish Controls ── */}
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <button
                          onClick={() => {
                            setShowSavedBlueprints(!showSavedBlueprints);
                            try { setSavedBlueprints(JSON.parse(localStorage.getItem('tc_blueprints') || '[]')); } catch {}
                          }}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-rounded icon-neutral text-[17px]">content_paste</span>
                            <div className="min-w-0">
                              <span className="block text-[12px] font-semibold text-[var(--text-primary)]">Saved Blueprints</span>
                              <span className="block text-[10px] text-[var(--text-muted)]">{savedBlueprints.length ? `${savedBlueprints.length} saved role briefs` : 'No saved blueprints yet'}</span>
                            </div>
                          </div>
                          <span className={`material-symbols-rounded text-[16px] text-[var(--text-muted)] transition-transform duration-200 ${showSavedBlueprints ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        <AnimatePresence>
                          {showSavedBlueprints && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 space-y-2">
                                {savedBlueprints.length === 0 ? (
                                  <p className="text-[11px] text-[var(--text-muted)] text-center py-3">Generate one from the JD step and it will live here.</p>
                                ) : (
                                  savedBlueprints.map((bp) => (
                                    <div
                                      key={bp.id}
                                      className="flex items-center gap-3 px-3 py-2.5 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] transition-all group cursor-pointer"
                                      onClick={() => {
                                        setBlueprintContent(bp.content);
                                        setShowBlueprintModal(true);
                                      }}
                                    >
                                      <div className="icon-shell-neutral w-8 h-8 rounded-[10px] border flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-rounded text-[16px]">description</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{bp.targetRole || 'Day-Zero Blueprint'}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">{new Date(bp.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = savedBlueprints.filter(b => b.id !== bp.id);
                                          setSavedBlueprints(updated);
                                          localStorage.setItem('tc_blueprints', JSON.stringify(updated));
                                          showToast('Blueprint deleted', 'delete');
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10"
                                        title="Delete blueprint"
                                      >
                                        <span className="material-symbols-rounded text-[14px] text-red-400">close</span>
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Session Summary</p>
                            <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1">Current scan state</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[22px] leading-none font-semibold text-[var(--text-primary)]">{resumeCheckResult?.atsScore || '—'}</p>
                            <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] mt-1">ATS</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                            <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Fit</p>
                            <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1">{matchScore ? `${matchScore}%` : 'Ready'}</p>
                          </div>
                          <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                            <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Template</p>
                            <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{selectedTemplate.name}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setStep('jd')} className={`py-3 rounded-[14px] border text-sm font-medium transition-all ${isLight ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12]'}`}>
                          ← Back
                        </button>
                        <button onClick={() => setStep('template')} className={`py-3 rounded-[14px] font-bold text-sm transition-all ${isLight ? 'bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100' : 'bg-indigo-500/[0.08] border border-indigo-500/[0.15] text-indigo-400 hover:bg-indigo-500/[0.12]'}`}>
                          Choose Template →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Template Selection */}
            {step === 'template' && (
              <motion.div className="resume-studio-stage resume-studio-design-stage" key="template" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {displayResume ? (
                  <div className="space-y-5">
                    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                        <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Visual system</p>
                        <h2 className="text-[22px] font-semibold text-[var(--text-primary)] mt-1">Choose the format that fits the audience.</h2>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-2">Your reviewed content stays fixed while you compare readable, ATS-conscious presentation systems.</p>
                        {ENABLE_RESUME_REVIEW_WORKBENCH && (
                          <button
                            type="button"
                            onClick={() => setStep('enhance')}
                            className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                          >
                            <span className="material-symbols-rounded text-[17px]" aria-hidden="true">arrow_back</span>
                            Review changes
                          </button>
                        )}
                        </div>
                        <div className="hidden grid grid-cols-3 gap-2 lg:min-w-[320px]">
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{TEMPLATES.length}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Signature</p>
                          </div>
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{TEMPLATE_FILTERS.length - 1}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Collections</p>
                          </div>
                          <div className="rounded-[10px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3">
                            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{matchScore ? `${matchScore}%` : 'Ready'}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Match</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[0.82fr_1.18fr] gap-6 items-stretch">
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 xl:h-[986px] flex flex-col">
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
                              className={`px-2.5 py-1.5 rounded-full border text-[10px] font-medium transition-all ${
                                templateFilter === filter.id
                                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
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
                                    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] opacity-70 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/40'
                                    : isSelected
                                      ? 'border-amber-500/35 bg-amber-500/[0.06]'
                                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] cursor-pointer'
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  {cardThumbnail ? (
                                    <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-[9px] border border-black/10 bg-white shadow-sm">
                                      <img src={cardThumbnail} alt="" className="h-full w-full object-cover object-top" />
                                    </div>
                                  ) : isCurated ? (
                                    <div className="h-28 w-[74px] shrink-0 overflow-hidden rounded-[9px] border border-black/10 bg-white shadow-sm">
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
                                        {template.tier === 'pro' && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold whitespace-nowrap">{PAID_TEMPLATE_PLAN_LABEL}</span>}
                                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-500/10 text-[var(--text-secondary)] border border-[var(--border-subtle)] font-bold whitespace-nowrap">{template.atsClassification}</span>
                                        {recommended && <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 font-bold whitespace-nowrap">RECOMMENDED</span>}
                                      </div>
                                    </div>
                                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                                      <PaletteDots colors={cardPalette.colors} selected={isSelected} />
                                      <span className="ml-1 min-w-0 text-[10px] text-[var(--text-muted)]">
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

                    <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 xl:sticky xl:top-6 xl:min-h-[986px]">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Selected</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">{selectedTemplate.name}</h3>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                              selectedTemplate.tier === 'pro'
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                            }`}>
                              {selectedTemplate.tier === 'pro' ? PAID_TEMPLATE_PLAN_LABEL : selectedTemplate.tier.toUpperCase()}
                            </span>
                            {recommendedTemplateIds.has(selectedTemplate.id) && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border font-bold bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
                                RECOMMENDED
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-1">{selectedTemplate.description}</p>
                        </div>
                        <button onClick={() => setStep('preview')} className="hidden px-4 py-2.5 rounded-[12px] font-medium text-sm bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 transition-all whitespace-nowrap self-start sm:self-auto">
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
                              <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                              <p className="text-[11px] font-semibold text-[var(--text-primary)] mt-0.5 truncate">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mb-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Palette</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                                  canUseTemplatePalettes
                                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300'
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
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-3 text-[11px] font-semibold text-amber-700 transition-all hover:bg-amber-500/15 dark:text-amber-300"
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
                              className="flex w-full min-w-0 items-center justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2.5 text-left transition-all hover:border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                <PaletteDots colors={selectedPalette.colors} selected size="md" />
                                <span className="min-w-0">
                                  <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</span>
                                  <span className="block truncate text-[10px] text-[var(--text-muted)]">{selectedPalette.isDefault ? 'Included palette' : 'Max palette'} · Choose palette</span>
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
                                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[320px] overflow-y-auto rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 shadow-xl"
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
                                        className={`flex w-full min-w-0 items-center gap-2.5 rounded-[11px] border px-2.5 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/25 ${
                                          paletteSelected
                                            ? 'border-amber-400/70 bg-amber-400/[0.08]'
                                            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                                        }`}
                                      >
                                        <PaletteDots colors={palette.colors} selected={paletteSelected} locked={paletteLocked} size="md" />
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{palette.label}</span>
                                          <span className="block truncate text-[9px] text-[var(--text-muted)]">{palette.isDefault ? 'Included' : canUseTemplatePalettes ? 'Max palette' : 'Max locked'}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div className="relative max-h-[720px] overflow-auto rounded-[12px] border border-slate-200 bg-slate-100 p-2 sm:p-4 shadow-inner">
                          <ResponsiveResumePreview
                            key={selectedTemplate.id}
                            resume={displayResume}
                            template={selectedTemplateWithPalette}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-100 to-transparent" />
                        </div>

                        <button
                          onClick={() => setStep('preview')}
                          className="mt-3 w-full py-2.5 rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border)] transition-all"
                        >
                          Open full-size preview
                        </button>
                      </div>
                    </div>
                  </div>

                    {morphProofReport && <ProofEngineReport report={morphProofReport} />}

                    <details className="group rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
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
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
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
                                  <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                                  <p className="mt-1 text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">{item.value}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {proofData.topJDTerms.slice(0, 8).map(term => (
                                <span
                                  key={`${term.term}-${term.matchedIn}`}
                                  className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
                                    term.matchedIn === 'both'
                                      ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-600'
                                      : term.matchedIn === 'morphed_only'
                                        ? 'border-cyan-500/15 bg-cyan-500/10 text-cyan-600'
                                        : 'border-amber-500/15 bg-amber-500/10 text-amber-600'
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
                                <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{item.label}</p>
                                <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-1 truncate">{item.value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 space-y-2">
                            {selectedExportProfile.notes.map(item => (
                              <div key={item} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
                                <span className="material-symbols-rounded text-[14px] text-emerald-500 mt-0.5">check_circle</span>
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
                    <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-8">
                      <span className="text-5xl block mb-4"><span className="material-symbols-rounded text-inherit align-middle">warning</span></span>
                      <h3 className="text-xl font-bold text-white mb-2">Resume Data Missing</h3>
                      <p className="text-silver mb-6">Something went wrong loading your resume.</p>
                      <div className="flex gap-3 justify-center">
                        <button onClick={() => setStep('jd')} className="px-6 py-3 rounded-xl bg-[var(--theme-bg-elevated)] text-white font-medium hover:bg-white/10"><span className="material-symbols-rounded text-[14px] align-middle mr-1">arrow_back</span> Back to role target</button>
                        <button onClick={() => { if (originalResume) setMorphedResume(originalResume); }} className="px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold">Use Original Resume</button>
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
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Export station</p>
                        <h3 className="text-[19px] font-semibold text-[var(--text-primary)] mt-1">Your resume is ready.</h3>
                        <p className="text-[12px] text-[var(--text-secondary)] mt-2 mb-4">Download, save a reusable version, or attach it to an application pipeline.</p>

                        {/* Free-tier usage counter */}
                        {!isPro && user && (
                          <div className="mb-3 px-3 py-2 rounded-[10px] flex items-center gap-2 bg-amber-500/[0.08] border border-amber-500/[0.15]">
                            <span className="material-symbols-rounded icon-status-warning text-[16px]">token</span>
                            <span className="text-xs text-[var(--text-secondary)]">{remaining('morphs')} of {caps?.morphs || 3} free uses left</span>
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
                            <button onClick={downloadPDF} disabled={isLoading} className="w-full py-3 rounded-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-deep)] hover:opacity-90 transition-all disabled:opacity-50 text-sm">
                              {isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">description</span> Download PDF</>}
                            </button>
                            <button onClick={downloadWord} disabled={isLoading} className="w-full py-3 rounded-[12px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border)] transition-all disabled:opacity-50 text-sm">
                              {isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Preparing...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">edit_document</span> Download Word</>}
                            </button>
                          </div>
                          <button onClick={() => setShowApplicationModal(true)} className="w-full py-3 rounded-[12px] font-medium text-sm bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/[0.12] transition-all">
                            <span className="material-symbols-rounded align-middle mr-1">my_location</span> Track Application
                          </button>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={saveVersionOnly} disabled={isSaving} className="py-2.5 rounded-[10px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm disabled:opacity-50">
                              {isSaving ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1 animate-spin">hourglass_top</span> Saving...</> : saveInlineStatus?.type === 'success' ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">check_circle</span> Saved</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">save</span> Save</>}
                            </button>
                            <button onClick={() => setStep('template')} className="py-2.5 rounded-[10px] font-medium bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm"><span className="material-symbols-rounded text-[14px] align-middle mr-1">palette</span> Template</button>
                          </div>
                          {saveInlineStatus && (
                            <div className={`rounded-[10px] border px-3 py-2 text-[11px] leading-relaxed ${
                              saveInlineStatus.type === 'success'
                                ? 'bg-emerald-500/[0.08] border-emerald-500/[0.18] text-emerald-600 dark:text-emerald-400'
                                : 'bg-red-500/[0.07] border-red-500/[0.18] text-red-600 dark:text-red-400'
                            }`}>
                              {saveInlineStatus.message}
                            </div>
                          )}
                        </div>
                      </div>


                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
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

                      {matchScore && (
                        <div className="rounded-[16px] bg-[var(--bg-surface)] border border-emerald-500/[0.15] p-5">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-[12px] bg-emerald-500/[0.08] border border-emerald-500/[0.15] flex items-center justify-center">
                              <span className="text-lg font-semibold text-emerald-500">{matchScore}%</span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-[var(--text-primary)]">Role match</h4>
                              <div className="h-2 w-32 bg-[var(--bg-card)] rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${matchScore}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
                        <h4 className="font-semibold text-[var(--text-primary)] mb-2">{selectedTemplate.name}</h4>
                        <p className="text-xs text-[var(--text-secondary)]">{selectedTemplate.description}</p>
                      </div>
                    </div>

                    <div className="min-w-0 lg:col-span-2">
                      <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                        <div ref={resumeRef}>
                          <ResponsiveResumePreview resume={displayResume} template={selectedTemplateWithPalette} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-lg mx-auto text-center py-12">
                    <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-8">
                      <span className="text-5xl block mb-4"><span className="material-symbols-rounded text-inherit align-middle">warning</span></span>
                      <h3 className="text-xl font-bold text-white mb-2">No Resume Data</h3>
                      <button onClick={() => setStep('upload')} className="px-6 py-3 rounded-xl bg-cyan-500 text-white font-bold">Start Over</button>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBlueprintModal(false)} className={`fixed inset-0 backdrop-blur-sm z-50 ${isLight ? 'bg-black/40' : 'bg-black/80'}`} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className={`relative w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden border ${
                  isLight ? 'bg-white border-amber-200 shadow-2xl' : 'border-amber-500/15'
                }`} style={isLight ? {} : { background: 'var(--theme-bg-card, #111827)' }}>
                  {/* Header */}
                  <div className={`relative p-6 border-b ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
                    <div className={`absolute inset-0 ${isLight ? 'bg-gradient-to-br from-amber-50 to-orange-50' : 'bg-gradient-to-br from-amber-500/10 to-orange-500/10'}`} />
                    <div className="relative flex items-center justify-between">
                      <div>
                        <h2 className={`text-xl font-bold flex items-center gap-2 ${isLight ? 'text-slate-800' : 'text-white'}`}><span className="material-symbols-rounded text-inherit align-middle">content_paste</span> Day-Zero Blueprint</h2>
                        <p className={`text-sm mt-1 ${isLight ? 'text-amber-700' : 'text-amber-400/80'}`}>Your strategic &quot;First 90 Days&quot; proposal</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(blueprintContent);
                            showToast('Blueprint copied to clipboard!', 'content_paste');
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isLight ? 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                          }`}
                        >
                          Copy
                        </button>
                        <button onClick={() => setShowBlueprintModal(false)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isLight ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700' : 'bg-white/10 text-silver hover:text-white hover:bg-white/20'
                        }`}><span className="material-symbols-rounded">close</span></button>
                      </div>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="p-6 overflow-y-auto max-h-[65vh]">
                    <div className={`prose prose-sm max-w-none ${isLight ? 'prose-slate' : 'prose-invert'}`}>
                      {blueprintContent.split('\n').map((line, i) => {
                        if (line.startsWith('# ')) return <h1 key={i} className={`text-xl font-bold mt-2 mb-3 ${isLight ? 'text-slate-800' : 'text-white'}`}>{line.slice(2)}</h1>;
                        if (line.startsWith('## ')) return <h2 key={i} className={`text-lg font-semibold mt-4 mb-2 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{line.slice(3)}</h2>;
                        if (line.startsWith('### ')) return <h3 key={i} className={`text-base font-semibold mt-4 mb-2 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>{line.slice(4)}</h3>;
                        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className={`font-semibold mt-2 ${isLight ? 'text-slate-700' : 'text-white/90'}`}>{line.slice(2, -2)}</p>;
                        if (line.startsWith('- ')) return <li key={i} className={`ml-4 mb-1 list-disc ${isLight ? 'text-slate-600' : 'text-silver'}`}>{line.slice(2)}</li>;
                        if (line.trim() === '') return <div key={i} className="h-2" />;
                        return <p key={i} className={`mb-1 ${isLight ? 'text-slate-600' : 'text-silver'}`}>{line}</p>;
                      })}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className={`p-4 border-t flex justify-between items-center ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'
                  }`}>
                    <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-silver/50'}`}>Generated by TalentConsulting.io</span>
                    <button onClick={() => setShowBlueprintModal(false)} className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      isLight ? 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200' : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                    }`}>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowApplicationModal(false)} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-lg rounded-3xl glass-card overflow-hidden">
                  <div className="relative p-8 text-center border-b border-white/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-cyan-500/10" />
                    <div className="relative">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                        <span className="text-4xl"><span className="material-symbols-rounded text-inherit align-middle">my_location</span></span>
                      </motion.div>
                      <h2 className="text-2xl font-bold text-white">Track this Application?</h2>
                      <p className="text-silver mt-2">We'll save this morphed resume with your application</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-silver mb-2">Company Name *</label>
                      <input type="text" value={applicationData.companyName} onChange={(e) => setApplicationData(prev => ({ ...prev, companyName: e.target.value }))} placeholder="e.g., Google" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-green-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-silver mb-2">Job Title</label>
                      <input type="text" value={applicationData.jobTitle} onChange={(e) => setApplicationData(prev => ({ ...prev, jobTitle: e.target.value }))} placeholder={displayResume.title || 'Position'} className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-green-500/50 focus:outline-none" />
                    </div>
                  </div>
                  <div className="p-6 pt-0 flex gap-3">
                    <button onClick={() => { setShowApplicationModal(false); setStep('preview'); }} className="flex-1 px-4 py-3 rounded-xl bg-[var(--theme-bg-elevated)] text-silver hover:bg-white/10 transition-colors font-medium">Skip & Preview Resume</button>
                    <button onClick={handleCreateApplication} disabled={isLoading || !applicationData.companyName.trim()} className="flex-1 px-4 py-3 rounded-xl bg-[var(--theme-bg-elevated)] border border-[var(--theme-border)] text-[var(--theme-fg)] font-bold disabled:opacity-50 hover:bg-white/[0.05] transition-all">
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!isSaving) { setShowSaveModal(false); setSaveVersionName(''); setSaveCompanyName(''); }}} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-md rounded-3xl glass-card overflow-hidden">
                  {saveSuccess ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-12 text-center">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }} className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                        <span className="text-4xl"><span className="material-symbols-rounded text-inherit align-middle">check_circle</span></span>
                      </motion.div>
                      <h3 className="text-xl font-bold text-white">Saved & Tracked!</h3>
                      <p className="text-sm text-silver mt-2">Resume saved for <span className="text-cyan-400 font-semibold">{saveCompanyName}</span></p>
                      <p className="text-xs text-silver/60 mt-1">View in Applications tab →</p>
                    </motion.div>
                  ) : (
                    <>
                      <div className="relative p-6 border-b border-white/10">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10" />
                        <div className="relative flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center"><span className="text-2xl"><span className="material-symbols-rounded text-inherit align-middle">save</span></span></div>
                          <div><h3 className="text-xl font-bold text-white">Save & Track</h3><p className="text-sm text-silver">Save this resume and track the application</p></div>
                        </div>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">Company Name <span className="text-red-400">*</span></label>
                          <input type="text" value={saveCompanyName} onChange={(e) => setSaveCompanyName(e.target.value)} placeholder="e.g., Google, Meta, Stripe" autoFocus className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">Resume Version Name</label>
                          <input type="text" value={saveVersionName} onChange={(e) => setSaveVersionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && saveCompanyName.trim() && saveVersionName.trim()) confirmSave(); }} placeholder="e.g., Senior PM Resume" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                        </div>
                        <div className="rounded-xl bg-cyan-500/[0.06] border border-cyan-500/[0.12] p-3">
                          <p className="text-xs text-cyan-400/80"><span className="material-symbols-rounded text-inherit align-middle">lightbulb</span> This will save your resume <strong>and</strong> create an application entry you can track in the Applications tab.</p>
                        </div>
                      </div>
                      <div className="p-6 pt-0 flex gap-3">
                        <button onClick={() => { setShowSaveModal(false); setSaveVersionName(''); setSaveCompanyName(''); }} disabled={isSaving} className={`flex-1 px-4 py-3 rounded-xl font-medium transition-colors ${isLight ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>Cancel</button>
                        <button onClick={confirmSave} disabled={!saveCompanyName.trim() || isSaving} className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 ${isLight ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md'}`}>
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
          {false && <>
          <SuiteToolHeader
            tool="resume"
            title="Build From Scratch"
            subtitle="Create a professional resume with AI assistance."
            actions={
              <button onClick={resetAll} className="px-4 py-2 rounded-xl glass-card text-slate-500 hover:border-white/[0.12] hover:text-white transition-all text-sm">
                ← Start Over
              </button>
            }
          />
          </>}

          {/* Steps */}
          <AnimatePresence mode="wait">
            {step === 'upload' && (
              <motion.div className="resume-create-stage" key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Personal Info */}
                  <div className="resume-create-section rounded-xl glass-card p-5">
                    <h3 className="text-base font-semibold text-white mb-4">Personal Information</h3>
                    <div className="space-y-4">
                      <input type="text" value={buildResume.name} onChange={(e) => setBuildResume(prev => ({ ...prev, name: e.target.value }))} placeholder="Full Name" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      <input type="text" value={buildResume.title} onChange={(e) => setBuildResume(prev => ({ ...prev, title: e.target.value }))} placeholder="Job Title (e.g., Senior Software Engineer)" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      <input type="email" value={buildResume.email} onChange={(e) => setBuildResume(prev => ({ ...prev, email: e.target.value }))} placeholder="Email" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      <input type="text" value={buildResume.phone} onChange={(e) => setBuildResume(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      <input type="text" value={buildResume.location} onChange={(e) => setBuildResume(prev => ({ ...prev, location: e.target.value }))} placeholder="Location (e.g., San Francisco, CA)" className="w-full px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="resume-create-section rounded-xl glass-card p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-base font-semibold text-white">Professional Summary</h3>
                      <button onClick={generateSummary} disabled={aiSuggesting} className="px-3 py-1 rounded-lg text-sm bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50">
                        {aiSuggesting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span> Generating...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">auto_awesome</span> Generate with AI</>}
                      </button>
                    </div>
                    <textarea value={buildResume.summary} onChange={(e) => setBuildResume(prev => ({ ...prev, summary: e.target.value }))} placeholder="Write a brief professional summary..." className="w-full h-48 px-4 py-3 rounded-xl glass-card text-white placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none resize-none" />
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button onClick={() => setStep('jd')} disabled={!buildResume.name || !buildResume.title} className="px-4 py-2 rounded-xl font-medium text-sm bg-cyan-500/[0.08] border border-cyan-500/[0.15] text-cyan-400 hover:bg-cyan-500/[0.12] disabled:opacity-50 transition-all">
                    Add Experience →
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'jd' && (
              <motion.div className="resume-create-stage" key="exp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="resume-create-section rounded-xl glass-card p-5 mb-6">
                  <h3 className="text-base font-semibold text-white mb-4">Work Experience</h3>
                  {buildResume.experience.map((exp, i) => (
                    <div key={i} className="mb-4 p-4 rounded-xl glass-card">
                      <div className="grid md:grid-cols-3 gap-3 mb-3">
                        <input type="text" value={exp.role} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].role = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Job Title" className="px-3 py-2 rounded-lg glass-card text-white text-sm placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                        <input type="text" value={exp.company} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].company = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Company" className="px-3 py-2 rounded-lg glass-card text-white text-sm placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                        <input type="text" value={exp.duration} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].duration = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder="Duration (e.g., 2020-Present)" className="px-3 py-2 rounded-lg glass-card text-white text-sm placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-slate-500">Achievements</span>
                        <button onClick={() => generateAchievements(i)} disabled={aiSuggesting} className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-400">{aiSuggesting ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">auto_awesome</span> Generate</>}</button>
                      </div>
                      {exp.achievements.map((a, j) => (
                        <input key={j} type="text" value={a} onChange={(e) => { const newExp = [...buildResume.experience]; newExp[i].achievements[j] = e.target.value; setBuildResume(prev => ({ ...prev, experience: newExp })); }} placeholder={`Achievement ${j + 1}`} className="w-full mb-2 px-3 py-2 rounded-lg glass-card text-white text-sm placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none" />
                      ))}
                      <button onClick={() => { const newExp = [...buildResume.experience]; newExp[i].achievements.push(''); setBuildResume(prev => ({ ...prev, experience: newExp })); }} className="text-xs text-cyan-400">+ Add Achievement</button>
                    </div>
                  ))}
                  <button onClick={() => setBuildResume(prev => ({ ...prev, experience: [...prev.experience, { role: '', company: '', duration: '', achievements: [''] }] }))} className="w-full py-2.5 rounded-xl border border-dashed border-white/[0.08] text-slate-500 hover:border-cyan-500/20 hover:text-white transition-all text-sm">
                    + Add Experience
                  </button>
                </div>
                <div className="flex justify-between">
                  <button onClick={() => setStep('upload')} className="px-4 py-2 rounded-xl glass-card text-slate-500 hover:border-white/[0.12] text-sm"><span className="material-symbols-rounded text-[14px] align-middle mr-1">arrow_back</span> Back</button>
                  <button
                    onClick={() => {
                      setOriginalResume(buildResume);
                      setMorphedResume(null);
                      setMode('morph');
                      setStep('jd');
                    }}
                    className="px-4 py-2 rounded-xl font-medium text-sm bg-cyan-500/[0.08] border border-cyan-500/[0.15] text-cyan-400 hover:bg-cyan-500/[0.12] transition-all"
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
                                className={`p-3 rounded-xl border text-left text-sm relative transition-all ${
                                  isLocked
                                    ? 'border-[var(--border-subtle)] bg-[var(--bg-card)] opacity-70 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/40'
                                    : isSelected
                                      ? 'border-cyan-500/[0.2] bg-cyan-500/[0.03]'
                                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border)] cursor-pointer'
                                }`}
                              >
                                {isLocked && <span className="absolute top-1 right-1 z-10 text-[8px] px-1 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold">{PAID_TEMPLATE_PLAN_LABEL}</span>}
                                {cardThumbnail ? (
                                  <span className="mb-2 block aspect-[2/3] overflow-hidden rounded-[9px] border border-black/10 bg-white shadow-sm">
                                    <img src={cardThumbnail} alt="" className="h-full w-full object-cover object-top" />
                                  </span>
                                ) : isCurated ? (
                                  <span className="mb-2 block aspect-[2/3] overflow-hidden rounded-[9px] border border-black/10 bg-white shadow-sm">
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
                                <span className="mt-1 block text-[9px] font-semibold text-[var(--text-secondary)]">{t.atsClassification}</span>
                                <span className="mt-1 block truncate text-[10px] text-[var(--text-muted)]">
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
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Palette</p>
                              <p className="mt-0.5 truncate text-[12px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</p>
                            </div>
                            {!canUseTemplatePalettes && (
                              <button
                                type="button"
                                onClick={openMaxPaletteUpgrade}
                                className="shrink-0 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
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
                              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-2 text-left transition-all hover:border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <PaletteDots colors={selectedPalette.colors} selected />
                                <span className="min-w-0">
                                  <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{selectedPalette.label}</span>
                                  <span className="block truncate text-[9px] text-[var(--text-muted)]">Choose palette</span>
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
                                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-[260px] overflow-y-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-xl"
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
                                        className={`flex w-full min-w-0 items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/25 ${
                                          paletteSelected
                                            ? 'border-amber-400/70 bg-amber-400/[0.08]'
                                            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card)]'
                                        }`}
                                      >
                                        <PaletteDots colors={palette.colors} selected={paletteSelected} locked={paletteLocked} />
                                        <span className="min-w-0">
                                          <span className="block truncate text-[11px] font-semibold text-[var(--text-primary)]">{palette.label}</span>
                                          <span className="block truncate text-[9px] text-[var(--text-muted)]">{palette.isDefault ? 'Included' : canUseTemplatePalettes ? 'Max palette' : 'Max locked'}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                        <button onClick={() => setStep('preview')} className="w-full py-2.5 rounded-xl font-medium text-sm bg-cyan-500/[0.08] border border-cyan-500/[0.15] text-cyan-400 hover:bg-cyan-500/[0.12] transition-all">Preview & Export →</button>
                      </>
                    )}
                    {step === 'preview' && (
                      <div className="rounded-xl glass-card p-5 space-y-3">
                        <h3 className="font-semibold text-white mb-4">Export</h3>

                        {/* Free-tier usage counter */}
                        {!isPro && user && (
                          <div className={`mb-1 px-3 py-2 rounded-lg flex items-center gap-2 ${isLight ? 'bg-amber-50 border border-amber-200' : 'bg-amber-500/[0.08] border border-amber-500/[0.15]'}`}>
                            <span className={`material-symbols-rounded text-[16px] ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>token</span>
                            <span className={`text-xs ${isLight ? 'text-slate-700' : 'text-amber-300'}`}>{remaining('morphs')} of {caps?.morphs || 3} free uses left</span>
                          </div>
                        )}
                        {!user && (
                          <div className={`mb-1 px-3 py-2 rounded-lg flex items-center gap-2 ${isLight ? 'bg-cyan-50 border border-cyan-200' : 'bg-cyan-500/[0.06] border border-cyan-500/[0.12]'}`}>
                            <span className={`material-symbols-rounded text-[16px] ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}>lock_open</span>
                            <span className={`text-xs ${isLight ? 'text-slate-700' : 'text-cyan-300'}`}>Sign in to download your resume</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={downloadPDF} disabled={isLoading} className="py-2.5 rounded-xl font-semibold bg-cyan-500/[0.1] border border-cyan-500/[0.2] text-cyan-400 hover:bg-cyan-500/[0.15] transition-all disabled:opacity-50 text-sm">{isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">description</span> PDF</>}</button>
                          <button onClick={downloadWord} disabled={isLoading} className="py-2.5 rounded-xl font-semibold bg-blue-500/[0.08] border border-blue-500/[0.15] text-blue-400 hover:bg-blue-500/[0.12] transition-all disabled:opacity-50 text-sm">{isLoading ? <><span className="material-symbols-rounded text-[14px] align-middle mr-1">hourglass_top</span>...</> : <><span className="material-symbols-rounded text-[14px] align-middle mr-1">edit_document</span> Word</>}</button>
                        </div>
                        <button onClick={saveVersionOnly} disabled={isSaving} className="w-full py-2.5 rounded-xl font-medium bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] text-white transition-all text-sm disabled:opacity-50">
                          {isSaving ? <><span className="material-symbols-rounded text-inherit align-middle animate-spin">hourglass_top</span> Saving...</> : saveInlineStatus?.type === 'success' ? <><span className="material-symbols-rounded text-inherit align-middle">check_circle</span> Saved</> : <><span className="material-symbols-rounded text-inherit align-middle">save</span> Save Version</>}
                        </button>
                        {saveInlineStatus && (
                          <div className={`rounded-xl border px-3 py-2 text-xs ${
                            saveInlineStatus.type === 'success'
                              ? 'bg-emerald-500/[0.08] border-emerald-500/[0.18] text-emerald-300'
                              : 'bg-red-500/[0.08] border-red-500/[0.18] text-red-300'
                          }`}>
                            {saveInlineStatus.message}
                          </div>
                        )}
                        <button onClick={() => setStep('template')} className="w-full py-2.5 rounded-xl font-medium bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] text-slate-500 transition-all text-sm"><span className="material-symbols-rounded text-inherit align-middle">palette</span> Change Template</button>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 lg:col-span-2">
                    <div className="rounded-xl glass-card p-4">
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
      className="mx-auto min-w-0 w-full max-w-[794px] overflow-hidden rounded-[10px] bg-white shadow-xl"
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
