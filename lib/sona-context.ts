import { getAdminDb } from '@/lib/firebase-admin';
import { getOrComputeTwin, getTwinPromptSummary, type CareerTwin } from '@/lib/career-twin';
import { getLatestVerifiedResumeForUser, getVerifiedResumeForUserById } from '@/lib/server-resume';
import { SONA_CAPABILITIES, type SonaCapability, type SonaCapabilityStage } from '@/lib/sona/capabilities';

export type SonaResumeContextErrorCode = 'SELECTED_RESUME_UNAVAILABLE' | 'RESUME_LOOKUP_UNAVAILABLE';

export class SonaResumeContextError extends Error {
  constructor(public readonly code: SonaResumeContextErrorCode) {
    super(code);
    this.name = 'SonaResumeContextError';
  }
}

export function isSonaResumeContextError(error: unknown): error is SonaResumeContextError {
  return error instanceof SonaResumeContextError;
}

export interface SonaContextOptions {
  resumeVersionId?: string | null;
  applicationId?: string | null;
  conversationId?: string | null;
  jobContext?: {
    company?: string | null;
    jobTitle?: string | null;
    jobDescription?: string | null;
    jobUrl?: string | null;
  } | null;
}

export interface SonaContextSource {
  type: 'career_twin' | 'resume' | 'application' | 'conversation' | 'stories' | 'job_context';
  id?: string;
  label: string;
}

export interface SonaContext {
  twin: CareerTwin;
  promptBlock: string;
  sources: SonaContextSource[];
  activeResume?: {
    id: string;
    name: string;
    summary: string;
  };
  activeApplication?: {
    id: string;
    company: string;
    role: string;
    status: string;
    summary: string;
  };
}

export interface SonaActionPlan {
  intent: string;
  capabilityId: string;
  requiredInputs: string[];
  plannedSteps: SonaCapabilityStage[];
  approvalRequired: boolean;
  artifactTargets: string[];
}

const ACTION_KEYWORDS: Record<string, string[]> = {
  'jobs.prepare_packet': ['apply', 'application packet', 'packet', 'queue', 'submit', 'cover letter', 'tailored resume'],
  'jobs.find_rank_prepare': ['find jobs', 'job search', 'roles', 'opportunities', 'rank jobs', 'matches'],
  'resume.morph_for_job': ['morph', 'tailor resume', 'rewrite resume', 'resume for', 'jd'],
  'oracle.decide_strategy': ['worth applying', 'fit', 'analyze job', 'market oracle', 'red flag', 'salary'],
  'stories.match_answer': ['screening question', 'behavioral', 'answer this', 'interview question', 'story'],
  'interview.prepare_session': ['interview prep', 'mock interview', 'practice interview', 'upcoming interview'],
  'skill_bridge.plan_verify': ['skill gap', 'learn', 'prove', 'skill bridge', 'study plan'],
  'linkedin.optimize_positioning': ['linkedin', 'profile', 'headline', 'about section'],
  'writing.trust_rewrite': ['humanize', 'rewrite', 'writing', 'tone', 'sound human'],
  'applications.next_actions': ['follow up', 'stale application', 'no response', 'check in'],
};

const STAGE_LABELS: Record<SonaCapabilityStage, string> = {
  understand: 'understand the verified context',
  plan: 'choose the safest strategy',
  create: 'draft the artifact or work product',
  verify: 'check facts, fit, and risks',
  save: 'save or queue the result for review',
};

export async function getSonaContext(uid: string, options: SonaContextOptions = {}): Promise<SonaContext> {
  const db = getAdminDb();
  const twin = await getOrComputeTwin(uid);
  const sources: SonaContextSource[] = [{ type: 'career_twin', label: `Career Twin v${twin.version}` }];
  const blocks: string[] = [getTwinPromptSummary(twin)];

  const activeResume = await loadActiveResume(uid, options.resumeVersionId || null);
  if (activeResume) {
    sources.push({ type: 'resume', id: activeResume.id, label: activeResume.name });
    blocks.push(`Active working resume:\n${activeResume.summary}`);
  }

  const activeApplication = await loadApplication(uid, options.applicationId || null);
  if (activeApplication) {
    sources.push({ type: 'application', id: activeApplication.id, label: `${activeApplication.company} - ${activeApplication.role}` });
    blocks.push(`Active application:\n${activeApplication.summary}`);
  }

  if (options.jobContext && (options.jobContext.company || options.jobContext.jobTitle || options.jobContext.jobDescription)) {
    sources.push({ type: 'job_context', label: compactList([options.jobContext.company, options.jobContext.jobTitle]) || 'Provided job context' });
    blocks.push([
      'Provided job context:',
      options.jobContext.company ? `Company: ${options.jobContext.company}` : '',
      options.jobContext.jobTitle ? `Role: ${options.jobContext.jobTitle}` : '',
      options.jobContext.jobUrl ? `URL: ${options.jobContext.jobUrl}` : '',
      options.jobContext.jobDescription ? `Description excerpt: ${truncate(options.jobContext.jobDescription, 1200)}` : '',
    ].filter(Boolean).join('\n'));
  }

  const stories = await loadRelevantStories(uid);
  if (stories.length > 0) {
    sources.push({ type: 'stories', label: `${stories.length} recent Story Bank items` });
    blocks.push(`Relevant Story Bank:\n${stories.map(story => `- ${story}`).join('\n')}`);
  }

  const conversation = await loadRecentConversation(uid, options.conversationId || null);
  if (conversation.length > 0) {
    sources.push({ type: 'conversation', id: options.conversationId || undefined, label: 'Recent Sona conversation' });
    blocks.push(`Recent Sona conversation:\n${conversation.join('\n')}`);
  }

  return {
    twin,
    promptBlock: blocks.join('\n\n'),
    sources,
    activeResume,
    activeApplication,
  };
}

export function createSonaActionPlan(message: string, context?: SonaContext): SonaActionPlan {
  const normalized = message.toLowerCase();
  const capability = chooseCapability(normalized) || chooseCapabilityFromContext(context) || SONA_CAPABILITIES[0];

  return {
    intent: inferIntent(message, capability),
    capabilityId: capability.id,
    requiredInputs: capability.inputs,
    plannedSteps: capability.stages,
    approvalRequired: capability.approval !== 'none' || capability.createsArtifacts,
    artifactTargets: capability.outputs,
  };
}

export function formatActionPlanForPrompt(plan: SonaActionPlan): string {
  return [
    'Current Sona action plan:',
    `Intent: ${plan.intent}`,
    `Capability: ${plan.capabilityId}`,
    `Required inputs: ${plan.requiredInputs.join(', ') || 'none'}`,
    `Planned steps: ${plan.plannedSteps.map(step => STAGE_LABELS[step]).join(' -> ')}`,
    `Approval required before external action: ${plan.approvalRequired ? 'yes' : 'no'}`,
    `Artifact targets: ${plan.artifactTargets.join(', ') || 'none'}`,
    '',
    'If this request creates or changes important artifacts, show this plan briefly before the artifact. Never submit applications, send messages, or transmit private data externally without explicit user approval.',
  ].join('\n');
}

export function buildSonaBrief(twin: CareerTwin): {
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  priority: 'high' | 'medium' | 'low';
} {
  const topAction = twin.memory?.nextBestActions?.[0];
  if (topAction) {
    return {
      title: `Today's best move: ${topAction.label}`,
      body: topAction.reason,
      actionLabel: topAction.label,
      actionUrl: topAction.path,
      priority: topAction.priority === 'critical' ? 'high' : topAction.priority,
    };
  }

  return {
    title: 'Today\'s best move: refresh your Career Twin',
    body: 'Add a resume, job preference, application, or story so Sona can give sharper recommendations.',
    actionLabel: 'Open Career Intelligence',
    actionUrl: '/suite/intelligence',
    priority: 'medium',
  };
}

function chooseCapability(normalizedMessage: string): SonaCapability | undefined {
  let best: { capability: SonaCapability; score: number } | null = null;

  for (const capability of SONA_CAPABILITIES) {
    const keywords = ACTION_KEYWORDS[capability.id] || [capability.shortTitle, capability.title, capability.toolName];
    const score = keywords.reduce((sum, keyword) => sum + (normalizedMessage.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { capability, score };
  }

  return best?.capability;
}

function chooseCapabilityFromContext(context?: SonaContext): SonaCapability | undefined {
  if (context?.activeApplication) return SONA_CAPABILITIES.find(capability => capability.id === 'applications.next_actions');
  if (context?.activeResume) return SONA_CAPABILITIES.find(capability => capability.id === 'resume.explain_intelligence');
  return SONA_CAPABILITIES.find(capability => capability.id === 'oracle.decide_strategy');
}

function inferIntent(message: string, capability: SonaCapability): string {
  const trimmed = message.trim();
  if (!trimmed) return capability.title;
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

async function loadActiveResume(uid: string, resumeVersionId: string | null) {
  const db = getAdminDb();
  let result;
  if (resumeVersionId) {
    try {
      result = await getVerifiedResumeForUserById(db, uid, resumeVersionId);
    } catch {
      throw new SonaResumeContextError('RESUME_LOOKUP_UNAVAILABLE');
    }
    if (!result.resume) throw new SonaResumeContextError('SELECTED_RESUME_UNAVAILABLE');
  } else {
    result = await getLatestVerifiedResumeForUser(db, uid);
    if (!result.resume) return undefined;
  }

  const content = result.resume;
  return {
    id: result.id || resumeVersionId || 'latest',
    name: content.version_name || content.name || (resumeVersionId ? 'Selected resume' : 'Latest resume'),
    summary: [
      `Name: ${content.name || 'Unknown'}`,
      `Title: ${content.title || content.summary || 'Unknown'}`,
      `Skills: ${extractSkillNames(content.skills).slice(0, 25).join(', ') || 'not listed'}`,
      `Experience count: ${Array.isArray(content.experience) ? content.experience.length : 0}`,
    ].join('\n'),
  };
}

async function loadApplication(uid: string, applicationId: string | null) {
  if (!applicationId) return undefined;
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).collection('applications').doc(applicationId).get().catch(() => null);
  if (!doc?.exists) return undefined;
  const app = doc.data() || {};
  const company = app.company || app.companyName || app.company_name || 'Unknown company';
  const role = app.role || app.jobTitle || app.job_title || 'Unknown role';
  const status = app.status || 'unknown';
  return {
    id: doc.id,
    company,
    role,
    status,
    summary: [
      `Company: ${company}`,
      `Role: ${role}`,
      `Status: ${status}`,
      app.jobDescription || app.job_description ? `JD excerpt: ${truncate(app.jobDescription || app.job_description, 900)}` : '',
    ].filter(Boolean).join('\n'),
  };
}

async function loadRelevantStories(uid: string): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db.collection('users').doc(uid).collection('agent_stories')
    .orderBy('createdAt', 'desc').limit(5).get().catch(() => null);
  return (snap?.docs || []).map(doc => {
    const story = doc.data();
    const title = story.title || 'Untitled story';
    const result = story.result ? `Result: ${truncate(story.result, 160)}` : '';
    const tags = Array.isArray(story.tags) && story.tags.length ? `Tags: ${story.tags.slice(0, 5).join(', ')}` : '';
    return compactList([title, result, tags], 3);
  }).filter(Boolean);
}

async function loadRecentConversation(uid: string, conversationId: string | null): Promise<string[]> {
  if (!conversationId) return [];
  const db = getAdminDb();
  const snap = await db.collection('users').doc(uid)
    .collection('agent').doc('conversations')
    .collection(conversationId)
    .orderBy('timestamp', 'desc')
    .limit(6)
    .get()
    .catch(() => null);

  return (snap?.docs || []).reverse().map(doc => {
    const msg = doc.data();
    return `${msg.role || 'message'}: ${truncate(String(msg.content || ''), 280)}`;
  });
}

function extractSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills.flatMap((skill: any) => {
    if (typeof skill === 'string') return [skill];
    if (Array.isArray(skill?.items)) return skill.items.map((item: unknown) => String(item));
    return [];
  }).map(skill => skill.trim()).filter(Boolean);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function compactList(values: unknown[], limit = 5): string {
  return values.map(value => String(value || '').trim()).filter(Boolean).slice(0, limit).join(', ');
}
