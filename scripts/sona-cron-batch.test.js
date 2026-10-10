const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-cron-batch-'));
const outfile = path.join(outdir, 'sona-cron-batch.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'assistant', 'cron-user-batch.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});
const { selectDailyCronBatch } = require(outfile);

test('small user sets are returned once without mutation', () => {
  const users = ['a', 'b', 'c'];
  assert.deepEqual(selectDailyCronBatch(users, 50, new Date('2026-07-10T00:00:00Z')), users);
  assert.deepEqual(users, ['a', 'b', 'c']);
});

test('the daily batch is bounded and wraps without duplicates', () => {
  const users = Array.from({ length: 120 }, (_, index) => `user-${index}`);
  const batch = selectDailyCronBatch(users, 50, new Date('2026-07-10T00:00:00Z'));
  assert.equal(batch.length, 50);
  assert.equal(new Set(batch).size, 50);
});

test('consecutive daily runs rotate through every user instead of starving the tail', () => {
  const users = Array.from({ length: 125 }, (_, index) => `user-${index}`);
  const seen = new Set();
  for (let day = 0; day < 5; day += 1) {
    const date = new Date(Date.UTC(2026, 6, 10 + day));
    for (const user of selectDailyCronBatch(users, 50, date)) seen.add(user);
  }
  assert.equal(seen.size, users.length);
});

test('zero and negative limits select no users', () => {
  assert.deepEqual(selectDailyCronBatch(['a'], 0), []);
  assert.deepEqual(selectDailyCronBatch(['a'], -2), []);
});

test('scheduled packets use shared truth locks and persist immutable source proof', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/cron/agent-pipeline/route.ts'), 'utf8');
  const rules = fs.readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
  const mutableCollections = rules.slice(
    rules.indexOf('function isUserMutableCollection'),
    rules.indexOf('// Per-user root documents'),
  );

  assert.match(route, /generateGuardedMorphDraft\(/);
  assert.match(route, /buildTruthLockedCoverLetter\([\s\S]*resume: baseResume/);
  assert.doesNotMatch(route, /Morph this resume for the target job|Write a natural cover letter/);
  assert.doesNotMatch(route, /applyResumeMorphGuardrails\(/);
  assert.match(route, /source_resume_id: baseResumeId/);
  assert.match(route, /source_resume_hash: baseResumeHash/);
  assert.match(route, /source_resume_type: baseResumeSource/);
  assert.match(route, /source_resume_snapshot: baseResume/);
  assert.match(route, /generation_status: packetPrepared \? 'prepared'/);
  assert.match(route, /cover_letter_guardrail_report: coverLetterGuardrailReport/);
  assert.match(route, /packetPrepared[\s\S]*Boolean\(resumeVersionId\)/);
  assert.doesNotMatch(mutableCollections, /'agent_queue'/);
  assert.match(rules, /match \/users\/\{userId\}\/agent_queue\/\{queueId\}/);
  const queueRules = rules.slice(rules.indexOf('match /users/{userId}/agent_queue/{queueId}'), rules.indexOf('// Per-user product data isolation'));
  assert.match(queueRules, /allow create: if false/);
  assert.match(queueRules, /affectedKeys\(\)\.hasOnly\([\s\S]*'feedbackTags', 'last_action_at'/);
  assert.match(queueRules, /status in \['dismissed', 'expired'\]/);
  assert.doesNotMatch(queueRules, /'approved'|'assist_apply'|'human_review'|'application_id'/);
  const databaseSuite = fs.readFileSync(path.join(repoRoot, 'lib/database-suite.ts'), 'utf8');
  const reviewRoute = fs.readFileSync(path.join(repoRoot, 'app/api/agent/packet-review/route.ts'), 'utf8');
  assert.match(databaseSuite, /authFetch\('\/api\/agent\/packet-review'/);
  assert.match(reviewRoute, /db\.runTransaction/);
  assert.match(reviewRoute, /revision !== inspection\.revision/);
  assert.match(reviewRoute, /existing\.source_meta\?\.review_revision !== revision/);
  assert.match(rules, /source_resume_snapshot/);
});
