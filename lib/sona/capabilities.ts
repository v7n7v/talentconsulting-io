export type SonaApprovalPolicy = 'none' | 'review' | 'external';
export type SonaCapabilityStage = 'understand' | 'plan' | 'create' | 'verify' | 'save';

export interface SonaCapability {
  id: string;
  toolId: string;
  toolName: string;
  routePatterns: string[];
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  inputs: string[];
  outputs: string[];
  stages: SonaCapabilityStage[];
  approval: SonaApprovalPolicy;
  canRunInBackground: boolean;
  createsArtifacts: boolean;
  prompt: string;
}

const capability = (item: SonaCapability): SonaCapability => item;

export const SONA_CAPABILITIES: SonaCapability[] = [
  capability({
    id: 'resume.morph_for_job',
    toolId: 'resume',
    toolName: 'Resume Studio',
    routePatterns: ['/suite/resume'],
    title: 'Morph this resume for the active job',
    shortTitle: 'Morph resume',
    description: 'Tailor the selected resume to the role while keeping every claim truthful.',
    icon: 'description',
    inputs: ['resumeVersionId', 'jobDescription', 'targetRole', 'company'],
    outputs: ['resumeVersionId', 'atsScore', 'keywordGaps', 'templateRecommendation'],
    stages: ['understand', 'create', 'verify', 'save'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Tailor my current resume for the active role. Keep the facts truthful, preserve metrics and names, explain the key changes, and save a reusable version for review.',
  }),
  capability({
    id: 'resume.explain_intelligence',
    toolId: 'resume',
    toolName: 'Resume Studio',
    routePatterns: ['/suite/resume'],
    title: 'Explain the resume intelligence results',
    shortTitle: 'Explain score',
    description: 'Turn scores and recommendations into a plain-English action plan.',
    icon: 'psychology',
    inputs: ['resumeVersionId', 'jobDescription', 'atsResult'],
    outputs: ['priorityFixes', 'safePolishPlan', 'templateAdvice'],
    stages: ['understand', 'plan'],
    approval: 'none',
    canRunInBackground: false,
    createsArtifacts: false,
    prompt: 'Explain what deserves attention in this resume and give me the smallest set of fixes that would improve fit, clarity, and ATS safety.',
  }),
  capability({
    id: 'jobs.find_rank_prepare',
    toolId: 'job-search',
    toolName: 'Job Search',
    routePatterns: ['/suite/job-search', '/suite/agent/queue'],
    title: 'Find, rank, and prepare better opportunities',
    shortTitle: 'Rank jobs',
    description: 'Use the current resume and preferences to identify roles worth the effort.',
    icon: 'radar',
    inputs: ['resumeVersionId', 'targetRole', 'location', 'salaryTarget'],
    outputs: ['rankedJobs', 'fitReasons', 'packetPlan'],
    stages: ['understand', 'plan', 'create'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Find and rank roles that match my current career target. Prioritize interview yield, proof strength, freshness, compensation fit, and the amount of tailoring needed before I apply.',
  }),
  capability({
    id: 'jobs.prepare_packet',
    toolId: 'job-search',
    toolName: 'Job Search',
    routePatterns: ['/suite/job-search', '/suite/agent/queue'],
    title: 'Prepare a review-first application packet',
    shortTitle: 'Build packet',
    description: 'Generate the resume, cover letter, ATS check, and tracker draft without submitting externally.',
    icon: 'inventory',
    inputs: ['resumeVersionId', 'jobDescription', 'company', 'jobTitle', 'jobUrl'],
    outputs: ['morphedResume', 'coverLetter', 'atsResult', 'applicationDraft'],
    stages: ['understand', 'create', 'verify', 'save'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Prepare an application packet for the active role. Build the tailored resume, cover letter, ATS check, keyword gaps, and tracker draft, then keep everything ready for my review.',
  }),
  capability({
    id: 'oracle.decide_strategy',
    toolId: 'market-oracle',
    toolName: 'Market Oracle',
    routePatterns: ['/suite/market-oracle'],
    title: 'Decide whether this role is worth applying to',
    shortTitle: 'Decide strategy',
    description: 'Create an apply, prepare-first, watch, or skip recommendation with evidence.',
    icon: 'troubleshoot',
    inputs: ['resumeVersionId', 'jobDescription', 'company', 'jobTitle', 'salaryTarget'],
    outputs: ['verdict', 'fitScore', 'riskScore', 'proofGaps', 'nextAction'],
    stages: ['understand', 'plan', 'verify'],
    approval: 'none',
    canRunInBackground: true,
    createsArtifacts: false,
    prompt: 'Act as my role deal desk. Decide whether this role is worth my time, explain the evidence, identify proof gaps, and recommend apply, prepare first, watch, or skip.',
  }),
  capability({
    id: 'cover_letter.draft_from_context',
    toolId: 'cover-letter',
    toolName: 'Cover Letter',
    routePatterns: ['/suite/cover-letter'],
    title: 'Draft a proof-backed cover letter',
    shortTitle: 'Draft letter',
    description: 'Use the selected resume, JD, and Story Bank themes to create a concise draft.',
    icon: 'edit_document',
    inputs: ['resumeVersionId', 'jobDescription', 'company', 'jobTitle', 'stories'],
    outputs: ['coverLetterDraft', 'personalizationScore', 'copyReadyText'],
    stages: ['understand', 'create', 'verify', 'save'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Draft a concise cover letter for the active role using my resume and strongest proof. Keep it specific, not generic, and show me the reasoning before I save or export it.',
  }),
  capability({
    id: 'ats.analyze_fix_list',
    toolId: 'ats-analyzer',
    toolName: 'ATS Analyzer',
    routePatterns: ['/suite/ats-analyzer', '/suite/ats-preview'],
    title: 'Analyze ATS fit and produce a fix list',
    shortTitle: 'Run ATS',
    description: 'Compare the resume and JD, then turn gaps into specific edits.',
    icon: 'scanner',
    inputs: ['resumeVersionId', 'jobDescription'],
    outputs: ['atsScore', 'keywordCoverage', 'fixList'],
    stages: ['understand', 'verify', 'plan'],
    approval: 'none',
    canRunInBackground: true,
    createsArtifacts: false,
    prompt: 'Run an ATS-style review for the current resume and job description. Explain the score, missing keywords, risky formatting, and the exact fixes to make first.',
  }),
  capability({
    id: 'linkedin.optimize_positioning',
    toolId: 'linkedin',
    toolName: 'LinkedIn Optimizer',
    routePatterns: ['/suite/linkedin'],
    title: 'Optimize LinkedIn for this target role',
    shortTitle: 'Optimize LinkedIn',
    description: 'Turn resume, JD, and ATS gaps into recruiter-search positioning.',
    icon: 'badge',
    inputs: ['resumeVersionId', 'jobDescription', 'targetRole', 'keywordGaps'],
    outputs: ['headline', 'aboutSection', 'recruiterKeywords', 'checklist'],
    stages: ['understand', 'create', 'verify'],
    approval: 'review',
    canRunInBackground: false,
    createsArtifacts: true,
    prompt: 'Optimize my LinkedIn positioning for the active target role. Improve headline, About section, recruiter keywords, and checklist items without inventing experience.',
  }),
  capability({
    id: 'writing.trust_rewrite',
    toolId: 'writing-tools',
    toolName: 'Writing Toolkit',
    routePatterns: ['/suite/writing-tools', '/tools/ai-detector', '/tools/ai-humanizer'],
    title: 'Diagnose and humanize writing with trust controls',
    shortTitle: 'Improve writing',
    description: 'Scan, diagnose, rewrite, and verify while preserving facts and voice.',
    icon: 'ink_pen',
    inputs: ['documentText', 'domain', 'tone', 'protectedTerms'],
    outputs: ['trustReport', 'patches', 'warnings', 'finalText'],
    stages: ['understand', 'create', 'verify'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Help me improve this writing. Diagnose trust, clarity, voice, and risk, then suggest the safest rewrite plan before changing anything important.',
  }),
  capability({
    id: 'stories.match_answer',
    toolId: 'story-bank',
    toolName: 'Story Bank',
    routePatterns: ['/suite/agent/stories'],
    title: 'Find the best proof story for a question',
    shortTitle: 'Match story',
    description: 'Rank saved STAR stories, flag weak evidence, and draft grounded answers.',
    icon: 'auto_stories',
    inputs: ['question', 'company', 'jobTitle', 'jobDescription'],
    outputs: ['rankedStories', 'answerVariants', 'proofGaps'],
    stages: ['understand', 'plan', 'create'],
    approval: 'none',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Find my strongest saved story for the active interview or application question. Rank the options, explain why they fit, and draft an answer without inventing details.',
  }),
  capability({
    id: 'skill_bridge.plan_verify',
    toolId: 'skill-bridge',
    toolName: 'Skill Bridge',
    routePatterns: ['/suite/skill-bridge'],
    title: 'Choose the next skill gap to prove',
    shortTitle: 'Plan proof',
    description: 'Pick the highest-leverage gap and create a study plus proof plan.',
    icon: 'route',
    inputs: ['targetRole', 'jobDescription', 'skillGaps', 'applicationId'],
    outputs: ['skillPlan', 'proofChallenge', 'studyVaultItems'],
    stages: ['understand', 'plan', 'create', 'save'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Help me choose the highest-leverage skill gap to prove next. Build a practical study plan, proof challenge, and interview-ready explanation.',
  }),
  capability({
    id: 'interview.prepare_session',
    toolId: 'interview-sim',
    toolName: 'Interview Studio',
    routePatterns: ['/suite/interview-sim'],
    title: 'Prepare a targeted interview session',
    shortTitle: 'Prep interview',
    description: 'Use the role, resume, JD, and Story Bank to generate practice prompts.',
    icon: 'interpreter_mode',
    inputs: ['resumeVersionId', 'jobDescription', 'stories', 'applicationId'],
    outputs: ['questions', 'storyMap', 'practicePlan', 'debriefChecklist'],
    stages: ['understand', 'plan', 'create'],
    approval: 'none',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Prepare me for this interview. Use the active role, JD, resume, and Story Bank to create likely questions, story mapping, and a practice plan.',
  }),
  capability({
    id: 'network.draft_outreach',
    toolId: 'network',
    toolName: 'Network CRM',
    routePatterns: ['/suite/network'],
    title: 'Draft relationship-aware outreach',
    shortTitle: 'Draft outreach',
    description: 'Use contact context, role context, and proof stories to draft a message.',
    icon: 'contacts',
    inputs: ['contactId', 'company', 'jobTitle', 'storyId'],
    outputs: ['outreachDraft', 'followUpPlan', 'relationshipNotes'],
    stages: ['understand', 'create', 'verify'],
    approval: 'external',
    canRunInBackground: false,
    createsArtifacts: true,
    prompt: 'Draft a warm, specific networking message for the current contact or company. Keep it human, concise, and ready for my approval before anything is sent.',
  }),
  capability({
    id: 'applications.next_actions',
    toolId: 'applications',
    toolName: 'Applications',
    routePatterns: ['/suite/applications'],
    title: 'Review pipeline and choose next actions',
    shortTitle: 'Next actions',
    description: 'Prioritize follow-ups, interview prep, stale applications, and packet gaps.',
    icon: 'work',
    inputs: ['applications', 'resumeVersionId', 'followUpHistory'],
    outputs: ['priorityQueue', 'followUpDrafts', 'prepTasks'],
    stages: ['understand', 'plan', 'create'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Review my application pipeline and tell me what deserves action first. Prioritize follow-ups, interview prep, stale roles, and missing packet materials.',
  }),
  capability({
    id: 'vault.build_study_assets',
    toolId: 'skill-bridge',
    toolName: 'Skill Bridge Memory',
    routePatterns: ['/suite/skill-bridge', '/suite/vault', '/suite/gallery'],
    title: 'Turn a gap into study assets',
    shortTitle: 'Build study assets',
    description: 'Create flashcards, notes, drills, and review tasks from a job or skill gap.',
    icon: 'folder_open',
    inputs: ['skill', 'jobDescription', 'targetRole'],
    outputs: ['flashcards', 'studyPlan', 'reviewSchedule'],
    stages: ['understand', 'create', 'save'],
    approval: 'review',
    canRunInBackground: true,
    createsArtifacts: true,
    prompt: 'Turn my current skill or job gap into study assets. Create flashcards, drills, notes, and a review plan that help me prove the skill in interviews.',
  }),
  capability({
    id: 'salary.prepare_negotiation',
    toolId: 'offer-coach',
    toolName: 'Offer Coach',
    routePatterns: ['/suite/applications', '/suite/negotiate', '/suite/intelligence'],
    title: 'Prepare a compensation strategy',
    shortTitle: 'Offer strategy',
    description: 'Use role, market, and application context to plan negotiation moves.',
    icon: 'payments',
    inputs: ['company', 'jobTitle', 'salaryTarget', 'offerDetails'],
    outputs: ['rangeStrategy', 'talkingPoints', 'riskNotes'],
    stages: ['understand', 'plan', 'create'],
    approval: 'external',
    canRunInBackground: false,
    createsArtifacts: true,
    prompt: 'Help me prepare a salary strategy for this role. Give me a realistic range, leverage points, risks, and a concise script I can review before using.',
  }),
];

export function getSonaCapability(id?: string | null) {
  if (!id) return undefined;
  return SONA_CAPABILITIES.find(item => item.id === id);
}

export function getSonaCapabilitiesForPath(pathname = '') {
  const cleanPath = pathname.split('?')[0] || '';
  const direct = SONA_CAPABILITIES.filter(item =>
    item.routePatterns.some(pattern => cleanPath === pattern || cleanPath.startsWith(`${pattern}/`))
  );

  if (direct.length) return direct;
  if (cleanPath.startsWith('/suite/gallery')) {
    return SONA_CAPABILITIES.filter(item => ['writing.trust_rewrite', 'vault.build_study_assets'].includes(item.id));
  }
  return SONA_CAPABILITIES.filter(item => ['jobs.find_rank_prepare', 'resume.morph_for_job', 'applications.next_actions'].includes(item.id));
}

export function getPrimarySonaCapabilityForPath(pathname = '') {
  return getSonaCapabilitiesForPath(pathname)[0];
}
