/** Compatibility normalization for all application writers. Missing dates stay missing. */
export function recordDate(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return recordDate(value.toDate());
  }
  if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date) || value === '') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function normalizeApplicationRecord(record: Record<string, any>, id?: string): Record<string, any> {
  const text = (...values: unknown[]) => values.find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const date = (...values: unknown[]) => values.map(recordDate).find(Boolean);
  const rawStatus = String(record.status || '').trim().toLowerCase().replace(/[ -]/g, '_');
  const statusAliases: Record<string, string> = { submitted: 'applied', interviewing: 'interview_scheduled', interview: 'interview_scheduled', callback: 'screening', declined: 'rejected' };
  const status = statusAliases[rawStatus] || rawStatus || 'not_applied';
  const created = date(record.created_at, record.createdAt, record.morphed_at);
  const updated = date(record.last_updated, record.updatedAt, record.updated_at, created);
  const applied = date(record.applied_at, record.appliedAt, record.submitted_at);
  const interview = date(record.interview_date, record.interviewDate);
  const company = text(record.company_name, record.companyName, record.company) || '';
  const role = text(record.job_title, record.jobTitle, record.role) || '';
  return { ...record, id: id || record.id, status,
    company_name: company, companyName: company, company,
    job_title: role, jobTitle: role, role,
    created_at: created, createdAt: created,
    last_updated: updated, updatedAt: updated,
    applied_at: applied, appliedAt: applied,
    interview_date: interview, interviewDate: interview,
  };
}

export function applicationWasSubmitted(record: Record<string, any>): boolean {
  const status = normalizeApplicationRecord(record).status;
  return ['applied', 'screening', 'interview_scheduled', 'interviewed', 'offer', 'rejected', 'accepted', 'withdrawn', 'ghosted', 'no_response'].includes(status);
}

export function applicationReachedInterview(record: Record<string, any>): boolean {
  const normalized = normalizeApplicationRecord(record);
  return ['interview_scheduled', 'interviewed', 'offer', 'accepted'].includes(normalized.status)
    || applicationReachedOffer(record)
    || Number(record.interview_rounds || 0) > 0
    || record.outcome_response === 'interview' || record.outcome_response === 'offer'
    || (Array.isArray(record.outcome_history) && record.outcome_history.some((event: any) => ['interview', 'offer'].includes(event.outcome)));
}

export function applicationReachedOffer(record: Record<string, any>): boolean {
  return ['offer', 'accepted'].includes(normalizeApplicationRecord(record).status)
    || (Array.isArray(record.offer_history) && record.offer_history.some((event: any) => ['accepted', 'declined'].includes(event.decision)))
    || record.outcome_response === 'offer'
    || (Array.isArray(record.outcome_history) && record.outcome_history.some((event: any) => event.outcome === 'offer'));
}

export function computeApplicationMetrics(records: Record<string, any>[], queue: Record<string, any>[], now = Date.now()) {
  const normalized = records.map(record => normalizeApplicationRecord(record));
  const submitted = normalized.filter(applicationWasSubmitted);
  const scores = submitted.map(record => record.ats_score ?? record.talent_density_score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100);
  // A linked document is observable; it does not establish that the submitted document was tailored.
  const linked = submitted.filter(record => !!record.resume_version_id).length;
  const interviewing = submitted.filter(applicationReachedInterview).length;
  const offers = submitted.filter(applicationReachedOffer).length;
  return {
    avgFitScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    scoredCount: scores.length, totalApplications: submitted.length, totalTracked: normalized.length,
    tailoredCount: linked, genericCount: submitted.length - linked,
    tailoredRatio: submitted.length ? Math.round(linked / submitted.length * 100) : null,
    linkageMeaning: 'Saved resume linked; tailoring and the externally submitted file are not verified.',
    pipeline: { applied: submitted.length, interviewing, offer: offers,
      rejected: submitted.filter(record => record.status === 'rejected').length },
    interviewYield: submitted.length ? Math.round(interviewing / submitted.length * 100) : null,
    weeklyVelocity: submitted.filter(record => record.applied_at && Date.parse(record.applied_at) > now - 7 * 86400000 && Date.parse(record.applied_at) <= now).length,
    unknownSubmissionDates: submitted.filter(record => !record.applied_at).length,
    queueSize: queue.filter(record => ['pending', 'approved'].includes(record.status)).length,
    recentActivity: [...normalized].sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')).slice(0, 5)
      .map(record => ({ company: record.company || 'Company not recorded', role: record.role || 'Role not recorded', status: record.status, date: record.updatedAt || '' })),
    cohort: 'Recorded submitted applications; drafts excluded. Weekly count uses recorded submission dates.',
  };
}
