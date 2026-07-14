#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_CONFIG = {
  siteUrl: 'https://talentconsulting.io',
  thinContentWordThreshold: 250,
  minInternalLinks: 3,
  minInboundLinksForPriorityPages: 2,
  priorityMappings: [
    { query: 'free AI resume builder', targetPath: '/tools/resume-builder' },
    { query: 'free ATS analyzer', targetPath: '/tools/ats-analyzer' },
    { query: 'AI interview practice', targetPath: '/tools/interview-prep' },
    { query: 'software engineer resume example', targetPath: '/resume-examples/software-engineer' },
  ],
};

const SEVERITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'ai',
  'are',
  'by',
  'for',
  'free',
  'how',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function parseArgs(argv) {
  const args = {
    ci: false,
    config: path.join(process.cwd(), 'scripts', 'seo-audit.config.json'),
    outDir: path.join(process.cwd(), '.seo-audit'),
    timeoutMs: 15000,
    maxPages: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ci') {
      args.ci = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=');
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = rawValue ?? argv[i + 1];
      if (rawValue === undefined) i += 1;
      args[key] = value;
    }
  }

  args.timeoutMs = Number(args.timeoutMs || 15000);
  args.maxPages = Number(args.maxPages || 0);
  return args;
}

function trimTrailingSlash(value) {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

function normalizeSiteUrl(siteUrl) {
  const parsed = new URL(siteUrl);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = trimTrailingSlash(parsed.pathname || '/');
  return trimTrailingSlash(parsed.toString());
}

function absoluteUrl(siteUrl, inputPath = '/') {
  return new URL(inputPath, `${trimTrailingSlash(siteUrl)}/`).toString();
}

function canonicalizeUrl(value) {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') {
    parsed.pathname = trimTrailingSlash(parsed.pathname);
  }
  return parsed.toString();
}

function pathFromUrl(value) {
  const parsed = new URL(value);
  return parsed.pathname === '/' ? '/' : trimTrailingSlash(parsed.pathname);
}

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html = '') {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function getWordCount(text = '') {
  const words = text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g);
  return words ? words.length : 0;
}

function getAttrs(tag = '') {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function getTags(html, tagName) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(regex) || [];
}

function getTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function getMetaContent(html, attrName, attrValue) {
  const target = attrValue.toLowerCase();
  for (const tag of getTags(html, 'meta')) {
    const attrs = getAttrs(tag);
    if ((attrs[attrName] || '').toLowerCase() === target) {
      return attrs.content || '';
    }
  }
  return '';
}

function getCanonical(html, baseUrl) {
  for (const tag of getTags(html, 'link')) {
    const attrs = getAttrs(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && attrs.href) {
      try {
        return canonicalizeUrl(new URL(attrs.href, baseUrl).toString());
      } catch {
        return attrs.href;
      }
    }
  }
  return '';
}

function getHeadingTexts(html, heading) {
  const regex = new RegExp(`<${heading}\\b[^>]*>([\\s\\S]*?)<\\/${heading}>`, 'gi');
  const values = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (text) values.push(text);
  }
  return values;
}

function getParagraphTexts(html) {
  const regex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  const values = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (getWordCount(text) >= 8) values.push(text);
  }
  return values;
}

function getJsonLdBlocks(html) {
  const blocks = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = getAttrs(match[1]);
    if ((attrs.type || '').toLowerCase() === 'application/ld+json') {
      blocks.push(decodeHtml(match[2]).trim());
    }
  }
  return blocks;
}

function parseJsonLd(html) {
  const rawBlocks = getJsonLdBlocks(html);
  const parsed = [];
  const invalid = [];

  for (const raw of rawBlocks) {
    if (!raw) continue;
    try {
      parsed.push(JSON.parse(raw));
    } catch (error) {
      invalid.push({ raw: raw.slice(0, 160), error: error.message });
    }
  }

  return { count: parsed.length, parsed, invalid };
}

function extractLinks(html, baseUrl, siteOrigin) {
  const internal = new Set();
  const external = new Set();

  for (const tag of getTags(html, 'a')) {
    const attrs = getAttrs(tag);
    const href = attrs.href;
    if (!href || /^(mailto|tel|javascript):/i.test(href) || href.startsWith('#')) continue;

    try {
      const parsed = new URL(href, baseUrl);
      if (!/^https?:$/.test(parsed.protocol)) continue;
      const clean = canonicalizeUrl(parsed.toString());
      if (parsed.origin === siteOrigin) {
        internal.add(clean);
      } else {
        external.add(clean);
      }
    } catch {
      continue;
    }
  }

  return {
    internal: [...internal],
    external: [...external],
  };
}

function extractSitemapUrls(xml) {
  const urls = [];
  const regex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    urls.push(decodeHtml(match[1]).trim());
  }
  return urls;
}

function parseRobots(text = '') {
  const rules = {
    sitemap: [],
    allow: [],
    disallow: [],
  };
  let activeForStar = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'sitemap') {
      rules.sitemap.push(value);
      continue;
    }

    if (key === 'user-agent') {
      activeForStar = value === '*';
      continue;
    }

    if (!activeForStar) continue;
    if (key === 'allow') rules.allow.push(value || '/');
    if (key === 'disallow' && value) rules.disallow.push(value);
  }

  return rules;
}

function robotPatternMatches(pattern, pathname) {
  if (!pattern) return false;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp(`^${escaped}`).test(pathname);
}

function isPathBlockedByRobots(pathname, robots) {
  let longestAllow = 0;
  let longestDisallow = 0;

  for (const rule of robots.allow || []) {
    if (robotPatternMatches(rule, pathname)) longestAllow = Math.max(longestAllow, rule.length);
  }

  for (const rule of robots.disallow || []) {
    if (robotPatternMatches(rule, pathname)) longestDisallow = Math.max(longestDisallow, rule.length);
  }

  return longestDisallow > longestAllow;
}

function queryTokens(query) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenCoverage(text, query) {
  const tokens = queryTokens(query);
  if (!tokens.length) return 1;
  const haystack = text.toLowerCase();
  const matches = tokens.filter((token) => haystack.includes(token));
  return matches.length / tokens.length;
}

function hasDataClaims(text) {
  const numberClaim = /(\b\d{1,3}(?:\.\d+)?%|\$\s?\d|\b\d+(?:\.\d+)?\s?(?:x|times|hours|minutes|days|weeks|months|years|users|applications|interviews|companies|roles)\b)/i;
  const context = /(survey|study|data|according|report|research|found|rate|conversion|average|median|benchmark|statistics|candidates|recruiters|hiring managers)/i;
  return numberClaim.test(text) && context.test(text);
}

function isAnswerReady(page, query = '') {
  if (!page.h1.length) return false;
  const intro = page.firstParagraph || page.text.slice(0, 500);
  const introWordCount = getWordCount(intro);
  if (introWordCount < 18 || introWordCount > 120) return false;
  if (/^(loading|welcome|sign in|log in)/i.test(intro.trim())) return false;
  if (query && tokenCoverage(`${page.title} ${page.h1.join(' ')} ${intro}`, query) < 0.5) return false;
  return true;
}

function parseHtmlPage(url, html, siteOrigin) {
  const title = getTitle(html);
  const description = getMetaContent(html, 'name', 'description');
  const robotsMeta = getMetaContent(html, 'name', 'robots');
  const canonical = getCanonical(html, url);
  const h1 = getHeadingTexts(html, 'h1');
  const paragraphs = getParagraphTexts(html);
  const jsonLd = parseJsonLd(html);
  const links = extractLinks(html, url, siteOrigin);
  const text = stripTags(html);

  return {
    url: canonicalizeUrl(url),
    path: pathFromUrl(url),
    status: 200,
    title,
    description,
    robotsMeta,
    noindex: /(^|,|\s)noindex(,|\s|$)/i.test(robotsMeta),
    canonical,
    h1,
    firstParagraph: paragraphs[0] || '',
    wordCount: getWordCount(text),
    text,
    jsonLd,
    links,
    dataHeavy: hasDataClaims(text),
    externalCitationCount: links.external.length,
  };
}

function makeIssue(severity, category, fields) {
  return {
    severity,
    category,
    url: fields.url || '',
    query: fields.query || '',
    title: fields.title,
    message: fields.message,
    impact: fields.impact,
    recommendation: fields.recommendation,
  };
}

function buildPageIssues(page, context) {
  const issues = [];
  const { config, robots, priorityQuery = '' } = context;
  const isPriority = Boolean(priorityQuery);
  const pageLabel = page.url;

  if (isPathBlockedByRobots(page.path, robots)) {
    issues.push(
      makeIssue('critical', 'crawlability', {
        url: pageLabel,
        message: 'Sitemap URL is blocked by robots.txt.',
        impact: 'Search crawlers may not be allowed to fetch an indexable public page.',
        recommendation: 'Allow this path in robots.txt or remove it from the sitemap.',
      })
    );
  }

  if (page.noindex) {
    issues.push(
      makeIssue('critical', 'indexation', {
        url: pageLabel,
        message: 'Sitemap URL has a noindex robots directive.',
        impact: 'A page in the sitemap is explicitly telling crawlers not to index it.',
        recommendation: 'Remove noindex from public SEO pages or remove the URL from the sitemap.',
      })
    );
  }

  for (const invalid of page.jsonLd.invalid) {
    issues.push(
      makeIssue('critical', 'structured-data', {
        url: pageLabel,
        message: `Invalid JSON-LD: ${invalid.error}`,
        impact: 'Invalid structured data can prevent rich result and entity extraction.',
        recommendation: 'Fix the JSON-LD script so it parses as strict JSON.',
      })
    );
  }

  if (!page.title || page.title.length < 20 || page.title.length > 70) {
    issues.push(
      makeIssue('medium', 'titles', {
        url: pageLabel,
        message: `Weak title tag (${page.title.length} characters).`,
        impact: 'Titles that are missing, too short, or too long reduce search result clarity.',
        recommendation: 'Use a unique 20-70 character title that names the page intent.',
      })
    );
  }

  if (!page.description || page.description.length < 70 || page.description.length > 170) {
    issues.push(
      makeIssue('medium', 'descriptions', {
        url: pageLabel,
        message: `Weak meta description (${page.description.length} characters).`,
        impact: 'Weak descriptions can reduce snippet quality and click clarity.',
        recommendation: 'Use a unique 70-170 character description with the user outcome.',
      })
    );
  }

  if (!page.canonical) {
    issues.push(
      makeIssue('medium', 'canonical', {
        url: pageLabel,
        message: 'Missing canonical link.',
        impact: 'Canonical ambiguity can dilute indexation signals.',
        recommendation: 'Add a canonical URL through Next.js metadata alternates.',
      })
    );
  } else if (canonicalizeUrl(page.canonical) !== canonicalizeUrl(page.url)) {
    issues.push(
      makeIssue('medium', 'canonical', {
        url: pageLabel,
        message: `Canonical points to ${page.canonical}.`,
        impact: 'Unexpected canonical targets can consolidate ranking signals onto the wrong page.',
        recommendation: 'Confirm the canonical target is intentional for this public URL.',
      })
    );
  }

  if (!page.h1.length) {
    issues.push(
      makeIssue(isPriority ? 'high' : 'medium', 'page-intent', {
        url: pageLabel,
        message: 'Missing H1.',
        impact: 'The page intent is harder for users, crawlers, and answer engines to identify.',
        recommendation: 'Add one visible H1 that matches the page intent.',
      })
    );
  } else if (page.h1.length > 1) {
    issues.push(
      makeIssue('low', 'page-intent', {
        url: pageLabel,
        message: `Multiple H1s found (${page.h1.length}).`,
        impact: 'Multiple primary headings can blur page intent.',
        recommendation: 'Keep one H1 and demote secondary headings to H2/H3.',
      })
    );
  }

  if (page.wordCount < config.thinContentWordThreshold) {
    issues.push(
      makeIssue(isPriority ? 'high' : 'medium', 'content-depth', {
        url: pageLabel,
        message: `Thin content detected (${page.wordCount} words).`,
        impact: 'Thin pages are less likely to satisfy search intent or answer-engine extraction.',
        recommendation: 'Add concise answer-first copy, examples, FAQs, and internal links.',
      })
    );
  }

  if (page.links.internal.length < config.minInternalLinks) {
    issues.push(
      makeIssue(isPriority ? 'high' : 'medium', 'internal-links', {
        url: pageLabel,
        message: `Weak internal linking (${page.links.internal.length} internal links).`,
        impact: 'Sparse internal links reduce crawl paths and topical clustering.',
        recommendation: `Add at least ${config.minInternalLinks} relevant internal links to related tools or guides.`,
      })
    );
  }

  if (isPriority && !isAnswerReady(page, priorityQuery)) {
    issues.push(
      makeIssue('high', 'answer-first-content', {
        url: pageLabel,
        query: priorityQuery,
        message: 'Priority target lacks answer-ready opening content.',
        impact: 'AI answer engines need a clear, extractable answer near the top of the page.',
        recommendation: 'Add a direct 2-4 sentence intro that answers the mapped query before feature detail.',
      })
    );
  }

  if (isPriority && page.jsonLd.count === 0) {
    issues.push(
      makeIssue('low', 'structured-data', {
        url: pageLabel,
        message: 'Priority page has no JSON-LD.',
        impact: 'Structured data helps crawlers identify page type, breadcrumbs, FAQs, and software entities.',
        recommendation: 'Add relevant JSON-LD, such as BreadcrumbList, FAQPage, Article, or SoftwareApplication.',
      })
    );
  }

  if (page.dataHeavy && page.externalCitationCount === 0) {
    issues.push(
      makeIssue('medium', 'source-citations', {
        url: pageLabel,
        message: 'Numeric or research-style claims found without external citation links.',
        impact: 'Uncited claims are weaker for trust, E-E-A-T, and answer-engine citation confidence.',
        recommendation: 'Add source links near data-heavy claims or rewrite unsupported claims more cautiously.',
      })
    );
  }

  return issues;
}

function analyzePriorityMappings(config, pageByPath, sitemapPaths, inboundCounts) {
  const issues = [];

  for (const mapping of config.priorityMappings || []) {
    const targetPath = mapping.targetPath;
    const query = mapping.query;
    const page = pageByPath.get(targetPath);

    if (!sitemapPaths.has(targetPath)) {
      issues.push(
        makeIssue('high', 'query-map', {
          query,
          url: targetPath,
          message: 'Priority query target is absent from the sitemap.',
          impact: 'The target page may be harder for crawlers to discover and prioritize.',
          recommendation: 'Add the mapped target URL to the generated sitemap.',
        })
      );
    }

    if (!page || page.status !== 200) {
      continue;
    }

    const intentText = `${page.title} ${page.description} ${page.h1.join(' ')}`;
    if (tokenCoverage(intentText, query) < 0.5) {
      issues.push(
        makeIssue('high', 'page-intent', {
          query,
          url: page.url,
          message: 'Priority query does not clearly map to title, description, or H1.',
          impact: 'The page may not look like the best answer for its mapped query.',
          recommendation: 'Align the title, meta description, and H1 with the query intent using natural language.',
        })
      );
    }

    const inbound = inboundCounts.get(page.url) || 0;
    if (inbound < config.minInboundLinksForPriorityPages) {
      issues.push(
        makeIssue('high', 'internal-links', {
          query,
          url: page.url,
          message: `Priority page has low sitemap-page inbound links (${inbound}).`,
          impact: 'Priority pages need stronger internal discovery and topical support.',
          recommendation: `Add at least ${config.minInboundLinksForPriorityPages} contextual links from related public pages.`,
        })
      );
    }
  }

  return issues;
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => {
    const severityDelta = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (severityDelta) return severityDelta;
    const categoryDelta = a.category.localeCompare(b.category);
    if (categoryDelta) return categoryDelta;
    return (a.url || '').localeCompare(b.url || '');
  });
}

function countBySeverity(issues) {
  return Object.keys(SEVERITY_WEIGHT).reduce((counts, severity) => {
    counts[severity] = issues.filter((issue) => issue.severity === severity).length;
    return counts;
  }, {});
}

function summarize(results) {
  const issues = sortIssues(results.issues);
  const counts = countBySeverity(issues);
  return {
    generatedAt: results.generatedAt,
    siteUrl: results.siteUrl,
    pageCount: results.pages.length,
    issueCount: issues.length,
    counts,
    topRecommendation: issues[0] || null,
  };
}

function renderMarkdownReport(results) {
  const summary = summarize(results);
  const lines = [];
  lines.push('# SEO/GEO Audit Report');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Site: ${summary.siteUrl}`);
  lines.push(`Pages crawled: ${summary.pageCount}`);
  lines.push('');
  lines.push('This audit is deterministic and report-only. It does not call Codex, LLM APIs, search engines, or AI answer engines.');
  lines.push('');
  lines.push('## Top Recommended Fix');
  lines.push('');
  if (summary.topRecommendation) {
    const issue = summary.topRecommendation;
    lines.push(`- **${issue.severity.toUpperCase()} / ${issue.category}**: ${issue.message}`);
    if (issue.url) lines.push(`  - URL: ${issue.url}`);
    if (issue.query) lines.push(`  - Query: ${issue.query}`);
    lines.push(`  - Impact: ${issue.impact}`);
    lines.push(`  - Recommendation: ${issue.recommendation}`);
  } else {
    lines.push('- No high-impact gap left to fix.');
  }
  lines.push('');
  lines.push('## Scorecard');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | ---: |');
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    lines.push(`| ${severity} | ${summary.counts[severity]} |`);
  }
  lines.push('');
  lines.push('## Priority Query Map');
  lines.push('');
  lines.push('| Query | Target | Status |');
  lines.push('| --- | --- | --- |');
  for (const mapping of results.config.priorityMappings || []) {
    const targetUrl = absoluteUrl(results.siteUrl, mapping.targetPath);
    const page = results.pages.find((item) => item.url === canonicalizeUrl(targetUrl));
    lines.push(`| ${mapping.query} | ${mapping.targetPath} | ${page ? page.status : 'missing'} |`);
  }
  lines.push('');
  lines.push('## Ranked Gaps');
  lines.push('');
  if (!results.issues.length) {
    lines.push('No issues found.');
  } else {
    for (const issue of sortIssues(results.issues).slice(0, 75)) {
      lines.push(`- **${issue.severity.toUpperCase()} / ${issue.category}** ${issue.message}`);
      if (issue.url) lines.push(`  - URL: ${issue.url}`);
      if (issue.query) lines.push(`  - Query: ${issue.query}`);
      lines.push(`  - Recommendation: ${issue.recommendation}`);
    }
  }
  lines.push('');
  lines.push('## Page Metrics');
  lines.push('');
  lines.push('| URL | Status | Words | Internal Links | JSON-LD | Title |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const page of results.pages) {
    lines.push(
      `| ${page.url} | ${page.status} | ${page.wordCount || 0} | ${(page.links && page.links.internal.length) || 0} | ${(page.jsonLd && page.jsonLd.count) || 0} | ${(page.title || '').replace(/\|/g, '\\|')} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function readConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT') return DEFAULT_CONFIG;
    throw error;
  }
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TalentConsulting-SEO-Audit/1.0 (+https://talentconsulting.io)',
        Accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      contentType: response.headers.get('content-type') || '',
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlSite(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const siteUrl = normalizeSiteUrl(options.site || config.siteUrl);
  const siteOrigin = new URL(siteUrl).origin;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const issues = [];
  const pages = [];

  const robotsUrl = absoluteUrl(siteUrl, '/robots.txt');
  const sitemapUrl = absoluteUrl(siteUrl, '/sitemap.xml');
  let robots = parseRobots('');
  let sitemapUrls = [];

  try {
    const robotsResponse = await fetchText(robotsUrl, timeoutMs);
    if (!robotsResponse.ok) {
      issues.push(
        makeIssue('critical', 'crawlability', {
          url: robotsUrl,
          message: `robots.txt returned HTTP ${robotsResponse.status}.`,
          impact: 'Crawlers may not receive crawl policy or sitemap discovery hints.',
          recommendation: 'Ensure /robots.txt returns 200 and includes the sitemap URL.',
        })
      );
    } else {
      robots = parseRobots(robotsResponse.text);
      if (!robots.sitemap.some((url) => url === sitemapUrl)) {
        issues.push(
          makeIssue('medium', 'crawlability', {
            url: robotsUrl,
            message: 'robots.txt does not list the default sitemap URL.',
            impact: 'Search engines can still discover the sitemap, but the crawl hint is weaker.',
            recommendation: `Add "Sitemap: ${sitemapUrl}" to robots.txt.`,
          })
        );
      }
    }
  } catch (error) {
    issues.push(
      makeIssue('critical', 'crawlability', {
        url: robotsUrl,
        message: `Failed to fetch robots.txt: ${error.message}`,
        impact: 'Crawl policy could not be verified.',
        recommendation: 'Confirm the site is reachable and /robots.txt is served.',
      })
    );
  }

  try {
    const sitemapResponse = await fetchText(sitemapUrl, timeoutMs);
    if (!sitemapResponse.ok) {
      issues.push(
        makeIssue('critical', 'crawlability', {
          url: sitemapUrl,
          message: `sitemap.xml returned HTTP ${sitemapResponse.status}.`,
          impact: 'Search engines may miss public URLs.',
          recommendation: 'Ensure /sitemap.xml returns 200 and contains public canonical URLs.',
        })
      );
    } else {
      sitemapUrls = extractSitemapUrls(sitemapResponse.text)
        .map((url) => {
          try {
            return canonicalizeUrl(url);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .filter((url) => new URL(url).origin === siteOrigin);
    }
  } catch (error) {
    issues.push(
      makeIssue('critical', 'crawlability', {
        url: sitemapUrl,
        message: `Failed to fetch sitemap.xml: ${error.message}`,
        impact: 'Public URL inventory could not be crawled.',
        recommendation: 'Confirm the site is reachable and /sitemap.xml is served.',
      })
    );
  }

  const maxPages = Number(options.maxPages || 0);
  const urlsToCrawl = maxPages > 0 ? sitemapUrls.slice(0, maxPages) : sitemapUrls;
  const priorityByPath = new Map((config.priorityMappings || []).map((item) => [item.targetPath, item.query]));

  for (const url of urlsToCrawl) {
    try {
      const response = await fetchText(url, timeoutMs);
      if (response.status !== 200) {
        pages.push({ url, path: pathFromUrl(url), status: response.status });
        issues.push(
          makeIssue('critical', 'crawlability', {
            url,
            message: `Public sitemap URL returned HTTP ${response.status}.`,
            impact: 'A public URL in the sitemap is not cleanly crawlable.',
            recommendation: 'Fix the route response or remove the URL from the sitemap.',
          })
        );
        continue;
      }

      const page = parseHtmlPage(url, response.text, siteOrigin);
      page.status = response.status;
      page.finalUrl = response.url;
      pages.push(page);
      issues.push(
        ...buildPageIssues(page, {
          config,
          robots,
          priorityQuery: priorityByPath.get(page.path) || '',
        })
      );
    } catch (error) {
      pages.push({ url, path: pathFromUrl(url), status: 0, error: error.message });
      issues.push(
        makeIssue('critical', 'crawlability', {
          url,
          message: `Failed to fetch sitemap URL: ${error.message}`,
          impact: 'A public URL in the sitemap could not be audited.',
          recommendation: 'Confirm the route is reachable from CI and production.',
        })
      );
    }
  }

  const pageByPath = new Map(pages.filter((page) => page.path).map((page) => [page.path, page]));
  const sitemapPaths = new Set(sitemapUrls.map(pathFromUrl));
  const pageUrlSet = new Set(pages.map((page) => page.url));
  const inboundCounts = new Map(pages.map((page) => [page.url, 0]));

  for (const page of pages) {
    for (const link of (page.links && page.links.internal) || []) {
      if (link !== page.url && pageUrlSet.has(link)) {
        inboundCounts.set(link, (inboundCounts.get(link) || 0) + 1);
      }
    }
  }

  issues.push(...analyzePriorityMappings(config, pageByPath, sitemapPaths, inboundCounts));

  return {
    generatedAt: new Date().toISOString(),
    siteUrl,
    config,
    robots: {
      sitemap: robots.sitemap,
      allowCount: robots.allow.length,
      disallowCount: robots.disallow.length,
    },
    sitemap: {
      url: sitemapUrl,
      count: sitemapUrls.length,
    },
    pages,
    issues: sortIssues(issues),
  };
}

async function writeReports(results, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'seo-audit-results.json');
  const markdownPath = path.join(outDir, 'seo-audit-summary.md');
  await fs.writeFile(jsonPath, `${JSON.stringify({ ...results, summary: summarize(results) }, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, renderMarkdownReport(results), 'utf8');
  return { jsonPath, markdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fileConfig = await readConfig(args.config);
  const config = {
    ...fileConfig,
    siteUrl: args.site || fileConfig.siteUrl,
  };

  const results = await crawlSite({
    config,
    site: config.siteUrl,
    timeoutMs: args.timeoutMs,
    maxPages: args.maxPages,
  });

  const paths = await writeReports(results, args.outDir);
  const summary = summarize(results);
  console.log(`SEO/GEO audit complete for ${summary.siteUrl}`);
  console.log(`Pages crawled: ${summary.pageCount}`);
  console.log(`Issues: ${summary.issueCount} (critical ${summary.counts.critical}, high ${summary.counts.high}, medium ${summary.counts.medium}, low ${summary.counts.low})`);
  console.log(`Summary: ${paths.markdownPath}`);
  console.log(`JSON: ${paths.jsonPath}`);

  if (args.ci && summary.counts.critical > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_CONFIG,
  analyzePriorityMappings,
  buildPageIssues,
  canonicalizeUrl,
  crawlSite,
  extractSitemapUrls,
  hasDataClaims,
  isAnswerReady,
  isPathBlockedByRobots,
  parseArgs,
  parseHtmlPage,
  parseRobots,
  renderMarkdownReport,
  summarize,
  tokenCoverage,
};
