export type ResumeExample = {
  slug: string;
  role: string;
  title: string;
  description: string;
  summary: string;
  keywords: string[];
  bullets: string[];
  sections: string[];
  mistakes: string[];
};

export type KeywordGuide = {
  slug: string;
  industry: string;
  title: string;
  description: string;
  keywordGroups: { label: string; terms: string[] }[];
  sampleBullets: string[];
  mistakes: string[];
};

export type InterviewGuide = {
  slug: string;
  role: string;
  title: string;
  description: string;
  questions: string[];
  answerMoves: string[];
  mistakes: string[];
};

export const RESUME_EXAMPLES: ResumeExample[] = [
  {
    slug: 'software-engineer',
    role: 'Software Engineer',
    title: 'Software Engineer Resume Example for ATS Screening',
    description: 'Use this software engineer resume example to shape ATS-safe structure, engineering keywords, and product impact for real job posts.',
    summary: 'Full-stack software engineer with 5 years of experience shipping React, Node.js, and cloud-native systems for high-traffic SaaS products.',
    keywords: ['TypeScript', 'React', 'Node.js', 'AWS', 'CI/CD', 'REST APIs', 'PostgreSQL', 'observability'],
    bullets: [
      'Built a React and Node.js billing workflow used by 42K monthly users, reducing checkout errors by 31%.',
      'Migrated legacy API jobs to AWS Lambda and SQS, cutting nightly processing time from 4 hours to 47 minutes.',
      'Added Datadog dashboards and alerting for core services, reducing mean time to detect incidents by 55%.',
    ],
    sections: ['Professional Summary', 'Technical Skills', 'Engineering Experience', 'Projects', 'Education'],
    mistakes: ['Listing every tool ever used', 'Skipping production metrics', 'Using vague phrases like "worked on backend"', 'Hiding technical skills inside paragraphs'],
  },
  {
    slug: 'project-manager',
    role: 'Project Manager',
    title: 'Project Manager Resume Example with Metrics',
    description: 'Write a project manager resume that shows delivery, stakeholder management, budget ownership, and measurable outcomes.',
    summary: 'Project manager with 7 years of experience leading cross-functional delivery across software, operations, and customer-facing programs.',
    keywords: ['Agile', 'Scrum', 'Jira', 'roadmaps', 'risk management', 'stakeholder management', 'budget tracking', 'process improvement'],
    bullets: [
      'Led a 14-person implementation team across product, engineering, and support to launch 3 enterprise integrations on schedule.',
      'Reduced project cycle time by 22% by introducing dependency mapping, weekly risk reviews, and clearer owner handoffs.',
      'Managed a $1.8M portfolio budget with monthly variance reporting and executive status updates.',
    ],
    sections: ['Professional Summary', 'Core Skills', 'Project Experience', 'Tools', 'Certifications'],
    mistakes: ['Describing responsibilities without outcomes', 'Overusing internal project names', 'Leaving out budget or team size', 'Making Agile the whole story'],
  },
  {
    slug: 'data-analyst',
    role: 'Data Analyst',
    title: 'Data Analyst Resume Example for Job Applications',
    description: 'Create a data analyst resume that highlights SQL, dashboards, experimentation, and business decisions influenced by analysis.',
    summary: 'Data analyst with 4 years of experience turning product, marketing, and revenue data into dashboards and decision-ready insights.',
    keywords: ['SQL', 'Python', 'Tableau', 'Power BI', 'A/B testing', 'cohort analysis', 'data modeling', 'ETL'],
    bullets: [
      'Built a Tableau retention dashboard used by product leaders to identify a 14% churn reduction opportunity.',
      'Wrote SQL models for funnel analysis across 2.1M events, improving weekly reporting accuracy by 28%.',
      'Partnered with marketing to evaluate paid channel performance and shift $240K toward higher-converting campaigns.',
    ],
    sections: ['Professional Summary', 'Analytics Skills', 'Experience', 'Projects', 'Education'],
    mistakes: ['Only listing tools', 'Not explaining business impact', 'Using charts as portfolio screenshots without context', 'Forgetting data quality work'],
  },
  {
    slug: 'product-manager',
    role: 'Product Manager',
    title: 'Product Manager Resume Example for 2026',
    description: 'Show product strategy, discovery, launch ownership, and measurable customer or revenue outcomes on your PM resume.',
    summary: 'Product manager with 6 years of experience leading B2B SaaS discovery, roadmap prioritization, and launches from concept to adoption.',
    keywords: ['roadmap', 'user research', 'experimentation', 'go-to-market', 'PRDs', 'analytics', 'activation', 'retention'],
    bullets: [
      'Launched a self-serve onboarding flow that increased trial activation from 38% to 54% in one quarter.',
      'Prioritized a roadmap across 120 customer requests using revenue impact, effort, and retention risk scoring.',
      'Ran 23 customer interviews and 4 experiments to validate a reporting feature before engineering kickoff.',
    ],
    sections: ['Professional Summary', 'Product Skills', 'Product Experience', 'Selected Launches', 'Education'],
    mistakes: ['Sounding like a project manager only', 'Leaving out discovery work', 'Skipping adoption metrics', 'Listing features without why they mattered'],
  },
  {
    slug: 'registered-nurse',
    role: 'Registered Nurse',
    title: 'Registered Nurse Resume Example for ATS Systems',
    description: 'Build a registered nurse resume with clinical skills, certifications, patient care metrics, and ATS-readable formatting.',
    summary: 'Registered nurse with 6 years of acute care experience supporting high-volume med-surg and telemetry units with strong patient safety outcomes.',
    keywords: ['RN', 'BLS', 'ACLS', 'EMR', 'patient assessment', 'medication administration', 'care coordination', 'HIPAA'],
    bullets: [
      'Managed care for 5 to 7 patients per shift while maintaining accurate EMR documentation and medication safety standards.',
      'Precepted 9 new nurses on telemetry protocols, escalation procedures, and patient communication expectations.',
      'Supported a unit fall-prevention initiative that reduced preventable incidents by 18% over 6 months.',
    ],
    sections: ['Professional Summary', 'Licenses and Certifications', 'Clinical Skills', 'Nursing Experience', 'Education'],
    mistakes: ['Burying license details', 'Leaving out unit type and patient load', 'Using nonstandard section names', 'Forgetting certifications recruiters filter for'],
  },
];

export const KEYWORD_GUIDES: KeywordGuide[] = [
  {
    slug: 'software-engineering',
    industry: 'Software Engineering',
    title: 'Software Engineering Resume Keywords for ATS',
    description: 'Use these software engineering resume keywords naturally across skills, projects, and achievement bullets.',
    keywordGroups: [
      { label: 'Languages', terms: ['TypeScript', 'Python', 'Java', 'Go', 'SQL', 'Rust'] },
      { label: 'Frontend and backend', terms: ['React', 'Next.js', 'Node.js', 'REST APIs', 'GraphQL', 'microservices'] },
      { label: 'Cloud and delivery', terms: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'observability'] },
    ],
    sampleBullets: [
      'Shipped a Next.js dashboard that reduced support ticket handling time by 26%.',
      'Built CI/CD checks that caught schema issues before deployment and cut rollback incidents by 40%.',
    ],
    mistakes: ['Keyword stuffing a skills block', 'Skipping impact metrics', 'Using acronyms without context'],
  },
  {
    slug: 'marketing',
    industry: 'Marketing',
    title: 'Marketing Resume Keywords for Growth Roles',
    description: 'Target marketing roles with keywords around acquisition, lifecycle, brand, analytics, and campaign performance.',
    keywordGroups: [
      { label: 'Acquisition', terms: ['SEO', 'paid search', 'paid social', 'conversion rate optimization', 'landing pages', 'demand generation'] },
      { label: 'Lifecycle', terms: ['email marketing', 'segmentation', 'CRM', 'retention', 'nurture campaigns', 'marketing automation'] },
      { label: 'Analytics', terms: ['GA4', 'attribution', 'A/B testing', 'CAC', 'LTV', 'pipeline influence'] },
    ],
    sampleBullets: [
      'Improved landing page conversion from 4.8% to 7.1% through message testing and stronger proof points.',
      'Built a lifecycle email sequence that generated $380K in influenced pipeline over 2 quarters.',
    ],
    mistakes: ['Saying "managed campaigns" without channel data', 'Ignoring revenue metrics', 'Listing platforms without outcomes'],
  },
  {
    slug: 'finance',
    industry: 'Finance',
    title: 'Finance Resume Keywords for Analysts and Managers',
    description: 'Use finance resume keywords that signal modeling, reporting, controls, forecasting, and business partnership.',
    keywordGroups: [
      { label: 'Planning', terms: ['FP&A', 'forecasting', 'budgeting', 'variance analysis', 'scenario modeling', 'cash flow'] },
      { label: 'Accounting and controls', terms: ['GAAP', 'SOX', 'audit', 'month-end close', 'reconciliation', 'compliance'] },
      { label: 'Tools', terms: ['Excel', 'Power BI', 'Tableau', 'SAP', 'NetSuite', 'SQL'] },
    ],
    sampleBullets: [
      'Built a rolling forecast model that improved revenue forecast accuracy by 17%.',
      'Automated monthly variance reporting and saved 12 analyst hours per close cycle.',
    ],
    mistakes: ['Leaving out scale of budget ownership', 'Using generic "financial analysis"', 'Not separating accounting and FP&A language'],
  },
  {
    slug: 'healthcare',
    industry: 'Healthcare',
    title: 'Healthcare Resume Keywords for ATS Systems',
    description: 'Match healthcare job descriptions with clinical, compliance, patient care, and operations keywords.',
    keywordGroups: [
      { label: 'Clinical care', terms: ['patient assessment', 'care coordination', 'clinical documentation', 'medication administration', 'triage', 'discharge planning'] },
      { label: 'Compliance', terms: ['HIPAA', 'quality improvement', 'patient safety', 'infection control', 'risk management', 'chart audits'] },
      { label: 'Systems', terms: ['Epic', 'Cerner', 'EMR', 'EHR', 'telehealth', 'claims documentation'] },
    ],
    sampleBullets: [
      'Coordinated discharge planning for high-risk patients and improved follow-up appointment completion by 21%.',
      'Completed EMR documentation audits that reduced missing chart fields by 32%.',
    ],
    mistakes: ['Hiding certifications', 'Missing patient volume', 'Using informal unit abbreviations only'],
  },
  {
    slug: 'project-management',
    industry: 'Project Management',
    title: 'Project Management Resume Keywords and Skills',
    description: 'Add project management keywords that show delivery discipline, stakeholder leadership, and measurable execution.',
    keywordGroups: [
      { label: 'Delivery', terms: ['Agile', 'Scrum', 'Waterfall', 'program management', 'resource planning', 'milestone tracking'] },
      { label: 'Risk and communication', terms: ['risk register', 'stakeholder management', 'executive reporting', 'change management', 'RACI', 'dependency management'] },
      { label: 'Tools', terms: ['Jira', 'Asana', 'Smartsheet', 'Microsoft Project', 'Confluence', 'Monday.com'] },
    ],
    sampleBullets: [
      'Recovered a delayed implementation by resetting scope, owners, and risk reviews, delivering 3 weeks ahead of the revised deadline.',
      'Created executive dashboards that improved portfolio visibility across 18 active projects.',
    ],
    mistakes: ['Listing tools before outcomes', 'Leaving out team size', 'Calling every task a strategic initiative'],
  },
];

export const INTERVIEW_GUIDES: InterviewGuide[] = [
  {
    slug: 'software-engineer',
    role: 'Software Engineer',
    title: 'Software Engineer Interview Questions and STAR Answers',
    description: 'Practice software engineer interview questions on system design, debugging, collaboration, and technical tradeoffs.',
    questions: [
      'Tell me about a time you debugged a production issue.',
      'How do you decide between shipping quickly and improving technical quality?',
      'Describe a project where you had to work across product and design.',
      'How would you design a rate-limited API for a high-traffic service?',
    ],
    answerMoves: ['State the system and stakes clearly', 'Name the tradeoff you made', 'Quantify the outcome', 'Explain what you would improve now'],
    mistakes: ['Only describing code', 'Skipping collaboration details', 'Giving a perfect answer with no learning'],
  },
  {
    slug: 'project-manager',
    role: 'Project Manager',
    title: 'Project Manager Interview Questions and Prep',
    description: 'Prepare for project manager interviews with questions about delivery risk, stakeholders, timelines, and conflict.',
    questions: [
      'Tell me about a project that went off track.',
      'How do you handle a stakeholder who keeps changing scope?',
      'Describe your process for identifying project risks.',
      'How do you communicate delays to executives?',
    ],
    answerMoves: ['Show how you created clarity', 'Explain your communication cadence', 'Use numbers for scope and timeline', 'End with the business result'],
    mistakes: ['Blaming other teams', 'Over-indexing on tools', 'Not showing executive judgment'],
  },
  {
    slug: 'data-analyst',
    role: 'Data Analyst',
    title: 'Data Analyst Interview Questions and Practice',
    description: 'Practice data analyst interview questions about SQL, dashboards, business metrics, and explaining insights.',
    questions: [
      'Tell me about an analysis that changed a business decision.',
      'How do you validate whether a dataset is reliable?',
      'What metrics would you track for a subscription product?',
      'Explain a dashboard you built and how people used it.',
    ],
    answerMoves: ['Connect analysis to a decision', 'Discuss data quality checks', 'Define the metric logic', 'Share the action taken from the insight'],
    mistakes: ['Reciting SQL syntax only', 'Not explaining stakeholders', 'Missing the business recommendation'],
  },
  {
    slug: 'product-manager',
    role: 'Product Manager',
    title: 'Product Manager Interview Questions and Frameworks',
    description: 'Prepare for PM interviews with product sense, prioritization, execution, discovery, and launch questions.',
    questions: [
      'How would you prioritize this roadmap?',
      'Tell me about a feature that failed.',
      'How do you know whether a product change worked?',
      'Design an onboarding experience for a new user segment.',
    ],
    answerMoves: ['Clarify the user and business goal', 'Define constraints before solutioning', 'Pick success metrics', 'Name what you would test first'],
    mistakes: ['Jumping to features too fast', 'Ignoring tradeoffs', 'Using vanity metrics only'],
  },
  {
    slug: 'customer-success-manager',
    role: 'Customer Success Manager',
    title: 'Customer Success Manager Interview Questions',
    description: 'Practice CSM interview questions about renewals, adoption, escalations, onboarding, and customer health.',
    questions: [
      'Tell me about a time you saved an at-risk account.',
      'How do you run a customer onboarding process?',
      'What signals tell you an account is unhealthy?',
      'How do you handle an angry executive sponsor?',
    ],
    answerMoves: ['Show customer empathy and commercial judgment', 'Use health metrics', 'Explain your escalation path', 'Close with retention or adoption impact'],
    mistakes: ['Sounding like support only', 'Not mentioning revenue risk', 'Skipping cross-functional coordination'],
  },
];

export const SEO_ROUTES = [
  ...RESUME_EXAMPLES.map((item) => `/resume-examples/${item.slug}`),
  ...KEYWORD_GUIDES.map((item) => `/resume-keywords/${item.slug}`),
  ...INTERVIEW_GUIDES.map((item) => `/interview-questions/${item.slug}`),
];
