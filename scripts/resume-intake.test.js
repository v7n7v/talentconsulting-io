const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function load(entry) {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    logLevel: 'silent',
  });
  const compiled = new Module(path.join(root, 'resume-intake-test.cjs'), module);
  compiled.filename = path.join(root, 'resume-intake-test.cjs');
  compiled.paths = Module._nodeModulePaths(root);
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  return compiled.exports;
}

const intake = load('lib/resume-intake.ts');

function resume() {
  return {
    name: 'Amina Smith',
    title: 'Security Engineer',
    summary: 'Network assurance specialist.',
    experience: [{ company: 'Northstar', role: 'Engineer', achievements: ['Improved reliability.'] }],
    education: [{ degree: 'BS Cybersecurity', institution: 'Rutgers', year: '2021' }],
    skills: [{ category: 'Security', items: ['NIST', 'LTE'] }],
  };
}

test('review summary counts extracted evidence and preserves editable draft shape', () => {
  const draft = resume();
  assert.deepEqual(intake.resumeIntakeSummary(draft), {
    name: 'Amina Smith',
    title: 'Security Engineer',
    experienceCount: 1,
    skillCount: 2,
    educationCount: 1,
    hasSourceEvidence: true,
  });
  const edited = { ...draft, title: 'Principal Security Engineer' };
  assert.equal(intake.resumeIntakeSummary(edited).title, 'Principal Security Engineer');
  assert.equal(draft.title, 'Security Engineer');
});

test('late and cancelled upload responses are rejected before staging review', () => {
  const controller = new AbortController();
  assert.equal(intake.isCurrentResumeIntake(4, 5), false);
  assert.equal(intake.isCurrentResumeIntake(5, 5, controller.signal), true);
  controller.abort();
  assert.equal(intake.isCurrentResumeIntake(5, 5, controller.signal), false);
});

test('landing handoff retries carry an idempotency key while direct uploads do not', () => {
  assert.deepEqual(intake.resumeIntakeSaveOptions('landing_resume_handoff', 'handoff-42'), {
    idempotencyKey: 'handoff-42',
  });
  assert.deepEqual(intake.resumeIntakeSaveOptions('sona_agent_upload'), {});
  assert.deepEqual(intake.resumeIntakeSaveOptions('landing_resume_handoff'), {});
  assert.deepEqual(intake.resumeIntakeSaveOptions('landing_resume_handoff', 'handoff-42', 'new-intake-key'), {
    idempotencyKey: 'handoff-42',
  });
});

test('draft storage is isolated per account and unavailable before auth', () => {
  assert.equal(intake.resumeDraftStorageKey('user-a'), 'talent-resume-draft:user-a');
  assert.equal(intake.resumeDraftStorageKey('user-b'), 'talent-resume-draft:user-b');
  assert.equal(intake.resumeDraftStorageKey(null), null);
});

test('Ask Taco keeps parsing and saving on separate boundaries', () => {
  const source = fs.readFileSync(path.join(root, 'app/suite/agent/page.tsx'), 'utf8');
  const processStart = source.indexOf('const processExtractedResume');
  const confirmStart = source.indexOf('const confirmResumeIntake');
  assert.ok(processStart >= 0 && confirmStart > processStart);
  const processBody = source.slice(processStart, confirmStart);
  const confirmBody = source.slice(confirmStart, source.indexOf('const handleResumeUpload', confirmStart));
  assert.equal(processBody.includes('saveResumeVersion('), false);
  assert.equal(confirmBody.includes('saveResumeVersion('), true);
  assert.equal(confirmBody.includes('resumeIntakeSaveOptions('), true);
});

test('intake controller permits one save, retains review after failure, and rejects replacement completions', () => {
  const controller = intake.createResumeIntakeController();
  const key = controller.begin(1, 'account-a');
  assert.match(key, /^[a-f0-9]{40}$/);
  assert.equal(controller.stage(1, 'account-a'), true);
  assert.equal(controller.beginSave(1, 'account-a'), true);
  assert.equal(controller.beginSave(1, 'account-a'), false);
  assert.equal(controller.finishSave(1, 'account-a', false), true);
  assert.equal(controller.phase, 'review');
  assert.equal(controller.beginSave(1, 'account-a'), true);
  assert.equal(controller.finishSave(1, 'account-b', true), false);
  assert.equal(controller.cancel(1, 'account-a'), true);
  assert.equal(controller.finishSave(1, 'account-a', true), false);
  assert.equal(controller.isCurrent(1, 'account-a'), false);
});

test('onboarding upload is cancellable and ignores stale replacement results', () => {
  const source = fs.readFileSync(path.join(root, 'components/modals/OnboardingModal.tsx'), 'utf8');
  assert.match(source, /startResumeUpload\(file, \{ signal: controller\.signal \}\)/);
  assert.match(source, /requestId !== uploadRequestRef\.current/);
  assert.match(source, /uploadAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /resumeConfirmed/);
  assert.match(source, /resume_provenance/);
  assert.match(source, /resume_source_meta/);
  assert.match(source, /confirmedAt: resumeConfirmedAt/);
});

test('resume studio parse commits only for the mounted current account and request', () => {
  assert.equal(intake.isCurrentSourceParse(2, 2, 'account-a', 'account-a', true), true);
  assert.equal(intake.isCurrentSourceParse(1, 2, 'account-a', 'account-a', true), false);
  assert.equal(intake.isCurrentSourceParse(2, 2, 'account-a', 'account-b', true), false);
  assert.equal(intake.isCurrentSourceParse(2, 2, 'account-a', 'account-a', false), false);
});
