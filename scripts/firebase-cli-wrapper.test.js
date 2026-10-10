const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const wrapper = require('./firebase-cli-wrapper');

test('Firebase adapter preserves the reviewed application sharp override', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(wrapper.PINNED_SHARP_VERSION, manifest.overrides.sharp);
});

test('firebase wrapper rejects a PATH without the pinned CLI', () => {
  assert.equal(wrapper.findFirebaseBin(''), null);
  assert.throws(() => wrapper.loadExpectedFirebaseCli(''), /15\.24\.0/);
});

test('firebase wrapper patches only the adapter sharp constant in memory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'firebase-wrapper-'));
  const constantsDir = path.join(root, 'lib', 'frameworks');
  fs.mkdirSync(constantsDir, { recursive: true });
  const constantsPath = path.join(constantsDir, 'constants.js');
  fs.writeFileSync(constantsPath, `exports.SHARP_VERSION = ${JSON.stringify(wrapper.ADAPTER_SHARP_RANGE)};`);
  wrapper.patchSharpVersion(root);
  assert.equal(require(constantsPath).SHARP_VERSION, wrapper.PINNED_SHARP_VERSION);
  fs.rmSync(root, { recursive: true, force: true });
});
