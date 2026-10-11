const { createRequire } = require('node:module');

const projectRequire = createRequire(__filename);
const { defineConfig } = projectRequire('eslint/config');
const nextCoreWebVitals = projectRequire('eslint-config-next/core-web-vitals');
const nextCoreWebVitalsForAllSources = nextCoreWebVitals.map((config) =>
  config.name === 'next'
    ? { ...config, files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'] }
    : config,
);
const nextTypeScript = projectRequire('eslint-config-next/typescript');

const generatedAndArchivedIgnores = {
  ignores: [
    '**/node_modules/**', // Installed dependencies, never maintained application source.
    '.next/**', // Root Next.js generated build output only.
    'out/**', // Root static export output only; nested maintained code is linted.
    'build/**', // Root generated build output only; nested maintained code is linted.
    'coverage/**', // Root generated test coverage output only; nested maintained code is linted.
    'next-env.d.ts', // Root Next.js generated declaration; Git ignores this file too.
    '.ui-verify/**', // Root ignored QA, browser capture, and remediation evidence.
    'output/**', // Root generated QA/audit output; nested maintained code is linted.
    'test-results/**', // Root generated browser test results only.
    '.playwright-cli/**', // Root generated Playwright session output only.
    '_backup/**', // Root recovery archive only.
    '_to_delete/**', // Root explicitly retired source archive only.
  ],
};

module.exports = defineConfig([
  generatedAndArchivedIgnores,
  ...nextCoreWebVitalsForAllSources,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: nextTypeScript,
  },
]);
