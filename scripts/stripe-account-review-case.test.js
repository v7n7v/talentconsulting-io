const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-stripe-account-review-case-'));
const outfile = path.join(outdir, 'stripe-account-review-case.cjs');
const receiptOutfile = path.join(outdir, 'stripe-account-review-receipt.cjs');
const aliasRootPlugin = {
  name: 'alias-root',
  setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => {
      const target = path.join(repoRoot, args.path.slice(2));
      const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate));
      return { path: resolved || target };
    });
  },
};
const caseModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-account-review-case.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  plugins: [aliasRootPlugin],
}).then(() => require(outfile));
const receiptModule = build({
  entryPoints: [path.join(repoRoot, 'lib', 'billing', 'stripe-account-review-receipt.ts')],
  outfile: receiptOutfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  plugins: [aliasRootPlugin],
}).then(() => require(receiptOutfile));

test('billing review starts only from new with an operator note', async () => {
  const { validateStripeAccountReviewTransition } = await caseModule;
  assert.deepEqual(validateStripeAccountReviewTransition({
    currentStatus: 'new',
    nextStatus: 'reviewing',
    note: 'Review started.',
  }), { valid: true, nextStatus: 'reviewing', note: 'Review started.' });
  assert.equal(validateStripeAccountReviewTransition({
    currentStatus: 'reviewing',
    nextStatus: 'reviewing',
    note: 'Again',
  }).valid, false);
});

test('closing a billing review requires both attestations and exact confirmation', async () => {
  const {
    buildStripeAccountReviewEvidence,
    validateStripeAccountReviewTransition,
    STRIPE_ACCOUNT_REVIEW_CLOSE_CONFIRMATION,
  } = await caseModule;
  const checkoutAccountEvidence = buildStripeAccountReviewEvidence({
    uidCustomerIds: ['cus_one'],
    needsNewCustomer: false,
    verifiedAt: '2026-07-11T19:20:00.000Z',
  });
  const base = {
    currentStatus: 'reviewing',
    nextStatus: 'resolved',
    note: 'Duplicate customer records were reconciled and checked.',
    accountHistoryReviewed: true,
    checkoutSafetyReviewed: true,
    confirmationText: STRIPE_ACCOUNT_REVIEW_CLOSE_CONFIRMATION,
    checkoutAccountEvidence,
    nowMs: new Date('2026-07-11T19:25:00.000Z').getTime(),
  };
  assert.deepEqual(validateStripeAccountReviewTransition(base), {
    valid: true,
    nextStatus: 'resolved',
    note: base.note,
  });
  assert.equal(validateStripeAccountReviewTransition({ ...base, checkoutSafetyReviewed: false }).valid, false);
  assert.equal(validateStripeAccountReviewTransition({ ...base, confirmationText: 'CLOSE' }).valid, false);
  assert.equal(validateStripeAccountReviewTransition({ ...base, currentStatus: 'resolved' }).valid, false);
  assert.equal(validateStripeAccountReviewTransition({
    ...base,
    nowMs: new Date('2026-07-11T19:40:01.000Z').getTime(),
  }).valid, false);
});

test('aggregate customer evidence deduplicates ids and counts a prospective customer', async () => {
  const { buildStripeAccountReviewEvidence } = await caseModule;
  const ready = buildStripeAccountReviewEvidence({
    uidCustomerIds: ['cus_one', 'cus_one', 'cus_two'],
    selectedCustomerId: 'cus_two',
    localCustomerId: 'cus_local',
    needsNewCustomer: false,
    verifiedAt: '2026-07-11T19:20:00.000Z',
  });
  assert.equal(ready.linkedCustomerCount, 3);
  assert.equal(ready.prospectiveCustomerCount, 3);
  assert.equal(ready.status, 'ready');

  const blocked = buildStripeAccountReviewEvidence({
    uidCustomerIds: Array.from({ length: 20 }, (_, index) => `cus_${index}`),
    needsNewCustomer: true,
    verifiedAt: '2026-07-11T19:20:00.000Z',
  });
  assert.equal(blocked.prospectiveCustomerCount, 21);
  assert.equal(blocked.status, 'blocked');
});

test('user receipt exposes lifecycle copy without internal review evidence', async () => {
  const {
    normalizeStripeAccountReviewReceipt,
    stripeAccountReviewReceiptPresentation,
  } = await receiptModule;
  const receipt = normalizeStripeAccountReviewReceipt({
    issueCode: 'stripe_account_review_required',
    caseId: 'case_123',
    status: 'resolved',
    createdAt: '2026-07-11T19:00:00.000Z',
    updatedAt: '2026-07-11T19:30:00.000Z',
    resolvedAt: '2026-07-11T19:30:00.000Z',
    reviewedBy: 'admin@example.com',
    resolutionNote: 'internal note',
    prospectiveCustomerCount: 3,
  });
  assert.deepEqual(Object.keys(receipt).sort(), ['caseId', 'createdAt', 'resolvedAt', 'status', 'updatedAt']);
  assert.equal(stripeAccountReviewReceiptPresentation(receipt.status).actionLabel, 'Return to checkout');
  assert.equal(normalizeStripeAccountReviewReceipt({
    issueCode: 'other',
    caseId: 'case_123',
  }), null);
  assert.equal(normalizeStripeAccountReviewReceipt({
    issueCode: 'stripe_account_review_required',
    caseId: 'case_123',
    status: 'unknown',
  }), null);
});

test('admin billing support routes are bounded, audited, and contain no Stripe mutation', () => {
  const listRoute = fs.readFileSync(path.join(repoRoot, 'app/api/admin/billing/support-cases/route.ts'), 'utf8');
  const updateRoute = fs.readFileSync(path.join(repoRoot, 'app/api/admin/billing/support-cases/[caseId]/route.ts'), 'utf8');
  for (const source of [listRoute, updateRoute]) {
    assert.match(source, /requireBillingAdmin/);
    assert.doesNotMatch(source, /new Stripe|stripe\.|subscriptions\.|customers\.|checkout\./);
  }
  assert.match(listRoute, /Math\.min\([\s\S]*100\)/);
  assert.match(listRoute, /where\('issueCode', '==', STRIPE_ACCOUNT_REVIEW_ISSUE_CODE\)/);
  assert.match(updateRoute, /runTransaction/);
  assert.match(updateRoute, /FieldValue\.arrayUnion/);
  assert.match(updateRoute, /writeBillingAuditLog/);
  assert.match(updateRoute, /SAFE_CASE_ID/);
  assert.match(updateRoute, /checkoutAccountEvidence: data\.checkoutAccountEvidence/);
});

test('customer evidence verification is bounded, aggregate-only, and read-only in Stripe', () => {
  const verifyRoute = fs.readFileSync(path.join(
    repoRoot,
    'app/api/admin/billing/support-cases/[caseId]/verify/route.ts',
  ), 'utf8');
  assert.match(verifyRoute, /requireBillingAdmin/);
  assert.match(verifyRoute, /discoverStripeCheckoutCustomers/);
  assert.match(verifyRoute, /buildStripeAccountReviewEvidence/);
  assert.match(verifyRoute, /runTransaction/);
  assert.match(verifyRoute, /STRIPE_ACCOUNT_EVIDENCE_UNAVAILABLE/);
  assert.doesNotMatch(verifyRoute, /customers\.(?:create|update|del)|subscriptions\.(?:create|update|cancel)|checkout\.sessions\.create/);
  assert.doesNotMatch(verifyRoute, /customerIds\s*:/);
});

test('Billing Ops exposes named mobile-safe review and closure controls', () => {
  const adminPage = fs.readFileSync(path.join(repoRoot, 'app/suite/admin/page.tsx'), 'utf8');
  assert.match(adminPage, /\['support', 'Support Cases', 'support_agent'\]/);
  assert.match(adminPage, /\/api\/admin\/billing\/support-cases\?limit=75/);
  assert.match(adminPage, /Start account review/);
  assert.match(adminPage, /Close reviewed case/);
  assert.match(adminPage, /Account history reviewed/);
  assert.match(adminPage, /Checkout safety reviewed/);
  assert.match(adminPage, /CLOSE BILLING REVIEW/);
  assert.match(adminPage, /grid gap-2 md:grid-cols-2/);
  assert.match(adminPage, /This workflow records review evidence only/);
  assert.match(adminPage, /Verify customer evidence/);
});

test('billing support submission and lifecycle maintain one private user receipt', () => {
  const feedbackApi = fs.readFileSync(path.join(repoRoot, 'app/api/feedback/route.ts'), 'utf8');
  const lifecycleApi = fs.readFileSync(path.join(repoRoot, 'app/api/admin/billing/support-cases/[caseId]/route.ts'), 'utf8');
  assert.match(feedbackApi, /collection\('billingSupport'\)\s*\.doc\('current'\)/);
  assert.match(feedbackApi, /currentReceipt\.status !== 'resolved'/);
  assert.match(feedbackApi, /currentReceiptSnapshot\.exists && !currentReceipt/);
  assert.match(feedbackApi, /runTransaction/);
  assert.match(feedbackApi, /transaction\.set\(proposedCaseRef/);
  assert.match(feedbackApi, /alreadyOpen: true/);
  assert.match(lifecycleApi, /receiptSnapshot\.data\(\)\?\.caseId === caseId/);
  assert.match(lifecycleApi, /transaction\.set\(receiptRef/);
});

test('private support status endpoint is no-store and omits admin evidence', () => {
  const statusApi = fs.readFileSync(path.join(repoRoot, 'app/api/billing/support-status/route.ts'), 'utf8');
  const settingsPage = fs.readFileSync(path.join(repoRoot, 'app/suite/settings/page.tsx'), 'utf8');
  assert.match(statusApi, /guardApiRoute/);
  assert.match(statusApi, /collection\('billingSupport'\)/);
  assert.match(statusApi, /private, no-store, max-age=0/);
  assert.match(statusApi, /BILLING_SUPPORT_STATUS_INVALID/);
  assert.doesNotMatch(statusApi, /admin_feedback|resolutionNote|reviewedBy|prospectiveCustomerCount|caseId:/);
  assert.match(settingsPage, /\/api\/billing\/support-status/);
  assert.match(settingsPage, /Billing support status is unavailable/);
  assert.match(settingsPage, /stripeAccountReviewReceiptPresentation/);
  assert.match(settingsPage, /router\.push\('\/suite\/upgrade'\)/);
  assert.match(settingsPage, /Check status/);
  assert.match(settingsPage, /min-h-11/);
});
