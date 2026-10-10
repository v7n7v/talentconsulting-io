#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ESLint } = require('eslint');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const FIXTURE_PREFIX = 'scripts/.lint-verify-fixtures-';
const EVIDENCE_DIRECTORY = '.ui-verify/remediation/r6-preparation/lint';
const EXPECTED_PACKAGE_VERSIONS = {
  eslint: '9.39.4',
  next: '16.3.8',
  'eslint-config-next': '16.2.4',
  '@next/eslint-plugin-next': '16.2.4',
  'eslint-plugin-react': '7.37.5',
  'eslint-plugin-react-hooks': '7.1.1',
  'eslint-plugin-jsx-a11y': '6.10.2',
  'eslint-plugin-import': '2.32.0',
  'typescript-eslint': '8.59.0',
  '@typescript-eslint/parser': '8.59.0',
  '@typescript-eslint/eslint-plugin': '8.59.0',
};
const EXPECTED_PLUGINS = {
  js: ['@', '@next/next', 'import', 'jsx-a11y', 'react', 'react-hooks'],
  ts: ['@', '@next/next', '@typescript-eslint', 'import', 'jsx-a11y', 'react', 'react-hooks'],
};
const REQUIRED_RULES = {
  js: {
    '@next/next/no-sync-scripts': 2,
    'jsx-a11y/alt-text': 1,
    'import/no-anonymous-default-export': 1,
    'react/jsx-key': 2,
    'react-hooks/rules-of-hooks': 2,
  },
  ts: {
    '@next/next/no-sync-scripts': 2,
    '@typescript-eslint/no-explicit-any': 2,
    'jsx-a11y/alt-text': 1,
    'import/no-anonymous-default-export': 1,
    'react/jsx-key': 2,
    'react-hooks/rules-of-hooks': 2,
  },
};

// These identities are filled from the reviewed installed preset matrix. A
// change requires reviewing the installed lock/config and updating this gate.
const EXPECTED_IDENTITY_SHA256 = {
  'js-module': 'f36164cabd6c9b1be719e16350d0e314f174178ebdb1999f761607a8bb4772bd',
  'js-commonjs': '94793edeefba6db787cd1be78ad945a7f2a74cef01b25e8041ecaf820263cadf',
  'ts-module': 'add8beaea133e8759d35d84efc0c96705ae515ff57ae061441519d9c5f7e5905',
};
const EXPECTED_INLINE_SUPPRESSIONS = [
  { path: 'app/suite/cover-letter/page.tsx', line: 369, rule: 'react-hooks/exhaustive-deps' },
  { path: 'app/suite/linkedin/page.tsx', line: 125, rule: 'react-hooks/exhaustive-deps' },
  { path: 'components/SuiteSidebar.tsx', line: 675, rule: 'react-hooks/exhaustive-deps' },
];

const EXCLUSION_REASONS = [
  { match: (p) => /(^|\/)node_modules\//.test(p), reason: 'installed dependencies' },
  { match: (p) => /^\.next\//.test(p), reason: 'root generated Next.js output' },
  { match: (p) => /^(out|build|coverage)\//.test(p), reason: 'root generated build or coverage output' },
  { match: (p) => /^\.ui-verify\//.test(p), reason: 'root ignored QA and remediation evidence' },
  { match: (p) => /^(output|test-results|\.playwright-cli)\//.test(p), reason: 'root generated QA output' },
  { match: (p) => /^(_backup|_to_delete)\//.test(p), reason: 'root recovery or retired-source archive' },
  { match: (p) => /^next-env\.d\.ts$/.test(p), reason: 'root Next.js generated declaration, ignored by Git' },
  { match: (p) => p.startsWith(FIXTURE_PREFIX), reason: 'temporary lint contract fixture created by its test' },
];

function getRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' }).trim();
}

function gitPaths(root, args = ['--cached', '--others', '--exclude-standard']) {
  const out = execFileSync('git', ['ls-files', ...args, '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return [...new Set(out.split('\0').filter(Boolean))].sort();
}

function classifyPaths(paths, trackedPaths = new Set()) {
  const included = [];
  const excluded = [];
  for (const relativePath of [...new Set(paths)].sort()) {
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) continue;
    // Fixture directories are excluded only while generated and untracked. If a
    // path is committed, it is ordinary maintained source and must be linted.
    const generatedFixture = relativePath.startsWith(FIXTURE_PREFIX) && !trackedPaths.has(relativePath);
    const exclusion = generatedFixture
      ? EXCLUSION_REASONS.find((entry) => entry.reason.startsWith('temporary lint contract fixture'))
      : EXCLUSION_REASONS.find((entry) => !entry.reason.startsWith('temporary lint contract fixture') && entry.match(relativePath));
    if (exclusion) excluded.push({ path: relativePath, reason: exclusion.reason });
    else included.push(relativePath);
  }
  return { included, excluded };
}

function sourceCandidates(root) {
  const trackedPaths = new Set(gitPaths(root, ['--cached']));
  return classifyPaths(gitPaths(root), trackedPaths);
}

function normalize(value) {
  if (value === undefined) return '[undefined]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return `[function:${value.name || 'anonymous'}]`;
  if (value instanceof RegExp) return `[regexp:${value.source}/${value.flags}]`;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return String(value);
}

function severityOf(ruleConfig) {
  const raw = Array.isArray(ruleConfig) ? ruleConfig[0] : ruleConfig;
  if (raw === 'off' || raw === 0) return 0;
  if (raw === 'warn' || raw === 1) return 1;
  if (raw === 'error' || raw === 2) return 2;
  return null;
}

function effectiveIdentity(config) {
  const extension = config.__extension;
  const kind = TYPESCRIPT_EXTENSIONS.has(extension) ? 'ts' : 'js';
  const parserName = config.languageOptions?.parser?.meta?.name || 'unknown';
  const plugins = Object.keys(config.plugins || {}).sort();
  const rules = Object.fromEntries(Object.entries(config.rules || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => [id, normalize(value)]));
  const identity = {
    parserName, plugins, rules,
    languageOptions: normalize({
      ecmaVersion: config.languageOptions?.ecmaVersion,
      sourceType: config.languageOptions?.sourceType,
      parserOptions: config.languageOptions?.parserOptions,
      globals: config.languageOptions?.globals,
    }),
    linterOptions: { ...normalize(config.linterOptions || {}), allowInlineConfig: true },
    settings: normalize(config.settings || {}),
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const sourceMode = config.languageOptions?.sourceType === 'commonjs' ? 'commonjs' : 'module';
  return { kind, sourceMode, profile: `${kind}-${sourceMode}`, parserName, plugins, configuredRuleKeys: Object.keys(rules).length, enabledRules: Object.values(rules).filter((v) => severityOf(v) > 0).length, digest };
}

function packageVersions(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const versions = {};
  for (const name of Object.keys(EXPECTED_PACKAGE_VERSIONS)) {
    versions[name] = lock.packages?.[`node_modules/${name}`]?.version || null;
  }
  return versions;
}

function ruleSeverity(config, id) {
  return severityOf(config.rules?.[id]);
}

function installedPackageVersion(root, name) {
  const projectRequire = require('node:module').createRequire(path.join(root, 'package.json'));
  let resolved;
  try { resolved = projectRequire.resolve(name); } catch { return null; }
  let directory = path.dirname(resolved);
  while (directory.startsWith(root)) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        if (data.name === name) return data.version || null;
      } catch { return null; }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

function inlineSuppressionsFromText(source, config, relativePath, absolutePath) {
  const parser = config.languageOptions?.parser;
  if (!parser || typeof parser.parseForESLint !== 'function') return [{ path: relativePath, line: null, rule: 'unknown', parseFailure: true }];
  let parsed;
  try {
    parsed = parser.parseForESLint(source, {
      ...(config.languageOptions.parserOptions || {}),
      ecmaVersion: config.languageOptions.ecmaVersion || 'latest',
      sourceType: config.languageOptions.sourceType === 'commonjs' ? 'unambiguous' : (config.languageOptions.parserOptions?.sourceType || 'module'),
      allowReturnOutsideFunction: config.languageOptions.sourceType === 'commonjs',
      filePath: absolutePath || path.resolve(process.cwd(), relativePath),
      loc: true, range: true, tokens: true, comment: true,
    });
  } catch {
    return [{ path: relativePath, line: null, rule: 'unknown', parseFailure: true }];
  }
  const comments = parsed.ast?.comments || parsed.comments || [];
  const suppressions = [];
  for (const comment of comments) {
    const text = String(comment.value || '').trim();
    if (!/^eslint(?:-|\s|$)/.test(text)) continue;
    const line = comment.loc?.start?.line || null;
    const match = text.match(/^eslint-disable(?:-(next-line|line))?\b(?:\s+([^*]+?))?\s*$/);
    if (match) {
      const rules = (match[2] || 'all').split(',').map((rule) => rule.trim()).filter(Boolean);
      for (const rule of rules) suppressions.push({ path: relativePath, line, rule });
    } else {
      // Inline rule configuration (severity/options), eslint-enable and any
      // other new eslint comment directive are rejected by the frozen contract.
      suppressions.push({ path: relativePath, line, rule: '<inline-eslint-config>' });
    }
  }
  return suppressions;
}

async function inspectInlineSuppressions(root, eslint, files) {
  const found = [];
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const text = fs.readFileSync(absolutePath, 'utf8');
    const config = await eslint.calculateConfigForFile(absolutePath);
    if (!config) continue;
    found.push(...inlineSuppressionsFromText(text, config, relativePath, absolutePath));
  }
  const key = (item) => `${item.path}:${item.line}:${item.rule}`;
  const foundKeys = found.map(key).sort();
  const expectedKeys = EXPECTED_INLINE_SUPPRESSIONS.map(key).sort();
  return { found, matchesExpected: JSON.stringify(foundKeys) === JSON.stringify(expectedKeys), expected: EXPECTED_INLINE_SUPPRESSIONS };
}

async function checkConfigAndCoverage(options = {}) {
  const root = options.root || getRoot();
  const configFile = path.join(root, 'eslint.config.cjs');
  const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile, allowInlineConfig: true });
  const candidates = sourceCandidates(root);
  const candidateManifest = candidates.included.map((relativePath) => {
    const contents = fs.readFileSync(path.join(root, relativePath));
    return { path: relativePath, bytes: contents.length, sha256: crypto.createHash('sha256').update(contents).digest('hex') };
  });
  const failures = [];
  const trackedPaths = new Set(gitPaths(root, ['--cached']));
  const trackedExclusions = candidates.excluded.filter((item) => trackedPaths.has(item.path));
  if (trackedExclusions.length) failures.push({ code: 'TRACKED_SOURCE_EXCLUDED', paths: trackedExclusions.map(({ path: file }) => file) });
  const lockedVersions = packageVersions(root);
  const installedVersions = Object.fromEntries(Object.keys(EXPECTED_PACKAGE_VERSIONS).map((name) => [name, installedPackageVersion(root, name)]));
  for (const [name, expected] of Object.entries(EXPECTED_PACKAGE_VERSIONS)) {
    if (lockedVersions[name] !== expected) failures.push({ code: 'LOCK_VERSION', package: name, expected, actual: lockedVersions[name] });
    if (installedVersions[name] !== expected) failures.push({ code: 'INSTALLED_VERSION', package: name, expected, actual: installedVersions[name] });
    if (installedVersions[name] !== lockedVersions[name]) failures.push({ code: 'VERSION_MISMATCH', package: name, locked: lockedVersions[name], installed: installedVersions[name] });
  }

  const profileNames = Object.keys(EXPECTED_IDENTITY_SHA256);
  const profileDigests = Object.fromEntries(profileNames.map((name) => [name, new Set()]));
  const profileCounts = Object.fromEntries(profileNames.map((name) => [name, { files: 0, configuredRuleKeys: null, enabledRules: null, parserName: null, sourceMode: name.endsWith('commonjs') ? 'commonjs' : 'module' }]));
  const configErrors = [];
  for (const relativePath of candidates.included) {
    const absolutePath = path.join(root, relativePath);
    if (await eslint.isPathIgnored(absolutePath)) {
      failures.push({ code: 'IGNORED_CANDIDATE', path: relativePath });
      continue;
    }
    let config;
    try {
      config = await eslint.calculateConfigForFile(absolutePath);
    } catch (error) {
      configErrors.push({ path: relativePath, error: String(error.message || error).slice(0, 240) });
      continue;
    }
    if (!config) {
      failures.push({ code: 'NO_EFFECTIVE_CONFIG', path: relativePath });
      continue;
    }
    const extension = path.extname(relativePath).toLowerCase();
    const kind = TYPESCRIPT_EXTENSIONS.has(extension) ? 'ts' : 'js';
    const identity = effectiveIdentity({ ...config, __extension: extension });
    profileDigests[identity.profile].add(identity.digest);
    const profile = profileCounts[identity.profile];
    profile.files += 1;
    profile.configuredRuleKeys = identity.configuredRuleKeys;
    profile.enabledRules = identity.enabledRules;
    profile.parserName = identity.parserName;
    const expectedParser = kind === 'ts' ? 'typescript-eslint/parser' : 'eslint-config-next/parser';
    if (identity.parserName !== expectedParser) failures.push({ code: 'PARSER_IDENTITY', path: relativePath, expected: expectedParser, actual: identity.parserName });
    if (JSON.stringify(identity.plugins) !== JSON.stringify(EXPECTED_PLUGINS[kind])) failures.push({ code: 'PLUGIN_IDENTITY', path: relativePath, expected: EXPECTED_PLUGINS[kind], actual: identity.plugins });
    for (const [ruleId, expectedSeverity] of Object.entries(REQUIRED_RULES[kind])) {
      const actualSeverity = ruleSeverity(config, ruleId);
      if (actualSeverity !== expectedSeverity) failures.push({ code: 'REQUIRED_RULE', path: relativePath, rule: ruleId, expectedSeverity, actualSeverity });
    }
  }
  if (configErrors.length) failures.push({ code: 'CONFIG_ERRORS', count: configErrors.length, first: configErrors.slice(0, 5) });
  const inlineSuppressions = await inspectInlineSuppressions(root, eslint, candidates.included);
  if (!inlineSuppressions.matchesExpected) failures.push({ code: 'INLINE_SUPPRESSION_DRIFT', count: inlineSuppressions.found.length });
  if (candidates.included.length === 0) failures.push({ code: 'EMPTY_COVERAGE' });
  for (const profileName of profileNames) {
    if (profileDigests[profileName].size !== 1) failures.push({ code: 'MULTIPLE_PROFILES', profile: profileName, count: profileDigests[profileName].size });
    const digest = [...profileDigests[profileName]][0] || null;
    if (digest !== EXPECTED_IDENTITY_SHA256[profileName]) {
      failures.push({ code: 'RULE_IDENTITY', profile: profileName, expected: EXPECTED_IDENTITY_SHA256[profileName], actual: digest });
    }
  }
  return {
    ok: failures.length === 0,
    root,
    candidateCount: candidates.included.length,
    candidateManifest,
    candidateCountsByExtension: candidates.included.reduce((acc, file) => {
      const ext = path.extname(file).toLowerCase();
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {}),
    excludedCandidates: candidates.excluded,
    documentedExclusionReasons: EXCLUSION_REASONS.map(({ reason }) => reason),
    packageVersions: { locked: lockedVersions, installed: installedVersions },
    inlineConfigPolicy: { allowInlineConfig: true, permittedLegacySuppressionsOnly: true, inlineRuleConfigDirectivesAllowed: false, knownExistingSuppressions: inlineSuppressions.found, suppressionSetMatchesReviewedContract: inlineSuppressions.matchesExpected },
    profiles: Object.fromEntries(profileNames.map((kind) => [kind, {
      ...profileCounts[kind],
      expectedIdentitySha256: EXPECTED_IDENTITY_SHA256[kind],
      actualIdentitySha256: [...profileDigests[kind]][0] || null,
      profileCount: profileDigests[kind].size,
    }])),
    failures,
  };
}

function hasStrictLintFailure(summary) {
  return Boolean(summary.errors || summary.warnings || summary.fatalErrors || summary.suppressed || summary.missingFiles?.length || summary.unexpectedFiles?.length);
}

function summarizeResults(results, expectedPaths, root = process.cwd()) {
  const relative = (file) => path.relative(root, path.resolve(file)).split(path.sep).join('/');
  const actualPaths = results.map((result) => relative(result.filePath));
  const expected = new Set(expectedPaths.map(relative));
  const actual = new Set(actualPaths);
  const missing = [...expected].filter((file) => !actual.has(file)).sort();
  const unexpected = [...actual].filter((file) => !expected.has(file)).sort();
  const counts = { files: results.length, errors: 0, warnings: 0, fatalErrors: 0, suppressed: 0, byRule: {}, byFile: [] };
  for (const result of results) {
    counts.errors += result.errorCount;
    counts.warnings += result.warningCount;
    counts.fatalErrors += result.fatalErrorCount;
    counts.suppressed += (result.suppressedMessages || []).length;
    const fileEntry = { path: relative(result.filePath), errors: result.errorCount, warnings: result.warningCount, fatalErrors: result.fatalErrorCount, rules: [] };
    for (const message of result.messages || []) {
      const severity = message.severity === 2 ? 'error' : 'warning';
      const rule = message.ruleId || 'fatal/parse';
      const aggregate = counts.byRule[rule] || (counts.byRule[rule] = { errors: 0, warnings: 0 });
      aggregate[severity === 'error' ? 'errors' : 'warnings'] += 1;
      fileEntry.rules.push({ rule, severity, line: message.line || null, column: message.column || null });
    }
    if (fileEntry.rules.length) counts.byFile.push(fileEntry);
  }
  counts.byFile.sort((a, b) => a.path.localeCompare(b.path));
  return { ...counts, missingFiles: missing, unexpectedFiles: unexpected };
}

async function runFullLint(options = {}) {
  const root = options.root || getRoot();
  const check = options.check || await checkConfigAndCoverage({ root });
  if (!check.ok) return { ok: false, check, lint: null, failures: check.failures };
  const candidates = sourceCandidates(root).included;
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.cjs'), warnIgnored: true });
  const files = candidates.map((relativePath) => path.join(root, relativePath));
  const results = await eslint.lintFiles(files);
  const summary = summarizeResults(results, files, root);
  const failures = [];
  if (summary.missingFiles.length) failures.push({ code: 'MISSING_LINT_RESULTS', count: summary.missingFiles.length });
  if (summary.unexpectedFiles.length) failures.push({ code: 'UNEXPECTED_LINT_RESULTS', count: summary.unexpectedFiles.length });
  if (hasStrictLintFailure(summary)) failures.push({ code: 'DIAGNOSTICS', errors: summary.errors, warnings: summary.warnings, fatalErrors: summary.fatalErrors, suppressed: summary.suppressed });
  return { ok: failures.length === 0, check, lint: summary, failures };
}

function writeSanitizedReport(root, report, requestedPath) {
  const relative = requestedPath || `${EVIDENCE_DIRECTORY}/full-lint-report.json`;
  const evidenceRoot = path.resolve(root, EVIDENCE_DIRECTORY);
  const outputPath = path.resolve(root, relative);
  if (outputPath !== evidenceRoot && !outputPath.startsWith(`${evidenceRoot}${path.sep}`)) {
    throw new Error(`Report output must stay under ${EVIDENCE_DIRECTORY}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ verifiedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
  return path.relative(root, outputPath);
}

async function main(argv) {
  const root = getRoot();
  // Next's Babel preset resolves relative to process.cwd(), independently of
  // ESLint's cwd option. Keep every CLI parser/config operation in this checkout.
  process.chdir(root);
  let checkOnly = false;
  let reportMode = false;
  let outputPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') checkOnly = true;
    else if (arg === '--report') reportMode = true;
    else if (arg === '--output' && argv[index + 1]) { outputPath = argv[index + 1]; index += 1; }
    else {
      process.stderr.write('Usage: node scripts/lint-verify.cjs [--check | --report] [--output <ignored-evidence-path>]\n');
      return 2;
    }
  }
  if (checkOnly && reportMode) {
    process.stderr.write('Choose either --check or --report.\n');
    return 2;
  }
  const check = await checkConfigAndCoverage({ root });
  const result = checkOnly ? { ok: check.ok, check, lint: null, failures: check.failures } : await runFullLint({ root, check });
  let savedReport = null;
  if (reportMode || outputPath) savedReport = writeSanitizedReport(root, result, outputPath);
  const summary = {
    ok: result.ok,
    candidates: check.candidateCount,
    profile: Object.fromEntries(Object.entries(check.profiles).map(([kind, value]) => [kind, { files: value.files, configuredRuleKeys: value.configuredRuleKeys, enabledRules: value.enabledRules, profileCount: value.profileCount, ruleIdentitySha256: value.actualIdentitySha256 }])),
    inlineSuppressions: check.inlineConfigPolicy.knownExistingSuppressions,
    diagnostics: result.lint ? { files: result.lint.files, errors: result.lint.errors, warnings: result.lint.warnings, fatalErrors: result.lint.fatalErrors, suppressed: result.lint.suppressed, strictWarningLimit: 0 } : null,
    failures: result.failures,
    report: savedReport,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`lint verifier failed: ${String(error.message || error).slice(0, 500)}\n`);
    process.exitCode = 2;
  });
}

module.exports = {
  EXPECTED_IDENTITY_SHA256,
  EXPECTED_PACKAGE_VERSIONS,
  EXPECTED_INLINE_SUPPRESSIONS,
  checkConfigAndCoverage,
  inlineSuppressionsFromText,
  inspectInlineSuppressions,
  hasStrictLintFailure,
  effectiveIdentity,
  normalize,
  runFullLint,
  sourceCandidates,
  classifyPaths,
  summarizeResults,
};
