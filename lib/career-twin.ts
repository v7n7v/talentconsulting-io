/**
 * Career Twin — Persistent Digital Twin
 * 
 * Persists the computed CareerProfile to Firestore for fast reads.
 * Supports invalidation triggers from any tool that changes source data.
 * Provides a structured, export-ready career profile.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { computeCareerProfile, type CareerProfile } from '@/lib/career-graph';

// ── Types ──

export interface CareerTwin extends CareerProfile {
  version: number;
  stale: boolean;

  // Structured background (enriched from resume data)
  background: {
    currentTitle: string;
    targetRoles: string[];
    industries: string[];
    education: string[];
  };

  // Behavioral answer bank metadata
  behavioralBank: {
    totalStories: number;
    coveredCategories: string[];
    uncoveredCategories: string[];
    coverageScore: number;      // 0-100
  };

  // Profile completeness
  completeness: {
    score: number;              // 0-100
    missing: string[];          // Fields that need filling
  };

  // v2 memory spine for Taco Omni-Agent
  memory: CareerTwinMemory;

  exportable: boolean;
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
    /** Null until there is a sent application to divide by. */
    responseRate: number | null;
    velocity: number;
    queuedApplications: number;
    staleApplications: number;
    skillGaps: string[];
    /**
     * How many fit analyses `skillGaps` was derived from.
     *
     * Without it, an empty `skillGaps` is ambiguous — "we compared you against
     * roles and found nothing missing" and "we have never compared you against
     * anything" are opposite facts, and the prompt was stating the second as
     * the first.
     */
    fitAnalysisCount: number;
  };
  nextBestActions: CareerTwinAction[];
}

export interface CareerTwinAction {
  id: string;
  label: string;
  reason: string;
  path: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

const TWIN_DOC_PATH = 'career_twin';
// 3 — healthBands added and morale became nullable; persisted v2 twins carry a
//     fabricated morale default and no band breakdown, so they must recompute.
// 4 — pipeline gained appliedApps / responded / interviews / offers, its rates
//     became nullable, and `responded` stopped counting `not_applied` records.
//     A persisted v3 twin carries the inflated response rate and no real
//     counts, so the UI would render `undefined` offers against a rate that
//     never matched the Weekly Pulse tab.
// 5 — the health items were re-gated on their own preconditions rather than on
//     a neighbouring signal, `volume` switched from records tracked to
//     applications sent, and velocity's denominator moved to the oldest SENT
//     record. The bands are persisted, so a v4 document would keep serving a
//     breakdown computed under the old, wrong gates. Also adds
//     skills.weakEvidenceCategories, interviews.resolvedOutcomeCount /
//     questionCount and memory.activeSearch.fitAnalysisCount.
const TWIN_VERSION = 5;

// Standard behavioral question categories
const BEHAVIORAL_CATEGORIES = [
  'leadership', 'teamwork', 'conflict resolution', 'failure',
  'initiative', 'communication', 'problem solving', 'time management',
  'adaptability', 'creativity', 'work ethic', 'customer focus',
];

function hasCurrentTwinShape(data: Partial<CareerTwin> | undefined): data is CareerTwin {
  return Boolean(
    data &&
    data.version === TWIN_VERSION &&
    data.background &&
    data.behavioralBank &&
    data.completeness &&
    data.memory?.goals &&
    data.memory?.activeSearch &&
    data.memory?.confirmedFacts &&
    data.memory?.constraints &&
    data.memory?.writingVoice &&
    Array.isArray(data.memory.nextBestActions)
  );
}

// ── Core API ──

/** Get the persisted twin (fast path — single Firestore read) */
export async function getTwin(uid: string): Promise<CareerTwin | null> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid)
    .collection('profile').doc(TWIN_DOC_PATH).get();

  if (!doc.exists) return null;

  const data = doc.data() as CareerTwin;

  // Check if stale or from an older schema; recompute instead of serving partial memory.
  if (data.stale || !hasCurrentTwinShape(data)) return null;

  return data;
}

/** Compute fresh profile and persist as twin */
export async function computeAndPersistTwin(uid: string): Promise<CareerTwin> {
  const db = getAdminDb();
  const profile = await computeCareerProfile(uid);

  // Enrich with background data from resume
  const background = await extractBackground(uid, db);

  // Compute behavioral bank coverage
  const behavioralBank = computeBehavioralCoverage(profile);

  // Compute completeness
  const completeness = computeCompleteness(profile, background, behavioralBank);

  const memory = await buildMemory(uid, db, profile, background, behavioralBank, completeness);

  const twin: CareerTwin = {
    ...profile,
    version: TWIN_VERSION,
    stale: false,
    background,
    behavioralBank,
    completeness,
    memory,
    exportable: completeness.score >= 60,
  };

  // Persist to Firestore
  await db.collection('users').doc(uid)
    .collection('profile').doc(TWIN_DOC_PATH)
    .set(twin, { merge: false });

  return twin;
}

/** Mark twin as stale (called when source data changes) */
export async function invalidateTwin(uid: string): Promise<void> {
  const db = getAdminDb();
  try {
    await db.collection('users').doc(uid)
      .collection('profile').doc(TWIN_DOC_PATH)
      .update({ stale: true });
  } catch {
    // Doc might not exist yet, that's fine
  }
}

/** Get twin with auto-refresh: tries cache first, recomputes if stale */
export async function getOrComputeTwin(uid: string): Promise<CareerTwin> {
  const existing = await getTwin(uid);
  if (existing) return existing;
  return computeAndPersistTwin(uid);
}

/** Export twin as a clean JSON object (for external tools) */
export function exportTwinJSON(twin: CareerTwin): object {
  return {
    profile: {
      healthScore: twin.healthScore,
      daysActive: twin.daysActive,
    },
    background: twin.background,
    skills: twin.skills,
    pipeline: {
      totalApplications: twin.pipeline.totalApps,
      sentApplications: twin.pipeline.appliedApps,
      velocity: twin.pipeline.velocity,
      responded: twin.pipeline.responded,
      interviews: twin.pipeline.interviews,
      offers: twin.pipeline.offers,
      responseRate: twin.pipeline.responseRate,
      ghostRate: twin.pipeline.ghostRate,
      topCompanies: twin.pipeline.topCompanies,
    },
    interviews: {
      totalDebriefs: twin.interviews.totalDebriefs,
      // null when the precondition is not met, for the same reason the
      // pipeline rates above are nullable. An exported profile is evidence.
      passRate: twin.interviews.resolvedOutcomeCount > 0 ? twin.interviews.passRate : null,
      resolvedOutcomeCount: twin.interviews.resolvedOutcomeCount,
      avgConfidence: twin.interviews.questionCount > 0 ? twin.interviews.avgConfidence : null,
      trend: twin.interviews.questionCount > 0 ? twin.interviews.confidenceTrend : null,
      weakAreas: twin.interviews.weakCategories.map(c => c.category),
      strongAreas: twin.interviews.strongCategories.map(c => c.category),
    },
    behavioralCoverage: twin.behavioralBank,
    memory: twin.memory,
    morale: {
      current: twin.morale.current,
      trend: twin.morale.trend,
      burnoutRisk: twin.morale.burnoutRisk,
    },
    meta: {
      computedAt: twin.computedAt,
      version: twin.version,
      completeness: twin.completeness.score,
    },
  };
}

/** Compact, prompt-safe Taco memory. Keeps facts short and avoids dumping full private records. */
export function getTwinPromptSummary(twin: CareerTwin): string {
  const memory = twin.memory || ({} as Partial<CareerTwinMemory>);
  const identity = memory.identity || {};
  const goals = memory.goals || {
    targetRoles: twin.background?.targetRoles || [],
    industries: twin.background?.industries || [],
    jobSearchStatus: '',
    salaryMin: null,
    remotePreference: '',
  };
  const activeSearch = memory.activeSearch || {
    totalApplications: 0,
    sentApplications: 0,
    responseRate: null,
    velocity: 0,
    queuedApplications: 0,
    staleApplications: 0,
    skillGaps: [],
  };
  const confirmedFacts = memory.confirmedFacts || {
    skills: [],
    education: [],
    resumeVersionCount: 0,
    hasResume: false,
    topCompanies: [],
  };
  const constraints = memory.constraints || {
    preferredCities: [],
    excludedCompanies: [],
    autonomyLevel: 'review-first',
    requiresReviewBeforeExternalAction: true,
  };
  const nextBestActions = memory.nextBestActions || [];
  const lines = [
    '## Taco Career Twin Memory',
    `Identity: ${compactList([identity.name, identity.currentTitle, identity.seniority]) || 'not fully known'}`,
    `Targets: ${compactList(goals.targetRoles) || 'not set'}${goals.remotePreference ? ` (${goals.remotePreference})` : ''}`,
    // "0% response rate" is what a null used to render as here, and Taco quoted
    // it back at users who had never sent an application.
    `Search: ${activeSearch.totalApplications} tracked (${activeSearch.sentApplications ?? 0} sent), ${activeSearch.velocity}/week, response rate ${activeSearch.responseRate === null || activeSearch.responseRate === undefined ? 'not measured' : `${activeSearch.responseRate}%`}, ${activeSearch.queuedApplications} queued`,
    `Skills: ${compactList(confirmedFacts.skills, 12) || 'not confirmed yet'}`,
    // "none detected yet" told Taco a fact the product does not have. An empty
    // gap list only means "no gaps" once a role has actually been analyzed —
    // the same distinction the line above draws for the response rate.
    `Gaps: ${compactList(activeSearch.skillGaps, 8) || (activeSearch.fitAnalysisCount ? 'none against the roles analyzed so far' : 'no role analyzed yet, so nothing compared')}`,
    `Story coverage: ${twin.behavioralBank.coverageScore}% across ${twin.behavioralBank.totalStories} stories`,
    `Constraints: external actions require user review; autonomy=${constraints.autonomyLevel || 'review-first'}`,
  ];

  if (goals.salaryMin) {
    lines.push(`Salary floor: $${Math.round(goals.salaryMin / 1000)}k`);
  }
  if (nextBestActions.length > 0) {
    lines.push('Next best actions:');
    nextBestActions.slice(0, 3).forEach(action => {
      lines.push(`- [${action.priority}] ${action.label}: ${action.reason} (${action.path})`);
    });
  }

  return lines.join('\n');
}

// ── Internal Helpers ──

async function extractBackground(uid: string, db: FirebaseFirestore.Firestore) {
  const background = {
    currentTitle: '',
    targetRoles: [] as string[],
    industries: [] as string[],
    education: [] as string[],
  };

  try {
    // Get latest resume for title/education
    const resumeSnap = await db.collection('users').doc(uid)
      .collection('resume_versions').orderBy('created_at', 'desc').limit(1).get();

    if (!resumeSnap.empty) {
      const resume = resumeSnap.docs[0].data();
      const content = resume.content || {};

      // Current title from most recent experience
      if (content.experience?.length > 0) {
        background.currentTitle = content.experience[0].title || '';
      }

      // Education
      if (content.education?.length > 0) {
        background.education = content.education.map((e: any) =>
          `${e.degree || ''} ${e.field || ''} — ${e.school || ''}`.trim()
        ).filter(Boolean);
      }
    }

    // Get job search preferences for target roles
    const prefsDoc = await db.collection('users').doc(uid)
      .collection('settings').doc('jobPreferences').get();

    if (prefsDoc.exists) {
      const prefs = prefsDoc.data()!;
      if (prefs.targetRoles) background.targetRoles = prefs.targetRoles;
      if (prefs.industries) background.industries = prefs.industries;
    } else {
      const legacyPrefsDoc = await db.collection('users').doc(uid)
        .collection('preferences').doc('job_search').get();
      if (legacyPrefsDoc.exists) {
        const prefs = legacyPrefsDoc.data()!;
        if (prefs.targetRoles) background.targetRoles = prefs.targetRoles;
        if (prefs.industries) background.industries = prefs.industries;
      }
    }
  } catch {
    // Non-critical — return partial background
  }

  return background;
}

function computeBehavioralCoverage(profile: CareerProfile) {
  const coveredTags = new Set(
    profile.stories.tagDistribution.map(t => t.tag.toLowerCase())
  );

  const coveredCategories = BEHAVIORAL_CATEGORIES.filter(c =>
    coveredTags.has(c)
  );
  const uncoveredCategories = BEHAVIORAL_CATEGORIES.filter(c =>
    !coveredTags.has(c)
  );

  const coverageScore = Math.round(
    (coveredCategories.length / BEHAVIORAL_CATEGORIES.length) * 100
  );

  return {
    totalStories: profile.stories.totalStories,
    coveredCategories,
    uncoveredCategories,
    coverageScore,
  };
}

function computeCompleteness(
  profile: CareerProfile,
  background: { currentTitle: string; targetRoles: string[]; education: string[] },
  behavioral: { coverageScore: number; totalStories: number }
) {
  const checks: { label: string; met: boolean }[] = [
    { label: 'Resume uploaded', met: profile.hasResume },
    { label: 'Current job title', met: !!background.currentTitle },
    { label: 'Target roles defined', met: background.targetRoles.length > 0 },
    { label: 'Skills confirmed (5+)', met: profile.skills.confirmed.length >= 5 },
    { label: 'At least 1 application tracked', met: profile.pipeline.totalApps > 0 },
    { label: 'At least 1 interview debrief', met: profile.interviews.totalDebriefs > 0 },
    { label: 'At least 3 STAR stories', met: behavioral.totalStories >= 3 },
    { label: 'Behavioral coverage > 25%', met: behavioral.coverageScore >= 25 },
    { label: 'Morale check recorded', met: profile.morale.history.length > 0 },
    { label: 'Education info present', met: background.education.length > 0 },
  ];

  const score = Math.round((checks.filter(c => c.met).length / checks.length) * 100);
  const missing = checks.filter(c => !c.met).map(c => c.label);

  return { score, missing };
}

async function buildMemory(
  uid: string,
  db: FirebaseFirestore.Firestore,
  profile: CareerProfile,
  background: { currentTitle: string; targetRoles: string[]; industries: string[]; education: string[] },
  behavioral: { coverageScore: number; totalStories: number },
  completeness: { score: number; missing: string[] }
): Promise<CareerTwinMemory> {
  const [profileSnap, prefsSnap, queueSnap, appsSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('profile').doc('main').get().catch(() => null),
    db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get().catch(() => null),
    db.collection('users').doc(uid).collection('agent_queue').where('status', 'in', ['pending', 'approved']).limit(20).get().catch(() => null),
    db.collection('users').doc(uid).collection('applications').limit(50).get().catch(() => null),
  ]);

  const onboarding = profileSnap?.exists ? profileSnap.data() || {} : {};
  const prefs = prefsSnap?.exists ? prefsSnap.data() || {} : {};
  const staleApplications = (appsSnap?.docs || []).filter(doc => {
    const app = doc.data();
    const status = String(app.status || '').toLowerCase();
    if (status !== 'applied') return false;
    const updatedAt = app.updatedAt || app.last_updated || app.createdAt || app.created_at;
    if (!updatedAt) return false;
    return Date.now() - new Date(updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000;
  }).length;

  const targetRoles = cleanStrings([
    ...(background.targetRoles || []),
    ...(Array.isArray(onboarding.target_roles) ? onboarding.target_roles : []),
    ...(Array.isArray(prefs.targetRoles) ? prefs.targetRoles : []),
  ], 10);

  const industries = cleanStrings([
    ...(background.industries || []),
    ...(Array.isArray(onboarding.career_fields) ? onboarding.career_fields : []),
    ...(Array.isArray(prefs.industries) ? prefs.industries : []),
  ], 10);

  return {
    identity: {
      name: String(onboarding.full_name || onboarding.fullName || '').trim(),
      currentTitle: background.currentTitle || '',
      seniority: String(onboarding.seniority_level || onboarding.seniorityLevel || '').trim(),
      careerFields: cleanStrings(Array.isArray(onboarding.career_fields) ? onboarding.career_fields : [], 8),
      locationPreference: String(onboarding.location_preference || prefs.remotePref || '').trim(),
    },
    goals: {
      targetRoles,
      industries,
      jobSearchStatus: String(onboarding.job_search_status || onboarding.jobSearchStatus || '').trim(),
      salaryMin: numberOrNull(prefs.salaryMin ?? onboarding.salary_range?.min),
      remotePreference: String(prefs.remotePref || onboarding.location_preference || 'any'),
    },
    constraints: {
      preferredCities: cleanStrings(Array.isArray(prefs.preferredCities) ? prefs.preferredCities : [], 10),
      excludedCompanies: cleanStrings(Array.isArray(prefs.agentExcludeCompanies) ? prefs.agentExcludeCompanies : [], 20),
      autonomyLevel: String(prefs.agentAutonomyLevel || 'prepare'),
      requiresReviewBeforeExternalAction: true,
    },
    confirmedFacts: {
      skills: cleanStrings(profile.skills.confirmed, 30),
      education: cleanStrings(background.education, 6),
      resumeVersionCount: profile.resumeVersionCount,
      hasResume: profile.hasResume,
      topCompanies: cleanStrings(profile.pipeline.topCompanies, 5),
    },
    writingVoice: {
      tone: 'clear, specific, confident, and human',
      bannedClaims: ['invented credentials', 'invented employers', 'invented metrics', 'unverified certifications'],
      evidenceStyle: 'prefer measurable proof from saved resume, applications, and Story Bank',
    },
    activeSearch: {
      totalApplications: profile.pipeline.totalApps,
      sentApplications: profile.pipeline.appliedApps,
      responseRate: profile.pipeline.responseRate,
      velocity: profile.pipeline.velocity,
      queuedApplications: queueSnap?.size || 0,
      staleApplications,
      skillGaps: cleanStrings(profile.skills.gap, 10),
      fitAnalysisCount: profile.skills.fitAnalysisCount,
    },
    nextBestActions: buildNextBestActions(profile, behavioral, completeness, queueSnap?.size || 0, staleApplications),
  };
}

function buildNextBestActions(
  profile: CareerProfile,
  behavioral: { coverageScore: number; totalStories: number },
  completeness: { score: number; missing: string[] },
  queuedApplications: number,
  staleApplications: number
): CareerTwinAction[] {
  const actions: CareerTwinAction[] = [];

  if (!profile.hasResume) {
    actions.push({ id: 'upload-resume', label: 'Upload a resume', reason: 'Taco needs a verified source of truth before preparing applications.', path: '/suite/resume', priority: 'critical' });
  }
  if (queuedApplications > 0) {
    actions.push({ id: 'review-queue', label: `Review ${queuedApplications} queued application${queuedApplications === 1 ? '' : 's'}`, reason: 'Prepared packets lose value if they sit too long.', path: '/suite/agent/queue', priority: 'high' });
  }
  if (staleApplications > 0) {
    actions.push({ id: 'follow-up', label: `Follow up on ${staleApplications} stale application${staleApplications === 1 ? '' : 's'}`, reason: 'A timely follow-up can revive silent applications or clarify status.', path: '/suite/applications', priority: 'high' });
  }
  if (profile.skills.gap.length >= 3) {
    actions.push({ id: 'prove-skill-gap', label: `Prove ${profile.skills.gap[0]}`, reason: 'This gap appears in target roles but is missing from confirmed resume evidence.', path: '/suite/skill-bridge', priority: 'medium' });
  }
  if (behavioral.totalStories < 3 || behavioral.coverageScore < 25) {
    actions.push({ id: 'story-bank', label: 'Build Story Bank coverage', reason: 'More verified stories make interview answers and screening questions stronger.', path: '/suite/agent/stories', priority: 'medium' });
  }
  if (completeness.score < 60 && actions.length < 5) {
    actions.push({ id: 'complete-profile', label: 'Complete Career Twin memory', reason: `Missing: ${completeness.missing.slice(0, 3).join(', ')}`, path: '/suite/intelligence', priority: 'medium' });
  }

  return actions.slice(0, 5);
}

function cleanStrings(values: unknown[], limit: number): string[] {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, limit);
}

function compactList(values: unknown[], limit = 5): string {
  return cleanStrings(values, limit).join(', ');
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
