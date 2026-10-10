import crypto from 'crypto';
import type { JobSearchParams, JobSearchResult, RealJob } from '@/lib/job-search-api';
import { searchJobs as searchLegacyJobs, calculateFitScore, extractSkillsFromDescription } from '@/lib/job-search-api';
import { KNOWN_BOARDS, searchAllKnownBoards, searchCompanyJobs, type PortalJob } from '@/lib/portal-scanner';
import type { GhostAssessment } from '@/lib/ghost-filter';
import {
  captureRecommendationCalibrationEvidence,
  fingerprintRecommendationResume,
  type RecommendationCalibrationEvidence,
} from '@/lib/recommendation-calibration';
import { getJobSupplyServiceUrl } from '@/lib/job-supply-health';

export type TalentSourceType = 'direct_ats' | 'company_page' | 'remote_board' | 'api_board' | 'aggregator';
export type SourceConfidence = 'high' | 'medium' | 'low';
export type TalentFitConfidence = 'high' | 'medium' | 'low';
export const TALENT_FIT_SCORE_VERSION = 'talent-fit-v2-2026-07-10';
export const TALENT_FIT_SCORE_POLICY = {
  skills: 0.28,
  titleSeniority: 0.18,
  location: 0.12,
  salary: 0.10,
  freshness: 0.10,
  source: 0.10,
  risk: 0.06,
  preference: 0.06,
} as const;
export const TALENT_FIT_THRESHOLDS = {
  prepare: 80,
  review: 68,
} as const;
export const RECOMMENDATION_DIGEST_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export type RecommendationLedgerStatus =
  | 'shown'
  | 'saved'
  | 'dismissed'
  | 'queued'
  | 'prepared'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted';

export interface TalentSourceMeta {
  sourceType: TalentSourceType;
  sourceName: string;
  sourceConfidence: SourceConfidence;
  directApplyUrl: string;
  canonicalUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TalentFitBreakdown {
  scoreVersion: typeof TALENT_FIT_SCORE_VERSION;
  confidence: TalentFitConfidence;
  evidenceCoverage: number;
  overall: number;
  skills: number;
  titleSeniority: number;
  domain: number;
  location: number;
  salary: number;
  freshness: number;
  resumeCoverage: number;
  risk: number;
  preference: number;
  source: number;
}

export interface TalentJob extends Omit<RealJob, 'source'> {
  source: string;
  remoteMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  sourceMeta: TalentSourceMeta;
  dedupeKey: string;
  keywordScore?: number | null;
  matchScore?: number | null;
  matchMethod?: 'keyword' | 'semantic' | 'hybrid' | 'ai';
  ghostRisk?: GhostAssessment;
  fitScore?: TalentFitBreakdown | null;
  fitBreakdown?: TalentFitBreakdown | null;
  recommendationReason?: string;
  fitReasons?: string[];
  riskNotes?: string[];
  sourceNotes?: string[];
  nextAction?: string;
  preparationEligible?: boolean;
  outboundLinkVerified?: boolean;
  ledgerStatus?: RecommendationLedgerStatus | null;
  ledgerFeedbackTags?: string[];
  packetStatus?: string;
  identityKey?: string;
  sourceJobId?: string;
}

export interface TalentJobSearchResult {
  jobs: TalentJob[];
  totalCount: number;
  source: string;
  cached?: boolean;
  providerStatus: {
    everJobs: 'disabled' | 'success' | 'empty' | 'error';
    fallbackUsed: boolean;
    fallbackStatus?: 'not_used' | 'success' | 'empty' | 'error';
    sources: string[];
  };
}

export function isJobSupplyOperational(status: TalentJobSearchResult['providerStatus']): boolean {
  if (status.everJobs === 'success' || status.everJobs === 'empty') return true;
  if (status.fallbackStatus === 'success' || status.fallbackStatus === 'empty') return true;
  return status.sources.length > 0;
}

export interface LedgerEntry {
  jobKey: string;
  status: RecommendationLedgerStatus;
  feedbackTags: string[];
  score?: number | null;
  scoreBreakdown?: TalentFitBreakdown | null;
  updatedAt?: string;
  lastSeenAt?: string;
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  recommendationReason?: string;
  nextAction?: string;
  sourceMeta?: TalentSourceMeta | null;
}

export interface RecommendationDigestEvidence {
  jobKey: string;
  title: string;
  company: string;
  location: string;
  url: string;
  talentFitScore: number;
  scoreVersion: typeof TALENT_FIT_SCORE_VERSION;
  fitConfidence: TalentFitConfidence;
  sourceConfidence: SourceConfidence;
  sourceName: string;
  reason: string;
  nextAction: string;
}

export interface RecommendationLedgerLoadResult {
  ledger: Map<string, LedgerEntry>;
  complete: boolean;
  truncated: boolean;
  checkedCount: number;
}

export interface RecommendationContext {
  userSkills?: string[];
  targetRoles?: string[];
  preferredCities?: string[];
  remotePref?: 'remote' | 'hybrid' | 'onsite' | 'any' | string;
  salaryMin?: number;
  ledger?: Map<string, LedgerEntry>;
}

const TERMINAL_SUPPRESS_STATUSES = new Set<RecommendationLedgerStatus>(['dismissed', 'applied', 'interview', 'offer', 'rejected', 'ghosted']);
const POSITIVE_RECOMMENDATION_STATUSES = new Set<RecommendationLedgerStatus>(['saved', 'applied', 'interview', 'offer']);
const PREFERENCE_FEEDBACK_TAGS = new Set(['more_like_this', 'wrong_role', 'wrong_location', 'wrong_seniority', 'salary_too_low', 'not_interested', 'bad_source']);
const ROLE_TOKEN_STOPWORDS = new Set(['and', 'the', 'for', 'with', 'senior', 'junior', 'lead', 'manager', 'specialist', 'associate', 'level', 'remote', 'hybrid']);
const DEFAULT_SAFE_SOURCES = [
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'remoteok',
  'remotive',
  'jobicy',
  'himalayas',
  'weworkremotely',
  'usajobs',
  'adzuna',
];
const SOURCE_TRUST_PROFILES: Record<string, {
  aliases: string[];
  sourceType: TalentSourceType;
  sourceConfidence: SourceConfidence;
  hosts: string[];
}> = {
  greenhouse: { aliases: ['greenhouse'], sourceType: 'direct_ats', sourceConfidence: 'high', hosts: ['greenhouse.io'] },
  lever: { aliases: ['lever'], sourceType: 'direct_ats', sourceConfidence: 'high', hosts: ['lever.co'] },
  ashby: { aliases: ['ashby'], sourceType: 'direct_ats', sourceConfidence: 'high', hosts: ['ashbyhq.com'] },
  workday: { aliases: ['workday'], sourceType: 'direct_ats', sourceConfidence: 'high', hosts: ['myworkdayjobs.com', 'myworkdaysite.com'] },
  remoteok: { aliases: ['remoteok', 'remote ok'], sourceType: 'remote_board', sourceConfidence: 'medium', hosts: ['remoteok.com'] },
  remotive: { aliases: ['remotive'], sourceType: 'remote_board', sourceConfidence: 'medium', hosts: ['remotive.com'] },
  jobicy: { aliases: ['jobicy'], sourceType: 'remote_board', sourceConfidence: 'medium', hosts: ['jobicy.com'] },
  himalayas: { aliases: ['himalayas'], sourceType: 'remote_board', sourceConfidence: 'medium', hosts: ['himalayas.app'] },
  weworkremotely: { aliases: ['weworkremotely', 'we work remotely'], sourceType: 'remote_board', sourceConfidence: 'medium', hosts: ['weworkremotely.com'] },
  usajobs: { aliases: ['usajobs', 'usa jobs'], sourceType: 'api_board', sourceConfidence: 'medium', hosts: ['usajobs.gov'] },
  adzuna: { aliases: ['adzuna'], sourceType: 'api_board', sourceConfidence: 'medium', hosts: ['adzuna.com'] },
};
const US_STATE_ALIASES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de',
  florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky',
  louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa',
  'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy',
};

function clean(value = '') {
  return value.toLowerCase().replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeSourceIdentifier(value = '') {
  return clean(value).replace(/\s+/g, '');
}

function normalizeCompanyIdentity(value = '') {
  return clean(value).replace(/\b(?:inc|incorporated|llc|ltd|limited|corp|corporation|company|co)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTitleIdentity(value = '') {
  return clean(value).replace(/\bsr\b/g, 'senior').replace(/\bjr\b/g, 'junior').replace(/\s+/g, ' ').trim();
}

function normalizeGeography(value = '') {
  let normalized = clean(value);
  for (const [name, abbreviation] of Object.entries(US_STATE_ALIASES)) {
    normalized = normalized.replace(new RegExp(`\\b${name}\\b`, 'g'), abbreviation);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function normalizeLocationIdentity(value = '') {
  return normalizeGeography(value)
    .replace(/\b(?:hybrid|remote|on site|onsite)\b/g, ' ')
    .replace(/\b(?:united states of america|united states|usa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampScore(value: number) {
  return Math.min(98, Math.max(0, Math.round(value)));
}

function parseSafeSources() {
  const raw = process.env.EVER_JOBS_SAFE_SOURCES || DEFAULT_SAFE_SOURCES.join(',');
  return raw.split(',').map(source => source.trim().toLowerCase()).filter(Boolean);
}

function sourceProfileId(sourceName: string) {
  const normalized = normalizeSourceIdentifier(sourceName);
  return Object.entries(SOURCE_TRUST_PROFILES).find(([, profile]) => (
    profile.aliases.some(alias => normalizeSourceIdentifier(alias) === normalized)
  ))?.[0] || null;
}

function hostMatches(hostname: string, allowedHost: string) {
  const normalizedHost = hostname.toLowerCase().replace(/\.$/, '');
  const normalizedAllowed = allowedHost.toLowerCase().replace(/\.$/, '');
  return normalizedHost === normalizedAllowed || normalizedHost.endsWith(`.${normalizedAllowed}`);
}

export function resolveTalentSourceTrust(sourceName: string, url: string, safeSources = parseSafeSources()) {
  const profileId = sourceProfileId(sourceName);
  const approvedSourceIds = new Set(safeSources.map(source => sourceProfileId(source) || normalizeSourceIdentifier(source)));
  const profile = profileId ? SOURCE_TRUST_PROFILES[profileId] : null;
  let hostname = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') hostname = parsed.hostname;
  } catch {
    // Invalid or non-HTTPS URLs never earn source trust.
  }
  const approved = Boolean(
    profileId
    && profile
    && approvedSourceIds.has(profileId)
    && profile.hosts.some(host => hostMatches(hostname, host))
  );
  return {
    approved,
    profileId,
    sourceType: approved && profile ? profile.sourceType : 'aggregator' as TalentSourceType,
    sourceConfidence: approved && profile ? profile.sourceConfidence : 'low' as SourceConfidence,
  };
}

export function getTrustedTalentJobApplyUrl(job: Pick<TalentJob, 'url' | 'sourceMeta'>): string | null {
  const sourceMeta = job.sourceMeta;
  const canonicalUrl = sourceMeta?.canonicalUrl || job.url || '';
  const applyUrl = sourceMeta?.directApplyUrl || job.url || '';
  const canonicalTrust = resolveTalentSourceTrust(sourceMeta?.sourceName || '', canonicalUrl);
  const applyTrust = resolveTalentSourceTrust(sourceMeta?.sourceName || '', applyUrl);
  if (!canonicalTrust.approved
    || !applyTrust.approved
    || canonicalTrust.sourceType !== sourceMeta?.sourceType
    || canonicalTrust.sourceConfidence !== sourceMeta?.sourceConfidence
    || !isUsableHttpsUrl(applyUrl)) {
    return null;
  }
  return applyUrl;
}

function everJobsEnabled() {
  return process.env.EVER_JOBS_ENABLED === 'true' && Boolean(getJobSupplyServiceUrl());
}

export function normalizeJobKey(job: { title?: string; company?: string; location?: string; url?: string }) {
  return [clean(job.company), clean(job.title), clean(job.location || ''), clean(job.url || '').slice(0, 90)]
    .filter(Boolean)
    .join('|');
}

/** Stable job-family identity for cross-provider comparison. */
function normalizeJobFamilyIdentity(job: { title?: string; company?: string; location?: string }) {
  return [normalizeCompanyIdentity(job.company), normalizeTitleIdentity(job.title), normalizeLocationIdentity(job.location || '')]
    .filter(Boolean)
    .join('|');
}

export function normalizeJobIdentity(job: {
  title?: string;
  company?: string;
  location?: string;
  category?: string;
  sourceJobId?: string;
  sourceMeta?: Pick<TalentSourceMeta, 'sourceType'> & Partial<Pick<TalentSourceMeta, 'sourceName'>>;
}) {
  const identity = [normalizeJobFamilyIdentity(job), clean(job.category || '')].filter(Boolean);
  if (job.sourceJobId) {
    const provider = sourceProfileId(job.sourceMeta?.sourceName || '')
      || normalizeSourceIdentifier(job.sourceMeta?.sourceName || '')
      || job.sourceMeta?.sourceType
      || 'unknown';
    const opaquePostingId = crypto
      .createHash('sha256')
      .update(`${provider}\0${job.sourceJobId}`)
      .digest('hex')
      .slice(0, 24);
    identity.push(`posting:${provider}:${opaquePostingId}`);
  }
  return identity.join('|');
}

function ledgerDocId(jobKey: string) {
  return crypto.createHash('sha1').update(jobKey).digest('hex');
}

function storedTimestampMillis(value: any) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createRecommendationImpressionSession(
  db: FirebaseFirestore.Firestore,
  uid: string,
  jobs: TalentJob[],
  input: { resumeId: string | null; resume: unknown; sortBy: string },
) {
  if (!uid || uid.startsWith('anon:') || jobs.length === 0) return null;
  const impressionId = crypto.randomUUID();
  const createdAt = new Date();
  const resumeFingerprint = input.resumeId ? fingerprintRecommendationResume(input.resume) : null;
  await db.collection('users').doc(uid).collection('recommendation_impressions').doc(impressionId).create({
    version: 1,
    impressionId,
    scoreVersion: TALENT_FIT_SCORE_VERSION,
    sortBy: input.sortBy,
    resumeId: input.resumeId,
    resumeFingerprint,
    createdAt: createdAt.toISOString(),
    // Firestore persists Date as Timestamp; the configured TTL policy removes it.
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
    jobs: jobs.slice(0, 30).map((job, index) => ({
      jobKey: job.identityKey || normalizeJobIdentity(job) || job.dedupeKey || normalizeJobKey(job),
      rank: index + 1,
      score: job.matchScore ?? job.fitScore?.overall ?? null,
      scoreBreakdown: job.fitBreakdown || job.fitScore || null,
      sourceMeta: job.sourceMeta || null,
      observedAt: createdAt.toISOString(),
    })),
  });
  return impressionId;
}

export async function loadRecommendationCalibrationEvidenceFromImpression(
  db: FirebaseFirestore.Firestore,
  uid: string,
  input: {
    impressionId?: unknown;
    resumeId: string | null;
    resume: unknown;
    job: Partial<TalentJob> & { title?: string; company?: string; location?: string; url?: string };
  },
): Promise<RecommendationCalibrationEvidence> {
  const impressionId = typeof input.impressionId === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(input.impressionId)
    ? input.impressionId
    : '';
  if (!uid || uid.startsWith('anon:') || !impressionId) {
    return captureRecommendationCalibrationEvidence(null, TALENT_FIT_SCORE_VERSION);
  }
  const snapshot = await db.collection('users').doc(uid).collection('recommendation_impressions').doc(impressionId).get();
  const session = snapshot.exists ? snapshot.data() || {} : null;
  if (!session) return captureRecommendationCalibrationEvidence(null, TALENT_FIT_SCORE_VERSION);
  const jobKey = input.job.identityKey || normalizeJobIdentity(input.job) || input.job.dedupeKey || normalizeJobKey(input.job);
  const entry = Array.isArray(session.jobs)
    ? session.jobs.find((candidate: any) => candidate?.jobKey === jobKey) || null
    : null;
  const evidence = captureRecommendationCalibrationEvidence(entry ? {
    ...entry,
    latestRank: entry.rank,
    impressionId,
    resumeId: session.resumeId,
    resumeFingerprint: session.resumeFingerprint,
    lastSeenAt: entry.observedAt || session.createdAt,
  } : null, TALENT_FIT_SCORE_VERSION);
  if (!entry) return evidence;
  const expired = storedTimestampMillis(session.expiresAt) <= Date.now();
  const resumeFingerprint = input.resumeId ? fingerprintRecommendationResume(input.resume) : null;
  const exclusionReason = session.scoreVersion !== TALENT_FIT_SCORE_VERSION
    ? 'score_version_mismatch'
    : session.sortBy !== 'relevance'
      ? 'non_relevance_sort'
      : expired
        ? 'impression_expired'
        : !input.resumeId || input.resumeId !== session.resumeId || resumeFingerprint !== session.resumeFingerprint
          ? 'resume_mismatch'
          : evidence.exclusionReason;
  return { ...evidence, cohortEligible: exclusionReason === null, exclusionReason };
}

function sourceRank(sourceType: TalentSourceType) {
  switch (sourceType) {
    case 'direct_ats': return 5;
    case 'company_page': return 4;
    case 'remote_board': return 3;
    case 'api_board': return 2;
    default: return 1;
  }
}

function sourceConfidenceRank(confidence: SourceConfidence) {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function isUsableHttpsUrl(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function verifiedSourceTrust(job: TalentJob) {
  const canonicalUrl = job.sourceMeta.canonicalUrl || job.url;
  const directApplyUrl = job.sourceMeta.directApplyUrl || job.url;
  const canonical = resolveTalentSourceTrust(job.sourceMeta.sourceName, canonicalUrl);
  const apply = resolveTalentSourceTrust(job.sourceMeta.sourceName, directApplyUrl);
  const approved = canonical.approved
    && apply.approved
    && canonical.sourceType === job.sourceMeta.sourceType
    && canonical.sourceConfidence === job.sourceMeta.sourceConfidence;
  return approved
    ? canonical
    : { approved: false, profileId: canonical.profileId, sourceType: 'aggregator' as TalentSourceType, sourceConfidence: 'low' as SourceConfidence };
}

function jobSourceQualityRank(job: TalentJob) {
  const trust = verifiedSourceTrust(job);
  const source = sourceRank(trust.sourceType) * 100;
  const confidence = sourceConfidenceRank(trust.sourceConfidence) * 20;
  const directUrl = isUsableHttpsUrl(job.sourceMeta.directApplyUrl || job.url) ? 10 : 0;
  const canonicalUrl = isUsableHttpsUrl(job.sourceMeta.canonicalUrl) ? 6 : 0;
  const dated = Number.isFinite(new Date(job.postedDate || '').getTime()) ? 2 : 0;
  return source + confidence + directUrl + canonicalUrl + dated;
}

function roleTokens(value = '') {
  return clean(value)
    .split(/\s+/)
    .filter(token => token.length > 2 && !ROLE_TOKEN_STOPWORDS.has(token));
}

function ledgerEntryForJob(job: TalentJob, ledger?: Map<string, LedgerEntry>) {
  if (!ledger) return null;
  return ledger.get(normalizeJobIdentity(job)) || ledger.get(job.identityKey || '') || ledger.get(job.dedupeKey) || null;
}

function statusPreferenceWeight(status: RecommendationLedgerStatus) {
  switch (status) {
    case 'offer': return 4;
    case 'interview': return 3;
    case 'applied': return 2.25;
    case 'prepared': return 0;
    case 'queued': return 0;
    case 'saved': return 1;
    case 'dismissed': return -1.5;
    case 'rejected': return -0.4;
    default: return 0;
  }
}

export function buildPreferenceLearningScore(job: TalentJob, ledger?: Map<string, LedgerEntry>) {
  if (!ledger || ledger.size === 0) return { score: 70, evidenceCount: 0 };
  const targetTokens = new Set(roleTokens(job.title));
  const targetLocation = clean(job.location);
  const targetCompany = clean(job.company);
  const seenEntries = new Set<string>();
  let signal = 0;
  let evidenceCount = 0;

  for (const entry of ledger.values()) {
    if (seenEntries.has(entry.jobKey)) continue;
    seenEntries.add(entry.jobKey);
    const entryTokens = roleTokens(entry.title || '');
    const overlap = entryTokens.filter(token => targetTokens.has(token)).length / Math.max(1, Math.min(targetTokens.size, entryTokens.length));
    const tags = new Set(entry.feedbackTags || []);
    const sameCompany = Boolean(targetCompany && clean(entry.company || '') === targetCompany);
    const sameLocation = Boolean(targetLocation && clean(entry.location || '') === targetLocation);
    let weight = statusPreferenceWeight(entry.status);

    if (tags.has('more_like_this')) weight += 2.5;
    if (tags.has('wrong_role') || tags.has('not_interested')) weight -= 2.5;
    if (tags.has('wrong_seniority')) weight -= 1.25;
    if (tags.has('bad_source') && entry.sourceMeta?.sourceType === job.sourceMeta.sourceType) weight -= 1.25;
    if (tags.has('wrong_location') && sameLocation) weight -= 1.5;
    if (tags.has('salary_too_low') && sameCompany) weight -= 0.75;

    if (overlap > 0) {
      signal += weight * Math.max(0.35, overlap);
      evidenceCount += 1;
    }
    if (sameCompany && POSITIVE_RECOMMENDATION_STATUSES.has(entry.status)) signal += 0.4;
  }

  const cappedSignal = Math.max(-20, Math.min(20, signal * 3));
  return { score: clampScore(70 + cappedSignal), evidenceCount };
}

function inferRemoteMode(location = '', description = ''): TalentJob['remoteMode'] {
  const haystack = `${location} ${description}`.toLowerCase();
  if (haystack.includes('hybrid')) return 'hybrid';
  const explicitlyNotRemote = /\b(?:not|no|non[- ]?|isn['’]?t|is not)\s*remote\b/.test(haystack);
  if (!explicitlyNotRemote && /\bremote\b/.test(haystack)) return 'remote';
  if (location) return 'onsite';
  return 'unknown';
}

function normalizeSalary(input: any): RealJob['salary'] {
  const compensation = input?.compensation || {};
  return {
    min: typeof input?.min === 'number'
      ? input.min
      : typeof input?.salary_min === 'number'
        ? input.salary_min
        : typeof compensation.minAmount === 'number'
          ? compensation.minAmount
          : null,
    max: typeof input?.max === 'number'
      ? input.max
      : typeof input?.salary_max === 'number'
        ? input.salary_max
        : typeof compensation.maxAmount === 'number'
          ? compensation.maxAmount
          : null,
    currency: input?.currency || input?.salary_currency || compensation.currency || 'USD',
    isPredicted: Boolean(input?.isPredicted || input?.is_predicted),
  };
}

function normalizePostedDate(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return '';
}

function normalizeLocation(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const location = value as Record<string, unknown>;
    return [location.city, location.state, location.country].filter(Boolean).map(String).join(', ') || 'Not listed';
  }
  return 'Not listed';
}

function toTalentJob(raw: Partial<RealJob> & Record<string, any>, sourceName: string): TalentJob {
  const title = raw.title || raw.jobTitle || raw.position || 'Untitled role';
  const company = raw.company || raw.companyName || raw.organization || 'Unknown company';
  const location = normalizeLocation(raw.location || raw.locationName || raw.candidate_required_location);
  const description = raw.description || raw.descriptionText || raw.body || '';
  const url = raw.url || raw.applyUrl || raw.jobUrl || raw.redirect_url || '#';
  const postedDate = normalizePostedDate(raw.postedDate || raw.datePosted || raw.createdAt || raw.updatedAt || raw.publication_date);
  const canonicalUrl = raw.sourceMeta?.canonicalUrl || url;
  const directApplyUrl = raw.sourceMeta?.directApplyUrl || url;
  const sourceTrust = resolveTalentSourceTrust(sourceName, canonicalUrl);
  const sourceJobId = String(raw.requisitionId || raw.externalId || raw.id || raw.jobId || '').trim() || undefined;
  const skills = Array.isArray(raw.skills) && raw.skills.length > 0
    ? raw.skills.map(String).slice(0, 24)
    : extractSkillsFromDescription(description);
  const observedAt = new Date().toISOString();
  const sourceMeta: TalentSourceMeta = {
    sourceType: sourceTrust.sourceType,
    sourceName,
    sourceConfidence: sourceTrust.sourceConfidence,
    directApplyUrl,
    canonicalUrl,
    firstSeenAt: raw.sourceMeta?.firstSeenAt || observedAt,
    lastSeenAt: observedAt,
  };
  return {
    id: String(raw.id || raw.jobId || ledgerDocId(normalizeJobKey({ title, company, location, url }))),
    title,
    company,
    location,
    salary: normalizeSalary(raw.salary || raw),
    description,
    skills,
    url,
    postedDate,
    employmentType: Array.isArray(raw.jobType) ? raw.jobType.join(', ') : raw.employmentType || raw.jobType || raw.contractType || 'Full-time',
    category: raw.category || raw.department || raw.industry,
    source: sourceName,
    remoteMode: inferRemoteMode(location, description),
    sourceMeta,
    dedupeKey: normalizeJobKey({ title, company, location, url }),
    sourceJobId,
    identityKey: normalizeJobIdentity({
      title,
      company,
      location,
      category: raw.category || raw.department || raw.industry,
      sourceJobId,
      sourceMeta,
    }),
  };
}

function portalJobToTalent(job: PortalJob): TalentJob {
  return toTalentJob({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description || '',
    url: job.url,
    postedDate: job.postedDate,
    employmentType: 'Full-time',
    category: job.department,
  }, job.source);
}

function rawEverJobsSource(row: Record<string, any>) {
  return String(row.source || row.site || row.provider || 'ever_jobs');
}

function rawEverJobsUrl(row: Record<string, any>) {
  return String(row.url || row.applyUrl || row.jobUrl || row.job_url || '');
}

export function selectEverJobsRowsForNormalization(
  rows: Array<Record<string, any>>,
  safeSources: string[],
  requestedLimit: number,
) {
  const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit || 20)));
  const configuredOrder = Array.from(new Set(safeSources
    .map(source => sourceProfileId(source))
    .filter((source): source is string => Boolean(source))));
  const configuredIndex = new Map(configuredOrder.map((source, index) => [source, index]));
  const sourceTypePriority: Record<TalentSourceType, number> = {
    direct_ats: 0,
    company_page: 1,
    api_board: 2,
    remote_board: 3,
    aggregator: 4,
  };
  const sourceOrder = [...configuredOrder].sort((left, right) => {
    const quality = sourceTypePriority[SOURCE_TRUST_PROFILES[left].sourceType]
      - sourceTypePriority[SOURCE_TRUST_PROFILES[right].sourceType];
    return quality || configuredIndex.get(left)! - configuredIndex.get(right)!;
  });
  const buckets = new Map(sourceOrder.map(source => [source, [] as Array<Record<string, any>>]));
  const seen = new Set<string>();

  for (const row of rows) {
    const source = rawEverJobsSource(row);
    const url = rawEverJobsUrl(row);
    const trust = resolveTalentSourceTrust(source, url, safeSources);
    if (!trust.approved || !trust.profileId || !buckets.has(trust.profileId)) continue;
    const sourceJobId = String(row.requisitionId || row.externalId || row.id || row.jobId || '').trim();
    const identity = `${trust.profileId}|${sourceJobId || url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    buckets.get(trust.profileId)!.push(row);
  }

  const selected: Array<Record<string, any>> = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const source of sourceOrder) {
      const row = buckets.get(source)?.[index];
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
    index += 1;
  }
  return selected;
}

export function dedupeTalentJobs(jobs: TalentJob[]) {
  const byFamily = new Map<string, TalentJob[]>();
  for (const job of jobs) {
    const familyKey = normalizeJobFamilyIdentity(job) || job.identityKey || job.dedupeKey;
    const family = byFamily.get(familyKey) || [];
    const category = clean(job.category || '');
    const sourceId = sourceProfileId(job.sourceMeta.sourceName)
      || normalizeSourceIdentifier(job.sourceMeta.sourceName);
    const duplicateIndex = family.findIndex(current => {
      const currentCategory = clean(current.category || '');
      if (category && currentCategory && category !== currentCategory) return false;
      const currentSourceId = sourceProfileId(current.sourceMeta.sourceName)
        || normalizeSourceIdentifier(current.sourceMeta.sourceName);
      const sameProvider = sourceId
        && sourceId === currentSourceId
        && job.sourceMeta.sourceType === current.sourceMeta.sourceType;
      if (sameProvider && job.sourceJobId && current.sourceJobId && job.sourceJobId !== current.sourceJobId) return false;
      return true;
    });
    if (duplicateIndex < 0) {
      family.push(job);
    } else if (jobSourceQualityRank(job) > jobSourceQualityRank(family[duplicateIndex])) {
      family[duplicateIndex] = job;
    }
    byFamily.set(familyKey, family);
  }
  return [...byFamily.values()].flat();
}

async function searchEverJobs(params: JobSearchParams): Promise<TalentJob[]> {
  const serviceUrl = getJobSupplyServiceUrl();
  if (!everJobsEnabled() || !serviceUrl) return [];
  const baseUrl = serviceUrl.replace(/\/+$/, '');
  const sources = parseSafeSources();
  const body = {
    searchTerm: params.query,
    query: params.query,
    location: params.location || undefined,
    country: params.country?.toLowerCase() === 'us' ? 'USA' : params.country || 'USA',
    siteType: sources,
    sources,
    sites: sources,
    isRemote: params.remote || params.location?.toLowerCase() === 'remote' || undefined,
    remote: params.remote || params.location?.toLowerCase() === 'remote' || undefined,
    remote_only: params.remote || params.location?.toLowerCase() === 'remote' || undefined,
    resultsWanted: Math.min(50, Math.max(1, params.resultsPerPage || 20)),
    limit: Math.min(50, Math.max(1, params.resultsPerPage || 20)),
    page: params.page || 1,
    sortBy: params.sortBy || 'relevance',
    descriptionFormat: 'markdown',
  };

  const response = await fetch(`${baseUrl}/api/jobs/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(process.env.EVER_JOBS_API_KEY ? { 'x-api-key': process.env.EVER_JOBS_API_KEY } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new Error(`Ever Jobs search failed: ${response.status}`);
  const data = await response.json();
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray(data.jobs)
      ? data.jobs
      : data && typeof data === 'object' && Array.isArray(data.results)
        ? data.results
        : data && typeof data === 'object' && Array.isArray(data.data)
          ? data.data
          : data && typeof data === 'object' && data.data && typeof data.data === 'object' && Array.isArray(data.data.jobs)
            ? data.data.jobs
            : data && typeof data === 'object' && data.data && typeof data.data === 'object' && Array.isArray(data.data.results)
              ? data.data.results
              : null;
  if (!rows) throw new Error('Ever Jobs search returned an unsupported response');
  const requestedLimit = Math.min(50, Math.max(1, params.resultsPerPage || 20));
  const selectedRows = selectEverJobsRowsForNormalization(rows, sources, requestedLimit);
  const approvedJobs = selectedRows.map((job: any) => toTalentJob(job, rawEverJobsSource(job)));
  if (rows.length > 0 && approvedJobs.length === 0) {
    throw new Error('Ever Jobs search returned no approved job sources');
  }
  return approvedJobs;
}

// This used to bail out unless the query literally contained a registered company
// name, which meant a search for "data analyst" reached no company board at all and
// fell through to a 32-listing remote feed. Measured 2026-08-04: 2,869 postings were
// sitting behind that one string match.
//
// Naming a company is now a narrowing hint rather than a precondition. If the query
// names one we search that board and strip the name from the role terms; otherwise
// we search every board and filter by role.
async function searchCompanyPortalMatches(params: JobSearchParams) {
  const queryLower = params.query.toLowerCase();
  const detectedCompany = Object.keys(KNOWN_BOARDS).find(company => queryLower.includes(company));

  if (detectedCompany) {
    const roleQuery = queryLower.replace(detectedCompany, '').trim() || undefined;
    const result = await searchCompanyJobs(detectedCompany, roleQuery);
    return { jobs: result.jobs.map(portalJobToTalent), company: detectedCompany };
  }

  const result = await searchAllKnownBoards(params.query);
  return { jobs: result.jobs.map(portalJobToTalent), company: null as string | null };
}

export async function searchTalentJobSupply(params: JobSearchParams): Promise<TalentJobSearchResult> {
  const providerStatus: TalentJobSearchResult['providerStatus'] = {
    everJobs: everJobsEnabled() ? 'empty' : 'disabled',
    fallbackUsed: false,
    fallbackStatus: 'not_used',
    sources: [],
  };

  const [everJobsResult, portalResult] = await Promise.allSettled([
    searchEverJobs(params),
    searchCompanyPortalMatches(params),
  ]);

  let jobs: TalentJob[] = [];
  if (everJobsResult.status === 'fulfilled' && everJobsResult.value.length > 0) {
    providerStatus.everJobs = 'success';
    jobs.push(...everJobsResult.value);
  } else if (everJobsResult.status === 'rejected') {
    providerStatus.everJobs = 'error';
  }

  if (portalResult.status === 'fulfilled') {
    jobs.push(...portalResult.value.jobs);
  }

  if (jobs.length === 0 || providerStatus.everJobs !== 'success') {
    const legacy = await searchLegacyJobs(params);
    providerStatus.fallbackUsed = true;
    providerStatus.fallbackStatus = legacy.source.toLowerCase().includes('(error)') || /disabled|no key/i.test(legacy.source)
      ? 'error'
      : legacy.jobs.length > 0
        ? 'success'
        : 'empty';
    jobs.push(...legacy.jobs.map(job => toTalentJob(job, job.source || legacy.source)));
  }

  const deduped = dedupeTalentJobs(jobs);
  providerStatus.sources = [...new Set(deduped.map(job => job.source))].sort();

  return {
    jobs: deduped,
    totalCount: deduped.length,
    source: providerStatus.everJobs === 'success' ? 'Ever Jobs + Talent fallback' : 'Talent fallback',
    providerStatus,
  };
}

function titleAlignment(title: string, targetRoles: string[] = []) {
  if (targetRoles.length === 0) return 68;
  const lower = title.toLowerCase();
  const best = Math.max(...targetRoles.map(role => {
    const roleWords = role.toLowerCase().split(/\s+/).filter(Boolean);
    let score = lower.includes(role.toLowerCase()) ? 96 : 45 + (roleWords.filter(word => lower.includes(word)).length / Math.max(1, roleWords.length)) * 45;
    const targetSeniority = seniorityLevel(role);
    const jobSeniority = seniorityLevel(title);
    if (targetSeniority !== null) {
      if (jobSeniority === null) score -= 10;
      else score -= Math.min(30, Math.abs(targetSeniority - jobSeniority) * 15);
    }
    return score;
  }));
  return clampScore(best);
}

function seniorityLevel(value = ''): number | null {
  const normalized = clean(value);
  if (/\b(?:intern|internship|entry level|entry|junior|jr)\b/.test(normalized)) return 1;
  if (/\b(?:mid level|midlevel|intermediate)\b/.test(normalized)) return 2;
  if (/\b(?:senior|sr)\b/.test(normalized)) return 3;
  if (/\b(?:lead|staff|principal|manager)\b/.test(normalized)) return 4;
  if (/\b(?:director|head|vice president|vp|chief)\b/.test(normalized)) return 5;
  return null;
}

function preferenceLocationScore(job: TalentJob, ctx: RecommendationContext) {
  const workMode = !ctx.remotePref || ctx.remotePref === 'any'
    ? 72
    : ctx.remotePref === 'remote'
      ? job.remoteMode === 'remote' ? 95 : 42
      : ctx.remotePref === 'hybrid'
        ? job.remoteMode === 'hybrid' || job.remoteMode === 'remote' ? 88 : 55
        : ctx.remotePref === 'onsite'
          ? job.remoteMode === 'onsite' ? 88 : 48
          : 72;
  const preferred = (ctx.preferredCities || []).map(normalizeGeography).filter(Boolean);
  if (preferred.length === 0) return workMode;
  if (job.remoteMode === 'remote' && ctx.remotePref === 'remote') return clampScore((workMode * 0.65) + (92 * 0.35));
  const jobLocation = normalizeGeography(job.location);
  const jobTokens = new Set(jobLocation.split(/\s+/).filter(Boolean));
  const geographyMatches = preferred.some(location => {
    const preferenceTokens = location.split(/\s+/).filter(Boolean);
    if (preferenceTokens.length === 1) return jobTokens.has(preferenceTokens[0]);
    return jobLocation.includes(location) || location.includes(jobLocation);
  });
  const geography = geographyMatches ? 94 : 48;
  return clampScore((workMode * 0.55) + (geography * 0.45));
}

function salaryFit(job: TalentJob, salaryMin = 0) {
  if (!job.salary?.min && !job.salary?.max) return salaryMin > 0 ? 48 : 60;
  const top = job.salary.max || job.salary.min || 0;
  if (!salaryMin) return 82;
  if (top >= salaryMin) return 90;
  return clampScore(55 - ((salaryMin - top) / Math.max(salaryMin, 1)) * 35);
}

function sourceFit(job: TalentJob) {
  const trust = verifiedSourceTrust(job);
  const confidenceBase = trust.sourceConfidence === 'high'
    ? 92
    : trust.sourceConfidence === 'medium'
      ? 76
      : 48;
  const typeAdjustment = trust.sourceType === 'direct_ats'
    ? 5
    : trust.sourceType === 'company_page'
      ? 3
      : trust.sourceType === 'aggregator'
        ? -6
        : 0;
  return clampScore(confidenceBase + typeAdjustment);
}

function freshnessFit(job: TalentJob) {
  if (job.ghostRisk?.fresh) return 95;
  const postedAt = new Date(job.postedDate || '').getTime();
  if (!Number.isFinite(postedAt)) return 58;
  const ageDays = Math.max(0, (Date.now() - postedAt) / (24 * 60 * 60 * 1000));
  if (ageDays <= 3) return 96;
  if (ageDays <= 7) return 90;
  if (ageDays <= 14) return 82;
  if (ageDays <= 30) return 68;
  return 50;
}

function riskFit(job: TalentJob) {
  if (!job.ghostRisk) return 70;
  if (job.ghostRisk.risk === 'high') return 35;
  if (job.ghostRisk.risk === 'medium') return 68;
  return 94;
}

function evidenceCoverage(job: TalentJob, ctx: RecommendationContext, hasSkillEvidence: boolean, preferenceEvidenceCount: number) {
  let coverage = 0;
  if (hasSkillEvidence) coverage += 30;
  if ((ctx.targetRoles?.length || 0) > 0) coverage += 15;
  if (!ctx.remotePref || ctx.remotePref === 'any' || job.remoteMode !== 'unknown') coverage += 10;
  if (!ctx.salaryMin || Boolean(job.salary?.min || job.salary?.max)) coverage += 10;
  if (Number.isFinite(new Date(job.postedDate || '').getTime())) coverage += 10;
  if (verifiedSourceTrust(job).sourceConfidence !== 'low') coverage += 15;
  if (preferenceEvidenceCount > 0) coverage += 10;
  return clampScore(coverage);
}

function formatSalaryTarget(value = 0) {
  if (!value) return '';
  return `$${Math.round(value / 1000)}k`;
}

function sourceTypeLabel(sourceType: TalentSourceType) {
  switch (sourceType) {
    case 'direct_ats': return 'Direct ATS';
    case 'company_page': return 'Company page';
    case 'remote_board': return 'Remote board';
    case 'api_board': return 'API source';
    default: return 'Aggregator';
  }
}

function buildFitReasons(job: TalentJob, fit: TalentFitBreakdown, ctx: RecommendationContext = {}) {
  const reasons: string[] = [];
  if (fit.skills >= 80) reasons.push(`Strong resume-skill overlap at ${fit.skills}%.`);
  else if (fit.skills >= 65) reasons.push(`Moderate skill overlap at ${fit.skills}%; review gaps before applying.`);
  else reasons.push(`Skill overlap is limited at ${fit.skills}%; use this as a stretch role.`);

  if (fit.titleSeniority >= 82) reasons.push(`Title aligns with ${ctx.targetRoles?.[0] || 'your target role'}.`);
  else if (ctx.targetRoles?.length) reasons.push(`Title is adjacent to ${ctx.targetRoles[0]}, not an exact match.`);

  if (fit.location >= 84) reasons.push(`Work mode and location match your preference.`);
  else if (ctx.remotePref && ctx.remotePref !== 'any') reasons.push(`Work mode needs review against your ${ctx.remotePref} preference.`);

  if (ctx.salaryMin) {
    if (fit.salary >= 80) reasons.push(`Compensation appears aligned with your ${formatSalaryTarget(ctx.salaryMin)} target.`);
    else reasons.push(`Compensation is unclear or below your ${formatSalaryTarget(ctx.salaryMin)} target.`);
  }

  const learnedPreference = buildPreferenceLearningScore(job, ctx.ledger);
  if (learnedPreference.evidenceCount > 0 && fit.preference >= 80) {
    reasons.push('Similar roles have matched your recent saves and application activity.');
  } else if (learnedPreference.evidenceCount > 0 && fit.preference <= 55) {
    reasons.push('Similar roles have been skipped before; review whether this one is meaningfully different.');
  }

  return Array.from(new Set(reasons)).slice(0, 5);
}

function buildRiskNotes(job: TalentJob, fit: TalentFitBreakdown, ctx: RecommendationContext = {}) {
  const notes: string[] = [];
  if (verifiedSourceTrust(job).sourceConfidence === 'low') {
    notes.push('Low-confidence source; verify the original posting before investing time.');
  }
  if (job.ghostRisk?.risk === 'high') {
    notes.push(`High posting-risk signal: ${job.ghostRisk.reasons[0] || 'verify the source page before spending time.'}`);
  } else if (job.ghostRisk?.risk === 'medium') {
    notes.push(`Medium posting-risk signal: ${job.ghostRisk.reasons[0] || 'review freshness and source quality.'}`);
  }
  if (!job.url || job.url === '#') notes.push('No direct application URL was available.');
  if (ctx.salaryMin && !job.salary?.min && !job.salary?.max) notes.push(`Salary was not listed; verify against your ${formatSalaryTarget(ctx.salaryMin)} target.`);
  if (ctx.remotePref && ctx.remotePref !== 'any' && job.remoteMode === 'unknown') notes.push(`Remote mode was not explicit; verify ${ctx.remotePref} before preparing materials.`);
  if (fit.skills < 65) notes.push('Resume evidence may be thin for the listed skills.');
  return Array.from(new Set(notes)).slice(0, 5);
}

function buildSourceNotes(job: TalentJob) {
  const sourceTrust = verifiedSourceTrust(job);
  const notes = [
    `${sourceTypeLabel(sourceTrust.sourceType)} source with ${sourceTrust.sourceConfidence} confidence.`,
  ];
  if (job.sourceMeta.firstSeenAt) notes.push(`First seen ${new Date(job.sourceMeta.firstSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`);
  if (sourceTrust.sourceType === 'direct_ats' || sourceTrust.sourceType === 'company_page') {
    notes.push('Prioritize source verification and direct application path.');
  } else {
    notes.push('Open the original posting to confirm it is still active.');
  }
  return notes;
}

export function buildTalentFitBreakdown(job: TalentJob, ctx: RecommendationContext = {}): TalentFitBreakdown {
  const hasKeywordScore = typeof job.keywordScore === 'number' && Number.isFinite(job.keywordScore);
  const hasSkillEvidence = hasKeywordScore || Boolean(ctx.userSkills?.length && job.skills?.length);
  const skills = hasKeywordScore
    ? clampScore(job.keywordScore as number)
    : hasSkillEvidence
      ? calculateFitScore(ctx.userSkills || [], job.skills, job.title)
      : 55;
  const freshness = freshnessFit(job);
  const salary = salaryFit(job, ctx.salaryMin || 0);
  const title = titleAlignment(job.title, ctx.targetRoles);
  const location = preferenceLocationScore(job, ctx);
  const learnedPreference = buildPreferenceLearningScore(job, ctx.ledger);
  const preference = learnedPreference.score;
  const source = sourceFit(job);
  const sourceTrust = verifiedSourceTrust(job);
  const risk = riskFit(job);
  const coverage = evidenceCoverage(job, ctx, hasSkillEvidence, learnedPreference.evidenceCount);
  const confidence: TalentFitConfidence = hasSkillEvidence
    && coverage >= 75
    && sourceTrust.sourceConfidence === 'high'
    && job.ghostRisk?.risk === 'low'
    ? 'high'
    : hasSkillEvidence && coverage >= 55 && sourceTrust.sourceConfidence !== 'low' && Boolean(job.ghostRisk) && job.ghostRisk?.risk !== 'high'
      ? 'medium'
      : 'low';
  const weights = TALENT_FIT_SCORE_POLICY;
  const rawOverall = (skills * weights.skills)
    + (title * weights.titleSeniority)
    + (location * weights.location)
    + (salary * weights.salary)
    + (freshness * weights.freshness)
    + (source * weights.source)
    + (risk * weights.risk)
    + (preference * weights.preference);
  const confidenceFactor = confidence === 'high' ? 1 : confidence === 'medium' ? 0.86 : 0.68;
  let overall = clampScore(60 + ((rawOverall - 60) * confidenceFactor));
  if (confidence === 'low') overall = Math.min(overall, 76);
  if (!hasSkillEvidence) overall = Math.min(overall, 74);
  if (sourceTrust.sourceConfidence === 'low') overall = Math.min(overall, 68);
  if (job.ghostRisk?.risk === 'high') overall = Math.min(overall, 64);
  if (ctx.remotePref && ctx.remotePref !== 'any' && job.remoteMode === 'unknown') overall = Math.min(overall, 76);

  return {
    scoreVersion: TALENT_FIT_SCORE_VERSION,
    confidence,
    evidenceCoverage: coverage,
    overall,
    skills: clampScore(skills),
    titleSeniority: title,
    domain: clampScore((skills + title) / 2),
    location,
    salary,
    freshness,
    resumeCoverage: clampScore(skills),
    risk,
    preference,
    source,
  };
}

function reasonFor(job: TalentJob, fit: TalentFitBreakdown, ctx: RecommendationContext = {}) {
  const reasons: string[] = [];
  const sourceTrust = verifiedSourceTrust(job);
  if (sourceTrust.sourceType === 'direct_ats' || sourceTrust.sourceType === 'company_page') reasons.push('direct-source listing');
  if (fit.skills >= 75) reasons.push('strong resume-skill overlap');
  if (fit.titleSeniority >= 80) reasons.push('target-role alignment');
  if (fit.salary >= 80) reasons.push('salary appears aligned');
  if (fit.freshness >= 85) reasons.push('fresh posting');
  if (job.ghostRisk?.risk === 'high') reasons.push('verify posting quality before investing time');
  if (reasons.length === 0) return `Review this role against ${ctx.targetRoles?.[0] || 'your target'} before investing application time.`;
  const summary = `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? ` with ${reasons.slice(1, 3).join(' and ')}` : ''}.`;
  if (fit.confidence === 'low') return `${summary} Fit confidence is low; verify the missing evidence before preparing materials.`;
  return fit.overall >= 80
    ? `${summary} Taco should prepare a review packet, then wait for approval.`
    : `${summary} Review gaps before preparing a packet.`;
}

function nextActionFor(job: TalentJob, fit: TalentFitBreakdown, riskNotes: string[]) {
  const sourceTrust = verifiedSourceTrust(job);
  if (fit.confidence === 'low') return sourceTrust.sourceConfidence === 'low' ? 'Verify source first' : 'Verify fit evidence';
  if (sourceTrust.sourceConfidence === 'low') return 'Verify source first';
  if (riskNotes.length > 0 && fit.overall < 78) return 'Verify source and gaps';
  if (fit.overall >= TALENT_FIT_THRESHOLDS.prepare) return 'Prepare review packet';
  if (fit.overall >= TALENT_FIT_THRESHOLDS.review) return 'Review gaps';
  if (sourceTrust.sourceType === 'direct_ats' || sourceTrust.sourceType === 'company_page') return 'Save for review';
  return 'Skip or monitor';
}

function preparationEligibleFor(job: TalentJob, fit: TalentFitBreakdown | null | undefined) {
  if (!fit || fit.scoreVersion !== TALENT_FIT_SCORE_VERSION) return false;
  if (fit.overall < TALENT_FIT_THRESHOLDS.prepare || fit.confidence === 'low') return false;
  if (job.sourceMeta.sourceConfidence === 'low' || !job.ghostRisk || job.ghostRisk.risk === 'high') return false;
  const sourceTrust = verifiedSourceTrust(job);
  return sourceTrust.approved;
}

export function isPreparationEligibleRecommendation(job: TalentJob) {
  return preparationEligibleFor(job, job.fitScore || job.fitBreakdown);
}

export function finalizeTalentRecommendations(jobs: TalentJob[], ctx: RecommendationContext = {}) {
  return jobs.map(job => {
    const ledger = ledgerEntryForJob(job, ctx.ledger);
    const fit = buildTalentFitBreakdown(job, ctx);
    const fitReasons = buildFitReasons(job, fit, ctx);
    const riskNotes = buildRiskNotes(job, fit, ctx);
    const sourceNotes = buildSourceNotes(job);
    const nextAction = nextActionFor(job, fit, riskNotes);
    const trustedApplyUrl = getTrustedTalentJobApplyUrl(job);
    return {
      ...job,
      url: trustedApplyUrl || '',
      outboundLinkVerified: Boolean(trustedApplyUrl),
      identityKey: normalizeJobIdentity(job),
      matchScore: fit.overall,
      matchMethod: 'hybrid' as const,
      fitScore: fit,
      fitBreakdown: fit,
      recommendationReason: reasonFor(job, fit, ctx),
      fitReasons,
      riskNotes,
      sourceNotes,
      nextAction,
      preparationEligible: preparationEligibleFor(job, fit),
      packetStatus: job.packetStatus || 'idle',
      ledgerStatus: ledger?.status || null,
      ledgerFeedbackTags: ledger?.feedbackTags || [],
    };
  }).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

export function suppressLedgerMatches<T extends {
  dedupeKey: string;
  title?: string;
  company?: string;
  location?: string;
  category?: string;
  sourceJobId?: string;
  sourceMeta?: Pick<TalentSourceMeta, 'sourceType'>;
}>(jobs: T[], ledger?: Map<string, LedgerEntry>) {
  if (!ledger) return jobs;
  return jobs.filter(job => {
    const identityKey = normalizeJobIdentity(job);
    const entry = ledger.get(identityKey) || ledger.get(job.dedupeKey);
    return !entry || !TERMINAL_SUPPRESS_STATUSES.has(entry.status);
  });
}

export async function loadRecommendationLedgerWithStatus(
  db: FirebaseFirestore.Firestore,
  uid: string,
  limit = 300,
): Promise<RecommendationLedgerLoadResult> {
  const ledger = new Map<string, LedgerEntry>();
  if (!uid || uid.startsWith('anon:')) return { ledger, complete: true, truncated: false, checkedCount: 0 };
  const collection = db.collection('users').doc(uid).collection('job_recommendations');
  const [recentSnap, signalSnap] = await Promise.all([
    collection.orderBy('updatedAt', 'desc').limit(limit).get().catch(() => null),
    collection.where('status', 'in', ['saved', 'dismissed', 'queued', 'prepared', 'applied', 'interview', 'offer', 'rejected', 'ghosted'])
      .limit(500)
      .get()
      .catch(() => null),
  ]);
  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const doc of [...(recentSnap?.docs || []), ...(signalSnap?.docs || [])]) docs.set(doc.id, doc);
  docs.forEach(doc => {
    const data = doc.data();
    if (data.jobKey && data.status) {
      ledger.set(data.jobKey, {
        jobKey: data.jobKey,
        status: data.status,
        feedbackTags: Array.isArray(data.feedbackTags) ? data.feedbackTags : [],
        score: data.score ?? null,
        scoreBreakdown: data.scoreBreakdown || null,
        updatedAt: data.updatedAt,
        lastSeenAt: data.lastSeenAt,
        title: data.title || '',
        company: data.company || '',
        location: data.location || '',
        url: data.url || '',
        recommendationReason: data.recommendationReason || '',
        nextAction: data.nextAction || '',
        sourceMeta: data.sourceMeta || null,
      });
      const identityKey = normalizeJobIdentity(data);
      if (identityKey && identityKey !== data.jobKey) ledger.set(identityKey, ledger.get(data.jobKey)!);
    }
  });
  const recentCount = recentSnap?.docs.length || 0;
  const signalCount = signalSnap?.docs.length || 0;
  const truncated = recentCount >= limit || signalCount >= 500;
  return {
    ledger,
    complete: Boolean(recentSnap && signalSnap) && !truncated,
    truncated,
    checkedCount: docs.size,
  };
}

export async function loadRecommendationLedger(db: FirebaseFirestore.Firestore, uid: string, limit = 300) {
  const result = await loadRecommendationLedgerWithStatus(db, uid, limit);
  return result.ledger;
}

export function resolveRecommendationDigestEvidence(
  ledger: Map<string, LedgerEntry>,
  request: {
    identityKey?: string;
    dedupeKey?: string;
    title?: string;
    company?: string;
    location?: string;
    category?: string;
    sourceJobId?: string;
    sourceMeta?: Pick<TalentSourceMeta, 'sourceType'>;
    url?: string;
  },
): RecommendationDigestEvidence | null {
  const keys = [
    request.identityKey,
    normalizeJobIdentity(request),
    request.dedupeKey,
    normalizeJobKey(request),
  ].filter((value): value is string => Boolean(value));
  const entry = keys.map(key => ledger.get(key)).find(Boolean);
  if (!entry) return null;
  const breakdown = entry.scoreBreakdown;
  if (!breakdown
    || breakdown.scoreVersion !== TALENT_FIT_SCORE_VERSION
    || !Number.isFinite(breakdown.overall)
    || breakdown.overall < 0
    || breakdown.overall > 100
    || entry.score !== breakdown.overall) {
    return null;
  }
  const sourceMeta = entry.sourceMeta;
  if (!sourceMeta) return null;
  const observedAt = Date.parse(entry.lastSeenAt || sourceMeta.lastSeenAt || entry.updatedAt || '');
  if (!Number.isFinite(observedAt)
    || observedAt > Date.now() + 5 * 60 * 1000
    || Date.now() - observedAt > RECOMMENDATION_DIGEST_EVIDENCE_MAX_AGE_MS) {
    return null;
  }
  const applyUrl = getTrustedTalentJobApplyUrl({ url: entry.url || '', sourceMeta });
  if (!applyUrl) return null;
  return {
    jobKey: entry.jobKey,
    title: entry.title || '',
    company: entry.company || '',
    location: entry.location || '',
    url: applyUrl,
    talentFitScore: breakdown.overall,
    scoreVersion: TALENT_FIT_SCORE_VERSION,
    fitConfidence: breakdown.confidence,
    sourceConfidence: sourceMeta.sourceConfidence,
    sourceName: sourceMeta.sourceName,
    reason: entry.recommendationReason || 'Review the fit evidence before preparing a packet.',
    nextAction: entry.nextAction || 'Review role',
  };
}

export async function upsertRecommendationLedgerInTransaction(
  db: FirebaseFirestore.Firestore,
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  job: Partial<TalentJob> & { title?: string; company?: string; location?: string; url?: string; dedupeKey?: string },
  status: RecommendationLedgerStatus,
  opts: {
    feedbackTags?: string[];
    reason?: string;
    score?: number | null;
    agentRunId?: string;
    preserveEvidence?: boolean;
  } = {},
) {
  if (!uid || uid.startsWith('anon:')) return;
  const jobKey = job.identityKey || normalizeJobIdentity(job) || job.dedupeKey || normalizeJobKey(job);
  if (!jobKey) return;
  const now = new Date().toISOString();
  const docRef = db.collection('users').doc(uid).collection('job_recommendations').doc(ledgerDocId(jobKey));
  const score = opts.score ?? job.matchScore ?? job.fitScore?.overall;
  const scoreBreakdown = job.fitBreakdown || job.fitScore;
  const evidenceData = opts.preserveEvidence ? {} : {
    ...(job.title ? { title: job.title } : {}),
    ...(job.company ? { company: job.company } : {}),
    ...(job.location ? { location: job.location } : {}),
    ...(job.category ? { category: job.category } : {}),
    ...(job.sourceJobId ? { sourceJobId: job.sourceJobId } : {}),
    ...(job.url ? { url: job.url } : {}),
    ...(job.sourceMeta ? { sourceMeta: job.sourceMeta } : {}),
    ...(score !== null && score !== undefined ? { score } : {}),
    ...(scoreBreakdown ? { scoreBreakdown } : {}),
    ...(opts.reason || job.recommendationReason ? { recommendationReason: opts.reason || job.recommendationReason } : {}),
    ...(job.nextAction ? { nextAction: job.nextAction } : {}),
    ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
  };
  const nextData = {
    userId: uid,
    jobKey,
    ...evidenceData,
  };

  const snapshot = await transaction.get(docRef);
  const existing = snapshot.exists ? snapshot.data() || {} : {};
  const existingTags = Array.isArray(existing.feedbackTags) ? existing.feedbackTags : [];
  const incomingTags = opts.feedbackTags || [];
  const replacesPreference = incomingTags.some(tag => PREFERENCE_FEEDBACK_TAGS.has(tag));
  const retainedTags = replacesPreference
    ? existingTags.filter((tag: string) => !PREFERENCE_FEEDBACK_TAGS.has(tag))
    : existingTags;
  const feedbackTags = Array.from(new Set([...retainedTags, ...incomingTags])).slice(0, 20);
  const preservedStatus = status === 'shown' && snapshot.exists
    ? existing.status || 'shown'
    : status;
  const history = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
  const latestHistory = history[history.length - 1];
  const statusHistory = latestHistory?.status === preservedStatus
    ? history
    : [...history, { status: preservedStatus, at: now, feedbackTags: opts.feedbackTags || [] }].slice(-25);

  transaction.set(docRef, {
    ...nextData,
    status: preservedStatus,
    feedbackTags,
    statusHistory,
    firstSeenAt: existing.firstSeenAt || now,
    updatedAt: status === 'shown' && snapshot.exists ? existing.updatedAt || now : now,
  }, { merge: true });
}

export async function upsertRecommendationLedger(
  db: FirebaseFirestore.Firestore,
  uid: string,
  job: Partial<TalentJob> & { title?: string; company?: string; location?: string; url?: string; dedupeKey?: string },
  status: RecommendationLedgerStatus,
  opts: {
    feedbackTags?: string[];
    reason?: string;
    score?: number | null;
    agentRunId?: string;
    preserveEvidence?: boolean;
  } = {},
) {
  await db.runTransaction(async transaction => {
    await upsertRecommendationLedgerInTransaction(db, transaction, uid, job, status, opts);
  });
}

export async function recordRecommendationImpressions(db: FirebaseFirestore.Firestore, uid: string, jobs: TalentJob[]) {
  if (!uid || uid.startsWith('anon:') || jobs.length === 0) return;
  await Promise.allSettled(jobs.slice(0, 30).map(async (job, index) => {
    const jobKey = job.identityKey || normalizeJobIdentity(job) || job.dedupeKey || normalizeJobKey(job);
    if (!jobKey) return;
    const now = new Date().toISOString();
    const latestRank = index + 1;
    const docRef = db.collection('users').doc(uid).collection('job_recommendations').doc(ledgerDocId(jobKey));
    try {
      await docRef.create({
        userId: uid,
        jobKey,
        status: 'shown',
        title: job.title || '',
        company: job.company || '',
        location: job.location || '',
        category: job.category || '',
        sourceJobId: job.sourceJobId || '',
        url: job.url || '',
        sourceMeta: job.sourceMeta || null,
        score: job.matchScore ?? job.fitScore?.overall ?? null,
        scoreBreakdown: job.fitBreakdown || job.fitScore || null,
        recommendationReason: job.recommendationReason || '',
        nextAction: job.nextAction || '',
        latestRank,
        feedbackTags: [],
        statusHistory: [{ status: 'shown', at: now, feedbackTags: [] }],
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      });
    } catch {
      // Existing recommendation: refresh observation fields without downgrading user state.
      await docRef.set({
        lastSeenAt: now,
        category: job.category || '',
        sourceJobId: job.sourceJobId || '',
        sourceMeta: job.sourceMeta || null,
        score: job.matchScore ?? job.fitScore?.overall ?? null,
        scoreBreakdown: job.fitBreakdown || job.fitScore || null,
        recommendationReason: job.recommendationReason || '',
        nextAction: job.nextAction || '',
        latestRank,
      }, { merge: true });
    }
  }));
}
