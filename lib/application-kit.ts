import { useStore } from '@/lib/store';
import type { ResumeVersion } from '@/lib/database-suite';
import { normalizeResume, serializeResumeToText } from '@/lib/resume-normalizer';

export const APPLICATION_KIT_STORAGE_KEY = 'talent-application-kit-context';

export type ApplicationKitOutputKey = 'atsResult' | 'coverLetterResult' | 'linkedinResult' | 'oracleResult';

export type SelectedResumeSource = 'library' | 'resume_studio' | 'job_search' | 'manual';

export interface ApplicationKitOutput<T = unknown> {
  status: 'idle' | 'loading' | 'success' | 'error' | 'stale';
  inputRevision?: number;
  data?: T;
  error?: string;
  updatedAt?: string;
}

export interface ApplicationKitContext {
  ownerId?: string;
  scopeId?: string;
  revision?: number;
  storageStatus?: 'saved' | 'unavailable' | 'unsaved';
  applicationId?: string | null;
  applicationUrl?: string | null;
  resumeVersionId?: string | null;
  resumeVersionName?: string;
  resumeSource?: SelectedResumeSource;
  resumeSnapshot?: any;
  resumeText?: string;
  jobDescription?: string;
  company?: string;
  jobTitle?: string;
  targetRole?: string;
  profileHeadline?: string;
  profileAbout?: string;
  profileTargetRole?: string;
  coverLetterTone?: string;
  coverLetterTemplate?: string;
  atsResult?: ApplicationKitOutput<any>;
  coverLetterResult?: ApplicationKitOutput<any>;
  linkedinResult?: ApplicationKitOutput<any>;
  oracleResult?: ApplicationKitOutput<any>;
  oracleDraft?: { targetRole: string; company: string; location: string; salaryTarget: number; jobUrl: string; analyzedInput: string; sourceBinding: { resumeVersionId: string | null; sourceHash: string } | null };
  updatedAt?: string;
}

export const EMPTY_APPLICATION_KIT_CONTEXT: ApplicationKitContext = {
  applicationId: null,
  applicationUrl: null,
  resumeVersionId: null,
  resumeVersionName: '',
  resumeSource: 'manual',
  resumeSnapshot: null,
  resumeText: '',
  jobDescription: '',
  company: '',
  jobTitle: '',
  targetRole: '',
  atsResult: { status: 'idle' },
  coverLetterResult: { status: 'idle' },
  linkedinResult: { status: 'idle' },
  oracleResult: { status: 'idle' },
};

export function resumeSnapshotToText(resume: any): string {
  if (!resume) return '';
  try {
    return serializeResumeToText(normalizeResume(resume));
  } catch {
    const parts = [
      resume.name,
      resume.title,
      resume.summary,
      Array.isArray(resume.skills)
        ? resume.skills.flatMap((skillGroup: any) => typeof skillGroup === 'string' ? [skillGroup] : skillGroup.items || []).join(', ')
        : '',
      ...(resume.experience || []).flatMap((exp: any) => [
        `${exp.role || exp.title || ''} ${exp.company ? `at ${exp.company}` : ''}`.trim(),
        ...(exp.achievements || exp.bullets || []).slice(0, 6),
        exp.description,
      ]),
      ...(resume.education || []).map((edu: any) => `${edu.degree || ''} ${edu.institution || edu.school || ''}`.trim()),
    ];
    return parts.filter(Boolean).join('\n');
  }
}

export interface ApplicationKitScope {
  ownerId?: string;
  scopeId?: string;
  expectedRevision?: number;
  outputKey?: ApplicationKitOutputKey;
}

const contexts = new Map<string, ApplicationKitContext>();
const listeners = new Set<() => void>();
const operations = new Map<string, number>();
const outputKeys = ['atsResult', 'coverLetterResult', 'linkedinResult', 'oracleResult'] as const;
const inputKeys = ['applicationId', 'applicationUrl', 'resumeVersionId', 'resumeSnapshot', 'resumeText',
  'jobDescription', 'company', 'jobTitle', 'targetRole', 'profileHeadline', 'profileAbout', 'profileTargetRole', 'coverLetterTone', 'coverLetterTemplate'] as const;
const sourceKeys = ['applicationId', 'resumeVersionId', 'resumeSnapshot', 'resumeText'] as const;
const targetKeys = ['jobDescription', 'company', 'jobTitle', 'targetRole'] as const;
const outputDependencies: Record<ApplicationKitOutputKey, readonly (keyof ApplicationKitContext)[]> = {
  atsResult: [...sourceKeys, 'jobDescription'],
  coverLetterResult: [...sourceKeys, ...targetKeys, 'coverLetterTone', 'coverLetterTemplate'],
  linkedinResult: [...sourceKeys, 'profileHeadline', 'profileAbout', 'profileTargetRole'],
  oracleResult: [...sourceKeys, ...targetKeys, 'applicationUrl'],
};
const empty = EMPTY_APPLICATION_KIT_CONTEXT;

export function applicationKitOwner(): string {
  return useStore.getState().user?.uid || 'guest';
}

/** A route points at a workspace, never at another account's unowned legacy data. */
export function applicationKitScope(): string {
  if (typeof window === 'undefined') return 'workspace';
  return applicationKitScopeForLocation(window.location.pathname, window.location.search);
}

export function applicationKitScopeForLocation(path: string, search = ''): string {
  const params = new URLSearchParams(search);
  const application = params.get('application');
  if (application && /^[\w-]{1,180}$/.test(application)) return `application:${application}`;
  if (path.includes('/linkedin')) return 'profile:linkedin';
  if (path.includes('/cover-letter')) return 'letter:draft';
  if (path.includes('/ats-')) return 'resume:checks';
  if (path.includes('/resume')) return 'resume:workspace';
  if (path.includes('/job-search') || path.includes('/market-oracle')) return 'roles:workspace';
  return 'workspace';
}

function identity(options: ApplicationKitScope = {}) {
  const ownerId = options.ownerId || applicationKitOwner();
  const scopeId = options.scopeId || applicationKitScope();
  return { ownerId, scopeId, key: `${APPLICATION_KIT_STORAGE_KEY}:v2:${encodeURIComponent(ownerId)}:${encodeURIComponent(scopeId)}` };
}
function activeKey(owner: string) { return `${APPLICATION_KIT_STORAGE_KEY}:v2:${encodeURIComponent(owner)}:active`; }
function publish() { for (const listener of listeners) listener(); }

export function subscribeApplicationKit(listener: () => void): () => void {
  listeners.add(listener);
  const refresh = (event: StorageEvent) => {
    if (event.key?.startsWith(`${APPLICATION_KIT_STORAGE_KEY}:v2:`)) {
      contexts.clear();
      listener();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', refresh);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', refresh);
  };
}

export function loadApplicationKitContext(options: ApplicationKitScope = {}): ApplicationKitContext {
  if (typeof window === 'undefined') return empty;
  const id = identity(options);
  if (id.ownerId !== applicationKitOwner()) return empty;
  const cached = contexts.get(id.key);
  if (cached) return cached;
  let context: ApplicationKitContext = { ...empty, ownerId: id.ownerId, scopeId: id.scopeId, revision: 0, storageStatus: 'unsaved' };
  try {
    const raw = window.sessionStorage.getItem(id.key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.ownerId === id.ownerId && parsed?.scopeId === id.scopeId && typeof parsed.revision === 'number') {
      context = { ...context, ...parsed, storageStatus: 'saved' };
    } else if (!raw) {
      // Seed a new workspace from an explicit same-owner selection. Existing drafts
      // never follow this pointer again, so unrelated applications remain independent.
      const active = window.sessionStorage.getItem(activeKey(id.ownerId));
      const seedRaw = active && active !== id.key ? window.sessionStorage.getItem(active) : null;
      const seed = seedRaw ? JSON.parse(seedRaw) : null;
      if (seed?.ownerId === id.ownerId) {
        for (const key of ['resumeVersionId', 'resumeSnapshot', 'resumeText', 'resumeVersionName', 'resumeSource', 'targetRole'] as const) {
          if (seed[key] !== undefined) Object.assign(context, { [key]: seed[key] });
        }
      }
      // An explicit application scope cannot inherit a different application.
      if (id.scopeId.startsWith('application:') && context.applicationId !== id.scopeId.slice(12)) {
        context = { ...context, applicationId: id.scopeId.slice(12), applicationUrl: null,
          company: '', jobTitle: '', targetRole: '', jobDescription: '' };
      }
    }
  } catch { context.storageStatus = 'unavailable'; }
  contexts.set(id.key, context);
  return context;
}

export function saveApplicationKitContext(context: ApplicationKitContext, options: ApplicationKitScope = {}): ApplicationKitContext {
  const id = identity(options);
  if (id.ownerId !== applicationKitOwner() || (context.ownerId && context.ownerId !== id.ownerId)) return loadApplicationKitContext();
  const current = loadApplicationKitContext(id);
  if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) return current;
  const inputChanged = inputKeys.some(key => JSON.stringify(current[key]) !== JSON.stringify(context[key]));
  const revision = (current.revision || 0) + (inputChanged ? 1 : 0);
  const next: ApplicationKitContext = { ...empty, ...context, ownerId: id.ownerId, scopeId: id.scopeId,
    revision, updatedAt: new Date().toISOString(), storageStatus: 'unsaved' };
  for (const key of outputKeys) {
    const output = next[key];
    const relevantChange = outputDependencies[key].some(field => JSON.stringify(current[field]) !== JSON.stringify(next[field]));
    if (relevantChange && output && output === current[key] && output.status !== 'idle') {
      next[key] = { ...output, status: 'stale', error: 'The source or target changed. Run this check again.' };
    } else if (output && output !== current[key]) {
      next[key] = { ...output, inputRevision: revision };
    }
  }
  if (typeof window !== 'undefined') {
    try {
      next.storageStatus = 'saved';
      window.sessionStorage.setItem(id.key, JSON.stringify(next));
      window.sessionStorage.setItem(activeKey(id.ownerId), id.key);
    } catch { next.storageStatus = 'unavailable'; }
  }
  contexts.set(id.key, next);
  publish();
  return next;
}

export function mergeApplicationKitContext(patch: Partial<ApplicationKitContext>, options: ApplicationKitScope = {}): ApplicationKitContext {
  const id = identity(options);
  const current = loadApplicationKitContext(id);
  return saveApplicationKitContext({ ...current, ...patch }, { ...id, expectedRevision: options.expectedRevision });
}

/** Explicit navigation carries selected inputs even when the destination already has a draft. */
export function applicationKitHref(path: string, context: ApplicationKitContext): string {
  const url = new URL(path, 'https://workspace.invalid');
  if (url.origin !== 'https://workspace.invalid') throw new Error('Workspace handoff requires a local route');
  const applicationId = context.scopeId?.startsWith('application:') ? context.scopeId.slice(12) : context.applicationId;
  if (applicationId) url.searchParams.set('application', applicationId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function handoffApplicationKitContext(path: string, source = loadApplicationKitContext()): string {
  if (source.ownerId && source.ownerId !== applicationKitOwner()) throw new Error('The selected source belongs to another account');
  const href = applicationKitHref(path, source);
  const url = new URL(href, 'https://workspace.invalid');
  const patch: Partial<ApplicationKitContext> = {};
  for (const key of ['resumeVersionId', 'resumeSnapshot', 'resumeText', 'resumeVersionName', 'resumeSource', 'applicationId', 'applicationUrl', 'jobDescription', 'company', 'jobTitle', 'targetRole'] as const) {
    if (source[key] !== undefined) Object.assign(patch, { [key]: source[key] });
  }
  mergeApplicationKitContext(patch, { ownerId: applicationKitOwner(), scopeId: applicationKitScopeForLocation(url.pathname, url.search) });
  return href;
}

export function captureApplicationKitGuard(options: ApplicationKitScope = {}): () => boolean {
  const id = identity(options);
  const context = loadApplicationKitContext(id);
  const revision = context.revision;
  const dependencySnapshot = options.outputKey ? JSON.stringify(outputDependencies[options.outputKey].map(key => context[key])) : null;
  const operationKey = options.outputKey ? `${id.key}:${options.outputKey}` : id.key;
  const operation = (operations.get(operationKey) || 0) + 1;
  operations.set(operationKey, operation);
  return () => {
    const latest = loadApplicationKitContext(id);
    return applicationKitOwner() === id.ownerId && operations.get(operationKey) === operation
      && (options.outputKey ? JSON.stringify(outputDependencies[options.outputKey].map(key => latest[key])) === dependencySnapshot : latest.revision === revision);
  };
}

export function resumeVersionToApplicationKitContext(rv: ResumeVersion): Partial<ApplicationKitContext> {
  const resumeSnapshot = rv.content as any;
  return {
    resumeVersionId: rv.id,
    resumeVersionName: rv.version_name,
    resumeSource: 'library',
    resumeSnapshot,
    resumeText: resumeSnapshotToText(resumeSnapshot),
    targetRole: (resumeSnapshot?.title || '') as string,
  };
}

export function getMissingKeywordsFromAts(result: any): string[] {
  if (!result?.keywords?.length) return [];
  return result.keywords
    .filter((keyword: any) => keyword.status === 'missing' || keyword.status === 'partial')
    .map((keyword: any) => keyword.keyword)
    .filter(Boolean)
    .slice(0, 12);
}

export function inferCompanyFromJobDescription(jobDescription = ''): string {
  const match = jobDescription.match(/(?:company|employer|at|@)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,' ]{2,50})(?:\n|,|\.| is | seeks | hiring|$)/i);
  return match?.[1]?.trim() || '';
}

export function inferRoleFromJobDescription(jobDescription = ''): string {
  const lines = jobDescription.split('\n').map(line => line.trim()).filter(Boolean);
  const roleLine = lines.find(line => /^(job\s*)?(title|role|position)\s*[:\-]/i.test(line)) || lines[0] || '';
  return roleLine.replace(/^(job\s*)?(title|role|position)\s*[:\-]\s*/i, '').slice(0, 90);
}
