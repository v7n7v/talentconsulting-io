const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadGa4PrivacyModule() {
  const source = read('lib/analytics/ga4-privacy.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const context = {
    module: loadedModule,
    exports: loadedModule.exports,
    window: {
      localStorage: {
        getItem: () => 'granted',
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      dispatchEvent: () => undefined,
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  };
  vm.runInNewContext(output, context, { filename: 'ga4-privacy.js' });
  return loadedModule.exports;
}

test('optional product analytics defaults to denied and ignores browser-persisted grants', () => {
  const privacy = loadGa4PrivacyModule();
  assert.equal(privacy.readProductAnalyticsConsent(), 'denied');
  assert.equal(privacy.hasProductAnalyticsConsent(), false);
  privacy.applyVerifiedProductAnalyticsConsent({
    consent: 'granted',
    uid: 'verified-user',
    noticeVersion: 'observability-privacy-v1',
    collectionEnabled: true,
  });
  assert.equal(privacy.hasProductAnalyticsConsent(), true);
  privacy.clearVerifiedProductAnalyticsConsent();
  assert.equal(privacy.hasProductAnalyticsConsent(), false);
  privacy.markProductAnalyticsRevocationPending();
  privacy.applyVerifiedProductAnalyticsConsent({
    consent: 'granted',
    uid: 'verified-user',
    noticeVersion: 'observability-privacy-v1',
    collectionEnabled: true,
  });
  assert.equal(privacy.hasProductAnalyticsConsent(), false);
  privacy.clearProductAnalyticsRevocationPending();
  privacy.applyVerifiedProductAnalyticsConsent({
    consent: 'granted',
    uid: 'verified-user',
    noticeVersion: 'observability-privacy-v1',
    collectionEnabled: true,
  });
  assert.equal(privacy.hasProductAnalyticsConsent(), true);
});

test('event-specific sanitizer drops raw job and document identifiers', () => {
  const privacy = loadGa4PrivacyModule();
  const injected = 'jordan@example.com secret-company https://example.com/?token=abc';

  const jobSearch = privacy.sanitizeGa4Event('job_search', {
    search_term: injected,
    results: 42,
    url: injected,
    arbitrary: injected,
  });
  const jobApply = privacy.sanitizeGa4Event('job_apply', {
    company: injected,
    job_title: injected,
  });
  const resumeSaved = privacy.sanitizeGa4Event('sona_resume_saved', {
    version_id: injected,
  });

  assert.deepEqual(Object.keys(jobSearch).sort(), ['event_category', 'result_count_band']);
  assert.deepEqual(Object.keys(jobApply), ['event_category']);
  assert.deepEqual(Object.keys(resumeSaved), ['event_category']);
  assert.equal(JSON.stringify([jobSearch, jobApply, resumeSaved]).includes(injected), false);
});

test('unknown sources and provider errors collapse to bounded categories', () => {
  const privacy = loadGa4PrivacyModule();
  const newsletter = privacy.sanitizeGa4Event('newsletter_subscribe', {
    source: 'https://example.com/private/path?email=jordan@example.com',
    frequency: 'hourly',
  });
  const checkout = privacy.sanitizeGa4Event('checkout_session_failed', {
    source: 'user-controlled',
    tier: 'enterprise-secret',
    interval: 'custom',
    reason: 'Stripe customer cus_secret failed with card details',
  });

  assert.equal(newsletter.source, 'other');
  assert.equal(newsletter.frequency, 'weekly');
  assert.equal(checkout.source, 'upgrade_page');
  assert.equal(checkout.tier, 'free');
  assert.equal(checkout.interval, 'monthly');
  assert.equal(checkout.reason, 'network_or_unknown');
});

test('GA4 is absent from server layout and loaded only by the consent-aware client', () => {
  const layout = read('app/layout.tsx');
  const loader = read('components/privacy/ConsentAwareAnalytics.tsx');

  assert.doesNotMatch(layout, /next\/script/);
  assert.doesNotMatch(layout, /googletagmanager\.com\/gtag/);
  assert.match(layout, /ConsentAwareAnalytics/);
  assert.match(loader, /hasProductAnalyticsConsent/);
  assert.match(loader, /onAuthStateChanged/);
  assert.match(loader, /\/api\/observability\/consent/);
  assert.match(loader, /clearVerifiedProductAnalyticsConsent/);
  assert.match(loader, /BroadcastChannel/);
  assert.match(loader, /PRODUCT_ANALYTICS_REVOCATION_CHANNEL/);
  assert.match(loader, /visibilitychange/);
  assert.match(loader, /addEventListener\(['"]focus/);
  assert.match(loader, /5 \* 60_000/);
  assert.match(loader, /googletagmanager\.com\/gtag/);
  assert.match(loader, /ga-disable-/);
  assert.match(loader, /analytics_storage:\s*'denied'/);
});

test('withdrawal and reset clear consent before the network result is known', () => {
  const controls = read('components/privacy/ObservabilityPrivacyControls.tsx');
  const updateStart = controls.indexOf('const update = async');
  const updateRequest = controls.indexOf("authFetch('/api/observability/consent'", updateStart);
  const earlyWithdrawal = controls.indexOf(
    'markProductAnalyticsRevocationPending({ broadcast: true })',
    updateStart,
  );
  const resetStart = controls.indexOf('const resetMetadata = async');
  const resetRequest = controls.indexOf("authFetch('/api/privacy/observability/reset'", resetStart);
  const earlyReset = controls.indexOf(
    'markProductAnalyticsRevocationPending({ broadcast: true })',
    resetStart,
  );
  assert.ok(earlyWithdrawal > updateStart && earlyWithdrawal < updateRequest);
  assert.ok(earlyReset > resetStart && earlyReset < resetRequest);
  assert.match(controls, /if \(nextGranted\)[\s\S]*setEvidence\(previous\)/);
  assert.match(controls, /clearProductAnalyticsRevocationPending/);
  assert.match(controls, /requestGeneration/);
  assert.match(controls, /activeUid/);
  assert.match(controls, /auth\.currentUser\?\.uid !== uid/);
  assert.match(controls, /syncVerifiedAnalyticsConsent\(next, collectionAvailable, uid\)/);
});

test('analytics facade no longer forwards raw search, company, title, resume ID, or fake transaction ID', () => {
  const analytics = read('lib/analytics.ts');

  assert.doesNotMatch(analytics, /search_term\s*:/);
  assert.doesNotMatch(analytics, /\{\s*company\s*:/);
  assert.doesNotMatch(analytics, /job_title\s*:/);
  assert.doesNotMatch(analytics, /version_id\s*:/);
  assert.doesNotMatch(analytics, /transaction_id\s*:/);
  assert.match(analytics, /hasProductAnalyticsConsent/);
  assert.match(analytics, /sanitizeGa4Event/);
});
