const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const agentPage = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'agent', 'page.tsx'), 'utf8');
const jobSearchPage = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'job-search', 'page.tsx'), 'utf8');
const preferences = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'job-search', 'JobPreferencesPanel.tsx'), 'utf8');
const notificationStatus = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'harness-notification-status.ts'), 'utf8');

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-alert-consent-handoff-'));
const outfile = path.join(outdir, 'alert-consent-handoff.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'sona', 'alert-consent-handoff.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const { resolveAlertConsentHandoff, normalizeAlertTargetRole } = require(outfile);

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test('a completed Sona review offers a named email-alert consent handoff', () => {
  assert.match(agentPage, /queuedCount > 0 && \(/);
  assert.match(agentPage, /getSonaHarnessNotificationStatus\(result\.notification\)/);
  assert.match(notificationStatus, /Email remains off until you save alert consent\./);
  assert.match(agentPage, /href="\/suite\/job-search\?controls=alerts#sona-picks-controls"/);
  assert.match(agentPage, /Choose email alerts/);
  assert.match(agentPage, /min-h-11/);
  assert.match(agentPage, /sessionStorage\.setItem\(SONA_ALERT_TARGET_ROLE_KEY, targetRole\)/);
});

test('the consent deep link opens and focuses the existing Sona Picks controls', () => {
  assert.match(jobSearchPage, /useSearchParams/);
  assert.match(jobSearchPage, /const alertControlsRequested = searchParams\.get\('controls'\) === 'alerts'/);
  assert.match(jobSearchPage, /setShowPrefs\(true\)/);
  assert.match(jobSearchPage, /if \(!alertControlsRequested \|\| !showPrefs \|\| focusedAlertControlsRef\.current\) return/);
  assert.match(jobSearchPage, /getElementById\('sona-picks-controls'\)\?\.scrollIntoView/);
  assert.match(jobSearchPage, /getElementById\('sona-picks-controls'\)\?\.focus/);
  assert.match(preferences, /id="sona-picks-controls"/);
  assert.match(preferences, /tabIndex=\{-1\}/);
  assert.match(preferences, /id="sona-picks-email-toggle"/);
});

test('opening the handoff cannot grant consent or send an email', () => {
  const launch = section(agentPage, 'const launchActivationProof', 'const editActivationTarget');
  const handoff = section(agentPage, '{queuedCount > 0 && (', 'Choose email alerts');
  assert.match(launch, /notify:\s*false/);
  assert.doesNotMatch(handoff, /fetch\(|authFetch\(|setJobAlertsEnabled|notify:\s*true/);
  assert.match(preferences, /jobAlertsConsentAcknowledged: jobAlertsEnabled/);
  assert.match(preferences, /jobAlertsConsentSource: 'job_preferences'/);
  assert.ok(preferences.lastIndexOf("fetch('/api/jobs/preferences'") > preferences.indexOf('const savePrefs = async'));
  assert.doesNotMatch(jobSearchPage, /jobAlertsConsentAcknowledged/);
});

test('late preference hydration cannot reverse an early consent interaction', () => {
  const loading = resolveAlertConsentHandoff({
    loaded: false,
    canPersist: false,
    saving: false,
    targetRoles: [],
    roleInput: '',
    suggestedTargetRole: 'Security Engineer',
  });
  assert.deepEqual(loading, { controlsDisabled: true, suggestedRole: '', saveDisabled: true });

  const hydrated = resolveAlertConsentHandoff({
    loaded: true,
    canPersist: true,
    saving: false,
    targetRoles: [],
    roleInput: '',
    suggestedTargetRole: 'Security Engineer',
  });
  assert.deepEqual(hydrated, { controlsDisabled: false, suggestedRole: 'Security Engineer', saveDisabled: false });
  const signedOut = resolveAlertConsentHandoff({
    loaded: true,
    canPersist: false,
    saving: false,
    targetRoles: [],
    roleInput: '',
    suggestedTargetRole: 'Security Engineer',
  });
  assert.equal(signedOut.controlsDisabled, true);
  assert.equal(signedOut.saveDisabled, true);
  assert.match(preferences, /disabled=\{alertConsentHandoff\.controlsDisabled\}/);
  assert.match(preferences, /disabled=\{alertConsentHandoff\.saveDisabled\}/);
  assert.match(preferences, /canPersist: preferenceAccess === 'ready'/);
  assert.match(preferences, /requestId !== preferenceLoadRequestRef\.current/);
  assert.match(preferences, /setPreferenceAccess\('unavailable'\)/);
  assert.match(preferences, /setPreferenceLoadAttempt\(attempt => attempt \+ 1\)/);
  assert.match(preferences, />\s*Retry\s*</);
});

test('the Sona target is locally prefilled but remains unsaved until Save', () => {
  assert.equal(normalizeAlertTargetRole('  Security\n Engineer  '), 'Security Engineer');
  assert.equal(normalizeAlertTargetRole('x'.repeat(140)).length, 120);
  assert.match(jobSearchPage, /sessionStorage\.removeItem\(SONA_ALERT_TARGET_ROLE_KEY\)/);
  assert.match(jobSearchPage, /suggestedTargetRole=\{alertControlsRequested \? alertSuggestedTargetRole \|\| query : undefined\}/);
  assert.match(preferences, /setRoleInput\(alertConsentHandoff\.suggestedRole\)/);
});
