const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
let modulePromise;

async function loadEmailSystem() {
  if (!modulePromise) {
    const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-email-system-'));
    const outfile = path.join(outdir, 'email-system.cjs');
    modulePromise = build({
      entryPoints: [path.join(repoRoot, 'lib', 'email', 'render.tsx')],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    }).then(() => require(outfile));
  }
  return modulePromise;
}

function withEmailEnvironment(callback) {
  const keys = [
    'EMAIL_SYSTEM_V2_ENABLED',
    'EMAIL_MARKETING_ENABLED',
    'EMAIL_MAILING_ADDRESS',
    'EMAIL_FROM',
    'EMAIL_FROM_SECURITY',
    'EMAIL_SUPPORT_REPLY_TO',
    'EMAIL_SOCIAL_LINKS_ENABLED',
    'EMAIL_SOCIAL_X_URL',
    'EMAIL_SOCIAL_BLUESKY_URL',
    'EMAIL_SOCIAL_REDDIT_URL',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  return Promise.resolve(callback()).finally(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });
}

test('password reset renders branded HTML and a useful plain-text alternative', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const rendered = await renderEmail('security.password_reset_requested', {
    recipientName: 'Jordan',
    actionUrl: 'https://talentconsulting.io/auth/reset-password?mode=resetPassword&oobCode=redacted',
    expiresInMinutes: 60,
  });

  assert.equal(rendered.event, 'security.password_reset_requested');
  assert.equal(rendered.sender, 'security');
  assert.equal(rendered.stream, 'transactional');
  assert.equal(rendered.from, 'TalentConsulting.io <hello@talentconsulting.io>');
  assert.match(rendered.html, /TalentConsulting\.io/);
  assert.match(rendered.html, /#2E3FFF/i);
  assert.match(rendered.html, /brand\/taco\/taco-folded-ink\.png/);
  assert.match(rendered.text, /RESET YOUR PASSWORD/i);
  assert.match(rendered.text, /Never share this link/i);
  assert.equal(rendered.tags.find((tag) => tag.name === 'event').value, 'security_password_reset_requested');
}));

test('Taco-authored product email uses the official mark, labeled persona, and configured social footer', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  process.env.EMAIL_SOCIAL_LINKS_ENABLED = 'true';
  process.env.EMAIL_SOCIAL_X_URL = 'https://x.com/talentconsulting';
  process.env.EMAIL_SOCIAL_BLUESKY_URL = 'https://bsky.app/profile/talentconsulting.io';
  process.env.EMAIL_SOCIAL_REDDIT_URL = 'https://www.reddit.com/r/talentconsulting/';

  const rendered = await renderEmail('product.career_picks', {
    recipientName: 'Jordan',
    summary: 'Three focused matches are ready.',
    items: ['Senior Analyst — Example Co.'],
    actionUrl: 'https://talentconsulting.io/suite/job-search',
  });

  assert.match(rendered.html, /taco-icon-192\.png/);
  assert.match(rendered.html, />Taco</);
  assert.match(rendered.html, /Your review-first career copilot/);
  assert.match(rendered.html, /Continue the conversation/);
  assert.match(rendered.html, /https:\/\/x\.com\/talentconsulting/);
  assert.match(rendered.html, /https:\/\/bsky\.app\/profile\/talentconsulting\.io/);
  assert.match(rendered.html, /https:\/\/www\.reddit\.com\/r\/talentconsulting/);
  assert.match(rendered.text, /Taco/);
  assert.match(rendered.text, /Reddit community/);
}));

test('security and billing email stay focused even when social profiles are enabled', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  process.env.EMAIL_SOCIAL_LINKS_ENABLED = 'true';
  process.env.EMAIL_SOCIAL_X_URL = 'https://x.com/talentconsulting';

  const security = await renderEmail('security.password_reset_requested', {
    actionUrl: 'https://talentconsulting.io/auth/reset-password?oobCode=redacted',
  });
  const billing = await renderEmail('billing.payment_failed', {
    recipientName: 'Jordan',
    amount: '$49.00',
  });

  for (const rendered of [security, billing]) {
    assert.doesNotMatch(rendered.html, /taco-icon-192\.png/);
    assert.doesNotMatch(rendered.html, /Continue the conversation/);
    assert.doesNotMatch(rendered.html, /x\.com\/talentconsulting/);
  }
}));

test('social footer is opt-in and rejects misconfigured platform hosts', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const payload = {
    recipientName: 'Jordan',
    summary: 'Your week is ready to review.',
    items: ['Review one focused next step'],
    actionUrl: 'https://talentconsulting.io/suite',
  };

  const disabled = await renderEmail('product.weekly_recap', payload);
  assert.doesNotMatch(disabled.html, /Continue the conversation/);

  process.env.EMAIL_SOCIAL_LINKS_ENABLED = 'true';
  process.env.EMAIL_SOCIAL_X_URL = 'https://example.com/not-x';
  await assert.rejects(
    renderEmail('product.weekly_recap', payload),
    /EMAIL_SOCIAL_X_URL must use an approved X HTTPS host/,
  );
}));

test('React rendering escapes customer-controlled content and removes subject header injection', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const rendered = await renderEmail('billing.subscription_activated', {
    recipientName: '<img src=x onerror=alert(1)>',
    planName: 'pro\r\nBcc: attacker@example.test',
    interval: 'annual',
    price: '$159/year <script>alert(1)</script>',
    invoiceUrl: 'https://billing.stripe.com/p/login/preview',
  });

  assert.doesNotMatch(rendered.subject, /[\r\n]/);
  assert.doesNotMatch(rendered.html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(rendered.html, /<img src=x onerror/);
  assert.match(rendered.html, /&lt;img/);
  assert.match(rendered.html, /&lt;script&gt;/);
}));

test('unsafe action schemes fail closed even if they look like URLs', async () => withEmailEnvironment(async () => {
  const { renderEmail, safeHttpUrl } = await loadEmailSystem();
  assert.throws(() => safeHttpUrl('javascript:alert(1)'), /must use HTTP/);
  await assert.rejects(
    renderEmail('security.password_reset_requested', {
      actionUrl: 'javascript:alert(1)',
    }),
  );
}));

test('new sender domains fail closed at cutover when sender configuration is missing', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  process.env.EMAIL_SYSTEM_V2_ENABLED = 'true';
  await assert.rejects(
    renderEmail('security.password_reset_requested', {
      actionUrl: 'https://talentconsulting.io/auth/reset-password?oobCode=redacted',
    }),
    /EMAIL_FROM_SECURITY is required/,
  );
}));

test('configured sender and reply-to reject newline injection', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  process.env.EMAIL_FROM_SECURITY = 'Security <security@talentconsulting.io>\r\nBcc: attacker@example.test';
  await assert.rejects(
    renderEmail('security.password_reset_requested', {
      actionUrl: 'https://talentconsulting.io/auth/reset-password?oobCode=redacted',
    }),
    /Invalid from header value/,
  );
}));

test('representative billing content handles Unicode and optional fields', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const rendered = await renderEmail('billing.payment_failed', {
    recipientName: 'Zoë 李',
    amount: '€49.00',
  });
  assert.match(rendered.html, /Zoë 李/);
  assert.match(rendered.text, /€49\.00/);
  assert.doesNotMatch(rendered.html, /undefined|null/);
}));

test('the complete billing lifecycle catalog renders customer-safe HTML and text', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const fixtures = {
    'billing.subscription_activated': { planName: 'pro', interval: 'year', price: '$159/year' },
    'billing.trial_started': { planName: 'pro', nextEventAt: 'July 26, 2026' },
    'billing.trial_ending': { daysLeft: 3, endsAt: 'July 22, 2026' },
    'billing.renewal_upcoming': { planName: 'pro', amount: '$159.00', nextEventAt: 'August 1, 2026' },
    'billing.renewal_succeeded': { planName: 'pro', amount: '$159.00', invoiceUrl: 'https://invoice.stripe.com/i/preview' },
    'billing.invoice_available': { amount: '$159.00', invoiceUrl: 'https://invoice.stripe.com/i/preview' },
    'billing.payment_succeeded': { amount: '$159.00', invoiceUrl: 'https://invoice.stripe.com/i/preview' },
    'billing.payment_failed': { amount: '$159.00', invoiceUrl: 'https://invoice.stripe.com/i/preview' },
    'billing.payment_action_required': { amount: '$159.00', invoiceUrl: 'https://invoice.stripe.com/i/preview' },
    'billing.plan_changed': { oldPlan: 'pro', newPlan: 'studio' },
    'billing.interval_changed': { oldInterval: 'month', newInterval: 'year' },
    'billing.cancellation_scheduled': { accessEndsAt: 'August 1, 2026' },
    'billing.cancellation_reversed': { nextEventAt: 'August 1, 2026' },
    'billing.subscription_ended': { accessEndsAt: 'July 19, 2026' },
    'billing.payment_method_expiring': { brand: 'Visa', last4: '4242', expiresAt: '08/2026' },
    'billing.payment_method_updated': { brand: 'Visa', last4: '4242' },
    'billing.price_change_notice': { planName: 'pro', oldPrice: '$15/month', newPrice: '$17/month', effectiveAt: 'September 1, 2026' },
    'billing.refund_requested': { amount: '$49.00' },
    'billing.refund_succeeded': { amount: '$49.00' },
    'billing.refund_failed': { amount: '$49.00', reason: 'Stripe requires manual review.' },
    'billing.dispute_received': { amount: '$49.00', status: 'needs response' },
    'billing.dispute_won': { amount: '$49.00' },
    'billing.dispute_lost': { amount: '$49.00' },
  };

  for (const [event, payload] of Object.entries(fixtures)) {
    const rendered = await renderEmail(event, { recipientName: 'Jordan', ...payload });
    assert.equal(rendered.stream, 'transactional', event);
    assert.equal(rendered.sender, 'billing', event);
    assert.ok(rendered.subject.length > 5, event);
    assert.match(rendered.html, /TalentConsulting\.io/, event);
    assert.ok(rendered.text.length > 80, event);
    assert.doesNotMatch(rendered.html, /failureMessage|payment_intent|stripeEventId/i, event);
  }
}));

test('security, account, support, product, and internal templates render through the shared system', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const fixtures = {
    'security.new_sign_in': { recipientName: 'Jordan', occurredAt: 'July 19, 2026 at 1:00 PM', device: 'Chrome on Windows', location: 'New York, US' },
    'account.deletion_requested': { recipientName: 'Jordan', actionUrl: 'https://talentconsulting.io/account/delete?signature=redacted', expiresInMinutes: 60 },
    'support.case_opened': { recipientName: 'Jordan', caseId: 'TC-1042', summary: 'We are reviewing your request.' },
    'support.incident_updated': { recipientName: 'Jordan', summary: 'Service is recovering and queued work is processing.', serviceName: 'Talent Studio' },
    'product.career_picks': { recipientName: 'Jordan', summary: 'Three review-ready matches are available.', items: ['Senior Analyst — Example Co.', 'Strategy Lead — Sample Inc.'], actionUrl: 'https://talentconsulting.io/suite/job-search' },
    'product.study_reminder': { recipientName: 'Jordan', summary: 'Continue your data analysis plan.', items: ['Complete lesson 3', 'Practice one exercise'], actionUrl: 'https://talentconsulting.io/suite/skill-bridge' },
    'internal.dispute_escalation': { referenceId: 'dp_123', summary: 'Evidence is due within seven days.', severity: 'critical', details: [{ label: 'Amount', value: '$49.00' }] },
    'internal.email_queue_backlog': { referenceId: 'queue-20260719', summary: 'Queued messages exceeded the operations threshold.', severity: 'warning' },
  };
  for (const [event, payload] of Object.entries(fixtures)) {
    const rendered = await renderEmail(event, payload);
    assert.match(rendered.html, /TalentConsulting\.io/, event);
    assert.ok(rendered.text.length > 80, event);
    assert.ok(rendered.tags.some((tag) => tag.name === 'category'), event);
  }
}));

test('marketing templates can be previewed but cannot render for live delivery while disabled', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const payload = {
    recipientName: 'Jordan',
    headline: 'A new career planning guide',
    summary: 'A concise guide to planning your next career move.',
    items: ['Clarify the target', 'Build evidence', 'Run a focused search'],
    actionLabel: 'Read the guide',
    actionUrl: 'https://talentconsulting.io/resources/guide',
    unsubscribeUrl: 'https://talentconsulting.io/unsubscribe?signature=redacted',
    mailingAddress: '123 Example Street, New York, NY 10001',
  };
  await assert.rejects(renderEmail('marketing.product_announcement', payload), /Marketing email is disabled/);
  const preview = await renderEmail('marketing.product_announcement', payload, { allowDisabledMarketingPreview: true });
  assert.equal(preview.stream, 'marketing');
  assert.match(preview.html, /Unsubscribe/);
  assert.match(preview.html, /123 Example Street/);
}));

test('every reserved event renders HTML and plain text from a schema-complete contract fixture', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const contracts = fs.readFileSync(path.join(repoRoot, 'lib', 'email', 'contracts.ts'), 'utf8');
  const eventBlock = contracts.match(/EMAIL_EVENT_KEYS = \[([\s\S]*?)\] as const/)?.[1] || '';
  const events = [...eventBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(events.length >= 70);
  const fixture = {
    recipientName: 'Zoë 李',
    actionUrl: 'https://talentconsulting.io/action?code=redacted',
    expiresInMinutes: 60,
    dashboardUrl: 'https://talentconsulting.io/suite',
    planName: 'pro',
    accessSummary: 'Enterprise-grade access is active.',
    interval: 'year',
    price: '$159.00 USD',
    effectiveAt: 'August 1, 2026',
    invoiceUrl: 'https://invoice.stripe.com/i/preview',
    billingUrl: 'https://talentconsulting.io/suite/settings?tab=billing',
    daysLeft: 3,
    endsAt: 'August 1, 2026',
    oldPlan: 'pro',
    newPlan: 'studio',
    accessEndsAt: 'August 1, 2026',
    amount: '$159.00 USD',
    nextAttemptAt: 'July 21, 2026',
    nextEventAt: 'August 1, 2026',
    oldInterval: 'month',
    newInterval: 'year',
    brand: 'Visa',
    last4: '4242',
    expiresAt: '08/2026',
    oldPrice: '$15/month',
    newPrice: '$17/month',
    status: 'under review',
    supportUrl: 'https://talentconsulting.io/contact',
    occurredAt: 'July 19, 2026 at 2:30 PM ET',
    changedAt: 'July 19, 2026 at 2:30 PM ET',
    device: 'Chrome on Windows',
    location: 'New York, US',
    securityUrl: 'https://talentconsulting.io/suite/settings?tab=security',
    secureAccountUrl: 'https://talentconsulting.io/auth/reset-password',
    accountUrl: 'https://talentconsulting.io/suite/settings',
    details: [{ label: 'Reference', value: 'preview_123' }],
    caseId: 'TC-2048',
    summary: 'A bounded, customer-safe summary with Unicode: résumé, São Paulo, and 李.',
    caseUrl: 'https://talentconsulting.io/suite/feedback',
    serviceName: 'Talent Studio',
    startsAt: 'July 20, 2026',
    statusUrl: 'https://talentconsulting.io/contact',
    items: ['First bounded item', 'Second bounded item'],
    preferenceUrl: 'https://talentconsulting.io/suite/settings',
    unsubscribeUrl: 'https://talentconsulting.io/email/unsubscribe?token=redacted',
    referenceId: 'preview_123',
    severity: 'warning',
    headline: 'A TalentConsulting.io update',
    actionLabel: 'Review update',
    mailingAddress: '123 Example Street, New York, NY 10001',
    changedPreferences: ['Study reminders', 'Weekly recap'],
    settingsUrl: 'https://talentconsulting.io/suite/settings',
    policyName: 'Privacy Policy',
    policyUrl: 'https://talentconsulting.io/privacy',
    roleName: 'Administrator',
    invitedBy: 'owner@talentconsulting.io',
  };

  for (const event of events) {
    const rendered = await renderEmail(event, fixture, { allowDisabledMarketingPreview: true });
    assert.equal(rendered.event, event);
    assert.match(rendered.html, /TalentConsulting\.io/);
    assert.ok(rendered.text.length > 60, event);
    assert.doesNotMatch(rendered.subject, /[\r\n]/, event);
    assert.match(rendered.html, /max-width:\s*\d+px/i, event);
    assert.match(rendered.html, /name="viewport"/i, event);
    assert.match(rendered.html, /table-layout:\s*fixed/i, event);
    assert.match(rendered.html, /alt="Taco by TalentConsulting"/i, event);
  }
}));


test('account action email copy distinguishes optional-email pause from queued deletion', async () => withEmailEnvironment(async () => {
  const { renderEmail } = await loadEmailSystem();
  const request = await renderEmail('account.deactivation_requested', {
    recipientName: 'Jordan', actionUrl: 'https://talentconsulting.io/account/action?token=fixture', expiresInMinutes: 60,
  });
  assert.match(request.subject, /optional-email pause/i);
  assert.match(request.text, /does not disable sign-in or delete your account data/i);
  const paused = await renderEmail('account.deactivated', {
    recipientName: 'Jordan', accountUrl: 'https://talentconsulting.io/suite/settings',
  });
  assert.match(paused.text, /You can still sign in/i);
  assert.match(paused.text, /Essential account and security messages may still be sent/i);
  assert.doesNotMatch(paused.text, /profile is inactive|account is deactivated|sign-in is disabled/i);
  const deletion = await renderEmail('account.deletion_requested', {
    recipientName: 'Jordan', actionUrl: 'https://talentconsulting.io/account/action?token=fixture', expiresInMinutes: 60,
  });
  assert.match(deletion.text, /queues the request for processing/i);
  assert.match(deletion.text, /does not mean deletion is complete/i);
}));
