'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
const bundleDir = fs.mkdtempSync(path.join(root, 'tmp', '.agentic-preparation-contract-'));

const modulesPromise = (async () => {
  await build({
    entryPoints: {
      contract: path.join(root, 'lib/assistant/runtime/preparation-contract.ts'),
      policy: path.join(root, 'lib/assistant/runtime/preparation-policy.ts'),
    },
    outdir: bundleDir,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    alias: { '@': root },
    logLevel: 'silent',
  });
  return {
    ...require(path.join(bundleDir, 'contract.js')),
    ...require(path.join(bundleDir, 'policy.js')),
  };
})();

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));

const confirmedResume = {
  name: 'Amina Rivera',
  title: 'Product Designer',
  summary: 'Uses customer research to improve onboarding.',
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requestFor(overrides = {}) {
  return {
    requestId: 'request-001',
    resumeVersionId: 'resume-confirmed-1',
    operation: 'prepare_packet',
    posting: {
      title: 'Product Designer',
      company: 'Acme Studio',
      text: 'Use customer research to improve onboarding experiences.',
      url: 'https://jobs.example.invalid/product-designer',
    },
    ...overrides,
  };
}

function sourceFor(overrides = {}) {
  return {
    collection: 'resume_versions',
    id: 'resume-confirmed-1',
    hash: sha256(JSON.stringify(confirmedResume)),
    hashEncoding: 'sha256-json-stringify-v1',
    ...overrides,
  };
}

function commandFor(contract, overrides = {}) {
  const request = overrides.request || requestFor();
  const source = overrides.source || sourceFor();
  return {
    schemaVersion: 1,
    commandId: 'command-001',
    requestId: request.requestId,
    userId: 'candidate-001',
    operation: request.operation,
    requestFingerprint: contract.preparationFingerprint(request, source),
    source,
    posting: contract.bindPosting(request.posting.text),
    policyVersion: 'preparation-policy-v1',
    authorityEpoch: 4,
    deletionEpoch: 2,
    issuedAtMs: 1_000,
    expiresAtMs: 2_000,
    budget: { maxProviderAttempts: 2, maxCostMicros: 100 },
    ...overrides.command,
  };
}

function accessFor(overrides = {}) {
  return {
    userId: 'candidate-001',
    tier: 'studio',
    authorityEpoch: 4,
    deletionEpoch: 2,
    revoked: false,
    deleted: false,
    restoreState: 'ready',
    policyVersion: 'preparation-policy-v1',
    ...overrides,
  };
}

function evaluate(policy, contract, overrides = {}) {
  const request = overrides.request || requestFor();
  const source = Object.hasOwn(overrides, 'currentSource') ? overrides.currentSource : sourceFor();
  const command = Object.hasOwn(overrides, 'command') ? overrides.command : commandFor(contract);
  const access = Object.hasOwn(overrides, 'access') ? overrides.access : accessFor();
  return policy.evaluatePreparation({
    command,
    request,
    currentSource: source,
    access,
    action: overrides.action || 'read_source',
    nowMs: Object.hasOwn(overrides, 'nowMs') ? overrides.nowMs : 1_200,
    incurredCostMicros: 0,
    reservedCostMicros: 0,
    providerAttempts: 0,
    reservedProviderAttempts: 0,
    nextProviderReservationMicros: 10,
    ...overrides.counters,
  });
}

test('a server-issued scoped packet command permits source reads, analysis, drafting, and internal saves', async () => {
  const modules = await modulesPromise;
  const request = requestFor();
  const source = sourceFor();
  const command = commandFor(modules, { request, source });

  for (const action of ['read_source', 'analyze', 'draft_packet', 'save_internal']) {
    const result = evaluate(modules, modules, { request, currentSource: source, command, action });
    assert.deepEqual(result, { allowed: true }, `${action} is within the user's internal preparation scope`);
  }
});

test('an analysis-only command cannot draft a packet even when the user has packet entitlement', async () => {
  const modules = await modulesPromise;
  const request = requestFor({ operation: 'analyze_supplied_role' });
  const source = sourceFor();
  const command = commandFor(modules, { request, source });
  assert.deepEqual(evaluate(modules, modules, { request, currentSource: source, command, action: 'draft_packet' }),
    { allowed: false, reason: 'action_not_allowed' });
});

test('model-supplied confirmation cannot mint command authority or expand client request fields', async () => {
  const modules = await modulesPromise;
  const request = requestFor();
  const clientAuthority = {
    userConfirmed: true,
    confirmedBy: 'candidate-001',
    userId: 'candidate-001',
    tier: 'god',
    authorityEpoch: 4,
    deletionEpoch: 2,
    budget: { maxProviderAttempts: 999, maxCostMicros: 999_999 },
    requestFingerprint: 'a'.repeat(64),
    source: sourceFor(),
  };

  assert.equal(modules.PreparationRequestSchema.safeParse({ ...request, ...clientAuthority }).success, false);
  assert.equal(modules.PreparationCommandSchema.safeParse({ ...commandFor(modules), userConfirmed: true }).success, false);
  assert.deepEqual(evaluate(modules, modules, { request, command: null }), { allowed: false, reason: 'invalid_command' });
  assert.deepEqual(evaluate(modules, modules, { request, command: { userConfirmed: true } }), { allowed: false, reason: 'invalid_command' });
  assert.deepEqual(evaluate(modules, modules, {
    request: { ...request, userConfirmed: true },
    command: null,
  }), { allowed: false, reason: 'invalid_command' });
});

test('current authority, deletion, restore, time, and policy state fail closed with specific reasons', async () => {
  const modules = await modulesPromise;
  const cases = [
    ['foreign user', { access: accessFor({ userId: 'another-user' }) }, 'owner_mismatch'],
    ['not yet issued', { nowMs: 999 }, 'not_yet_valid'],
    ['expired', { nowMs: 2_000 }, 'expired'],
    ['revoked', { access: accessFor({ revoked: true }) }, 'revoked'],
    ['deleted', { access: accessFor({ deleted: true }) }, 'deleted'],
    ['restore quarantined', { access: accessFor({ restoreState: 'quarantined' }) }, 'restore_quarantined'],
    ['authority epoch changed', { access: accessFor({ authorityEpoch: 5 }) }, 'authority_changed'],
    ['deletion epoch changed', { access: accessFor({ deletionEpoch: 3 }) }, 'authority_changed'],
    ['policy version changed', { access: accessFor({ policyVersion: 'preparation-policy-v2' }) }, 'policy_changed'],
    ['missing source binding', { currentSource: null }, 'invalid_command'],
  ];
  const request = requestFor();
  const command = commandFor(modules);

  for (const [label, input, reason] of cases) {
    const result = evaluate(modules, modules, { request, command, ...input });
    assert.deepEqual(result, { allowed: false, reason }, label);
  }
});

test('malformed clock, current authority, and accounting inputs fail closed', async () => {
  const modules = await modulesPromise;
  const cases = [
    ['NaN clock', { nowMs: Number.NaN }, 'invalid_command'],
    ['negative clock', { nowMs: -1 }, 'invalid_command'],
    ['unsafe clock', { nowMs: Number.MAX_SAFE_INTEGER + 1 }, 'invalid_command'],
    ['missing clock', { nowMs: undefined }, 'invalid_command'],
    ['missing current access', { access: undefined }, 'invalid_command'],
    ['invalid current access epoch', { access: accessFor({ deletionEpoch: -1 }) }, 'invalid_command'],
    ['NaN incurred cost', { counters: { incurredCostMicros: Number.NaN } }, 'budget_exhausted'],
    ['negative reserved cost', { counters: { reservedCostMicros: -1 } }, 'budget_exhausted'],
    ['unsafe provider attempt count', { counters: { providerAttempts: Number.MAX_SAFE_INTEGER + 1 } }, 'budget_exhausted'],
    ['missing reservation count', { counters: { reservedProviderAttempts: undefined } }, 'budget_exhausted'],
    ['missing next reservation estimate', { counters: { nextProviderReservationMicros: undefined } }, 'budget_exhausted'],
  ];

  for (const [label, input, reason] of cases) {
    const result = evaluate(modules, modules, input);
    assert.deepEqual(result, { allowed: false, reason }, label);
  }
});

test('changed request identity, selected source, posting, or source binding cannot reuse the command scope', async () => {
  const modules = await modulesPromise;
  const baseRequest = requestFor();
  const baseSource = sourceFor();
  const command = commandFor(modules, { request: baseRequest, source: baseSource });
  const cases = [
    ['request id', { request: { ...baseRequest, requestId: 'request-002' } }],
    ['resume version', { request: { ...baseRequest, resumeVersionId: 'resume-confirmed-2' } }],
    ['posting text', { request: { ...baseRequest, posting: { ...baseRequest.posting, text: `${baseRequest.posting.text} Extra duty.` } } }],
    ['posting title', { request: { ...baseRequest, posting: { ...baseRequest.posting, title: 'Senior Product Designer' } } }],
    ['posting company', { request: { ...baseRequest, posting: { ...baseRequest.posting, company: 'Another Studio' } } }],
    ['posting URL', { request: { ...baseRequest, posting: { ...baseRequest.posting, url: 'https://jobs.example.invalid/other-role' } } }],
    ['source collection', { currentSource: sourceFor({ collection: 'vault' }) }],
    ['source id', { currentSource: sourceFor({ id: 'other-resume' }) }],
    ['source hash', { currentSource: sourceFor({ hash: 'b'.repeat(64) }) }],
  ];

  for (const [label, input] of cases) {
    assert.deepEqual(evaluate(modules, modules, { request: baseRequest, command, ...input }),
      { allowed: false, reason: 'scope_mismatch' }, label);
  }
});

test('the contract tags exact UTF-8 JD hashing separately from legacy normalized packet hashing', async () => {
  const modules = await modulesPromise;
  const exactText = '  Use customer research.\r\n';
  const posting = modules.bindPosting(exactText);
  const normalizedLegacyText = exactText.replace(/\r\n/g, '\n').trim();
  const legacyPacketHash = sha256(JSON.stringify(normalizedLegacyText));

  assert.deepEqual(posting, { hash: sha256(exactText), hashEncoding: 'sha256-utf8-exact-v1' });
  assert.notEqual(posting.hash, legacyPacketHash, 'different digest encodings cannot be compared as if they were equal');
  assert.equal(modules.PostingBindingSchema.safeParse({ hash: posting.hash, hashEncoding: 'sha256-json-stringify-normalized-text-v1' }).success, false);
  assert.equal(modules.SourceBindingSchema.safeParse({ ...sourceFor(), hashEncoding: 'sha256-utf8-exact-v1' }).success, false);
});

test('analysis and packet entitlements follow the current four-tier boundary', async () => {
  const modules = await modulesPromise;
  const rows = [
    ['free', 'analyze', 'entitlement_required'],
    ['pro', 'analyze', null],
    ['studio', 'analyze', null],
    ['god', 'analyze', null],
    ['free', 'draft_packet', 'entitlement_required'],
    ['pro', 'draft_packet', 'entitlement_required'],
    ['studio', 'draft_packet', null],
    ['god', 'draft_packet', null],
  ];

  for (const [tier, action, denial] of rows) {
    const operation = action === 'draft_packet' ? 'prepare_packet' : 'analyze_supplied_role';
    const request = requestFor({ operation });
    const source = sourceFor();
    const command = commandFor(modules, { request, source });
    const result = evaluate(modules, modules, { request, currentSource: source, command, action, access: accessFor({ tier }) });
    assert.deepEqual(result, denial ? { allowed: false, reason: denial } : { allowed: true }, `${tier} ${action}`);
  }
});

test('external actions are outside the internal preparation command', async () => {
  const modules = await modulesPromise;
  const result = evaluate(modules, modules, { action: 'submit_application' });
  assert.deepEqual(result, { allowed: false, reason: 'action_not_allowed' });
});

test('provider reservations account for concurrent cost and attempt holds before another call starts', async () => {
  const modules = await modulesPromise;
  const request = requestFor({ operation: 'analyze_supplied_role' });
  const source = sourceFor();
  const command = commandFor(modules, {
    request,
    source,
    command: { budget: { maxProviderAttempts: 2, maxCostMicros: 20 } },
  });
  const common = { request, currentSource: source, command, action: 'analyze' };

  assert.deepEqual(evaluate(modules, modules, { ...common, counters: { nextProviderReservationMicros: 10 } }), { allowed: true }, 'first reservation fits');
  assert.deepEqual(evaluate(modules, modules, {
    ...common,
    counters: { reservedCostMicros: 10, reservedProviderAttempts: 1, nextProviderReservationMicros: 10 },
  }), { allowed: true }, 'a second distinct reservation fits the remaining budget and attempt');
  assert.deepEqual(evaluate(modules, modules, {
    ...common,
    counters: { reservedCostMicros: 20, reservedProviderAttempts: 2, nextProviderReservationMicros: 1 },
  }), { allowed: false, reason: 'budget_exhausted' }, 'a concurrent third attempt cannot overbook either limit');
  assert.deepEqual(evaluate(modules, modules, {
    ...common,
    counters: { incurredCostMicros: 0, reservedCostMicros: 0, providerAttempts: 1, reservedProviderAttempts: 1, nextProviderReservationMicros: 1 },
  }), { allowed: false, reason: 'budget_exhausted' }, 'in-flight attempts count against the ceiling');
});

test('internal saves remain available after provider budget is fully spent', async () => {
  const modules = await modulesPromise;
  const request = requestFor({ operation: 'analyze_supplied_role' });
  const source = sourceFor();
  const command = commandFor(modules, {
    request,
    source,
    command: { budget: { maxProviderAttempts: 2, maxCostMicros: 100 } },
  });
  const spent = {
    incurredCostMicros: 100,
    reservedCostMicros: 0,
    providerAttempts: 2,
    reservedProviderAttempts: 0,
    nextProviderReservationMicros: 0,
  };

  assert.deepEqual(evaluate(modules, modules, { request, currentSource: source, command, action: 'save_internal', counters: spent }), { allowed: true });
  assert.deepEqual(evaluate(modules, modules, { request, currentSource: source, command, action: 'analyze', counters: { ...spent, nextProviderReservationMicros: 1 } }),
    { allowed: false, reason: 'budget_exhausted' });
});

test('reconciling the final held attempt permits its save but leaves no new provider claim', async () => {
  const modules = await modulesPromise;
  const request = requestFor({ operation: 'analyze_supplied_role' });
  const source = sourceFor();
  const command = commandFor(modules, {
    request,
    source,
    command: { budget: { maxProviderAttempts: 2, maxCostMicros: 20 } },
  });
  const common = { request, currentSource: source, command };
  const finalAttemptHeld = {
    incurredCostMicros: 10,
    reservedCostMicros: 10,
    providerAttempts: 1,
    reservedProviderAttempts: 1,
    nextProviderReservationMicros: 1,
  };

  assert.deepEqual(evaluate(modules, modules, { ...common, action: 'analyze', counters: finalAttemptHeld }),
    { allowed: false, reason: 'budget_exhausted' }, 'a second claim cannot compete with the already-held final attempt');

  const reconciled = {
    incurredCostMicros: 18,
    reservedCostMicros: 0,
    providerAttempts: 2,
    reservedProviderAttempts: 0,
    nextProviderReservationMicros: 0,
  };
  assert.deepEqual(evaluate(modules, modules, { ...common, action: 'save_internal', counters: reconciled }),
    { allowed: true }, 'the completed result can be committed after its reservation is reconciled');
  assert.deepEqual(evaluate(modules, modules, { ...common, action: 'analyze', counters: { ...reconciled, nextProviderReservationMicros: 1 } }),
    { allowed: false, reason: 'budget_exhausted' }, 'a later provider claim sees the exhausted attempt ceiling');
});

test('replay returns the original stored command and conflicts on payload, operation, policy, request, user, or epochs', async () => {
  const modules = await modulesPromise;
  const request = requestFor();
  const source = sourceFor();
  const existing = commandFor(modules, { request, source });
  assert.deepEqual(modules.resolvePreparationReplay(null, existing), { kind: 'new', command: existing });

  const renewedCandidate = {
    ...existing,
    commandId: 'command-renewed',
    issuedAtMs: 1_100,
    expiresAtMs: 5_000,
    budget: { maxProviderAttempts: 50, maxCostMicros: 50_000 },
  };
  const replay = modules.resolvePreparationReplay(existing, renewedCandidate);
  assert.deepEqual(replay, { kind: 'replay', command: existing });
  assert.equal(replay.command.commandId, existing.commandId);
  assert.equal(replay.command.expiresAtMs, existing.expiresAtMs);
  assert.deepEqual(replay.command.budget, existing.budget);

  const changedRequest = { ...request, posting: { ...request.posting, title: 'Lead Product Designer' } };
  const newRequestId = requestFor({ requestId: 'request-002' });
  const newOperation = requestFor({ operation: 'analyze_supplied_role' });
  const changedSource = sourceFor({ hash: 'c'.repeat(64) });
  const conflicts = [
    ['payload', commandFor(modules, { request: changedRequest, source })],
    ['request id', commandFor(modules, { request: newRequestId, source })],
    ['operation', commandFor(modules, { request: newOperation, source })],
    ['user', { ...existing, userId: 'different-candidate' }],
    ['policy', { ...existing, policyVersion: 'preparation-policy-v2' }],
    ['authority epoch', { ...existing, authorityEpoch: existing.authorityEpoch + 1 }],
    ['deletion epoch', { ...existing, deletionEpoch: existing.deletionEpoch + 1 }],
    ['pinned source', commandFor(modules, { request, source: changedSource })],
  ];
  for (const [label, candidate] of conflicts) {
    assert.deepEqual(modules.resolvePreparationReplay(existing, candidate), { kind: 'conflict' }, `${label} cannot replay an earlier command`);
  }
});
