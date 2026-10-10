'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-preparation-issuer-'));
const modulesPromise = (async () => {
  await build({
    entryPoints: [path.join(root, 'lib/assistant/runtime/preparation-issuer.ts')],
    outfile: path.join(bundleDir, 'issuer.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    alias: { '@': root },
    logLevel: 'silent',
  });
  return require(path.join(bundleDir, 'issuer.cjs'));
})();

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));

const UID = 'candidate-001';
const SOURCE_ID = 'resume-confirmed-1';
const RESUME = { name: 'Amina Rivera', summary: 'Customer research and product design.' };
const sourceBinding = (id = SOURCE_ID, hash = crypto.createHash('sha256').update(JSON.stringify(RESUME)).digest('hex')) => ({
  collection: 'resume_versions', id, hash, hashEncoding: 'sha256-json-stringify-v1',
});
const requestFor = (overrides = {}) => ({
  requestId: 'request-001',
  resumeVersionId: SOURCE_ID,
  operation: 'prepare_packet',
  posting: {
    title: 'Product Designer',
    company: 'Acme Studio',
    text: 'Use customer research to improve onboarding experiences.',
    url: 'https://jobs.example.invalid/product-designer',
  },
  ...overrides,
});
const accessFor = (overrides = {}) => ({
  userId: UID,
  tier: 'studio',
  authorityEpoch: 4,
  deletionEpoch: 2,
  revoked: false,
  deleted: false,
  restoreState: 'ready',
  policyVersion: 'preparation-p1-v1',
  ...overrides,
});
const config = {
  policyVersion: 'preparation-p1-v1',
  maxLifetimeMs: 15 * 60_000,
  budget: { maxProviderAttempts: 4, maxCostMicros: 1_000_000 },
};

class MemoryIssuerStore {
  constructor({ access = accessFor(), source = { binding: sourceBinding(), verificationKind: 'explicit_user_source' } } = {}) {
    this.access = access;
    this.source = source;
    this.commands = new Map();
    this.creates = [];
    this.tail = Promise.resolve();
    this.transactionCalls = 0;
  }

  makeTransaction(uid, requestId) {
    const key = `${uid}:${requestId}`;
    let pendingCommand = null;
    return {
      transaction: {
        readCurrentAccess: async () => this.access,
        readConfirmedSource: async resumeVersionId => this.source?.binding.id === resumeVersionId ? this.source : null,
        readCommand: async () => this.commands.get(key) || null,
        createCommand: command => { pendingCommand = command; },
      },
      commit: () => {
        if (pendingCommand) {
          this.commands.set(key, pendingCommand);
          this.creates.push(pendingCommand);
        }
      },
    };
  }

  async runTransaction(uid, requestId, callback) {
    const run = this.tail.then(async () => {
      this.transactionCalls += 1;
      const attempt = this.makeTransaction(uid, requestId);
      const result = await callback(attempt.transaction);
      attempt.commit();
      return result;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}

test('concurrent identical requests serialize to one deterministic command and replay', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  const inputs = [1, 2, 3].map(() => issuePreparationCommand({
    uid: UID, body: requestFor(), store, config, now: () => 1_000,
  }));
  const results = await Promise.all(inputs);

  assert.deepEqual(results.map(result => result.status), ['accepted', 'accepted', 'accepted']);
  assert.equal(results.filter(result => result.status === 'accepted' && result.replayed === false).length, 1);
  assert.equal(results.filter(result => result.status === 'accepted' && result.replayed === true).length, 2);
  assert.equal(store.creates.length, 1);
  const command = results[0].command;
  assert.equal(command.commandId, crypto.createHash('sha256').update(JSON.stringify(['preparation-command-v1', UID, 'request-001'])).digest('hex'));
  assert.deepEqual(command.budget, config.budget);
  assert.deepEqual(command.posting, {
    hash: crypto.createHash('sha256').update(requestFor().posting.text, 'utf8').digest('hex'),
    hashEncoding: 'sha256-utf8-exact-v1',
  });
  assert.equal(JSON.stringify(command).includes(requestFor().posting.text), false, 'stored command has no posting body');
  assert.equal(JSON.stringify(command).includes(RESUME.name), false, 'stored command has no resume body');
});

test('same request ID conflicts when source or posting changes without creating another command', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  const issue = (body, now = 1_000) => issuePreparationCommand({ uid: UID, body, store, config, now: () => now });
  assert.equal((await issue(requestFor())).status, 'accepted');
  assert.deepEqual(await issue(requestFor({ posting: { ...requestFor().posting, title: 'Lead Designer' } })), {
    status: 'rejected', code: 'command_conflict',
  });

  store.source = { ...store.source, binding: sourceBinding(SOURCE_ID, 'a'.repeat(64)) };
  assert.deepEqual(await issue(requestFor()), { status: 'rejected', code: 'command_conflict' });
  assert.equal(store.creates.length, 1);
});

test('client-supplied authority fields and a foreign source ID cannot mint a command', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  const forgedBody = {
    ...requestFor(),
    userId: 'another-user',
    tier: 'god',
    authorityEpoch: 99,
    deletionEpoch: 99,
    budget: { maxProviderAttempts: 999, maxCostMicros: 999_999_999 },
    commandId: 'forged-command',
    source: sourceBinding(),
    requestFingerprint: 'b'.repeat(64),
    userConfirmed: true,
  };
  assert.deepEqual(await issuePreparationCommand({ uid: UID, body: forgedBody, store, config, now: () => 1_000 }), {
    status: 'rejected', code: 'invalid_request',
  });
  assert.deepEqual(await issuePreparationCommand({
    uid: UID, body: requestFor({ resumeVersionId: 'another-users-resume' }), store, config, now: () => 1_000,
  }), { status: 'rejected', code: 'source_unavailable' });
  assert.equal(store.creates.length, 0);
});

test('only an explicit confirmed source is issuable; missing, legacy, and unverified sources fail closed', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  for (const [label, source, code] of [
    ['missing', null, 'source_unavailable'],
    ['legacy', { binding: sourceBinding(), verificationKind: 'legacy_user_approved' }, 'source_unconfirmed'],
    ['unverified', { binding: sourceBinding(), verificationKind: 'unverified' }, 'source_unconfirmed'],
  ]) {
    const store = new MemoryIssuerStore({ source });
    assert.deepEqual(await issuePreparationCommand({ uid: UID, body: requestFor(), store, config, now: () => 1_000 }), {
      status: 'rejected', code,
    }, label);
    assert.equal(store.creates.length, 0, label);
  }
});

test('foreign access and revocation between issuance and replay deny without a second write', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const foreign = new MemoryIssuerStore({ access: accessFor({ userId: 'another-user' }) });
  assert.deepEqual(await issuePreparationCommand({ uid: UID, body: requestFor(), store: foreign, config, now: () => 1_000 }), {
    status: 'rejected', code: 'owner_mismatch',
  });
  assert.equal(foreign.creates.length, 0);

  const store = new MemoryIssuerStore();
  const issue = () => issuePreparationCommand({ uid: UID, body: requestFor(), store, config, now: () => 1_000 });
  assert.equal((await issue()).status, 'accepted');
  store.access = accessFor({ revoked: true, authorityEpoch: 5 });
  assert.deepEqual(await issue(), { status: 'rejected', code: 'revoked' });
  assert.equal(store.creates.length, 1);
});

test('expired replay keeps its original deadline and does not renew the command', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  const issue = now => issuePreparationCommand({ uid: UID, body: requestFor(), store, config: { ...config, maxLifetimeMs: 100 }, now: () => now });
  const first = await issue(1_000);
  assert.equal(first.status, 'accepted');
  assert.equal(first.command.expiresAtMs, 1_100);
  assert.deepEqual(await issue(1_100), { status: 'rejected', code: 'expired' });
  assert.equal(store.commands.get(`${UID}:request-001`).expiresAtMs, 1_100);
  assert.equal(store.creates.length, 1);
});

test('replay expiry is checked after a delayed command read completes', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  let clock = 1_000;
  const issue = () => issuePreparationCommand({
    uid: UID,
    body: requestFor(),
    store,
    config: { ...config, maxLifetimeMs: 100 },
    now: () => clock,
  });
  const first = await issue();
  assert.equal(first.status, 'accepted');
  assert.equal(first.command.expiresAtMs, 1_100);

  const originalRunTransaction = store.runTransaction.bind(store);
  store.runTransaction = (uid, requestId, callback) => originalRunTransaction(uid, requestId, transaction => callback({
    ...transaction,
    readCommand: async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      clock = 1_100;
      return transaction.readCommand();
    },
  }));

  assert.deepEqual(await issue(), { status: 'rejected', code: 'expired' });
  assert.equal(store.commands.get(`${UID}:request-001`).expiresAtMs, 1_100);
  assert.equal(store.creates.length, 1);
});

test('time is read again inside each transaction retry', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  const originalRunTransaction = store.runTransaction.bind(store);
  store.runTransaction = async (uid, requestId, callback) => {
    store.transactionCalls += 1;
    const abandonedAttempt = store.makeTransaction(uid, requestId);
    await callback(abandonedAttempt.transaction);
    const committedAttempt = store.makeTransaction(uid, requestId);
    const result = await callback(committedAttempt.transaction);
    committedAttempt.commit();
    return result;
  };
  const times = [2_000, 3_000];
  const result = await issuePreparationCommand({
    uid: UID, body: requestFor(), store, config, now: () => times.shift(),
  });
  store.runTransaction = originalRunTransaction;
  assert.equal(result.status, 'accepted');
  assert.equal(result.command.issuedAtMs, 3_000);
  assert.equal(result.command.expiresAtMs, 3_000 + config.maxLifetimeMs);
  assert.equal(store.creates.length, 1);
});

test('invalid config, invalid time, and non-issuable entitlement never write commands', async () => {
  const { issuePreparationCommand } = await modulesPromise;
  const store = new MemoryIssuerStore();
  assert.deepEqual(await issuePreparationCommand({ uid: UID, body: requestFor(), store, config: { ...config, maxLifetimeMs: 0 }, now: () => 1_000 }), {
    status: 'rejected', code: 'invalid_config',
  });
  assert.deepEqual(await issuePreparationCommand({ uid: UID, body: requestFor(), store, config, now: () => Number.MAX_SAFE_INTEGER }), {
    status: 'rejected', code: 'invalid_time',
  });
  store.access = accessFor({ tier: 'pro' });
  assert.deepEqual(await issuePreparationCommand({ uid: UID, body: requestFor(), store, config, now: () => 1_000 }), {
    status: 'rejected', code: 'entitlement_required',
  });
  assert.equal(store.creates.length, 0);
});
