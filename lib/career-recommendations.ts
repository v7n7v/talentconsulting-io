/**
 * Career Recommendations Engine
 * 
 * Generates actionable, cross-tool insights from the CareerProfile.
 * Each recommendation links to a specific tool for immediate action.
 */

import type { CareerProfile } from './career-graph';

export interface Recommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  icon: string;
  title: string;
  description: string;
  action: string;
  actionPath: string;
  color: string;
  category: 'skill' | 'pipeline' | 'interview' | 'resume' | 'morale' | 'story';
}

export function generateRecommendations(profile: CareerProfile): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Burnout Detection (Critical) ──
  // burnoutRisk is only ever 'high' when a real 1-5 check-in exists, so
  // `current` is non-null here — but assert it rather than interpolating a
  // possible null into "null/5".
  if (profile.morale.burnoutRisk === 'high' && profile.morale.current !== null) {
    recs.push({
      id: 'burnout-risk',
      priority: 'critical',
      icon: 'local_fire_department',
      title: 'Burnout Risk Detected',
      description: `Your morale has been ${profile.morale.trend === 'declining' ? 'declining' : 'low'} (${profile.morale.current}/5). Job searching is a marathon, not a sprint.`,
      action: 'Take a strategic pause — focus on top 3 highest-fit roles only',
      actionPath: '/suite/pulse',
      color: '#ef4444',
      category: 'morale',
    });
  }

  // ── No Resume (Critical) ──
  if (!profile.hasResume) {
    recs.push({
      id: 'no-resume',
      priority: 'critical',
      icon: 'description',
      title: 'Upload Your Resume',
      description: 'Everything starts with your resume. Upload one to unlock all intelligence features.',
      action: 'Go to Resume Studio',
      actionPath: '/suite/resume',
      color: '#f59e0b',
      category: 'resume',
    });
  }

  // ── Ghost Rate Too High ──
  // Gated on applications actually sent, not on records tracked. A record
  // created by a resume morph has never been in front of an employer, so it
  // cannot have been ghosted by one.
  if (profile.pipeline.appliedApps >= 10 && (profile.pipeline.ghostRate ?? 0) > 60) {
    recs.push({
      id: 'high-ghost-rate',
      priority: 'high',
      icon: 'visibility_off',
      // "Ghosted" is a claim the metric cannot support: ghostRate is
      // (sent - responded) / sent, which counts an application sent yesterday
      // alongside one sent in March. Say what was counted.
      title: `${profile.pipeline.ghostRate}% of Applications Have No Reply Yet`,
      description: 'Most of what you have sent has not come back. If the older ones have gone quiet, your resume may not be passing ATS filters.',
      action: 'Run ATS Preview to check parsing',
      actionPath: '/suite/ats-preview',
      color: '#6b7280',
      category: 'pipeline',
    });
  }

  // ── Low Response Rate ──
  if (profile.pipeline.appliedApps >= 10 && profile.pipeline.responseRate !== null && profile.pipeline.responseRate < 15) {
    recs.push({
      id: 'low-response',
      priority: 'high',
      icon: 'mark_email_unread',
      title: `${profile.pipeline.responseRate}% Response Rate Across ${profile.pipeline.appliedApps} Applications`,
      description: 'Try morphing your resume per job description for better keyword matching.',
      action: 'Morph your resume in Resume Studio',
      actionPath: '/suite/resume',
      color: '#ef4444',
      category: 'resume',
    });
  }

  // ── Skill Gaps ──
  if (profile.skills.gap.length >= 3) {
    recs.push({
      id: 'skill-gaps',
      priority: 'high',
      icon: 'school',
      title: `${profile.skills.gap.length} Skill Gaps Detected`,
      description: `Jobs you're targeting need: ${profile.skills.gap.slice(0, 3).join(', ')}. These appear frequently in postings but are missing from your resume.`,
      action: 'Build a learning path with Skill Bridge',
      actionPath: '/suite/skill-bridge',
      color: '#3b82f6',
      category: 'skill',
    });
  }

  // ── Interview Weak Spots ──
  if (profile.interviews.weakCategories.length > 0 && profile.interviews.totalDebriefs >= 2) {
    const weakest = profile.interviews.weakCategories[0];
    recs.push({
      id: 'interview-weakness',
      priority: 'high',
      icon: 'psychology',
      title: `"${weakest.category}" is Your Weakest Interview Area`,
      description: `Avg confidence: ${weakest.avgConfidence}% across ${weakest.count} questions. Focused practice here will have the highest ROI.`,
      action: 'Practice with Interview Simulator',
      actionPath: '/suite/flashcards',
      color: '#8b5cf6',
      category: 'interview',
    });
  }

  // ── Confidence Declining ──
  if (profile.interviews.confidenceTrend === 'declining' && profile.interviews.totalDebriefs >= 4) {
    recs.push({
      id: 'confidence-declining',
      priority: 'high',
      icon: 'trending_down',
      title: 'Interview Confidence is Declining',
      description: 'Your recent interviews show lower confidence than earlier ones. This could signal interview fatigue or escalating difficulty.',
      action: 'Review your debriefs for patterns',
      actionPath: '/suite/interview-debrief',
      color: '#f59e0b',
      category: 'interview',
    });
  }

  // ── Story Coverage Gaps ──
  if (profile.stories.coverageGaps.length > 0) {
    recs.push({
      id: 'story-gaps',
      priority: 'medium',
      icon: 'auto_stories',
      title: `No STAR Stories for "${profile.stories.coverageGaps[0]}"`,
      description: `You're weak on "${profile.stories.coverageGaps[0]}" in interviews but have no prepared stories for it. Build your story bank.`,
      action: 'Create a story with Taco',
      actionPath: '/suite/agent',
      color: '#10b981',
      category: 'story',
    });
  }

  // ── Low Velocity ──
  // No target and no industry median. "Below Target" named a target that
  // exists nowhere in this codebase, and "Active job seekers typically apply to
  // 5-10 jobs per week" was the same uncited claim step 6 deleted from the
  // Weekly Pulse copy. State the user's own number and offer the next action.
  if (profile.pipeline.velocity < 3 && profile.daysActive > 14) {
    recs.push({
      id: 'low-velocity',
      priority: 'medium',
      icon: 'speed',
      title: `${profile.pipeline.velocity} Applications Per Week`,
      description: `Over ${profile.daysActive} days you have sent ${profile.pipeline.appliedApps} ${profile.pipeline.appliedApps === 1 ? 'application' : 'applications'}. More tracked applications give the rest of this page something to measure.`,
      action: 'Find matching jobs in Job Search',
      actionPath: '/suite/job-search',
      color: '#06b6d4',
      category: 'pipeline',
    });
  }

  // ── No Debriefs ──
  if (profile.interviews.totalDebriefs === 0 && profile.pipeline.totalApps >= 5) {
    recs.push({
      id: 'no-debriefs',
      priority: 'medium',
      icon: 'rate_review',
      title: 'Start Logging Interview Debriefs',
      description: 'You have applications in progress but no debriefs. Logging each interview helps Taco identify your patterns.',
      action: 'Log your first debrief',
      actionPath: '/suite/interview-debrief',
      color: '#8b5cf6',
      category: 'interview',
    });
  }

  // ── Morale Improving — Positive Reinforcement ──
  if (profile.morale.trend === 'improving' && (profile.morale.current ?? 0) >= 4) {
    recs.push({
      id: 'morale-great',
      priority: 'low',
      icon: 'celebration',
      title: 'You\'re in Great Shape!',
      description: 'Your morale is up and trending positive. This is the best time to tackle stretch-goal applications.',
      action: 'Check your Career Pulse',
      actionPath: '/suite/pulse',
      color: '#22c55e',
      category: 'morale',
    });
  }

  // ── Confidence Improving — Positive Reinforcement ──
  if (profile.interviews.confidenceTrend === 'improving' && profile.interviews.totalDebriefs >= 3) {
    recs.push({
      id: 'confidence-up',
      priority: 'low',
      icon: 'trending_up',
      title: 'Interview Confidence is Rising!',
      description: `Your confidence is trending up — your practice is paying off. Keep the momentum going.`,
      action: 'View your debrief insights',
      actionPath: '/suite/interview-debrief',
      color: '#22c55e',
      category: 'interview',
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recs;
}

/**
 * Generates a concise text summary for Taco to use in chat.
 */
export function generateProfileSummary(profile: CareerProfile): string {
  const lines: string[] = [];

  lines.push(`## Career Intelligence Summary`);
  lines.push(`Health Score: ${profile.healthScore}/100`);
  lines.push(`Active for ${profile.daysActive} days`);
  lines.push('');

  // Pipeline. Rates are null until they have a denominator — say "not measured"
  // rather than hand Taco a 0% it will quote back as a fact.
  lines.push(`### Pipeline`);
  lines.push(`- ${profile.pipeline.totalApps} tracked, ${profile.pipeline.appliedApps} marked as sent (${profile.pipeline.velocity}/week)`);
  lines.push(`- Response rate: ${profile.pipeline.responseRate === null ? 'not measured — no applications marked as sent' : `${profile.pipeline.responseRate}%`}`);
  lines.push(`- Interview conversion: ${profile.pipeline.interviewConversion === null ? 'not measured — no employer responses yet' : `${profile.pipeline.interviewConversion}%`}`);
  lines.push('');

  // Interviews
  if (profile.interviews.totalDebriefs > 0) {
    lines.push(`### Interviews`);
    // Same rule as the pipeline rates above, and the same trap: a debrief is
    // saved with outcome 'pending' by default and may carry no questions at
    // all, so "0% pass rate" and "0% confidence" from a first debrief are
    // unknowns, not results. Taco quotes these back as facts.
    lines.push(`- ${profile.interviews.totalDebriefs} debriefs logged, ${profile.interviews.resolvedOutcomeCount === 0
      ? 'pass rate not measured — no debrief has a reported outcome yet'
      : `${profile.interviews.passRate}% pass rate across ${profile.interviews.resolvedOutcomeCount} resolved`}`);
    lines.push(`- Avg confidence: ${profile.interviews.questionCount === 0
      ? 'not measured — no questions logged on any debrief'
      : `${profile.interviews.avgConfidence}% (${profile.interviews.confidenceTrend})`}`);
    if (profile.interviews.weakCategories.length > 0) {
      lines.push(`- Weak areas: ${profile.interviews.weakCategories.map(c => `${c.category} (${c.avgConfidence}%)`).join(', ')}`);
    }
    if (profile.interviews.strongCategories.length > 0) {
      lines.push(`- Strong areas: ${profile.interviews.strongCategories.map(c => `${c.category} (${c.avgConfidence}%)`).join(', ')}`);
    }
    lines.push('');
  }

  // Skills
  if (profile.skills.gap.length > 0) {
    lines.push(`### Skill Gaps`);
    lines.push(`- Missing from resume but in-demand: ${profile.skills.gap.join(', ')}`);
    lines.push('');
  }

  // Morale — omitted entirely when the user has never checked in. Taco must not
  // be handed a fabricated default and then quote it back as a fact.
  lines.push(`### Wellbeing`);
  if (profile.morale.current === null) {
    lines.push('- No morale check-ins recorded. Do not assume or estimate how they feel.');
  } else {
    lines.push(`- Morale: ${profile.morale.current}/5 (${profile.morale.trend ?? 'trend unknown'})`);
    lines.push(`- Burnout risk: ${profile.morale.burnoutRisk ?? 'unknown'}`);
  }

  return lines.join('\n');
}
