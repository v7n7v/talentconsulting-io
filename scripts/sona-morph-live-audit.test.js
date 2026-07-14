const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-live-audit-test-'));
const outfile = path.join(outdir, 'sona-live-audit.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'sona', 'morph-live-audit.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  LIVE_MORPH_AUDIT_CASES,
  generateGuardedMorphDraft,
  prioritizeVerifiedResumeEvidence,
  resumeTruthFingerprint,
  runSonaMorphLiveAudit,
} = require(outfile);

function extractResume(userPrompt) {
  const match = userPrompt.match(/<user_verified_resume>\n([\s\S]*?)\n<\/user_verified_resume>/);
  if (!match) throw new Error('verified resume fixture missing from prompt');
  return JSON.parse(match[1]);
}

function overlapScore(value, target) {
  const targetTokens = new Set((target.toLowerCase().match(/[a-z0-9+#.-]+/g) || []));
  return (value.toLowerCase().match(/[a-z0-9+#.-]+/g) || [])
    .filter(token => targetTokens.has(token)).length;
}

test('20-case live audit uses the production prompt and accepts safe relevance reordering', async () => {
  let calls = 0;
  const report = await runSonaMorphLiveAudit(async (systemPrompt, userPrompt, options) => {
    calls += 1;
    assert.match(systemPrompt, /only reorder complete existing sentences and complete existing bullet strings/i);
    assert.doesNotMatch(systemPrompt, /rephrase information/i);
    assert.equal(options.temperature, 0.15);
    const resume = extractResume(userPrompt);
    const target = userPrompt.match(/<user_job_description>\n([\s\S]*?)\n<\/user_job_description>/)?.[1] || userPrompt;
    const summarySentences = resume.summary.match(/[^.!?]+[.!?]/g) || [resume.summary];
    resume.summary = summarySentences
      .sort((left, right) => overlapScore(right, target) - overlapScore(left, target))
      .join(' ')
      .trim();
    resume.experience[0].bullets.sort(
      (left, right) => overlapScore(right, target) - overlapScore(left, target),
    );
    return { morphedResume: resume };
  });

  assert.equal(LIVE_MORPH_AUDIT_CASES.length, 20);
  assert.equal(calls, 20);
  assert.equal(report.successfulCases, 20);
  assert.equal(report.safeCases, 20);
  assert.ok(report.usefulCases >= 10);
  assert.equal(report.regressedCases, 0);
  assert.equal(report.truthPassed, true);
  assert.equal(report.utilityPassed, true);
  assert.equal(report.releaseReady, true);
});

test('independent truth fingerprint detects semantic and structural changes', () => {
  const source = {
    summary: 'Never managed security budgets. Reviewed security alerts.',
    skills: ['Security'],
    experience: [{ company: 'Acme', role: 'Analyst', bullets: ['Reviewed alerts.', 'Documented incidents.'] }],
  };
  const reordered = {
    ...source,
    summary: 'Reviewed security alerts. Never managed security budgets.',
    experience: [{ ...source.experience[0], bullets: ['Documented incidents.', 'Reviewed alerts.'] }],
  };
  const fabricated = {
    ...source,
    summary: 'Managed security budgets. Reviewed security alerts.',
  };

  assert.equal(resumeTruthFingerprint(source), resumeTruthFingerprint(reordered));
  assert.notEqual(resumeTruthFingerprint(source), resumeTruthFingerprint(fabricated));
});

test('morph strength limits how much verified evidence can move', () => {
  const source = {
    summary: 'Operations analyst. Documents decisions clearly.',
    experience: [{
      company: 'Acme',
      role: 'Analyst',
      bullets: ['Alpha evidence.', 'Beta evidence.', 'Gamma evidence.', 'Delta evidence.'],
    }],
  };
  const target = 'Beta Gamma Delta';
  const low = prioritizeVerifiedResumeEvidence(source, target, 10);
  const medium = prioritizeVerifiedResumeEvidence(source, target, 50);
  const full = prioritizeVerifiedResumeEvidence(source, target, 100);

  assert.deepEqual(low, source);
  assert.notDeepEqual(medium, low);
  assert.notDeepEqual(full, medium);
  assert.equal(full.experience[0].bullets[0], 'Beta evidence.');
  assert.equal(full.experience[0].bullets[1], 'Gamma evidence.');
});

test('model permutations cannot bypass the end-to-end morph strength budget', async () => {
  const source = {
    summary: 'Operations analyst. Documents decisions clearly.',
    experience: [{
      company: 'Acme',
      role: 'Analyst',
      bullets: ['Alpha evidence.', 'Beta evidence.', 'Gamma evidence.', 'Delta evidence.'],
    }],
  };
  const completion = async () => ({
    morphedResume: {
      ...source,
      experience: [{ ...source.experience[0], bullets: [...source.experience[0].bullets].reverse() }],
    },
  });
  const access = percentage => ({
    requestedMorphPercentage: percentage,
    effectiveMorphPercentage: percentage,
    maxAllowedMorphPercentage: percentage,
    consentUsed: percentage === 100,
    requiresMorphConsent: false,
    mode: 'automated',
  });

  const low = await generateGuardedMorphDraft({
    resume: source,
    jobTitle: 'Beta Gamma Delta Analyst',
    access: access(10),
  }, completion);
  const full = await generateGuardedMorphDraft({
    resume: source,
    jobTitle: 'Beta Gamma Delta Analyst',
    access: access(100),
  }, completion);

  assert.deepEqual(low.resume.experience[0].bullets, source.experience[0].bullets);
  assert.notDeepEqual(full.resume.experience[0].bullets, source.experience[0].bullets);
  assert.equal(full.resume.experience[0].bullets[0], 'Beta evidence.');
});

test('fabricated model output is blocked before deterministic safe ranking', async () => {
  const report = await runSonaMorphLiveAudit(async (_systemPrompt, userPrompt) => {
    const resume = extractResume(userPrompt);
    resume.summary = 'Invented executive who managed a billion-dollar global programme.';
    resume.experience[0].bullets = ['Invented a new employer and saved $50 million.'];
    resume.education = [{ degree: 'Ph.D.', institution: 'Invented University', year: '2026' }];
    return { morphedResume: resume };
  });

  assert.equal(report.successfulCases, 20);
  assert.equal(report.safeCases, 20);
  assert.ok(report.usefulCases >= 10);
  assert.equal(report.regressedCases, 0);
  assert.ok(report.blockedChangeCount >= 20);
  assert.equal(report.truthPassed, true);
  assert.equal(report.utilityPassed, true);
  assert.equal(report.releaseReady, true);
});

test('live audit path is side-effect-free and the production morph uses it', () => {
  const audit = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'morph-live-audit.ts'), 'utf8');
  const production = fs.readFileSync(path.join(repoRoot, 'lib', 'sona', 'guarded-resume-morph.ts'), 'utf8');
  const manualRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'resume', 'morph', 'route.ts'), 'utf8');
  assert.doesNotMatch(audit, /getAdminDb|\.collection\(|\.add\(|\.set\(/);
  assert.match(production, /generateGuardedMorphDraft\(/);
  assert.match(manualRoute, /generateGuardedMorphDraft\(/);
  assert.doesNotMatch(manualRoute, /groqJSONCompletion|quickClean|applyResumeMorphGuardrails/);
  assert.doesNotMatch(manualRoute, /result\.matchScore/);
  assert.match(manualRoute, /reserveRateLimit\(capKey, cap\)/);
  assert.match(manualRoute, /const guarded = await generateGuardedMorphDraft[\s\S]*commitRateLimitReservation\(/);
  assert.match(manualRoute, /catch \(error: unknown\)[\s\S]*releaseRateLimitReservation\(/);
});
