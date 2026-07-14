import type { ResumeVersion } from '@/lib/database-suite';
import { normalizeResume, serializeResumeToText } from '@/lib/resume-normalizer';

export const APPLICATION_KIT_STORAGE_KEY = 'talent-application-kit-context';

export type SelectedResumeSource = 'library' | 'resume_studio' | 'job_search' | 'manual';

export interface ApplicationKitOutput<T = unknown> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: T;
  error?: string;
  updatedAt?: string;
}

export interface ApplicationKitContext {
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
  atsResult?: ApplicationKitOutput<any>;
  coverLetterResult?: ApplicationKitOutput<any>;
  linkedinResult?: ApplicationKitOutput<any>;
  oracleResult?: ApplicationKitOutput<any>;
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

export function loadApplicationKitContext(): ApplicationKitContext {
  if (typeof window === 'undefined') return { ...EMPTY_APPLICATION_KIT_CONTEXT };
  try {
    const raw = window.sessionStorage.getItem(APPLICATION_KIT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...EMPTY_APPLICATION_KIT_CONTEXT, ...parsed };
  } catch {
    return { ...EMPTY_APPLICATION_KIT_CONTEXT };
  }
}

export function saveApplicationKitContext(context: ApplicationKitContext): ApplicationKitContext {
  const next = {
    ...EMPTY_APPLICATION_KIT_CONTEXT,
    ...context,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(APPLICATION_KIT_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function mergeApplicationKitContext(patch: Partial<ApplicationKitContext>): ApplicationKitContext {
  const current = loadApplicationKitContext();
  return saveApplicationKitContext({ ...current, ...patch });
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
