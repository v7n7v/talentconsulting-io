'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { ESLint } = require('eslint');
const {
  EXPECTED_INLINE_SUPPRESSIONS,
  checkConfigAndCoverage,
  classifyPaths,
  hasStrictLintFailure,
  inlineSuppressionsFromText,
  sourceCandidates,
  summarizeResults,
} = require('./lint-verify.cjs');

const root = path.resolve(__dirname, '..');
const configFile = path.join(root, 'eslint.config.cjs');

test('absolute lint CLI works outside the checkout, including Next Babel directive parsing', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'lint-verify.cjs'), '--check'], {
    cwd: os.tmpdir(), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.candidates >= 904);
  assert.equal(report.inlineSuppressions.length, 3);
});

function fixtureDirectory() {
  return fs.mkdtempSync(path.join(__dirname, '.lint-verify-fixtures-'));
}

function writeFixtures(directory) {
  const fixtures = {
    'valid.tsx': 'export default function Fixture() { return <main />; }\n',
    'key.jsx': 'export function Fixture() { return [1].map((value) => <span>{value}</span>); }\n',
    'key.cjs': 'function Fixture() { return [1].map((value) => <span>{value}</span>); } module.exports = Fixture;\n',
    'hook.tsx': "import { useState } from 'react'; export function Fixture({ enabled }: { enabled: boolean }) { if (enabled) useState(0); return <main />; }\n",
    'any.ts': 'export const value: any = 1;\n',
    'sync-script.jsx': "export function Fixture() { return <script src='/fixture.js' />; }\n",
    'a11y.tsx': "export function Fixture() { return <img src='/fixture.png' />; }\n",
    'import.js': 'export default { value: 1 };\n',
    'new-suppression.ts': '// eslint-disable-next-line no-unused-vars\nexport const value = 1;\n',
    'inline-rule-config.ts': '/* eslint @typescript-eslint/no-explicit-any: off */\nexport const value: any = 1;\n',
    'portable.cts': 'export const fixture: number = 1;\n',
    'portable.mts': 'export const fixture: number = 1;\n',
  };
  for (const [name, contents] of Object.entries(fixtures)) fs.writeFileSync(path.join(directory, name), contents);
  return fixtures;
}

test('strict config covers every tracked and maintained candidate with frozen rule identities', async () => {
  const check = await checkConfigAndCoverage({ root });
  assert.equal(check.ok, true, JSON.stringify(check.failures.slice(0, 8)));
  assert.ok(check.candidateCount >= 904);
  assert.equal(check.profiles['js-module'].configuredRuleKeys, 66);
  assert.equal(check.profiles['js-module'].enabledRules, 61);
  assert.equal(check.profiles['js-commonjs'].configuredRuleKeys, 66);
  assert.equal(check.profiles['js-commonjs'].enabledRules, 61);
  assert.equal(check.profiles['ts-module'].configuredRuleKeys, 112);
  assert.equal(check.profiles['ts-module'].enabledRules, 85);
  assert.equal(check.inlineConfigPolicy.allowInlineConfig, true);
  assert.equal(check.inlineConfigPolicy.inlineRuleConfigDirectivesAllowed, false);
  assert.equal(check.inlineConfigPolicy.suppressionSetMatchesReviewedContract, true);
  assert.deepEqual(check.inlineConfigPolicy.knownExistingSuppressions, EXPECTED_INLINE_SUPPRESSIONS);

  const candidates = sourceCandidates(root).included;
  for (const ownedFile of ['eslint.config.cjs', 'scripts/lint-verify.cjs', 'scripts/lint-verify.test.cjs']) {
    assert.ok(candidates.includes(ownedFile), `${ownedFile} is outside lint coverage`);
  }
  assert.ok(candidates.includes('app/api/agent/stories/coverage/route.ts'), 'maintained code under an artifact-like directory must be linted');
});

test('official Next preset red/green fixtures preserve key, hook, any, Next, a11y and import rules', async () => {
  const directory = fixtureDirectory();
  try {
    const fixtures = writeFixtures(directory);
    const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile, allowInlineConfig: true });
    const names = Object.keys(fixtures).filter((name) => !name.startsWith('new-suppression'));
    const results = await eslint.lintFiles(names.map((name) => path.join(directory, name)));
    const byName = new Map(results.map((result) => [path.basename(result.filePath), result]));
    assert.equal(byName.get('valid.tsx').errorCount, 0);
    assert.equal(byName.get('valid.tsx').warningCount, 0);
    const expectedRules = {
      'key.jsx': 'react/jsx-key',
      'key.cjs': 'react/jsx-key',
      'hook.tsx': 'react-hooks/rules-of-hooks',
      'any.ts': '@typescript-eslint/no-explicit-any',
      'sync-script.jsx': '@next/next/no-sync-scripts',
      'a11y.tsx': 'jsx-a11y/alt-text',
      'import.js': 'import/no-anonymous-default-export',
    };
    for (const [name, rule] of Object.entries(expectedRules)) {
      assert.ok(byName.get(name).messages.some((message) => message.ruleId === rule), `${name} did not trigger ${rule}`);
    }
    const a11yResult = byName.get('a11y.tsx');
    const warningSummary = summarizeResults([a11yResult], [path.join(directory, 'a11y.tsx')], root);
    assert.ok(warningSummary.warnings > 0);
    assert.equal(hasStrictLintFailure(warningSummary), true, 'warning-only diagnostics must fail strict zero-warning lint');
    const importSummary = summarizeResults([byName.get('import.js')], [path.join(directory, 'import.js')], root);
    assert.ok(importSummary.warnings > 0);
    assert.equal(hasStrictLintFailure(importSummary), true);

    const tsCts = await eslint.calculateConfigForFile(path.join(directory, 'portable.cts'));
    const tsMts = await eslint.calculateConfigForFile(path.join(directory, 'portable.mts'));
    assert.equal(tsCts.languageOptions.parser.meta.name, 'typescript-eslint/parser');
    assert.equal(tsMts.languageOptions.parser.meta.name, 'typescript-eslint/parser');
    assert.equal(tsCts.rules['@typescript-eslint/no-explicit-any'][0], 2);
    assert.equal(byName.get('portable.cts').errorCount, 0);
    assert.equal(byName.get('portable.cts').warningCount, 0);
    assert.equal(byName.get('portable.mts').errorCount, 0);
    assert.equal(byName.get('portable.mts').warningCount, 0);
    assert.equal(tsMts.rules['@typescript-eslint/no-explicit-any'][0], 2);

    const ruleConfigPath = path.join(directory, 'inline-rule-config.ts');
    const ruleConfig = await eslint.calculateConfigForFile(ruleConfigPath);
    const ruleConfigText = fs.readFileSync(ruleConfigPath, 'utf8');
    assert.deepEqual(inlineSuppressionsFromText(ruleConfigText, ruleConfig, 'synthetic/inline-rule-config.ts', ruleConfigPath), [{ path: 'synthetic/inline-rule-config.ts', line: 1, rule: '<inline-eslint-config>' }]);

    const suppressionConfig = await eslint.calculateConfigForFile(path.join(directory, 'new-suppression.ts'));
    const suppressionText = fs.readFileSync(path.join(directory, 'new-suppression.ts'), 'utf8');
    const suppression = inlineSuppressionsFromText(suppressionText, suppressionConfig, 'synthetic/new-suppression.ts', path.join(directory, 'new-suppression.ts'));
    assert.deepEqual(suppression, [{ path: 'synthetic/new-suppression.ts', line: 1, rule: 'no-unused-vars' }]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('only untracked generated fixture paths are excluded; tracked source remains covered', () => {
  const fixture = 'scripts/.lint-verify-fixtures-example/committed.ts';
  const generated = classifyPaths([fixture], new Set());
  assert.equal(generated.included.length, 0);
  assert.equal(generated.excluded[0].reason, 'temporary lint contract fixture created by its test');
  const tracked = classifyPaths([fixture], new Set([fixture]));
  assert.deepEqual(tracked.included, [fixture]);
  assert.equal(tracked.excluded.length, 0);
  const retired = classifyPaths(['_to_delete/old-route.ts'], new Set(['_to_delete/old-route.ts']));
  assert.deepEqual(retired.excluded, [{ path: '_to_delete/old-route.ts', reason: 'root recovery or retired-source archive' }]);
  for (const nested of ['app/api/coverage/route.ts', 'lib/output/parser.ts', 'scripts/build/release.ts', 'app/suite/test-results/page.tsx', 'components/_backup/Panel.tsx']) {
    assert.deepEqual(classifyPaths([nested], new Set([nested])).included, [nested], `${nested} must not be excluded by a root-artifact pattern`);
  }
});

test('strict failure policy rejects errors, warnings, fatals, suppressions and coverage gaps', () => {
  for (const field of ['errors', 'warnings', 'fatalErrors', 'suppressed']) {
    assert.equal(hasStrictLintFailure({ [field]: 1 }), true, `${field} escaped the strict gate`);
  }
  assert.equal(hasStrictLintFailure({ errors: 0, warnings: 0, fatalErrors: 0, suppressed: 0, missingFiles: ['lost.ts'] }), true);
  assert.equal(hasStrictLintFailure({ errors: 0, warnings: 0, fatalErrors: 0, suppressed: 0, unexpectedFiles: ['extra.js'] }), true);
  assert.equal(hasStrictLintFailure({ errors: 0, warnings: 0, fatalErrors: 0, suppressed: 0, missingFiles: [], unexpectedFiles: [] }), false);
});
