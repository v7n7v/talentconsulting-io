export type CareerTwinPriority = 'critical' | 'high' | 'medium' | 'low';

/** One health band as `computeHealthBands` in lib/career-graph.ts emits it. */
export interface HealthScoreBand {
  key: string;
  label: string;
  /** Points earned across measured items. */
  earned: number;
  /** Points available from measured items only. 0 = nothing here is known. */
  available: number;
  /** Points this band would be worth if everything in it were measured. */
  max: number;
  items: { key: string; label: string; score: number; max: number; measured: boolean }[];
}

export interface HealthScoreBasis {
  earned: number;
  available: number;
  max: number;
  measuredBands: number;
  totalBands: number;
  /** available / max, 0-1. How much of the score was ever on the table. */
  coverage: number;
  /** Enough basis to attach a word — "Strong", "Watch" — to the number? */
  ratingIsSupported: boolean;
}

/** A rating word needs measured items spanning at least this many bands. */
export const HEALTH_RATING_MIN_BANDS = 3;
/** ...and covering at least this share of the points that exist. */
export const HEALTH_RATING_MIN_COVERAGE = 0.6;

/**
 * What the health score is actually standing on.
 *
 * `healthScore` is earned/available across MEASURED items, so it answers "of
 * what we could see, how are you doing" — not "how far through a job search
 * are you". Those read the same on screen and they are not the same claim: a
 * user measured on one band alone can score 100 without the product knowing
 * anything about their search.
 *
 * Every consumer that turns the number into a word has to agree on when that
 * is honest, so the test lives here and not in each page. It needs breadth
 * (most of the bands) and depth (most of the points).
 */
export function healthScoreBasis(bands: HealthScoreBand[] | null | undefined): HealthScoreBasis {
  const list = Array.isArray(bands) ? bands : [];
  const earned = list.reduce((total, b) => total + (Number(b?.earned) || 0), 0);
  const available = list.reduce((total, b) => total + (Number(b?.available) || 0), 0);
  const max = list.reduce((total, b) => total + (Number(b?.max) || 0), 0);
  const measuredBands = list.filter(b => (Number(b?.available) || 0) > 0).length;
  const coverage = max > 0 ? available / max : 0;
  return {
    earned,
    available,
    max,
    measuredBands,
    totalBands: list.length,
    coverage,
    ratingIsSupported: list.length > 0
      && measuredBands >= HEALTH_RATING_MIN_BANDS
      && coverage >= HEALTH_RATING_MIN_COVERAGE,
  };
}

/** 0-100 from a set of bands, or 0 when nothing is measured. */
export function healthScoreFromBands(bands: HealthScoreBand[] | null | undefined): number {
  const { earned, available } = healthScoreBasis(bands);
  if (available <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((earned / available) * 100)));
}

/**
 * A percentage, or an em dash when the value is unknown.
 *
 * `${value || 0}%` is the bug this exists to stop: it turns "we have no
 * denominator" into "we measured, and the answer is zero".
 */
export function percentOrDash(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—';
}

export interface CareerTwinAction {
  id: string;
  label: string;
  reason: string;
  path: string;
  priority: CareerTwinPriority;
}

export interface CareerTwinMemory {
  identity: {
    name: string;
    currentTitle: string;
    seniority: string;
    careerFields: string[];
    locationPreference: string;
  };
  goals: {
    targetRoles: string[];
    industries: string[];
    jobSearchStatus: string;
    salaryMin: number | null;
    remotePreference: string;
  };
  constraints: {
    preferredCities: string[];
    excludedCompanies: string[];
    autonomyLevel: string;
    requiresReviewBeforeExternalAction: boolean;
  };
  confirmedFacts: {
    skills: string[];
    education: string[];
    resumeVersionCount: number;
    hasResume: boolean;
    topCompanies: string[];
  };
  writingVoice: {
    tone: string;
    bannedClaims: string[];
    evidenceStyle: string;
  };
  activeSearch: {
    totalApplications: number;
    /** Of `totalApplications`, the ones actually marked as sent. */
    sentApplications: number;
    /**
     * Null until there is a sent application to divide by.
     *
     * `numberValue(..., 0)` used to run over this, which destroyed the
     * server's null before any UI could honour it: the Career Twin Memory
     * panel printed a measured 0 for a rate the funnel one card away calls
     * "Not measurable".
     */
    responseRate: number | null;
    velocity: number;
    queuedApplications: number;
    staleApplications: number;
    skillGaps: string[];
    /**
     * How many fit analyses `skillGaps` was derived from. 0 means "no role has
     * been analyzed", which is not the same fact as "no gaps".
     */
    fitAnalysisCount: number;
  };
  nextBestActions: CareerTwinAction[];
}

export interface CareerTwinSummary {
  completeness: { score: number; missing: string[] };
  behavioralBank: {
    totalStories: number;
    coveredCategories: string[];
    uncoveredCategories: string[];
    coverageScore: number;
  };
  background: {
    currentTitle: string;
    targetRoles: string[];
    industries: string[];
    education: string[];
  };
  memory: CareerTwinMemory;
  exportable: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function recordValue(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export function normalizeCareerTwinMemory(
  memoryValue: unknown,
  backgroundValue: Partial<CareerTwinSummary['background']> = {},
): CareerTwinMemory {
  const memory = recordValue(memoryValue);
  const background = recordValue(backgroundValue);
  const identity = recordValue(memory.identity);
  const goals = recordValue(memory.goals);
  const constraints = recordValue(memory.constraints);
  const confirmedFacts = recordValue(memory.confirmedFacts);
  const writingVoice = recordValue(memory.writingVoice);
  const activeSearch = recordValue(memory.activeSearch);

  const backgroundCurrentTitle = stringValue(background.currentTitle);
  const backgroundTargetRoles = stringArrayValue(background.targetRoles);
  const backgroundIndustries = stringArrayValue(background.industries);
  const backgroundEducation = stringArrayValue(background.education);

  const nextBestActions = Array.isArray(memory.nextBestActions)
    ? memory.nextBestActions
      .filter(isRecord)
      .map((action, index): CareerTwinAction => ({
        id: stringValue(action.id, `action-${index}`),
        label: stringValue(action.label, 'Review next career action'),
        reason: stringValue(action.reason, 'Taco needs more trusted context before recommending a precise action.'),
        path: stringValue(action.path, '/suite/intelligence'),
        priority: ['critical', 'high', 'medium', 'low'].includes(stringValue(action.priority))
          ? stringValue(action.priority) as CareerTwinPriority
          : 'medium',
      }))
    : [];

  return {
    identity: {
      name: stringValue(identity.name),
      currentTitle: stringValue(identity.currentTitle, backgroundCurrentTitle),
      seniority: stringValue(identity.seniority),
      careerFields: stringArrayValue(identity.careerFields),
      locationPreference: stringValue(identity.locationPreference),
    },
    goals: {
      targetRoles: stringArrayValue(goals.targetRoles).length ? stringArrayValue(goals.targetRoles) : backgroundTargetRoles,
      industries: stringArrayValue(goals.industries).length ? stringArrayValue(goals.industries) : backgroundIndustries,
      jobSearchStatus: stringValue(goals.jobSearchStatus),
      salaryMin: nullableNumberValue(goals.salaryMin),
      remotePreference: stringValue(goals.remotePreference, 'any'),
    },
    constraints: {
      preferredCities: stringArrayValue(constraints.preferredCities),
      excludedCompanies: stringArrayValue(constraints.excludedCompanies),
      autonomyLevel: stringValue(constraints.autonomyLevel, 'review_first'),
      requiresReviewBeforeExternalAction: typeof constraints.requiresReviewBeforeExternalAction === 'boolean'
        ? constraints.requiresReviewBeforeExternalAction
        : true,
    },
    confirmedFacts: {
      skills: stringArrayValue(confirmedFacts.skills),
      education: stringArrayValue(confirmedFacts.education).length ? stringArrayValue(confirmedFacts.education) : backgroundEducation,
      resumeVersionCount: numberValue(confirmedFacts.resumeVersionCount),
      hasResume: typeof confirmedFacts.hasResume === 'boolean' ? confirmedFacts.hasResume : false,
      topCompanies: stringArrayValue(confirmedFacts.topCompanies),
    },
    writingVoice: {
      tone: stringValue(writingVoice.tone, 'professional'),
      bannedClaims: stringArrayValue(writingVoice.bannedClaims),
      evidenceStyle: stringValue(writingVoice.evidenceStyle, 'proof_first'),
    },
    activeSearch: {
      totalApplications: numberValue(activeSearch.totalApplications),
      sentApplications: numberValue(activeSearch.sentApplications),
      // nullableNumberValue, not numberValue: a null response rate means there
      // is no denominator, and coercing it to 0 republishes it as a measurement.
      responseRate: nullableNumberValue(activeSearch.responseRate),
      velocity: numberValue(activeSearch.velocity),
      queuedApplications: numberValue(activeSearch.queuedApplications),
      staleApplications: numberValue(activeSearch.staleApplications),
      skillGaps: stringArrayValue(activeSearch.skillGaps),
      fitAnalysisCount: numberValue(activeSearch.fitAnalysisCount),
    },
    nextBestActions,
  };
}

export function normalizeCareerTwinSummary(twin: unknown): CareerTwinSummary | null {
  if (!isRecord(twin)) return null;

  const completeness = recordValue(twin.completeness);
  const behavioralBank = recordValue(twin.behavioralBank);
  const background = recordValue(twin.background);
  const memory = recordValue(twin.memory);
  const identity = recordValue(memory.identity);
  const goals = recordValue(memory.goals);
  const constraints = recordValue(memory.constraints);
  const confirmedFacts = recordValue(memory.confirmedFacts);
  const writingVoice = recordValue(memory.writingVoice);
  const activeSearch = recordValue(memory.activeSearch);

  const backgroundTargetRoles = stringArrayValue(background.targetRoles);
  const backgroundIndustries = stringArrayValue(background.industries);
  const backgroundEducation = stringArrayValue(background.education);

  const nextBestActions = Array.isArray(memory.nextBestActions)
    ? memory.nextBestActions
      .filter(isRecord)
      .map((action, index): CareerTwinAction => ({
        id: stringValue(action.id, `action-${index}`),
        label: stringValue(action.label, 'Review next career action'),
        reason: stringValue(action.reason, 'Taco needs more trusted context before recommending a precise action.'),
        path: stringValue(action.path, '/suite/intelligence'),
        priority: ['critical', 'high', 'medium', 'low'].includes(stringValue(action.priority))
          ? stringValue(action.priority) as CareerTwinPriority
          : 'medium',
      }))
    : [];

  return {
    completeness: {
      score: clampScore(numberValue(completeness.score)),
      missing: stringArrayValue(completeness.missing),
    },
    behavioralBank: {
      totalStories: numberValue(behavioralBank.totalStories),
      coveredCategories: stringArrayValue(behavioralBank.coveredCategories),
      uncoveredCategories: stringArrayValue(behavioralBank.uncoveredCategories),
      coverageScore: clampScore(numberValue(behavioralBank.coverageScore)),
    },
    background: {
      currentTitle: stringValue(background.currentTitle),
      targetRoles: backgroundTargetRoles,
      industries: backgroundIndustries,
      education: backgroundEducation,
    },
    memory: {
      identity: {
        name: stringValue(identity.name),
        currentTitle: stringValue(identity.currentTitle, stringValue(background.currentTitle)),
        seniority: stringValue(identity.seniority),
        careerFields: stringArrayValue(identity.careerFields),
        locationPreference: stringValue(identity.locationPreference),
      },
      goals: {
        targetRoles: stringArrayValue(goals.targetRoles).length ? stringArrayValue(goals.targetRoles) : backgroundTargetRoles,
        industries: stringArrayValue(goals.industries).length ? stringArrayValue(goals.industries) : backgroundIndustries,
        jobSearchStatus: stringValue(goals.jobSearchStatus),
        salaryMin: nullableNumberValue(goals.salaryMin),
        remotePreference: stringValue(goals.remotePreference, 'any'),
      },
      constraints: {
        preferredCities: stringArrayValue(constraints.preferredCities),
        excludedCompanies: stringArrayValue(constraints.excludedCompanies),
        autonomyLevel: stringValue(constraints.autonomyLevel, 'review_first'),
        requiresReviewBeforeExternalAction: typeof constraints.requiresReviewBeforeExternalAction === 'boolean'
          ? constraints.requiresReviewBeforeExternalAction
          : true,
      },
      confirmedFacts: {
        skills: stringArrayValue(confirmedFacts.skills),
        education: stringArrayValue(confirmedFacts.education).length ? stringArrayValue(confirmedFacts.education) : backgroundEducation,
        resumeVersionCount: numberValue(confirmedFacts.resumeVersionCount),
        hasResume: typeof confirmedFacts.hasResume === 'boolean' ? confirmedFacts.hasResume : false,
        topCompanies: stringArrayValue(confirmedFacts.topCompanies),
      },
      writingVoice: {
        tone: stringValue(writingVoice.tone, 'professional'),
        bannedClaims: stringArrayValue(writingVoice.bannedClaims),
        evidenceStyle: stringValue(writingVoice.evidenceStyle, 'proof_first'),
      },
      activeSearch: {
        totalApplications: numberValue(activeSearch.totalApplications),
        sentApplications: numberValue(activeSearch.sentApplications),
        responseRate: nullableNumberValue(activeSearch.responseRate),
        velocity: numberValue(activeSearch.velocity),
        queuedApplications: numberValue(activeSearch.queuedApplications),
        staleApplications: numberValue(activeSearch.staleApplications),
        skillGaps: stringArrayValue(activeSearch.skillGaps),
        fitAnalysisCount: numberValue(activeSearch.fitAnalysisCount),
      },
      nextBestActions,
    },
    exportable: Boolean(twin.exportable),
  };
}

export function clampScore(value: number | null | undefined) {
  return Math.max(0, Math.min(100, value || 0));
}

export function compactList(values: string[] | undefined, fallback = 'Not set yet', limit = 4) {
  const clean = (values || []).filter(Boolean);
  if (!clean.length) return fallback;
  const visible = clean.slice(0, limit).join(', ');
  return clean.length > limit ? `${visible} +${clean.length - limit}` : visible;
}

export function formatSalaryFloor(value: number | null | undefined) {
  if (!value) return 'Not set yet';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * A metric, or an em dash when it is unknown.
 *
 * This returned the literal '0' for null — and dropped the suffix while doing
 * it, so a null response rate rendered as a bare "0" rather than even an
 * honest-looking "0%". Either way it was a measurement the product did not
 * have. Counts are never null, so nothing that reads a count changes.
 */
export function metricValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value}${suffix}`;
}

export function titleCase(value: string | undefined) {
  const clean = `${value || ''}`.trim();
  if (!clean) return 'Not set yet';
  return clean
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function priorityClass(priority: CareerTwinPriority) {
  if (priority === 'critical') return 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]';
  if (priority === 'high') return 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]';
  return 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]';
}

export function careerTwinPromptMetadata(twin: CareerTwinSummary | null) {
  const normalizedTwin = normalizeCareerTwinSummary(twin);
  if (!normalizedTwin) return {};
  const memory = normalizeCareerTwinMemory(normalizedTwin.memory, normalizedTwin.background);
  return {
    completeness: normalizedTwin.completeness.score,
    targetRoles: memory?.goals?.targetRoles || normalizedTwin.background.targetRoles || [],
    totalApplications: memory?.activeSearch?.totalApplications || 0,
    queuedApplications: memory?.activeSearch?.queuedApplications || 0,
    staleApplications: memory?.activeSearch?.staleApplications || 0,
    skillGaps: memory?.activeSearch?.skillGaps || [],
  };
}
