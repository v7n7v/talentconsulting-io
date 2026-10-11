const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-job-catalog-test-'));
const bundlePath = path.join(tempDir, 'job-catalog.cjs');
const storeBundlePath = path.join(tempDir, 'job-catalog-store.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib/job-catalog-ingestion.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'silent',
  external: ['firebase-admin/*'],
});
buildSync({
  entryPoints: [path.join(repoRoot, 'lib/job-catalog-store.ts')],
  outfile: storeBundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'silent',
});
const { runJobCatalogIngestion } = require(bundlePath);
const { createFirestoreCatalogStore } = require(storeBundlePath);

const ENV_KEYS = [
  'JOB_CATALOG_ENABLED', 'JOB_CATALOG_ORIGINS', 'JOB_INGEST_MAX_ITEMS', 'JOB_INGEST_MAX_REQUESTS',
  'JOB_INGEST_DAILY_MAX_REQUESTS', 'JOB_INGEST_DAILY_MAX_RECORDS', 'JOB_INGEST_INTERVAL_SECONDS',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
before(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});
after(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const validJob = (id = 'g-1', extra = {}) => ({
  provider: 'brightdata', providerJobId: id, origin: 'greenhouse', sourceJobId: id,
  title: 'Senior Engineer', company: 'Example', url: 'https://boards.greenhouse.io/example/jobs/1',
  description: 'Build things', locations: ['Remote'], remoteMode: 'remote',
  salary: { min: null, max: null, currency: '', interval: 'unknown' }, employmentType: 'Full-time',
  observedAt: '2026-10-08T12:00:00.000Z', inferredFields: [], ...extra,
});

function enabledEnv(overrides = {}) {
  process.env.JOB_CATALOG_ENABLED = 'true';
  process.env.JOB_CATALOG_ORIGINS = 'greenhouse';
  process.env.JOB_INGEST_MAX_ITEMS = '10';
  process.env.JOB_INGEST_MAX_REQUESTS = '4';
  process.env.JOB_INGEST_DAILY_MAX_REQUESTS = '20';
  process.env.JOB_INGEST_DAILY_MAX_RECORDS = '100';
  process.env.JOB_INGEST_INTERVAL_SECONDS = '3600';
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

function fakeStore(overrides = {}) {
  const calls = [];
  const state = {
    owner: 'owner', leaseUntil: Date.now() + 1_000_000, cursor: null, runId: 'run',
    day: new Date().toISOString().slice(0, 10), reservedRequests: 0, reservedRecords: 0,
    retryAt: 0, lastCompletedAt: 0, triggerPending: false,
  };
  const store = {
    async acquire(provider, owner, now) { calls.push(['acquire', provider, owner, now]); return overrides.acquire ? overrides.acquire({ state, calls, provider, owner, now }) : { ...state, owner }; },
    async reserve(provider, owner, now, requests, records, requestCap, recordCap, trigger) {
      calls.push(['reserve', provider, owner, now, requests, records, requestCap, recordCap, trigger]);
      if (overrides.reserve) return overrides.reserve({ state, calls, provider, owner, now, requests, records, requestCap, recordCap, trigger });
      state.reservedRequests += requests; state.reservedRecords += records;
      if (trigger) state.triggerPending = true;
      return true;
    },
    async commit(provider, owner, now, jobs, closedIds, cursor, complete) {
      calls.push(['commit', provider, owner, now, jobs, closedIds, cursor, complete]);
      if (overrides.commit) return overrides.commit({ state, calls, provider, owner, now, jobs, closedIds, cursor, complete });
      state.cursor = cursor; state.triggerPending = false;
      if (complete) state.lastCompletedAt = now;
    },
    async release(provider, owner, now, retryAt, receipt) { calls.push(['release', provider, owner, now, retryAt, receipt]); if (overrides.release) return overrides.release({ state, calls, provider, owner, now, retryAt, receipt }); },
    async eligible(provider, now, limit) { calls.push(['eligible', provider, now, limit]); return overrides.eligible ? overrides.eligible({ state, calls, provider, now, limit }) : []; },
  };
  return { store, state, calls };
}

function adapter(nextPage, requestsPerPage = 1) {
  return { id: 'brightdata', configured: true, requestsPerPage, nextPage };
}

test('disabled catalog returns before touching database, provider, or fetch', async () => {
  delete process.env.JOB_CATALOG_ENABLED;
  let touched = false;
  const result = await runJobCatalogIngestion({
    provider: 'brightdata', db: { get: () => { touched = true; } },
    store: new Proxy({}, { get() { touched = true; throw new Error('store touched'); } }),
    adapter: { ...adapter(async () => { touched = true; throw new Error('adapter touched'); }), configured: true },
    fetchImpl: async () => { touched = true; throw new Error('fetch touched'); },
  });
  assert.equal(result.status, 'disabled');
  assert.equal(result.enabled, false);
  assert.equal(touched, false);
});

test('a denied daily reservation happens before the provider is invoked', async () => {
  enabledEnv();
  const { store, calls } = fakeStore({ reserve: async () => false });
  let providerCalls = 0;
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => { calls.push(['provider']); providerCalls++; throw new Error('unexpected'); }) });
  assert.equal(result.status, 'budget');
  assert.equal(providerCalls, 0);
  assert.equal(calls.findIndex(call => call[0] === 'provider'), -1);
  assert.ok(calls.findIndex(call => call[0] === 'reserve') >= 0);
  assert.equal(calls.some(call => call[0] === 'release'), true);
});

test('pending async cursor is committed and resumed without triggering a new remote run', async () => {
  enabledEnv();
  const { store, state, calls } = fakeStore();
  let invocation = 0;
  const observed = [];
  const providerAdapter = adapter(async request => {
    calls.push(['provider']);
    observed.push({ cursor: request.cursor, knownIds: request.knownIds });
    invocation++;
    return invocation === 1
      ? { jobs: [], closedIds: [], nextCursor: 'opaque-run-cursor', complete: false, pending: true, rejectedRows: 0, status: 'success' }
      : { jobs: [validJob()], closedIds: [], nextCursor: null, complete: true, rejectedRows: 0, status: 'success' };
  });
  const first = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(first.status, 'pending');
  assert.equal(state.cursor, 'opaque-run-cursor');
  assert.equal(state.triggerPending, false);
  const second = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(second.status, 'success');
  assert.equal(observed[0].cursor, null);
  assert.equal(observed[1].cursor, 'opaque-run-cursor');
  assert.equal(calls.filter(call => call[0] === 'reserve')[0][8], true);
  assert.equal(calls.filter(call => call[0] === 'reserve')[1][8], false);
  assert.equal(calls.filter(call => call[0] === 'reserve')[0][5], 10);
  assert.equal(calls.filter(call => call[0] === 'reserve')[1][5], 0);
  assert.equal(calls.filter(call => call[0] === 'reserve')[0][4], 1);
  assert.equal(calls.filter(call => call[0] === 'reserve')[1][4], 1);
  assert.ok(calls.findIndex(call => call[0] === 'reserve') < calls.findIndex(call => call[0] === 'provider'));
  const receipts = calls.filter(call => call[0] === 'release').map(call => call[5]);
  assert.deepEqual(receipts.map(({ status, records, closed, requests, complete }) => ({ status, records, closed, requests, complete })), [
    { status: 'pending', records: 0, closed: 0, requests: 1, complete: false },
    { status: 'success', records: 1, closed: 0, requests: 1, complete: true },
  ]);
});

test('failed commit does not advance the resumable cursor', async () => {
  enabledEnv();
  const { store, state } = fakeStore({ commit: async () => { throw new Error('injected write failure'); } });
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => ({
    jobs: [], closedIds: [], nextCursor: 'must-not-commit', complete: false, pending: true, rejectedRows: 0, status: 'success',
  })) });
  assert.equal(result.status, 'unavailable');
  assert.equal(state.cursor, null);
});

test('provider 429 gets a bounded rate-limited retry outcome', async () => {
  enabledEnv();
  const { store } = fakeStore();
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => { const error = new Error('private details'); error.status = 429; throw error; }) });
  assert.equal(result.status, 'rate_limited');
  assert.ok(result.retryAfterSeconds >= 899 && result.retryAfterSeconds <= 900);
  assert.equal(JSON.stringify(result).includes('private details'), false);
});

test('only explicit closure IDs already known from the catalog or accepted feed rows are committed', async () => {
  enabledEnv();
  const { store, calls } = fakeStore({ eligible: async () => [validJob('known')] });
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => ({
    jobs: [validJob('new')], closedIds: ['known', 'new', 'never-seen'], nextCursor: null, complete: true, rejectedRows: 0, status: 'success',
  })) });
  assert.equal(result.closed, 2);
  assert.deepEqual(calls.find(call => call[0] === 'commit')[5], ['known', 'new']);
});

test('malformed and origin-restricted rows are rejected instead of persisted', async () => {
  enabledEnv();
  const { store, calls } = fakeStore();
  const malformed = validJob('bad-description', { description: 'x'.repeat(100_001) });
  const restricted = validJob('restricted', { url: 'https://evil.example/jobs/1', origin: 'greenhouse' });
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => ({
    jobs: [malformed, restricted], closedIds: [], nextCursor: null, complete: true, rejectedRows: 0, status: 'success',
  })) });
  assert.equal(result.status, 'malformed');
  assert.equal(result.records, 0);
  assert.equal(result.rejectedRows, 2);
  assert.equal(calls.some(call => call[0] === 'commit'), false);
});

test('partial candidate collection does not infer closure from missing rows', async () => {
  enabledEnv({ JOB_INGEST_MAX_REQUESTS: '1' });
  const { store, calls } = fakeStore({ eligible: async () => [validJob('existing')] });
  const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => ({
    jobs: [validJob('one-candidate')], closedIds: [], nextCursor: 'page-2', complete: false, rejectedRows: 0, status: 'success',
  })) });
  assert.equal(result.status, 'partial');
  assert.equal(result.closed, 0);
  assert.deepEqual(calls.find(call => call[0] === 'commit')[5], []);
  assert.equal(result.complete, false);
});

test('queued expired-feed closure IDs resume across runs and are applied as each remains eligible', async () => {
  enabledEnv({ JOB_INGEST_MAX_REQUESTS: '2' });
  const open = new Map([['closed-1', validJob('closed-1')], ['closed-2', validJob('closed-2')]]);
  const { store, state, calls } = fakeStore({
    eligible: async () => [...open.values()],
    commit: async ({ state: current, calls: trace, provider, owner, now, jobs, closedIds, cursor, complete }) => {
      trace.push(['commit', provider, owner, now, jobs, closedIds, cursor, complete]);
      for (const id of closedIds) open.delete(id);
      current.cursor = cursor; current.triggerPending = false;
      if (complete) current.lastCompletedAt = now;
    },
  });
  let page = 0;
  const providerAdapter = adapter(async request => {
    calls.push(['provider', request.cursor]);
    page++;
    if (page === 1) return { jobs: [], closedIds: [], nextCursor: 'expired-scan', complete: false, rejectedRows: 0, status: 'success' };
    if (page === 2) return { jobs: [], closedIds: ['closed-1'], nextCursor: 'expired-scan:queued-closed-2', complete: false, rejectedRows: 0, status: 'success' };
    return { jobs: [], closedIds: ['closed-2'], nextCursor: null, complete: true, rejectedRows: 0, status: 'success' };
  });

  const first = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(first.status, 'partial');
  assert.equal(first.closed, 1);
  assert.equal(state.cursor, 'expired-scan:queued-closed-2');
  assert.deepEqual([...open.keys()], ['closed-2']);

  await new Promise(resolve => setTimeout(resolve, 1_000));
  const second = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(second.status, 'success');
  assert.equal(second.closed, 1);
  assert.equal(second.complete, true);
  assert.equal(state.cursor, null);
  assert.deepEqual([...open.keys()], []);
  assert.equal(calls.some(call => call[0] === 'provider' && call[1] === 'expired-scan:queued-closed-2'), true);
});

test('busy or lost lease stops work before provider fetch', async t => {
  await t.test('busy acquisition', async () => {
    enabledEnv();
    const { store, calls } = fakeStore({ acquire: async () => null });
    let providerCalls = 0;
    const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => { providerCalls++; throw new Error('unexpected'); }) });
    assert.equal(result.status, 'busy');
    assert.equal(providerCalls, 0);
    assert.equal(calls.some(call => call[0] === 'reserve'), false);
  });
  await t.test('fenced reservation rejects lost lease', async () => {
    enabledEnv();
    const { store } = fakeStore({ reserve: async () => { throw new Error('catalog_lease_lost'); } });
    let providerCalls = 0;
    const result = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: adapter(async () => { providerCalls++; throw new Error('unexpected'); }) });
    assert.equal(result.status, 'unavailable');
    assert.equal(providerCalls, 0);
  });
});

test('ambiguous initial remote start is durably marked pending and never retriggered', async () => {
  enabledEnv();
  const { store, state, calls } = fakeStore();
  let providerCalls = 0;
  const providerAdapter = adapter(async () => { providerCalls++; throw new Error('ambiguous network result'); });
  const first = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(first.status, 'unavailable');
  assert.equal(state.triggerPending, true);
  const second = await runJobCatalogIngestion({ provider: 'brightdata', store, adapter: providerAdapter });
  assert.equal(second.status, 'unavailable');
  assert.equal(second.retryAfterSeconds, 3600);
  assert.equal(providerCalls, 1);
  assert.equal(calls.filter(call => call[0] === 'reserve').length, 1);
});

// A tiny transactional Firestore fake applies writes only if the entire callback resolves.
class FakeFirestore {
  constructor() { this.data = new Map(); this.transactions = 0; this.failAt = 0; this.writeCounts = []; }
  collection(name) { return new FakeCollection(this, name); }
  async runTransaction(callback) {
    this.transactions++;
    const writes = [];
    const tx = {
      get: async ref => new FakeSnapshot(ref, this.data.get(ref.path)),
      getAll: async (...refs) => refs.map(ref => new FakeSnapshot(ref, this.data.get(ref.path))),
      set: (ref, value, options = {}) => writes.push({ op: 'set', ref, value, merge: options.merge === true }),
      update: (ref, value) => writes.push({ op: 'update', ref, value }),
    };
    const result = await callback(tx);
    if (this.failAt === this.transactions) throw new Error('injected transaction commit failure');
    for (const write of writes) {
      const previous = this.data.get(write.ref.path);
      if (write.op === 'update' && !previous) throw new Error('document does not exist');
      const value = write.op === 'update' || write.merge ? { ...(previous || {}), ...write.value } : write.value;
      this.data.set(write.ref.path, structuredClone(value));
    }
    this.writeCounts.push(writes.length);
    return result;
  }
}
class FakeSnapshot {
  constructor(ref, value) { this.ref = ref; this.exists = value !== undefined; this._value = value; this.id = ref.id; }
  data() { return this._value === undefined ? undefined : structuredClone(this._value); }
}
class FakeDoc {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').at(-1); }
  collection(name) { return new FakeCollection(this.db, `${this.path}/${name}`); }
  async get() { return new FakeSnapshot(this, this.db.data.get(this.path)); }
}
class FakeCollection {
  constructor(db, path) { this.db = db; this.path = path; this.constraints = []; }
  doc(id) { return new FakeDoc(this.db, `${this.path}/${id}`); }
  where(field, operator, value) { this.constraints.push({ type: 'where', field, operator, value }); return this; }
  orderBy(field, direction) { this.constraints.push({ type: 'orderBy', field, direction }); return this; }
  limit(value) { this.constraints.push({ type: 'limit', value }); return this; }
  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.db.data.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .map(([key, value]) => new FakeSnapshot(new FakeDoc(this.db, key), value));
    for (const c of this.constraints) {
      if (c.type === 'where' && c.operator === '>') docs = docs.filter(doc => doc.data()[c.field] > c.value);
      if (c.type === 'orderBy') docs.sort((a, b) => c.direction === 'desc' ? b.data()[c.field] - a.data()[c.field] : a.data()[c.field] - b.data()[c.field]);
      if (c.type === 'limit') docs = docs.slice(0, c.value);
    }
    return { docs };
  }
}

test('Firestore store chunks commits at 20 rows and advances cursor only on final successful transaction', async () => {
  const db = new FakeFirestore();
  const store = createFirestoreCatalogStore(db);
  const now = Date.now();
  await store.acquire('brightdata', 'owner', now);
  db.failAt = db.transactions + 2;
  await assert.rejects(store.commit('brightdata', 'owner', now, Array.from({ length: 45 }, (_, i) => validJob(`id-${i}`)), [], 'next', false));
  const state = (await db.collection('job_catalog_state').doc('brightdata').get()).data();
  assert.equal(state.cursor, null);
  assert.equal([...db.data.keys()].filter(key => key.startsWith('job_catalog/brightdata/items/')).length, 20);
  db.failAt = 0;
  await store.commit('brightdata', 'owner', now, Array.from({ length: 45 }, (_, i) => validJob(`id-${i}`)), [], 'next', false);
  const resumed = (await db.collection('job_catalog_state').doc('brightdata').get()).data();
  assert.equal(resumed.cursor, 'next');
  assert.equal([...db.data.keys()].filter(key => key.startsWith('job_catalog/brightdata/items/')).length, 45);
  assert.deepEqual(db.writeCounts.slice(-3), [20, 20, 6]);
});

test('Firestore commits are fenced and replay-safe; closed tombstones cannot be resurrected', async () => {
  const db = new FakeFirestore();
  const store = createFirestoreCatalogStore(db);
  const now = Date.now();
  await store.acquire('brightdata', 'owner', now);
  const job = validJob('stable');
  await store.commit('brightdata', 'owner', now, [job], [], 'one', false);
  const itemRef = db.collection('job_catalog').doc('brightdata').collection('items').doc(require('node:crypto').createHash('sha256').update('brightdata|stable').digest('hex'));
  const first = (await itemRef.get()).data();
  await store.commit('brightdata', 'owner', now + 1, [job], [], 'two', false);
  const replay = (await itemRef.get()).data();
  assert.equal(replay.firstSeenAt, first.firstSeenAt);
  assert.equal(replay.job.providerJobId, 'stable');
  await store.commit('brightdata', 'owner', now + 2, [], ['stable'], 'three', false);
  await store.commit('brightdata', 'owner', now + 3, [job], [], 'four', false);
  const tombstone = (await itemRef.get()).data();
  assert.equal(tombstone.expiresAt, 0);
  assert.equal(tombstone.closedAt, now + 2);
  await store.commit('brightdata', 'owner', now + 4, [job], [], 'five', false);
  assert.equal((await itemRef.get()).data().expiresAt, 0);
  await db.runTransaction(async tx => { tx.update(db.collection('job_catalog_state').doc('brightdata'), { owner: 'other' }); });
  await assert.rejects(store.commit('brightdata', 'owner', now + 5, [validJob('should-not-write')], [], 'bad', false), /catalog_lease_lost/);
  assert.equal((await db.collection('job_catalog_state').doc('brightdata').get()).data().cursor, 'five');
  assert.equal((await store.eligible('brightdata', now + 5, 500)).some(row => row.providerJobId === 'stable'), false);
});

test('Firestore request reservations are fenced, charged before work, and leave counters unchanged when denied', async () => {
  const db = new FakeFirestore();
  const store = createFirestoreCatalogStore(db);
  const now = Date.now();
  await store.acquire('brightdata', 'owner', now);
  assert.equal(await store.reserve('brightdata', 'owner', now + 1, 1, 10, 0, 100, true), false);
  let state = (await db.collection('job_catalog_state').doc('brightdata').get()).data();
  assert.equal(state.reservedRequests, 0);
  assert.equal(state.reservedRecords, 0);
  assert.equal(state.triggerPending, false);
  assert.equal(await store.reserve('brightdata', 'owner', now + 2, 1, 10, 1, 10, true), true);
  state = (await db.collection('job_catalog_state').doc('brightdata').get()).data();
  assert.equal(state.reservedRequests, 1);
  assert.equal(state.reservedRecords, 10);
  assert.equal(state.triggerPending, true);
  assert.equal(await store.reserve('brightdata', 'owner', now + 3, 1, 1, 1, 100, false), false);
  state = (await db.collection('job_catalog_state').doc('brightdata').get()).data();
  assert.equal(state.reservedRequests, 1);
  await db.runTransaction(async tx => { tx.update(db.collection('job_catalog_state').doc('brightdata'), { owner: 'other' }); });
  await assert.rejects(store.reserve('brightdata', 'owner', now + 4, 1, 1, 20, 100, false), /catalog_lease_lost/);
});
