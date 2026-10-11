import { extractSkillsFromDescription, skillAliasesFor } from './job-search-api';

export type OracleVerdict = 'apply' | 'prepare_first' | 'watch' | 'skip';
export type OracleConfidence = 'high' | 'medium' | 'low';
export type SalaryConfidence = 'listed' | 'inferred_from_market' | 'ai_estimate' | 'unknown';
export type OracleRiskCategory = 'role' | 'company' | 'posting' | 'candidate';
export type OracleEvidenceKind = 'stated' | 'inferred' | 'unknown';

export interface OracleSourceSpan {
  source: 'resume' | 'posting';
  start: number;
  end: number;
  text: string;
}

export interface OracleModelEvidence { requirement: string; postingQuote: string; resumeQuote?: string }

export interface OracleRequirementEvidence {
  requirement: string;
  status: 'supported' | 'partial' | 'not_evidenced' | 'needs_clarification';
  evidenceKind: OracleEvidenceKind;
  sourceSpan?: OracleSourceSpan;
  resumeSourceSpan?: OracleSourceSpan;
}
export type OracleReadinessAction =
  | 'resume_edit'
  | 'portfolio_proof'
  | 'interview_prep'
  | 'skill_bridge'
  | 'networking_angle'
  | 'prepare_packet';

export interface OracleSession {
  resumeVersionId?: string | null;
  resumeVersionName?: string;
  resumeText: string;
  jdText?: string;
  jobUrl?: string;
  role?: string;
  company?: string;
  location?: string;
  salaryTarget?: number;
  source?: 'manual' | 'job_search' | 'resume_studio' | 'application_kit';
}

export interface OracleDecision {
  verdict: OracleVerdict;
  confidence: OracleConfidence;
  fitScore: number | null;
  readinessScore: number | null;
  riskScore: number | null;
  salaryConfidence: SalaryConfidence;
  recommendedNextAction: string;
  applyStrategy: 'direct_apply' | 'referral_first' | 'recruiter_outreach' | 'portfolio_proof' | 'skip';
  interviewYield: {
    score: number | null;
    label: 'high_yield' | 'selective' | 'uncertain' | 'low_yield';
    rationale: string;
  };
  summary: string;
}

export interface OracleBreakdown {
  factorScores: {
    qualifications: number | null;
    responsibilities: number | null;
    keywords: number | null;
    titleSeniority: number | null;
    domain: number | null;
    location: number | null;
    salary: number | null;
    risk: number | null;
  };
  coveredRequirements: string[];
  missingRequirements: string[];
  proofGaps: string[];
  keywordMap: {
    found: string[];
    missing: string[];
    overused: string[];
  };
  hiddenScreenSignals: Array<{
    signal: string;
    confidence: OracleConfidence;
    evidence: string;
  }>;
  risks: Array<{
    category: OracleRiskCategory;
    severity: 'low' | 'medium' | 'high';
    title: string;
    explanation: string;
  }>;
  requirementEvidence: OracleRequirementEvidence[];
}

export interface OraclePacketPlan {
  resumeFixes: string[];
  coverLetterThemes: string[];
  linkedinKeywords: string[];
  interviewPrepPrompts: string[];
  trackerDraft: {
    company?: string;
    role?: string;
    status: 'not_applied';
    notes: string;
  };
  readinessMoves: Array<{
    action: OracleReadinessAction;
    title: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
  }>;
}

export interface OracleV2Report {
  analysisId?: string;
  session: Omit<OracleSession, 'resumeText' | 'jdText'> & {
    resumeCharacterCount: number;
    jdCharacterCount: number;
  };
  decision: OracleDecision;
  breakdown: OracleBreakdown;
  packetPlan: OraclePacketPlan;
  sourceQuality: {
    jd: 'full_jd' | 'partial_jd' | 'role_only';
    salary: SalaryConfidence;
    marketData: 'live_jobs' | 'limited_live_jobs' | 'analysis_only';
    analysisScope: 'source_text_review';
    scoringBasis: string;
    evidenceLimits: string;
    salaryContext?: { min: number; max: number; currency: string; period: 'hour' | 'month' | 'year'; sourceSpan: OracleSourceSpan };
  };
  createdAt: string;
}

interface LegacyOracleAnalysis {
  fitScore?: number;
  fitVerdict?: string;
  overallAssessment?: string;
  competitiveEdge?: string;
  resumeSkills?: string[];
  jdRequirements?: string[];
  matchedSkills?: string[];
  gapSkills?: string[];
  keywordsToAdd?: string[];
  salaryIntel?: { min?: number; max?: number; userPosition?: number; withBridgeSkills?: number; currency?: string };
  redFlags?: Array<{ flag: string; severity: 'low' | 'medium' | 'high'; explanation: string }>;
  hiddenRequirements?: Array<{ stated: string; actual: string }>;
  roleLevel?: string;
  // Skill names only — `impact` and `salaryIncrease` were model-estimated numbers
  // with no data behind them, rendered to the user as a fit score and a dollar
  // figure. See app/api/oracle/analyze/route.ts.
  bridgeSkills?: Array<{ skill: string }>;
  industryInsights?: string[];
}

const SKILL_BANK = [
  'JavaScript', 'TypeScript', 'Python', 'React', 'Next.js', 'Node.js', 'SQL', 'AWS', 'Azure', 'GCP',
  'Docker', 'Kubernetes', 'Terraform', 'Machine Learning', 'AI', 'Data Engineering', 'MLOps',
  'Security', 'Compliance', 'Salesforce', 'Tableau', 'Power BI', 'Excel', 'Product Management',
  'Program Management', 'Leadership', 'Stakeholder Management', 'CI/CD', 'REST', 'GraphQL',
];

export function clampOracleScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

export function inferOracleRole(jdText = '', targetRole = '') {
  if (targetRole.trim()) return targetRole.trim().slice(0, 120);
  const lines = jdText.split('\n').map(line => line.trim()).filter(Boolean);
  const explicit = lines.find(line => /^(job\s*)?(title|role|position)\s*[:\-]/i.test(line));
  const first = explicit || lines[0] || 'Target role';
  return first.replace(/^(job\s*)?(title|role|position)\s*[:\-]\s*/i, '').slice(0, 120);
}

export function inferOracleCompany(jdText = '', company = '') {
  if (company.trim()) return company.trim().slice(0, 120);
  const match = jdText.match(/(?:^|\n)\s*(?:company|employer)\s*[:\-]\s*([^\n,\.]{2,80})/i)
    || jdText.match(/(?:^|\s)(?:at|@)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,5})(?=\s+(?:is|seeks|hiring|located|looking)|[,.\n]|$)/);
  return match?.[1]?.trim().slice(0, 120) || '';
}

export function extractSalaryRange(text = ''): { min: number; max: number; currency: string; period: 'hour' | 'month' | 'year'; sourceSpan: OracleSourceSpan } | null {
  // Match on the original text so quoted ranges retain exact offsets.
  const pattern = /(?:(USD|US\$|\$|GBP|£|EUR|€)\s*)?(\d{1,3}(?:,\d{3})+|\d{1,7}(?:\.\d+)?)\s*(k)?\s*(?:-|to|–|—)\s*(?:(USD|US\$|\$|GBP|£|EUR|€)\s*)?(\d{1,3}(?:,\d{3})+|\d{1,7}(?:\.\d+)?)\s*(k)?/gi;
  for (const range of text.matchAll(pattern)) {
    const start = range.index!;
    const before = text.slice(Math.max(0, start - 60), start).split(/[\n;.!?]/).pop() || '';
    const after = text.slice(start + range[0].length, start + range[0].length + 60).split(/[\n;.!?]/)[0];
    const context = `${before} ${after}`;
    if (!/\b(salary|compensation|pay|wage|hourly|annually|annual|monthly)\b|per\s+(year|hour|month)|\/(hr|hour|mo|month|yr|year)\b/i.test(context)) continue;
    if (/^\s*(customers?|users?|employees?|devices?|years?\s+of|units?|transactions?)\b/i.test(after)) continue;
    const currencyToken = range[1] || range[4];
    if (!currencyToken) continue; // Currency cannot be inferred from location or a bare range.
    const currencyOf = (token: string) => /£|GBP/i.test(token) ? 'GBP' : /€|EUR/i.test(token) ? 'EUR' : 'USD';
    if (range[1] && range[4] && currencyOf(range[1]) !== currencyOf(range[4])) continue;
    const period = /hour|hourly|\/hr\b/i.test(context) ? 'hour' : /month|monthly|\/mo\b/i.test(context) ? 'month' : /year|annual|\/yr\b/i.test(context) ? 'year' : null;
    if (!period) continue; // Salary without a pay period remains ambiguous.
    const amount = (value: string, unit: string | undefined) => Number(value.replace(/,/g, '')) * (unit ? 1000 : 1);
    const min = amount(range[2], range[3] || (range[6] && !range[2].includes(',') ? range[6] : undefined));
    const max = amount(range[5], range[6]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) continue;
    return { min, max, currency: currencyOf(currencyToken), period, sourceSpan: { source: 'posting', start, end: start + range[0].length, text: range[0] } };
  }
  return null;
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function exactSpan(text: string, quote: string, source: OracleSourceSpan['source']): OracleSourceSpan | undefined {
  if (!quote.trim()) return undefined;
  const start = text.indexOf(quote);
  return start < 0 ? undefined : { source, start, end: start + quote.length, text: quote };
}
function postingStatement(text: string, quote: string) {
  const span = exactSpan(text, quote, 'posting');
  if (!span) return quote;
  // A provider cannot turn a compound requirement into a covered keyword by quoting only its middle.
  const boundaries = [...text.matchAll(/(?:[.!?](?=\s|$)|\n)/g)].map(hit => hit.index! + hit[0].length);
  const start = boundaries.filter(index => index <= span.start).pop() || 0;
  const end = boundaries.find(index => index >= span.end) ?? text.length;
  return text.slice(start, end).trim();
}
function positiveContext(text: string, start: number, end: number) {
  const before = text.slice(0, start).split(/(?:[.!?](?:\s|$)|[\n;])/).pop() || '';
  const after = text.slice(end).split(/(?:[.!?](?:\s|$)|[\n;])/)[0];
  const context = `${before} ${text.slice(start, end)} ${after}`;
  return !/\b(no|not|never|without|lack(?:s|ed|ing)?|none|neither|unfamiliar|unverified|aspir(?:e|ing)|want\s+to|plan\s+to|learning|beginner|not\s+yet)\b|\b(?:don't|doesn't|didn't|haven't|hasn't|cannot|can't)\b/i.test(context);
}
function skillSpan(text: string, skill: string, source: OracleSourceSpan['source']): OracleSourceSpan | undefined {
  for (const hit of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escapePattern(skill)}(?![\\p{L}\\p{N}_+#])`, 'giu'))) {
    const start = hit.index!;
    if (positiveContext(text, start, start + hit[0].length)) return { source, start, end: start + hit[0].length, text: hit[0] };
  }
  return undefined;
}
// Canonical labels (Go, PostgreSQL) may be written as an alias (Golang, Postgres).
// The returned span quotes what the text actually says.
function skillEvidenceSpan(text: string, skill: string, source: OracleSourceSpan['source']): OracleSourceSpan | undefined {
  const direct = skillSpan(text, skill, source);
  if (direct) return direct;
  for (const alias of skillAliasesFor(skill)) {
    const span = skillSpan(text, alias, source);
    if (span) return span;
  }
  return undefined;
}
export function extractOracleSkills(text = '', candidates: string[] = []) {
  const choices = [...SKILL_BANK, ...extractSkillsFromDescription(text), ...candidates.filter(value => value.length <= 60 && value.split(/\s+/).length <= 5 && !/\d|\b(required|must|experience|no|not)\b/i.test(value))];
  const found = new Map<string, string>();
  for (const skill of choices) if (skill.trim() && skillEvidenceSpan(text, skill, 'resume')) found.set(skill.toLowerCase(), found.get(skill.toLowerCase()) || skill);
  return [...found.values()].slice(0, 50);
}

function simpleSkillRequirement(requirement: string, skills: string[]) {
  return skills.find(skill => {
    const surfaces = [...skillAliasesFor(skill), skill].sort((x, y) => y.length - x.length).map(escapePattern).join('|');
    const remainder = requirement.replace(new RegExp(surfaces, 'gi'), '').replace(/\b(required|requirement|skills?|experience|with|in|knowledge|of|must|have)\b/gi, '').replace(/[\s:.,;!()*-]/g, '');
    return !remainder && !!skillEvidenceSpan(requirement, skill, 'posting');
  });
}

function detectDeterministicRisks(jdText = ''): OracleBreakdown['risks'] {
  const risks: OracleBreakdown['risks'] = [];
  const wording = /fast[\s-]?paced|wear many hats|like a family|rockstar|ninja/gi;
  const phrase = [...jdText.matchAll(wording)].find(hit => positiveContext(jdText, hit.index!, hit.index! + hit[0].length));
  if (phrase) {
    risks.push({ category: 'posting', severity: 'low', title: 'Clarify posting wording', explanation: `The posting says “${phrase[0]}”. Ask about workload, responsibilities and boundaries; this wording alone does not establish company culture.` });
  }
  if (!extractSalaryRange(jdText)) {
    risks.push({ category: 'posting', severity: 'low', title: 'Compensation terms need review', explanation: 'A supported currency, range and pay period could not all be identified. Check the posting or ask the employer; this does not mean pay is absent or below market.' });
  }
  return risks;
}

export function buildOracleV2Report(params: {
  session: OracleSession;
  legacy?: LegacyOracleAnalysis | null;
  modelDecision?: Partial<OracleDecision> & {
    requirementEvidence?: OracleModelEvidence[];
    proofGaps?: string[]; coveredRequirements?: string[]; missingRequirements?: string[];
    coverLetterThemes?: string[]; resumeFixes?: string[]; interviewPrepPrompts?: string[]; linkedinKeywords?: string[];
    hiddenScreenSignals?: OracleBreakdown['hiddenScreenSignals']; readinessMoves?: OraclePacketPlan['readinessMoves'];
  };
  marketDataMode?: OracleV2Report['sourceQuality']['marketData'];
}): OracleV2Report {
  const { session, legacy, modelDecision } = params;
  const jdText = session.jdText || '';
  const resumeText = session.resumeText || '';
  const role = inferOracleRole(jdText, session.role || '');
  const company = inferOracleCompany(jdText, session.company || '');
  const candidateSkills = [...(legacy?.resumeSkills || []), ...(legacy?.matchedSkills || []), ...(legacy?.gapSkills || [])];
  const resumeSkills = extractOracleSkills(resumeText, candidateSkills);
  const jdSkills = extractOracleSkills(jdText, candidateSkills);
  const matchedSkills = jdSkills.filter(skill => resumeSkills.some(item => item.toLowerCase() === skill.toLowerCase()));
  const gapSkills = jdSkills.filter(skill => !matchedSkills.includes(skill));
  const suggestions = modelDecision?.requirementEvidence || [];
  const requirements = [...new Set([
    ...suggestions.map(item => item.postingQuote || item.requirement),
    ...(legacy?.jdRequirements || []),
    ...jdText.split(/\n|(?<=[.!?])\s+/).map(line => line.trim()).filter(line => line && (/\b(required|must|minimum|qualifications?|skills?)\b/i.test(line) || simpleSkillRequirement(line, jdSkills))),
  ].map(value => postingStatement(jdText, value)))].filter(Boolean).slice(0, 50);
  const requirementEvidence: OracleRequirementEvidence[] = requirements.map(requirement => {
    const sourceSpan = exactSpan(jdText, requirement, 'posting');
    const proposal = suggestions.find(item => postingStatement(jdText, item.postingQuote) === requirement);
    const proposedResumeSpan = proposal?.resumeQuote ? exactSpan(resumeText, proposal.resumeQuote, 'resume') : undefined;
    const validResumeSpan = proposedResumeSpan && positiveContext(resumeText, proposedResumeSpan.start, proposedResumeSpan.end) ? proposedResumeSpan : undefined;
    const simpleSkill = sourceSpan && simpleSkillRequirement(requirement, jdSkills);
    const simpleSupport = simpleSkill ? skillEvidenceSpan(resumeText, simpleSkill, 'resume') : undefined;
    // Exact quotes prove that text exists, not semantic entailment. Complex requirements remain review tasks.
    const relatedSkill = sourceSpan && matchedSkills.find(skill => skillEvidenceSpan(requirement, skill, 'posting'));
    const relatedSpan = relatedSkill ? skillEvidenceSpan(resumeText, relatedSkill, 'resume') : undefined;
    const contentWords = (value: string) => value.toLowerCase().match(/[a-z0-9+#]+/g)?.filter(word => word.length > 2 && !['the', 'and', 'with', 'for', 'our', 'you', 'your', 'this', 'that', 'required', 'requirement', 'experience', 'have', 'must'].includes(word)) || [];
    const shared = validResumeSpan ? contentWords(requirement).filter(word => contentWords(validResumeSpan.text).includes(word)) : [];
    const relevantQuote = validResumeSpan && (relatedSkill || new Set(shared).size >= 2) ? validResumeSpan : undefined;
    const resumeSourceSpan = simpleSupport || relevantQuote || relatedSpan;
    const status = !sourceSpan || !positiveContext(jdText, sourceSpan.start, sourceSpan.end) ? 'needs_clarification'
      : simpleSupport ? 'supported' : resumeSourceSpan ? 'partial' : 'not_evidenced';
    return { requirement, status, evidenceKind: sourceSpan ? 'stated' : 'unknown', ...(sourceSpan ? { sourceSpan } : {}), ...(resumeSourceSpan ? { resumeSourceSpan } : {}) };
  });
  const coveredRequirements = requirementEvidence.filter(item => item.status === 'supported').map(item => item.requirement);
  const missingRequirements = requirementEvidence.filter(item => item.status === 'not_evidenced').map(item => item.requirement);
  const proofGaps = requirementEvidence.filter(item => item.status !== 'supported').slice(0, 8).map(item =>
    item.status === 'partial' ? `Review the complete requirement against your evidence: ${item.requirement}`
      : item.status === 'not_evidenced' ? `Evidence was not located for this posting statement; this does not establish a skill gap: ${item.requirement}`
      : `Confirm this proposed requirement against the posting: ${item.requirement}`);
  const fitScore = jdSkills.length ? clampOracleScore(100 * matchedSkills.length / jdSkills.length) : null;
  const verdict: OracleVerdict = matchedSkills.length ? 'prepare_first' : 'watch';
  const summary = jdSkills.length
    ? `${matchedSkills.length} of ${jdSkills.length} identified posting skill terms appear in positive resume context. This is text coverage, not qualification fit. Review the requirement evidence before deciding whether to apply.`
    : 'No grounded posting skill comparison is available. Review the posting and resume evidence before deciding whether to apply.';
  const salaryRange = extractSalaryRange(jdText);
  const salaryConfidence: SalaryConfidence = salaryRange ? 'listed' : 'unknown';
  const risks = detectDeterministicRisks(jdText).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]));
  return {
    session: { resumeVersionId: session.resumeVersionId, resumeVersionName: session.resumeVersionName, jobUrl: session.jobUrl, role, company, location: session.location, salaryTarget: session.salaryTarget, source: session.source, resumeCharacterCount: resumeText.length, jdCharacterCount: jdText.length },
    decision: {
      verdict, confidence: 'low', fitScore, readinessScore: null, riskScore: null, salaryConfidence,
      recommendedNextAction: 'Review the quoted requirements and confirm your evidence before preparing an application.',
      applyStrategy: 'portfolio_proof',
      interviewYield: { score: null, label: 'uncertain', rationale: 'Hiring yield is unknown. No employer outcomes or calibrated prediction model are available.' },
      summary,
    },
    breakdown: {
      factorScores: { qualifications: null, responsibilities: null, keywords: fitScore, titleSeniority: null, domain: null, location: null, salary: null, risk: null },
      coveredRequirements, missingRequirements, proofGaps,
      keywordMap: { found: matchedSkills, missing: gapSkills, overused: [] },
      hiddenScreenSignals: [], risks, requirementEvidence,
    },
    packetPlan: {
      resumeFixes: proofGaps,
      coverLetterThemes: ['Use only accomplishments you can substantiate from your source resume.', 'Review the posting requirements before selecting examples.'],
      linkedinKeywords: matchedSkills,
      interviewPrepPrompts: requirementEvidence.filter(item => item.sourceSpan).slice(0, 5).map(item => `What source-backed example addresses this posting statement: ${item.requirement}?`),
      trackerDraft: { company, role, status: 'not_applied', notes: summary },
      readinessMoves: [{ action: 'resume_edit', title: 'Review source evidence', reason: 'Confirm complete requirements; shared keywords do not establish qualification.', effort: 'medium' }],
    },
    sourceQuality: {
      jd: jdText.trim() ? 'partial_jd' : 'role_only', salary: salaryConfidence, marketData: params.marketDataMode || 'analysis_only',
      analysisScope: 'source_text_review',
      scoringBasis: 'Skill-term coverage only: positive exact-source matches divided by identified positive posting skill terms. Null means unavailable. No qualification, readiness, risk percentage or hiring probability is estimated.',
      evidenceLimits: 'Complete supplied text is reviewed, but posting completeness and semantic qualification are unverified. Model-proposed quotes must occur exactly in their source. Only simple skill statements can be marked supported; complex statements require human review. The requirement inventory may be incomplete. Confidence remains low without independent validation.',
      ...(salaryRange ? { salaryContext: salaryRange } : {}),
    },
    createdAt: new Date().toISOString(),
  };
}
