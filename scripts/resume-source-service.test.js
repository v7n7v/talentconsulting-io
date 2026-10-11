const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { buildSync } = require('esbuild');
const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'source-service-')), 'module.cjs');
buildSync({ entryPoints: [path.join(__dirname, '../lib/resume-source-service.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const api = require(output);
const policy = { enabled: true, retentionPolicyVersion: 'synthetic-test-v1' };
const uid = 'synthetic-alice';
const request = () => ({ requestId: 'c48a013a-d58b-4efc-812d-21c491e76a27', origin: 'user_upload', confirmedContent: { name: 'Synthetic Alice', title: '', email: '', phone: '', location: '', summary: 'Source words', experience: [], education: [], skills: [], certifications: [] } });

function database() {
  const records = new Map([[`account_source_fences/${uid}`, { status: 'active', retentionPolicyVersion: policy.retentionPolicyVersion }]]);
  let writes = 0;
  let serial = Promise.resolve();
  const ref = key => ({ path: key, id: key.split('/').at(-1), collection: name => ({ doc: id => ref(`${key}/${name}/${id}`) }) });
  return {
    records, get writes() { return writes; }, collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction(callback) {
      const run = serial.then(async () => {
        const pending = [];
        const result = await callback({ get: async reference => ({ exists: records.has(reference.path), data: () => records.get(reference.path) }), create: (reference, data) => pending.push([reference.path, data]) });
        for (const [key, value] of pending) { assert.equal(records.has(key), false); records.set(key, value); writes++; }
        return result;
      });
      serial = run.catch(() => {});
      return run;
    },
  };
}
const code = expected => error => error.code === expected;

test('real source service returns the original revision and timestamps after response loss and concurrent retry', async () => {
  const db = database();
  const [first, concurrent] = await Promise.all([api.confirmSearchSource(db, uid, request(), policy), api.confirmSearchSource(db, uid, request(), policy)]);
  const retry = await api.confirmSearchSource(db, uid, request(), policy);
  assert.equal(db.writes, 1);
  assert.equal(concurrent.replayed, true);
  assert.deepEqual(retry.source, first.source);
  assert.deepEqual(retry.receipt, first.receipt);
  const held = await api.confirmSearchSource(db, uid, request(), { enabled: false, retentionPolicyVersion: '' });
  assert.deepEqual(held.receipt, first.receipt);
  db.records.set(`account_source_fences/${uid}`, {status:'active',retentionPolicyVersion:'rotated-v2'});
  assert.deepEqual((await api.confirmSearchSource(db, uid, request(), policy)).receipt, first.receipt);
  assert.deepEqual(await api.readSearchSource(db, uid, first.receipt.sourceId), { source: first.source, receipt: first.receipt });
  const changed = request(); changed.confirmedContent.summary += ' changed';
  await assert.rejects(api.confirmSearchSource(db, uid, changed, policy), code('SOURCE_REQUEST_CONFLICT'));
  assert.equal(db.writes, 1);
});

test('source creation is unavailable by default and requires a provisioned approved-policy fence', async () => {
  const db = database();
  await assert.rejects(api.confirmSearchSource(db, uid, request(), { enabled: false, retentionPolicyVersion: '' }), code('SOURCE_CREATION_UNAVAILABLE'));
  db.records.delete(`account_source_fences/${uid}`);
  await assert.rejects(api.confirmSearchSource(db, uid, request(), policy), code('SOURCE_CREATION_UNAVAILABLE'));
  db.records.set(`account_source_fences/${uid}`, { status: 'active', retentionPolicyVersion: 'unapproved' });
  await assert.rejects(api.confirmSearchSource(db, uid, request(), policy), code('SOURCE_CREATION_UNAVAILABLE'));
  assert.equal(db.writes, 0);
});

test('deactivation, deletion and unknown lifecycle block creation and replay before a source read', async () => {
  for (const status of ['deactivated', 'deletion_confirmed', 'unknown', undefined]) {
    const db = database();
    const first = await api.confirmSearchSource(db, uid, request(), policy);
    db.records.set(`users/${uid}/settings/accountLifecycle`, { status });
    await assert.rejects(api.confirmSearchSource(db, uid, request(), policy), code('SOURCE_ACCOUNT_UNAVAILABLE'));
    await assert.rejects(api.readSearchSource(db, uid, first.receipt.sourceId), code('SOURCE_ACCOUNT_UNAVAILABLE'));
    assert.equal(db.writes, 1);
  }
});

test('retained deletion fence prevents a cached-auth retry from reviving an erased users subtree', async () => {
  const db = database();
  await api.confirmSearchSource(db, uid, request(), policy);
  db.records.set(`account_source_fences/${uid}`, { status: 'deleted', retentionPolicyVersion: policy.retentionPolicyVersion });
  for (const key of db.records.keys()) if (key.startsWith(`users/${uid}/`)) db.records.delete(key);
  await assert.rejects(api.confirmSearchSource(db, uid, request(), policy), code('SOURCE_ACCOUNT_UNAVAILABLE'));
  assert.equal([...db.records.keys()].some(key => key.startsWith(`users/${uid}/`)), false);
});

test('exact reads are owner-scoped and tampered sealed content fails closed', async () => {
  const db = database();
  const { receipt } = await api.confirmSearchSource(db, uid, request(), policy);
  await assert.rejects(api.readSearchSource(db, 'synthetic-bob', receipt.sourceId), code('SOURCE_NOT_FOUND'));
  const stored = db.records.get(`users/${uid}/resume_versions/${receipt.sourceId}`);
  stored.content.summary = 'tampered';
  await assert.rejects(api.readSearchSource(db, uid, receipt.sourceId), code('SOURCE_INTEGRITY_FAILED'));
});

test('actual streamed reader bounds bytes without trusting content-length and rejects malformed JSON or UTF-8', async () => {
  assert.deepEqual(await api.readBoundedSourceBody(new Request('http://localhost', { method: 'POST', body: JSON.stringify(request()) })), request());
  for (const body of ['{', new Uint8Array([255]), 'x'.repeat(800001)]) {
    await assert.rejects(api.readBoundedSourceBody(new Request('http://localhost', { method: 'POST', body })), error => ['SOURCE_TOO_LARGE', 'INVALID_SEARCH_SOURCE'].includes(error.code));
  }
  const oversized = new Request('http://localhost', { method: 'POST', body: '{}', headers: { 'content-length': '800001' } });
  await assert.rejects(api.readBoundedSourceBody(oversized), code('SOURCE_TOO_LARGE'));
});
