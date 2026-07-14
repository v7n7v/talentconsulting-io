const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-activation-receipt-'));
const outfile = path.join(outdir, 'activation-receipt.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'activation-receipt.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const {
  buildReceiptBoundHarnessInput,
  consumeSonaActivationReceipt,
  createSonaActivationReceipt,
  verifySonaActivationReceipt,
} = require(outfile);

const secret = 'test-only-sona-preflight-secret-123456789';
const issuedAt = new Date('2026-07-10T17:00:00.000Z');

function issueReceipt(overrides = {}) {
  return createSonaActivationReceipt({
    uid: 'user-123',
    resumeVersionId: 'resume-42',
    targetRole: 'Security Engineer',
    location: 'New Jersey',
    salaryTarget: 120000,
    remotePreference: 'hybrid',
    now: issuedAt,
    secret,
    ...overrides,
  });
}

test('receipt binds user, resume, resolved target and scout-only policy', () => {
  const receipt = issueReceipt();
  const verified = verifySonaActivationReceipt({
    token: receipt.token,
    uid: 'user-123',
    now: new Date('2026-07-10T17:02:00.000Z'),
    secret,
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.payload.resumeVersionId, 'resume-42');
  assert.equal(verified.payload.targetRole, 'Security Engineer');
  assert.equal(verified.payload.location, 'New Jersey');
  assert.equal(verified.payload.mode, 'scout');
  assert.equal(verified.payload.notify, false);
  assert.equal(verified.payload.maxPackets, 3);

  const input = buildReceiptBoundHarnessInput(verified.payload);
  assert.equal(input.resumeVersionId, 'resume-42');
  assert.equal(input.mode, 'scout');
  assert.equal(input.notify, false);
  assert.match(input.userRequest, /Security Engineer.*New Jersey/);
});

test('tampered, wrong-user and expired receipts fail closed', () => {
  const receipt = issueReceipt();
  const finalCharacter = receipt.token.endsWith('a') ? 'b' : 'a';
  const tampered = `${receipt.token.slice(0, -1)}${finalCharacter}`;

  assert.equal(verifySonaActivationReceipt({ token: tampered, uid: 'user-123', now: issuedAt, secret }).code, 'PREFLIGHT_INVALID');
  assert.equal(verifySonaActivationReceipt({ token: receipt.token, uid: 'user-456', now: issuedAt, secret }).code, 'PREFLIGHT_WRONG_USER');
  assert.equal(verifySonaActivationReceipt({ token: receipt.token, uid: 'user-123', now: new Date('2026-07-10T17:06:00.000Z'), secret }).code, 'PREFLIGHT_EXPIRED');
  assert.equal(verifySonaActivationReceipt({ uid: 'user-123', now: issuedAt, secret }).code, 'PREFLIGHT_REQUIRED');
});

function createConsumptionDb() {
  const consumed = new Set();
  const writes = [];
  return {
    writes,
    collection() {
      return {
        doc() {
          return {
            collection() {
              return {
                doc(id) {
                  return { id };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      return callback({
        get: async ref => ({ exists: consumed.has(ref.id) }),
        set: (ref, data) => {
          consumed.add(ref.id);
          writes.push({ id: ref.id, data });
        },
      });
    },
  };
}

test('receipt consumption is atomic and replay-safe', async () => {
  const receipt = issueReceipt();
  const verified = verifySonaActivationReceipt({ token: receipt.token, uid: 'user-123', now: issuedAt, secret });
  assert.equal(verified.ok, true);
  const db = createConsumptionDb();

  assert.equal(await consumeSonaActivationReceipt(db, verified.payload), true);
  assert.equal(await consumeSonaActivationReceipt(db, verified.payload), false);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].data.mode, 'scout');
  assert.equal(db.writes[0].data.notify, false);
  assert.ok(db.writes[0].data.consumedAt instanceof Date);
  assert.ok(db.writes[0].data.expiresAt instanceof Date);
  assert.match(db.writes[0].data.tokenFingerprint, /^[a-f0-9]{64}$/);
});

test('consumed activation receipts have a Firestore TTL policy', () => {
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
  const ttl = indexes.fieldOverrides.find(item => (
    item.collectionGroup === 'agent_preflight_receipts'
    && item.fieldPath === 'expiresAt'
  ));
  assert.equal(ttl?.ttl, true);
  assert.deepEqual(ttl?.indexes, []);
});
