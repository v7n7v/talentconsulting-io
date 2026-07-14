/**
 * Centralized Zod Validation Schemas
 * Every API route body gets validated here — single source of truth.
 */

import { z } from 'zod';
import { CHECKOUT_ATTRIBUTION_SOURCES } from '@/lib/billing/checkout-attribution';

// ──────────────────────────────────────────────
// Shared / Reusable
// ──────────────────────────────────────────────

const SafeString = (max = 50_000) => z.string().trim().max(max);
const SafeText = (max = 100_000) => z.string().trim().max(max);

// ──────────────────────────────────────────────
// /api/ai
// ──────────────────────────────────────────────

export const AICompletionSchema = z.object({
  action: z.enum(['json', 'stream', 'text']).optional(),
  prompt: SafeString(30_000),
  systemPrompt: SafeString(10_000).optional(),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(8192).optional(),
    topP: z.number().min(0).max(1).optional(),
  }).optional().default({}),
  usageFeature: z.string().max(50).optional(),
});

// ──────────────────────────────────────────────
// /api/chat
// ──────────────────────────────────────────────

export const ChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: SafeString(10_000),
  })).min(1).max(50),
  userContext: SafeString(20_000).optional(),
});

// ──────────────────────────────────────────────
// /api/resume/*
// ──────────────────────────────────────────────

export const ResumeParseSchema = z.object({
  text: SafeText(100_000),
});

export const ResumeMorphSchema = z.object({
  resume: z.record(z.string(), z.unknown()),
  jobDescription: SafeText(30_000),
  morphPercentage: z.number().int().min(10).max(100).optional(),
  targetPageCount: z.union([z.number().int().min(1).max(5), z.literal('auto')]).optional(),
});

export const ResumeMorphConsentSchema = z.object({
  unlock100: z.boolean(),
  typedName: SafeString(120).optional(),
  acknowledgements: z.array(SafeString(500)).max(10).optional(),
  consentVersion: SafeString(80).optional(),
});

export const ResumeAISchema = z.object({
  action: z.enum(['extract_company', 'generate_summary', 'generate_achievements', 'suggest_skills']),
  text: SafeString(20_000).optional(),
  jobDescription: SafeString(20_000).optional(),
});

export const ResumeCheckSchema = z.object({
  resumeText: SafeText(100_000),
  targetJD: SafeText(30_000).optional(),
});

export const CoverLetterSchema = z.object({
  resumeText: SafeText(50_000),
  jobDescription: SafeText(30_000),
  companyName: SafeString(200).optional(),
  tone: z.enum(['professional', 'friendly', 'bold']).optional(),
});

export const LinkedInSchema = z.object({
  resumeText: SafeText(50_000),
  targetRole: SafeString(200).optional(),
});

export const AutoFixSchema = z.object({
  resumeText: SafeText(100_000),
  resume: z.record(z.string(), z.unknown()),
  suggestions: z.array(z.string().max(2000)).min(1).max(20),
  targetJD: SafeText(30_000).optional(),
});

export const BlueprintSchema = z.object({
  resume: z.record(z.string(), z.unknown()),
  jobDescription: SafeText(30_000),
});

export const StudyPlanSchema = z.object({
  skills: z.array(z.string().trim().max(200)).min(1).max(8),
  userContext: SafeString(5000).optional(),
  totalDays: z.number().min(0.01).max(7).optional(),
  platforms: z.array(z.string().trim().max(100)).max(10).optional(),
});

// ──────────────────────────────────────────────
// /api/gauntlet/*
// ──────────────────────────────────────────────

export const GauntletGenerateSchema = z.object({
  jobDescription: SafeText(30_000).optional(),
  resumeText: SafeText(30_000).optional(),
  interviewStyle: z.string().max(50).optional(),
  questionCount: z.number().int().min(1).max(20).optional(),
  interviewType: z.string().max(50).optional(),
  drillCategory: z.string().max(50).optional(),
  mode: z.enum(['flashcards', 'interview']).optional(),
  drillRole: SafeString(200).optional(),
  persona: z.string().max(50).optional(),
});

export const GauntletGradeSchema = z.object({
  question: SafeString(5000),
  answer: SafeText(20_000),
  jobDescription: SafeText(20_000).optional(),
  resumeText: SafeText(20_000).optional(),
  questionType: z.string().max(50).optional(),
  persona: z.string().max(50).optional(),
});

export const GauntletParseResumeSchema = z.object({
  fileData: z.string().max(20_000_000), // base64 encoded, ~15MB
  fileName: z.string().max(255),
});

// ──────────────────────────────────────────────
// /api/voice/*
// ──────────────────────────────────────────────

export const VoiceSpeakSchema = z.object({
  text: SafeString(5000),
  voiceId: z.string().max(100).optional(),
});

// /api/voice/transcribe uses FormData — validated inline

// ──────────────────────────────────────────────
// /api/teams/interest
// ──────────────────────────────────────────────

export const TeamInterestSchema = z.object({
  name: SafeString(200),
  email: z.string().trim().email().max(320),
  organization: SafeString(200),
  orgType: z.string().max(100),
  teamSize: z.string().max(50).optional(),
  message: SafeString(5000).optional(),
});

// ──────────────────────────────────────────────
// /api/admin/users
// ──────────────────────────────────────────────

export const AdminActionSchema = z.object({
  action: z.enum(['set_max', 'set_pro', 'set_free', 'disable', 'enable', 'update_subscription']),
  uid: z.string().min(1).max(128),
  email: z.string().max(320).optional(),
  plan: z.enum(['free', 'pro', 'studio']).optional(),
  months: z.number().int().min(1).max(120).optional(),
});

export const AdminEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  uid: z.string().min(1).max(128).optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  ctaLabel: z.string().trim().max(100).optional(),
  ctaUrl: z.string().trim().url().max(2000).optional(),
});

// ──────────────────────────────────────────────
// /api/oracle/analyze
// ──────────────────────────────────────────────

export const OracleAnalyzeSchema = z.object({
  resumeText: SafeText(50_000),
  jdText: SafeText(30_000).optional(),
  targetRole: SafeString(200).optional(),
  location: SafeString(200).optional(),
});

// ──────────────────────────────────────────────
// /api/dashboard/insights
// ──────────────────────────────────────────────

export const DashboardInsightsSchema = z.object({
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

// ──────────────────────────────────────────────
// /api/stripe/subscribe
// ──────────────────────────────────────────────

export const StripeSubscribeSchema = z.object({
  interval: z.enum(['month', 'year']).optional().default('month'),
  plan: z.enum(['pro', 'studio']).optional().default('pro'),
  source: z.enum(CHECKOUT_ATTRIBUTION_SOURCES).optional().default('direct'),
});

// ──────────────────────────────────────────────
// /api/vault/*
// ──────────────────────────────────────────────

export const VaultGenerateSchema = z.object({
  type: z.enum(['flashcards', 'interview', 'skill-bridge']),
  topic: SafeString(500),
  items: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  skill: SafeString(200).optional(),
  applicationId: z.string().max(100).optional().nullable(),
  resumeVersionId: z.string().max(100).optional().nullable(),
  sourceTool: SafeString(80).optional(),
});

export const VaultExportPlanSchema = z.object({
  skill: SafeString(200),
  schedule: z.array(z.record(z.string(), z.unknown())).min(1).max(30),
  summary: SafeString(5000).optional(),
  applicationId: z.string().max(100).optional().nullable(),
  resumeVersionId: z.string().max(100).optional().nullable(),
});

// ──────────────────────────────────────────────
// /api/notifications/study-reminder
// ──────────────────────────────────────────────

export const StudyReminderSchema = z.object({
  email: z.string().trim().email().max(320),
  userName: SafeString(200).optional(),
  skills: z.array(z.object({
    skill: z.string().max(200),
    completedDays: z.number().int().min(0),
    totalDays: z.number().int().min(1).max(365),
    todayFocus: z.string().max(500).optional(),
    todayTasks: z.array(z.string().max(500)).optional(),
  })).min(1).max(20),
});

// ──────────────────────────────────────────────
// /api/jobs/search
// ──────────────────────────────────────────────

export const JobSearchSchema = z.object({
  query: SafeString(500).optional(),
  location: SafeString(200).optional(),
  page: z.number().int().min(1).max(100).optional(),
  numPages: z.number().int().min(1).max(5).optional(),
  remote: z.boolean().optional(),
});

// ──────────────────────────────────────────────
// /api/agent/harness
// ──────────────────────────────────────────────

export const SonaAgentHarnessSchema = z.object({
  userRequest: SafeString(4000),
  resumeVersionId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,180}$/).optional(),
  targetRole: SafeString(160).optional(),
  location: SafeString(160).optional(),
  salaryTarget: z.number().min(0).max(1_000_000).optional(),
  remotePreference: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  maxPackets: z.number().int().min(1).max(8).optional(),
  mode: z.enum(['scout', 'prepare']).optional(),
  notify: z.boolean().optional(),
  activationReceipt: z.string().trim().min(80).max(4096).optional(),
});

// ──────────────────────────────────────────────
// /api/writing/humanize
// ──────────────────────────────────────────────

export const HumanizeSchema = z.object({
  text: SafeText(50_000),
  domain: z.enum(['general', 'academic', 'resume', 'marketing', 'creative']).optional().default('general'),
  tone: z.enum(['professional', 'creative', 'casual', 'academic', 'confident']).optional().default('professional'),
  lengthMode: z.enum(['exact', 'condense', 'expand']).optional().default('exact'),
  mode: z.enum(['safe_polish', 'voice_match', 'recruiter_ready', 'academic_integrity', 'creative_rewrite']).optional(),
  intensity: z.enum(['light', 'balanced', 'deep']).optional().default('balanced'),
  qualityMode: z.enum(['fast', 'best']).optional().default('fast'),
  protectedTerms: z.array(z.string().trim().min(1).max(120)).max(120).optional(),
  rewriteScope: z.enum(['full', 'flagged_paragraphs']).optional().default('flagged_paragraphs'),
  paragraphIndices: z.array(z.number().int().min(0).max(200)).optional(),
});

// ──────────────────────────────────────────────
// /api/writing/uniqueness
// ──────────────────────────────────────────────

export const UniquenessSchema = z.object({
  text: SafeText(50_000),
});

// ──────────────────────────────────────────────
// /api/gallery/run
// ──────────────────────────────────────────────

export const GalleryToolSchema = z.object({
  tool: z.enum([
    'grammar-checker', 'citation-machine', 'paraphraser',
    'tone-analyzer', 'summarizer', 'email-composer',
    'word-counter', 'thesis-generator',
  ]),
  input: SafeText(30_000),
  options: z.record(z.string(), z.unknown()).optional(),
});

// ──────────────────────────────────────────────
// /api/resume/ats-score
// ──────────────────────────────────────────────

export const ATSScoreSchema = z.object({
  resumeText: SafeText(100_000),
  jobDescription: SafeText(30_000),
});
