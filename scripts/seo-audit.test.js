const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const {
  DEFAULT_CONFIG,
  analyzePriorityMappings,
  buildPageIssues,
  buildRoutePolicyIssues,
  crawlSite,
  extractSitemapUrls,
  fetchText,
  parseHtmlPage,
  parseRobots,
  renderMarkdownReport,
  shouldFailCi,
  validateRoutePolicies,
} = require('./seo-audit');

const SITE_ORIGIN = 'https://example.com';

function pageIssues(html, overrides = {}) {
  const page = parseHtmlPage(`${SITE_ORIGIN}/target`, html, SITE_ORIGIN);
  return buildPageIssues(page, {
    config: { ...DEFAULT_CONFIG, ...overrides.config },
    robots: parseRobots(overrides.robots || ''),
    priorityQuery: overrides.priorityQuery || '',
  });
}

test('extractSitemapUrls reads sitemap loc entries', () => {
  const urls = extractSitemapUrls(`
    <urlset>
      <url><loc>https://example.com/one</loc></url>
      <url><loc>https://example.com/two?x=1&amp;y=2</loc></url>
    </urlset>
  `);

  assert.deepEqual(urls, ['https://example.com/one', 'https://example.com/two?x=1&y=2']);
});

test('buildPageIssues detects missing title, description, and canonical', () => {
  const issues = pageIssues(`
    <html>
      <head></head>
      <body>
        <h1>Target Page</h1>
        <p>This page explains the target clearly enough for an opening paragraph.</p>
        <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>
      </body>
    </html>
  `);

  assert.equal(issues.some((issue) => issue.category === 'titles'), true);
  assert.equal(issues.some((issue) => issue.category === 'descriptions'), true);
  assert.equal(issues.some((issue) => issue.category === 'canonical'), true);
});

test('buildPageIssues marks invalid JSON-LD as critical', () => {
  const issues = pageIssues(`
    <html>
      <head>
        <title>Valid Length Title For Testing</title>
        <meta name="description" content="This description is long enough to pass the audit description length rule for testing.">
        <link rel="canonical" href="https://example.com/target">
        <script type="application/ld+json">{ bad json }</script>
      </head>
      <body>
        <h1>Target Page</h1>
        <p>This is a clear answer paragraph with enough words to be useful near the top of the page.</p>
        <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>
      </body>
    </html>
  `);

  assert.equal(issues.some((issue) => issue.severity === 'critical' && issue.category === 'structured-data'), true);
});

test('buildPageIssues flags robots-blocked sitemap pages', () => {
  const issues = pageIssues(`
    <html>
      <head>
        <title>Valid Length Title For Testing</title>
        <meta name="description" content="This description is long enough to pass the audit description length rule for testing.">
        <link rel="canonical" href="https://example.com/target">
      </head>
      <body>
        <h1>Target Page</h1>
        <p>This is a clear answer paragraph with enough words to be useful near the top of the page.</p>
        <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>
      </body>
    </html>
  `, {
    robots: 'User-agent: *\nDisallow: /target',
  });

  assert.equal(issues.some((issue) => issue.severity === 'critical' && issue.category === 'crawlability'), true);
});

test('buildPageIssues flags data-heavy claims without citation links', () => {
  const issues = pageIssues(`
    <html>
      <head>
        <title>Valid Length Title For Testing</title>
        <meta name="description" content="This description is long enough to pass the audit description length rule for testing.">
        <link rel="canonical" href="https://example.com/target">
      </head>
      <body>
        <h1>Target Page</h1>
        <p>According to recent hiring data, 67% of hiring managers now review AI writing signals before interviews.</p>
        <p>${'Useful supporting content. '.repeat(260)}</p>
        <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a>
      </body>
    </html>
  `);

  assert.equal(issues.some((issue) => issue.category === 'source-citations'), true);
});

test('analyzePriorityMappings flags missing sitemap target', () => {
  const issues = analyzePriorityMappings(
    {
      ...DEFAULT_CONFIG,
      priorityMappings: [{ query: 'free ATS analyzer', targetPath: '/tools/ats-analyzer' }],
    },
    new Map(),
    new Set(['/other']),
    new Map()
  );

  assert.equal(issues.some((issue) => issue.category === 'query-map'), true);
});

const policy = (path, overrides = {}) => ({
  path,
  expectedStatus: [200],
  bodyClass: 'public-content',
  crawl: 'allowed',
  index: 'index',
  canonical: 'self',
  sitemap: 'required',
  ...overrides,
});

const html = (path = '/', extras = '') => `<!doctype html><html><head>
  <title>A useful public page with a clear title</title>
  <meta name="description" content="A sufficiently descriptive page summary intended for search results and clear visitor expectations.">
  <link rel="canonical" href="${SITE_ORIGIN}${path}">
  ${extras}
  </head><body><h1>A useful public page</h1><p>${'Clear evidence based content for people using this useful career workspace. '.repeat(45)}</p>
  <a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a></body></html>`;

function hasPolicyFailure(issues) {
  return issues.some((issue) => issue.ciFailure === true);
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

test('validateRoutePolicies accepts exact named routes and rejects unsafe or ambiguous config', () => {
  const normalized = validateRoutePolicies([policy('/terms')]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].path, '/terms');

  for (const badPath of [
    'https://example.com/private', '//example.com/private', '/x?token=secret', '/x#private',
    '/a/../private', '/%2e%2e/private', '/x%5cy', '/x\\y', '/users/*',
    '/public//profile', '/%2fprofile', '/%252fprofile', '/public/%252faccount', '/account/profile',
  ]) {
    assert.throws(() => validateRoutePolicies([policy(badPath)]), undefined, badPath);
  }
  assert.throws(() => validateRoutePolicies([policy('/duplicate'), policy('/duplicate')]), /duplicate/i);
  assert.throws(() => validateRoutePolicies([policy('/oops', { bodyClass: 'safe-shell', index: 'index' })]));
  assert.throws(() => validateRoutePolicies([policy('/oops', { expectedStatus: [401], bodyClass: 'public-content' })]));
  assert.throws(() => validateRoutePolicies([policy('/oops', { requiredHeaders: { authorization: ['Bearer'] } })]), /unsafe header/i);
  assert.throws(() => validateRoutePolicies([policy('/oops', { requiredHeaders: { 'content-type': 'text/html' } })]), /arrays/i);
  assert.throws(() => validateRoutePolicies(undefined), /array/i);
  assert.throws(() => validateRoutePolicies(null), /array/i);
  assert.throws(() => validateRoutePolicies({ path: '/not-an-array' }));
});

test('crawlSite keeps the legacy direct-call API when routePolicies is omitted', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response('<urlset></urlset>');
    throw new Error(`Unexpected URL requested: ${value}`);
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: { ...DEFAULT_CONFIG, priorityMappings: [] } });
  assert.deepEqual(results.pages, []);
});

test('route policies check inherited root canonical and safe shell visibility intent', () => {
  for (const route of ['/', '/privacy', '/terms']) {
    const page = parseHtmlPage(`${SITE_ORIGIN}${route}`, html(route, '<meta name="robots" content="index,follow">'), SITE_ORIGIN);
    const routeIssues = buildRoutePolicyIssues(page, policy(route), {
      robots: parseRobots(''), sitemapPaths: new Set([route]), siteOrigin: SITE_ORIGIN,
    });
    assert.equal(hasPolicyFailure(routeIssues), false, `${route} should keep its inherited, route-specific canonical`);
  }

  const shellMarkup = html('/suite/resume', '<meta name="robots" content="noindex,follow">').replace(/<link rel="canonical"[^>]*>/, '');
  const shell = parseHtmlPage(`${SITE_ORIGIN}/suite/resume`, shellMarkup, SITE_ORIGIN);
  const shellIssues = buildRoutePolicyIssues(shell, policy('/suite/resume', {
    bodyClass: 'safe-shell', crawl: 'either', index: 'noindex', canonical: 'omitted', sitemap: 'forbidden',
  }), { robots: parseRobots('User-agent: *\nDisallow: /suite/'), sitemapPaths: new Set(), siteOrigin: SITE_ORIGIN });
  assert.equal(hasPolicyFailure(shellIssues), false);
  assert.equal(shellIssues.some((issue) => issue.category === 'visibility-advisory'), true);
  assert.equal(shouldFailCi({ issues: shellIssues }), false);
});

test('suite resume and admin shells require noindex while protected statuses are not treated as privacy proof', () => {
  for (const route of ['/suite/resume', '/admin']) {
    const page = parseHtmlPage(`${SITE_ORIGIN}${route}`, html(route), SITE_ORIGIN);
    const issues = buildRoutePolicyIssues(page, policy(route, {
      bodyClass: 'safe-shell', crawl: 'either', index: 'noindex', canonical: 'omitted', sitemap: 'forbidden',
    }), { robots: parseRobots(''), sitemapPaths: new Set(), siteOrigin: SITE_ORIGIN });
    assert.equal(hasPolicyFailure(issues), true, `${route} without noindex must fail`);
  }

  for (const status of [401, 403]) {
    const protectedPolicy = policy(`/private-${status}`, {
      expectedStatus: [status], bodyClass: 'protected-error', crawl: 'either', index: 'none', canonical: 'ignore', sitemap: 'forbidden',
    });
    const page = { ...parseHtmlPage(`${SITE_ORIGIN}${protectedPolicy.path}`, html(protectedPolicy.path), SITE_ORIGIN), status };
    const issues = buildRoutePolicyIssues(page, protectedPolicy, {
      robots: parseRobots(''), sitemapPaths: new Set(), siteOrigin: SITE_ORIGIN,
    });
    assert.equal(hasPolicyFailure(issues), false);
    assert.equal(issues.some((issue) => /privacy|ownership|authentication/i.test(issue.message || '')), false);
  }
});

test('valid not-found response tolerates inherited index plus restrictive noindex', () => {
  const page = { ...parseHtmlPage(`${SITE_ORIGIN}/gone`, html('/gone', '<meta name="robots" content="index,follow"><meta name="robots" content="noindex">'), SITE_ORIGIN), status: 404 };
  const issues = buildRoutePolicyIssues(page, policy('/gone', {
    expectedStatus: [404], bodyClass: 'not-found', crawl: 'allowed', index: 'noindex', canonical: 'ignore', sitemap: 'forbidden',
  }), { robots: parseRobots(''), sitemapPaths: new Set(), siteOrigin: SITE_ORIGIN });
  assert.equal(hasPolicyFailure(issues), false);
});

test('parser captures applicable bot/header directives and ignores unrelated bot directives', () => {
  const parsed = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x', `
    <meta name="googlebot" content="noindex, nofollow">
    <meta name="bingbot" content="noindex">
  `), SITE_ORIGIN, { status: 200, headers: { 'x-robots-tag': 'otherbot: noindex, googlebot: noarchive' } });
  assert.equal(parsed.noindex, true);
  assert.equal(parsed.robotsDirectives.some((value) => value.agent === 'googlebot'), true);
  const unrelatedOnly = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x', '<meta name="bingbot" content="noindex">'), SITE_ORIGIN);
  assert.equal(unrelatedOnly.noindex, false);
  const none = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x', '<meta name="robots" content="none">'), SITE_ORIGIN);
  assert.equal(none.noindex, true);
  const unrelatedHeaderOnly = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x'), SITE_ORIGIN, { headers: { 'x-robots-tag': 'otherbot: noindex' } });
  assert.equal(unrelatedHeaderOnly.noindex, false);
  const scopedHeader = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x'), SITE_ORIGIN, { headers: { 'x-robots-tag': 'googlebot: noindex, otherbot: index' } });
  assert.equal(scopedHeader.noindex, true);
});

test('X-Robots-Tag keeps noindex after parameterized directives in global and Googlebot scopes', () => {
  const cases = [
    ['max-snippet: -1, noindex', true],
    ['unavailable_after: 25 Jun 2010 15:00:00 PST, noindex', true],
    ['googlebot: max-snippet: -1, noindex', true],
    ['googlebot: unavailable_after: 25 Jun 2010 15:00:00 PST, noindex', true],
    ['otherbot: max-snippet: -1, noindex', false],
    ['otherbot: unavailable_after: 25 Jun 2010 15:00:00 PST, noindex', false],
  ];
  for (const [xRobotsTag, expected] of cases) {
    const parsed = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x'), SITE_ORIGIN, {
      headers: { 'x-robots-tag': xRobotsTag },
    });
    assert.equal(parsed.noindex, expected, xRobotsTag);
  }

  const mixedScopes = parseHtmlPage(`${SITE_ORIGIN}/x`, html('/x'), SITE_ORIGIN, {
    headers: { 'x-robots-tag': 'max-snippet: -1, noindex, googlebot: max-image-preview:large, noindex, otherbot: index' },
  });
  assert.equal(mixedScopes.noindex, true);
  assert.equal(mixedScopes.robotsDirectives.some((item) => item.agent === 'googlebot' && item.directives.includes('noindex')), true);
  assert.equal(mixedScopes.robotsDirectives.some((item) => item.agent === 'otherbot'), true);
});

test('parser retains all canonicals and detects body metadata while ignoring script tag literals', () => {
  const parsed = parseHtmlPage(`${SITE_ORIGIN}/real`, `<!doctype html><html><head>
    <title>Real streamed page metadata title</title><link rel="canonical" href="/real">
    <script>const fake = '<meta name="robots" content="noindex"><link rel="canonical" href="/fake">';</script>
  </head><body><meta name="robots" content="noindex"><link rel="canonical" href="/other"></body></html>`, SITE_ORIGIN);
  assert.equal(parsed.noindex, true);
  assert.deepEqual(parsed.canonicalUrls, [`${SITE_ORIGIN}/real`, `${SITE_ORIGIN}/other`]);
  const fakeOnly = parseHtmlPage(`${SITE_ORIGIN}/real`, `<html><head><script>"<meta name='robots' content='noindex'>"</script></head><body></body></html>`, SITE_ORIGIN);
  assert.equal(fakeOnly.noindex, false);
});

test('conflicting canonical targets are deterministic policy failures', () => {
  const page = parseHtmlPage(`${SITE_ORIGIN}/same`, html('/same', `<link rel="canonical" href="/other">`), SITE_ORIGIN);
  assert.equal(page.canonicalUrls.length, 2);
  const issues = buildRoutePolicyIssues(page, policy('/same'), {
    robots: parseRobots(''), sitemapPaths: new Set(['/same']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(hasPolicyFailure(issues), true);
});

test('unexpected public response status and effective noindex are CI failures', () => {
  const good = parseHtmlPage(`${SITE_ORIGIN}/expected`, html('/expected'), SITE_ORIGIN);
  const wrongStatus = buildRoutePolicyIssues({ ...good, status: 503 }, policy('/expected'), {
    robots: parseRobots(''), sitemapPaths: new Set(['/expected']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(wrongStatus.some((issue) => issue.ciFailure && issue.category === 'route-status'), true);

  const noindexPage = parseHtmlPage(`${SITE_ORIGIN}/expected`, html('/expected', '<meta name="robots" content="noindex">'), SITE_ORIGIN);
  const noindexIssues = buildRoutePolicyIssues(noindexPage, policy('/expected'), {
    robots: parseRobots(''), sitemapPaths: new Set(['/expected']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(noindexIssues.some((issue) => issue.ciFailure && issue.category === 'index-policy'), true);
});

test('privacy and terms pages fail if root canonical metadata is inherited unchanged', () => {
  for (const route of ['/privacy', '/terms']) {
    const markup = html(route).replace(`${SITE_ORIGIN}${route}`, `${SITE_ORIGIN}/`);
    const page = parseHtmlPage(`${SITE_ORIGIN}${route}`, markup, SITE_ORIGIN);
    const issues = buildRoutePolicyIssues(page, policy(route), {
      robots: parseRobots(''), sitemapPaths: new Set([route]), siteOrigin: SITE_ORIGIN,
    });
    assert.equal(hasPolicyFailure(issues), true, `${route} must not inherit a root-only canonical`);
  }
});

test('off-origin canonical targets and missing required header tokens fail route policy', () => {
  const externalMarkup = html('/public').replace(`${SITE_ORIGIN}/public`, 'https://elsewhere.invalid/public');
  const external = parseHtmlPage(`${SITE_ORIGIN}/public`, externalMarkup, SITE_ORIGIN);
  const externalIssues = buildRoutePolicyIssues(external, policy('/public'), {
    robots: parseRobots(''), sitemapPaths: new Set(['/public']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(hasPolicyFailure(externalIssues), true);
  assert.equal(externalIssues.some((issue) => issue.category === 'canonical-policy'), true);

  const page = parseHtmlPage(`${SITE_ORIGIN}/headers`, html('/headers'), SITE_ORIGIN, {
    headers: { 'content-security-policy': 'default-src \'self\'' },
  });
  const headerPolicy = policy('/headers', { requiredHeaders: { 'content-security-policy': ['default-src', "'self'"] } });
  const matchingHeaderIssues = buildRoutePolicyIssues(page, headerPolicy, {
    robots: parseRobots(''), sitemapPaths: new Set(['/headers']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(hasPolicyFailure(matchingHeaderIssues), false);
  const absent = parseHtmlPage(`${SITE_ORIGIN}/headers`, html('/headers'), SITE_ORIGIN);
  const missingHeaderIssues = buildRoutePolicyIssues(absent, headerPolicy, {
    robots: parseRobots(''), sitemapPaths: new Set(['/headers']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(hasPolicyFailure(missingHeaderIssues), true);
  assert.equal(missingHeaderIssues.some((issue) => issue.category === 'required-header'), true);
});

test('credential-bearing canonical fails policy without retaining credentials in parsed data or issues', () => {
  const credentialMarkup = html('/canonical').replace(
    `${SITE_ORIGIN}/canonical`,
    'https://user:secret@example.com/canonical'
  );
  const page = parseHtmlPage(`${SITE_ORIGIN}/canonical`, credentialMarkup, SITE_ORIGIN);
  const issues = buildRoutePolicyIssues(page, policy('/canonical'), {
    robots: parseRobots(''), sitemapPaths: new Set(['/canonical']), siteOrigin: SITE_ORIGIN,
  });
  assert.equal(hasPolicyFailure(issues), true);
  assert.equal(JSON.stringify(page).includes('secret'), false);
  assert.equal(JSON.stringify(issues).includes('secret'), false);
});

test('shouldFailCi fails on critical or explicit policy issue and ignores editorial findings', () => {
  assert.equal(shouldFailCi({ issues: [{ severity: 'critical' }] }), true);
  assert.equal(shouldFailCi({ issues: [{ severity: 'low', ciFailure: true }] }), true);
  assert.equal(shouldFailCi({ issues: [{ severity: 'medium', category: 'titles' }, { severity: 'low', category: 'content-depth' }] }), false);
});

test('fetchText captures bounded redirects and sends no credentials or cookies', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/start')) return new Response('', { status: 302, headers: { location: '/final' } });
    return new Response('ok', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const response = await fetchText(`${SITE_ORIGIN}/start`, 500, { fetchImpl, allowedOrigins: [SITE_ORIGIN] });
  assert.equal(response.status, 200);
  assert.equal(response.url, `${SITE_ORIGIN}/final`);
  assert.equal(response.redirects.length, 1);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.init.redirect, 'manual');
    assert.equal(request.init.credentials, 'omit');
    const headers = new Headers(request.init.headers);
    assert.equal(headers.has('cookie'), false);
    assert.equal(headers.has('authorization'), false);
  }
});

test('fetchText rejects hostile redirect before requesting its destination and bounds loops', async () => {
  const requested = [];
  await assert.rejects(fetchText(`${SITE_ORIGIN}/start`, 500, {
    fetchImpl: async (url) => { requested.push(String(url)); return new Response('', { status: 302, headers: { location: 'https://attacker.invalid/steal' } }); },
    allowedOrigins: [SITE_ORIGIN],
  }), /origin policy/i);
  assert.equal(requested.length, 1);

  let count = 0;
  await assert.rejects(fetchText(`${SITE_ORIGIN}/loop`, 500, {
    maxRedirects: 2,
    fetchImpl: async () => { count += 1; return new Response('', { status: 302, headers: { location: '/loop' } }); },
    allowedOrigins: [SITE_ORIGIN],
  }), /redirect/i);
  assert.ok(count >= 1 && count <= 3, `redirect loop must stop within the configured bound; requests=${count}`);
});

test('fetchText rejects ambiguous slash and private paths before transport, including redirects', async () => {
  const unsafePaths = ['//account', '/%2fprofile', '/%252fprofile', '/account/profile'];
  for (const unsafePath of unsafePaths) {
    let requests = 0;
    await assert.rejects(fetchText(`${SITE_ORIGIN}${unsafePath}`, 500, {
      allowedOrigins: [SITE_ORIGIN],
      fetchImpl: async () => { requests += 1; return new Response('unexpected'); },
    }), /redirect target|origin policy/i, unsafePath);
    assert.equal(requests, 0, `unsafe path reached transport: ${unsafePath}`);
  }

  let redirectRequests = 0;
  await assert.rejects(fetchText(`${SITE_ORIGIN}/start`, 500, {
    allowedOrigins: [SITE_ORIGIN],
    fetchImpl: async () => {
      redirectRequests += 1;
      return new Response('', { status: 302, headers: { location: '/%252fprofile' } });
    },
  }), /redirect target|origin policy/i);
  assert.equal(redirectRequests, 1, 'unsafe redirect target must be rejected before a second request');
});

test('fetchText timeout covers a stalled body', async () => {
  await assert.rejects(fetchText(`${SITE_ORIGIN}/stall`, 20, {
    allowedOrigins: [SITE_ORIGIN],
    fetchImpl: async (_url, init) => ({ status: 200, ok: true, url: `${SITE_ORIGIN}/stall`, headers: new Headers(), text: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }) }),
  }), /timed out|timeout|abort/i);
});

test('fetchText total timeout covers a redirect response whose body cancellation stalls', async () => {
  let requests = 0;
  await assert.rejects(fetchText(`${SITE_ORIGIN}/redirect`, 20, {
    allowedOrigins: [SITE_ORIGIN],
    fetchImpl: async () => {
      requests += 1;
      return {
        status: 301,
        ok: false,
        headers: new Headers({ location: '/final' }),
        body: { cancel: () => new Promise(() => {}) },
      };
    },
  }), /timed out|timeout/i);
  assert.equal(requests, 1, 'the next redirect must not be fetched after cancellation stalls');
});

test('crawlSite reports forbidden, unknown and off-origin sitemap entries without fetching off-origin URLs', async () => {
  const fetched = [];
  const xml = `<urlset><url><loc>${SITE_ORIGIN}/known</loc></url><url><loc>${SITE_ORIGIN}/unknown</loc></url><url><loc>https://outside.invalid/x</loc></url></urlset>`;
  const fetchImpl = async (url) => {
    const value = String(url); fetched.push(value);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nDisallow: /known\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response(xml);
    return new Response(html(new URL(value).pathname));
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, maxPages: 10, config: {
    ...DEFAULT_CONFIG,
    priorityMappings: [],
    routePolicies: [policy('/known', { sitemap: 'forbidden' })],
  } });
  assert.equal(fetched.includes('https://outside.invalid/x'), false);
  assert.equal(fetched.includes(`${SITE_ORIGIN}/unknown`), true, 'unknown in-origin sitemap paths use the default public policy and are crawled');
  assert.equal(results.issues.some((issue) => issue.ciFailure === true), true);
  assert.equal(results.issues.some((issue) => issue.category === 'sitemap-policy' && /forbidden/i.test(issue.message || '')), true);
  assert.equal(results.issues.some((issue) => issue.category === 'crawl-policy'), true, 'blocked indexable public pages must fail the crawl policy');
  assert.equal(results.issues.some((issue) => /off-origin|outside/i.test(issue.message || '')), true);
});

test('crawlSite reports ambiguous sitemap slash paths and never fetches them', async () => {
  const badEntries = [`${SITE_ORIGIN}//account`, `${SITE_ORIGIN}/%2fprofile`];
  const fetched = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    fetched.push(value);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) {
      return new Response(`<urlset>${badEntries.map((entry) => `<url><loc>${entry}</loc></url>`).join('')}</urlset>`);
    }
    return new Response(html(new URL(value).pathname));
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: { ...DEFAULT_CONFIG, priorityMappings: [] } });
  for (const entry of badEntries) assert.equal(fetched.includes(entry), false, `unsafe sitemap path fetched: ${entry}`);
  assert.equal(results.issues.filter((issue) => issue.category === 'sitemap-url').length >= 2, true);
});

test('safe-shell response drops all body-derived fields before returning crawl results', async () => {
  const secret = 'Sensitive Account Holder Name sensitive.person@example.invalid';
  const markup = `<!doctype html><html><head><title>${secret}</title>
    <meta name="description" content="${secret}"><meta name="robots" content="noindex">
    <script type="application/ld+json">{"name":"${secret}"}</script>
  </head><body><h1>${secret}</h1><p>${secret}</p><a href="/private">${secret}</a></body></html>`;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response('<urlset></urlset>');
    return new Response(markup, { headers: { 'content-type': 'text/html' } });
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: {
    ...DEFAULT_CONFIG,
    priorityMappings: [],
    routePolicies: [policy('/suite/resume', {
      bodyClass: 'safe-shell', crawl: 'either', index: 'noindex', canonical: 'omitted', sitemap: 'forbidden',
    })],
  } });
  const page = results.pages.find((item) => item.path === '/suite/resume');
  assert.ok(page);
  for (const field of ['title', 'description', 'h1', 'firstParagraph', 'wordCount', 'text', 'jsonLd', 'links', 'dataHeavy', 'externalCitationCount']) {
    assert.equal(Object.hasOwn(page, field), false, `non-public page retained ${field}`);
  }
  assert.equal(JSON.stringify(page).includes(secret), false);
  assert.equal(JSON.stringify(results).includes(secret), false);
});

test('failed route fetch reports unavailable status as an em dash in Markdown', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response('<urlset></urlset>');
    throw new Error('fixture route unavailable');
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: {
    ...DEFAULT_CONFIG, priorityMappings: [], routePolicies: [policy('/unavailable', { sitemap: 'optional' })],
  } });
  const page = results.pages.find((item) => item.path === '/unavailable');
  assert.equal(page.status, null);
  const report = renderMarkdownReport(results);
  assert.match(report, /\| https:\/\/example\.com\/unavailable \| — \|/);
  assert.doesNotMatch(report, /\| https:\/\/example\.com\/unavailable \| null \|/);
});

test('named route policies are fetched even when sitemap sample maxPages is smaller', async () => {
  const fetchedPaths = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response(`<urlset><url><loc>${SITE_ORIGIN}/sample</loc></url></urlset>`);
    fetchedPaths.push(new URL(value).pathname);
    return new Response(html(new URL(value).pathname));
  };
  await crawlSite({ site: SITE_ORIGIN, fetchImpl, maxPages: 1, config: {
    ...DEFAULT_CONFIG, priorityMappings: [], routePolicies: [policy('/terms', { sitemap: 'forbidden' })],
  } });
  assert.deepEqual(fetchedPaths.sort(), ['/sample', '/terms']);
});

test('crawlSite flags sitemap redirects that terminate at HTTP 200', async () => {
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value.endsWith('/robots.txt')) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value.endsWith('/sitemap.xml')) return new Response(`<urlset><url><loc>${SITE_ORIGIN}/redirected</loc></url></urlset>`);
    if (value.endsWith('/redirected')) return new Response('', { status: 301, headers: { location: '/final' } });
    return new Response(html('/final'));
  };
  const results = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: { ...DEFAULT_CONFIG, priorityMappings: [] } });
  assert.equal(results.issues.some((issue) => issue.ciFailure === true && issue.category === 'sitemap-redirect'), true);
});

test('declared HTTP host probes allow only their declared source and audited final origin', async () => {
  const source = 'http://www.example.com/';
  const target = `${SITE_ORIGIN}/`;
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value === source) return new Response('', { status: 301, headers: { location: target } });
    if (value === `${SITE_ORIGIN}/robots.txt`) return new Response(`User-agent: *\nSitemap: ${SITE_ORIGIN}/sitemap.xml`);
    if (value === `${SITE_ORIGIN}/sitemap.xml`) return new Response('<urlset></urlset>');
    if (value === target) return new Response('ok');
    throw new Error(`Unexpected URL requested: ${value}`);
  };
  const check = { url: source, finalUrl: target, expectedRedirectStatus: [301, 308] };
  const valid = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: { ...DEFAULT_CONFIG, priorityMappings: [], redirectChecks: [check] } });
  assert.equal(valid.issues.some((issue) => issue.category === 'host-redirect' && issue.ciFailure), false);

  const wrongChain = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: {
    ...DEFAULT_CONFIG, priorityMappings: [], redirectChecks: [{ ...check, expectedRedirectStatus: [308] }],
  } });
  assert.equal(wrongChain.issues.some((issue) => issue.category === 'host-redirect' && issue.ciFailure), true);

  const wrongFinal = await crawlSite({ site: SITE_ORIGIN, fetchImpl, config: {
    ...DEFAULT_CONFIG, priorityMappings: [], redirectChecks: [{ ...check, finalUrl: `${SITE_ORIGIN}/elsewhere` }],
  } });
  assert.equal(wrongFinal.issues.some((issue) => issue.category === 'host-redirect' && issue.ciFailure), true);

  await assert.rejects(crawlSite({ site: SITE_ORIGIN, fetchImpl, config: {
    ...DEFAULT_CONFIG, priorityMappings: [], redirectChecks: [{ ...check, finalUrl: 'https://attacker.invalid/' }],
  } }), /redirectChecks/i);
});

test('editorial issues remain advisory in --ci while route policy failures set the CLI exit code', async (t) => {
  const server = http.createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`User-agent: *\nSitemap: http://127.0.0.1:${server.address().port}/sitemap.xml`);
    } else if (request.url === '/sitemap.xml') {
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.end(`<urlset><url><loc>http://127.0.0.1:${server.address().port}/thin</loc></url></urlset>`);
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      const pathname = request.url.split('?')[0];
      response.end(`<html><head><title>Tiny</title><link rel="canonical" href="http://127.0.0.1:${server.address().port}${pathname}"></head><body><h1>Tiny</h1></body></html>`);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'seo-audit-ci-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const configPath = path.join(temp, 'config.json');
  const outDir = path.join(temp, 'out');
  const baseConfig = { ...DEFAULT_CONFIG, siteUrl: origin, priorityMappings: [], routePolicies: [] };
  await fs.writeFile(configPath, JSON.stringify(baseConfig));
  const cliPath = path.join(__dirname, 'seo-audit.js');
  const success = await runCli([cliPath, '--ci', '--site', origin, '--config', configPath, '--out-dir', outDir]);
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.match(await fs.readFile(path.join(outDir, 'seo-audit-results.json'), 'utf8'), /"category": "titles"/);

  await fs.writeFile(configPath, JSON.stringify({ ...baseConfig, routePolicies: [policy('/thin', { canonical: '/different' })] }));
  const failure = await runCli([cliPath, '--ci', '--site', origin, '--config', configPath, '--out-dir', path.join(temp, 'failed')]);
  assert.equal(failure.status, 1, failure.stderr || failure.stdout);
});

test('CLI rejects a missing config file or missing routePolicies before making network requests', async (t) => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('unexpected network request');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'seo-audit-config-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const cliPath = path.join(__dirname, 'seo-audit.js');
  const missingConfig = path.join(temp, 'missing.json');

  const absent = await runCli([cliPath, '--ci', '--site', origin, '--config', missingConfig, '--out-dir', path.join(temp, 'absent-out')]);
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /configuration file is missing/i);
  assert.equal(requests, 0, 'missing config must fail before network access');

  const noPoliciesConfig = path.join(temp, 'without-route-policies.json');
  await fs.writeFile(noPoliciesConfig, JSON.stringify({ ...DEFAULT_CONFIG, siteUrl: origin, priorityMappings: [] }));
  const noPolicies = await runCli([cliPath, '--ci', '--site', origin, '--config', noPoliciesConfig, '--out-dir', path.join(temp, 'no-policies-out')]);
  assert.equal(noPolicies.status, 1);
  assert.match(noPolicies.stderr, /routePolicies/i);
  assert.equal(requests, 0, 'missing routePolicies must fail before network access');
});
