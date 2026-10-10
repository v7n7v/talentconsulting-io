const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

function loadSourceChooser() {
  const source = fs.readFileSync(path.join(repoRoot, 'lib/job-search-resume-source.ts'), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(request) {
      if (request === '@/lib/database-suite') return {};
      if (request === '@/lib/resume-provenance') {
        return {
          normalizeVerifiedResumeProvenance(value, recordedAt) {
            const origins = new Set(['user_upload', 'user_authored', 'onboarding_upload', 'sona_upload']);
            if (!value || typeof value !== 'object' || value.verified !== true || !origins.has(value.origin)) return null;
            return { verified: true, origin: value.origin, recordedAt };
          },
        };
      }
      return require(request);
    },
  };
  vm.runInNewContext(output, context, { filename: 'job-search-resume-source.ts' });
  return module.exports;
}

const { chooseJobSearchResumeSource, isEligibleJobSearchResume } = loadSourceChooser();

function resume(id, overrides = {}) {
  return {
    id,
    version_name: id,
    content: {},
    mode: 'technical',
    is_active: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

test('source chooser follows server source verification for legacy, confirmed, invalid, and guarded records', () => {
  const guarded = resume('guarded', {
    is_active: true,
    guardrail_report: { version: 1 },
  });
  const activeSource = resume('main', { version_name: 'Main resume', is_active: true });
  const confirmedUpload = resume('upload', {
    metadata: { resumeProvenance: { verified: true, origin: 'user_upload' } },
  });
  const invalidProvenance = resume('invalid', {
    metadata: { resumeProvenance: { verified: true, origin: 'agent' } },
  });

  assert.equal(isEligibleJobSearchResume(guarded), false);
  assert.equal(isEligibleJobSearchResume(activeSource), true);
  assert.equal(isEligibleJobSearchResume(confirmedUpload), true);
  assert.equal(isEligibleJobSearchResume(invalidProvenance), false);
  assert.equal(chooseJobSearchResumeSource([guarded, activeSource], guarded.id).resume.id, 'main');
});

test('active packet-named legacy versions remain eligible without generated markers', () => {
  const legacyPacket = resume('legacy-packet', {
    version_name: 'Founding AI Product Engineer packet',
    is_active: true,
    metadata: { targetRole: 'Founding AI Product Engineer', proofScore: 88 },
  });
  assert.equal(isEligibleJobSearchResume(legacyPacket), true);
});

test('source chooser preserves an eligible saved version and recovers an invalid deep link', () => {
  const saved = resume('saved', { is_active: true });
  const other = resume('other', { is_active: true, created_at: '2026-09-02T00:00:00.000Z' });
  const preserved = chooseJobSearchResumeSource([other, saved], saved.id);
  assert.equal(preserved.resume?.id, saved.id);
  assert.equal(preserved.recoveredFromId, false);
  const recovered = chooseJobSearchResumeSource([other, saved], 'missing');
  assert.equal(recovered.resume?.id, other.id);
  assert.equal(recovered.recoveredFromId, true);
});
