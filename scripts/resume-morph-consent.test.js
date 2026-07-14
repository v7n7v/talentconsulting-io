const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadSafety() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-morph-consent-'));
  const outfile = path.join(outdir, 'resume-morph-safety.cjs');
  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'resume-morph-safety.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const {
  RESUME_MORPH_ACKNOWLEDGEMENTS,
  RESUME_MORPH_CONSENT_VERSION,
  isValidResumeMorphConsentRecord,
} = loadSafety();
const uid = 'user-123';
const acknowledgementHash = 'verified-acknowledgement-hash';

function validRecord() {
  return {
    unlocked100: true,
    acceptedAt: '2026-07-10T12:00:00.000Z',
    acceptedByUid: uid,
    typedName: 'Amina Smith',
    consentVersion: RESUME_MORPH_CONSENT_VERSION,
    acknowledgementHash,
    acknowledgements: [...RESUME_MORPH_ACKNOWLEDGEMENTS],
    disabledAt: null,
  };
}

test('100% morph unlock requires the complete signed attestation record', () => {
  assert.equal(isValidResumeMorphConsentRecord(validRecord(), uid, acknowledgementHash), true);
});

test('100% morph unlock fails closed when any attestation proof is missing or altered', () => {
  for (const key of ['acceptedAt', 'acceptedByUid', 'typedName', 'acknowledgementHash', 'acknowledgements']) {
    const record = validRecord();
    delete record[key];
    assert.equal(isValidResumeMorphConsentRecord(record, uid, acknowledgementHash), false, key);
  }

  assert.equal(isValidResumeMorphConsentRecord({ ...validRecord(), acceptedByUid: 'other-user' }, uid, acknowledgementHash), false);
  assert.equal(isValidResumeMorphConsentRecord({ ...validRecord(), acknowledgementHash: 'tampered' }, uid, acknowledgementHash), false);
  assert.equal(isValidResumeMorphConsentRecord({ ...validRecord(), disabledAt: '2026-07-10T12:05:00.000Z' }, uid, acknowledgementHash), false);
});
