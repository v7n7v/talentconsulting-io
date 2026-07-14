const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadRecoveryModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-job-search-recovery-'));
  const outfile = path.join(outdir, 'job-search-recovery.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-discovery-recovery.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const recoveryModule = loadRecoveryModule();

test('job discovery recovery classifies busy, interrupted and unknown failures safely', async () => {
  const { classifyJobDiscoveryFailure } = await recoveryModule;
  const busy = classifyJobDiscoveryFailure(new Error('429 rate limit'), 'search');
  const interrupted = classifyJobDiscoveryFailure(new Error('fetch failed: network timeout'), 'suggestions');
  const unknown = classifyJobDiscoveryFailure(new Error('private provider stack detail'), 'search');

  assert.equal(busy.code, 'search_busy');
  assert.equal(busy.action, 'retry_search');
  assert.equal(interrupted.code, 'suggestions_network_interrupted');
  assert.equal(interrupted.action, 'retry_suggestions');
  assert.equal(unknown.code, 'search_failed');
  assert.doesNotMatch(unknown.message, /private provider stack detail/);
  for (const state of [busy, interrupted, unknown]) {
    assert.equal(state.preservePreviousResults, true);
    assert.equal(state.externalApplicationSubmitted, false);
  }
});

test('setup and provider outage recoveries name one bounded next action', async () => {
  const { jobDiscoveryRecoveryStatus, jobSuggestionsPartialRecovery, jobSuggestionsSetupRecovery, jobSupplyUnavailableRecovery } = await recoveryModule;
  const setup = jobSuggestionsSetupRecovery();
  const outage = jobSupplyUnavailableRecovery('suggestions');
  const partial = jobSuggestionsPartialRecovery();

  assert.equal(setup.code, 'suggestions_setup_required');
  assert.equal(setup.action, 'open_preferences');
  assert.equal(setup.retryable, false);
  assert.match(setup.message, /no application was submitted/i);
  assert.equal(outage.code, 'suggestions_supply_unavailable');
  assert.equal(outage.action, 'retry_suggestions');
  assert.equal(jobDiscoveryRecoveryStatus(outage), 503);
  assert.equal(partial.code, 'suggestions_partial_results');
  assert.match(partial.message, /keeping previous picks/i);
});

test('terminal auth and plan responses do not offer an ineffective retry', async () => {
  const { classifyJobDiscoveryResponse } = await recoveryModule;
  const anonymousCap = classifyJobDiscoveryResponse({ requiresAuth: true, limitReached: true }, 'search', 429);
  const anonymousThrottle = classifyJobDiscoveryResponse({ requiresAuth: true, error: 'Too many requests' }, 'search', 429);
  const expiredSession = classifyJobDiscoveryResponse({ error: 'Account required' }, 'suggestions', 401);
  const planLimit = classifyJobDiscoveryResponse({ limitReached: true, upgrade: 'Unlock more' }, 'search', 429);

  assert.equal(anonymousCap.code, 'search_account_required');
  assert.equal(anonymousCap.action, 'create_account');
  assert.equal(anonymousCap.retryable, false);
  assert.equal(anonymousThrottle.code, 'search_busy');
  assert.equal(anonymousThrottle.action, 'retry_search');
  assert.equal(anonymousThrottle.retryable, true);
  assert.equal(expiredSession.action, 'sign_in');
  assert.equal(planLimit.code, 'search_upgrade_required');
  assert.equal(planLimit.action, 'upgrade');
});

test('partial discovery merge preserves every previous pick before adding new roles', async () => {
  const { getJobResultIdentity, mergePreservedJobResults } = await recoveryModule;
  const previous = Array.from({ length: 10 }, (_, index) => ({ id: `old-${index}`, url: `https://old.example/${index}` }));
  const next = Array.from({ length: 10 }, (_, index) => ({ id: `new-${index}`, url: `https://new.example/${index}` }));
  const merged = mergePreservedJobResults(previous, next);

  assert.equal(merged.length, 15);
  assert.deepEqual(merged.slice(0, 10).map(job => job.id), previous.map(job => job.id));
  assert.equal(merged.some(job => job.id === 'new-0'), true);

  const providerCollision = mergePreservedJobResults(
    [{ id: '123', identityKey: 'company-a|security-engineer', url: 'https://jobs.example/a' }],
    [{ id: '123', identityKey: 'company-b|data-engineer', url: 'https://jobs.example/b' }],
  );
  assert.equal(providerCollision.length, 2);
  assert.notEqual(getJobResultIdentity(providerCollision[0]), getJobResultIdentity(providerCollision[1]));

  const changedProviderId = mergePreservedJobResults(
    [{ id: 'old-provider-id', identityKey: 'company-a|security-engineer', title: 'Old title copy' }],
    [{ id: 'new-provider-id', identityKey: 'company-a|security-engineer', title: 'Current title copy' }],
  );
  assert.equal(changedProviderId.length, 1);
  assert.equal(changedProviderId[0].id, 'new-provider-id');
  assert.equal(changedProviderId[0].title, 'Current title copy');
});

test('recovery reader rejects malformed server payloads', async () => {
  const { readJobDiscoveryRecovery, jobSupplyUnavailableRecovery } = await recoveryModule;

  assert.equal(readJobDiscoveryRecovery(null), null);
  assert.equal(readJobDiscoveryRecovery({ code: 'search_failed' }), null);
  assert.deepEqual(
    readJobDiscoveryRecovery(jobSupplyUnavailableRecovery('search')),
    jobSupplyUnavailableRecovery('search'),
  );
});

test('job APIs distinguish supply failure from a successful empty result', () => {
  const searchRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/search/route.ts'), 'utf8');
  const suggestionsRoute = fs.readFileSync(path.join(repoRoot, 'app/api/jobs/suggestions/route.ts'), 'utf8');
  const supplyAdapter = fs.readFileSync(path.join(repoRoot, 'lib/job-recommendation-platform.ts'), 'utf8');
  const routeRecovery = fs.readFileSync(path.join(repoRoot, 'lib/job-discovery-route-recovery.ts'), 'utf8');

  assert.match(searchRoute, /classifyJobDiscoveryFailure\(error, 'search'\)/);
  assert.match(searchRoute, /!isJobSupplyOperational\(result\.providerStatus\)/);
  assert.match(searchRoute, /jobSupplyUnavailableRecovery\('search'\)/);
  assert.match(searchRoute, /withJobDiscoveryRecovery\(guard\.error, 'search'\)/);
  assert.match(searchRoute, /recovery,/);
  assert.doesNotMatch(searchRoute, /error: 'Failed to search jobs', jobs: \[\]/);

  assert.match(suggestionsRoute, /let failedSearches = 0/);
  assert.match(suggestionsRoute, /!isJobSupplyOperational\(result\.providerStatus\)/);
  assert.match(suggestionsRoute, /if \(failedSearches > 0\)/);
  assert.match(suggestionsRoute, /jobSupplyUnavailableRecovery\('suggestions'\)/);
  assert.match(suggestionsRoute, /jobSuggestionsPartialRecovery\(\)/);
  assert.match(suggestionsRoute, /withJobDiscoveryRecovery\(guard\.error, 'suggestions'\)/);
  assert.match(suggestionsRoute, /if \(!partialRecovery\)/);
  assert.match(suggestionsRoute, /success: true,[\s\S]*jobs: \[\],[\s\S]*No jobs found matching your preferences/);
  assert.match(supplyAdapter, /fallbackStatus\?: 'not_used' \| 'success' \| 'empty' \| 'error'/);
  assert.match(supplyAdapter, /providerStatus\.fallbackStatus = legacy\.source\.toLowerCase\(\)\.includes\('\(error\)'\)/);
  assert.match(supplyAdapter, /Ever Jobs search returned an unsupported response/);
  assert.match(supplyAdapter, /rows\.length > 0 && approvedJobs\.length === 0/);
  assert.match(routeRecovery, /classifyJobDiscoveryResponse\(body, surface, response\.status\)/);
  assert.match(routeRecovery, /headers: response\.headers/);
});

test('Job Search and Sona Picks preserve prior results and render named recovery actions', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const weekly = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/WeeklyPicksSection.tsx'), 'utf8');
  const widget = fs.readFileSync(path.join(repoRoot, 'components/JobFeedWidget.tsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(repoRoot, 'components/SuiteSidebar.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(repoRoot, 'components/jobs/JobDiscoveryRecoveryPanel.tsx'), 'utf8');

  assert.match(page, /setSearchRecovery\(classifyJobDiscoveryFailure\(error, 'search'\)\)/);
  assert.match(page, /searchRequestIdRef\.current = requestId/);
  assert.match(page, /requestId !== searchRequestIdRef\.current/);
  assert.match(page, /recovery=\{searchRecovery\}/);
  assert.match(page, /Edit search/);
  assert.match(page, /id="job-search-target-role"/);
  assert.match(page, /localStorage\.setItem\(jobCountKey\(jobCountUserId\)/);
  assert.match(page, /pendingSearchAfterAuthRef\.current = \{ query, location, salaryMin \}/);
  assert.match(page, /fetchJobs\(1, pending\.query, pending\.location, pending\.salaryMin\)/);
  assert.match(page, /readJobPacketRecovery\(data\.recovery\)/);
  assert.match(page, /setPackets\(readStoredPackets\(JSON\.parse\(savedPackets\)\)\)/);
  assert.match(page, /candidate\.status === 'preparing'/);
  assert.match(page, /applicationUrl: job\.outboundLinkVerified \? job\.url : undefined/);
  assert.match(page, /job\.outboundLinkVerified && job\.url/);

  assert.match(weekly, /setRecovery\(classifyJobDiscoveryFailure\(error, 'suggestions'\)\)/);
  assert.match(weekly, /data\.partial \? mergePreservedJobResults\(previousJobs, nextJobs\) : nextJobs/);
  assert.match(weekly, /suggestionsRequestIdRef\.current = requestId/);
  assert.match(weekly, /replacement \|\| \(data\.partial \? current : null\)/);
  assert.match(weekly, /getJobResultIdentity\(job\) === currentIdentity/);
  assert.match(weekly, /key=\{getJobResultIdentity\(job\)\}/);
  assert.doesNotMatch(weekly, /job\.id === current\.id/);
  assert.match(weekly, /motion\.button/);
  assert.match(weekly, /handleRecoveryAction/);
  assert.match(weekly, /setAuthModal\(recovery\.action === 'create_account' \? 'signup' : 'login'\)/);
  assert.match(weekly, /JobDiscoveryRecoveryPanel/);
  assert.match(weekly, /!loading && !recovery && jobs\.length === 0/);
  assert.doesNotMatch(weekly, /Network error loading suggestions/);
  assert.doesNotMatch(weekly, /setError\(/);

  assert.match(widget, /setRecovery\(classifyJobDiscoveryFailure\(error, 'suggestions'\)\)/);
  assert.match(widget, /setRecovery\(classifyJobDiscoveryResponse\(data, 'suggestions', res\.status\)\)/);
  assert.ok(widget.indexOf('if (data.needsSetup)') < widget.indexOf('res.ok && data.success && Array.isArray(data.jobs)'));
  assert.match(widget, /data\.partial \? mergePreservedJobResults\(previousJobs, nextJobs\) : nextJobs/);
  assert.match(widget, /suggestionsRequestIdRef\.current = requestId/);
  assert.match(widget, /JobDiscoveryRecoveryPanel recovery=\{recovery\}/);
  assert.match(widget, /handleRecoveryAction/);
  assert.match(widget, /setAuthModal\(recovery\.action === 'create_account' \? 'signup' : 'login'\)/);
  assert.match(widget, /renderAuthModal\(\)/);
  assert.match(widget, /key=\{getJobResultIdentity\(job\)\}/);
  assert.match(widget, /job\.outboundLinkVerified === true && job\.url/);
  assert.match(widget, /setAlertError\('Sona Picks could not be enabled\./);
  assert.match(widget, /talent-job-alert-prompt-dismissed:\$\{uid\}/);
  assert.match(widget, /alertRequestIdRef\.current = requestId/);
  assert.match(widget, /activeAlertUserIdRef\.current !== requestUserId/);
  assert.match(widget, /activeAlertAccessTokenRef\.current !== accessToken/);
  assert.match(widget, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(widget, /role="status" aria-live="polite"/);
  assert.doesNotMatch(widget, /talent-job-widget-cache/);
  assert.match(widget, /setJobs\(\[\]\)/);
  assert.match(widget, /localStorage\.setItem\(jobCountKey\(userId\), '0'\)/);
  assert.match(widget, /window\.dispatchEvent\(new Event\('job-count-updated'\)\)/);
  assert.match(widget, /\[fetchSuggestions, userId\]/);
  assert.match(widget, /talent-job-curated-count:\$\{uid\}/);
  assert.doesNotMatch(widget, /if \(!user \|\| error\) return null/);
  assert.doesNotMatch(widget, /setError\(/);

  assert.match(sidebar, /localStorage\.removeItem\(LEGACY_JOB_CACHE_KEY\)/);
  assert.match(sidebar, /talent-job-curated-count:\$\{uid\}/);
  assert.match(sidebar, /data\.success && Array\.isArray\(data\.jobs\)/);
  assert.match(sidebar, /if \(data\.needsSetup\)/);
  assert.match(sidebar, /fetchedUidRef\.current !== uid/);
  assert.doesNotMatch(sidebar, /JSON\.stringify\(\{ data: data\.jobs/);

  assert.match(panel, /min-h-11/);
  assert.match(panel, /recovery\.nextAction/);
  assert.match(panel, /aria-live="polite"/);
});
