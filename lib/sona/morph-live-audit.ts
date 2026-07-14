import { createHash } from 'crypto';
import {
  isCurrentResumeMorphGuardrailReport,
  resolveResumeMorphAccess,
} from '@/lib/resume-morph-guardrails';
import {
  generateGuardedMorphDraft,
  type MorphJSONCompletion,
} from '@/lib/sona/morph-draft-generation';
export {
  generateGuardedMorphDraft,
  prioritizeVerifiedResumeEvidence,
} from '@/lib/sona/morph-draft-generation';

interface LiveMorphAuditCase {
  id: string;
  resume: Record<string, any>;
  jobTitle: string;
  company: string;
  jobDescription: string;
}

export interface LiveMorphAuditCaseResult {
  id: string;
  success: boolean;
  safe: boolean;
  useful: boolean;
  blockedChangeCount: number;
  sourceTruthHash: string | null;
  guardedTruthHash: string | null;
  relevanceDelta: number;
  generatedHash: string | null;
  guardedHash: string | null;
  error: string | null;
}

export interface LiveMorphAuditReport {
  version: 1;
  generatedAt: string;
  provider: 'groq';
  caseCount: number;
  successfulCases: number;
  safeCases: number;
  usefulCases: number;
  regressedCases: number;
  blockedChangeCount: number;
  truthPassed: boolean;
  utilityPassed: boolean;
  releaseReady: boolean;
  cases: LiveMorphAuditCaseResult[];
}

function resumeFixture(input: {
  title: string;
  summary: string;
  skills: string[];
  role: string;
  company: string;
  bullets: string[];
  degree: string;
}) {
  return {
    name: 'Jordan Rivera',
    title: input.title,
    email: 'jordan@example.com',
    phone: '555-0142',
    location: 'Newark, NJ',
    summary: input.summary,
    skills: input.skills,
    experience: [{
      company: input.company,
      role: input.role,
      duration: '2021-2025',
      location: 'Newark, NJ',
      bullets: input.bullets,
    }],
    education: [{ degree: input.degree, institution: 'Garden State University', year: '2021' }],
    certifications: [],
  };
}

const securityResume = resumeFixture({
  title: 'Security Analyst',
  summary: 'Security analyst focused on incident response. Communicates investigation findings clearly.',
  skills: ['Incident Response', 'NIST', 'Network Analysis', 'LTE'],
  role: 'Security Analyst',
  company: 'Verified Systems',
  bullets: [
    'Reviewed network alerts and escalated confirmed incidents.',
    'Documented investigation findings for technical and business teams.',
    'Maintained NIST-aligned incident response runbooks.',
    'Analyzed LTE network behavior during service investigations.',
  ],
  degree: 'B.S. Information Systems',
});

const productResume = resumeFixture({
  title: 'Product Operations Manager',
  summary: 'Product operator who turns customer evidence into delivery priorities. Keeps cross-functional launches organized.',
  skills: ['Product Operations', 'Customer Research', 'Roadmapping', 'SQL'],
  role: 'Product Operations Manager',
  company: 'Northstar Software',
  bullets: [
    'Synthesized customer research for quarterly roadmap reviews.',
    'Coordinated launch plans across product sales and support teams.',
    'Used SQL to investigate adoption patterns for product decisions.',
    'Maintained release readiness notes and decision records.',
  ],
  degree: 'B.A. Business Administration',
});

const operationsResume = resumeFixture({
  title: 'Operations Lead',
  summary: 'Operations lead experienced in process documentation. Builds dependable handoffs across service teams.',
  skills: ['Process Improvement', 'Vendor Operations', 'Service Delivery', 'Reporting'],
  role: 'Operations Lead',
  company: 'Metro Services',
  bullets: [
    'Documented service workflows and ownership handoffs.',
    'Reviewed vendor performance with operations stakeholders.',
    'Prepared weekly delivery reports for leadership review.',
    'Coordinated issue resolution across regional service teams.',
  ],
  degree: 'B.S. Operations Management',
});

const dataResume = resumeFixture({
  title: 'Data Analyst',
  summary: 'Data analyst who makes operational questions measurable. Explains findings to non-technical partners.',
  skills: ['SQL', 'Python', 'Dashboarding', 'Data Quality'],
  role: 'Data Analyst',
  company: 'Civic Analytics',
  bullets: [
    'Built SQL analyses for service delivery questions.',
    'Used Python to validate recurring data quality checks.',
    'Created dashboards for operational review meetings.',
    'Explained analytical findings to non-technical partners.',
  ],
  degree: 'B.S. Data Science',
});

function targets(prefix: string, resume: Record<string, any>, roles: Array<[string, string]>) {
  return roles.map(([jobTitle, jobDescription], index): LiveMorphAuditCase => ({
    id: `${prefix}-${index + 1}`,
    resume,
    jobTitle,
    company: ['Atlas', 'Beacon', 'Crescent', 'Dover', 'Evergreen'][index],
    jobDescription,
  }));
}

export const LIVE_MORPH_AUDIT_CASES: LiveMorphAuditCase[] = [
  ...targets('security', securityResume, [
    ['Incident Response Analyst', 'Prioritize incident response, alert review, escalation, and NIST runbooks.'],
    ['Network Security Analyst', 'Prioritize network analysis, LTE behavior, investigation findings, and incident documentation.'],
    ['Security Operations Analyst', 'Prioritize security operations, technical communication, alerts, and incident response.'],
    ['Cybersecurity Analyst', 'Prioritize NIST, network investigations, runbooks, and business communication.'],
    ['Telecommunications Security Analyst', 'Prioritize LTE network behavior, service investigations, and security incident escalation.'],
  ]),
  ...targets('product', productResume, [
    ['Product Operations Lead', 'Prioritize launch coordination, release readiness, decision records, and product operations.'],
    ['Customer Insights Manager', 'Prioritize customer research, adoption patterns, and roadmap decisions.'],
    ['Product Analyst', 'Prioritize SQL, adoption analysis, customer evidence, and product decisions.'],
    ['Launch Operations Manager', 'Prioritize cross-functional launches, sales, support, and release readiness.'],
    ['Roadmap Operations Manager', 'Prioritize quarterly roadmap reviews, customer research, and decision records.'],
  ]),
  ...targets('operations', operationsResume, [
    ['Service Delivery Manager', 'Prioritize service delivery, regional teams, issue resolution, and dependable handoffs.'],
    ['Vendor Operations Manager', 'Prioritize vendor performance, operations stakeholders, reporting, and service workflows.'],
    ['Process Improvement Lead', 'Prioritize process documentation, ownership handoffs, and service workflow improvement.'],
    ['Operations Reporting Lead', 'Prioritize weekly delivery reports, leadership review, and operational performance.'],
    ['Regional Operations Lead', 'Prioritize regional service teams, issue resolution, and delivery coordination.'],
  ]),
  ...targets('data', dataResume, [
    ['SQL Data Analyst', 'Prioritize SQL analysis, service delivery questions, and operational decision support.'],
    ['Data Quality Analyst', 'Prioritize Python, recurring data quality checks, and analytical validation.'],
    ['Business Intelligence Analyst', 'Prioritize dashboards, operational review meetings, and stakeholder communication.'],
    ['Operations Data Analyst', 'Prioritize measurable operational questions, SQL, and delivery analysis.'],
    ['Analytics Communications Specialist', 'Prioritize explaining findings to non-technical partners and dashboard review.'],
  ]),
];

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const PRESENTATION_KEYS = new Set([
  'template',
  'templateId',
  'layout',
  'sectionOrder',
  'theme',
  'colorway',
  'fontFamily',
]);

const RELEVANCE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'of', 'on', 'or', 'the', 'to', 'with', 'who', 'into', 'across', 'prioritize',
]);

function normalizedEvidenceUnits(value: string) {
  return value
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(item => item.toLowerCase().replace(/[^a-z0-9+#.-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort();
}

function canonicalTruthValue(value: unknown, key = ''): unknown {
  if (PRESENTATION_KEYS.has(key)) return undefined;
  if (typeof value === 'string') return normalizedEvidenceUnits(value);
  if (Array.isArray(value)) {
    const normalized = value.map(item => canonicalTruthValue(item));
    return value.every(item => typeof item === 'string')
      ? normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
      : normalized;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([field]) => !PRESENTATION_KEYS.has(field))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, item]) => [field, canonicalTruthValue(item, field)]),
    );
  }
  return value;
}

export function resumeTruthFingerprint(resume: unknown) {
  return hash(canonicalTruthValue(resume));
}

function relevanceTokens(value: string) {
  return new Set(
    (value.toLowerCase().match(/[a-z0-9+#.-]+/g) || [])
      .filter(token => token.length > 2 && !RELEVANCE_STOP_WORDS.has(token)),
  );
}

function orderedEvidence(resume: Record<string, any>) {
  const evidence: string[] = [];
  if (typeof resume.summary === 'string') {
    evidence.push(...resume.summary.split(/(?<=[.!?])\s+/).filter(Boolean));
  }
  for (const experience of Array.isArray(resume.experience) ? resume.experience : []) {
    for (const key of ['bullets', 'achievements', 'responsibilities']) {
      if (Array.isArray(experience?.[key])) {
        evidence.push(...experience[key].filter((item: unknown) => typeof item === 'string'));
      }
    }
  }
  return evidence;
}

export function resumeRelevanceScore(resume: Record<string, any>, target: string) {
  const targetTokens = relevanceTokens(target);
  const evidence = orderedEvidence(resume);
  return evidence.reduce((score, item, index) => {
    const overlap = Array.from(relevanceTokens(item)).filter(token => targetTokens.has(token)).length;
    return score + overlap * (evidence.length - index);
  }, 0);
}

export async function runSonaMorphLiveAudit(
  completion?: MorphJSONCompletion,
): Promise<LiveMorphAuditReport> {
  const access = resolveResumeMorphAccess({
    requestedMorphPercentage: 80,
    hasFullConsent: false,
    mode: 'automated',
  });
  const cases: LiveMorphAuditCaseResult[] = [];

  for (const auditCase of LIVE_MORPH_AUDIT_CASES) {
    try {
      const result = await generateGuardedMorphDraft({
        resume: auditCase.resume,
        jobTitle: auditCase.jobTitle,
        company: auditCase.company,
        jobDescription: auditCase.jobDescription,
        access,
      }, completion);
      const sourceTruthHash = resumeTruthFingerprint(auditCase.resume);
      const guardedTruthHash = resumeTruthFingerprint(result.resume);
      const target = `${auditCase.jobTitle} ${auditCase.jobDescription}`;
      const relevanceDelta = resumeRelevanceScore(result.resume, target)
        - resumeRelevanceScore(auditCase.resume, target);
      const safe = isCurrentResumeMorphGuardrailReport(result.report)
        && sourceTruthHash === guardedTruthHash;
      cases.push({
        id: auditCase.id,
        success: true,
        safe,
        useful: safe && relevanceDelta > 0,
        blockedChangeCount: result.report.blockedChangeCount,
        sourceTruthHash,
        guardedTruthHash,
        relevanceDelta,
        generatedHash: hash(result.generatedResume),
        guardedHash: hash(result.resume),
        error: null,
      });
    } catch (error) {
      cases.push({
        id: auditCase.id,
        success: false,
        safe: false,
        useful: false,
        blockedChangeCount: 0,
        sourceTruthHash: null,
        guardedTruthHash: null,
        relevanceDelta: 0,
        generatedHash: null,
        guardedHash: null,
        error: error instanceof Error ? error.message.slice(0, 180) : 'Unknown model failure',
      });
    }
  }

  const successfulCases = cases.filter(item => item.success).length;
  const safeCases = cases.filter(item => item.safe).length;
  const usefulCases = cases.filter(item => item.useful).length;
  const regressedCases = cases.filter(item => item.relevanceDelta < 0).length;
  const truthPassed = successfulCases === LIVE_MORPH_AUDIT_CASES.length
    && safeCases === LIVE_MORPH_AUDIT_CASES.length;
  const utilityPassed = usefulCases >= 10 && regressedCases === 0;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provider: 'groq',
    caseCount: LIVE_MORPH_AUDIT_CASES.length,
    successfulCases,
    safeCases,
    usefulCases,
    regressedCases,
    blockedChangeCount: cases.reduce((sum, item) => sum + item.blockedChangeCount, 0),
    truthPassed,
    utilityPassed,
    releaseReady: truthPassed && utilityPassed,
    cases,
  };
}
