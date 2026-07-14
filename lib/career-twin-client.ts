export type CareerTwinPriority = 'critical' | 'high' | 'medium' | 'low';

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
    responseRate: number;
    velocity: number;
    queuedApplications: number;
    staleApplications: number;
    skillGaps: string[];
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
        reason: stringValue(action.reason, 'Sona needs more trusted context before recommending a precise action.'),
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
      responseRate: numberValue(activeSearch.responseRate),
      velocity: numberValue(activeSearch.velocity),
      queuedApplications: numberValue(activeSearch.queuedApplications),
      staleApplications: numberValue(activeSearch.staleApplications),
      skillGaps: stringArrayValue(activeSearch.skillGaps),
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
        reason: stringValue(action.reason, 'Sona needs more trusted context before recommending a precise action.'),
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
        responseRate: numberValue(activeSearch.responseRate),
        velocity: numberValue(activeSearch.velocity),
        queuedApplications: numberValue(activeSearch.queuedApplications),
        staleApplications: numberValue(activeSearch.staleApplications),
        skillGaps: stringArrayValue(activeSearch.skillGaps),
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

export function metricValue(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
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
