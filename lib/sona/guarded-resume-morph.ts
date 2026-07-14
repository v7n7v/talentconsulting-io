import { createHash } from 'crypto';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  RESUME_MORPH_VALIDATOR_VERSION,
  resolveResumeMorphAccess,
  type ResumeMorphGuardrailReport,
} from '@/lib/resume-morph-guardrails';
import { getResumeMorphConsentForUser } from '@/lib/resume-morph-consent-server';
import { sanitizeForAI } from '@/lib/sanitize';
import {
  extractResumeSkills,
  getLatestExplicitResumeForUser,
  getVerifiedResumeForUserById,
  type LatestResumeResult,
} from '@/lib/server-resume';
import { extractSkillsFromDescription } from '@/lib/job-search-api';
import {
  generateGuardedMorphDraft,
  type MorphJSONCompletion,
} from '@/lib/sona/morph-draft-generation';

export interface GuardedSonaResumeMorphInput {
  uid: string;
  jobTitle: string;
  company?: string;
  jobDescription?: string;
  emphasis?: string;
  requestedMorphPercentage?: number;
  resumeVersionId?: string | null;
  source?: 'sona_chat_morph' | 'sona_chat_tailor';
}

export interface GuardedSonaResumeMorphResult {
  success: boolean;
  code: 'prepared' | 'needs_resume' | 'selected_resume_unavailable' | 'resume_lookup_unavailable' | 'generation_failed';
  message: string;
  jobTitle: string;
  company: string;
  sourceResumeId: string | null;
  sourceResumeType: LatestResumeResult['source'];
  resumeVersionId: string | null;
  effectiveMorphPercentage: number;
  maxAllowedMorphPercentage: number;
  consentUsed: boolean;
  keywordCoverage: number;
  matchingKeywords: string[];
  keywordGaps: string[];
  guardedPreview: {
    name: string;
    title: string;
    summary: string;
    experience: Array<{
      role: string;
      company: string;
      duration: string;
      bullets: string[];
    }>;
    education: any[];
  } | null;
  guardrailReport: ResumeMorphGuardrailReport | null;
}

interface GuardedSonaResumeMorphDependencies {
  getAdminDb: typeof getAdminDb;
  getLatestExplicitResumeForUser: typeof getLatestExplicitResumeForUser;
  getVerifiedResumeForUserById: typeof getVerifiedResumeForUserById;
  getResumeMorphConsentForUser: typeof getResumeMorphConsentForUser;
  groqJSONCompletion: MorphJSONCompletion;
  now: () => Date;
}

const defaultDependencies: GuardedSonaResumeMorphDependencies = {
  getAdminDb,
  getLatestExplicitResumeForUser,
  getVerifiedResumeForUserById,
  getResumeMorphConsentForUser,
  groqJSONCompletion,
  now: () => new Date(),
};

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBullets(experience: any) {
  const raw = experience?.bullets || experience?.highlights || experience?.achievements || [];
  return Array.isArray(raw) ? raw.map(cleanString).filter(Boolean).slice(0, 5) : [];
}

function buildPreview(resume: any): GuardedSonaResumeMorphResult['guardedPreview'] {
  return {
    name: cleanString(resume?.name),
    title: cleanString(resume?.title),
    summary: cleanString(resume?.summary),
    experience: Array.isArray(resume?.experience)
      ? resume.experience.slice(0, 5).map((entry: any) => ({
        role: cleanString(entry?.role || entry?.title),
        company: cleanString(entry?.company),
        duration: cleanString(entry?.duration || entry?.dates || entry?.period),
        bullets: normalizeBullets(entry),
      }))
      : [],
    education: Array.isArray(resume?.education) ? resume.education : [],
  };
}

export async function runGuardedSonaResumeMorph(
  input: GuardedSonaResumeMorphInput,
  dependencyOverrides: Partial<GuardedSonaResumeMorphDependencies> = {},
): Promise<GuardedSonaResumeMorphResult> {
  const deps = { ...defaultDependencies, ...dependencyOverrides };
  const db = deps.getAdminDb();
  let sourceResume: LatestResumeResult;
  try {
    sourceResume = input.resumeVersionId
      ? await deps.getVerifiedResumeForUserById(db, input.uid, input.resumeVersionId)
      : await deps.getLatestExplicitResumeForUser(db, input.uid);
  } catch {
    return {
      success: false,
      code: 'resume_lookup_unavailable',
      message: 'Sona could not verify the selected resume right now. No draft was generated or saved.',
      jobTitle: cleanString(input.jobTitle) || 'Target role',
      company: cleanString(input.company),
      sourceResumeId: input.resumeVersionId || null,
      sourceResumeType: null,
      resumeVersionId: null,
      effectiveMorphPercentage: 0,
      maxAllowedMorphPercentage: 80,
      consentUsed: false,
      keywordCoverage: 0,
      matchingKeywords: [],
      keywordGaps: [],
      guardedPreview: null,
      guardrailReport: null,
    };
  }
  const resume = sourceResume.resume;
  const jobTitle = cleanString(input.jobTitle) || 'Target role';
  const company = cleanString(input.company);
  const selectedResumeIsExact = !input.resumeVersionId || sourceResume.id === input.resumeVersionId;
  const sourceIsVerified = sourceResume.verification?.verified === true
    && sourceResume.verification.kind === 'explicit_user_source';

  if (!resume || !sourceIsVerified || !selectedResumeIsExact) {
    const selectedUnavailable = Boolean(input.resumeVersionId);
    return {
      success: false,
      code: selectedUnavailable ? 'selected_resume_unavailable' : 'needs_resume',
      message: selectedUnavailable
        ? 'The selected resume is missing or is not a verified user source. Sona did not substitute another resume.'
        : 'Upload or select a verified resume before asking Sona to tailor it.',
      jobTitle,
      company,
      sourceResumeId: null,
      sourceResumeType: null,
      resumeVersionId: null,
      effectiveMorphPercentage: 0,
      maxAllowedMorphPercentage: 80,
      consentUsed: false,
      keywordCoverage: 0,
      matchingKeywords: [],
      keywordGaps: [],
      guardedPreview: null,
      guardrailReport: null,
    };
  }

  const consent = await deps.getResumeMorphConsentForUser(input.uid);
  const morphAccess = resolveResumeMorphAccess({
    requestedMorphPercentage: input.requestedMorphPercentage ?? 80,
    hasFullConsent: consent.unlocked100,
    mode: 'automated',
  });
  const safeJobDescription = sanitizeForAI(cleanString(input.jobDescription), 10_000);
  const safeEmphasis = sanitizeForAI(cleanString(input.emphasis), 1_000);
  const targetEvidence = safeJobDescription || `${jobTitle}${company ? ` at ${company}` : ''}`;
  const jobSkills = extractSkillsFromDescription(targetEvidence);
  const resumeSkills = extractResumeSkills(resume);
  const resumeSkillsLower = resumeSkills.map(skill => skill.toLowerCase());
  const matchingKeywords = jobSkills.filter(skill => {
    const normalized = skill.toLowerCase();
    return resumeSkillsLower.some(candidate => candidate.includes(normalized) || normalized.includes(candidate));
  });
  const keywordGaps = jobSkills.filter(skill => !matchingKeywords.includes(skill));
  const keywordCoverage = jobSkills.length
    ? Math.round((matchingKeywords.length / jobSkills.length) * 100)
    : 0;

  let guarded: Awaited<ReturnType<typeof generateGuardedMorphDraft>>;
  try {
    guarded = await generateGuardedMorphDraft({
      resume,
      jobTitle,
      company,
      jobDescription: targetEvidence,
      emphasis: safeEmphasis,
      access: morphAccess,
    }, deps.groqJSONCompletion);
  } catch {
    return {
      success: false,
      code: 'generation_failed',
      message: 'Sona could not prepare the resume draft. Your verified resume was not changed.',
      jobTitle,
      company,
      sourceResumeId: sourceResume.id,
      sourceResumeType: sourceResume.source,
      resumeVersionId: null,
      effectiveMorphPercentage: morphAccess.effectiveMorphPercentage,
      maxAllowedMorphPercentage: morphAccess.maxAllowedMorphPercentage,
      consentUsed: morphAccess.consentUsed,
      keywordCoverage,
      matchingKeywords: matchingKeywords.slice(0, 12),
      keywordGaps: keywordGaps.slice(0, 12),
      guardedPreview: null,
      guardrailReport: null,
    };
  }

  const sourceResumeHash = createHash('sha256').update(JSON.stringify(resume)).digest('hex');
  const now = deps.now().toISOString();
  const source = input.source || 'sona_chat_morph';
  const versionRef = await db
    .collection('users')
    .doc(input.uid)
    .collection('resume_versions')
    .add({
      user_id: input.uid,
      version_name: `[Sona] ${company ? `${company} — ` : ''}${jobTitle}`,
      content: guarded.resume,
      mode: source,
      source,
      source_resume_id: sourceResume.id,
      source_resume_type: sourceResume.source,
      source_resume_hash: sourceResumeHash,
      guardrail_validator_version: RESUME_MORPH_VALIDATOR_VERSION,
      target_role: jobTitle,
      target_company: company || null,
      guardrail_report: guarded.report,
      morph_effective_percentage: morphAccess.effectiveMorphPercentage,
      is_active: false,
      created_at: now,
      updated_at: now,
    })
    .catch(() => null);

  return {
    success: true,
    code: 'prepared',
    message: versionRef
      ? 'A truth-locked resume draft is ready in Resume Studio for your review.'
      : 'A truth-locked preview is ready, but Sona could not save the draft. Your verified resume was not changed.',
    jobTitle,
    company,
    sourceResumeId: sourceResume.id,
    sourceResumeType: sourceResume.source,
    resumeVersionId: versionRef?.id || null,
    effectiveMorphPercentage: morphAccess.effectiveMorphPercentage,
    maxAllowedMorphPercentage: morphAccess.maxAllowedMorphPercentage,
    consentUsed: morphAccess.consentUsed,
    keywordCoverage,
    matchingKeywords: matchingKeywords.slice(0, 12),
    keywordGaps: keywordGaps.slice(0, 12),
    guardedPreview: buildPreview(guarded.resume),
    guardrailReport: guarded.report,
  };
}
