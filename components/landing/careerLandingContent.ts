export type CareerModeId = 'resume' | 'job-match' | 'writing-trust' | 'quick-polish';

export interface CareerMode {
  id: CareerModeId;
  label: string;
  icon: string;
  description: string;
  placeholder: string;
  limitLabel: string;
  wordCap: number | null;
  cta: string;
  accent: string;
}

export const heroProofPoints = [
  { value: 'Free', label: 'career check' },
  { value: '22+', label: 'career tools' },
  { value: 'ATS', label: 'resume signals' },
  { value: 'Sona', label: 'career agent' },
];

export const careerModes: CareerMode[] = [
  {
    id: 'resume',
    label: 'Resume',
    icon: 'assignment_turned_in',
    description: 'Check ATS structure, clarity, and recruiter-readable signals.',
    placeholder: 'Paste resume text, a resume summary, or bullet points you want to check...',
    limitLabel: '500 words',
    wordCap: 500,
    cta: 'Check resume',
    accent: '#10b981',
  },
  {
    id: 'job-match',
    label: 'Job Match',
    icon: 'work_history',
    description: 'Compare your career story against a role and spot missing proof.',
    placeholder: 'Paste your resume text, then add the job description below it. Use headings like Resume: and Job description: if you want sharper matching...',
    limitLabel: '1,200 words',
    wordCap: 1200,
    cta: 'Analyze match',
    accent: '#38bdf8',
  },
  {
    id: 'writing-trust',
    label: 'Writing Trust',
    icon: 'radar',
    description: 'Scan career writing for generic AI patterns and low-trust phrasing.',
    placeholder: 'Paste a cover letter, LinkedIn section, recruiter reply, or AI-assisted career draft...',
    limitLabel: '1,500 words',
    wordCap: 1500,
    cta: 'Scan trust',
    accent: '#f59e0b',
  },
  {
    id: 'quick-polish',
    label: 'Quick Polish',
    icon: 'auto_fix_high',
    description: 'Humanize a short draft while preserving facts, numbers, and intent.',
    placeholder: 'Paste a resume bullet, cover letter paragraph, or recruiter reply to polish...',
    limitLabel: '300 words, 3/day',
    wordCap: 300,
    cta: 'Polish draft',
    accent: '#22c55e',
  },
];

export const careerSamples: Record<string, { label: string; mode: CareerModeId; text: string }> = {
  resume: {
    label: 'Try resume sample',
    mode: 'resume',
    text: `Customer Success Manager

Managed enterprise customers and helped improve onboarding processes. Worked with sales, product, and support teams to resolve issues and increase customer satisfaction.

Experience
Acme Software, Customer Success Manager
- Responsible for onboarding new customers and answering questions.
- Worked cross-functionally to improve customer workflows.
- Helped customers use product features and renew contracts.`,
  },
  coverLetter: {
    label: 'Try cover letter sample',
    mode: 'quick-polish',
    text: `I am writing to express my interest in the Product Operations role. My background has allowed me to leverage cross-functional collaboration and strategic communication to drive meaningful improvements across business workflows. I believe my skills would make me a strong candidate for this position.`,
  },
  recruiter: {
    label: 'Try recruiter reply',
    mode: 'writing-trust',
    text: `Thank you for reaching out. I would be interested in learning more about the opportunity and discussing my qualifications. My background appears to align well with the responsibilities listed, and I am available for a conversation at your convenience.`,
  },
};

export const careerJourney = [
  { icon: 'description', title: 'Create the resume', text: 'Shape your experience into clear evidence, not vague responsibility lists.' },
  { icon: 'track_changes', title: 'Match the role', text: 'Compare your story against the job and identify the proof you still need.' },
  { icon: 'edit_document', title: 'Tailor the letter', text: 'Turn interest into a role-specific argument a hiring team can believe.' },
  { icon: 'auto_fix_high', title: 'Polish the voice', text: 'Make AI-assisted writing sound specific, credible, and yours.' },
  { icon: 'fact_check', title: 'Track applications', text: 'Keep follow-ups, stages, and next moves from disappearing into tabs.' },
  { icon: 'forum', title: 'Prepare interviews', text: 'Convert resume proof into stories, answers, and confident follow-ups.' },
  { icon: 'auto_awesome', title: 'Use Sona', text: 'Bring the next best action back into view when the process gets noisy.' },
];

export const commandModules = [
  { icon: 'assignment_turned_in', title: 'ATS Analyzer', text: 'Resume structure, keywords, and missing sections.', accent: '#10b981', href: '/tools/ats-analyzer' },
  { icon: 'description', title: 'Resume Builder', text: 'Build a role-ready resume from your real experience.', accent: '#f97316', href: '/tools/resume-builder' },
  { icon: 'auto_fix_high', title: 'AI Humanizer', text: 'Polish career writing without changing the meaning.', accent: '#22c55e', href: '/tools/ai-humanizer' },
  { icon: 'radar', title: 'AI Detector', text: 'Review generic AI patterns as editing signals.', accent: '#38bdf8', href: '/tools/ai-detector' },
  { icon: 'work_history', title: 'Job Tracker', text: 'Track roles, follow-ups, stages, and momentum.', accent: '#a78bfa', href: '/suite/applications' },
  { icon: 'forum', title: 'Interview Prep', text: 'Practice answers with structure and evidence.', accent: '#f43f5e', href: '/tools/interview-prep' },
];

export const beforeAfterExamples = [
  {
    label: 'Resume bullet',
    before: 'Responsible for managing cross-functional projects and improving operational efficiency across multiple stakeholders.',
    after: 'Led 6 partners across product, sales, and operations to cut onboarding delays by 31% in one quarter.',
    metric: 'Specificity up',
    weakWords: ['Responsible for', 'improving', 'operational efficiency', 'multiple stakeholders'],
    scoreBefore: 38,
    scoreAfter: 91,
  },
  {
    label: 'Cover letter opening',
    before: 'I am excited to apply because my comprehensive background aligns well with the requirements of this esteemed organization.',
    after: 'Your team needs someone who can turn messy workflows into shipped systems. That is the product operations work I have done for the last three years.',
    metric: 'Cliche density down',
    weakWords: ['excited to apply', 'comprehensive background', 'aligns well', 'esteemed organization'],
    scoreBefore: 29,
    scoreAfter: 87,
  },
  {
    label: 'Recruiter reply',
    before: 'Thank you for reaching out. I would be interested in learning more about the opportunity and discussing my qualifications.',
    after: 'Thanks for reaching out. The role looks close to the product ops work I enjoy most, especially the systems and stakeholder piece.',
    metric: 'Voice clarity up',
    weakWords: ['would be interested', 'learning more about the opportunity', 'discussing my qualifications'],
    scoreBefore: 42,
    scoreAfter: 88,
  },
  {
    label: 'Interview answer',
    before: 'I am a strong communicator and I work well with teams to solve problems and deliver results.',
    after: 'When onboarding delays rose, I mapped the handoff, found two approval bottlenecks, and rebuilt the weekly review so sales and support could resolve blockers before launch.',
    metric: 'Evidence added',
    weakWords: ['strong communicator', 'work well with teams', 'solve problems', 'deliver results'],
    scoreBefore: 34,
    scoreAfter: 93,
  },
];

export const dailyCareerUseCases = [
  { icon: 'today', title: 'Tailor today\'s application', text: 'Paste the role, check the fit, and improve the strongest sections first.' },
  { icon: 'mail', title: 'Reply to a recruiter', text: 'Sound interested and specific without sounding like a template.' },
  { icon: 'badge', title: 'Refresh LinkedIn', text: 'Turn flat profile copy into a clearer career story.' },
  { icon: 'manage_search', title: 'Review ATS signals', text: 'Catch missing sections, weak structure, and vague role language.' },
  { icon: 'psychology', title: 'Prep for interviews', text: 'Turn resume proof into answers that are structured and memorable.' },
  { icon: 'notifications_active', title: 'Follow up cleanly', text: 'Draft timely notes and keep application momentum visible.' },
];

export const sonaMoments = [
  'Remembers your target roles and strongest proof points.',
  'Suggests the next move after a resume check or job match.',
  'Turns scattered drafts into saved career workflows.',
  'Helps prepare follow-ups, interview stories, and application context.',
];

export const sonaChatMessages = [
  { role: 'user' as const, text: 'Should I apply to this Senior Frontend role at Stripe?' },
  { role: 'assistant' as const, text: '87% fit score. Your React + TypeScript experience is a strong match. Gap: they require GraphQL — add it to your skill queue. Salary range: $165k-$195k.' },
  { role: 'user' as const, text: 'Draft a cover letter for it' },
  { role: 'assistant' as const, text: 'Done — tailored to Stripe\'s engineering culture. Highlighted your fintech experience with 3 ATS keywords from their JD. Check your Cover Letter tool.' },
  { role: 'user' as const, text: 'What about the interview?' },
  { role: 'assistant' as const, text: 'Stripe favors system design + culture fit. I\'ve loaded 8 behavioral questions into your Simulator. Start with "design a payment flow" — their top question this quarter.' },
];

export const sonaMemoryTimeline = [
  { label: 'Resume analyzed', icon: 'description', time: '2 days ago' },
  { label: 'Job match found', icon: 'troubleshoot', time: 'Yesterday' },
  { label: 'Cover letter drafted', icon: 'edit_document', time: '6 hours ago' },
  { label: 'Interview prep loaded', icon: 'forum', time: 'Just now' },
];

export const pricingTeasers = [
  { name: 'Free', label: 'Start here', text: 'Career Check, Humanizer preview, Detector, Word Counter, Grammar, ATS checks, and basic tools.' },
  { name: 'Pro', label: 'More room', text: 'Saved workflows, larger writing limits, resume morphing, cover letters, and interview practice.' },
  { name: 'Studio', label: 'Career system', text: 'Sona context, job tracking, deeper career intelligence, exports, and advanced workflows.' },
];

export const faqItems = [
  {
    q: 'What is the free Career Check?',
    a: 'It is a fast way to paste resume text, a job description, or career writing and get a useful next step before creating an account.',
    icon: 'track_changes',
    relatedTool: 'Career Check',
    tip: 'No signup required — paste and check in 30 seconds.',
  },
  {
    q: 'Is Talent Studio only an AI Humanizer?',
    a: 'No. The Humanizer is one useful entry point. Talent Studio is a career platform for resumes, ATS checks, cover letters, LinkedIn, job tracking, interview prep, and Sona.',
    icon: 'dashboard',
    relatedTool: '22+ Career Tools',
    tip: 'One workspace for everything from first draft to interview day.',
  },
  {
    q: 'Can I use this as a resume ATS checker?',
    a: 'Yes. The free resume check reviews structure, sections, and readability signals. Full saved workflows are available after signup.',
    icon: 'assignment_turned_in',
    relatedTool: 'ATS Analyzer',
    tip: 'Checks section order, keyword density, and formatting signals.',
  },
  {
    q: 'Does the AI Humanizer guarantee detector results?',
    a: 'No. Detector scores are indicators, not proof. Talent Studio focuses on better writing, clearer evidence, and responsible review before submission.',
    icon: 'verified_user',
    relatedTool: 'Writing Trust',
    tip: 'Scores guide editing — they are not guarantees.',
  },
  {
    q: 'Will Talent Studio invent experience for me?',
    a: 'No. The product should preserve your real facts, numbers, roles, and achievements. It helps communicate your experience more clearly.',
    icon: 'shield',
    relatedTool: 'Fact Preservation',
    tip: 'Your real data stays real — we only improve how it reads.',
  },
  {
    q: 'Why would I come back daily?',
    a: 'Job search work is daily work: tailoring applications, replying to recruiters, tracking follow-ups, checking fit, and preparing for interviews.',
    icon: 'event_repeat',
    relatedTool: 'Job Tracker + Sona',
    tip: 'Sona remembers your goals and surfaces the next step.',
  },
];

export const allToolsList = [
  { icon: 'assignment_turned_in', label: 'ATS Analyzer' },
  { icon: 'description', label: 'Resume Builder' },
  { icon: 'auto_fix_high', label: 'AI Humanizer' },
  { icon: 'radar', label: 'AI Detector' },
  { icon: 'forum', label: 'Interview Prep' },
  { icon: 'work_history', label: 'Job Tracker' },
  { icon: 'edit_document', label: 'Cover Letter' },
  { icon: 'auto_awesome', label: 'Sona Agent' },
  { icon: 'track_changes', label: 'Career Check' },
  { icon: 'troubleshoot', label: 'Job Match' },
  { icon: 'spellcheck', label: 'Grammar Checker' },
  { icon: 'autorenew', label: 'Paraphraser' },
  { icon: 'tag', label: 'Word Counter' },
  { icon: 'format_quote', label: 'Citation Machine' },
  { icon: 'psychology', label: 'Tone Analyzer' },
  { icon: 'compress', label: 'Summarizer' },
  { icon: 'mail', label: 'Email Composer' },
  { icon: 'badge', label: 'LinkedIn Optimizer' },
  { icon: 'scanner', label: 'ATS Preview' },
  { icon: 'payments', label: 'Salary Coach' },
  { icon: 'route', label: 'Skill Bridge' },
  { icon: 'neurology', label: 'Career Intelligence' },
];

export const workflowSteps = [
  { id: 'upload', step: '01', icon: 'outbox', title: 'Upload Resume', desc: 'PDF, Word, or text' },
  { id: 'check', step: '02', icon: 'track_changes', title: 'Career Check', desc: 'ATS + trust signals' },
  { id: 'morph', step: '03', icon: 'psychology', title: 'AI Polish', desc: 'Smart rewrite engine' },
  { id: 'apply', step: '04', icon: 'send', title: 'Apply', desc: 'Track and follow up' },
];
