const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadHelper() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-application-packet-export-'));
  const outfile = path.join(outdir, 'application-packet-export.cjs');
  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'application-packet-export.ts')],
    outfile, bundle: true, platform: 'node', format: 'cjs', target: 'es2022',
    alias: { '@': path.resolve(__dirname, '..') }, logLevel: 'silent',
  });
  return require(outfile);
}

const { loadApprovedApplicationPacketExport, packetContentHash } = loadHelper();
const source = {
  name: 'Ada Example', title: 'Engineer', email: 'ada@example.test', phone: '', location: 'London', summary: 'Builds systems.',
  experience: [{ company: 'Northstar', role: 'Engineer', duration: '2021–2025', achievements: ['Built services.'] }],
  education: [{ institution: 'Example University', degree: 'BSc', year: '2020' }], skills: [{ category: 'Systems', items: ['TypeScript'] }], certifications: [],
};
const candidate = structuredClone(source);
const linked = { id: 'resume-a', content: candidate };

async function responseFor(overrides = {}) {
  const binding = { artifact: { resumeVersionId: 'resume-a' } };
  const snapshot = {
    id: 'application-a', user_id: 'owner-a', review_revision: 'a'.repeat(64), review_ready: true,
    review_status: 'approved', review_source: source, review_resume: candidate, review_binding: binding,
    ...overrides,
  };
  return new Response(JSON.stringify({ success: true, data: [snapshot] }), { status: 200 });
}

function input({ app = {}, snapshot, isCurrent = () => true, ownerId = 'owner-a', linkedResume = linked, revision = 'a'.repeat(64) } = {}) {
  const application = { id: 'application-a', source: 'apply_pipeline', resume_version_id: 'resume-a', ...app };
  let requested;
  return {
    requested: () => requested,
    value: {
      ownerId, application, linkedResume, displayedReviewRevision: revision, isCurrent,
      authFetch: async (url, init) => { requested = { url, init }; return snapshot || responseFor(); },
    },
  };
}

test('fresh exact approved application snapshot yields guarded export content', async () => {
  const fixture = input();
  const result = await loadApprovedApplicationPacketExport(fixture.value);
  assert.equal(result.reviewRevision, 'a'.repeat(64));
  assert.equal(result.packetId, 'application-a');
  assert.deepEqual(result.resume.name, candidate.name);
  assert.match(fixture.requested().url, /kind=application&id=application-a/);
  assert.equal(fixture.requested().init.cache, 'no-store');
});

test('canonical SHA-256 sorts recursively and converts undefined fields to null', async () => {
  assert.equal(await packetContentHash({ z: undefined, a: { y: 2, x: 1 } }), await packetContentHash({ a: { x: 1, y: 2 }, z: null }));
});

test('stale revision, unapproved and blocked responses are refused', async t => {
  for (const overrides of [
    { review_revision: 'b'.repeat(64) },
    { review_status: 'stale' },
    { review_status: 'needs_review' },
    { review_ready: false },
  ]) {
    await t.test(JSON.stringify(overrides), async () => {
      await assert.rejects(loadApprovedApplicationPacketExport(input({ snapshot: await responseFor(overrides) }).value), /no longer approved/);
    });
  }
});

test('linked resume hash and packet source binding must match the reviewed snapshot', async () => {
  const changed = { ...linked, content: { ...candidate, summary: 'Changed after approval.' } };
  await assert.rejects(loadApprovedApplicationPacketExport(input({ linkedResume: changed }).value), /differs from the approved packet/);
  await assert.rejects(loadApprovedApplicationPacketExport(input({ snapshot: await responseFor({ review_binding: { artifact: { resumeVersionId: 'resume-b' } } }) }).value), /no longer approved/);
});

test('foreign owner and non-singleton API responses are refused', async () => {
  await assert.rejects(loadApprovedApplicationPacketExport(input({ snapshot: await responseFor({ user_id: 'owner-b' }) }).value), /no longer approved/);
  const multiple = new Response(JSON.stringify({ success: true, data: [{}, {}] }), { status: 200 });
  await assert.rejects(loadApprovedApplicationPacketExport(input({ snapshot: multiple }).value), /could not be verified/);
});

test('missing source and truth-guard changes block export until a new review', async () => {
  await assert.rejects(loadApprovedApplicationPacketExport(input({ snapshot: await responseFor({ review_source: null }) }).value), /missing its source/);
  const invented = { ...candidate, experience: [{ company: 'Invented Corp', role: 'Chief Engineer', duration: '2018–2026', achievements: ['Built services.'] }] };
  const inventedLinked = { id: 'resume-a', content: invented };
  await assert.rejects(loadApprovedApplicationPacketExport(input({ linkedResume: inventedLinked, snapshot: await responseFor({ review_resume: invented }) }).value), /Truth checks changed/);
});

test('owner or selection change while the fresh request is pending prevents export', async () => {
  let current = true;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const fixture = input({ isCurrent: () => current });
  fixture.value.authFetch = async () => { await pending; return responseFor(); };
  const result = loadApprovedApplicationPacketExport(fixture.value);
  current = false;
  release();
  await assert.rejects(result, /selected application changed/);
});

test('request abort and bounded timeout prevent a late export', async () => {
  const aborted = input();
  const caller = new AbortController();
  aborted.value.signal = caller.signal;
  aborted.value.authFetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  const pending = loadApprovedApplicationPacketExport(aborted.value);
  caller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');

  const timed = input();
  timed.value.timeoutMs = 5;
  timed.value.authFetch = async () => new Promise(() => {});
  await assert.rejects(loadApprovedApplicationPacketExport(timed.value), /timed out/i);
});

test('queue tracker resolves only its originating queue packet and stored review revision', async () => {
  const queueRevision = 'c'.repeat(64);
  let called;
  const queueSnapshot = await responseFor({ id: 'queue-a', review_revision: queueRevision });
  const fixture = input({ app: { id: 'tracker-a', source: 'agent_queue', source_meta: { queue_id: 'queue-a', review_revision: queueRevision } }, revision: undefined, snapshot: queueSnapshot });
  fixture.value.authFetch = async (url, init) => { called = { url, init }; return queueSnapshot; };
  await loadApprovedApplicationPacketExport(fixture.value);
  assert.match(called.url, /kind=queue&id=queue-a/);
});
