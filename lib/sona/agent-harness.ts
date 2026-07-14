import { Resend } from 'resend';
import { createHash } from 'node:crypto';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { calculateATSScore } from '@/lib/ats-score';
import { scoreAllGhostRisks } from '@/lib/ghost-filter';
import { EMAIL_FROM, buildAgentDigestEmail, type AgentJobForDigest } from '@/lib/email-templates';
import { logUserCommunication } from '@/lib/communications';
import { invalidateTwin } from '@/lib/career-twin';
import {
  dedupeTalentJobs,
  finalizeTalentRecommendations,
  isPreparationEligibleRecommendation,
  loadRecommendationLedger,
  searchTalentJobSupply,
  suppressLedgerMatches,
  upsertRecommendationLedger,
  type TalentJob,
} from '@/lib/job-recommendation-platform';
import type { PlanTier } from '@/lib/pricing-tiers';
import {
  applyResumeMorphGuardrails,
  resolveResumeMorphAccess,
  type ResumeMorphGuardrailReport,
} from '@/lib/resume-morph-guardrails';
import { getResumeMorphConsentForUser } from '@/lib/resume-morph-consent-server';
import {
  extractResumeSkills,
  getLatestVerifiedResumeForUser as getLatestResumeForUser,
  getVerifiedResumeForUserById,
} from '@/lib/server-resume';
import {
  isVerifiedPrimaryJobSearch,
  probeJobSupplyHealth,
  type JobSupplyHealthResult,
} from '@/lib/job-supply-health';
import {
  buildHarnessQueueEvidence,
  buildHarnessQueueRecord,
  buildHarnessQueuedResultItem,
} from '@/lib/sona/harness-evidence';
import {
  resolveSonaWorkloadEntitlement,
  type SonaWorkloadEntitlement,
} from '@/lib/sona/workload-policy';
import {
  cancelSonaPaidWorkloadRun,
  releaseSonaPaidWorkloadRun,
  reserveSonaPaidWorkloadRun,
} from '@/lib/sona/workload-reservation';
import {
  recordOrQueueSonaRunEconomics,
  type SonaRunActualWork,
} from '@/lib/sona/economics';
import {
  getAgentDigestEmailConsent,
  sanitizeJobDeliveryError,
} from '@/lib/job-notification-delivery';
import { getResendDeliveryTags } from '@/lib/job-notification-receipt-contract';
import {
  acceptJobEmailDeliveryAttempt,
  createJobEmailDeliveryAttempt,
  failJobEmailDeliveryAttempt,
} from '@/lib/job-notification-receipts';
import { getJobNotificationDeliveryReadinessForStore } from '@/lib/job-notification-readiness';

export type SonaHarnessRemotePreference = 'remote' | 'hybrid' | 'onsite' | 'any';
export type SonaHarnessMode = 'scout' | 'prepare';

export interface SonaAgentHarnessInput {
  userRequest: string;
  resumeVersionId?: string;
  targetRole?: string;
  location?: string;
  salaryTarget?: number;
  remotePreference?: SonaHarnessRemotePreference;
  maxPackets?: number;
  mode?: SonaHarnessMode;
  notify?: boolean;
  tier?: PlanTier;
  email?: string | null;
}

export interface SonaHarnessGoal {
  targetRole: string;
  location: string;
  salaryTarget: number;
  remotePreference: SonaHarnessRemotePreference;
  keywords: string[];
  confidence: number;
}

export interface SonaHarnessRunResult {
  success: boolean;
  runId: string;
  status: 'blocked' | 'scouted' | 'prepared';
  tier: PlanTier;
  entitlement: SonaWorkloadEntitlement;
  goal: SonaHarnessGoal;
  mode: SonaHarnessMode;
  canPrepareAssets: boolean;
  resume: {
    found: boolean;
    source: string | null;
    id: string | null;
    skillsUsed: number;
  };
  jobsFound: number;
  queuedCount: number;
  queued: Array<{
    queueId: string;
    title: string;
    company: string;
    location: string;
    matchScore: number;
    packetStatus: string;
    resumeVersionId: string | null;
    applicationUrl: string;
    fitSignals: string[];
    riskSignals: string[];
    sourceNotes: string[];
    nextAction: string;
  }>;
  nextActions: string[];
  approvalRequired: string[];
  notification: {
    inApp: boolean;
    emailSent: boolean;
    emailAccepted?: boolean;
    emailSkippedReason?: string;
  };
  warnings: string[];
  code?: 'PRIMARY_JOB_SUPPLY_UNAVAILABLE' | 'RESUME_LOOKUP_UNAVAILABLE';
  retryable?: boolean;
  canScout?: boolean;
  workloadReconciled?: boolean;
  primarySupply?: Pick<JobSupplyHealthResult, 'status' | 'preparationReady' | 'checkedAt' | 'serviceHost' | 'message'>;
  error?: string;
  needsResume?: boolean;
  needsTargetBrief?: boolean;
  missingTargetFields?: string[];
  workloadLimit?: {
    reason: 'concurrent_run' | 'daily_run_cap' | 'daily_model_cap' | 'daily_packet_cap';
    used: number;
    cap: number;
    resetsAt: string;
  };
}

type Firestore = FirebaseFirestore.Firestore;
type HarnessGroqJsonCompletion = typeof groqJSONCompletion;

const DEFAULT_TARGET_ROLE = 'software engineer';
const DEFAULT_LOCATION = 'United States';

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uniqueSearchValues(values: unknown[], limit: number) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const cleaned = cleanString(value, 160);
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= limit) break;
  }
  return unique;
}

function normalizeSalaryTarget(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(/[^\d.]/g, ''))
      : 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function inferSalaryFromText(text: string) {
  const match = text.match(/\$?\s*(\d{2,3}(?:\.\d+)?)\s*(k|000)?\b/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  return match[2]?.toLowerCase() === '000' ? amount * 1000 : amount * 1000;
}

function inferRemotePreference(text: string): SonaHarnessRemotePreference {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'hybrid';
  if (/\bremote\b/.test(lower)) return 'remote';
  if (/\bonsite|on-site|in office|in-office\b/.test(lower)) return 'onsite';
  return 'any';
}

function inferLocation(text: string) {
  const lower = text.toLowerCase();
  if (/\bnew jersey\b|\bnj\b/.test(lower)) return 'New Jersey';
  if (/\bnew york\b|\bnyc\b|\bny\b/.test(lower)) return 'New York';
  const inMatch = text.match(/\b(?:in|near|around)\s+([A-Z][A-Za-z .'-]+?)(?:,|\s+(?:remote|hybrid|onsite|on-site)|$)/);
  return inMatch?.[1]?.trim() || '';
}

function inferCountryForLocation(location: string) {
  const value = location.toLowerCase();
  if (/\b(canada|ontario|quebec|british columbia|alberta|toronto|vancouver|montreal)\b/.test(value)) return 'ca';
  if (/\b(united kingdom|uk|england|scotland|wales|london|manchester|edinburgh)\b/.test(value)) return 'gb';
  if (/\b(australia|sydney|melbourne|brisbane|perth)\b/.test(value)) return 'au';
  if (/\b(germany|berlin|munich|hamburg|frankfurt)\b/.test(value)) return 'de';
  if (/\b(united states|usa|u\.s\.|new jersey|new york|california|texas|florida|illinois|washington|massachusetts|virginia|maryland|pennsylvania)\b/.test(value)) return 'us';
  return undefined;
}

function inferTargetRole(text: string) {
  const lower = text.toLowerCase();
  const patterns = [
    /(software engineer|frontend engineer|front end engineer|backend engineer|full stack engineer|data analyst|data scientist|product manager|project manager|cybersecurity analyst|security engineer|wireless engineer)/i,
    /\b(?:as|for|find)\s+(?:a|an)?\s*([a-z][a-z /+-]{2,80}?)\s+(?:job|role|position)\b/i,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function toTitleCase(value: string) {
  return value.replace(/\w\S*/g, word => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function flattenResumeToText(resume: any): string {
  if (!resume) return '';
  const parts: string[] = [];
  if (resume.name) parts.push(resume.name);
  if (resume.title) parts.push(resume.title);
  if (resume.summary) parts.push(resume.summary);
  if (Array.isArray(resume.skills)) {
    parts.push(resume.skills.map((skill: any) => typeof skill === 'string' ? skill : skill?.name || skill?.label || '').filter(Boolean).join(', '));
  }
  if (Array.isArray(resume.experience)) {
    for (const exp of resume.experience) {
      parts.push([exp.role || exp.title, exp.company].filter(Boolean).join(' at '));
      if (exp.description) parts.push(exp.description);
      if (Array.isArray(exp.bullets)) parts.push(...exp.bullets);
      if (Array.isArray(exp.achievements)) parts.push(...exp.achievements);
    }
  }
  if (Array.isArray(resume.education)) {
    parts.push(...resume.education.map((edu: any) => [edu.degree, edu.institution || edu.school].filter(Boolean).join(' ')));
  }
  return parts.filter(Boolean).join('\n');
}

async function loadJobPreferences(db: Firestore, uid: string) {
  const [settingsSnap, legacySnap] = await Promise.all([
    db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get().catch(() => null),
    db.collection('users').doc(uid).collection('preferences').doc('job_search').get().catch(() => null),
  ]);
  return {
    ...(legacySnap?.exists ? legacySnap.data() : {}),
    ...(settingsSnap?.exists ? settingsSnap.data() : {}),
  } as Record<string, any>;
}

async function interpretGoal(input: SonaAgentHarnessInput, fallback: { roles: string[]; location?: string; salaryMin?: number; remotePref?: string; resumeTitle?: string }): Promise<SonaHarnessGoal> {
  const text = cleanString(input.userRequest, 4000);
  const fallbackRole = cleanString(input.targetRole)
    || inferTargetRole(text)
    || fallback.roles[0]
    || fallback.resumeTitle
    || DEFAULT_TARGET_ROLE;
  const fallbackLocation = cleanString(input.location)
    || inferLocation(text)
    || cleanString(fallback.location)
    || DEFAULT_LOCATION;
  const fallbackSalary = normalizeSalaryTarget(input.salaryTarget)
    || inferSalaryFromText(text)
    || normalizeSalaryTarget(fallback.salaryMin);
  const inferredRemote = inferRemotePreference(text);
  const fallbackRemote = input.remotePreference
    || (inferredRemote !== 'any' ? inferredRemote : undefined)
    || (fallback.remotePref as SonaHarnessRemotePreference)
    || 'any';

  // Always release the paid concurrency lock, even when an unexpected provider or write fails.
  try {
    const parsed = await groqJSONCompletion<{
      targetRole?: string;
      location?: string;
      salaryTarget?: number;
      remotePreference?: SonaHarnessRemotePreference;
      keywords?: string[];
      confidence?: number;
    }>(
      'Extract a job-search goal from the user request. Use only explicit facts or safe fallbacks. Return JSON.',
      JSON.stringify({
        userRequest: text,
        fallbackRole,
        fallbackLocation,
        fallbackSalary,
        fallbackRemote,
      }),
      { temperature: 0.1, maxTokens: 600 },
    );
    const remote = ['remote', 'hybrid', 'onsite', 'any'].includes(String(parsed.remotePreference))
      ? parsed.remotePreference as SonaHarnessRemotePreference
      : fallbackRemote;
    return {
      targetRole: toTitleCase(cleanString(parsed.targetRole, 120) || fallbackRole),
      location: cleanString(parsed.location, 120) || fallbackLocation,
      salaryTarget: normalizeSalaryTarget(parsed.salaryTarget) || fallbackSalary,
      remotePreference: remote,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(item => cleanString(item, 60)).filter(Boolean).slice(0, 8) : [],
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.72))),
    };
  } catch {
    return {
      targetRole: toTitleCase(fallbackRole),
      location: fallbackLocation,
      salaryTarget: fallbackSalary,
      remotePreference: fallbackRemote,
      keywords: [],
      confidence: 0.58,
    };
  }
}

async function reserveFreeScoutRun(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  runId: string,
) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    if (data.completedAt) return false;

    const reservedAt = typeof data.reservedAt === 'string' ? new Date(data.reservedAt).getTime() : 0;
    const reservationIsActive = data.status === 'running'
      && Number.isFinite(reservedAt)
      && reservedAt > Date.now() - 10 * 60 * 1000;
    if (reservationIsActive) return false;

    transaction.set(ref, {
      status: 'running',
      reservedAt: new Date().toISOString(),
      reservationRunId: runId,
    }, { merge: true });
    return true;
  });
}

function salaryMeetsTarget(job: TalentJob, salaryTarget: number) {
  if (!salaryTarget) return true;
  const top = job.salary.max || job.salary.min || 0;
  return top > 0 && top >= salaryTarget;
}

function remoteMatches(job: TalentJob, remotePreference: SonaHarnessRemotePreference) {
  if (remotePreference === 'any') return true;
  if (remotePreference === 'remote') return job.remoteMode === 'remote';
  if (remotePreference === 'hybrid') return job.remoteMode === 'hybrid' || job.remoteMode === 'remote';
  return job.remoteMode === 'onsite';
}

async function maybeSendDigest(params: {
  db: Firestore;
  uid: string;
  email?: string | null;
  userName: string;
  jobs: AgentJobForDigest[];
  runId: string;
}) {
  if (!params.email) return { sent: false, reason: 'No email on account' };
  if (!params.jobs.length) return { sent: false, reason: 'No jobs queued' };
  const latestPreferences = await params.db
    .collection('users')
    .doc(params.uid)
    .collection('settings')
    .doc('jobPreferences')
    .get()
    .then(snapshot => snapshot.exists ? snapshot.data() || {} : {})
    .catch(() => null);
  const consent = getAgentDigestEmailConsent(latestPreferences);
  if (!consent.granted) return { sent: false, reason: consent.reason || 'Sona digest email consent is required' };
  if (!(await getJobNotificationDeliveryReadinessForStore(params.db)).canSendTrackedEmail) {
    return { sent: false, reason: 'Confirmed email delivery is not configured' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { subject, html } = buildAgentDigestEmail(params.userName, params.jobs);
  const attemptId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await createJobEmailDeliveryAttempt(params.db, {
    uid: params.uid,
    attemptId,
    purpose: 'agent_digest',
    source: 'sona_harness',
    createdAt,
    recipientEmail: params.email,
  });
  let providerMessageId: string | null = null;
  try {
    const delivery = await resend.emails.send({
      from: EMAIL_FROM,
      to: params.email,
      subject,
      html,
      tags: getResendDeliveryTags(attemptId, 'agent_digest'),
    }, { idempotencyKey: `sona-harness-${params.runId}` });
    if (delivery.error) throw new Error(sanitizeJobDeliveryError(delivery.error.message));
    providerMessageId = delivery.data?.id || null;
  } catch (error) {
    const safeError = sanitizeJobDeliveryError(error);
    const failure = await failJobEmailDeliveryAttempt(params.db, {
      attemptId,
      failedAt: new Date().toISOString(),
      error: safeError,
    }).catch(() => ({ updated: false, status: null }));
    if (!failure.updated && failure.status && failure.status !== 'failed') {
      return { sent: true, status: failure.status, providerMessageId: null };
    }
    throw new Error(safeError);
  }
  const acceptedAt = new Date().toISOString();
  await acceptJobEmailDeliveryAttempt(params.db, {
    attemptId,
    providerMessageId,
    acceptedAt,
  }).catch(error => {
    console.error('[sona-harness] Digest was accepted but receipt state could not be persisted:', error);
  });
  await logUserCommunication({
    uid: params.uid,
    email: params.email,
    subject,
    bodyPreview: `Sona harness prepared ${params.jobs.length} job packet${params.jobs.length === 1 ? '' : 's'} for review.`,
    template: 'sona_harness_digest',
    sentBy: 'agent/harness',
    status: 'accepted',
    metadata: { runId: params.runId, attemptId, queuedJobCount: params.jobs.length, providerMessageId },
  }).catch(() => {});
  return { sent: true, status: 'accepted' as const, providerMessageId };
}

export interface SonaAgentHarnessDeps {
  loadJobPreferences?: typeof loadJobPreferences;
  getLatestResumeForUser?: typeof getLatestResumeForUser;
  getVerifiedResumeForUserById?: typeof getVerifiedResumeForUserById;
  interpretGoal?: typeof interpretGoal;
  searchTalentJobSupply?: typeof searchTalentJobSupply;
  loadRecommendationLedger?: typeof loadRecommendationLedger;
  upsertRecommendationLedger?: typeof upsertRecommendationLedger;
  getResumeMorphConsentForUser?: typeof getResumeMorphConsentForUser;
  groqJSONCompletion?: HarnessGroqJsonCompletion;
  maybeSendDigest?: typeof maybeSendDigest;
  invalidateTwin?: typeof invalidateTwin;
  reserveFreeScoutRun?: typeof reserveFreeScoutRun;
  reservePaidWorkloadRun?: typeof reserveSonaPaidWorkloadRun;
  cancelPaidWorkloadRun?: typeof cancelSonaPaidWorkloadRun;
  releasePaidWorkloadRun?: typeof releaseSonaPaidWorkloadRun;
  recordRunEconomics?: typeof recordOrQueueSonaRunEconomics;
  probeJobSupplyHealth?: typeof probeJobSupplyHealth;
}

export async function runSonaAgentHarness(
  db: Firestore,
  uid: string,
  input: SonaAgentHarnessInput,
  deps: SonaAgentHarnessDeps = {},
): Promise<SonaHarnessRunResult> {
  const harnessDeps = {
    loadJobPreferences,
    getLatestResumeForUser,
    getVerifiedResumeForUserById,
    interpretGoal,
    searchTalentJobSupply,
    loadRecommendationLedger,
    upsertRecommendationLedger,
    getResumeMorphConsentForUser,
    groqJSONCompletion,
    maybeSendDigest,
    invalidateTwin,
    reserveFreeScoutRun,
    reservePaidWorkloadRun: reserveSonaPaidWorkloadRun,
    cancelPaidWorkloadRun: cancelSonaPaidWorkloadRun,
    releasePaidWorkloadRun: releaseSonaPaidWorkloadRun,
    recordRunEconomics: recordOrQueueSonaRunEconomics,
    probeJobSupplyHealth,
    ...deps,
  };
  const runId = `sona_harness_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date().toISOString();
  const userRef = db.collection('users').doc(uid);
  const requestedResumeVersionId = cleanString(input.resumeVersionId, 180);
  let resumeLookupFailed = false;
  const [userSnap, prefs, latestResume] = await Promise.all([
    userRef.get().catch(() => null),
    harnessDeps.loadJobPreferences(db, uid),
    (requestedResumeVersionId
      ? harnessDeps.getVerifiedResumeForUserById(db, uid, requestedResumeVersionId)
      : harnessDeps.getLatestResumeForUser(db, uid))
      .catch(() => {
        resumeLookupFailed = true;
        return { resume: null, source: null, id: null, updatedAt: null };
      }),
  ]);
  const userData = userSnap?.exists ? userSnap.data() || {} : {};
  const email = input.email || null;
  const tier: PlanTier = input.tier || 'free';
  const resume = latestResume.resume;
  const sourceResumeHash = resume
    ? createHash('sha256').update(JSON.stringify(resume)).digest('hex')
    : null;
  const userSkills = extractResumeSkills(resume);
  const targetRoles = Array.isArray(prefs.targetRoles) ? prefs.targetRoles.map(String).filter(Boolean) : [];
  const preferredCities = Array.isArray(prefs.preferredCities) ? prefs.preferredCities.map(String).filter(Boolean) : [];
  const requestText = cleanString(input.userRequest, 4000);
  const resumeRole = cleanString(resume?.title || resume?.headline || resume?.currentRole, 160);
  const resumeLocation = cleanString(resume?.location || resume?.city || resume?.state, 160);
  const explicitRole = cleanString(input.targetRole)
    || inferTargetRole(requestText)
    || targetRoles[0]
    || resumeRole
    || '';
  const explicitLocation = cleanString(input.location)
    || inferLocation(requestText)
    || preferredCities[0]
    || resumeLocation
    || '';
  const missingTargetFields = [
    !explicitRole ? 'target role' : '',
    !explicitLocation ? 'location' : '',
  ].filter(Boolean);
  const entitlement = resolveSonaWorkloadEntitlement(tier, input.mode, input.maxPackets);
  const canPrepareAssets = entitlement.effectiveMode === 'prepare';
  const mode: SonaHarnessMode = entitlement.effectiveMode;
  const packetCap = entitlement.maxRankedRoles;
  const warnings: string[] = [];
  const fallbackGoal: SonaHarnessGoal = {
    targetRole: explicitRole ? toTitleCase(explicitRole) : '',
    location: explicitLocation,
    salaryTarget: normalizeSalaryTarget(input.salaryTarget) || inferSalaryFromText(requestText) || normalizeSalaryTarget(prefs.salaryMin),
    remotePreference: input.remotePreference || inferRemotePreference(requestText) || 'any',
    keywords: [],
    confidence: missingTargetFields.length > 0 ? 0 : 0.58,
  };
  const buildBaseResult = (goal: SonaHarnessGoal): Omit<SonaHarnessRunResult, 'jobsFound' | 'queuedCount' | 'queued' | 'nextActions' | 'approvalRequired' | 'notification'> => ({
    success: false,
    runId,
    status: 'blocked',
    tier,
    entitlement,
    goal,
    mode,
    canPrepareAssets,
    resume: {
      found: Boolean(resume),
      source: latestResume.source,
      id: latestResume.id,
      skillsUsed: userSkills.length,
    },
    warnings,
  });

  if (resumeLookupFailed) {
    return {
      ...buildBaseResult(fallbackGoal),
      code: 'RESUME_LOOKUP_UNAVAILABLE',
      retryable: true,
      jobsFound: 0,
      queuedCount: 0,
      queued: [],
      nextActions: ['Retry this Sona request. Your selected resume and target remain unchanged.'],
      approvalRequired: ['No search, queue item, generated asset, notification, or external application was created.'],
      notification: { inApp: false, emailSent: false, emailSkippedReason: 'Resume lookup is temporarily unavailable' },
      error: requestedResumeVersionId
        ? 'Sona could not load the selected resume right now.'
        : 'Sona could not load your verified resume right now.',
    };
  }

  if (missingTargetFields.length > 0) {
    return {
      ...buildBaseResult(fallbackGoal),
      needsTargetBrief: true,
      missingTargetFields,
      jobsFound: 0,
      queuedCount: 0,
      queued: [],
      nextActions: [`Add ${missingTargetFields.join(' and ')} before Sona uses a scout run.`],
      approvalRequired: ['Confirm the search target before Sona ranks jobs.'],
      notification: { inApp: false, emailSent: false, emailSkippedReason: 'Target brief is incomplete' },
      error: `Sona needs your ${missingTargetFields.join(' and ')} before scouting.`,
    };
  }

  if (!resume) {
    return {
      ...buildBaseResult(fallbackGoal),
      success: false,
      needsResume: true,
      jobsFound: 0,
      queuedCount: 0,
      queued: [],
      nextActions: ['Upload or save a resume first. Sona needs a verified source of truth before preparing applications.'],
      approvalRequired: ['Resume upload required before job packet preparation.'],
      notification: { inApp: false, emailSent: false, emailSkippedReason: 'No resume found' },
      error: 'No saved resume was found.',
    };
  }

  let verifiedPrimarySupply: JobSupplyHealthResult | null = null;
  if (canPrepareAssets) {
    const primarySupply = await harnessDeps.probeJobSupplyHealth();
    verifiedPrimarySupply = primarySupply;
    if (!primarySupply.preparationReady) {
      return {
        ...buildBaseResult(fallbackGoal),
        code: 'PRIMARY_JOB_SUPPLY_UNAVAILABLE',
        canScout: true,
        canPrepareAssets: false,
        primarySupply: {
          status: primarySupply.status,
          preparationReady: false,
          checkedAt: primarySupply.checkedAt,
          serviceHost: primarySupply.serviceHost,
          message: primarySupply.message,
        },
        jobsFound: 0,
        queuedCount: 0,
        queued: [],
        nextActions: ['Run Sona in scout mode while primary supply is restored, then retry packet preparation.'],
        approvalRequired: ['No queue item, generated asset, notification, or external application was created.'],
        notification: { inApp: false, emailSent: false, emailSkippedReason: 'Primary job supply is unavailable' },
        error: 'Sona preparation is paused until Ever Jobs primary supply passes its health and safe-source checks.',
      };
    }
  }

  const freeScoutRef = userRef.collection('settings').doc('sonaFreeScout');
  if (tier === 'free') {
    const reserved = await harnessDeps.reserveFreeScoutRun(db, freeScoutRef, runId);
    if (!reserved) {
      return {
        ...buildBaseResult(fallbackGoal),
        jobsFound: 0,
        queuedCount: 0,
        queued: [],
        nextActions: ['Upgrade to Talent Pro for manual scouting or Talent Max for proactive scouting and prepared packets.'],
        approvalRequired: ['Choose a paid plan before another Sona scout run.'],
        notification: { inApp: false, emailSent: false, emailSkippedReason: 'Free scout already used' },
        error: 'Your free Sona scout is complete or already running. Upgrade to scout again or prepare applications.',
      };
    }
  }

  const paidWorkloadRef = userRef.collection('usage').doc('sona_daily');
  if (tier !== 'free') {
    const reservation = await harnessDeps.reservePaidWorkloadRun(db, paidWorkloadRef, runId, tier, entitlement);
    if (!reservation.allowed && reservation.reason) {
      const concurrent = reservation.reason === 'concurrent_run';
      return {
        ...buildBaseResult(fallbackGoal),
        workloadLimit: {
          reason: reservation.reason,
          used: reservation.used,
          cap: reservation.cap,
          resetsAt: reservation.resetsAt,
        },
        jobsFound: 0,
        queuedCount: 0,
        queued: [],
        nextActions: concurrent
          ? ['Wait for the current Sona run to finish, then review its results in Agent Queue.']
          : ['Review today\'s Sona results in Agent Queue and run another workload after the daily reset.'],
        approvalRequired: ['No new search, generated asset, email, or external application was started.'],
        notification: { inApp: false, emailSent: false, emailSkippedReason: concurrent ? 'Sona run already active' : 'Daily Sona workload reached' },
        error: concurrent
          ? 'Sona is already working on another run for this account.'
          : `Today's included Sona workload is complete. The allowance resets at ${reservation.resetsAt}.`,
      };
    }
  }

  const runRef = userRef.collection('agent_runs').doc(runId);
  let searchQueryCount = 0;
  let rankedRoleCount = 0;
  let queuedItemCount = 0;
  let preparedPacketCount = 0;
  let resumeMorphAttempts = 0;
  let coverLetterAttempts = 0;
  let emailDigestChecks = 0;
  let emailDigestsSent = 0;
  const currentActualWork = (): SonaRunActualWork => ({
    searchQueries: searchQueryCount,
    rankedRoles: rankedRoleCount,
    resumeMorphAttempts,
    coverLetterAttempts,
    emailDigestChecks,
    emailDigestsSent,
  });

  try {
  const goal = await harnessDeps.interpretGoal(input, {
    roles: targetRoles,
    location: preferredCities[0],
    salaryMin: prefs.salaryMin,
    remotePref: prefs.remotePref,
    resumeTitle: resume?.title,
  });
  const baseResult = buildBaseResult(goal);

  await runRef.set({
    userId: uid,
    type: 'career_goal_harness',
    status: 'running',
    goal,
    mode,
    tier,
    entitlement: {
      policyVersion: entitlement.policyVersion,
      plan: entitlement.plan,
      planLabel: entitlement.planLabel,
      outcomeLabel: entitlement.outcomeLabel,
      limitLabel: entitlement.limitLabel,
      requestedMode: entitlement.requestedMode,
      effectiveMode: entitlement.effectiveMode,
      downgraded: entitlement.downgraded,
      recurringScouting: entitlement.recurringScouting,
    },
    economics: {
      policyVersion: entitlement.policyVersion,
      paidReason: entitlement.paidReason,
      envelope: entitlement.costEnvelope,
    },
    userRequest: cleanString(input.userRequest, 4000),
    sourceResume: {
      id: latestResume.id,
      source: latestResume.source,
      hash: sourceResumeHash,
      explicitlySelected: Boolean(requestedResumeVersionId),
    },
    createdAt: startedAt,
    updatedAt: startedAt,
    steps: [
      { id: 'understand', label: 'Understand goal', status: 'complete' },
      { id: 'search', label: 'Find roles', status: 'running' },
      { id: 'prepare', label: canPrepareAssets ? 'Prepare packets' : 'Queue scout results', status: 'pending' },
      { id: 'notify', label: 'Notify user', status: 'pending' },
    ],
  }, { merge: true });

  const ledger = await harnessDeps.loadRecommendationLedger(db, uid);
  const [existingQueueSnap, existingAppsSnap] = await Promise.all([
    userRef.collection('agent_queue').get().catch(() => null),
    userRef.collection('applications').get().catch(() => null),
  ]);
  const rawJobs: TalentJob[] = [];
  let primarySearchVerified = true;
  const seen = new Set<string>();
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  existingQueueSnap?.docs.forEach(doc => {
    const data = doc.data();
    const createdAt = new Date(data.created_at || data.createdAt || 0).getTime();
    if (Number.isFinite(createdAt) && createdAt > twoWeeksAgo) {
      seen.add(`${String(data.job_title || '').toLowerCase().trim()}|${String(data.company || '').toLowerCase().trim()}`);
    }
  });
  existingAppsSnap?.docs.forEach(doc => {
    const data = doc.data();
    seen.add(`${String(data.job_title || '').toLowerCase().trim()}|${String(data.company_name || data.company || '').toLowerCase().trim()}`);
  });
  const searchRoles = uniqueSearchValues([goal.targetRole, ...targetRoles], 2);
  const searchLocations = uniqueSearchValues([goal.location, ...preferredCities], 2);

  for (const role of searchRoles) {
    for (const location of searchLocations.length ? searchLocations : ['']) {
      searchQueryCount += 1;
      const result = await harnessDeps.searchTalentJobSupply({
        query: role,
        location,
        country: inferCountryForLocation(location),
        page: 1,
        resultsPerPage: 12,
        sortBy: 'relevance',
        salaryMin: goal.salaryTarget || undefined,
      }).catch(() => null);
      const providerStatus = result?.providerStatus;
      if (canPrepareAssets && !isVerifiedPrimaryJobSearch(providerStatus)) {
        primarySearchVerified = false;
      }
      for (const job of suppressLedgerMatches(result?.jobs || [], ledger)) {
        const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        if (!salaryMeetsTarget(job, goal.salaryTarget)) continue;
        if (!remoteMatches(job, goal.remotePreference)) continue;
        rawJobs.push(job);
      }
    }
  }

  if (canPrepareAssets && !primarySearchVerified) {
    const failedAt = new Date().toISOString();
    const actualWork = currentActualWork();
    const economicsAttribution = await harnessDeps.recordRunEconomics(db, {
      uid,
      runId,
      tier,
      startedAt,
      completedAt: failedAt,
      terminalStatus: 'failed',
      queuedCount: 0,
      preparedCount: 0,
      actual: actualWork,
    }).then(record => ({
      status: record.status,
      usefulOutcome: null,
      firstUsefulOutcome: false,
      costBasisVersion: record.estimate.basisVersion,
      estimatedCostMicros: record.estimate.estimatedCostMicros,
    })).catch(() => ({
      status: 'failed',
      usefulOutcome: null,
      firstUsefulOutcome: false,
      costBasisVersion: null,
      estimatedCostMicros: null,
    }));
    await runRef.set({
      status: 'blocked',
      code: 'PRIMARY_JOB_SUPPLY_UNAVAILABLE',
      jobsFound: 0,
      queuedCount: 0,
      economics: {
        policyVersion: entitlement.policyVersion,
        paidReason: entitlement.paidReason,
        envelope: entitlement.costEnvelope,
        actual: actualWork,
        attribution: economicsAttribution,
      },
      failedAt,
      updatedAt: failedAt,
    }, { merge: true }).catch(() => {});
    let workloadReconciled = true;
    try {
      const reconciled = await harnessDeps.cancelPaidWorkloadRun(db, paidWorkloadRef, runId, entitlement, {
        retainRun: true,
        modelCallsConsumed: 1,
      });
      if (!reconciled) throw new Error('workload reservation no longer matched this run');
    } catch {
      workloadReconciled = false;
      warnings.push('Sona could not reconcile the unused workload allowance. The active-run lock release was retried.');
      await harnessDeps.releasePaidWorkloadRun(db, paidWorkloadRef, runId).catch(() => {
        warnings.push('Sona could not confirm release of the active-run lock. Retry after the lock timeout.');
      });
    }
    return {
      ...baseResult,
      code: 'PRIMARY_JOB_SUPPLY_UNAVAILABLE',
      canScout: true,
      canPrepareAssets: false,
      workloadReconciled,
      primarySupply: {
        status: 'unhealthy',
        preparationReady: false,
        checkedAt: failedAt,
        serviceHost: verifiedPrimarySupply?.serviceHost || null,
        message: 'Ever Jobs passed its initial health check but did not supply the actual search without fallback.',
      },
      jobsFound: 0,
      queuedCount: 0,
      queued: [],
      nextActions: ['Run Sona in scout mode while primary search recovers, then retry packet preparation.'],
      approvalRequired: ['No queue item, generated asset, notification, or external application was created.'],
      notification: { inApp: false, emailSent: false, emailSkippedReason: 'Primary job search degraded to fallback supply' },
      error: 'Sona preparation stopped because the actual job search could not be verified as primary Ever Jobs supply.',
    };
  }

  const uniqueJobs = dedupeTalentJobs(rawJobs);
  const ghostAssessments = scoreAllGhostRisks(uniqueJobs.map(job => ({
    title: job.title,
    company: job.company,
    postedDate: job.postedDate,
    description: job.description,
    salary: job.salary,
    url: job.url,
    location: job.location,
  })));
  const rankedJobs = finalizeTalentRecommendations(uniqueJobs.map((job, index) => ({
    ...job,
    ghostRisk: ghostAssessments[index],
  })), {
    userSkills,
    targetRoles: [goal.targetRole],
    preferredCities: [goal.location],
    remotePref: goal.remotePreference,
    salaryMin: goal.salaryTarget,
    ledger,
  }).slice(0, packetCap);
  rankedRoleCount = rankedJobs.length;

  await runRef.set({
    status: rankedJobs.length ? 'preparing' : 'completed',
    jobsFound: uniqueJobs.length,
    topJobCount: rankedJobs.length,
    updatedAt: new Date().toISOString(),
    steps: [
      { id: 'understand', label: 'Understand goal', status: 'complete' },
      { id: 'search', label: 'Find roles', status: 'complete', count: uniqueJobs.length },
      { id: 'prepare', label: canPrepareAssets ? 'Prepare packets' : 'Queue scout results', status: rankedJobs.length ? 'running' : 'skipped' },
      { id: 'notify', label: 'Notify user', status: 'pending' },
    ],
  }, { merge: true });

  const morphConsent = await harnessDeps.getResumeMorphConsentForUser(uid);
  const morphAccess = resolveResumeMorphAccess({
    requestedMorphPercentage: 100,
    hasFullConsent: morphConsent.unlocked100,
    mode: 'automated',
  });
  const queued: SonaHarnessRunResult['queued'] = [];
  const digestJobs: AgentJobForDigest[] = [];
  const batchDate = new Date().toISOString().split('T')[0];
  const queueRef = userRef.collection('agent_queue');

  for (const job of rankedJobs) {
    const score = job.fitScore?.overall || job.matchScore || 0;
    const reason = job.recommendationReason || 'Sona ranked this role against your career goal.';
    let morphedResume: any = null;
    let morphGuardrailReport: ResumeMorphGuardrailReport | null = null;
    let coverLetter = '';
    let resumeVersionId: string | null = null;
    let morphSucceeded = false;
    let coverLetterSucceeded = false;
    const recommendationCanPrepare = canPrepareAssets && isPreparationEligibleRecommendation(job);
    if (canPrepareAssets && !recommendationCanPrepare) {
      warnings.push(`${job.title} at ${job.company} stayed in review because its fit, confidence, source, or posting-risk evidence did not meet the packet threshold.`);
    }

    if (recommendationCanPrepare) {
      try {
        resumeMorphAttempts += 1;
        const morphResult = await harnessDeps.groqJSONCompletion<{ morphedResume: any }>(
          `Morph this resume for the target job. Keep it truthful.
MORPHING FORMULA: ${morphAccess.effectiveMorphPercentage}% JD alignment / ${100 - morphAccess.effectiveMorphPercentage}% original.
Never invent skills, certifications, licenses, degrees, schools, employers, job titles, dates, contact details, metrics, achievements, or experience. Preserve every original number exactly.
Education must remain exactly as provided. Return JSON: { "morphedResume": { ...full resume object... } }`,
          `RESUME:\n${JSON.stringify(resume, null, 2)}\n\nTARGET:\n${job.title} at ${job.company}\n\nJOB DESCRIPTION:\n${job.description?.slice(0, 2400) || job.title}`,
          { temperature: 0.35, maxTokens: 4200 },
        );
        if (morphResult.morphedResume?.name || morphResult.morphedResume?.summary) {
          const guarded = applyResumeMorphGuardrails(resume, morphResult.morphedResume, morphAccess);
          morphedResume = guarded.resume;
          morphGuardrailReport = guarded.report;
          morphSucceeded = true;
        } else {
          warnings.push(`Resume morph returned no usable draft for ${job.title} at ${job.company}.`);
        }
      } catch {
        warnings.push(`Resume morph failed for ${job.title} at ${job.company}. Sona queued the role for manual review.`);
      }

      try {
        coverLetterAttempts += 1;
        const clResult = await harnessDeps.groqJSONCompletion<{ coverLetter: string }>(
          'Write a natural, specific 3-paragraph cover letter. Use only the provided resume facts. Do not use generic AI phrasing. Return JSON: { "coverLetter": "..." }',
          `COMPANY: ${job.company}\nROLE: ${job.title}\nJOB DESCRIPTION: ${job.description?.slice(0, 1800) || ''}\nRESUME SUMMARY: ${morphedResume?.summary || resume?.summary || ''}`,
          { temperature: 0.65, maxTokens: 1400 },
        );
        coverLetter = cleanString(clResult.coverLetter, 10_000);
        coverLetterSucceeded = Boolean(coverLetter);
        if (!coverLetterSucceeded) warnings.push(`Cover letter draft returned empty for ${job.title} at ${job.company}.`);
      } catch {
        warnings.push(`Cover letter draft failed for ${job.title} at ${job.company}.`);
      }

      if (morphSucceeded && morphedResume) {
        const versionRef = await userRef.collection('resume_versions').add({
          user_id: uid,
          version_name: `[Sona] ${job.company} — ${job.title}`,
          content: morphedResume,
          mode: 'agent_harness',
          guardrail_report: morphGuardrailReport,
          morph_effective_percentage: morphAccess.effectiveMorphPercentage,
          source: 'sona_harness',
          source_resume_id: latestResume.id,
          source_resume_type: latestResume.source,
          source_resume_hash: sourceResumeHash,
          agentRunId: runId,
          is_active: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).catch(() => null);
        resumeVersionId = versionRef?.id || null;
      }
    }

    const packetPrepared = recommendationCanPrepare && morphSucceeded && coverLetterSucceeded;

    const resumeForFit = morphedResume || resume;
    const resumeText = resumeForFit ? flattenResumeToText(resumeForFit) : '';
    const atsResult = resumeText && job.description
      ? calculateATSScore(resumeText, job.description)
      : null;
    const keywordGaps = atsResult?.keywords
      ?.filter(keyword => keyword.status === 'missing' || keyword.status === 'partial')
      .map(keyword => keyword.keyword)
      .slice(0, 8) || [];
    const queueEvidence = buildHarnessQueueEvidence({
      job,
      goal,
      canPrepareAssets: recommendationCanPrepare,
      keywordGaps,
    });
    const { fitSignals, riskSignals } = queueEvidence;
    const queueRecord = buildHarnessQueueRecord({
      uid,
      job,
      goal,
      evidence: queueEvidence,
      canPrepareAssets: packetPrepared,
      mode,
      runId,
      batchDate,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      morphedResume: morphSucceeded ? morphedResume : null,
      morphEffectivePercentage: morphSucceeded ? morphAccess.effectiveMorphPercentage : null,
      morphGuardrailReport,
      coverLetter,
      resumeVersionId,
      sourceResumeId: latestResume.id,
      sourceResumeType: latestResume.source,
      sourceResumeHash,
      atsScore: atsResult?.overallScore || null,
      keywordGaps,
    });
    if (recommendationCanPrepare && !packetPrepared) {
      queueRecord.packetStatus = 'needs_attention';
      queueRecord.nextAction = 'Review the role and retry packet preparation. Sona did not finish every required application asset.';
    }
    const queueDoc = await queueRef.add(queueRecord);
    await harnessDeps.upsertRecommendationLedger(db, uid, job, packetPrepared ? 'prepared' : 'queued', {
      score,
      reason,
      agentRunId: runId,
    }).catch(() => {});

    const queuedItem = buildHarnessQueuedResultItem({
      queueId: queueDoc.id,
      job,
      evidence: queueEvidence,
      canPrepareAssets: packetPrepared,
      resumeVersionId,
    });
    if (recommendationCanPrepare && !packetPrepared) {
      queuedItem.packetStatus = 'needs_attention';
      queuedItem.nextAction = 'Retry packet preparation before reviewing application materials.';
    }
    queued.push(queuedItem);
    digestJobs.push({
      title: job.title,
      company: job.company,
      location: job.location,
      matchScore: score,
      salary: job.salary.min && job.salary.max ? `$${Math.round(job.salary.min / 1000)}k-$${Math.round(job.salary.max / 1000)}k` : '',
      reason,
      nextAction: packetPrepared ? 'Review packet' : recommendationCanPrepare ? 'Retry packet' : 'Review role',
      riskCount: riskSignals.length,
    });
  }

  const preparedCount = queued.filter(item => item.packetStatus === 'prepared').length;
  queuedItemCount = queued.length;
  preparedPacketCount = preparedCount;
  const allPacketsPrepared = canPrepareAssets && queued.length > 0 && preparedCount === queued.length;

  await userRef.collection('agent_notifications').add({
    type: 'career_goal_review_ready',
    status: 'unread',
    title: queued.length ? `Sona found ${queued.length} role${queued.length === 1 ? '' : 's'} for review` : 'Sona could not find matching roles yet',
    body: queued.length
      ? allPacketsPrepared
        ? `Review the queued ${goal.targetRole} packet${queued.length === 1 ? '' : 's'} for ${goal.location}.`
        : `Review the ranked ${goal.targetRole} role${queued.length === 1 ? '' : 's'} for ${goal.location}. Some packet assets may need attention.`
      : `Try a broader role, location, or salary target for ${goal.targetRole}.`,
    href: '/suite/agent/queue',
    agentRunId: runId,
    createdAt: new Date().toISOString(),
  }).catch(() => {});

  const userName = cleanString(userData.fullName || userData.displayName || email?.split('@')[0] || 'there', 80);
  let emailAccepted = false;
  let emailSkippedReason: string | undefined;
  if (input.notify !== false) {
    try {
      emailDigestChecks += 1;
      const digest = await harnessDeps.maybeSendDigest({ db, uid, email, userName, jobs: digestJobs, runId });
      emailAccepted = digest.sent;
      emailDigestsSent = digest.sent ? 1 : 0;
      emailSkippedReason = digest.reason;
    } catch (error: any) {
      emailSkippedReason = error?.message || 'Email send failed';
    }
  } else {
    emailSkippedReason = 'Notification disabled for this run';
  }

  const completedAt = new Date().toISOString();
  const actualWork = currentActualWork();
  const economicsAttribution = await harnessDeps.recordRunEconomics(db, {
    uid,
    runId,
    tier,
    startedAt,
    completedAt,
    terminalStatus: 'completed',
    queuedCount: queued.length,
    preparedCount,
    actual: actualWork,
  }).then(record => ({
    status: record.status,
    usefulOutcome: record.usefulOutcome,
    firstUsefulOutcome: record.firstUsefulOutcome,
    costBasisVersion: record.estimate.basisVersion,
    estimatedCostMicros: record.estimate.estimatedCostMicros,
  })).catch(() => ({
    status: 'failed',
    usefulOutcome: null,
    firstUsefulOutcome: false,
    costBasisVersion: null,
    estimatedCostMicros: null,
  }));
  await runRef.set({
    status: queued.length ? (allPacketsPrepared ? 'prepared' : 'scouted') : 'completed',
    queuedCount: queued.length,
    queued,
    warnings,
    notification: { inApp: true, emailSent: false, emailAccepted, emailSkippedReason: emailSkippedReason || null },
    economics: {
      policyVersion: entitlement.policyVersion,
      paidReason: entitlement.paidReason,
      envelope: entitlement.costEnvelope,
      actual: {
        ...actualWork,
      },
      attribution: economicsAttribution,
    },
    completedAt,
    updatedAt: completedAt,
    steps: [
      { id: 'understand', label: 'Understand goal', status: 'complete' },
      { id: 'search', label: 'Find roles', status: 'complete', count: uniqueJobs.length },
      { id: 'prepare', label: canPrepareAssets ? 'Prepare packets' : 'Queue scout results', status: 'complete', count: queued.length },
      { id: 'notify', label: 'Notify user', status: 'complete' },
    ],
  }, { merge: true });
  if (tier !== 'free') {
    await harnessDeps.releasePaidWorkloadRun(db, paidWorkloadRef, runId).catch(() => {});
  }
  if (queued.length) harnessDeps.invalidateTwin(uid).catch(() => {});
  if (tier === 'free' && queued.length) {
    await freeScoutRef.set({
      status: 'completed',
      completedAt,
      runId,
      recommendationCount: queued.length,
      targetRole: goal.targetRole,
      location: goal.location,
    }, { merge: true }).catch(() => {});
  } else if (tier === 'free') {
    await freeScoutRef.set({
      status: 'completed',
      completedAt,
      runId,
      recommendationCount: 0,
      targetRole: goal.targetRole,
      location: goal.location,
      lastEmptyRunAt: completedAt,
    }, { merge: true }).catch(() => {});
  }

  return {
    ...baseResult,
    success: true,
    status: queued.length ? (allPacketsPrepared ? 'prepared' : 'scouted') : 'scouted',
    jobsFound: uniqueJobs.length,
    queuedCount: queued.length,
    queued,
    nextActions: queued.length
      ? allPacketsPrepared
        ? [
            'Open Agent Queue and review each prepared packet.',
            'Check the resume, cover letter, salary, and job link before applying.',
            'Submit manually only when you approve the packet.',
          ]
        : [
            'Open Agent Queue and review the ranked roles.',
            'Verify salary, work mode, source, and job link before you invest time.',
            canPrepareAssets
              ? 'Sona prepares only roles that meet the fit, confidence, source, and posting-risk threshold.'
              : 'Upgrade to Talent Max when you want Sona to prepare qualifying packets.',
          ]
      : ['Broaden the title, salary floor, or location and ask Sona to scout again.'],
    approvalRequired: canPrepareAssets
      ? [
          'User must review every resume and cover letter before use.',
          'User must open the job link and submit the application manually.',
          'Sona must not invent resume facts, education, employers, dates, certifications, or licenses.',
        ]
      : [
          'User must verify the source, role details, salary, and work mode.',
          'No resume, cover letter, message, or external application was prepared.',
        ],
    notification: { inApp: true, emailSent: false, emailAccepted, emailSkippedReason },
    warnings,
  };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedActualWork = currentActualWork();
    const failedAttribution = await harnessDeps.recordRunEconomics(db, {
      uid,
      runId,
      tier,
      startedAt,
      completedAt: failedAt,
      terminalStatus: 'failed',
      queuedCount: queuedItemCount,
      preparedCount: preparedPacketCount,
      actual: failedActualWork,
    }).then(record => ({
      status: record.status,
      usefulOutcome: null,
      firstUsefulOutcome: false,
      costBasisVersion: record.estimate.basisVersion,
      estimatedCostMicros: record.estimate.estimatedCostMicros,
    })).catch(() => ({
      status: 'failed',
      usefulOutcome: null,
      firstUsefulOutcome: false,
      costBasisVersion: null,
      estimatedCostMicros: null,
    }));
    await runRef.set({
      userId: uid,
      type: 'career_goal_harness',
      status: 'failed',
      tier,
      economics: {
        policyVersion: entitlement.policyVersion,
        paidReason: entitlement.paidReason,
        envelope: entitlement.costEnvelope,
        actual: failedActualWork,
        attribution: failedAttribution,
      },
      failedAt,
      updatedAt: failedAt,
    }, { merge: true }).catch(() => {});
    if (tier !== 'free') {
      await harnessDeps.releasePaidWorkloadRun(db, paidWorkloadRef, runId).catch(() => {});
    }
    throw error;
  }
}
