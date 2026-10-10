/** Only routing controls and opaque record identifiers may cross compatibility URLs. */
export const COMPATIBILITY_QUERY_KEYS = ['application', 'packet', 'source', 'scope', 'resumeVersionId', 'sourceResumeId', 'jobId', 'roleId', 'filter', 'from', 'to', 'window', 'range', 'status', 'mode', 'controls'] as const;
export type CompatibilityQuery = Record<string, string | string[] | undefined>;
export function workspaceCompatibilityHref(target: string, query: CompatibilityQuery = {}) {
  const url = new URL(target, 'https://workspace.local');
  for (const key of COMPATIBILITY_QUERY_KEYS) {
    const value = query[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value)) continue;
    url.searchParams.set(key, value);
  }
  return url.pathname + (url.search ? url.search : '');
}
