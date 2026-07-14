import { extractSkillsFromDescription } from './job-search-api';

export type OracleVerdict = 'apply' | 'prepare_first' | 'watch' | 'skip';
export type OracleConfidence = 'high' | 'medium' | 'low';
export type SalaryConfidence = 'listed' | 'inferred_from_market' | 'ai_estimate' | 'unknown';
export type OracleRiskCategory = 'role' | 'company' | 'posting' | 'candidate';
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
  fitScore: number;
  readinessScore: number;
  riskScore: number;
  salaryConfidence: SalaryConfidence;
  recommendedNextAction: string;
  applyStrategy: 'direct_apply' | 'referral_first' | 'recruiter_outreach' | 'portfolio_proof' | 'skip';
  interviewYield: {
    score: number;
    label: 'high_yield' | 'selective' | 'uncertain' | 'low_yield';
    rationale: string;
  };
  summary: string;
}

export interface OracleBreakdown {
  factorScores: {
    qualifications: number;
    responsibilities: number;
    keywords: number;
    titleSeniority: number;
    domain: number;
    location: number;
    salary: number;
    risk: number;
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
  bridgeSkills?: Array<{ skill: string; impact: number; salaryIncrease: number }>;
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
  const match = jdText.match(/(?:company|employer|at|@)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,' ]{2,60})(?:\n|,|\.| is | seeks | hiring|$)/i);
  return match?.[1]?.trim().slice(0, 120) || '';
}

export function extractSalaryRange(text = '') {
  const compact = text.replace(/\s+/g, ' ');
  const range = compact.match(/\$?\s*(\d{2,3})(?:,?000|k)?\s*(?:-|to|–|—)\s*\$?\s*(\d{2,3})(?:,?000|k)/i);
  if (!range) return null;
  const min = Number(range[1]) < 1000 ? Number(range[1]) * 1000 : Number(range[1]);
  const max = Number(range[2]) < 1000 ? Number(range[2]) * 1000 : Number(range[2]);
  if (!min || !max || max < min) return null;
  return { min, max };
}

export function extractOracleSkills(text = '') {
  const fromExtractor = extractSkillsFromDescription(text);
  const inferred = SKILL_BANK.filter(skill => text.toLowerCase().includes(skill.toLowerCase()));
  return [...new Set([...fromExtractor, ...inferred].map(skill => skill.trim()).filter(Boolean))].slice(0, 40);
}

function overlapScore(resumeSkills: string[], jdSkills: string[]) {
  if (jdSkills.length === 0) return 55;
  const resume = resumeSkills.map(skill => skill.toLowerCase());
  const hits = jdSkills.filter(skill => resume.some(item => item.includes(skill.toLowerCase()) || skill.toLowerCase().includes(item))).length;
  return clampOracleScore(35 + (hits / jdSkills.length) * 60);
}

function detectDeterministicRisks(jdText = '', resumeText = ''): OracleBreakdown['risks'] {
  const jd = jdText.toLowerCase();
  const risks: OracleBreakdown['risks'] = [];
  const requirementCount = (jdText.match(/\b(required|must|minimum|experience|years|proficient|expert)\b/gi) || []).length;
  if (requirementCount >= 15) {
    risks.push({ category: 'role', severity: 'high', title: 'Heavy requirement stack', explanation: 'The posting has a dense requirement list, so the application should be selective and proof-heavy.' });
  }
  if (/fast[\s-]?paced|wear many hats|like a family|rockstar|ninja/i.test(jdText)) {
    risks.push({ category: 'company', severity: 'medium', title: 'Culture wording needs caution', explanation: 'The JD uses wording often associated with ambiguous scope, high pace, or boundary risk.' });
  }
  if (!extractSalaryRange(jdText)) {
    risks.push({ category: 'posting', severity: 'low', title: 'No explicit salary range', explanation: 'Compensation is not clearly listed, so salary confidence should stay conservative.' });
  }
  const yearsMatch = jd.match(/(\d+)\+?\s*(?:years|yrs)/);
  if (yearsMatch && resumeText.length < 2500) {
    risks.push({ category: 'candidate', severity: 'medium', title: 'Experience proof may be thin', explanation: `The role references ${yearsMatch[1]}+ years, but the current resume text may not show enough depth.` });
  }
  return risks.slice(0, 8);
}

function verdictFromScores(fitScore: number, readinessScore: number, riskScore: number): OracleVerdict {
  if (fitScore >= 78 && readinessScore >= 70 && riskScore <= 45) return 'apply';
  if (fitScore >= 62 && readinessScore >= 50 && riskScore <= 70) return 'prepare_first';
  if (fitScore >= 45 && riskScore <= 65) return 'watch';
  return 'skip';
}

function labelFromYield(score: number): OracleDecision['interviewYield']['label'] {
  if (score >= 78) return 'high_yield';
  if (score >= 62) return 'selective';
  if (score >= 45) return 'uncertain';
  return 'low_yield';
}

export function buildOracleV2Report(params: {
  session: OracleSession;
  legacy?: LegacyOracleAnalysis | null;
  modelDecision?: Partial<OracleDecision> & {
    proofGaps?: string[];
    coveredRequirements?: string[];
    missingRequirements?: string[];
    coverLetterThemes?: string[];
    resumeFixes?: string[];
    interviewPrepPrompts?: string[];
    linkedinKeywords?: string[];
    hiddenScreenSignals?: OracleBreakdown['hiddenScreenSignals'];
    readinessMoves?: OraclePacketPlan['readinessMoves'];
  };
  marketDataMode?: OracleV2Report['sourceQuality']['marketData'];
}): OracleV2Report {
  const { session, legacy, modelDecision } = params;
  const jdText = session.jdText || '';
  const resumeText = session.resumeText || '';
  const role = inferOracleRole(jdText, session.role || '');
  const company = inferOracleCompany(jdText, session.company || '');
  const resumeSkills = legacy?.resumeSkills?.length ? legacy.resumeSkills : extractOracleSkills(resumeText);
  const jdSkills = extractOracleSkills(jdText);
  const matchedSkills = legacy?.matchedSkills?.length ? legacy.matchedSkills : jdSkills.filter(skill => resumeSkills.some(resumeSkill => resumeSkill.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(resumeSkill.toLowerCase())));
  const gapSkills = legacy?.gapSkills?.length ? legacy.gapSkills : jdSkills.filter(skill => !matchedSkills.includes(skill));
  const salaryRange = extractSalaryRange(jdText);

  const keywordScore = overlapScore(resumeSkills, jdSkills);
  const fitScore = clampOracleScore(legacy?.fitScore ?? modelDecision?.fitScore ?? keywordScore);
  const proofGapCount = modelDecision?.proofGaps?.length ?? Math.min(6, gapSkills.length + (fitScore < 70 ? 2 : 0));
  const readinessScore = clampOracleScore(modelDecision?.readinessScore ?? fitScore - proofGapCount * 4 + (matchedSkills.length >= 5 ? 8 : 0));
  const deterministicRisks = detectDeterministicRisks(jdText, resumeText);
  const aiRisks = (legacy?.redFlags || []).map(risk => ({
    category: 'role' as OracleRiskCategory,
    severity: risk.severity,
    title: risk.flag,
    explanation: risk.explanation,
  }));
  const risks = [...aiRisks, ...deterministicRisks].slice(0, 8);
  const highRiskCount = risks.filter(risk => risk.severity === 'high').length;
  const mediumRiskCount = risks.filter(risk => risk.severity === 'medium').length;
  const riskScore = clampOracleScore(modelDecision?.riskScore ?? highRiskCount * 28 + mediumRiskCount * 14 + risks.length * 4);
  const verdict = modelDecision?.verdict || verdictFromScores(fitScore, readinessScore, riskScore);
  const confidence: OracleConfidence = modelDecision?.confidence || (jdText.length > 1200 && resumeText.length > 1200 ? 'high' : jdText.length > 400 ? 'medium' : 'low');
  const salaryConfidence: SalaryConfidence = salaryRange ? 'listed' : legacy?.salaryIntel?.min ? 'ai_estimate' : 'unknown';
  const interviewYieldScore = clampOracleScore(modelDecision?.interviewYield?.score ?? fitScore * 0.55 + readinessScore * 0.3 + (100 - riskScore) * 0.15);

  const missingRequirements = modelDecision?.missingRequirements?.length
    ? modelDecision.missingRequirements
    : (legacy?.jdRequirements || gapSkills).slice(0, 8);
  const coveredRequirements = modelDecision?.coveredRequirements?.length
    ? modelDecision.coveredRequirements
    : (legacy?.jdRequirements?.filter(req => matchedSkills.some(skill => req.toLowerCase().includes(skill.toLowerCase()))) || matchedSkills).slice(0, 8);
  const proofGaps = modelDecision?.proofGaps?.length
    ? modelDecision.proofGaps
    : [
        ...gapSkills.slice(0, 4).map(skill => `Show evidence for ${skill} or decide whether to avoid claiming it.`),
        ...(fitScore < 70 ? ['Add one measurable achievement that maps directly to the highest-priority requirement.'] : []),
      ].slice(0, 6);

  const summary = modelDecision?.summary ||
    (verdict === 'apply'
      ? 'This role is worth a focused application. The resume already shows enough alignment; prepare the packet and apply with proof.'
      : verdict === 'prepare_first'
        ? 'This role has enough upside to pursue, but the resume should be tightened before applying.'
        : verdict === 'watch'
          ? 'This is a possible target, but the current evidence is not strong enough to prioritize over better-fit roles.'
          : 'This role is likely low yield right now. Save energy unless there is a referral, strategic company interest, or missing context.');

  return {
    session: {
      resumeVersionId: session.resumeVersionId,
      resumeVersionName: session.resumeVersionName,
      jobUrl: session.jobUrl,
      role,
      company,
      location: session.location,
      salaryTarget: session.salaryTarget,
      source: session.source,
      resumeCharacterCount: resumeText.length,
      jdCharacterCount: jdText.length,
    },
    decision: {
      verdict,
      confidence,
      fitScore,
      readinessScore,
      riskScore,
      salaryConfidence,
      recommendedNextAction: modelDecision?.recommendedNextAction || (
        verdict === 'apply' ? 'Prepare the application packet and review it before applying.' :
        verdict === 'prepare_first' ? 'Fix the proof gaps, then generate the resume and cover letter packet.' :
        verdict === 'watch' ? 'Save this role and compare it against stronger opportunities.' :
        'Skip for now unless a referral changes the odds.'
      ),
      applyStrategy: modelDecision?.applyStrategy || (riskScore > 55 ? 'referral_first' : readinessScore < 65 ? 'portfolio_proof' : 'direct_apply'),
      interviewYield: {
        score: interviewYieldScore,
        label: modelDecision?.interviewYield?.label || labelFromYield(interviewYieldScore),
        rationale: modelDecision?.interviewYield?.rationale || 'Yield blends fit, proof strength, posting risk, salary clarity, and packet readiness.',
      },
      summary,
    },
    breakdown: {
      factorScores: {
        qualifications: clampOracleScore(modelDecision?.fitScore ?? keywordScore),
        responsibilities: clampOracleScore(fitScore - (gapSkills.length > 4 ? 8 : 0)),
        keywords: keywordScore,
        titleSeniority: clampOracleScore(role.toLowerCase().includes('senior') && resumeText.toLowerCase().includes('senior') ? 82 : fitScore - 4),
        domain: clampOracleScore(fitScore - 2),
        location: session.location ? 82 : 68,
        salary: salaryConfidence === 'listed' ? 86 : salaryConfidence === 'ai_estimate' ? 58 : 40,
        risk: clampOracleScore(100 - riskScore),
      },
      coveredRequirements,
      missingRequirements,
      proofGaps,
      keywordMap: {
        found: matchedSkills.slice(0, 14),
        missing: [...new Set([...(legacy?.keywordsToAdd || []), ...gapSkills])].slice(0, 14),
        overused: [],
      },
      hiddenScreenSignals: modelDecision?.hiddenScreenSignals?.length
        ? modelDecision.hiddenScreenSignals
        : (legacy?.hiddenRequirements || []).map(item => ({ signal: item.actual, confidence: 'medium' as OracleConfidence, evidence: item.stated })).slice(0, 6),
      risks,
    },
    packetPlan: {
      resumeFixes: modelDecision?.resumeFixes?.length
        ? modelDecision.resumeFixes
        : proofGaps.slice(0, 5),
      coverLetterThemes: modelDecision?.coverLetterThemes?.length
        ? modelDecision.coverLetterThemes
        : [
            legacy?.competitiveEdge || 'Lead with the strongest role-relevant proof from the resume.',
            `Connect the candidate's background to ${role}.`,
            'Address the top gap without overclaiming.',
          ].filter(Boolean).slice(0, 4),
      linkedinKeywords: modelDecision?.linkedinKeywords?.length
        ? modelDecision.linkedinKeywords
        : [...new Set([...matchedSkills, ...gapSkills])].slice(0, 10),
      interviewPrepPrompts: modelDecision?.interviewPrepPrompts?.length
        ? modelDecision.interviewPrepPrompts
        : [
            `Tell me about a project that proves you can succeed as ${role}.`,
            `How would you handle the highest-risk gap in this JD?`,
            'Walk through a measurable result that maps to this role.',
          ],
      trackerDraft: {
        company,
        role,
        status: 'not_applied',
        notes: summary,
      },
      readinessMoves: modelDecision?.readinessMoves?.length
        ? modelDecision.readinessMoves
        : [
            { action: 'resume_edit', title: 'Tighten resume proof', reason: 'Close the highest-impact coverage gaps before applying.', effort: 'medium' },
            { action: 'prepare_packet', title: 'Generate packet', reason: 'Create the resume, cover letter, and ATS review from the same context.', effort: 'low' },
            ...(riskScore > 45 ? [{ action: 'networking_angle' as OracleReadinessAction, title: 'Find a warmer path', reason: 'Risk signals suggest a referral or recruiter note could improve odds.', effort: 'medium' as const }] : []),
          ],
    },
    sourceQuality: {
      jd: jdText.length > 1200 ? 'full_jd' : jdText.length > 200 ? 'partial_jd' : 'role_only',
      salary: salaryConfidence,
      marketData: params.marketDataMode || 'analysis_only',
    },
    createdAt: new Date().toISOString(),
  };
}

