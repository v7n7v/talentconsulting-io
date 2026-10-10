export interface ToolHelpOverview {
  title: string;
  subtitle: string;
  steps: Array<{ title: string; description: string }>;
  tips?: string[];
}

/** Existing help IDs stay available as readable overviews while live adapters roll out. */
export const TOOL_HELP_OVERVIEWS: Record<string, ToolHelpOverview> = {
  intelligence: {
    title: 'Career insights', subtitle: 'Inspect recorded work and choose a useful next action.',
    steps: [
      { title: 'Review the snapshot', description: 'Read next actions and the update time. Suggestions are planning guidance, not predictions of hiring success.' },
      { title: 'Inspect the evidence', description: 'Expand the scoring details to see the records behind a suggestion. Resume-listed skills are self-reported.' },
      { title: 'Choose what to do next', description: 'Open the relevant work or refresh insights after changing source records. Missing records stay unmeasured.' },
    ],
  },
  'ats-analyzer': {
    title: 'ATS Analyzer', subtitle: 'Inspect structural observations or compare resume keywords with a posting.',
    steps: [
      { title: 'Choose a check', description: 'ATS Preview checks structured resume fields. Match Score compares supplied resume text with a job description.' },
      { title: 'Check the source', description: 'Choose the available resume source or supply the text required by the selected check.' },
      { title: 'Run and review', description: 'Run the check when ready, then inspect the observations and missing information before deciding which edits to make.' },
    ],
    tips: ['Preview does not parse an exported file or run a vendor ATS. Structural and keyword checks do not establish an employer’s ATS result or hiring probability.'],
  },
  'ats-preview': {
    title: 'ATS Preview', subtitle: 'Review educational structural checks on saved resume fields.',
    steps: [
      { title: 'Choose your resume', description: 'Check which saved resume is being used. Create or save a resume first if none is available.' },
      { title: 'Choose a preset', description: 'Select the available educational preset and run the structural check yourself.' },
      { title: 'Review observations', description: 'Inspect parsed fields, partial or missing information, and suggested structural changes. Recheck after editing the document.' },
    ],
    tips: ['This checks structured resume fields. It does not parse the exported file, run a vendor ATS, or show the recruiter’s actual screen.'],
  },
  'ats-score': {
    title: 'Match Score', subtitle: 'Compare resume text with requirements in a supplied posting.',
    steps: [
      { title: 'Supply the source and posting', description: 'Check the available resume context and add the job description required by the form.' },
      { title: 'Run the comparison', description: 'Request the check yourself and inspect the actual returned observations.' },
      { title: 'Review before editing', description: 'Check matching terms and gaps against your real experience. A missing term does not prove you lack the skill.' },
    ],
    tips: ['A keyword score is not an employer’s ATS result, a qualification decision, or a hiring probability.'],
  },
  stories: {
    title: 'Story Bank', subtitle: 'Keep real examples ready for behavioral interviews.',
    steps: [
      { title: 'Capture a real example', description: 'Add a story using Situation, Task, Action, and Result. Use only events and outcomes you can support.' },
      { title: 'Review saved stories', description: 'Use tags and category coverage to find the examples you have recorded and the categories without one.' },
      { title: 'Match a question', description: 'Use the question matcher to consider relevant examples. Check any suggested answer against what actually happened.' },
    ],
  },
  quality: {
    title: 'Application Quality', subtitle: 'Read metrics from recorded applications.',
    steps: [
      { title: 'Check the basis', description: 'Review which recorded applications contribute to a metric. A missing fit measurement remains unknown.' },
      { title: 'Read the funnel', description: 'Compare submitted applications, interviews, and offer milestones. A prepared draft is not a submission.' },
      { title: 'Choose a follow-up', description: 'Open a recorded application to inspect its current status and decide your next action.' },
    ],
    tips: ['These are descriptions of your records, not benchmarks against other applicants.'],
  },
  pulse: {
    title: 'Weekly review', subtitle: 'Record a check-in and reflect on your search.',
    steps: [
      { title: 'Write a check-in', description: 'Record morale, what went well, what was difficult, and a focus for next week.' },
      { title: 'Review your history', description: 'Compare the check-ins you have recorded. Without check-ins, morale and trends remain unmeasured.' },
      { title: 'Choose a next step', description: 'Use the reflection to plan a manageable action. Any risk indicator is a planning heuristic, not a medical assessment.' },
    ],
  },
  vault: {
    title: 'Skill Bridge Memory', subtitle: 'Find saved preparation materials.',
    steps: [
      { title: 'Search saved material', description: 'Search the materials present in your account by keyword.' },
      { title: 'Use a filter', description: 'Narrow the list using the available category filters.' },
      { title: 'Review the source', description: 'Open a plan, note, proof summary, or card set to inspect its contents before using it.' },
    ],
  },
  'interview-debrief': {
    title: 'Interview Debrief', subtitle: 'Record what happened and what to practice next.',
    steps: [
      { title: 'Record the interview', description: 'Create a debrief with the company, role, round, questions, and your recollection.' },
      { title: 'Describe your confidence', description: 'Record your own confidence honestly. A self-rating is not an independently measured readiness score.' },
      { title: 'Review saved debriefs', description: 'Inspect saved records and use recurring questions or difficulties to choose your next practice.' },
    ],
  },
  'cover-letter': {
    title: 'Cover Letter Studio', subtitle: 'Prepare a draft grounded in your source and a posting.',
    steps: [
      { title: 'Check source and posting', description: 'Review the available resume context and add the complete job description.' },
      { title: 'Generate when ready', description: 'Request a letter draft. Check any proposed claim against your actual experience.' },
      { title: 'Review and use', description: 'Edit the draft before copying or using it. Creating a letter does not submit an application.' },
    ],
  },
  linkedin: {
    title: 'LinkedIn Optimizer', subtitle: 'Draft clearer profile text using the context you supply.',
    steps: [
      { title: 'Supply profile context', description: 'Add the current profile text and any target context requested by the form.' },
      { title: 'Request suggestions', description: 'Generate draft improvements and inspect the supplied basis.' },
      { title: 'Review before updating', description: 'Check responsibilities, dates, skills, and meaning. You decide what to copy into LinkedIn yourself.' },
    ],
    tips: ['Suggestions do not measure recruiter search behavior or guarantee profile visibility.'],
  },
  negotiate: {
    title: 'Offer planning', subtitle: 'Compare a real offer and prepare language for your decision.',
    steps: [
      { title: 'Open the offer in Applications', description: 'Choose a tracked application at offer stage. Record its compensation, deadline, and your priorities in the offer drawer.' },
      { title: 'Review the brief', description: 'Generate a planning draft when ready. Verify assumptions and distinguish supplied compensation from an estimate.' },
      { title: 'Choose a response', description: 'Review any proposed language before using it. Record only a decision or response that actually happened.' },
    ],
    tips: ['The tool prepares language; it does not send a counteroffer.'],
  },
  'jd-generator': {
    title: 'Job description writer', subtitle: 'Draft a role description from the requirements you supply.',
    steps: [
      { title: 'Describe the role', description: 'Enter the role, seniority, team context, and company information. Add compensation only when you have it.' },
      { title: 'Generate a draft', description: 'Choose the available style and request a description when ready.' },
      { title: 'Review and retain', description: 'Edit requirements and inspect language suggestions before saving a template or downloading. Suggestions are not a compliance certification.' },
    ],
  },
  flashcards: {
    title: 'Flashcards', subtitle: 'Study cards for a chosen preparation topic.',
    steps: [
      { title: 'Choose a topic', description: 'Supply the topic or available resume context for the card set.' },
      { title: 'Study the cards', description: 'Review questions and answers. Check technical claims against a reliable source.' },
      { title: 'Keep useful material', description: 'Use the available save control to retain a set. A generated set is not saved until that operation succeeds.' },
    ],
  },
  'market-oracle': {
    title: 'Analyze a role', subtitle: 'Compare a supplied posting with your resume evidence.',
    steps: [
      { title: 'Choose your source', description: 'Select a confirmed library resume or supply text for analysis. Packet preparation needs a confirmed library source.' },
      { title: 'Add the posting', description: 'Supply the complete description and check the role, company, and optional posting context.' },
      { title: 'Inspect exact evidence', description: 'Review each requirement beside its matching excerpt. Partial and missing evidence stay visible; keyword coverage does not establish qualifications.' },
      { title: 'Choose a next step', description: 'Improve your source, track the role, or prepare an eligible packet for review. Changed inputs need a fresh analysis.' },
    ],
    tips: ['Compensation is read from the supplied posting. This tool does not establish market-wide demand, employer culture, or interview probability.'],
  },
  'writing-tools': {
    title: 'Humanize writing', subtitle: 'Revise a draft, compare changes, and keep control of the facts.',
    steps: [
      { title: 'Bring your draft', description: 'Paste text or import TXT/DOCX. Imports keep text rather than the original page layout.' },
      { title: 'Choose purpose and tone', description: 'Choose the available writing settings and request Humanize. Scan is optional.' },
      { title: 'Review the changes', description: 'Compare before and after and keep or reject edits. Check names, numbers, responsibilities, and meaning yourself.' },
      { title: 'Retain accepted text', description: 'Copy or export the text shown in the editor. Account storage is distinct from work retained in this tab.' },
    ],
    tips: ['Scan, Diagnose, and Verify are optional language checks. They do not establish authorship, factual accuracy, or plagiarism.'],
  },
  'job-search': {
    title: 'Find roles', subtitle: 'Search for roles, inspect the evidence, and choose your next step.',
    steps: [
      { title: 'Set your direction', description: 'Enter a target role and location. Keep the constraints that matter to you.' },
      { title: 'Choose a source if useful', description: 'A confirmed resume supports experience comparisons and eligible packet preparation. Browsing remains possible without one.' },
      { title: 'Search and inspect', description: 'Run Search yourself. Open a returned role to inspect posting facts, source information, fit evidence, and missing measurements.' },
      { title: 'Choose a next step', description: 'Save a role, keep exploring, open an available verified posting, or prepare an eligible draft for review. Preparation and opening a posting are not submission.' },
    ],
    tips: ['A save is recorded only when it succeeds. Changing source or search inputs can make an earlier result outdated.'],
  },
  resume: {
    title: 'Your resumes', subtitle: 'Bring a real source, review edits, and inspect the document before saving or downloading.',
    steps: [
      { title: 'Start from your source', description: 'Upload a resume, paste its text, start blank, or reopen a saved version. Review extracted facts before confirming an import.' },
      { title: 'Choose a target', description: 'Continue without tailoring or add a real job description. Preserve the distinction between the confirmed source and a proposed draft.' },
      { title: 'Review the content', description: 'Edit sections and inspect proposed changes. Unsupported skills, dates, credentials, employers, and metrics cannot be invented.' },
      { title: 'Inspect design and export', description: 'Choose the document design and inspect the actual preview. Resolve export blockers before downloading or saving a version.' },
    ],
    tips: ['Saved to your account, retained in this tab, and downloaded are different states. A document check is not a universal ATS pass.'],
  },
  'skill-bridge': {
    title: 'Skill Bridge', subtitle: 'Plan study, attempt checks, and inspect recorded evidence.',
    steps: [
      { title: 'Choose a skill or gap', description: 'Use real source context or a manual target to decide what to study.' },
      { title: 'Build a study plan', description: 'Generate and review a focused plan. A plan does not establish that a skill has been learned.' },
      { title: 'Attempt and review', description: 'Use available checks or challenges and inspect the resulting evidence. An automated assessment is not a professional certification.' },
      { title: 'Revisit saved material', description: 'Open Memory to inspect saved plans, notes, and proof summaries before your next attempt.' },
    ],
  },
  network: {
    title: 'Network', subtitle: 'Keep relationship context and follow-ups organized.',
    steps: [
      { title: 'Add a real contact', description: 'Record contact details, notes, and an optional application link.' },
      { title: 'Record a touch', description: 'Log an actual conversation or message and set the next follow-up date.' },
      { title: 'Review the next action', description: 'Inspect due follow-ups or ask Taco to draft language. Review the draft before sending it yourself.' },
    ],
    tips: ['Recording a touch or drafting a message does not send outreach.'],
  },
  analytics: {
    title: 'Application results', subtitle: 'Inspect outcomes recorded in your application history.',
    steps: [
      { title: 'Check the records', description: 'Review the applications included in the current snapshot. Drafts and submitted applications are distinct.' },
      { title: 'Inspect trends', description: 'Read status and milestone breakdowns with their underlying counts. Missing measurements remain unknown.' },
      { title: 'Update actual events', description: 'Open the relevant application when a status or outcome needs correction. These metrics describe records rather than predict hiring success.' },
    ],
  },
  gallery: {
    title: 'Writing Toolkit', subtitle: 'Complete a focused writing task using your draft or source material.',
    steps: [
      { title: 'Choose a task', description: 'Choose the available writing utility for the result you need.' },
      { title: 'Supply real context', description: 'Add the draft, notes, source information, or message goal required by that utility.' },
      { title: 'Review and use', description: 'Check the output and copy the text you want to use. Review any claims and references before relying on them.' },
    ],
    tips: ['A citation draft needs source checking. Writing utilities do not establish authorship or factual accuracy.'],
  },
  agent: {
    title: 'Ask Taco', subtitle: 'Discuss your career work and review suggested next steps.',
    steps: [
      { title: 'State your goal', description: 'Describe the career question or work you want help with, using context you are comfortable supplying.' },
      { title: 'Inspect the response', description: 'Read the explanation and check proposed claims against your real experience and the available sources.' },
      { title: 'Choose an action', description: 'Review any tool draft or proposed next step. A conversation does not establish that work was saved, sent, or submitted.' },
    ],
    tips: ['You retain control of external messages and applications.'],
  },
  applications: {
    title: 'Applications', subtitle: 'Track real applications and review prepared documents.',
    steps: [
      { title: 'Open or add an application', description: 'Choose a real tracked item or record an application manually.' },
      { title: 'Review the current work', description: 'Inspect linked sources, documents, notes, and the current draft revision before approving a packet.' },
      { title: 'Record actual events', description: 'Record submission, interviews, offers, or follow-ups only when they happened. Approval and opening a posting do not submit an application.' },
    ],
    tips: ['A saved note, approved draft, downloaded document, and submitted application are distinct outcomes.'],
  },
  feedback: {
    title: 'Feedback', subtitle: 'Describe an issue or suggestion for the product.',
    steps: [
      { title: 'Choose the context', description: 'Select the available category and describe where the issue or suggestion applies.' },
      { title: 'Write the details', description: 'Explain what happened, what you expected, and any steps that help reproduce an issue. Avoid including secrets.' },
      { title: 'Submit when ready', description: 'Use Submit yourself and check the actual confirmation. If submission fails, retain the text and retry when appropriate.' },
    ],
  },
  'interview-sim': {
    title: 'Interview prep', subtitle: 'Practice with real context and review the resulting feedback.',
    steps: [
      { title: 'Choose context and mode', description: 'Use the available application, resume, job description, stories, and practice mode.' },
      { title: 'Start and answer', description: 'Start a session yourself. Use typed or available voice practice and answer from your actual experience.' },
      { title: 'Inspect feedback', description: 'Review the transcript, available grades, and suggested next drills. Missing or failed feedback stays unscored.' },
      { title: 'Check retention', description: 'A debrief is saved only after saving succeeds. Use the available retry control if grading or saving fails.' },
    ],
    tips: ['Practice feedback is guidance, not a prediction of interview performance.'],
  },
  'agent-queue': {
    title: 'Needs review', subtitle: 'Inspect prepared application packets before choosing what to do.',
    steps: [
      { title: 'Open a real packet', description: 'Select an available queued item and inspect its role and source context.' },
      { title: 'Review documents and evidence', description: 'Check the resume, letter, fit evidence, and warnings that are actually present. Resolve missing work before relying on a packet.' },
      { title: 'Choose a next step', description: 'Use the relevant review, tracking, or posting action. Approval, tracking, and opening a posting are separate from submission.' },
    ],
    tips: ['Taco does not submit applications or send external messages for you.'],
  },
};

export function getToolHelpOverview(toolId: string): ToolHelpOverview | undefined {
  return TOOL_HELP_OVERVIEWS[toolId];
}
