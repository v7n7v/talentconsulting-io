import type { User } from 'firebase/auth';

export const DEMO_USER_ID = 'demo-career-operator';
export const DEMO_USER_EMAIL = 'demo@talentconsulting.local';
export const DEMO_AUTH_TOKEN = 'tc-local-demo-auth-bypass';

type HeaderReader = {
  headers: {
    get(name: string): string | null;
  };
};

const now = () => new Date().toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export function isDemoModeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE === 'false') return false;
  if (process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE === 'true') return true;
  return false;
}

export function isDemoAuthRequest(req: HeaderReader): boolean {
  if (!isDemoModeEnabled()) return false;
  const authHeader = req.headers.get('authorization');
  const demoHeader = req.headers.get('x-demo-auth-bypass');
  return authHeader === `Bearer ${DEMO_AUTH_TOKEN}` && demoHeader === 'true';
}

export function getDemoAuthUser(): User {
  return {
    uid: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    emailVerified: true,
    displayName: 'Alula Career Operator',
    photoURL: null,
    phoneNumber: null,
    isAnonymous: false,
    tenantId: null,
    providerId: 'demo',
    providerData: [],
    metadata: {
      creationTime: daysAgo(45),
      lastSignInTime: now(),
    },
    refreshToken: DEMO_AUTH_TOKEN,
    getIdToken: async () => DEMO_AUTH_TOKEN,
    getIdTokenResult: async () => ({
      token: DEMO_AUTH_TOKEN,
      signInProvider: 'demo',
      claims: {},
      expirationTime: daysFromNow(1),
      issuedAtTime: now(),
      authTime: now(),
    } as any),
    reload: async () => {},
    delete: async () => {},
    toJSON: () => ({ uid: DEMO_USER_ID, email: DEMO_USER_EMAIL, displayName: 'Alula Career Operator' }),
  } as User;
}

export function getDemoUserProfile() {
  return {
    id: 'main',
    full_name: 'Alula Career Operator',
    email: DEMO_USER_EMAIL,
    linkedin_url: 'https://www.linkedin.com/in/demo-career-operator',
    skills: ['AI product strategy', 'full-stack engineering', 'growth systems', 'technical storytelling', 'startup operations'],
    preferences: {
      remote: true,
      targetStage: ['seed', 'series A', 'series B'],
      autonomy: 'high',
    },
    onboarding_completed: true,
    career_fields: ['AI product', 'founder office', 'growth engineering'],
    seniority_level: 'lead',
    job_search_status: 'active',
    target_roles: ['Founding AI Product Engineer', 'Senior Product Engineer', 'AI Growth Lead'],
    location_preference: 'San Francisco, New York, Remote',
    salary_range: { min: 180000, max: 260000 },
    base_resume_text: 'AI product engineer and operator focused on turning ambiguous career data into launch-ready products.',
    created_at: daysAgo(45),
    updated_at: now(),
  };
}

const baseResume = {
  personal: {
    name: 'Alula Career Operator',
    title: 'AI Product Engineer',
    email: DEMO_USER_EMAIL,
    phone: '(555) 010-2026',
    location: 'San Francisco, CA',
    summary: 'Builds AI-native career products that combine automation, evidence, and trust-first workflows.',
  },
  experience: [
    {
      title: 'TalentConsulting.io - Product Engineering Lead',
      items: [
        'Designed a review-first AI career workspace covering resume morphing, application tracking, and interview preparation.',
        'Built proof-based workflows that explain why each recommendation, packet, or outreach step is safe to use.',
        'Shipped product loops across onboarding, queue review, and outcome tracking for a high-trust career operator experience.',
      ],
    },
    {
      title: 'Independent AI Systems Consultant',
      items: [
        'Prototyped AI agents, workflow automation, and analytics dashboards for early-stage operators.',
        'Translated messy business requirements into scoped product phases, audits, and implementation plans.',
      ],
    },
  ],
  education: [
    { title: 'Self-directed founder track', items: ['AI systems, product strategy, security, and growth.'] },
  ],
  skills: ['Next.js', 'React', 'TypeScript', 'Firebase', 'Stripe', 'AI SDK', 'prompt engineering', 'product analytics'],
  projects: [
    { title: 'Career Twin', items: ['Persistent career memory that powers Taco recommendations and proof checks.'] },
  ],
};

let demoResumeVersions: any[] = [
  {
    id: 'demo-resume-product-ai',
    user_id: DEMO_USER_ID,
    version_name: 'Founding AI Product Engineer packet',
    content: baseResume,
    skill_graph: {
      confirmed: ['AI product strategy', 'React', 'TypeScript', 'Firebase', 'workflow automation'],
      gaps: ['enterprise security narratives', 'model evaluation depth'],
    },
    mode: 'technical',
    is_active: true,
    matchScore: 92,
    metadata: { targetRole: 'Founding AI Product Engineer', proofScore: 88 },
    created_at: daysAgo(3),
    updated_at: now(),
  },
  {
    id: 'demo-resume-growth-lead',
    user_id: DEMO_USER_ID,
    version_name: 'AI Growth Lead narrative',
    content: {
      ...baseResume,
      personal: {
        ...baseResume.personal,
        title: 'AI Growth Lead',
        summary: 'Combines product engineering, experimentation, and AI workflow design to accelerate zero-to-one growth.',
      },
    },
    skill_graph: {
      confirmed: ['growth systems', 'analytics', 'copy systems', 'product-led onboarding'],
      gaps: ['paid acquisition budget ownership'],
    },
    mode: 'leadership',
    is_active: false,
    matchScore: 86,
    metadata: { targetRole: 'AI Growth Lead', proofScore: 81 },
    created_at: daysAgo(9),
    updated_at: daysAgo(2),
  },
];

let demoApplications: any[] = [
  {
    id: 'demo-app-pinnacle-draft',
    user_id: DEMO_USER_ID,
    company_name: 'Pinnacle AI',
    job_title: 'Founding Product Engineer, Agentic Workflows',
    job_description: 'Build agentic workflow infrastructure, product UI, and customer-facing automation for a small founding team.',
    resume_version_id: 'demo-resume-product-ai',
    morphed_resume_name: 'Pinnacle AI - Founding Product Engineer, Agentic Workflows',
    status: 'not_applied',
    morphed_at: daysAgo(1),
    applied_at: null,
    last_updated: daysAgo(1),
    talent_density_score: 94,
    gap_analysis: {
      strengths: ['AI workflow product shipped', 'review-first queue design', 'full-stack launch speed'],
      gaps: ['Confirm one concrete model evaluation story before submitting'],
    },
    notes: 'Queue-created tracker draft. Submit manually from the posting before marking applied.',
    application_link: 'https://example.com/pinnacle-agentic-workflows',
    created_at: daysAgo(1),
    source: 'agent_queue',
    source_meta: { queue_id: 'demo-queue-pinnacle', packet_status: 'needs_review' },
    packet_status: 'tracker_draft',
    outcome_response: null,
  },
  {
    id: 'demo-app-aurora',
    user_id: DEMO_USER_ID,
    company_name: 'Aurora Labs',
    job_title: 'Founding AI Product Engineer',
    job_description: 'Build customer-facing AI workflow products with React, TypeScript, evaluation loops, and fast iteration with design partners.',
    resume_version_id: 'demo-resume-product-ai',
    morphed_resume_name: 'Aurora Labs - Founding AI Product Engineer',
    status: 'interview_scheduled',
    morphed_at: daysAgo(6),
    applied_at: daysAgo(5),
    last_updated: daysAgo(1),
    interview_date: daysFromNow(2),
    talent_density_score: 92,
    gap_analysis: {
      strengths: ['AI workflow product experience', 'review-first UX', 'full-stack speed'],
      gaps: ['Add one enterprise security example before the systems interview'],
    },
    notes: 'Warm intro through design partner. Emphasize proof engine, agent queue, and ability to ship complete loops.',
    application_link: 'https://example.com/aurora-labs-ai-product-engineer',
    created_at: daysAgo(6),
    outcome_response: 'interview',
    outcome_reported_at: daysAgo(1),
    outcome_days_to_response: 4,
    callback_count: 1,
    interview_rounds: 2,
  },
  {
    id: 'demo-app-nova',
    user_id: DEMO_USER_ID,
    company_name: 'Nova Talent',
    job_title: 'Senior Product Engineer, AI Workflows',
    job_description: 'Own AI workflow surfaces for candidates and hiring teams. Strong product craft, data quality, and trust UX required.',
    resume_version_id: 'demo-resume-product-ai',
    morphed_resume_name: 'Nova Talent - Senior Product Engineer',
    status: 'applied',
    morphed_at: daysAgo(12),
    applied_at: daysAgo(10),
    last_updated: daysAgo(2),
    talent_density_score: 84,
    gap_analysis: {
      strengths: ['Career workspace domain fit', 'candidate journey ownership'],
      gaps: ['Add metrics on user retention or activation'],
    },
    notes: 'Needs follow-up. Tie TalentConsulting.io roadmap to measurable activation improvements.',
    application_link: 'https://example.com/nova-product-engineer',
    created_at: daysAgo(12),
    outcome_response: null,
  },
  {
    id: 'demo-app-vector',
    user_id: DEMO_USER_ID,
    company_name: 'Vector Harbor',
    job_title: 'AI Growth Lead',
    job_description: 'Lead AI-assisted growth systems, onboarding experiments, and lifecycle messaging for a technical SaaS product.',
    resume_version_id: 'demo-resume-growth-lead',
    morphed_resume_name: 'Vector Harbor - AI Growth Lead',
    status: 'offer',
    morphed_at: daysAgo(20),
    applied_at: daysAgo(18),
    last_updated: daysAgo(1),
    talent_density_score: 87,
    notes: 'Offer received. Compare base plus equity against target range and counter with proof of full-stack execution.',
    application_link: 'https://example.com/vector-harbor-ai-growth-lead',
    created_at: daysAgo(20),
    outcome_response: 'offer',
    outcome_reported_at: daysAgo(1),
    outcome_days_to_response: 17,
    offer_amount: 212000,
    offer_details: {
      base: 190000,
      total: 235000,
      bonus: 15000,
      signOn: 20000,
      desiredBase: 215000,
      desiredTotal: 275000,
      equity: '0.35%',
      deadline: daysFromNow(5),
      competingOffer: false,
      context: 'Series A company, high scope, likely room on base and equity refresh.',
    },
    negotiation_status: 'drafted',
    negotiation_brief: {
      marketRange: { low: 185000, mid: 220000, high: 275000 },
      verdict: 'below_market',
      verdictMessage: 'Base is strong but total compensation trails the desired senior startup range.',
      counterStrategy: 'Ask for $215k base, 0.5% equity, and a written 6-month compensation review.',
      emailScript: 'Thank you for the offer. I am excited about the scope and would like to align compensation with the impact expected from this role...',
      phoneScript: 'Lead with excitement, anchor on impact, then ask calmly for the revised package.',
      batna: 'Continue Aurora Labs process before signing.',
      leveragePoints: ['Direct AI product shipping record', 'Growth plus engineering blend', 'Immediate ownership of review-first workflows'],
      nonSalaryAsks: ['6-month review', 'conference budget', 'AI tooling stipend'],
      redFlags: ['Equity refresh terms are not yet documented'],
    },
  },
];

let demoQueueItems: any[] = [
  {
    id: 'demo-queue-pinnacle',
    user_id: DEMO_USER_ID,
    job_title: 'Founding Product Engineer, Agentic Workflows',
    company: 'Pinnacle AI',
    location: 'San Francisco, CA',
    job_url: 'https://example.com/pinnacle-agentic-workflows',
    job_description: 'Build agentic workflow infrastructure, product UI, and customer-facing automation for a small founding team.',
    salary: { min: 190000, max: 260000 },
    employment_type: 'Full-time',
    posted_date: daysAgo(1),
    match_score: 94,
    match_reason: 'Direct match for Taco, proof engine, and review-first agent queue work.',
    morphed_resume: { summary: 'Resume draft emphasizes product engineering, trust gates, and AI workflow execution.' },
    cover_letter: 'I am excited by Pinnacle AI because your product needs both agentic systems judgment and polished user-facing workflow design...',
    resume_version_id: 'demo-resume-product-ai',
    status: 'pending',
    source: 'nightly_agent',
    packetStatus: 'needs_review',
    fitSignals: ['AI workflow product shipped', 'Full-stack Next.js/Firebase', 'Trust-first UX language'],
    riskSignals: ['Need one concrete model evaluation example', 'Confirm hybrid expectation'],
    nextAction: 'Review the packet, add the evaluation example, then approve for manual apply.',
    feedbackTags: [],
    created_at: daysAgo(1),
    expires_at: daysFromNow(6),
    batch_id: 'demo-nightly-1',
    batch_date: daysAgo(1).split('T')[0],
  },
  {
    id: 'demo-queue-cobalt',
    user_id: DEMO_USER_ID,
    job_title: 'Senior Growth Engineer, AI Platform',
    company: 'Cobalt Systems',
    location: 'Remote US',
    job_url: 'https://example.com/cobalt-growth-engineer',
    job_description: 'Own activation experiments, AI content workflows, lifecycle messaging, and product analytics.',
    salary: { min: 170000, max: 230000 },
    employment_type: 'Full-time',
    posted_date: daysAgo(2),
    match_score: 82,
    match_reason: 'Strong growth systems overlap, with a lighter fit on platform infrastructure.',
    morphed_resume: { summary: 'Growth lead resume draft is ready for review.' },
    cover_letter: 'Your activation and lifecycle surface is exactly where my product engineering and growth systems experience compound...',
    resume_version_id: 'demo-resume-growth-lead',
    status: 'approved',
    source: 'nightly_agent',
    packetStatus: 'approved',
    fitSignals: ['Activation and lifecycle systems', 'AI-assisted content workflows'],
    riskSignals: ['Platform depth may need more proof'],
    nextAction: 'Open the posting and submit manually when ready.',
    feedbackTags: ['More like this'],
    created_at: daysAgo(2),
    reviewed_at: daysAgo(1),
    last_action_at: daysAgo(1),
    expires_at: daysFromNow(5),
    batch_id: 'demo-nightly-1',
    batch_date: daysAgo(2).split('T')[0],
  },
];

let demoStudyProgress: any[] = [
  {
    id: 'enterprise-security-narratives',
    user_id: DEMO_USER_ID,
    skill: 'Enterprise security narratives',
    skill_id: 'enterprise-security-narratives',
    category: 'domain',
    total_days: 7,
    completed_days: [1, 2, 3],
    plan_data: {
      goal: 'Prepare concise security, privacy, and data-boundary stories for AI product interviews.',
      schedule: ['Map data flows', 'Write privacy story', 'Practice security tradeoffs'],
    },
    email_reminders: false,
    application_ids: ['demo-app-aurora', 'demo-queue-pinnacle'],
    job_title: 'Founding AI Product Engineer',
    company_name: 'Aurora Labs',
    readiness_status: 'ready_to_verify',
    readiness_score: 72,
    proof_level: 'applied_challenge',
    source_context: 'application',
    started_at: daysAgo(4),
    last_activity_at: daysAgo(1),
  },
  {
    id: 'model-evaluation-depth',
    user_id: DEMO_USER_ID,
    skill: 'Model evaluation depth',
    skill_id: 'model-evaluation-depth',
    category: 'technical',
    total_days: 5,
    completed_days: [1],
    plan_data: {
      goal: 'Explain eval loops, acceptance criteria, and regression checks for AI-generated work.',
      schedule: ['Define eval cases', 'Build rubric', 'Practice tradeoff answer'],
    },
    email_reminders: false,
    application_ids: ['demo-queue-pinnacle'],
    readiness_status: 'learning',
    readiness_score: 48,
    proof_level: 'quick_check',
    source_context: 'application',
    started_at: daysAgo(2),
    last_activity_at: daysAgo(1),
  },
];

let demoCoverLetters: any[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getDemoResumeVersions() {
  return clone(demoResumeVersions);
}

export function saveDemoResumeVersion(data: any) {
  const record = {
    id: `demo-resume-${Date.now()}`,
    user_id: DEMO_USER_ID,
    ...data,
    created_at: now(),
    updated_at: now(),
  };
  demoResumeVersions = [record, ...demoResumeVersions];
  return clone(record);
}

export function getDemoJobApplications() {
  return clone(demoApplications);
}

export function createDemoJobApplication(data: any) {
  const record = {
    id: `demo-app-${Date.now()}`,
    user_id: DEMO_USER_ID,
    company_name: data.companyName,
    job_title: data.jobTitle || null,
    job_description: data.jobDescription || null,
    resume_version_id: data.resumeVersionId || null,
    morphed_resume_name: data.morphedResumeName,
    talent_density_score: data.talentDensityScore || null,
    gap_analysis: data.gapAnalysis || null,
    application_link: data.applicationLink || null,
    status: 'not_applied',
    morphed_at: now(),
    last_updated: now(),
    created_at: now(),
    source: data.source || 'manual',
    source_meta: data.sourceMeta || null,
    packet_status: data.packetStatus || null,
  };
  demoApplications = [record, ...demoApplications];
  return clone(record);
}

export function updateDemoJobApplication(id: string, updates: Record<string, any>) {
  let updated: any | null = null;
  demoApplications = demoApplications.map(app => {
    if (app.id !== id) return app;
    updated = { ...app, ...updates, last_updated: updates.last_updated || now() };
    return updated;
  });
  return updated ? clone(updated) : null;
}

export function deleteDemoJobApplication(id: string) {
  const before = demoApplications.length;
  demoApplications = demoApplications.filter(app => app.id !== id);
  return demoApplications.length < before;
}

export function getDemoAgentQueue(statusFilter?: string) {
  const items = statusFilter ? demoQueueItems.filter(item => item.status === statusFilter) : demoQueueItems;
  return clone(items);
}

export function updateDemoQueueItem(id: string, updates: Record<string, any>) {
  let updated: any | null = null;
  demoQueueItems = demoQueueItems.map(item => {
    if (item.id !== id) return item;
    updated = { ...item, ...updates, last_action_at: updates.last_action_at || now() };
    return updated;
  });
  return updated ? clone(updated) : null;
}

export function createDemoApplicationFromQueue(id: string) {
  const item = demoQueueItems.find(queueItem => queueItem.id === id);
  if (!item) return null;
  if (item.status !== 'approved') return null;
  if (item.application_id || item.packetStatus === 'assist_apply') return null;
  const application = createDemoJobApplication({
    companyName: item.company,
    jobTitle: item.job_title,
    jobDescription: item.job_description,
    resumeVersionId: item.resume_version_id,
    morphedResumeName: `${item.company} - ${item.job_title}`,
    talentDensityScore: item.match_score,
    applicationLink: item.job_url,
    source: 'agent_queue',
    sourceMeta: { queue_id: id, packet_status: item.packetStatus || null },
    packetStatus: 'tracker_draft',
  });
  updateDemoQueueItem(id, {
    status: 'approved',
    packetStatus: 'assist_apply',
    assisted_at: now(),
    application_id: application.id,
  });
  return application.id;
}

export function getDemoStudyProgress() {
  return clone(demoStudyProgress);
}

export function updateDemoStudyProgress(skillId: string, updates: Record<string, any>) {
  let updated: any | null = null;
  demoStudyProgress = demoStudyProgress.map(progress => {
    if (progress.skill_id !== skillId && progress.id !== skillId) return progress;
    updated = { ...progress, ...updates, last_activity_at: updates.last_activity_at || now() };
    return updated;
  });
  if (!updated && updates.skill) {
    updated = { ...updates, id: updates.id || skillId, skill_id: updates.skill_id || skillId };
    demoStudyProgress = [updated, ...demoStudyProgress];
  }
  return updated ? clone(updated) : null;
}

export function getDemoCoverLetters() {
  return clone(demoCoverLetters);
}

export function saveDemoCoverLetter(data: any) {
  const record = {
    id: `demo-cover-${Date.now()}`,
    user_id: DEMO_USER_ID,
    resume_version_id: data.resumeVersionId || null,
    company: data.company,
    job_title: data.jobTitle,
    content: data.content,
    subject: data.subject,
    tone: data.tone,
    template: data.template,
    key_highlights: data.keyHighlights || [],
    word_count: data.wordCount || 0,
    tone_score: data.toneScore || 0,
    job_description: data.jobDescription || null,
    metadata: data.metadata || {},
    created_at: now(),
  };
  demoCoverLetters = [record, ...demoCoverLetters];
  return clone(record);
}

export function deleteDemoCoverLetter(id: string) {
  const before = demoCoverLetters.length;
  demoCoverLetters = demoCoverLetters.filter(letter => letter.id !== id);
  return demoCoverLetters.length < before;
}

export function getDemoIntelligenceResponse() {
  const profile = {
    /*
     * 11 + 33 + 11 + 14 = 69 earned over 30 + 35 + 20 + 15 = 100 available.
     *
     * Every item below is the real formula from computeHealthBands applied to
     * THIS profile's own stats, and each one carries its arithmetic. The block
     * used to be free-hand: `volume: 6` implies 30 applications and rendered
     * directly above Quick Stats reading "Apps 4". A demo that contradicts
     * itself on screen is the same defect as a product that does.
     */
    healthScore: 69,
    // Mirrors the shape computeHealthBands emits so the demo account renders
    // the same breakdown a real one does, rather than an empty panel.
    healthBands: [
      {
        // round(0.8 + 0.6 + 5 + 5) = 11
        key: 'activity', label: 'Activity', earned: 11, available: 30, max: 30,
        items: [
          // velocity * 2, and velocity is 3 sent over ceil(45d / 7) = 7 weeks.
          { key: 'velocity', label: 'Applications per week', score: 0.8, max: 10, measured: true },
          // appliedApps / 5 — sent, not tracked. 3 sent, not 4 records.
          { key: 'volume', label: 'Applications sent', score: 0.6, max: 10, measured: true },
          { key: 'debriefs', label: 'Interview debriefs logged', score: 5, max: 5, measured: true },
          { key: 'resume', label: 'Resume on file', score: 5, max: 5, measured: true },
        ],
      },
      {
        // round(10 + 10 + 10 + 2.5) = 33
        key: 'performance', label: 'Performance', earned: 33, available: 35, max: 35,
        items: [
          // responseRate 67 / 3 = 22.3, clamped to the 10 max.
          { key: 'responseRate', label: 'Response rate', score: 10, max: 10, measured: true },
          // interviewConversion 50 / 5 = 10.
          { key: 'interviewConversion', label: 'Response → interview', score: 10, max: 10, measured: true },
          // avgConfidence 80 / 8 = 10.
          { key: 'confidence', label: 'Interview confidence', score: 10, max: 10, measured: true },
          // passRate 50 / 20 = 2.5 — 1 of the 2 resolved debriefs passed.
          { key: 'passRate', label: 'Interview pass rate', score: 2.5, max: 5, measured: true },
        ],
      },
      {
        // round(1.5 + 3 + 2.5 + 4) = 11
        key: 'preparedness', label: 'Preparedness', earned: 11, available: 20, max: 20,
        items: [
          // confirmed.length 6 / 4 = 1.5.
          { key: 'skills', label: 'Skills on your resume', score: 1.5, max: 5, measured: true },
          // 5 - gap.length, and this demo profile carries two gaps.
          { key: 'gaps', label: 'Skill gaps against analyzed roles', score: 3, max: 5, measured: true },
          // strongCategories.length 1 * 2.5 = 2.5.
          { key: 'strongAreas', label: 'Strong interview categories', score: 2.5, max: 5, measured: true },
          // 5 - weak.length, and this demo profile carries one weak category.
          { key: 'weakAreas', label: 'Weak interview categories', score: 4, max: 5, measured: true },
        ],
      },
      {
        // 4 + 5 + 5 = 14
        key: 'wellbeing', label: 'Wellbeing', earned: 14, available: 15, max: 15,
        items: [
          // morale.current 4 * 1.
          { key: 'morale', label: 'Latest morale check-in', score: 4, max: 5, measured: true },
          // trend 'improving' scores 5. [3,3] then [4,4] over four check-ins.
          { key: 'moraleTrend', label: 'Morale trend', score: 5, max: 5, measured: true },
          // burnoutRisk 'low' scores 5. Latest 4, run-of-three mean 3.7.
          { key: 'burnout', label: 'Burnout risk', score: 5, max: 5, measured: true },
        ],
      },
    ],
    daysActive: 45,
    hasResume: true,
    resumeVersionCount: demoResumeVersions.length,
    skills: {
      confirmed: ['AI product strategy', 'React', 'TypeScript', 'Firebase', 'Stripe', 'workflow automation'],
      growing: ['model evaluation', 'enterprise security narratives'],
      weak: ['paid acquisition budget ownership'],
      marketHot: ['agentic workflows', 'AI product engineering', 'trust and safety UX'],
      gap: ['model evaluation depth', 'enterprise security narratives'],
      fitAnalysisCount: 3,
      // Two categories carry the two answers `weak` needs to be derivable;
      // one of them came in under 50 and is the single entry in `weak`.
      weakEvidenceCategories: 2,
    },
    // Counts and rates have to agree: 3 sent, 2 answered (67%), 1 of those 2
    // reached interview (50%), 0 of 1 interview became an offer (0%).
    pipeline: {
      totalApps: demoApplications.length,
      appliedApps: 3,
      thisWeekApps: 1,
      // 3 sent over ceil(45 days / 7) = 7 weeks. `4` was not reachable from
      // any pair of numbers this profile declares.
      velocity: 0.4,
      responded: 2,
      interviews: 1,
      offers: 0,
      responseRate: 67,
      interviewConversion: 50,
      offerConversion: 0,
      ghostRate: 33,
      topCompanies: demoApplications.map(app => app.company_name).slice(0, 4),
    },
    /*
     * Question confidence is 0-100 in InterviewIntelligence (weak is < 55,
     * strong is >= 70) and overallFeeling is the 1-5 self-report. This block
     * carried 8, 7, 5 and 9 — a 1-10 scale nothing in the real code uses, so
     * the demo's own "strong category" would not have cleared the strong
     * threshold. `confidenceTrend: 'up'` is not a member of the union either;
     * it type-checked only because this function has no return annotation.
     */
    interviews: {
      totalDebriefs: 2,
      // 1 of the 2 resolved debriefs passed. 75 is not reachable from 2.
      passRate: 50,
      resolvedOutcomeCount: 2,
      questionCount: 6,
      avgConfidence: 80,
      avgFeeling: 4,
      confidenceTrend: 'improving',
      weakCategories: [{ category: 'model evaluation', avgConfidence: 45, count: 2 }],
      strongCategories: [{ category: 'product strategy', avgConfidence: 90, count: 4 }],
      roundTypeBreakdown: [{ type: 'product sense', count: 1, avgConf: 90 }, { type: 'systems', count: 1, avgConf: 70 }],
      companiesInterviewed: ['Aurora Labs'],
    },
    stories: {
      totalStories: 8,
      tagDistribution: [{ tag: 'leadership', count: 3 }, { tag: 'problem solving', count: 3 }, { tag: 'startup execution', count: 2 }],
      coverageGaps: ['conflict resolution', 'failure'],
    },
    // Morale is a 1-5 self-report (see MoraleIntelligence). This block used to
    // carry 62/68/74 on that scale and a `trend` value the union does not have.
    // Four entries, because computeMoraleIntelligence will not claim a trend
    // from fewer — two disjoint windows of two: [3,3] then [4,4] = improving.
    morale: {
      current: 4,
      trend: 'improving',
      burnoutRisk: 'low',
      history: [
        { week: 'Week 1', score: 3 },
        { week: 'Week 2', score: 3 },
        { week: 'Week 3', score: 4 },
        { week: 'Week 4', score: 4 },
      ],
    },
    computedAt: now(),
  };

  const twin = {
    completeness: {
      score: 82,
      missing: ['One model evaluation proof story', 'Enterprise buyer/security narrative'],
    },
    behavioralBank: {
      totalStories: 8,
      coveredCategories: ['leadership', 'teamwork', 'initiative', 'communication', 'problem solving'],
      uncoveredCategories: ['conflict resolution', 'failure', 'customer focus'],
      coverageScore: 67,
    },
    background: {
      currentTitle: 'AI Product Engineer',
      targetRoles: ['Founding AI Product Engineer', 'Senior Product Engineer', 'AI Growth Lead'],
      industries: ['AI infrastructure', 'career technology', 'B2B SaaS'],
      education: ['Self-directed founder track'],
    },
    memory: {
      identity: {
        name: 'Alula Career Operator',
        currentTitle: 'AI Product Engineer',
        seniority: 'lead',
        careerFields: ['AI product', 'growth engineering', 'founder office'],
        locationPreference: 'San Francisco, New York, Remote',
      },
      goals: {
        targetRoles: ['Founding AI Product Engineer', 'Senior Product Engineer', 'AI Growth Lead'],
        industries: ['AI infrastructure', 'career technology', 'B2B SaaS'],
        jobSearchStatus: 'active',
        salaryMin: 180000,
        remotePreference: 'hybrid or remote',
      },
      constraints: {
        preferredCities: ['San Francisco', 'New York', 'Remote US'],
        excludedCompanies: [],
        autonomyLevel: 'high',
        requiresReviewBeforeExternalAction: true,
      },
      confirmedFacts: {
        skills: ['AI product strategy', 'React', 'TypeScript', 'Firebase', 'Stripe', 'workflow automation'],
        education: ['Self-directed founder track'],
        resumeVersionCount: demoResumeVersions.length,
        hasResume: true,
        topCompanies: demoApplications.map(app => app.company_name).slice(0, 3),
      },
      writingVoice: {
        tone: 'clear, direct, evidence-led',
        bannedClaims: ['unverified revenue claims', 'unconfirmed team size ownership'],
        evidenceStyle: 'metrics first, then brief context',
      },
      activeSearch: {
        totalApplications: demoApplications.length,
        sentApplications: 3,
        responseRate: 67,
        velocity: 0.4,
        queuedApplications: demoQueueItems.length,
        staleApplications: 1,
        skillGaps: ['model evaluation depth', 'enterprise security narratives'],
        fitAnalysisCount: 3,
      },
      nextBestActions: [
        {
          id: 'review-pinnacle',
          label: 'Review Pinnacle AI packet',
          reason: 'It is the highest-fit queued role and needs one evaluation proof before manual apply.',
          path: '/suite/agent/queue',
          priority: 'high',
        },
        {
          id: 'follow-up-nova',
          label: 'Draft Nova Talent follow-up',
          reason: 'It has been 10 days since apply with no recorded response.',
          path: '/suite/applications?outcome=demo-app-nova',
          priority: 'medium',
        },
      ],
    },
    exportable: true,
  };

  return {
    profile,
    recommendations: [
      {
        id: 'rec-queue',
        priority: 'high',
        icon: 'pending_actions',
        title: 'Approve the highest-fit packet after one proof edit',
        description: 'Pinnacle AI is a strong role match, but the packet needs a model evaluation example before it is safe to send.',
        action: 'Open Agent Queue',
        actionPath: '/suite/agent/queue',
        color: '#2563eb',
        category: 'applications',
      },
      {
        id: 'rec-follow-up',
        priority: 'medium',
        icon: 'forward_to_inbox',
        title: 'Follow up on Nova Talent',
        description: 'A concise follow-up can reopen the loop while the role is still fresh.',
        action: 'Open Applications',
        actionPath: '/suite/applications',
        color: '#d97706',
        category: 'pipeline',
      },
    ],
    summary: 'Your search is active, credible, and close to offer-stage leverage. The next lift is proof depth: model evaluation and enterprise security narratives.',
    sonaBrief: {
      title: 'Today\'s best move: Review Pinnacle AI packet',
      body: 'It is the highest-fit queued role and needs one evaluation proof before manual apply.',
      actionLabel: 'Open Agent Queue',
      actionUrl: '/suite/agent/queue',
      priority: 'high',
    },
    twin,
    cached: true,
  };
}
