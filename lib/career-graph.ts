/**
 * Career Intelligence Graph
 * 
 * Aggregates signals from all tools into a unified CareerProfile.
 * This is the brain of TalentConsulting.io — every tool feeds in,
 * and intelligence flows out.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { healthScoreFromBands } from '@/lib/career-twin-client';

// ── Types ──

export interface SkillIntelligence {
  confirmed: string[];     // From resume
  /**
   * Did the parsed resume actually carry a skills section? A degraded parse
   * emits `content: {}`, which is not the same as a resume with no skills.
   */
  resumeHasSkillsSection: boolean;
  growing: string[];       // From Skill Bridge progress
  weak: string[];          // From interview debriefs (low confidence categories)
  marketHot: string[];     // From job search / fit analyses
  gap: string[];           // In market demand but missing from resume
  /**
   * How many fit analyses `gap` was derived from.
   *
   * Without this, `gap: []` is ambiguous: it means both "we compared you
   * against roles and found nothing missing" and "we have never compared you
   * against anything". Those are opposite facts and the UI was rendering the
   * second as the first, with a green tick.
   */
  fitAnalysisCount: number;
  /**
   * How many interview categories carry enough answers for `weak` to be
   * derivable at all.
   *
   * A category needs two scored questions before it can be called weak (see
   * the `count >= 2` test below). Under that threshold `weak: []` does not
   * mean "no weak areas", it means "not enough answers to tell" — and scoring
   * it as five earned points is the free-points pattern this file exists to
   * remove.
   */
  weakEvidenceCategories: number;
}

/**
 * The statuses that mean an employer came back to you.
 *
 * An allowlist, deliberately. The old test was a denylist
 * (`s !== 'applied' && s !== 'saved' && s !== 'queued'`), which counted every
 * status nobody had thought about as a response — including `not_applied`,
 * the status `lib/database-suite.ts` gives a record the moment a resume is
 * morphed. A user who morphed five resumes and applied to nothing was shown a
 * 100% response rate. With an allowlist a new status is silently *not* a
 * response, which is the safe direction to be wrong in.
 *
 * `withdrawn` is not here: the user withdrew, the employer never replied.
 * `ghosted` / `no_response` are not here for the obvious reason.
 */
const EMPLOYER_RESPONSE_STATUSES = new Set([
  'screening', 'callback',
  'interview', 'interviewing', 'interview_scheduled', 'interviewed',
  'offer', 'accepted',
  'rejected', 'declined',
]);

/** Statuses that mean the application was never actually sent. */
const NOT_YET_APPLIED_STATUSES = new Set(['', 'not_applied', 'saved', 'queued', 'draft']);

/**
 * Did the employer respond? One definition, exported, so the Overview tab and
 * the Weekly Pulse tab on the same page cannot disagree about the same user.
 */
export function countsAsEmployerResponse(status: unknown): boolean {
  return EMPLOYER_RESPONSE_STATUSES.has(String(status ?? '').toLowerCase());
}

/** Was this application actually sent? The denominator for every rate below. */
export function countsAsApplied(status: unknown): boolean {
  return !NOT_YET_APPLIED_STATUSES.has(String(status ?? '').toLowerCase());
}

/**
 * The statuses that mean the application reached an interview.
 *
 * A funnel stage is "did this ever reach here", not "is it parked here right
 * now": `assertStatusOutcomeTransition` in the outcome route enforces the
 * ladder, so an application at `offer` passed the interview stage.
 */
const INTERVIEW_STATUSES = new Set([
  'interview', 'interviewing', 'interview_scheduled', 'interviewed',
  'offer', 'accepted',
]);

const OFFER_STATUSES = new Set(['offer', 'accepted']);

/**
 * Did any recorded outcome — current or historical — match one of `wanted`?
 *
 * A rejection can arrive after an interview, and the status then reads
 * `rejected`, so the status alone loses the stage the application reached.
 */
function everRecordedOutcome(record: any, wanted: string[]): boolean {
  const history: any[] = Array.isArray(record?.outcome_history) ? record.outcome_history : [];
  return [record?.outcome_response, ...history.map(h => h?.outcome)]
    .some(outcome => typeof outcome === 'string' && wanted.includes(outcome));
}

/**
 * Did this application reach an interview? Exported for the same reason
 * `countsAsEmployerResponse` is: the Overview tab and the Weekly Pulse tab
 * render on one page and must not disagree about one user.
 *
 * Takes the whole record, not just the status, because the recorded outcome
 * history is part of the answer.
 */
export function countsAsInterview(record: any): boolean {
  return INTERVIEW_STATUSES.has(String(record?.status ?? '').toLowerCase())
    || everRecordedOutcome(record, ['interview', 'offer']);
}

/** Did this application reach an offer? Same contract as `countsAsInterview`. */
export function countsAsOffer(record: any): boolean {
  return OFFER_STATUSES.has(String(record?.status ?? '').toLowerCase())
    || everRecordedOutcome(record, ['offer']);
}

/** Did the employer come back, by status or by recorded outcome? */
export function recordCountsAsEmployerResponse(record: any): boolean {
  return countsAsEmployerResponse(record?.status)
    || everRecordedOutcome(record, ['callback', 'interview', 'offer', 'rejection']);
}

export interface PipelineIntelligence {
  /** Every application record, including ones that were never sent. */
  totalApps: number;
  /** Records actually applied to. The denominator for every rate here. */
  appliedApps: number;
  thisWeekApps: number;
  /**
   * Applications sent per week, to one decimal. An integer round printed
   * "0 apps / week" directly above "Applications tracked: 1".
   */
  velocity: number;
  /** Counted, never back-derived from a rate. */
  responded: number;
  interviews: number;
  offers: number;
  /**
   * Null when there is no denominator. A response rate over zero sent
   * applications is unknown, not 0% — and 0% is what the UI used to print.
   */
  responseRate: number | null;      // % of sent applications that got a response
  interviewConversion: number | null; // % responses → interviews
  offerConversion: number | null;   // % interviews → offers
  ghostRate: number | null;         // % of sent applications never answered
  topIndustries: string[];          // Most-applied industries
  topCompanies: string[];           // Most-applied companies
  avgDaysToResponse: number | null; // Avg days before hearing back
}

export interface InterviewIntelligence {
  totalDebriefs: number;
  /**
   * % of RESOLVED debriefs that were passed. Meaningless until
   * `resolvedOutcomeCount` is above zero — see below.
   */
  passRate: number;
  /**
   * Debriefs whose outcome is something other than `pending`.
   *
   * `app/api/agent/debriefs/route.ts` defaults `outcome` to `'pending'`, so a
   * user's first debrief has no resolved outcome by construction. Gating pass
   * rate on `totalDebriefs > 0` scored that user 0 out of 5 for an interview
   * they have not heard back about.
   */
  resolvedOutcomeCount: number;
  /**
   * Questions across all debriefs. Confidence, strong and weak categories are
   * all derived from these, and the debrief API permits saving none — so
   * `totalDebriefs > 0` is not the precondition for any of them.
   */
  questionCount: number;
  weakCategories: { category: string; avgConfidence: number; count: number }[];
  strongCategories: { category: string; avgConfidence: number; count: number }[];
  avgConfidence: number;
  avgFeeling: number;
  confidenceTrend: 'improving' | 'stable' | 'declining';
  roundTypeBreakdown: { type: string; count: number; avgConf: number }[];
  companiesInterviewed: string[];
}

export interface StoryIntelligence {
  totalStories: number;
  tagDistribution: { tag: string; count: number }[];
  sourceMix: { source: string; count: number }[];
  coverageGaps: string[];    // Categories with few or no stories
}

/**
 * Morale is self-reported on the Weekly Pulse tab. Every field is nullable
 * because a user who has never checked in has no morale, no trend and no
 * burnout risk — and the previous default (`3 / stable / low`) told a stranger
 * how they feel. Null here is the honest answer; the UI renders it as absent.
 */
export interface MoraleIntelligence {
  /** 1-5, self-reported. Null until the user checks in at least once. */
  current: number | null;
  trend: 'improving' | 'stable' | 'declining' | null;
  burnoutRisk: 'low' | 'moderate' | 'high' | null;
  history: { week: string; score: number }[];
}

/**
 * One sub-score inside a health band.
 *
 * `measured` is the whole point. An unmeasured item scores 0, but a 0 that
 * means "we never looked" must not be averaged in with a 0 that means "we
 * looked and there was nothing" — so unmeasured items are excluded from the
 * denominator instead of dragging the score down.
 */
export interface HealthItem {
  key: string;
  label: string;
  score: number;
  max: number;
  measured: boolean;
}

export interface HealthBand {
  key: string;
  label: string;
  /** Points earned across measured items. */
  earned: number;
  /** Points available from measured items only. 0 = nothing in this band is known. */
  available: number;
  /** Points this band would be worth if everything in it were measured. */
  max: number;
  items: HealthItem[];
}

export interface CareerProfile {
  uid: string;
  computedAt: string;
  /**
   * 0-100, computed as earned/available across MEASURED items only.
   * Not earned/100 — that renders "not measured" as "measured, scored zero".
   */
  healthScore: number;
  /** The real four bands behind healthScore. The UI must not re-derive them. */
  healthBands: HealthBand[];

  skills: SkillIntelligence;
  pipeline: PipelineIntelligence;
  interviews: InterviewIntelligence;
  stories: StoryIntelligence;
  morale: MoraleIntelligence;

  // Resume intelligence
  resumeVersionCount: number;
  hasResume: boolean;

  // Timeline
  daysActive: number;          // Days since first tracked activity
}

// ── Core Computation ──

export async function computeCareerProfile(uid: string): Promise<CareerProfile> {
  const db = getAdminDb();
  const now = Date.now();

  // Parallel data fetch — all collections at once
  const [
    apps,
    debriefsSnap,
    storiesSnap,
    moraleSnap,
    resumeSnap,
    fitSnap,
  ] = await Promise.all([
    fetchApplicationRecords(uid),
    db.collection('users').doc(uid).collection('debriefs')
      .orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('users').doc(uid).collection('agent_stories')
      .orderBy('createdAt', 'desc').limit(100).get(),
    db.collection('users').doc(uid).collection('morale')
      .orderBy('week', 'desc').limit(12).get(),
    db.collection('users').doc(uid).collection('resume_versions')
      .orderBy('created_at', 'desc').limit(5).get(),
    db.collection('users').doc(uid).collection('fit_analyses')
      .orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  const debriefs = debriefsSnap.docs.map(d => d.data());
  const stories = storiesSnap.docs.map(d => d.data());
  const moraleEntries = moraleSnap.docs.map(d => d.data());
  const resumes = resumeSnap.docs.map(d => d.data());
  const fitAnalyses = fitSnap.docs.map(d => d.data());

  // ── Skills Intelligence ──
  const skills = computeSkillIntelligence(resumes, debriefs, fitAnalyses, apps);

  // ── Pipeline Intelligence ──
  const pipeline = computePipelineIntelligence(apps, now);

  // ── Interview Intelligence ──
  const interviews = computeInterviewIntelligence(debriefs);

  // ── Story Intelligence ──
  const storyIntel = computeStoryIntelligence(stories, interviews.weakCategories);

  // ── Morale Intelligence ──
  const morale = computeMoraleIntelligence(moraleEntries);

  // ── Days Active ──
  const allDates = [
    ...apps.map(a => a.createdAt || a.created_at || a.appliedAt || a.applied_at),
    ...debriefs.map(d => d.createdAt),
    ...stories.map(s => s.createdAt),
  ].filter(Boolean).map(d => new Date(d).getTime());
  const earliest = allDates.length > 0 ? Math.min(...allDates) : now;
  const daysActive = Math.max(1, Math.floor((now - earliest) / 86400000));

  // ── Health Score ──
  const healthBands = computeHealthBands(pipeline, interviews, morale, skills, resumes.length);
  const healthScore = scoreFromBands(healthBands);

  return {
    uid,
    computedAt: new Date().toISOString(),
    healthScore,
    healthBands,
    skills,
    pipeline,
    interviews,
    stories: storyIntel,
    morale,
    resumeVersionCount: resumes.length,
    hasResume: resumes.length > 0,
    daysActive,
  };
}

async function fetchApplicationRecords(uid: string): Promise<any[]> {
  const db = getAdminDb();
  const collectionRef = db.collection('users').doc(uid).collection('applications');

  try {
    const snap = await collectionRef.orderBy('createdAt', 'desc').limit(300).get();
    if (!snap.empty) return snap.docs.map(d => d.data());
  } catch {
    // Older records may only have snake_case timestamps.
  }

  const legacySnap = await collectionRef.limit(300).get();
  return legacySnap.docs
    .map(d => d.data())
    .sort((a, b) => getRecordTime(b) - getRecordTime(a));
}

function getRecordTime(record: any): number {
  const raw = record?.createdAt || record?.created_at || record?.appliedAt || record?.applied_at || 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

// ── Skill Intelligence ──

function computeSkillIntelligence(
  resumes: any[], debriefs: any[], fitAnalyses: any[], apps: any[]
): SkillIntelligence {
  // Confirmed: skills from resume
  const confirmed = new Set<string>();
  const resumeHasSkillsSection = Array.isArray(resumes[0]?.content?.skills);
  if (resumes[0]?.content?.skills) {
    for (const cat of resumes[0].content.skills) {
      for (const item of (cat.items || [])) {
        confirmed.add(typeof item === 'string' ? item.toLowerCase() : String(item).toLowerCase());
      }
    }
  }

  // Weak: categories with low confidence in debriefs
  const weak = new Set<string>();
  const categoryScores: Record<string, { total: number; count: number }> = {};
  debriefs.forEach(d => {
    (d.questions || []).forEach((q: any) => {
      const cat = (q.category || '').toLowerCase();
      if (!cat) return;
      if (!categoryScores[cat]) categoryScores[cat] = { total: 0, count: 0 };
      categoryScores[cat].total += q.confidence || 0;
      categoryScores[cat].count += 1;
    });
  });
  let weakEvidenceCategories = 0;
  Object.entries(categoryScores).forEach(([cat, data]) => {
    if (data.count < 2) return;
    // The category has enough answers to be judged either way. That, not the
    // existence of a debrief, is what makes `weak` a measurement.
    weakEvidenceCategories++;
    if (data.total / data.count < 50) weak.add(cat);
  });

  // Market hot: skills from fit analyses and job searches
  const marketHot = new Set<string>();
  fitAnalyses.forEach(fa => {
    (fa.matchingSkills || []).forEach((s: string) => marketHot.add(s.toLowerCase()));
    (fa.missingSkills || []).forEach((s: string) => marketHot.add(s.toLowerCase()));
  });

  // Gap: in market demand but not in resume
  const gap = new Set<string>();
  fitAnalyses.forEach(fa => {
    (fa.missingSkills || []).forEach((s: string) => {
      const lower = s.toLowerCase();
      if (!confirmed.has(lower)) gap.add(lower);
    });
  });

  return {
    confirmed: [...confirmed].slice(0, 30),
    resumeHasSkillsSection,
    growing: [],  // Will be populated when Skill Bridge progress tracking is added
    weak: [...weak],
    marketHot: [...marketHot].slice(0, 15),
    gap: [...gap].slice(0, 10),
    fitAnalysisCount: fitAnalyses.length,
    weakEvidenceCategories,
  };
}

// ── Pipeline Intelligence ──

function computePipelineIntelligence(apps: any[], now: number): PipelineIntelligence {
  const totalApps = apps.length;
  const oneWeekAgo = now - 7 * 86400000;
  const thisWeekApps = apps.filter(a => getRecordTime(a) > oneWeekAgo).length;

  let appliedApps = 0, responded = 0, interviews = 0, offers = 0;
  const companyCounts: Record<string, number> = {};
  const responseTimes: number[] = [];
  let oldestSentTime = Infinity;

  apps.forEach(a => {
    const s = (a.status || '').toLowerCase();
    /*
     * The funnel counts below are all inside the applied branch on purpose.
     *
     * An employer cannot reply to an application that was never sent, so a
     * record still marked `not_applied` carrying an `outcome_response` is a
     * data anomaly, not a response — and counting it would put `responded`
     * above `appliedApps` and print a response rate over 100%.
     */
    if (countsAsApplied(s)) {
      appliedApps++;
      const sentTime = getRecordTime(a);
      if (sentTime > 0 && sentTime < oldestSentTime) oldestSentTime = sentTime;

      if (recordCountsAsEmployerResponse(a)) responded++;
      if (countsAsInterview(a)) interviews++;
      if (countsAsOffer(a)) offers++;
    }

    const company = a.company || a.companyName || a.company_name || '';
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;

    const respondedAt = a.respondedAt || a.outcome_reported_at;
    const createdAt = a.createdAt || a.created_at || a.appliedAt || a.applied_at;
    if (respondedAt && createdAt) {
      const days = Math.floor((new Date(respondedAt).getTime() - new Date(createdAt).getTime()) / 86400000);
      if (days > 0 && days < 120) responseTimes.push(days);
    }
  });

  /*
   * Velocity — applications sent per week, one decimal. `Math.round` turned
   * one application over three weeks into "0 apps / week", which contradicted
   * the count printed under it.
   *
   * Numerator and denominator have to describe the same thing. The denominator
   * used to be weeks since the oldest record of ANY kind, including records
   * that were only ever morphed and never sent, so someone who morphed a
   * resume twenty weeks ago and sent three applications last week was rated at
   * 0.2 / week. It is weeks since the oldest SENT record.
   */
  const weeksActive = Number.isFinite(oldestSentTime)
    ? Math.max(1, Math.ceil((now - oldestSentTime) / (7 * 86400000)))
    : 1;
  const velocity = appliedApps > 0 ? Math.round((appliedApps / weeksActive) * 10) / 10 : 0;

  const topCompanies = Object.entries(companyCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  return {
    totalApps,
    appliedApps,
    thisWeekApps,
    velocity,
    responded,
    interviews,
    offers,
    responseRate: appliedApps > 0 ? Math.round(responded / appliedApps * 100) : null,
    interviewConversion: responded > 0 ? Math.round(interviews / responded * 100) : null,
    offerConversion: interviews > 0 ? Math.round(offers / interviews * 100) : null,
    ghostRate: appliedApps > 0 ? Math.round((appliedApps - responded) / appliedApps * 100) : null,
    topIndustries: [],
    topCompanies,
    avgDaysToResponse: responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null,
  };
}

// ── Interview Intelligence ──

function computeInterviewIntelligence(debriefs: any[]): InterviewIntelligence {
  const totalDebriefs = debriefs.length;

  if (totalDebriefs === 0) {
    return {
      totalDebriefs: 0, passRate: 0,
      resolvedOutcomeCount: 0, questionCount: 0,
      weakCategories: [], strongCategories: [],
      avgConfidence: 0, avgFeeling: 0,
      confidenceTrend: 'stable', roundTypeBreakdown: [],
      companiesInterviewed: [],
    };
  }

  // Pass rate
  const withOutcome = debriefs.filter(d => d.outcome && d.outcome !== 'pending');
  const passed = withOutcome.filter(d => d.outcome === 'passed').length;
  const passRate = withOutcome.length > 0 ? Math.round(passed / withOutcome.length * 100) : 0;

  // Category analysis
  const catScores: Record<string, { total: number; count: number }> = {};
  debriefs.forEach(d => {
    (d.questions || []).forEach((q: any) => {
      const cat = q.category || 'General';
      if (!catScores[cat]) catScores[cat] = { total: 0, count: 0 };
      catScores[cat].total += q.confidence || 0;
      catScores[cat].count += 1;
    });
  });

  const allCategories = Object.entries(catScores).map(([category, data]) => ({
    category,
    avgConfidence: Math.round(data.total / data.count),
    count: data.count,
  })).sort((a, b) => a.avgConfidence - b.avgConfidence);

  const weakCategories = allCategories.filter(c => c.avgConfidence < 55);
  const strongCategories = allCategories.filter(c => c.avgConfidence >= 70);

  // Overall confidence
  const allQuestions = debriefs.flatMap(d => d.questions || []);
  const avgConfidence = allQuestions.length > 0
    ? Math.round(allQuestions.reduce((a: number, q: any) => a + (q.confidence || 0), 0) / allQuestions.length)
    : 0;

  // Feeling
  const avgFeeling = Math.round(debriefs.reduce((a, d) => a + (d.overallFeeling || 3), 0) / totalDebriefs * 10) / 10;

  // Confidence trend (comparing first half vs second half)
  let confidenceTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (totalDebriefs >= 4) {
    const mid = Math.floor(totalDebriefs / 2);
    const firstHalf = debriefs.slice(mid); // older (reversed order)
    const secondHalf = debriefs.slice(0, mid); // newer

    const avgFirst = firstHalf.flatMap(d => d.questions || [])
      .reduce((a: number, q: any) => a + (q.confidence || 0), 0) /
      Math.max(firstHalf.flatMap(d => d.questions || []).length, 1);
    const avgSecond = secondHalf.flatMap(d => d.questions || [])
      .reduce((a: number, q: any) => a + (q.confidence || 0), 0) /
      Math.max(secondHalf.flatMap(d => d.questions || []).length, 1);

    if (avgSecond > avgFirst + 5) confidenceTrend = 'improving';
    else if (avgSecond < avgFirst - 5) confidenceTrend = 'declining';
  }

  // Round type breakdown
  const roundCounts: Record<string, { count: number; totalConf: number }> = {};
  debriefs.forEach(d => {
    const rt = d.roundType || 'behavioral';
    if (!roundCounts[rt]) roundCounts[rt] = { count: 0, totalConf: 0 };
    roundCounts[rt].count += 1;
    const qs = d.questions || [];
    const avg = qs.length > 0 ? qs.reduce((a: number, q: any) => a + (q.confidence || 0), 0) / qs.length : 50;
    roundCounts[rt].totalConf += avg;
  });
  const roundTypeBreakdown = Object.entries(roundCounts).map(([type, data]) => ({
    type, count: data.count, avgConf: Math.round(data.totalConf / data.count),
  }));

  // Companies
  const companiesInterviewed = [...new Set(debriefs.map(d => d.company).filter(Boolean))];

  return {
    totalDebriefs, passRate,
    resolvedOutcomeCount: withOutcome.length,
    questionCount: allQuestions.length,
    weakCategories, strongCategories,
    avgConfidence, avgFeeling,
    confidenceTrend, roundTypeBreakdown,
    companiesInterviewed,
  };
}

// ── Story Intelligence ──

function computeStoryIntelligence(
  stories: any[],
  weakCategories: { category: string }[]
): StoryIntelligence {
  const totalStories = stories.length;

  // Tag distribution
  const tagCounts: Record<string, number> = {};
  stories.forEach(s => {
    (s.tags || []).forEach((tag: string) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const tagDistribution = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  // Source mix
  const sourceCounts: Record<string, number> = {};
  stories.forEach(s => {
    const source = s.source || 'chat';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });
  const sourceMix = Object.entries(sourceCounts).map(([source, count]) => ({ source, count }));

  // Coverage gaps — weak interview categories that don't have stories
  const tagSet = new Set(Object.keys(tagCounts).map(t => t.toLowerCase()));
  const coverageGaps = weakCategories
    .filter(wc => !tagSet.has(wc.category.toLowerCase()))
    .map(wc => wc.category);

  return { totalStories, tagDistribution, sourceMix, coverageGaps };
}

// ── Morale Intelligence ──

function computeMoraleIntelligence(moraleEntries: any[]): MoraleIntelligence {
  // Only entries carrying a real 1-5 self-report count. An entry with no score
  // is not a 3; it is not a check-in.
  const scored = moraleEntries.filter(
    m => typeof m?.score === 'number' && m.score >= 1 && m.score <= 5,
  );

  if (scored.length === 0) {
    // No check-ins. Not "neutral, stable, low risk" — unknown.
    return { current: null, trend: null, burnoutRisk: null, history: [] };
  }

  const history = scored
    .map(m => ({ week: m.week, score: m.score }))
    .reverse();

  const current: number = scored[0].score;

  /*
   * Trend needs two windows that do not overlap.
   *
   * The old code compared `slice(-3)` against `slice(0, 3)` — at exactly three
   * entries those are the same three entries, so the difference was always 0
   * and the trend could only ever be 'stable'. It also initialised to 'stable'
   * and left it there for one and two check-ins, so a single check-in was
   * rendered as "Stable trend" and scored 3 of the 5 trend points.
   *
   * Null until there are two disjoint windows to compare. A trend from one
   * data point is not a trend.
   */
  let trend: 'improving' | 'stable' | 'declining' | null = null;
  if (history.length >= 4) {
    const windowSize = Math.min(3, Math.floor(history.length / 2));
    const older = history.slice(0, windowSize);
    const recent = history.slice(-windowSize);
    const olderAvg = older.reduce((a, h) => a + h.score, 0) / windowSize;
    const recentAvg = recent.reduce((a, h) => a + h.score, 0) / windowSize;
    if (recentAvg > olderAvg + 0.5) trend = 'improving';
    else if (recentAvg < olderAvg - 0.5) trend = 'declining';
    else trend = 'stable';
  }

  /*
   * Burnout is about a sustained low, so it needs a run of check-ins. One
   * report of 4/5 does not establish "Burnout risk: low", and that green line
   * was being shown to anyone who had tapped a face once.
   *
   * But the run-of-three MEAN alone is not enough either, and getting that
   * wrong is a safety regression rather than a metric nit. Two good weeks
   * either side of a 1/5 average to 3.7, and a mean-only rule then reports
   * "Burnout risk: low" in green, awards the full 5 Wellbeing points and
   * suppresses the critical burnout recommendation — for a person who has
   * just told the product they are at 1 out of 5 today. The latest report is a
   * floor: it can raise the risk, never lower it.
   *
   * `moderate` keys off the mean alone. Requiring `trend === 'declining'` on
   * top made the branch unreachable at exactly three check-ins, because trend
   * stays null until there are four — so a three-week user could only ever be
   * 'high' or 'low'.
   */
  let burnoutRisk: 'low' | 'moderate' | 'high' | null = null;
  if (history.length >= 1) {
    /*
     * The floor applies from the FIRST check-in, not the third.
     *
     * Gating the whole rule on three entries meant someone who told the product
     * they were at 1 out of 5 in their first week got burnoutRisk null, and
     * `generateRecommendations` returned nothing - no "Burnout Risk Detected".
     * HEAD fired `high` at `current <= 2` at any length and was right to. That
     * window is every account's first two weeks, which is exactly when a person
     * reporting a 1 most needs the product to notice.
     *
     * The three-entry mean still contributes once it exists; it can only raise
     * the risk, never lower what the latest report already established.
     */
    const recentThree = history.slice(-3);
    const recentAvg = recentThree.reduce((a, h) => a + h.score, 0) / recentThree.length;
    if (current <= 2 || recentAvg <= 2) burnoutRisk = 'high';
    else if (recentAvg <= 3) burnoutRisk = 'moderate';
    else burnoutRisk = 'low';
  }

  return { current, trend, burnoutRisk, history };
}

// ── Health Score (0-100) ──

/** Clamp a sub-score into [0, max] so one item can never distort a band. */
function item(
  key: string,
  label: string,
  raw: number,
  max: number,
  measured: boolean,
): HealthItem {
  return {
    key,
    label,
    score: measured ? Math.max(0, Math.min(max, raw)) : 0,
    max,
    measured,
  };
}

function band(key: string, label: string, items: HealthItem[]): HealthBand {
  const measured = items.filter(i => i.measured);
  return {
    key,
    label,
    earned: Math.round(measured.reduce((a, i) => a + i.score, 0)),
    // Only measured items are available. An unmeasured item is not a lost
    // point, it is a point that was never on the table.
    available: measured.reduce((a, i) => a + i.max, 0),
    max: items.reduce((a, i) => a + i.max, 0),
    items,
  };
}

/**
 * The four bands and the fifteen sub-scores behind them.
 *
 * This used to return only the sum, and the UI faked the breakdown by
 * multiplying that one number by 0.3 / 0.35 / 0.2 / 0.15 — four bars that
 * could never diverge, which is the only thing a breakdown is for.
 */
function computeHealthBands(
  pipeline: PipelineIntelligence,
  interviews: InterviewIntelligence,
  morale: MoraleIntelligence,
  skills: SkillIntelligence,
  resumeCount: number,
): HealthBand[] {
  /*
   * Every gate below tests the item's OWN measurability.
   *
   * The recurring bug this replaces was one shape repeated: an item gated on a
   * neighbouring signal. `interviewConversion` was gated on "any application
   * sent", but the pipeline sets it to null when nothing has been responded to
   * — so a user with ten applications and no replies had an unknown ratio
   * scored as a measured 0 out of 10. `passRate` was gated on "any debrief
   * exists", but the debrief API defaults `outcome` to 'pending', so every
   * user's first debrief scored 0 out of 5 for an interview they had not heard
   * back about. `confidence`, `strongAreas` and `weakAreas` were gated the
   * same way while all three are derived from debrief QUESTIONS, which a
   * debrief is allowed to have none of.
   *
   * The rule: never gate an item on a signal it does not read.
   */
  const hasResume = resumeCount > 0;
  // Nullable rates carry their own answer: null IS "no denominator".
  const hasResponseRate = pipeline.responseRate !== null;
  const hasInterviewConversion = pipeline.interviewConversion !== null;
  // Pass rate needs a debrief whose outcome is no longer 'pending'.
  const hasResolvedOutcomes = interviews.resolvedOutcomeCount > 0;
  // Confidence and strong categories are averages over debrief questions.
  const hasQuestions = interviews.questionCount > 0;
  // `weak` needs a category with at least two answers before it means anything.
  const hasWeakEvidence = skills.weakEvidenceCategories > 0;
  const hasFitAnalyses = skills.fitAnalysisCount > 0;
  // Three separate gates, not one. A single check-in gives a real morale score
  // and no trend and no burnout risk — gating all three on `history.length > 0`
  // awarded 8 of the 15 Wellbeing points for two values nobody measured.
  const hasMorale = morale.current !== null;
  const hasMoraleTrend = morale.trend !== null;
  const hasBurnoutRisk = morale.burnoutRisk !== null;

  return [
    // Activity — absence is itself an observation. Zero applications is a
    // measured zero, not an unknown, so every item here is always measured.
    band('activity', 'Activity', [
      item('velocity', 'Applications per week', pipeline.velocity * 2, 10, true),
      // `totalApps / 5` counted records that were never sent, so morphing five
      // resumes and applying to nothing earned Activity points in the same
      // band where `velocity` scores 0 for that user. One denominator per band.
      item('volume', 'Applications sent', pipeline.appliedApps / 5, 10, true),
      item('debriefs', 'Interview debriefs logged', interviews.totalDebriefs * 2.5, 5, true),
      item('resume', 'Resume on file', hasResume ? 5 : 0, 5, true),
    ]),

    // Performance — a conversion rate needs something to convert.
    band('performance', 'Performance', [
      item('responseRate', 'Response rate', (pipeline.responseRate ?? 0) / 3, 10, hasResponseRate),
      item('interviewConversion', 'Response → interview', (pipeline.interviewConversion ?? 0) / 5, 10, hasInterviewConversion),
      item('confidence', 'Interview confidence', interviews.avgConfidence / 8, 10, hasQuestions),
      item('passRate', 'Interview pass rate', interviews.passRate / 20, 5, hasResolvedOutcomes),
    ]),

    // Preparedness — each item has a different source, so each has its own gate.
    band('preparedness', 'Preparedness', [
      // Gated on the resume actually CARRYING a skills section, not merely on a
      // resume existing. lib/resume-normalizer.ts emits `content: {}` on a
      // degraded parse, so `hasResume` was true while `confirmed` was empty -
      // a measured zero from an unknown, inside the function whose own comment
      // says every item tests its own measurability. An empty `skills: []` IS a
      // real answer and stays measured; a missing key is not.
      item('skills', 'Skills on your resume', skills.confirmed.length / 4, 5, skills.resumeHasSkillsSection),
      // `20 - gap.length * 2` clamped to 5, so it paid full marks to anyone
      // with 7 or fewer gaps — a "measured" item that was a constant for almost
      // everyone, inflating the denominator without ever moving.
      item('gaps', 'Skill gaps against analyzed roles', 5 - skills.gap.length, 5, hasFitAnalyses),
      item('strongAreas', 'Strong interview categories', interviews.strongCategories.length * 2.5, 5, hasQuestions),
      item('weakAreas', 'Weak interview categories', 5 - skills.weak.length, 5, hasWeakEvidence),
    ]),

    // Wellbeing — entirely self-reported on the Weekly Pulse tab.
    band('wellbeing', 'Wellbeing', [
      item('morale', 'Latest morale check-in', (morale.current ?? 0) * 1, 5, hasMorale),
      item('moraleTrend', 'Morale trend',
        morale.trend === 'improving' ? 5 : morale.trend === 'stable' ? 3 : 0, 5, hasMoraleTrend),
      item('burnout', 'Burnout risk',
        morale.burnoutRisk === 'low' ? 5 : morale.burnoutRisk === 'moderate' ? 2 : 0, 5, hasBurnoutRisk),
    ]),
  ];
}

/**
 * earned / available, never earned / 100.
 *
 * Dividing by the full 100 would mean a user who has logged applications but
 * never reported morale is scored as if their morale were the worst possible.
 * Activity is always measured, so `available` is never 0.
 *
 * The arithmetic lives in `lib/career-twin-client.ts` because the pages that
 * turn this number into a word have to agree with it, and they cannot import
 * this module — it pulls in firebase-admin. One definition, three readers.
 */
function scoreFromBands(bands: HealthBand[]): number {
  return healthScoreFromBands(bands);
}
