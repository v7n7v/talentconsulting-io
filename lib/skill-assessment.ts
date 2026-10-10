export const SKILL_ASSESSMENT_VERSION = 'skill-practice-v1';
export function skillAssessmentSummary(attempts: Array<Record<string, any>>, now = Date.now()) {
  const current = attempts.filter(attempt => attempt.assessmentVersion === SKILL_ASSESSMENT_VERSION && typeof attempt.score === 'number' && Number.isFinite(attempt.score) && attempt.score >= 0 && attempt.score <= 100).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
  const latest = current[0] || null;
  const reviewDue = Boolean(latest && now - Date.parse(latest.createdAt) >= 7 * 86400000);
  return { latest, best: current.length ? Math.max(...current.map(attempt=>attempt.score)) : null, reviewDue, verified: Boolean(latest?.challengeType === 'applied_challenge' && latest.score >= 80 && !reviewDue), legacyCount: attempts.length-current.length };
}
