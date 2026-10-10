const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const entry = path.join(__dirname, '../lib/assistant/tools.ts');
const mockModules = {
  '@/lib/firebase-admin': { getAdminDb: () => globalThis.__queueAuthorityDb },
  '@/lib/job-search-api': { calculateFitScore: () => ({}), extractSkillsFromDescription: () => [] },
  '@/lib/job-recommendation-platform': { searchTalentJobSupply: async () => ({ jobs: [] }) },
  '@/lib/portal-scanner': { searchCompanyJobs: async () => [] },
  '@/lib/story-bank': { createStoryBankStory: async () => ({}), listStoryBankStories: async () => [] },
  '@/lib/career-twin': { invalidateTwin: async () => {} },
  '@/lib/server-resume': { extractResumeSkills: () => [], getLatestResumeForUser: async () => ({ resume: null }) },
  '@/lib/assistant/agent-harness': { runSonaAgentHarness: async () => ({}) },
  '@/lib/assistant/guarded-resume-morph': { runGuardedSonaResumeMorph: async () => ({}) },
};

const bundled = buildSync({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  external: Object.keys(mockModules),
});

function loadTools() {
  const compiled = new Module(entry, module);
  compiled.filename = entry;
  compiled.paths = module.paths;
  compiled.require = id => Object.hasOwn(mockModules, id) ? mockModules[id] : Module.prototype.require.call(compiled, id);
  compiled._compile(bundled.outputFiles[0].text, entry);
  return compiled.exports;
}

function makeDb() {
  const writes = [];
  const touchedCollections = [];
  const ref = documentPath => ({
    id: documentPath.split('/').at(-1),
    collection(name) { return collection(`${documentPath}/${name}`); },
  });
  const collection = collectionPath => {
    touchedCollections.push(collectionPath);
    return {
      doc(id) { return ref(`${collectionPath}/${id}`); },
      where() {
        return {
          get: async () => ({ docs: [], size: 0 }),
        };
      },
      add: async data => {
        writes.push({ path: collectionPath, data });
        return { id: 'unexpected-queue-write' };
      },
    };
  };
  return { writes, touchedCollections, collection };
}

test('legacy queue_application confirmation and forged owner arguments cannot write a queue item', async () => {
  const db = makeDb();
  globalThis.__queueAuthorityDb = db;
  const { executeTool, SONA_TOOLS } = loadTools();
  const queueTool = SONA_TOOLS.find(item => item.function?.name === 'queue_application');

  assert.ok(queueTool);
  assert.equal(Object.hasOwn(queueTool.function.parameters.properties, 'userConfirmed'), false);
  assert.deepEqual(queueTool.function.parameters.required, ['company', 'role']);

  for (const userConfirmed of [true, false]) {
    const response = JSON.parse(await executeTool('queue_application', {
      company: 'Forged Company',
      role: 'Forged Role',
      url: 'https://example.invalid/apply',
      userConfirmed,
      uid: 'victim-user',
      userId: 'victim-user',
      user_id: 'victim-user',
      ownerId: 'victim-user',
      queueId: 'victim-queue-item',
      source: 'agent_queue',
    }, 'signed-in-alice'));

    assert.equal(response.success, false);
    assert.equal(response.code, 'PREPARATION_REQUIRED');
    assert.equal(response.preparation_required, true);
    assert.equal(response.nextAction.href, '/suite/job-search');
    assert.match(response.message, /choose a specific job in Job Search/i);
    assert.match(response.message, /confirmed resume/i);
    assert.match(response.message, /use Prepare/i);
    assert.match(response.message, /Nothing has been queued or submitted/i);
  }

  assert.deepEqual(db.writes, []);
  assert.equal(db.touchedCollections.some(value => value.endsWith('/agent_queue')), false);
  delete globalThis.__queueAuthorityDb;
});

test('legacy queue guidance is consistent across the SDK schema and chat prompt', () => {
  const toolkit = fs.readFileSync(path.join(__dirname, '../lib/assistant/toolkit.ts'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../app/api/agent/chat/route.ts'), 'utf8');
  assert.match(toolkit, /Legacy compatibility tool\. It cannot create a queue item or authorize preparation/);
  assert.match(route, /legacy queue_application tool cannot create queue items or authorize preparation/i);
  assert.match(route, /NEVER submit, email, or contact anyone on their behalf/);
});

test('the explicit Job Search Prepare entry point remains wired to apply-pipeline', () => {
  const page = fs.readFileSync(path.join(__dirname, '../app/suite/job-search/page.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(__dirname, '../app/api/agent/apply-pipeline/route.ts'), 'utf8');
  assert.match(page, /authFetch\('\/api\/agent\/apply-pipeline'/);
  assert.match(page, /prepareOnly:\s*true/);
  assert.match(page, /const prepareApplication = useCallback/);
  assert.match(route, /canPrepareApplicationPackets\(guard\.user\.tier\)/);
  assert.match(route, /getVerifiedResumeForUserById\(db, userId, requestedResumeVersionId\)/);
});
