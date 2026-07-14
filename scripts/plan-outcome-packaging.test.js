const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const positiveAutoApplyClaim = /auto[- ]?apply|automatically\s+(?:submit|appl(?:y|ies))|appl(?:y|ies)\s+automatically|submit\s+applications?\s+for\s+you/i;

test('review-first guard recognizes common autonomous-application claims', () => {
  for (const claim of [
    'auto-apply to jobs',
    'auto apply while you sleep',
    'automatically applies to roles',
    'apply automatically',
    'submit applications for you',
  ]) {
    assert.match(claim, positiveAutoApplyClaim);
  }
});

test('shared plan identity sells distinct Pro and Max outcomes', () => {
  const identity = read('lib/plan-identity.ts');
  assert.match(identity, /Hands-on tools for tailoring applications, practicing interviews, and keeping active search work connected/);
  assert.match(identity, /Sona scouts, ranks, and prepares truth-locked application packets for your review/);
  assert.match(identity, /review-first|review queue|for approval/i);
  assert.doesNotMatch(identity, positiveAutoApplyClaim);
});

test('upgrade discovery surfaces lead with workflow outcomes instead of larger limits', () => {
  const productCopy = read('lib/product-copy.ts');
  const sidebar = read('components/SuiteSidebar.tsx');
  const banner = read('components/UpgradeBanner.tsx');
  const settings = read('app/suite/settings/page.tsx');
  const metadata = read('app/suite/upgrade/layout.tsx');
  const visiblePackaging = [productCopy, sidebar, banner, settings, metadata].join('\n');

  assert.match(productCopy, /Pro connects your active search/);
  assert.match(productCopy, /Max puts Sona to work/);
  assert.match(sidebar, /UPGRADE_COPY\.sidebarPlanChoice/);
  assert.match(banner, /UPGRADE_COPY\.planChoice/);
  assert.match(settings, /Free proves the workflow/);
  assert.match(metadata, /Sona-led scouting, truth-locked packets, and review-first alerts/);
  assert.match(metadata, /Free, Pro & Max Plans/);
  assert.doesNotMatch(metadata, /Free, Pro & Studio Plans/);
  assert.doesNotMatch(visiblePackaging, /higher[- ]limit|larger limits|larger caps|higher writing limits|premium tools|enhanced features/i);
  assert.doesNotMatch(visiblePackaging, positiveAutoApplyClaim);
});

test('paid lifecycle messages explain the work that became available', () => {
  const email = read('lib/email-templates.ts');
  const paidEmail = email.slice(
    email.indexOf('// ── Template: Subscription Confirmed'),
    email.indexOf('// ── Template: Job Digest'),
  );
  const sona = read('app/api/agent/chat/route.ts');
  const sonaAccess = sona.slice(
    sona.indexOf('async function checkSonaAccess'),
    sona.indexOf('async function incrementSonaUsage'),
  );
  assert.match(paidEmail, /Sona scouting with ranked opportunities and source checks/);
  assert.match(paidEmail, /Role-ready resumes grounded in your real experience/);
  assert.match(paidEmail, /Sona can now scout, rank and prepare truth-locked application work for your review/);
  assert.match(paidEmail, /Paid resume, interview, writing, and Sona workflows return to Free access/);
  assert.match(paidEmail, /Sona can scout and rank opportunities, prepare truth-locked application packets/);
  assert.match(sonaAccess, /Compare Pro for hands-on search work or Max for proactive scouting and prepared packets/);
  assert.doesNotMatch(`${paidEmail}\n${sonaAccess}`, /higher[- ]limit|increased AI generation limits|premium tools|enhanced features|unlock higher limits/i);
  assert.doesNotMatch(`${paidEmail}\n${sonaAccess}`, positiveAutoApplyClaim);
});

test('outcome-led packaging keeps quota and billing transparency', () => {
  const upgrade = read('app/suite/upgrade/page.tsx');
  const usageGate = read('components/UsageLimitGate.tsx');
  assert.match(upgrade, /Daily Sona workloads/);
  assert.match(upgrade, /Plan comparison/);
  assert.match(upgrade, /Billed annually/);
  assert.match(usageGate, /\{used\}\/\{cap\}/);
  assert.match(usageGate, /freeLimitTitle/);
});

test('Settings never presents a monthly catalogue price as the current paid charge', () => {
  const settings = read('app/suite/settings/page.tsx');
  assert.match(settings, /plan\.id === 'free' \? '\$0' : 'Active plan'/);
  assert.match(settings, /billing interval, invoices, payment method, and cancellation are managed securely in Stripe/);
  assert.doesNotMatch(settings, /const currentPrice = plan\.id === 'free' \? '\$0' : prices\.plans\[plan\.id\]\.month\.display/);
});
