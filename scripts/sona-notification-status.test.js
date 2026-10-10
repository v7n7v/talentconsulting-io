const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-notification-status-'));
const outfile = path.join(outdir, 'sona-notification-status.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'assistant', 'harness-notification-status.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const { getSonaHarnessNotificationStatus } = require(outfile);

test('provider acceptance remains pending until a signed delivery receipt arrives', () => {
  const status = getSonaHarnessNotificationStatus({ emailAccepted: true, emailSent: false });
  assert.equal(status.status, 'accepted');
  assert.equal(status.label, 'Confirmation pending');
  assert.match(status.message, /delivery confirmation is pending/i);
  assert.doesNotMatch(status.message, /delivered|reached your inbox/i);
});

test('an intentionally disabled run stays visibly in-app only', () => {
  const status = getSonaHarnessNotificationStatus({
    inApp: true,
    emailAccepted: false,
    emailSkippedReason: 'Notification disabled for this run',
  });
  assert.equal(status.status, 'in_app_only');
  assert.equal(status.label, 'In-app only');
  assert.match(status.message, /save alert consent/i);
});

test('email failures are honest without exposing raw provider details', () => {
  const status = getSonaHarnessNotificationStatus({
    inApp: true,
    emailAccepted: false,
    emailSkippedReason: 'Resend 401 secret-provider-stack-detail',
  });
  assert.equal(status.status, 'unavailable');
  assert.equal(status.label, 'Email unavailable');
  assert.match(status.message, /was not sent/i);
  assert.doesNotMatch(JSON.stringify(status), /401|resend|secret-provider-stack-detail/i);
});

test('legacy emailSent cannot be mistaken for delivered evidence', () => {
  const status = getSonaHarnessNotificationStatus({ emailSent: true });
  assert.equal(status.status, 'in_app_only');
  assert.doesNotMatch(status.message, /delivered|reached your inbox/i);
});

test('Taco result UI renders the bounded status contract and alert-consent handoff', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'agent', 'page.tsx'), 'utf8');
  assert.match(page, /getSonaHarnessNotificationStatus\(\s*result\.notification,?\s*\)/);
  assert.match(page, /notificationState\.label/);
  assert.match(page, /notificationState\.message/);
  assert.match(page, /Choose email alerts/);
  assert.doesNotMatch(page, /Email was accepted for this run/);
});
