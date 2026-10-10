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
  let parsed;
  try {
    rawAbsoluteUrlPath(siteUrl, 'SEO audit site URL');
    parsed = new URL(siteUrl);
  } catch { throw new Error('SEO audit site URL must be a safe HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    throw new Error('SEO audit site URL must be an HTTP(S) origin without credentials, path, query, or fragment.');
  }
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

const POLICY_BODY_CLASSES = new Set(['public-content', 'safe-shell', 'protected-error', 'not-found']);
const SAFE_HEADER_NAMES = new Set(['content-type', 'x-robots-tag', 'cache-control', 'x-content-type-options', 'strict-transport-security', 'content-security-policy', 'referrer-policy', 'x-frame-options']);

function validateSafePath(rawPath, label = 'path') {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//') || /[?#\\\u0000-\u001f]/.test(rawPath)) {
    throw new Error(`${label} must be a safe root-relative path.`);
  }
  let decoded = rawPath;
  for (let round = 0; round < 4; round += 1) {
    if (/%(?:25)*(?:2f|5c)/i.test(decoded)) throw new Error(`${label} cannot contain encoded path separators.`);
    let next;
    try { next = decodeURIComponent(decoded); } catch { throw new Error(`${label} has invalid encoding.`); }
    if (next === decoded) break;
    decoded = next;
  }
  if (/%[0-9a-f]{2}/i.test(decoded) || decoded.startsWith('//') || decoded.includes('//') || decoded.includes('\\') || /[?#\u0000-\u001f]/.test(decoded) || decoded.split('/').some((part) => part === '.' || part === '..') || /[*]/.test(decoded)) {
    throw new Error(`${label} cannot contain traversal, ambiguous separators, wildcards, or control characters.`);
  }
  if (/^\/(?:api|account|profile|users|user)(?:\/|$)/i.test(decoded)) throw new Error(`${label} cannot target private or API paths.`);
  return decoded;
}

function rawAbsoluteUrlPath(value, label) {
  const match = String(value).match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i);
  if (!match) throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  const pathname = match[1] || '/';
  validateSafePath(pathname, `${label} path`);
  return pathname;
}

function validateRedirectLocation(location, currentUrl) {
  const raw = String(location);
  if (/[?#\u0000-\u001f]/.test(raw) || raw.includes('\\')) throw new Error('Redirect target rejected by the anonymous audit origin policy.');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    rawAbsoluteUrlPath(raw, 'Redirect target');
  } else if (raw.startsWith('//')) {
    const match = raw.match(/^\/\/[^/]*(\/[^?#]*)?$/);
    if (!match) throw new Error('Redirect target rejected by the anonymous audit origin policy.');
    validateSafePath(match[1] || '/', 'Redirect target path');
  } else if (raw.startsWith('/')) {
    validateSafePath(raw, 'Redirect target path');
  } else {
    const current = new URL(currentUrl);
    const parent = current.pathname.slice(0, current.pathname.lastIndexOf('/') + 1);
    validateSafePath(`${parent}${raw}`, 'Redirect target path');
  }
}

function validateRootPath(value, label = 'path') {
  try { validateSafePath(value, `Route policy ${label}`); } catch (error) { throw new Error(error.message); }
  return value === '/' ? '/' : value.replace(/\/+$/, '');
}

function validateRoutePolicies(policies) {
  if (!Array.isArray(policies)) throw new Error('routePolicies must be an array.');
  const seen = new Set();
  return policies.map((policy, index) => {
    const prefix = `routePolicies[${index}]`;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error(`${prefix} must be an object.`);
    const pathValue = validateRootPath(policy.path, 'path');
    if (seen.has(pathValue)) throw new Error(`Duplicate route policy path: ${pathValue}`);
    seen.add(pathValue);
    if (!Array.isArray(policy.expectedStatus) || !policy.expectedStatus.length || policy.expectedStatus.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) {
      throw new Error(`${prefix}.expectedStatus must be a non-empty array of HTTP status codes.`);
    }
    if (!POLICY_BODY_CLASSES.has(policy.bodyClass)) throw new Error(`${prefix}.bodyClass is invalid.`);
    if (!['allowed', 'blocked', 'either'].includes(policy.crawl)) throw new Error(`${prefix}.crawl must be allowed, blocked, or either.`);
    if (!['index', 'noindex', 'none'].includes(policy.index)) throw new Error(`${prefix}.index must be index, noindex, or none.`);
    if (!['self', 'omitted', 'ignore'].includes(policy.canonical)) {
      validateRootPath(policy.canonical, 'canonical');
    }
    if (!['required', 'forbidden', 'optional'].includes(policy.sitemap)) throw new Error(`${prefix}.sitemap is invalid.`);
    if (policy.requiredHeaders !== undefined) {
      if (!policy.requiredHeaders || typeof policy.requiredHeaders !== 'object' || Array.isArray(policy.requiredHeaders)) throw new Error(`${prefix}.requiredHeaders must be an object.`);
      for (const [name, tokens] of Object.entries(policy.requiredHeaders)) {
        if (!SAFE_HEADER_NAMES.has(name.toLowerCase())) throw new Error(`${prefix}.requiredHeaders contains an unsupported or unsafe header name.`);
        if (!Array.isArray(tokens) || !tokens.length || tokens.some((token) => typeof token !== 'string' || !token.trim())) throw new Error(`${prefix}.requiredHeaders values must be non-empty arrays of non-empty tokens.`);
      }
    }
    const statuses = policy.expectedStatus;
    if (policy.bodyClass === 'public-content' && statuses.some((status) => status < 200 || status >= 300)) throw new Error(`${prefix} public-content requires 2xx expected statuses.`);
    if (policy.bodyClass === 'public-content' && policy.index === 'none') throw new Error(`${prefix} public-content cannot use index:none.`);
    if (policy.bodyClass === 'safe-shell' && statuses.some((status) => status < 200 || status >= 300)) throw new Error(`${prefix} safe-shell requires 2xx expected statuses.`);
    if (policy.bodyClass === 'safe-shell' && (policy.index !== 'noindex' || policy.sitemap !== 'forbidden')) throw new Error(`${prefix} safe-shell requires noindex and forbidden sitemap membership.`);
    if (policy.bodyClass === 'protected-error' && statuses.some((status) => ![401, 403].includes(status))) throw new Error(`${prefix} protected-error requires expected status 401 or 403.`);
    if (policy.bodyClass === 'protected-error' && (policy.index === 'index' || policy.sitemap === 'required')) throw new Error(`${prefix} protected-error cannot be indexable or required in the sitemap.`);
    if (policy.bodyClass === 'not-found' && statuses.some((status) => ![404, 410].includes(status))) throw new Error(`${prefix} not-found requires expected status 404 or 410.`);
    if (policy.bodyClass === 'not-found' && (policy.index === 'index' || policy.sitemap === 'required')) throw new Error(`${prefix} not-found cannot be indexable or required in the sitemap.`);
    return { ...policy, path: pathValue, expectedStatus: [...new Set(statuses)].sort((a, b) => a - b) };
  });
}

function validateRedirectChecks(checks, siteOrigin) {
  if (!Array.isArray(checks)) throw new Error('redirectChecks must be an array.');
  return checks.map((check, index) => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) throw new Error(`redirectChecks[${index}] must be an object.`);
    let source;
    let target;
    try {
      rawAbsoluteUrlPath(check.url, `redirectChecks[${index}] source`);
      rawAbsoluteUrlPath(check.finalUrl, `redirectChecks[${index}] target`);
      source = new URL(check.url);
      target = new URL(check.finalUrl);
    } catch { throw new Error(`redirectChecks[${index}] contains an invalid URL.`); }
    const statuses = check.expectedRedirectStatus;
    if (!['http:', 'https:'].includes(source.protocol) || !['http:', 'https:'].includes(target.protocol) || source.username || source.password || target.username || target.password || source.search || source.hash || target.search || target.hash || target.origin !== siteOrigin || !Array.isArray(statuses) || !statuses.length || statuses.some((status) => ![301, 308].includes(status))) {
      throw new Error(`redirectChecks[${index}] is invalid or does not terminate at the audited site origin.`);
    }
    return { ...check, url: source.toString(), finalUrl: target.toString(), expectedRedirectStatus: [...new Set(statuses)] };
  });
}

function policyIssue(category, message, page, ciFailure = true, severity = 'critical') {
  return { ...makeIssue(severity, category, { url: page && (page.url || page.path) || '', message, impact: 'The route does not match its declared crawl or metadata policy.', recommendation: 'Correct the route policy or the route response so they agree.' }), ciFailure };
}

function buildRoutePolicyIssues(page, policy, context = {}) {
  const issues = [];
  const url = page.url || page.finalUrl || absoluteUrl(context.siteOrigin || 'https://invalid.local', policy.path);
  const sitemapPaths = context.sitemapPaths || new Set();
  const inSitemap = page.inSitemap === true || sitemapPaths.has(policy.path);
  const actualStatus = Number(page.status || 0);
  const statusExpected = policy.expectedStatus.includes(actualStatus);
  if (!statusExpected) issues.push(policyIssue('route-status', `Expected HTTP ${policy.expectedStatus.join(' or ')}, received ${actualStatus}.`, { ...page, url }));

  if (policy.sitemap === 'required' && !inSitemap) issues.push(policyIssue('sitemap-policy', 'Route is required in the sitemap but is absent.', { ...page, url }));
  if (policy.sitemap === 'forbidden' && inSitemap) issues.push(policyIssue('sitemap-policy', 'Route is forbidden from the sitemap but is present.', { ...page, url }));
  const isRedirected = (page.redirects || []).length > 0 || (page.finalUrl && canonicalizeUrl(page.finalUrl) !== canonicalizeUrl(page.url || page.finalUrl));
  if (inSitemap && isRedirected) issues.push(policyIssue('sitemap-redirect', 'Sitemap route redirects before reaching its terminal response.', { ...page, url }));

  const robots = context.robots || { allow: [], disallow: [] };
  const blocked = isPathBlockedByRobots(policy.path, robots);
  if (policy.crawl === 'allowed' && blocked) issues.push(policyIssue('crawl-policy', 'Route is blocked by robots.txt but crawl is allowed by policy.', { ...page, url }));
  if (policy.crawl === 'blocked' && !blocked) issues.push(policyIssue('crawl-policy', 'Route is not blocked by robots.txt as required by policy.', { ...page, url }));
  if (policy.index === 'noindex' && !page.noindex) issues.push(policyIssue('index-policy', 'Route is missing its required effective noindex directive.', { ...page, url }));
  if (policy.index === 'index' && page.noindex && policy.bodyClass === 'public-content') issues.push(policyIssue('index-policy', 'Indexable public route has an effective noindex directive.', { ...page, url }));
  if (policy.bodyClass === 'safe-shell' && policy.index === 'noindex' && blocked) {
    issues.push(policyIssue('visibility-advisory', 'Robots blocking prevents crawlers from observing this route’s noindex directive.', { ...page, url }, false, 'low'));
  }

  const canonicalUrls = page.canonicalUrls || (page.canonical ? [page.canonical] : []);
  const uniqueCanonicals = [...new Set(canonicalUrls.map((value) => {
    try { return canonicalizeUrl(new URL(value, url).toString()); } catch { return value; }
  }))];
  if (page.canonicalConflict || uniqueCanonicals.length > 1) issues.push(policyIssue('canonical-policy', 'Conflicting canonical targets are present.', { ...page, url }));
  else if (canonicalUrls.length > 1) issues.push(policyIssue('canonical-advisory', 'The same canonical target is repeated.', { ...page, url }, false, 'low'));
  if (page.canonicalUnsafe && (policy.bodyClass === 'public-content' || policy.canonical === 'self')) issues.push(policyIssue('canonical-policy', 'Canonical target contains credentials or uses an unsupported scheme.', { ...page, url }));
  if (policy.canonical !== 'ignore') {
    const expectedCanonical = policy.canonical === 'self'
      ? canonicalizeUrl(page.url || absoluteUrl(context.siteOrigin, policy.path))
      : policy.canonical === 'omitted' ? '' : canonicalizeUrl(absoluteUrl(context.siteOrigin, policy.canonical));
    const actualCanonical = uniqueCanonicals[0] || '';
    if (policy.canonical === 'omitted' && actualCanonical) issues.push(policyIssue('canonical-policy', 'Route should omit its canonical link.', { ...page, url }));
    else if (policy.canonical !== 'omitted' && (actualCanonical !== expectedCanonical || page.canonicalQueryPresent)) issues.push(policyIssue('canonical-policy', actualCanonical ? 'Canonical target does not match the configured route target.' : 'Route is missing its required canonical link.', { ...page, url }));
    if (actualCanonical && context.siteOrigin && (policy.bodyClass === 'public-content' || policy.canonical === 'self')) {
      let targetOrigin = '';
      try { targetOrigin = new URL(actualCanonical).origin; } catch { /* the mismatch above already reports an invalid target */ }
      if (targetOrigin !== context.siteOrigin) issues.push(policyIssue('canonical-policy', 'Public route canonical points off the audited site origin.', { ...page, url }));
    }
  }

  const headers = page.headers || {};
  for (const [name, tokens] of Object.entries(policy.requiredHeaders || {})) {
    const actual = String(headers[name.toLowerCase()] || headers[name] || '');
    const actualTokens = actual.toLowerCase().split(/[;,\s]+/).filter(Boolean);
    if (tokens.some((token) => !actualTokens.includes(token.toLowerCase()))) issues.push(policyIssue('required-header', `Required header ${name} is missing a configured token.`, { ...page, url }));
  }
  return issues;
}

function shouldFailCi(results) {
  return (results.issues || []).some((issue) => issue.severity === 'critical' || issue.ciFailure === true);
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

function documentHtml(html = '') {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
}

function getCanonicalUrls(html, baseUrl) {
  const urls = [];
  for (const tag of getTags(html, 'link')) {
    const attrs = getAttrs(tag);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (!rel.includes('canonical') || !attrs.href) continue;
    try {
      const parsed = new URL(attrs.href, baseUrl);
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      urls.push(canonicalizeUrl(parsed.toString()));
    } catch {
      urls.push('[invalid-canonical]');
    }
  }
  return urls;
}

function getCanonicalState(html, baseUrl) {
  const targets = [];
  let queryPresent = false;
  let unsafe = false;
  for (const tag of getTags(html, 'link')) {
    const attrs = getAttrs(tag);
    if (!(attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical') || !attrs.href) continue;
    try {
      const parsed = new URL(attrs.href, baseUrl);
      queryPresent ||= Boolean(parsed.search);
      unsafe ||= Boolean(parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol));
      parsed.hash = '';
      targets.push(canonicalizeUrl(parsed.toString()));
    } catch {
      targets.push(attrs.href);
    }
  }
  return { queryPresent, unsafe, conflict: new Set(targets).size > 1 };
}

function parseDirectiveList(value) {
  return String(value || '').toLowerCase().split(/[;,]/).map((part) => part.trim()).filter(Boolean);
}

function collectRobotsDirectives(html, xRobotsTag = '') {
  const directives = [];
  for (const tag of getTags(html, 'meta')) {
    const attrs = getAttrs(tag);
    const name = (attrs.name || '').toLowerCase();
    if (name === 'robots' || name === 'googlebot') {
      directives.push({ source: 'meta', agent: name, directives: parseDirectiveList(attrs.content) });
    }
  }
  const headers = Array.isArray(xRobotsTag) ? xRobotsTag : [xRobotsTag];
  for (const header of headers) {
    for (const piece of String(header || '').split(/\r?\n/)) {
      let activeAgent = '*';
      let activeValues = [];
      const flush = () => {
        if (activeValues.length) directives.push({ source: 'header', agent: activeAgent, directives: activeValues });
        activeValues = [];
      };
      for (const segment of piece.split(',')) {
        const trimmed = segment.trim();
        const scoped = trimmed.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/i);
        const parameterDirective = scoped && /^(max-snippet|max-image-preview|max-video-preview|unavailable_after)$/i.test(scoped[1]);
        if (scoped && !parameterDirective) {
          flush();
          activeAgent = scoped[1].toLowerCase();
          activeValues = parseDirectiveList(scoped[2]);
        } else if (scoped) {
          activeValues.push(`${scoped[1].toLowerCase()}: ${scoped[2].trim()}`);
        } else {
          activeValues.push(...parseDirectiveList(segment));
        }
      }
      flush();
    }
  }
  return directives;
}

function isEffectivelyNoindex(directives) {
  return directives.some(({ agent, directives: values }) =>
    (agent === '*' || agent === 'robots' || agent === 'googlebot') && values.some((item) => /^(noindex|none)$/.test(item))
  );
}

function parseHtmlPage(url, html, siteOrigin, response = {}) {
  const realHtml = documentHtml(html);
  const title = getTitle(realHtml);
  const description = getMetaContent(realHtml, 'name', 'description');
  const canonicalUrls = getCanonicalUrls(realHtml, url);
  const canonicalState = getCanonicalState(realHtml, url);
  const canonical = canonicalUrls[0] || '';
  const headerEntries = Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), value]);
  const xRobotsTag = response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('x-robots-tag') || ''
    : (headerEntries.find(([key]) => key === 'x-robots-tag') || [])[1] || '';
  const robotsDirectives = collectRobotsDirectives(realHtml, xRobotsTag);
  const robotsMeta = getMetaContent(realHtml, 'name', 'robots');
  const capturedHeaders = safeHeaders(response.headers);
  if (response.contentType && !capturedHeaders['content-type']) capturedHeaders['content-type'] = response.contentType;
  const h1 = getHeadingTexts(html, 'h1');
  const paragraphs = getParagraphTexts(html);
  const jsonLd = parseJsonLd(html);
  const links = extractLinks(html, url, siteOrigin);
  const text = stripTags(html);

  return {
    url: canonicalizeUrl(url),
    path: pathFromUrl(url),
    status: response.status == null ? 200 : Number(response.status),
    title,
    description,
    robotsMeta,
    noindex: isEffectivelyNoindex(robotsDirectives),
    canonical,
    canonicalUrls,
    canonicalQueryPresent: canonicalState.queryPresent,
    canonicalUnsafe: canonicalState.unsafe,
    canonicalConflict: canonicalState.conflict,
    robotsDirectives,
    headers: capturedHeaders,
    redirects: Array.isArray(response.redirects) ? response.redirects : [],
    finalUrl: response.finalUrl || response.url || canonicalizeUrl(url),
    inSitemap: Boolean(response.inSitemap),
    bodyClass: response.bodyClass || '',
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
        impact: 'Structured data can help crawlers identify page type and breadcrumbs.',
        recommendation: 'Add relevant JSON-LD, such as BreadcrumbList, Article, or SoftwareApplication.',
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

    if (page && page.bodyClass && page.bodyClass !== 'public-content') continue;

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
    const urlDelta = (a.url || '').localeCompare(b.url || '');
    if (urlDelta) return urlDelta;
    return (a.message || '').localeCompare(b.message || '');
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
  lines.push('This audit is deterministic and uses anonymous HTTP requests only. It does not call Codex, LLM APIs, search engines, or AI answer engines.');
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
    const words = Number.isFinite(page.wordCount) ? page.wordCount : '—';
    const internalLinks = page.links ? page.links.internal.length : '—';
    const jsonLdCount = page.jsonLd ? page.jsonLd.count : '—';
    const title = (page.title || '—').replace(/\|/g, '\\|');
    lines.push(
      `| ${page.url} | ${page.status ?? '—'} | ${words} | ${internalLinks} | ${jsonLdCount} | ${title} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function readConfig(configPath) {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.routePolicies)) {
      throw new Error('SEO audit configuration must explicitly define routePolicies as an array.');
    }
    if (parsed.redirectChecks !== undefined && !Array.isArray(parsed.redirectChecks)) throw new Error('SEO audit redirectChecks must be an array.');
    validateRoutePolicies(parsed.routePolicies);
    const config = { ...DEFAULT_CONFIG, ...parsed };
    const siteUrl = normalizeSiteUrl(config.siteUrl);
    validateRedirectChecks(config.redirectChecks || [], new URL(siteUrl).origin);
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('SEO audit configuration file is missing.');
    throw error;
  }
}

function safeHeaders(responseHeaders) {
  const headers = {};
  for (const name of SAFE_HEADER_NAMES) {
    const value = responseHeaders && typeof responseHeaders.get === 'function'
      ? responseHeaders.get(name)
      : responseHeaders && Object.entries(responseHeaders).find(([key]) => key.toLowerCase() === name)?.[1];
    if (value) headers[name] = String(value).slice(0, 2048);
  }
  return headers;
}

function checkedUrl(value, allowedOrigins) {
  const raw = String(value);
  const rawMatch = raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i);
  const rawPath = rawMatch && rawMatch[1] ? rawMatch[1] : '/';
  try { validateSafePath(rawPath, 'Redirect target path'); } catch { throw new Error('Redirect target rejected by the anonymous audit origin policy.'); }
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Unsupported or invalid redirect URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !allowedOrigins.has(parsed.origin)) {
    throw new Error('Redirect target rejected by the anonymous audit origin policy.');
  }
  return parsed;
}

async function fetchText(url, timeoutMs, options = {}) {
  const controller = new AbortController();
  let timeoutReject;
  const timeoutMsBounded = Math.max(1, Number(timeoutMs) || 15000);
  const timeoutPromise = new Promise((_, reject) => { timeoutReject = reject; });
  const timeout = setTimeout(() => {
    controller.abort();
    timeoutReject(new Error('Request timed out.'));
  }, timeoutMsBounded);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let allowedOrigins;
  const maxRedirects = Math.min(5, Math.max(0, Number.isInteger(options.maxRedirects) ? options.maxRedirects : 5));
  const redirects = [];
  try {
    allowedOrigins = new Set(options.allowedOrigins || [new URL(url).origin]);
    let currentUrl = checkedUrl(url, allowedOrigins).toString();
    const seen = new Set();
    let response;
    while (true) {
      if (seen.has(currentUrl)) throw new Error('Redirect loop detected.');
      seen.add(currentUrl);
      response = await Promise.race([fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'User-Agent': 'TalentConsulting-SEO-Audit/1.0 (+https://talentconsulting.io)',
          Accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
        },
      }), timeoutPromise]);
      const status = Number(response.status || 0);
      if (![301, 302, 303, 307, 308].includes(status)) break;
      const location = response.headers && response.headers.get && response.headers.get('location');
      if (!location) throw new Error('Redirect response did not include Location.');
      if (redirects.length >= maxRedirects) throw new Error('Redirect limit exceeded.');
      validateRedirectLocation(location, currentUrl);
      const nextUrl = new URL(location, currentUrl).toString();
      // Validate before the next request so a hostile Location is never fetched.
      checkedUrl(nextUrl, allowedOrigins);
      redirects.push({ url: currentUrl, status, location: nextUrl });
      if (response.body && typeof response.body.cancel === 'function') {
        await Promise.race([Promise.resolve().then(() => response.body.cancel()).catch(() => {}), timeoutPromise]);
      }
      currentUrl = nextUrl;
    }
    const text = await Promise.race([response.text(), timeoutPromise]);
    const headers = safeHeaders(response.headers);
    return {
      ok: response.ok === undefined ? response.status >= 200 && response.status < 300 : response.ok,
      status: response.status,
      url: currentUrl,
      contentType: headers['content-type'] || '',
      headers,
      redirects,
      text,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlSite(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  const siteUrl = normalizeSiteUrl(options.site || config.siteUrl);
  const siteOrigin = new URL(siteUrl).origin;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const routePolicies = validateRoutePolicies(config.routePolicies === undefined ? [] : config.routePolicies);
  const redirectChecks = validateRedirectChecks(config.redirectChecks === undefined ? [] : config.redirectChecks, siteOrigin);
  const policyByPath = new Map(routePolicies.map((policy) => [policy.path, policy]));
  const issues = [];
  const pages = [];

  const robotsUrl = absoluteUrl(siteUrl, '/robots.txt');
  const sitemapUrl = absoluteUrl(siteUrl, '/sitemap.xml');
  let robots = parseRobots('');
  let sitemapUrls = [];

  try {
    const robotsResponse = await fetchText(robotsUrl, timeoutMs, { fetchImpl, allowedOrigins: [siteOrigin] });
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
        message: `Failed to fetch robots.txt: ${String(error.message).slice(0, 180)}`,
        impact: 'Crawl policy could not be verified.',
        recommendation: 'Confirm the site is reachable and /robots.txt is served.',
      })
    );
  }

  try {
    const sitemapResponse = await fetchText(sitemapUrl, timeoutMs, { fetchImpl, allowedOrigins: [siteOrigin] });
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
      const parsedUrls = extractSitemapUrls(sitemapResponse.text);
      for (const rawUrl of parsedUrls) {
        let parsed;
        let clean;
        try {
          const rawPath = rawUrl.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i)?.[1] || '/';
          validateSafePath(rawPath, 'Sitemap path');
          parsed = new URL(rawUrl);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('unsafe sitemap URL');
          clean = canonicalizeUrl(parsed.toString());
        } catch {
          issues.push(policyIssue('sitemap-url', 'Sitemap contains an invalid URL entry.', { url: sitemapUrl }));
          continue;
        }
        if (new URL(clean).origin !== siteOrigin) {
          issues.push(policyIssue('sitemap-origin', `Sitemap contains an entry outside the audited origin (${new URL(clean).origin}).`, { url: sitemapUrl }));
          continue;
        }
        if (!sitemapUrls.includes(clean)) sitemapUrls.push(clean);
      }
    }
  } catch (error) {
    issues.push(
      makeIssue('critical', 'crawlability', {
        url: sitemapUrl,
        message: `Failed to fetch sitemap.xml: ${String(error.message).slice(0, 180)}`,
        impact: 'Public URL inventory could not be crawled.',
        recommendation: 'Confirm the site is reachable and /sitemap.xml is served.',
      })
    );
  }

  const maxPages = Number(options.maxPages || 0);
  const sampledSitemapUrls = maxPages > 0 ? sitemapUrls.slice(0, maxPages) : sitemapUrls;
  const urlsToCrawl = [...sampledSitemapUrls];
  for (const policy of routePolicies) {
    if (!urlsToCrawl.includes(absoluteUrl(siteUrl, policy.path))) urlsToCrawl.push(absoluteUrl(siteUrl, policy.path));
  }
  const priorityByPath = new Map((config.priorityMappings || []).map((item) => [item.targetPath, item.query]));

  for (const url of urlsToCrawl) {
    const routePath = pathFromUrl(url);
    const explicitPolicy = policyByPath.get(routePath);
    const policy = explicitPolicy || {
      path: routePath,
      expectedStatus: [200],
      bodyClass: 'public-content',
      crawl: 'allowed',
      index: 'index',
      canonical: 'self',
      sitemap: 'required',
    };
    const isSitemapSample = sampledSitemapUrls.includes(url);
    try {
      const response = await fetchText(url, timeoutMs, { fetchImpl, allowedOrigins: [siteOrigin] });
      const page = parseHtmlPage(url, response.text, siteOrigin, {
        status: response.status,
        finalUrl: response.url,
        headers: response.headers,
        contentType: response.contentType,
        redirects: response.redirects,
        inSitemap: sitemapUrls.includes(url),
        bodyClass: policy.bodyClass,
      });
      if (policy.bodyClass !== 'public-content') {
        for (const field of ['title', 'description', 'h1', 'firstParagraph', 'wordCount', 'text', 'jsonLd', 'links', 'dataHeavy', 'externalCitationCount']) delete page[field];
      }
      pages.push(page);
      if (explicitPolicy || isSitemapSample) {
        issues.push(...buildRoutePolicyIssues(page, policy, { robots, sitemapPaths: new Set(sitemapUrls.map(pathFromUrl)), siteOrigin }));
      }
      if (policy.bodyClass === 'public-content' && response.status === 200) {
        issues.push(...buildPageIssues(page, { config, robots, priorityQuery: priorityByPath.get(page.path) || '' }).filter((issue) => !['crawlability', 'indexation', 'canonical'].includes(issue.category)));
      }
    } catch (error) {
      const page = { url, path: routePath, status: null, error: String(error.message).slice(0, 180), redirects: [], inSitemap: sitemapUrls.includes(url), bodyClass: policy.bodyClass };
      pages.push(page);
      issues.push(
        policyIssue('crawlability', `Failed to fetch route: ${String(error.message).slice(0, 180)}`, {
          url,
        })
      );
    }
  }

  for (const check of redirectChecks) {
    const source = new URL(check.url);
    const target = new URL(check.finalUrl);
    const allowedStatuses = check.expectedRedirectStatus;
    try {
      const probe = await fetchText(check.url, timeoutMs, { fetchImpl, allowedOrigins: [source.origin, siteOrigin] });
      const terminal = canonicalizeUrl(probe.url) === canonicalizeUrl(check.finalUrl) && probe.status === 200;
      const permanent = probe.redirects.length > 0 && probe.redirects.every((item) => allowedStatuses.includes(item.status));
      if (!terminal || !permanent) issues.push(policyIssue('host-redirect', 'Declared host redirect did not follow the configured permanent redirect chain to the expected 200 URL.', { url: check.url }));
    } catch (error) {
      issues.push(policyIssue('host-redirect', `Declared host redirect probe failed: ${String(error.message).slice(0, 180)}`, { url: check.url }));
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

  if (args.ci && shouldFailCi(results)) {
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
  validateRoutePolicies,
  validateRedirectChecks,
  buildRoutePolicyIssues,
  shouldFailCi,
  fetchText,
};
