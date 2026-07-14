const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');

async function loadSelection() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-account-selection-'));
  const outfile = path.join(outdir, 'selection.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'stripe-account-selection.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

test('checkout never reuses a customer claimed by another Firebase user', async () => {
  const { selectStripeCustomerForUser } = await loadSelection();
  const customers = [
    { id: 'cus_other', firebaseUid: 'other-user' },
    { id: 'cus_exact', firebaseUid: 'current-user' },
  ];

  assert.deepEqual(selectStripeCustomerForUser(customers, 'current-user', { allowUnclaimed: true }), {
    customerId: 'cus_exact',
    claimRequired: false,
  });
  assert.equal(selectStripeCustomerForUser([{ id: 'cus_other', firebaseUid: 'other-user' }], 'current-user', { allowUnclaimed: true }), null);
});

test('checkout may claim an unowned customer but the portal requires an exact UID match', async () => {
  const { selectStripeCustomerForUser } = await loadSelection();
  const customers = [{ id: 'cus_unclaimed', firebaseUid: null }];

  assert.deepEqual(selectStripeCustomerForUser(customers, 'current-user', { allowUnclaimed: true }), {
    customerId: 'cus_unclaimed',
    claimRequired: true,
  });
  assert.equal(selectStripeCustomerForUser(customers, 'current-user'), null);
});

test('active subscriptions outrank stale canceled history regardless of list order', async () => {
  const { selectAuthoritativeStripeSubscription } = await loadSelection();
  const selected = selectAuthoritativeStripeSubscription([
    { id: 'sub_canceled', status: 'canceled', created: 300 },
    { id: 'sub_active_old', status: 'active', created: 100 },
    { id: 'sub_active_new', status: 'active', created: 200 },
  ]);

  assert.equal(selected.id, 'sub_active_new');
});

test('conflicting customer and subscription UIDs fail closed', async () => {
  const { resolveStripeFirebaseUid } = await loadSelection();

  assert.deepEqual(resolveStripeFirebaseUid({ customerUid: 'one', subscriptionUid: 'two' }), { uid: null, conflict: true });
  assert.deepEqual(resolveStripeFirebaseUid({ customerUid: 'one', subscriptionUid: 'one' }), { uid: 'one', conflict: false });
  assert.deepEqual(resolveStripeFirebaseUid({ subscriptionUid: 'one' }), { uid: 'one', conflict: false });
});
