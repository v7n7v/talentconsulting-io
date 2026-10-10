import type { ResumeVersion } from '@/lib/database-suite';

/** Cache identity only; authorization and export truth still belong to the server. */
export function jobSearchContentKey(value: unknown): string {
  const input = JSON.stringify(value ?? null);
  let hash = BigInt('14695981039346656037');
  for (let i = 0; i < input.length; i += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(input.charCodeAt(i))) * BigInt('1099511628211'));
  }
  return hash.toString(16);
}

export function jobSearchSourceKey(resume: ResumeVersion | null): string | null {
  if (!resume) return null;
  return JSON.stringify([resume.id, resume.updated_at || resume.created_at, jobSearchContentKey(resume.content)]);
}

export interface JobSearchResultContext {
  query: string;
  location: string;
  salaryMin: number;
  sourceKey: string | null;
  sourceName: string;
  scoreResumeId: string | null;
}

export function jobSearchInputsChanged(
  context: JobSearchResultContext,
  input: { query: string; location: string; salaryMin: number; sourceKey: string | null },
): boolean {
  return context.query !== input.query.trim()
    || context.location !== input.location.trim()
    || context.salaryMin !== input.salaryMin
    || context.sourceKey !== input.sourceKey;
}
