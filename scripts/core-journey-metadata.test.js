const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PRIVATE_BASES = ['/suite', '/settings', '/auth', '/account', '/api', '/admin'];
const NOINDEX = 'noindex, nofollow, noarchive';

function robotsHeader(entry) {
  if (!entry) return undefined;
  return (entry.headers || []).find((header) => header.key.toLowerCase() === 'x-robots-tag');
}

test('homepage canonical belongs to a server wrapper while the landing remains a client component', () => {
  const page = read('app/page.tsx');
  const client = read('app/HomePageClient.tsx');
  const rootLayout = read('app/layout.tsx');

  assert.doesNotMatch(page, /^['"]use client['"]/m);
  assert.match(page, /import HomePageClient from '\.\/HomePageClient';/);
  assert.match(page, /export const metadata: Metadata\s*=\s*\{[\s\S]*?canonical:\s*'\/'/);
  assert.match(page, /return <HomePageClient\s*\/>;/);
  assert.doesNotMatch(rootLayout, /^\s*alternates\s*:/m);

  assert.match(client, /^['"]use client['"]/m);
  assert.match(client, /<TalentLanding isAuthenticated=\{Boolean\(user\)\}/);
  assert.match(client, /authHelpers\.onAuthStateChanged/);
  assert.match(client, /application\/ld\+json/);
  assert.match(rootLayout, /classList\.add\('js'\)/);
  assert.match(rootLayout, /<ConsentAwareAnalytics\s*\/>/);
  assert.match(rootLayout, /<ClientProviders>\{children\}<\/ClientProviders>/);
});

test('suite metadata excludes the base and inherited shells without changing client workspace providers', () => {
  const suite = read('app/suite/layout.tsx');
  assert.doesNotMatch(suite, /^['"]use client['"]/m);
  assert.match(suite, /export const metadata: Metadata/);
  assert.match(suite, /robots:\s*\{\s*index: false,\s*follow: false,/);
  assert.match(suite, /googleBot: \{ index: false, follow: false \}/);
  assert.doesNotMatch(suite, /canonical:/);
  assert.match(suite, /<WorkspaceFrame><ToolGuidanceProvider>\{children\}<\/ToolGuidanceProvider><\/WorkspaceFrame>/);
  assert.match(read('components/workspace/WorkspaceFrame.tsx'), /^['"]use client['"]/m);
  assert.match(read('components/guidance/ToolGuidanceProvider.tsx'), /^['"]use client['"]/m);
});

test('Next headers protect private bases and descendants while keeping production public routes indexable', async () => {
  const config = require(path.join(root, 'next.config.js'));
  const originalStagingHostname = process.env.STAGING_HOSTNAME;
  delete process.env.STAGING_HOSTNAME;
  try {
    const entries = await config.headers();
    const bySource = new Map(entries.map((entry) => [entry.source, entry]));
    for (const base of PRIVATE_BASES) {
      for (const source of [base, `${base}/:path*`]) {
        assert.equal(robotsHeader(bySource.get(source))?.value, NOINDEX, `missing private policy for ${source}`);
      }
    }
    assert.equal(robotsHeader(bySource.get('/:path*')), undefined, 'production-wide public header must not noindex public pages');
    assert.equal(robotsHeader(bySource.get('/privacy')), undefined);

    for (const base of PRIVATE_BASES) {
      const descendant = `${base}/sample`;
      const matched = entries.some((entry) => entry.source === base || (entry.source === `${base}/:path*` && descendant.startsWith(`${base}/`)));
      assert.equal(matched, true, `${descendant} must match a private header source`);
    }

    process.env.STAGING_HOSTNAME = 'staging.example.test';
    const stagingEntries = await config.headers();
    assert.equal(robotsHeader(stagingEntries.find((entry) => entry.source === '/:path*'))?.value, NOINDEX,
      'staging retains its global noindex policy');
  } finally {
    if (originalStagingHostname === undefined) delete process.env.STAGING_HOSTNAME;
    else process.env.STAGING_HOSTNAME = originalStagingHostname;
  }
});

test('Firebase Hosting headers protect explicit private bases and descendants', () => {
  const config = JSON.parse(read('firebase.json'));
  const entries = config.hosting.headers;
  const bySource = new Map(entries.map((entry) => [entry.source, entry]));
  for (const base of PRIVATE_BASES) {
    for (const source of [base, `${base}/**`]) {
      assert.equal(robotsHeader(bySource.get(source))?.value, NOINDEX, `missing Firebase policy for ${source}`);
    }
  }
  assert.equal(robotsHeader(bySource.get('**')), undefined, 'public Hosting header must remain indexable');
  assert.ok(bySource.has('/_next/static/**'), 'existing immutable static asset policy remains present');
});
