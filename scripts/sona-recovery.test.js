const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-recovery-'));
const outfile = path.join(outdir, 'sona-recovery.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'recovery.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  activationPreviewConsumedRecovery,
  classifySonaFailure,
  harnessFailureRecovery,
  invalidTargetRecovery,
  resumeLookupUnavailableRecovery,
  selectedResumeUnavailableRecovery,
  sonaServiceUnavailableRecovery,
} = require(outfile);

test('rate limits return a retryable busy state without implying lost work', () => {
  const recovery = classifySonaFailure(new Error('OpenRouter request failed with 429'));
  assert.equal(recovery.code, 'model_busy');
  assert.equal(recovery.retryable, true);
  assert.equal(recovery.action, 'retry');
  assert.match(recovery.message, /no resume.*was changed/i);
});

test('network timeouts return a safe retry action', () => {
  const recovery = classifySonaFailure(new Error('fetch failed: network timeout'));
  assert.equal(recovery.code, 'network_interrupted');
  assert.equal(recovery.action, 'retry');
  assert.match(recovery.message, /stopped safely/i);
});

test('unknown failures use a truthful generic recovery instead of raw internals', () => {
  const recovery = classifySonaFailure(new Error('secret provider stack detail'));
  assert.equal(recovery.code, 'sona_failed');
  assert.doesNotMatch(recovery.message, /secret provider stack detail/);
  assert.equal(recovery.retryable, true);
});

test('target, harness and service failures expose distinct next actions', () => {
  assert.equal(invalidTargetRecovery().action, 'edit_target');
  assert.equal(resumeLookupUnavailableRecovery().action, 'retry');
  assert.equal(resumeLookupUnavailableRecovery().retryable, true);
  assert.match(resumeLookupUnavailableRecovery().message, /stopped before searching/i);
  assert.equal(selectedResumeUnavailableRecovery().action, 'upload_resume');
  assert.equal(selectedResumeUnavailableRecovery().retryable, false);
  assert.match(selectedResumeUnavailableRecovery().message, /did not replace it/i);
  assert.equal(harnessFailureRecovery().action, 'retry');
  assert.equal(sonaServiceUnavailableRecovery().action, 'none');
  assert.equal(sonaServiceUnavailableRecovery().retryable, false);
});

test('a consumed activation preview never offers the same receipt as a retry', () => {
  const recovery = activationPreviewConsumedRecovery();
  assert.equal(recovery.code, 'activation_preview_consumed');
  assert.equal(recovery.action, 'edit_target');
  assert.equal(recovery.retryable, false);
  assert.match(recovery.message, /one-time preview is now closed/i);
  assert.match(recovery.message, /no external application was submitted/i);
});
