const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-proof-'));
const outfile = path.join(directory, 'proof.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'components/suite/ProofEngineReport.tsx')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  alias: { '@': repoRoot },
  loader: { '.css': 'empty' },
});
const { getProofEngineVerdict } = require(outfile);
fs.rmSync(directory, { recursive: true, force: true });

test('scoring-only reports make coverage claims without rewrite or export claims', () => {
  const verdict = getProofEngineVerdict({
    reportKind: 'scoring-only',
    requirements: [],
  });
  assert.match(verdict.label, /coverage/i);
  assert.match(verdict.detail, /does not verify a rewrite or export/i);
});

test('scoring-only partial coverage is incomplete, not optimistic', () => {
  const verdict = getProofEngineVerdict({
    reportKind: 'scoring-only',
    requirements: [{ label: 'Python', status: 'partial', evidence: 'Related text only.' }],
  });
  assert.match(verdict.label, /gaps/i);
});

test('reports without provenance stay conservative, including empty reports', () => {
  const verdict = getProofEngineVerdict({ requirements: [] });
  assert.match(verdict.label, /review available/i);
  assert.match(verdict.detail, /not established/i);
});

test('rewrite/export provenance does not imply verification', () => {
  const requirements = [{ label: 'React', status: 'matched', evidence: 'Found.' }];
  assert.match(getProofEngineVerdict({ reportKind: 'rewrite-proof', requirements }).detail, /not verified/i);
  assert.match(getProofEngineVerdict({ reportKind: 'export-proof', requirements }).detail, /not completed/i);
  assert.match(getProofEngineVerdict({ reportKind: 'rewrite-proof', requirements, verification: { rewriteProtected: true } }).label, /Evidence aligned/i);
  assert.match(getProofEngineVerdict({ reportKind: 'export-proof', requirements, verification: { exportVerified: true } }).label, /Export checks passed/i);
});
