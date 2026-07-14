export type JobDiscoverySurface = 'search' | 'suggestions';

export type JobDiscoveryRecoveryAction =
  | 'retry_search'
  | 'retry_suggestions'
  | 'open_preferences'
  | 'create_account'
  | 'sign_in'
  | 'upgrade';

export type JobDiscoveryRecoveryCode =
  | 'search_busy'
  | 'search_network_interrupted'
  | 'search_supply_unavailable'
  | 'search_failed'
  | 'search_account_required'
  | 'search_upgrade_required'
  | 'suggestions_setup_required'
  | 'suggestions_busy'
  | 'suggestions_network_interrupted'
  | 'suggestions_supply_unavailable'
  | 'suggestions_partial_results'
  | 'suggestions_account_required'
  | 'suggestions_upgrade_required'
  | 'suggestions_failed';

export interface JobDiscoveryRecovery {
  code: JobDiscoveryRecoveryCode;
  title: string;
  message: string;
  nextAction: string;
  action: JobDiscoveryRecoveryAction;
  retryable: boolean;
  preservePreviousResults: true;
  externalApplicationSubmitted: false;
}

interface MergeableJobResult {
  id: string;
  url?: string;
  identityKey?: string;
  dedupeKey?: string;
  sourceJobId?: string;
  title?: string;
  company?: string;
  location?: string;
  sourceMeta?: {
    sourceName?: string;
    canonicalUrl?: string;
    directApplyUrl?: string;
  };
}

function normalizedJobUrl(value?: string) {
  if (!value || value === '#') return '';
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizedIdentityPart(value?: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getJobResultIdentity(result: MergeableJobResult): string {
  if (result.identityKey) return `identity:${result.identityKey}`;
  if (result.dedupeKey) return `dedupe:${result.dedupeKey}`;
  const canonicalUrl = normalizedJobUrl(result.sourceMeta?.canonicalUrl || result.sourceMeta?.directApplyUrl || result.url);
  if (canonicalUrl) return `url:${canonicalUrl}`;
  if (result.sourceMeta?.sourceName && result.sourceJobId) {
    return `source:${normalizedIdentityPart(result.sourceMeta.sourceName)}:${normalizedIdentityPart(result.sourceJobId)}`;
  }
  const roleIdentity = [result.company, result.title, result.location].map(normalizedIdentityPart).filter(Boolean).join('|');
  if (roleIdentity) return `role:${roleIdentity}`;
  return `id:${normalizedIdentityPart(result.id)}`;
}

export function mergePreservedJobResults<T extends MergeableJobResult>(
  previousResults: T[],
  nextResults: T[],
  limit = 15,
): T[] {
  const merged = new Map<string, T>();
  for (const result of previousResults) {
    merged.set(getJobResultIdentity(result), result);
  }
  for (const result of nextResults) {
    const key = getJobResultIdentity(result);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...result } : result);
  }
  return [...merged.values()].slice(0, Math.max(previousResults.length, limit));
}

function recovery(
  value: Omit<JobDiscoveryRecovery, 'preservePreviousResults' | 'externalApplicationSubmitted'>,
): JobDiscoveryRecovery {
  return {
    ...value,
    preservePreviousResults: true,
    externalApplicationSubmitted: false,
  };
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  return String(error || '').toLowerCase();
}

function retryAction(surface: JobDiscoverySurface): JobDiscoveryRecoveryAction {
  return surface === 'search' ? 'retry_search' : 'retry_suggestions';
}

function prefix(surface: JobDiscoverySurface) {
  return surface === 'search' ? 'search' : 'suggestions';
}

export function jobSuggestionsSetupRecovery(): JobDiscoveryRecovery {
  return recovery({
    code: 'suggestions_setup_required',
    title: 'Set your target roles',
    message: 'Add at least one target role so Sona can rank weekly picks. No application was submitted.',
    nextAction: 'Set job preferences',
    action: 'open_preferences',
    retryable: false,
  });
}

export function jobAccountRequiredRecovery(
  surface: JobDiscoverySurface,
  createAccount = false,
): JobDiscoveryRecovery {
  return recovery({
    code: `${prefix(surface)}_account_required` as JobDiscoveryRecoveryCode,
    title: createAccount ? 'Create an account to keep searching' : 'Sign in again to continue',
    message: createAccount
      ? 'Your free preview is complete. Create an account to keep your searches and continue. Nothing was submitted.'
      : 'Your session needs to be refreshed before Sona can load more roles. Nothing was submitted.',
    nextAction: createAccount ? 'Create free account' : 'Sign in',
    action: createAccount ? 'create_account' : 'sign_in',
    retryable: false,
  });
}

export function jobUpgradeRequiredRecovery(surface: JobDiscoverySurface): JobDiscoveryRecovery {
  return recovery({
    code: `${prefix(surface)}_upgrade_required` as JobDiscoveryRecoveryCode,
    title: 'Plan limit reached',
    message: 'Your current search allowance is used. Existing results remain available and nothing was submitted.',
    nextAction: 'Review Pro and Max',
    action: 'upgrade',
    retryable: false,
  });
}

export function jobSuggestionsPartialRecovery(): JobDiscoveryRecovery {
  return recovery({
    code: 'suggestions_partial_results',
    title: 'Some job sources did not finish',
    message: 'Showing available roles and keeping previous picks. Retry to complete the search. Nothing was submitted.',
    nextAction: 'Retry Sona Picks',
    action: 'retry_suggestions',
    retryable: true,
  });
}

export function jobSupplyUnavailableRecovery(surface: JobDiscoverySurface): JobDiscoveryRecovery {
  return recovery({
    code: `${prefix(surface)}_supply_unavailable` as JobDiscoveryRecoveryCode,
    title: surface === 'search' ? 'Job sources are temporarily unavailable' : 'Sona Picks are temporarily unavailable',
    message: 'Any previous results remain on screen. Nothing was saved, queued, or submitted.',
    nextAction: surface === 'search' ? 'Retry search' : 'Retry Sona Picks',
    action: retryAction(surface),
    retryable: true,
  });
}

export function classifyJobDiscoveryFailure(
  error: unknown,
  surface: JobDiscoverySurface,
  status?: number,
): JobDiscoveryRecovery {
  const message = errorText(error);
  const codePrefix = prefix(surface);
  const action = retryAction(surface);
  const nextAction = surface === 'search' ? 'Retry search' : 'Retry Sona Picks';

  if (status === 429 || message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return recovery({
      code: `${codePrefix}_busy` as JobDiscoveryRecoveryCode,
      title: 'Job search is busy',
      message: 'Any previous results remain on screen. Wait a moment, then retry. Nothing was submitted.',
      nextAction,
      action,
      retryable: true,
    });
  }

  if (
    status === 502
    || status === 503
    || status === 504
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('abort')
    || message.includes('network')
    || message.includes('fetch failed')
    || message.includes('connection')
  ) {
    return recovery({
      code: `${codePrefix}_network_interrupted` as JobDiscoveryRecoveryCode,
      title: 'Connection to job sources was interrupted',
      message: 'Any previous results remain on screen. Check your connection, then retry. Nothing was submitted.',
      nextAction,
      action,
      retryable: true,
    });
  }

  return recovery({
    code: `${codePrefix}_failed` as JobDiscoveryRecoveryCode,
    title: surface === 'search' ? 'Search paused safely' : 'Sona Picks paused safely',
    message: 'Any previous results remain on screen. Retry when you are ready. Nothing was submitted.',
    nextAction,
    action,
    retryable: true,
  });
}

export function readJobDiscoveryRecovery(value: unknown): JobDiscoveryRecovery | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<JobDiscoveryRecovery>;
  if (
    typeof candidate.code !== 'string'
    || typeof candidate.title !== 'string'
    || typeof candidate.message !== 'string'
    || typeof candidate.nextAction !== 'string'
    || !['retry_search', 'retry_suggestions', 'open_preferences', 'create_account', 'sign_in', 'upgrade'].includes(String(candidate.action))
  ) {
    return null;
  }
  return candidate as JobDiscoveryRecovery;
}

export function classifyJobDiscoveryResponse(
  value: unknown,
  surface: JobDiscoverySurface,
  status: number,
): JobDiscoveryRecovery {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (payload.requiresAuth && payload.limitReached) {
    return jobAccountRequiredRecovery(surface, true);
  }
  if (status === 401) {
    return jobAccountRequiredRecovery(surface);
  }
  if (payload.requiresAuth && status === 429) {
    return classifyJobDiscoveryFailure(payload.error || 'Rate limit reached', surface, status);
  }
  if (payload.requiresAuth) {
    return jobAccountRequiredRecovery(surface);
  }
  if (payload.limitReached || payload.upgrade) {
    return jobUpgradeRequiredRecovery(surface);
  }
  return readJobDiscoveryRecovery(payload.recovery)
    || classifyJobDiscoveryFailure(payload.error || `Job discovery failed with status ${status}`, surface, status);
}

export function jobDiscoveryRecoveryStatus(recoveryState: JobDiscoveryRecovery): number {
  if (recoveryState.code.endsWith('_busy')) return 429;
  if (recoveryState.code.endsWith('_network_interrupted') || recoveryState.code.endsWith('_supply_unavailable')) return 503;
  return 500;
}
