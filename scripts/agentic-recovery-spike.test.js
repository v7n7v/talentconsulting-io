import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, validateEnvironment } from '../deploy/staging/recovery-spike/worker.mjs';

const baseConfig = {
  project: 'talent-consulting-stg', database: 'taco-agentic-spike', region: 'us-east1',
  queue: 'taco-agentic-spike', executor: 'taco-spike-executor@talent-consulting-stg.iam.gserviceaccount.com',
  baseUrl: 'https://taco-agentic-spike-1016393231808.us-east1.run.app',
};
const baseEnv = {
  SPIKE_PROJECT: baseConfig.project, SPIKE_DATABASE: baseConfig.database, SPIKE_REGION: baseConfig.region,
  SPIKE_QUEUE: baseConfig.queue, SPIKE_EXECUTOR_SA: baseConfig.executor, SPIKE_BASE_URL: baseConfig.baseUrl,
};

function fakeStore(clock = () => Date.now()) {
  const records = new Map();
  const locks = new Map();
  return {
    records,
    async transact(key, callback) {
      const prior = locks.get(key) || Promise.resolve();
      let release;
      const current = new Promise((resolve) => { release = resolve; });
      locks.set(key, prior.then(() => current));
      await prior;
      try {
        let draft = records.has(key) ? structuredClone(records.get(key)) : null;
        const result = await callback({ get: () => draft, set: (value) => { draft = structuredClone(value); } });
        if (draft !== null) records.set(key, draft);
        return result;
      } finally {
        release();
        if (locks.get(key) === current) locks.delete(key);
      }
    },
    async read(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
  };
}

function jsonResponse(status, payload = {}) {
  return { status, ok: status >= 200 && status < 300, async json() { return payload; } };
}

function cloudFetch() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).startsWith('http://metadata.google.internal/')) return jsonResponse(200, { access_token: 'test-token' });
    const body = JSON.parse(options.body || '{}');
    if (String(url).startsWith('https://cloudtasks.googleapis.com/')) return jsonResponse(200, { name: body.task?.name });
    if (String(url).startsWith('https://workflowexecutions.googleapis.com/')) return jsonResponse(200, { name: 'synthetic-execution' });
    throw new Error(`unexpected URL: ${url}`);
  };
  return { fetchImpl, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function makeHarness(options = {}) {
  const store = options.store || fakeStore();
  const cloud = options.cloud || cloudFetch();
  const worker = createWorker({
    store, config: baseConfig, fetchImpl: cloud.fetchImpl,
    wait: options.wait, now: options.now, id: options.id || (() => 'lease-owner-test'),
  });
  return { worker, store, cloud };
}

function delayTransaction(base, pauseAt, entered, gate) {
  let transactions = 0;
  return {
    async transact(key, callback) {
      transactions += 1;
      if (transactions === pauseAt) {
        entered.resolve();
        await gate.promise;
      }
      return base.transact(key, callback);
    },
    read: (key) => base.read(key),
  };
}

async function call(worker, method, path, body) { return worker.handle(method, path, body); }

test('startup is hard-gated to the synthetic project, named database, and spike service URL', () => {
  assert.deepEqual(validateEnvironment(baseEnv), baseConfig);
  assert.throws(() => validateEnvironment({ ...baseEnv, SPIKE_DATABASE: '(default)' }), /SPIKE_DATABASE/);
  assert.throws(() => validateEnvironment({ ...baseEnv, SPIKE_PROJECT: 'production-project' }), /SPIKE_PROJECT/);
  assert.throws(() => validateEnvironment({ ...baseEnv, SPIKE_BASE_URL: 'https://other-service-1.us-east1.run.app' }), /SPIKE_BASE_URL/);
});

test('strict seed input, same-step duplicate replay, and deterministic two-step outputs', async () => {
  const { worker } = makeHarness();
  assert.equal((await call(worker, 'POST', '/seed', { runId: 'candidate-1', runtime: 'tasks', version: 'v1', seed: 3 })).status, 400);
  const seeded = await call(worker, 'POST', '/seed', { runId: 'spike-case-1', runtime: 'tasks', version: 'v1', seed: 3 });
  assert.equal(seeded.status, 201);
  const first = await call(worker, 'POST', '/step', { runId: 'spike-case-1', version: 'v1', step: 'A', deliveryId: 'delivery-1' });
  assert.deepEqual({ status: first.status, disposition: first.body.disposition, output: first.body.output }, { status: 200, disposition: 'committed', output: 6 });
  const duplicate = await call(worker, 'POST', '/step', { runId: 'spike-case-1', version: 'v1', step: 'A', deliveryId: 'delivery-duplicate' });
  assert.equal(duplicate.body.disposition, 'replay');
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-case-1', version: 'v1', step: 'B' })).body.output, 7);
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-case-1', version: 'v1', step: 'A' })).body.disposition, 'replay');
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-case-1', version: 'v1', step: 'B' })).body.disposition, 'replay');
  assert.equal((await call(worker, 'POST', '/repair', { runId: 'spike-case-1' })).body.disposition, 'completed');
  const status = await call(worker, 'GET', '/status?runId=spike-case-1');
  assert.equal(status.body.run.status, 'completed');
  assert.equal(status.body.run.finalValue, 7);
  assert.equal(status.body.attempts.filter((attempt) => attempt.disposition === 'committed').length, 2);
  assert.equal('leaseOwner' in status.body.run.stepA, false);
});

test('v2 changes only the deterministic step A output and version mismatch is rejected', async () => {
  const { worker } = makeHarness();
  await call(worker, 'POST', '/seed', { runId: 'spike-version-v2', runtime: 'workflows', version: 'v2', seed: 3 });
  const mismatch = await call(worker, 'POST', '/step', { runId: 'spike-version-v2', version: 'v1', step: 'A' });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.disposition, 'version_mismatch');
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-version-v2', version: 'v2', step: 'A' })).body.output, 6);
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-version-v2', version: 'v2', step: 'B' })).body.output, 8);
  await call(worker, 'POST', '/seed', { runId: 'spike-v1-expected', runtime: 'workflows', version: 'v1', seed: 7 });
  await call(worker, 'POST', '/step', { runId: 'spike-v1-expected', version: 'v1', step: 'A' });
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-v1-expected', version: 'v1', step: 'B' })).body.output, 15);
  await call(worker, 'POST', '/seed', { runId: 'spike-v2-expected', runtime: 'workflows', version: 'v2', seed: 7 });
  await call(worker, 'POST', '/step', { runId: 'spike-v2-expected', version: 'v2', step: 'A' });
  assert.equal((await call(worker, 'POST', '/step', { runId: 'spike-v2-expected', version: 'v2', step: 'B' })).body.output, 16);
});

test('dispatch loss before start is repairable from the persisted intent; Tasks advance through A then B', async () => {
  const { worker, cloud } = makeHarness();
  await call(worker, 'POST', '/seed', { runId: 'spike-dispatch-repair', runtime: 'tasks', version: 'v1', seed: 4 });
  const lost = await call(worker, 'POST', '/dispatch', { runId: 'spike-dispatch-repair', fault: 'before_start' });
  assert.equal(lost.status, 503);
  assert.equal(cloud.calls.length, 0);
  const repaired = await call(worker, 'POST', '/repair', { runId: 'spike-dispatch-repair' });
  assert.equal(repaired.body.disposition, 'dispatched');
  assert.equal(cloud.calls.filter((entry) => String(entry.url).startsWith('https://cloudtasks.googleapis.com/')).length, 1);
  const first = await call(worker, 'POST', '/step', { runId: 'spike-dispatch-repair', version: 'v1', step: 'A' });
  assert.equal(first.body.disposition, 'committed');
  assert.equal(cloud.calls.filter((entry) => String(entry.url).startsWith('https://cloudtasks.googleapis.com/')).length, 2);
  await call(worker, 'POST', '/step', { runId: 'spike-dispatch-repair', version: 'v1', step: 'B' });
  assert.equal((await call(worker, 'GET', '/status?runId=spike-dispatch-repair')).body.run.status, 'completed');
});

test('ambiguous workflow start is repaired as a duplicate execution with the same run identity', async () => {
  const { worker, cloud } = makeHarness();
  await call(worker, 'POST', '/seed', { runId: 'spike-workflow-ambiguous', runtime: 'workflows', version: 'v1', seed: 2 });
  const lostAck = await call(worker, 'POST', '/dispatch', { runId: 'spike-workflow-ambiguous', fault: 'after_start' });
  assert.equal(lostAck.status, 503);
  const repaired = await call(worker, 'POST', '/repair', { runId: 'spike-workflow-ambiguous' });
  assert.equal(repaired.body.disposition, 'dispatched');
  const starts = cloud.calls.filter((entry) => String(entry.url).startsWith('https://workflowexecutions.googleapis.com/'));
  assert.equal(starts.length, 2);
  assert.equal(JSON.parse(starts[0].options.body).argument, JSON.parse(starts[1].options.body).argument);
});

test('lease takeover fences out a late first completion and preserves the winner output', async () => {
  const gate = deferred();
  const enteredDelay = deferred();
  const { worker } = makeHarness({ wait: async () => { enteredDelay.resolve(); await gate.promise; } });
  await call(worker, 'POST', '/seed', { runId: 'spike-lease-takeover', runtime: 'workflows', version: 'v1', seed: 5, firstDelayMs: 500, leaseMs: 100 });
  const staleFirst = call(worker, 'POST', '/step', { runId: 'spike-lease-takeover', version: 'v1', step: 'A', deliveryId: 'slow-first' });
  await enteredDelay.promise;
  assert.equal((await call(worker, 'POST', '/control', { runId: 'spike-lease-takeover', action: 'expire_lease' })).body.disposition, 'lease_expired');
  const takeover = await call(worker, 'POST', '/step', { runId: 'spike-lease-takeover', version: 'v1', step: 'A', deliveryId: 'takeover' });
  assert.equal(takeover.body.disposition, 'committed');
  gate.resolve();
  assert.equal((await staleFirst).body.disposition, 'stale_completion');
  const status = await call(worker, 'GET', '/status?runId=spike-lease-takeover');
  assert.equal(status.body.run.stepA.output, 10);
  assert.equal(status.body.attempts.find((attempt) => attempt.deliveryId === 'slow-first').disposition, 'stale_completion');
});

test('expired lease returns retryable stale status, then a retry reclaims and completes the step', async () => {
  const { worker } = makeHarness();
  await call(worker, 'POST', '/seed', { runId: 'spike-expired-retry', runtime: 'tasks', version: 'v1', seed: 7, firstDelayMs: 120, leaseMs: 50 });
  const expired = await call(worker, 'POST', '/step', { runId: 'spike-expired-retry', version: 'v1', step: 'A', deliveryId: 'expired-first' });
  assert.equal(expired.status, 409);
  assert.equal(expired.body.disposition, 'stale_completion');
  assert.equal(expired.body.retryable, true);
  const retry = await call(worker, 'POST', '/step', { runId: 'spike-expired-retry', version: 'v1', step: 'A', deliveryId: 'task-retry' });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.disposition, 'committed');
  const status = await call(worker, 'GET', '/status?runId=spike-expired-retry');
  assert.equal(status.body.run.stepA.output, 14);
  assert.equal(status.body.attempts[0].disposition, 'stale_completion');
  assert.equal(status.body.attempts[1].disposition, 'committed');
});

test('claim lease clock is read inside the transaction after a delayed callback begins', async () => {
  let clock = 1_000;
  const base = fakeStore();
  const entered = deferred();
  const gate = deferred();
  const store = delayTransaction(base, 2, entered, gate);
  const { worker } = makeHarness({ store, now: () => clock, wait: async () => {} });
  await call(worker, 'POST', '/seed', { runId: 'spike-delayed-claim-clock', runtime: 'workflows', version: 'v1', seed: 6, leaseMs: 100 });
  const inFlight = call(worker, 'POST', '/step', { runId: 'spike-delayed-claim-clock', version: 'v1', step: 'A' });
  await entered.promise;
  clock = 2_000;
  gate.resolve();
  assert.equal((await inFlight).body.disposition, 'committed');
});

test('completion clock is read inside the transaction and rejects a lease expired during transaction wait', async () => {
  let clock = 1_000;
  const base = fakeStore();
  const entered = deferred();
  const gate = deferred();
  const store = delayTransaction(base, 3, entered, gate);
  const { worker } = makeHarness({ store, now: () => clock, wait: async () => {} });
  await call(worker, 'POST', '/seed', { runId: 'spike-delayed-finish-clock', runtime: 'workflows', version: 'v1', seed: 6, leaseMs: 100 });
  const inFlight = call(worker, 'POST', '/step', { runId: 'spike-delayed-finish-clock', version: 'v1', step: 'A' });
  await entered.promise;
  clock = 1_200;
  gate.resolve();
  const result = await inFlight;
  assert.equal(result.status, 409);
  assert.equal(result.body.disposition, 'stale_completion');
  assert.equal(result.body.retryable, true);
});

test('cancellation and input changes reject in-flight completion without writing stale output', async () => {
  const enteredDelay = deferred();
  const release = deferred();
  const { worker } = makeHarness({ wait: async () => { enteredDelay.resolve(); await release.promise; } });
  await call(worker, 'POST', '/seed', { runId: 'spike-cancel-flight', runtime: 'workflows', version: 'v1', seed: 8, firstDelayMs: 500 });
  const inFlight = call(worker, 'POST', '/step', { runId: 'spike-cancel-flight', version: 'v1', step: 'A' });
  await enteredDelay.promise;
  await call(worker, 'POST', '/control', { runId: 'spike-cancel-flight', action: 'cancel' });
  release.resolve();
  assert.equal((await inFlight).body.disposition, 'stale_completion');
  assert.equal((await inFlight).body.status, 'cancelled');
  const cancelled = await call(worker, 'GET', '/status?runId=spike-cancel-flight');
  assert.equal(cancelled.body.run.stepA.state, 'cancelled');
  assert.equal(cancelled.body.run.stepA.output, undefined);

  const enteredChange = deferred();
  const releaseChange = deferred();
  const second = makeHarness({ wait: async () => { enteredChange.resolve(); await releaseChange.promise; } });
  await call(second.worker, 'POST', '/seed', { runId: 'spike-input-change', runtime: 'workflows', version: 'v1', seed: 8, firstDelayMs: 500 });
  const changing = call(second.worker, 'POST', '/step', { runId: 'spike-input-change', version: 'v1', step: 'A' });
  await enteredChange.promise;
  await call(second.worker, 'POST', '/control', { runId: 'spike-input-change', action: 'change_input' });
  releaseChange.resolve();
  assert.equal((await changing).body.disposition, 'stale_completion');
  const changed = await call(second.worker, 'GET', '/status?runId=spike-input-change');
  assert.equal(changed.body.run.inputRevision, 2);
  assert.equal(changed.body.run.status, 'invalidated');
  assert.equal(changed.body.run.stepA.output, undefined);
  assert.equal((await call(second.worker, 'POST', '/step', { runId: 'spike-input-change', version: 'v1', step: 'A' })).body.disposition, 'invalidated');
});
