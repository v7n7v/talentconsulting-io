import type { JobSearchParams } from '@/lib/job-search-api';
import {
  finalizeTalentRecommendations,
  loadRecommendationLedgerWithStatus,
  normalizeJobIdentity,
  searchTalentJobSupply,
  suppressLedgerMatches,
  type LedgerEntry,
  type RecommendationLedgerLoadResult,
  type SourceConfidence,
  type TalentJob,
  type TalentJobSearchResult,
  type TalentSourceType,
} from '@/lib/job-recommendation-platform';
import type { PlanTier } from '@/lib/pricing-tiers';
import { isGroqConfigured } from '@/lib/ai/groq-client';
import { isOpenRouterConfigured } from '@/lib/ai/openrouter-client';
import {
  extractResumeSkills,
  getLatestVerifiedResumeForUser,
  getVerifiedResumeForUserById,
  type LatestResumeResult,
} from '@/lib/server-resume';

export type SonaActivationProofStatus = 'ready' | 'degraded' | 'blocked';
export type SonaActivationProofCode =
  | 'ACTIVATION_READY'
  | 'ACTIVATION_DEGRADED'
  | 'MISSING_VERIFIED_RESUME'
  | 'MISSING_TARGET_BRIEF'
  | 'SAFE_SUPPLY_UNAVAILABLE'
  | 'INSUFFICIENT_SAFE_RESULTS';

export type SonaActivationProofApiCode =
  | SonaActivationProofCode
  | 'AUTH_REQUIRED'
  | 'INVALID_TARGET_BRIEF'
  | 'RATE_LIMITED'
  | 'RATE_LIMIT_UNAVAILABLE'
  | 'ACTIVATION_PROOF_FAILED';

export interface SonaActivationProofInput {
  resumeVersionId?: string;
  targetRole?: string;
  location?: string;
  salaryTarget?: number;
  remotePreference?: 'remote' | 'hybrid' | 'onsite' | 'any';
  tier: PlanTier;
}

interface JobPreferences {
  targetRoles?: unknown[];
  preferredCities?: unknown[];
  salaryMin?: unknown;
  remotePref?: unknown;
}

interface JobPreferencesLoadResult {
  preferences: JobPreferences;
  complete: boolean;
}

export interface SonaActivationProofPick {
  rank: number;
  jobKey: string;
  title: string;
  company: string;
  location: string;
  fitScore: number;
  fitBreakdown: NonNullable<TalentJob['fitBreakdown']>;
  fitReasons: string[];
  riskNotes: string[];
  sourceNotes: string[];
  nextAction: string;
  source: {
    name: string;
    type: TalentSourceType;
    confidence: SourceConfidence;
    applyUrl: string;
    canonicalUrl: string;
  };
}

export interface SonaActivationProofResult {
  status: SonaActivationProofStatus;
  code: SonaActivationProofCode;
  message: string;
  generatedAt: string;
  tier: PlanTier;
  target: {
    role: string;
    location: string;
    salaryTarget: number;
    remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
    missingFields: Array<'targetRole' | 'location'>;
    preferencesStatus: 'complete' | 'unavailable';
    confirmationRequired: boolean;
  };
  resume: {
    found: boolean;
    verified: boolean;
    verificationKind: string;
    source: LatestResumeResult['source'];
    id: string | null;
    skillsUsed: number;
  };
  supply: {
    provider: TalentJobSearchResult['source'] | null;
    providerStatus: TalentJobSearchResult['providerStatus'] | null;
    jobsReceived: number;
    duplicatesSuppressed: number;
    reviewDuplicatesSuppressed: number;
    historySuppressed: number;
    ledgerStatus: 'complete' | 'unavailable';
    trustedTopPickCount: number;
    trustedTopPickRate: number;
    verifiedApplyUrlCount: number;
    verifiedCanonicalUrlCount: number;
    workModeMatchCount: number;
  };
  generation: {
    status: 'ready' | 'unavailable';
    preparationReady: boolean;
    message: string;
  };
  topPicks: SonaActivationProofPick[];
  canScout: boolean;
  canPrepare: boolean;
  activationReady: boolean;
  packetReviewRequired: true;
  sideEffects: {
    quotaConsumed: false;
    runCreated: false;
    queueWritten: false;
    packetGenerated: false;
    resumeMutated: false;
    notificationSent: false;
    externalApplicationSubmitted: false;
  };
  nextAction: string;
  activationReceipt?: {
    token: string;
    expiresAt: string;
  };
}

interface ActivationProofDeps {
  getLatestVerifiedResumeForUser: typeof getLatestVerifiedResumeForUser;
  getVerifiedResumeForUserById: typeof getVerifiedResumeForUserById;
  extractResumeSkills: typeof extractResumeSkills;
  loadRecommendationLedgerWithStatus: typeof loadRecommendationLedgerWithStatus;
  searchTalentJobSupply: typeof searchTalentJobSupply;
  getJobPreferences: (db: FirebaseFirestore.Firestore, uid: string) => Promise<JobPreferencesLoadResult>;
  now: () => Date;
  isGenerationConfigured: () => boolean;
}

const defaultDeps: ActivationProofDeps = {
  getLatestVerifiedResumeForUser,
  getVerifiedResumeForUserById,
  extractResumeSkills,
  loadRecommendationLedgerWithStatus,
  searchTalentJobSupply,
  getJobPreferences: loadJobPreferences,
  now: () => new Date(),
  isGenerationConfigured: () => isGroqConfigured() && isOpenRouterConfigured(),
};

const SAFE_RECEIPT = {
  quotaConsumed: false,
  runCreated: false,
  queueWritten: false,
  packetGenerated: false,
  resumeMutated: false,
  notificationSent: false,
  externalApplicationSubmitted: false,
} as const;

function cleanString(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function firstString(values: unknown) {
  if (!Array.isArray(values)) return '';
  return cleanString(values.find(value => cleanString(value)));
}

function normalizeSalary(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1_000_000, Math.round(numeric));
}

function normalizeRemotePreference(value: unknown): NonNullable<SonaActivationProofInput['remotePreference']> {
  return value === 'remote' || value === 'hybrid' || value === 'onsite' || value === 'any'
    ? value
    : 'any';
}

function inferResumeRole(resume: any) {
  return cleanString(
    resume?.title
    || resume?.headline
    || resume?.jobTitle
    || resume?.professionalTitle
    || resume?.experience?.[0]?.role
    || resume?.experience?.[0]?.title,
  );
}

function inferResumeLocation(resume: any) {
  return cleanString(
    resume?.location
    || resume?.contact?.location
    || resume?.personalInfo?.location
    || resume?.address,
  );
}

function inferCountry(location: string) {
  const lower = location.toLowerCase();
  if (/\b(canada|ontario|quebec|toronto|vancouver|montreal)\b/.test(lower)) return 'ca';
  if (/\b(united kingdom|uk|england|scotland|wales|london|manchester)\b/.test(lower)) return 'gb';
  if (/\b(australia|sydney|melbourne|brisbane|perth)\b/.test(lower)) return 'au';
  if (/\b(germany|berlin|munich|hamburg|frankfurt)\b/.test(lower)) return 'de';
  return 'us';
}

function sourcePriority(job: TalentJob) {
  const confidence = job.sourceMeta.sourceConfidence === 'high'
    ? 30
    : job.sourceMeta.sourceConfidence === 'medium'
      ? 20
      : 10;
  const type = job.sourceMeta.sourceType === 'direct_ats'
    ? 5
    : job.sourceMeta.sourceType === 'company_page'
      ? 4
      : job.sourceMeta.sourceType === 'remote_board'
        ? 3
        : job.sourceMeta.sourceType === 'api_board'
          ? 2
          : 1;
  return confidence + type;
}

function dedupeForProof(jobs: TalentJob[]) {
  const unique = new Map<string, TalentJob>();
  for (const job of jobs) {
    const identity = job.identityKey || normalizeJobIdentity(job) || job.dedupeKey;
    const existing = unique.get(identity);
    if (!existing || sourcePriority(job) > sourcePriority(existing)) unique.set(identity, job);
  }
  return [...unique.values()];
}

function reviewIdentity(job: TalentJob) {
  return [job.company, job.title]
    .map(value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)
    .join('|');
}

function diversifyForReview(jobs: TalentJob[]) {
  const seen = new Set<string>();
  const diverse: TalentJob[] = [];
  for (const job of jobs) {
    const identity = reviewIdentity(job) || job.identityKey || job.dedupeKey;
    if (seen.has(identity)) continue;
    seen.add(identity);
    diverse.push(job);
  }
  return diverse;
}

function isTrustedSource(job: TalentJob) {
  return job.sourceMeta.sourceConfidence !== 'low' && job.sourceMeta.sourceType !== 'aggregator';
}

const APPROVED_SOURCE_HOSTS: Record<string, string[]> = {
  greenhouse: ['greenhouse.io', 'greenhouse.com'],
  lever: ['lever.co'],
  ashby: ['ashbyhq.com'],
  workday: ['myworkdayjobs.com', 'workday.com'],
  remoteok: ['remoteok.com'],
  remotive: ['remotive.com'],
  jobicy: ['jobicy.com'],
  himalayas: ['himalayas.app'],
  weworkremotely: ['weworkremotely.com'],
  usajobs: ['usajobs.gov'],
  adzuna: ['adzuna.com'],
  amazon: ['amazon.jobs'],
  apple: ['jobs.apple.com'],
  microsoft: ['jobs.careers.microsoft.com'],
  google: ['google.com'],
  openai: ['openai.com'],
};

function sourceHosts(job: TalentJob) {
  const source = job.sourceMeta.sourceName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const matches = Object.entries(APPROVED_SOURCE_HOSTS)
    .filter(([key]) => source.includes(key))
    .flatMap(([, hosts]) => hosts);
  return Array.from(new Set(matches));
}

function safeApplyUrl(value: unknown, job: TalentJob) {
  if (typeof value !== 'string' || !value.trim() || value.trim() === '#') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const hosts = sourceHosts(job);
    if (hosts.length === 0 || !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function loadJobPreferences(db: FirebaseFirestore.Firestore, uid: string): Promise<JobPreferencesLoadResult> {
  const [settings, legacy] = await Promise.all([
    db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get().catch(() => null),
    db.collection('users').doc(uid).collection('preferences').doc('job_search').get().catch(() => null),
  ]);
  const preferences = {
    ...(legacy?.exists ? legacy.data() : {}),
    ...(settings?.exists ? settings.data() : {}),
  };
  return {
    preferences,
    complete: Boolean(settings && legacy)
      && Boolean(settings?.exists || legacy?.exists)
      && hasCompleteJobPreferenceBrief(preferences),
  };
}

export function hasCompleteJobPreferenceBrief(preferences: JobPreferences) {
  const hasRole = Boolean(firstString(preferences.targetRoles));
  const hasLocation = Boolean(firstString(preferences.preferredCities));
  const hasWorkMode = preferences.remotePref === 'remote'
    || preferences.remotePref === 'hybrid'
    || preferences.remotePref === 'onsite'
    || preferences.remotePref === 'any';
  return hasRole && hasLocation && hasWorkMode;
}

function workModeMatches(job: TalentJob, preference: NonNullable<SonaActivationProofInput['remotePreference']>) {
  if (preference === 'any') return true;
  return job.remoteMode === preference;
}

function blockedResult(
  input: SonaActivationProofInput,
  generatedAt: string,
  code: Extract<SonaActivationProofCode, 'MISSING_VERIFIED_RESUME' | 'MISSING_TARGET_BRIEF' | 'SAFE_SUPPLY_UNAVAILABLE' | 'INSUFFICIENT_SAFE_RESULTS'>,
  message: string,
  target: SonaActivationProofResult['target'],
  resume: SonaActivationProofResult['resume'],
  generation: SonaActivationProofResult['generation'],
  supply?: Partial<SonaActivationProofResult['supply']>,
): SonaActivationProofResult {
  return {
    status: 'blocked',
    code,
    message,
    generatedAt,
    tier: input.tier,
    target,
    resume,
    supply: {
      provider: supply?.provider || null,
      providerStatus: supply?.providerStatus || null,
      jobsReceived: supply?.jobsReceived || 0,
      duplicatesSuppressed: supply?.duplicatesSuppressed || 0,
      reviewDuplicatesSuppressed: supply?.reviewDuplicatesSuppressed || 0,
      historySuppressed: supply?.historySuppressed || 0,
      ledgerStatus: supply?.ledgerStatus || 'unavailable',
      trustedTopPickCount: 0,
      trustedTopPickRate: 0,
      verifiedApplyUrlCount: 0,
      verifiedCanonicalUrlCount: 0,
      workModeMatchCount: 0,
    },
    topPicks: [],
    generation,
    canScout: false,
    canPrepare: false,
    activationReady: false,
    packetReviewRequired: true,
    sideEffects: SAFE_RECEIPT,
    nextAction: code === 'MISSING_VERIFIED_RESUME'
      ? 'Upload or select a verified resume.'
      : code === 'MISSING_TARGET_BRIEF'
        ? 'Add the missing role and location to the target brief.'
        : 'Keep the target brief and try the safe-source search again.',
  };
}

export async function runSonaActivationProof(
  db: FirebaseFirestore.Firestore,
  uid: string,
  input: SonaActivationProofInput,
  overrides: Partial<ActivationProofDeps> = {},
): Promise<SonaActivationProofResult> {
  const deps = { ...defaultDeps, ...overrides };
  const generatedAt = deps.now().toISOString();
  const generationReady = deps.isGenerationConfigured();
  const generation: SonaActivationProofResult['generation'] = {
    status: generationReady ? 'ready' : 'unavailable',
    preparationReady: generationReady,
    message: generationReady
      ? 'Truth-locked packet generation is configured. Provider availability is checked during the run.'
      : 'Scouting is available, but truth-locked resume and cover-letter generation is not configured on this environment.',
  };
  const requestedResumeVersionId = cleanString(input.resumeVersionId, 180);
  const [resumeResult, preferenceLoad] = await Promise.all([
    requestedResumeVersionId
      ? deps.getVerifiedResumeForUserById(db, uid, requestedResumeVersionId)
      : deps.getLatestVerifiedResumeForUser(db, uid),
    deps.getJobPreferences(db, uid),
  ]);
  const preferences = preferenceLoad.preferences;
  const resume = resumeResult.resume;
  const resumeSummary = {
    found: Boolean(resume),
    verified: resumeResult.verification?.verified === true
      && resumeResult.verification.kind === 'explicit_user_source',
    verificationKind: resumeResult.verification?.kind || 'unverified',
    source: resumeResult.source,
    id: resumeResult.id,
    skillsUsed: resume ? deps.extractResumeSkills(resume).length : 0,
  };
  const remotePreference = normalizeRemotePreference(input.remotePreference || preferences.remotePref);
  const role = cleanString(input.targetRole)
    || firstString(preferences.targetRoles)
    || inferResumeRole(resume);
  const location = cleanString(input.location)
    || firstString(preferences.preferredCities)
    || inferResumeLocation(resume)
    || (remotePreference === 'remote' ? 'Remote' : '');
  const salaryTarget = normalizeSalary(input.salaryTarget) || normalizeSalary(preferences.salaryMin);
  const explicitTargetComplete = Boolean(cleanString(input.targetRole) && cleanString(input.location) && input.remotePreference);
  const confirmationRequired = !preferenceLoad.complete && !explicitTargetComplete;
  const missingFields: SonaActivationProofResult['target']['missingFields'] = [];
  if (!role) missingFields.push('targetRole');
  if (!location) missingFields.push('location');
  const target = {
    role,
    location,
    salaryTarget,
    remotePreference,
    missingFields,
    preferencesStatus: preferenceLoad.complete ? 'complete' as const : 'unavailable' as const,
    confirmationRequired,
  };

  if (!resume || !resumeSummary.verified) {
    return blockedResult(
      input,
      generatedAt,
      'MISSING_VERIFIED_RESUME',
      resume
        ? 'Sona found resume data, but its user-source provenance is missing or ambiguous.'
        : 'Sona needs a verified resume before proving the recommendation flow.',
      target,
      resumeSummary,
      generation,
    );
  }
  if (missingFields.length > 0) {
    return blockedResult(
      input,
      generatedAt,
      'MISSING_TARGET_BRIEF',
      'The activation proof needs a target role and location before searching.',
      target,
      resumeSummary,
      generation,
    );
  }

  const searchParams: JobSearchParams = {
    query: role,
    location,
    country: inferCountry(location),
    remote: remotePreference === 'remote',
    page: 1,
    resultsPerPage: 20,
    sortBy: 'relevance',
    salaryMin: salaryTarget || undefined,
  };
  let searchResult: TalentJobSearchResult;
  try {
    searchResult = await deps.searchTalentJobSupply(searchParams);
  } catch {
    return blockedResult(
      input,
      generatedAt,
      'SAFE_SUPPLY_UNAVAILABLE',
      'Safe job supply did not respond. No queue, packet or application was created.',
      target,
      resumeSummary,
      generation,
    );
  }

  const deduped = dedupeForProof(searchResult.jobs);
  const ledgerLoad: RecommendationLedgerLoadResult = await deps.loadRecommendationLedgerWithStatus(db, uid);
  const ledger: Map<string, LedgerEntry> = ledgerLoad.ledger;
  const eligible = suppressLedgerMatches(deduped, ledger);
  const rankedEligible = finalizeTalentRecommendations(eligible, {
    userSkills: deps.extractResumeSkills(resume),
    targetRoles: [role],
    preferredCities: [location],
    remotePref: remotePreference,
    salaryMin: salaryTarget,
    ledger,
  });
  const diverseRanked = diversifyForReview(rankedEligible);
  const ranked = diverseRanked.slice(0, 3);
  const supplyBase = {
    provider: searchResult.source,
    providerStatus: searchResult.providerStatus,
    jobsReceived: searchResult.jobs.length,
    duplicatesSuppressed: Math.max(0, searchResult.jobs.length - deduped.length),
    reviewDuplicatesSuppressed: Math.max(0, rankedEligible.length - diverseRanked.length),
    historySuppressed: Math.max(0, deduped.length - eligible.length),
    ledgerStatus: ledgerLoad.complete ? 'complete' as const : 'unavailable' as const,
  };

  if (ranked.length === 0) {
    return blockedResult(
      input,
      generatedAt,
      'INSUFFICIENT_SAFE_RESULTS',
      'No reviewable safe-source matches remain for this target.',
      target,
      resumeSummary,
      generation,
      supplyBase,
    );
  }

  const topPicks: SonaActivationProofPick[] = ranked.map((job, index) => ({
    rank: index + 1,
    jobKey: job.identityKey || normalizeJobIdentity(job) || job.dedupeKey,
    title: job.title,
    company: job.company,
    location: job.location,
    fitScore: job.fitBreakdown?.overall || job.matchScore || 0,
    fitBreakdown: job.fitBreakdown!,
    fitReasons: job.fitReasons || [],
    riskNotes: job.riskNotes || [],
    sourceNotes: job.sourceNotes || [],
    nextAction: job.nextAction || 'Review gaps',
    source: {
      name: job.sourceMeta.sourceName,
      type: job.sourceMeta.sourceType,
      confidence: job.sourceMeta.sourceConfidence,
      applyUrl: safeApplyUrl(job.sourceMeta.directApplyUrl || job.url, job) || '',
      canonicalUrl: safeApplyUrl(job.sourceMeta.canonicalUrl, job) || '',
    },
  }));
  const trustedTopPickCount = ranked.filter(isTrustedSource).length;
  const trustedTopPickRate = Math.round((trustedTopPickCount / ranked.length) * 100);
  const verifiedApplyUrlCount = topPicks.filter(pick => Boolean(pick.source.applyUrl)).length;
  const verifiedCanonicalUrlCount = topPicks.filter(pick => Boolean(pick.source.canonicalUrl)).length;
  const workModeMatchCount = ranked.filter(job => workModeMatches(job, remotePreference)).length;
  const canScout = ranked.length > 0;
  const canPrepare = ranked.length === 3
    && searchResult.providerStatus.everJobs === 'success'
    && !searchResult.providerStatus.fallbackUsed
    && trustedTopPickRate >= 80
    && verifiedApplyUrlCount === ranked.length
    && verifiedCanonicalUrlCount === ranked.length
    && workModeMatchCount === ranked.length
    && ledgerLoad.complete
    && !confirmationRequired
    && generationReady;
  const activationReady = canPrepare;
  const degraded = !canPrepare
    || searchResult.providerStatus.everJobs !== 'success'
    || searchResult.providerStatus.fallbackUsed
    || trustedTopPickRate < 80;

  return {
    status: degraded ? 'degraded' : 'ready',
    code: degraded ? 'ACTIVATION_DEGRADED' : 'ACTIVATION_READY',
    message: degraded
      ? !generationReady
        ? `${ranked.length} reviewable pick${ranked.length === 1 ? '' : 's'} found. Scouting is ready, but packet generation is unavailable on this environment.`
        : `${ranked.length} reviewable pick${ranked.length === 1 ? '' : 's'} found, but primary supply or source-quality evidence is incomplete.`
      : 'Three explainable, trusted-source picks are ready for a user-controlled harness run.',
    generatedAt,
    tier: input.tier,
    target,
    resume: resumeSummary,
    supply: {
      ...supplyBase,
      trustedTopPickCount,
      trustedTopPickRate,
      verifiedApplyUrlCount,
      verifiedCanonicalUrlCount,
      workModeMatchCount,
    },
    generation,
    topPicks,
    canScout,
    canPrepare,
    activationReady,
    packetReviewRequired: true,
    sideEffects: SAFE_RECEIPT,
    nextAction: canPrepare
      ? 'Run Sona in scout or prepare mode, then review every packet before any external action.'
      : canScout
        ? !generationReady
          ? 'Review these picks now. Start Sona only after generation service access is restored.'
          : 'Review the scout results, then restore primary supply and ledger evidence before preparing packets.'
        : 'Broaden the target or restore primary safe-source supply before launching the harness.',
  };
}
