import type { ApplicationKitContext } from '@/lib/application-kit';
import { loadApplicationKitContext } from '@/lib/application-kit';
import { getSonaCapability, type SonaCapability } from '@/lib/sona/capabilities';

export interface SonaExecutionContext {
  pathname?: string;
  pageLabel?: string;
  sourceTool?: string;
  resumeVersionId?: string | null;
  resumeVersionName?: string;
  targetRole?: string;
  jobTitle?: string;
  company?: string;
  jobDescriptionStatus?: 'missing' | 'present';
  jobDescriptionExcerpt?: string;
  applicationId?: string | null;
  contactId?: string | null;
  storyId?: string | null;
  skill?: string;
  selectedItemLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface SonaOpenDetail {
  prompt?: string;
  contextLabel?: string;
  capabilityId?: string;
  context?: Partial<SonaExecutionContext>;
}

function compactText(value?: string | null, limit = 240) {
  const clean = `${value || ''}`.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > limit ? `${clean.slice(0, limit - 1).trim()}...` : clean;
}

function pageLabelFromPath(pathname = '') {
  const last = pathname.split('/').filter(Boolean).pop() || 'workspace';
  return last
    .split('-')
    .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

export function createSonaExecutionContext(options: {
  pathname?: string;
  pageLabel?: string;
  sourceTool?: string;
  applicationKit?: ApplicationKitContext;
  context?: Partial<SonaExecutionContext>;
} = {}): SonaExecutionContext {
  const kit = options.applicationKit || (typeof window !== 'undefined' ? loadApplicationKitContext() : undefined);
  const jobDescription = kit?.jobDescription || '';
  return {
    pathname: options.pathname,
    pageLabel: options.pageLabel || pageLabelFromPath(options.pathname),
    sourceTool: options.sourceTool,
    resumeVersionId: kit?.resumeVersionId || null,
    resumeVersionName: kit?.resumeVersionName || '',
    targetRole: kit?.targetRole || '',
    jobTitle: kit?.jobTitle || '',
    company: kit?.company || '',
    jobDescriptionStatus: jobDescription.trim() ? 'present' : 'missing',
    jobDescriptionExcerpt: compactText(jobDescription, 320),
    ...options.context,
  };
}

export function summarizeSonaContext(context?: Partial<SonaExecutionContext>) {
  if (!context) return [];
  return [
    context.pageLabel ? `Page: ${context.pageLabel}` : '',
    context.sourceTool ? `Tool: ${context.sourceTool}` : '',
    context.resumeVersionName ? `Resume: ${context.resumeVersionName}` : context.resumeVersionId ? `Resume ID: ${context.resumeVersionId}` : '',
    context.jobTitle || context.targetRole ? `Role: ${context.jobTitle || context.targetRole}` : '',
    context.company ? `Company: ${context.company}` : '',
    context.skill ? `Skill: ${context.skill}` : '',
    context.selectedItemLabel ? `Selected item: ${context.selectedItemLabel}` : '',
    context.jobDescriptionStatus ? `Job description: ${context.jobDescriptionStatus}` : '',
    context.jobDescriptionExcerpt ? `JD excerpt: ${context.jobDescriptionExcerpt}` : '',
  ].filter(Boolean);
}

export function buildSonaCapabilityPrompt(capability: SonaCapability, context?: Partial<SonaExecutionContext>) {
  const contextLines = summarizeSonaContext(context);
  const safetyLine = capability.approval === 'external'
    ? 'Do not send, submit, message, or contact anyone. Prepare a review-ready draft and ask for explicit approval before external action.'
    : capability.approval === 'review'
      ? 'Prepare the work for review. Do not submit externally or make irreversible changes.'
      : 'Analyze and recommend the next move clearly.';

  return [
    `Sona mission: ${capability.title}`,
    `Tool: ${capability.toolName}`,
    `Goal: ${capability.prompt}`,
    contextLines.length ? `Current context:\n- ${contextLines.join('\n- ')}` : '',
    `Expected output: ${capability.outputs.join(', ')}.`,
    safetyLine,
  ].filter(Boolean).join('\n\n');
}

export function openSona(detail: SonaOpenDetail) {
  if (typeof window === 'undefined') return;
  const capability = getSonaCapability(detail.capabilityId);
  const pathname = detail.context?.pathname || window.location.pathname;
  const context = createSonaExecutionContext({
    pathname,
    sourceTool: capability?.toolName || detail.contextLabel,
    context: detail.context,
  });
  const prompt = detail.prompt || (capability ? buildSonaCapabilityPrompt(capability, context) : '');
  window.dispatchEvent(new CustomEvent<SonaOpenDetail>('sona:open', {
    detail: {
      ...detail,
      prompt,
      context,
      contextLabel: detail.contextLabel || capability?.toolName || context.pageLabel,
    },
  }));
}
