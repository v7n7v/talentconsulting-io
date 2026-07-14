const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_CONFIG,
  analyzePriorityMappings,
  buildPageIssues,
  extractSitemapUrls,
  parseHtmlPage,
  parseRobots,
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
