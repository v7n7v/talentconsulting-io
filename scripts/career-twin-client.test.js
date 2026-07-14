const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadCareerTwinClient() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-career-twin-client-'));
  const outfile = path.join(outdir, 'career-twin-client.cjs');

  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'career-twin-client.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });

  return require(outfile);
}

const {
  careerTwinPromptMetadata,
  compactList,
  normalizeCareerTwinMemory,
  normalizeCareerTwinSummary,
} = loadCareerTwinClient();

test('normalizeCareerTwinMemory supplies goals and search defaults for missing memory', () => {
  const memory = normalizeCareerTwinMemory(undefined, {
    currentTitle: 'Product manager',
    targetRoles: ['Product lead'],
    industries: ['SaaS'],
    education: ['BS Computer Science'],
  });

  assert.deepEqual(memory.goals.targetRoles, ['Product lead']);
  assert.deepEqual(memory.goals.industries, ['SaaS']);
  assert.equal(memory.goals.remotePreference, 'any');
  assert.equal(memory.activeSearch.totalApplications, 0);
  assert.equal(memory.constraints.requiresReviewBeforeExternalAction, true);
  assert.deepEqual(memory.confirmedFacts.education, ['BS Computer Science']);
});

test('normalizeCareerTwinSummary keeps partial signed-in twin data render-safe', () => {
  const partialTwin = {
    completeness: { score: 48, missing: ['Target roles defined'] },
    behavioralBank: { totalStories: 1, coverageScore: 8 },
    background: {
      currentTitle: 'Operations manager',
      targetRoles: ['Product operations lead'],
      industries: ['Marketplace'],
      education: ['MBA'],
    },
    memory: {
      identity: { name: 'New Google user' },
      activeSearch: { totalApplications: 2 },
      confirmedFacts: { hasResume: true },
      nextBestActions: [
        {
          label: 'Review next action',
          reason: 'Partial legacy action without id, path, or valid priority.',
          priority: 'urgent',
        },
      ],
    },
    exportable: true,
  };

  const normalized = normalizeCareerTwinSummary(partialTwin);

  assert.ok(normalized);
  assert.deepEqual(normalized.memory.goals.targetRoles, ['Product operations lead']);
  assert.deepEqual(normalized.memory.goals.industries, ['Marketplace']);
  assert.equal(normalized.memory.goals.remotePreference, 'any');
  assert.equal(normalized.memory.activeSearch.totalApplications, 2);
  assert.equal(normalized.memory.activeSearch.queuedApplications, 0);
  assert.equal(normalized.memory.confirmedFacts.hasResume, true);
  assert.equal(normalized.memory.constraints.requiresReviewBeforeExternalAction, true);
  assert.equal(normalized.memory.nextBestActions[0].id, 'action-0');
  assert.equal(normalized.memory.nextBestActions[0].path, '/suite/intelligence');
  assert.equal(normalized.memory.nextBestActions[0].priority, 'medium');
  assert.equal(compactList(normalized.memory.goals.targetRoles, 'Target roles not set', 2), 'Product operations lead');
});

test('careerTwinPromptMetadata handles partial legacy twins without throwing', () => {
  const metadata = careerTwinPromptMetadata({
    background: { targetRoles: ['Customer success manager'] },
    memory: {
      activeSearch: { queuedApplications: 3, skillGaps: ['SQL'] },
    },
  });

  assert.deepEqual(metadata.targetRoles, ['Customer success manager']);
  assert.equal(metadata.totalApplications, 0);
  assert.equal(metadata.queuedApplications, 3);
  assert.deepEqual(metadata.skillGaps, ['SQL']);
});
