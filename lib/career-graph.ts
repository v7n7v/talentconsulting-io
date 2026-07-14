/**
 * Career Intelligence Graph
 * 
 * Aggregates signals from all tools into a unified CareerProfile.
 * This is the brain of TalentConsulting.io — every tool feeds in,
 * and intelligence flows out.
 */

import { getAdminDb } from '@/lib/firebase-admin';

// ── Types ──

export interface SkillIntelligence {
  confirmed: string[];     // From resume
  growing: string[];       // From Skill Bridge progress
  weak: string[];          // From interview debriefs (low confidence categories)
  marketHot: string[];     // From job search / fit analyses
  gap: string[];           // In market demand but missing from resume
}

export interface PipelineIntelligence {
  totalApps: number;
  thisWeekApps: number;
  velocity: number;                 // Apps per week
  responseRate: number;             // % that got responses
  interviewConversion: number;      // % responses → interviews
  offerConversion: number;          // % interviews → offers
  ghostRate: number;                // % never heard back
  topIndustries: string[];          // Most-applied industries
  topCompanies: string[];           // Most-applied companies
  avgDaysToResponse: number;        // Avg days before hearing back
}

export interface InterviewIntelligence {
  totalDebriefs: number;
  passRate: number;
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

export interface MoraleIntelligence {
  current: number;
  trend: 'improving' | 'stable' | 'declining';
  burnoutRisk: 'low' | 'moderate' | 'high';
  history: { week: string; score: number }[];
}

export interface CareerProfile {
  uid: string;
  computedAt: string;
  healthScore: number;         // 0-100 composite score

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
  estimatedWeeksToOffer: number | null;
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
  const healthScore = computeHealthScore(pipeline, interviews, morale, skills, resumes.length);

  // ── Estimated Weeks to Offer ──
  const estimatedWeeksToOffer = pipeline.velocity > 0
    ? Math.max(1, Math.round(40 / pipeline.velocity / Math.max(pipeline.responseRate / 100, 0.1)))
    : null;

  return {
    uid,
    computedAt: new Date().toISOString(),
    healthScore,
    skills,
    pipeline,
    interviews,
    stories: storyIntel,
    morale,
    resumeVersionCount: resumes.length,
    hasResume: resumes.length > 0,
    daysActive,
    estimatedWeeksToOffer,
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
  Object.entries(categoryScores).forEach(([cat, data]) => {
    if (data.count >= 2 && data.total / data.count < 50) {
      weak.add(cat);
    }
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
    growing: [],  // Will be populated when Skill Bridge progress tracking is added
    weak: [...weak],
    marketHot: [...marketHot].slice(0, 15),
    gap: [...gap].slice(0, 10),
  };
}

// ── Pipeline Intelligence ──

function computePipelineIntelligence(apps: any[], now: number): PipelineIntelligence {
  const totalApps = apps.length;
  const oneWeekAgo = now - 7 * 86400000;
  const thisWeekApps = apps.filter(a => getRecordTime(a) > oneWeekAgo).length;

  let responded = 0, interviews = 0, offers = 0, ghosted = 0;
  const companyCounts: Record<string, number> = {};
  const responseTimes: number[] = [];

  apps.forEach(a => {
    const s = (a.status || '').toLowerCase();
    if (s !== 'applied' && s !== 'saved' && s !== 'queued' && s !== 'not_applied') responded++;
    if (s === 'interview' || s === 'interviewing' || s === 'interview_scheduled' || s === 'interviewed') interviews++;
    if (s === 'offer' || s === 'accepted') offers++;
    if (s === 'ghosted' || s === 'no_response' || a.outcome_response === 'ghosted') ghosted++;

    const company = a.company || a.companyName || a.company_name || '';
    if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;

    const respondedAt = a.respondedAt || a.outcome_reported_at;
    const createdAt = a.createdAt || a.created_at || a.appliedAt || a.applied_at;
    if (respondedAt && createdAt) {
      const days = Math.floor((new Date(respondedAt).getTime() - new Date(createdAt).getTime()) / 86400000);
      if (days > 0 && days < 120) responseTimes.push(days);
    }
  });

  // Velocity
  const oldestApp = apps.length > 0 ? apps[apps.length - 1] : null;
  const weeksActive = oldestApp
    ? Math.max(1, Math.ceil((now - getRecordTime(oldestApp)) / (7 * 86400000)))
    : 1;
  const velocity = totalApps > 0 ? Math.round(totalApps / weeksActive) : 0;

  const topCompanies = Object.entries(companyCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  return {
    totalApps,
    thisWeekApps,
    velocity,
    responseRate: totalApps > 0 ? Math.round(responded / totalApps * 100) : 0,
    interviewConversion: responded > 0 ? Math.round(interviews / responded * 100) : 0,
    offerConversion: interviews > 0 ? Math.round(offers / interviews * 100) : 0,
    ghostRate: totalApps > 0 ? Math.round((totalApps - responded) / totalApps * 100) : 0,
    topIndustries: [],
    topCompanies,
    avgDaysToResponse: responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0,
  };
}

// ── Interview Intelligence ──

function computeInterviewIntelligence(debriefs: any[]): InterviewIntelligence {
  const totalDebriefs = debriefs.length;

  if (totalDebriefs === 0) {
    return {
      totalDebriefs: 0, passRate: 0,
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
  if (moraleEntries.length === 0) {
    return { current: 3, trend: 'stable', burnoutRisk: 'low', history: [] };
  }

  const history = moraleEntries
    .map(m => ({ week: m.week, score: m.score }))
    .reverse();

  const current = moraleEntries[0].score || 3;

  // Trend
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (history.length >= 3) {
    const recent = history.slice(-3).reduce((a, h) => a + h.score, 0) / 3;
    const older = history.slice(0, Math.min(3, history.length)).reduce((a, h) => a + h.score, 0) /
      Math.min(3, history.length);
    if (recent > older + 0.5) trend = 'improving';
    else if (recent < older - 0.5) trend = 'declining';
  }

  // Burnout risk
  let burnoutRisk: 'low' | 'moderate' | 'high' = 'low';
  if (current <= 2) burnoutRisk = 'high';
  else if (current <= 3 && trend === 'declining') burnoutRisk = 'moderate';

  return { current, trend, burnoutRisk, history };
}

// ── Health Score (0-100) ──

function computeHealthScore(
  pipeline: PipelineIntelligence,
  interviews: InterviewIntelligence,
  morale: MoraleIntelligence,
  skills: SkillIntelligence,
  resumeCount: number
): number {
  let score = 0;

  // Activity (30 points max)
  // — Are you actively applying?
  score += Math.min(10, pipeline.velocity * 2);             // 5 apps/week = 10 pts
  score += Math.min(10, pipeline.totalApps / 5);             // 50 total = 10 pts
  score += Math.min(5, interviews.totalDebriefs * 2.5);      // 2 debriefs = 5 pts
  score += resumeCount > 0 ? 5 : 0;                          // Has resume = 5 pts

  // Performance (35 points max)
  // — Is your activity converting?
  score += Math.min(10, pipeline.responseRate / 3);           // 30% response = 10 pts
  score += Math.min(10, pipeline.interviewConversion / 5);    // 50% conversion = 10 pts
  score += Math.min(10, interviews.avgConfidence / 8);        // 80% confidence = 10 pts
  score += Math.min(5, interviews.passRate / 20);             // 100% pass = 5 pts

  // Preparedness (20 points max)
  // — Are you building your arsenal?
  score += Math.min(5, skills.confirmed.length / 4);          // 20 skills = 5 pts
  score += Math.min(5, (20 - skills.gap.length * 2));         // Fewer gaps = more pts
  score += Math.min(5, interviews.strongCategories.length * 2.5); // 2 strong categories = 5 pts
  const storyScore = skills.weak.length > 0
    ? Math.max(0, 5 - skills.weak.length) : 5;
  score += storyScore;

  // Wellbeing (15 points max)
  score += Math.min(5, morale.current * 1);                   // 5/5 morale = 5 pts
  score += morale.trend === 'improving' ? 5 : morale.trend === 'stable' ? 3 : 0;
  score += morale.burnoutRisk === 'low' ? 5 : morale.burnoutRisk === 'moderate' ? 2 : 0;

  return Math.min(100, Math.max(0, Math.round(score)));
}
