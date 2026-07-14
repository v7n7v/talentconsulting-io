export type HarnessRemotePreference = 'remote' | 'hybrid' | 'onsite' | 'any';

export interface HarnessEvidenceGoal {
  targetRole: string;
  location: string;
  salaryTarget: number;
  remotePreference: HarnessRemotePreference | string;
}

export interface HarnessEvidenceJob {
  title: string;
  company: string;
  location: string;
  url?: string;
  description?: string;
  employmentType?: string;
  postedDate?: string;
  sourceMeta?: unknown;
  remoteMode?: string;
  salary?: { min?: number | null; max?: number | null };
  matchScore?: number | null;
  fitScore?: { overall?: number | null } | null;
  packetStatus?: string;
  fitReasons?: string[];
  riskNotes?: string[];
  sourceNotes?: string[];
  recommendationReason?: string;
}

export interface HarnessQueueEvidence {
  score: number;
  reason: string;
  fitSignals: string[];
  riskSignals: string[];
  sourceNotes: string[];
  nextAction: string;
}

export interface HarnessQueuedResultItem {
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
}

export interface HarnessQueueRecordParams {
  uid: string;
  job: HarnessEvidenceJob;
  goal: HarnessEvidenceGoal;
  evidence: HarnessQueueEvidence;
  canPrepareAssets: boolean;
  mode: string;
  runId: string;
  batchDate: string;
  createdAt: string;
  expiresAt: string;
  morphedResume: unknown;
  morphEffectivePercentage: number | null;
  morphGuardrailReport: unknown;
  coverLetter: string;
  resumeVersionId: string | null;
  sourceResumeId: string | null;
  sourceResumeType: string | null;
  sourceResumeHash: string | null;
  atsScore: number | null;
  keywordGaps: string[];
}

export interface HarnessChatSummaryResult {
  success: boolean;
  queuedCount: number;
  needsResume?: boolean;
  needsTargetBrief?: boolean;
  missingTargetFields?: string[];
  error?: string;
  goal: HarnessEvidenceGoal;
  queued: HarnessQueuedResultItem[];
  nextActions: string[];
}

function uniqueLimited(values: Array<string | false | null | undefined>, limit: number) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))).slice(0, limit);
}

function salaryTargetLabel(value = 0) {
  return `$${Math.round(value / 1000)}k`;
}

export function buildHarnessQueueEvidence({
  job,
  goal,
  canPrepareAssets,
  keywordGaps = [],
}: {
  job: HarnessEvidenceJob;
  goal: HarnessEvidenceGoal;
  canPrepareAssets: boolean;
  keywordGaps?: string[];
}): HarnessQueueEvidence {
  const score = Math.round(job.fitScore?.overall || job.matchScore || 0);
  const reason = job.recommendationReason || 'Sona ranked this role against your career goal.';
  const salary = job.salary || {};
  const riskSignals = uniqueLimited([
    ...(job.riskNotes || []),
    !job.url ? 'No direct application URL was available.' : null,
    goal.remotePreference !== 'any' && job.remoteMode === 'unknown'
      ? `Remote mode was not explicit. User asked for ${goal.remotePreference}.`
      : null,
    goal.salaryTarget && !salary.min && !salary.max
      ? `Salary was not listed. User target is ${salaryTargetLabel(goal.salaryTarget)}.`
      : null,
    !canPrepareAssets ? 'Upgrade to Talent Max to prepare tailored resume and cover letter drafts.' : null,
    keywordGaps.length ? `${keywordGaps.length} ATS keyword gaps remain for review.` : null,
  ], 8);
  const sourceNotes = uniqueLimited(job.sourceNotes || [], 4);
  const fitSignals = uniqueLimited([
    ...(job.fitReasons || []),
    reason,
    `${score}% fit against ${goal.targetRole}.`,
    goal.salaryTarget ? `Salary target: ${salaryTargetLabel(goal.salaryTarget)}.` : 'No salary floor set.',
    `Location target: ${goal.location}, ${goal.remotePreference}.`,
    ...sourceNotes,
  ], 9);

  return {
    score,
    reason,
    fitSignals,
    riskSignals,
    sourceNotes,
    nextAction: canPrepareAssets ? 'Review prepared packet' : 'Review role fit',
  };
}

export function buildHarnessQueuedResultItem({
  queueId,
  job,
  evidence,
  canPrepareAssets,
  resumeVersionId,
}: {
  queueId: string;
  job: HarnessEvidenceJob;
  evidence: HarnessQueueEvidence;
  canPrepareAssets: boolean;
  resumeVersionId: string | null;
}): HarnessQueuedResultItem {
  return {
    queueId,
    title: job.title,
    company: job.company,
    location: job.location,
    matchScore: evidence.score,
    packetStatus: canPrepareAssets ? 'prepared' : 'needs_review',
    resumeVersionId,
    applicationUrl: job.url || '',
    fitSignals: evidence.fitSignals,
    riskSignals: evidence.riskSignals,
    sourceNotes: evidence.sourceNotes,
    nextAction: evidence.nextAction,
  };
}

export function buildHarnessQueueRecord({
  uid,
  job,
  goal,
  evidence,
  canPrepareAssets,
  mode,
  runId,
  batchDate,
  createdAt,
  expiresAt,
  morphedResume,
  morphEffectivePercentage,
  morphGuardrailReport,
  coverLetter,
  resumeVersionId,
  sourceResumeId,
  sourceResumeType,
  sourceResumeHash,
  atsScore,
  keywordGaps,
}: HarnessQueueRecordParams) {
  return {
    user_id: uid,
    job_title: job.title,
    company: job.company,
    location: job.location,
    job_url: job.url || '',
    job_description: job.description?.slice(0, 3000) || '',
    salary: { min: job.salary?.min ?? null, max: job.salary?.max ?? null },
    employment_type: job.employmentType || 'Full-time',
    posted_date: job.postedDate || createdAt,
    match_score: evidence.score,
    match_reason: evidence.reason,
    morphed_resume: morphedResume,
    morph_effective_percentage: morphEffectivePercentage,
    morph_guardrail_report: morphGuardrailReport,
    cover_letter: coverLetter,
    resume_version_id: resumeVersionId,
    source_resume_id: sourceResumeId,
    source_resume_type: sourceResumeType,
    source_resume_hash: sourceResumeHash,
    status: 'pending',
    source: 'sona_chat',
    packetStatus: canPrepareAssets ? 'prepared' : 'needs_review',
    fitSignals: evidence.fitSignals,
    riskSignals: evidence.riskSignals,
    nextAction: canPrepareAssets
      ? 'Review Sona’s tailored resume, cover letter, and job link before applying manually.'
      : 'Review the role. Upgrade to Max when you want Sona to prepare the full packet.',
    feedbackTags: [],
    agentRunId: runId,
    autonomyLevel: mode,
    created_at: createdAt,
    expires_at: expiresAt,
    batch_id: runId,
    batch_date: batchDate,
    sourceMeta: job.sourceMeta,
    ats_score: atsScore,
    keyword_gaps: keywordGaps,
    goal,
  };
}

export function formatHarnessResultForChat(result: HarnessChatSummaryResult) {
  if (result.needsResume) {
    return [
      'I need a verified resume before I can scout roles for you.',
      '',
      'Next:',
      '- Upload or select the resume you want Sona to use.',
      '- Keep the target role, salary, location and work mode filled in.',
      '- I will use that resume as the source of truth and queue roles for review.',
    ].join('\n');
  }

  if (result.needsTargetBrief) {
    const missing = result.missingTargetFields?.length
      ? result.missingTargetFields.join(' and ')
      : 'target role and location';
    return [
      `I need your ${missing} before I use a scout run.`,
      '',
      'Next:',
      '- Complete the target brief below.',
      '- Salary is optional. Choose a work mode only when it matters to your search.',
      '- I will use the confirmed details instead of guessing a market or role.',
    ].join('\n');
  }

  if (!result.success && result.error) {
    return [
      result.error,
      '',
      'Next:',
      ...result.nextActions.map(action => `- ${action}`),
    ].join('\n');
  }

  const targetLines = [
    `- Role: ${result.goal.targetRole}`,
    `- Location: ${result.goal.location}`,
    `- Work mode: ${result.goal.remotePreference}`,
    result.goal.salaryTarget ? `- Salary target: ${salaryTargetLabel(result.goal.salaryTarget)}` : '',
  ].filter(Boolean);

  if (result.queuedCount > 0) {
    const incompletePackets = result.queued.filter(job => job.packetStatus !== 'prepared').length;
    const picks = result.queued.slice(0, 3).map(job =>
      `- ${job.title} at ${job.company} — ${job.matchScore}% fit${job.fitSignals?.[0] ? `. ${job.fitSignals[0]}` : ''}`
    );
    return [
      `I queued ${result.queuedCount} role${result.queuedCount === 1 ? '' : 's'} for review.`,
      '',
      'Target:',
      ...targetLines,
      '',
      'Top picks:',
      ...picks,
      '',
      'Next:',
      '- Open Agent Queue and review each role before applying.',
      incompletePackets
        ? `- ${incompletePackets} role${incompletePackets === 1 ? '' : 's'} still need packet preparation or source review.`
        : '- Check the resume, cover letter, salary and job link before using any packet.',
      '- I will not submit, email or text anyone without your approval.',
    ].join('\n');
  }

  return [
    'I ran the scout, but I did not find a strong enough match yet.',
    '',
    'Target:',
    ...targetLines,
    '',
    'Next:',
    ...result.nextActions.map(action => `- ${action}`),
  ].join('\n');
}
