const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadPersonaVoices() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-persona-voices-'));
  const outfile = path.join(outdir, 'persona-voices.cjs');
  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'ai', 'persona-voices.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const {
  resolveVoiceSid,
  PERSONA_VOICE_SID,
  DEFAULT_VOICE_SID,
  MIN_VOICE_SID,
  MAX_VOICE_SID,
} = loadPersonaVoices();

test('every persona id maps to a distinct in-range sid', () => {
  const entries = Object.entries(PERSONA_VOICE_SID);
  assert.equal(entries.length, 6);
  for (const [id, sid] of entries) {
    assert.ok(Number.isInteger(sid), `${id} sid must be an integer`);
    assert.ok(sid >= MIN_VOICE_SID && sid <= MAX_VOICE_SID, `${id} sid ${sid} out of range`);
  }
  // Provisional map must match the plan table exactly.
  assert.deepEqual(PERSONA_VOICE_SID, {
    'faang-lead': 0,
    'friendly-hr': 3,
    'startup-cto': 1,
    'vp-engineering': 2,
    'consulting-partner': 4,
    'behavioral-specialist': 7,
  });
});

test('resolveVoiceSid resolves persona ids (the bug the display-name map caused)', () => {
  assert.equal(resolveVoiceSid('faang-lead'), 0);
  assert.equal(resolveVoiceSid('friendly-hr'), 3);
  assert.equal(resolveVoiceSid('behavioral-specialist'), 7);
});

test('resolveVoiceSid is case- and whitespace-insensitive', () => {
  assert.equal(resolveVoiceSid('  FAANG-Lead '), 0);
});

test('resolveVoiceSid accepts a raw sid as number or numeric string within range', () => {
  assert.equal(resolveVoiceSid(4), 4);
  assert.equal(resolveVoiceSid('9'), 9);
  assert.equal(resolveVoiceSid(0), 0);
});

test('resolveVoiceSid maps coarse gender hints', () => {
  assert.equal(resolveVoiceSid('male'), 0);
  assert.equal(resolveVoiceSid('female'), 3);
});

test('resolveVoiceSid falls back to default for unknown / out-of-range / empty', () => {
  assert.equal(resolveVoiceSid(undefined), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid(null), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid(''), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid('nope'), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid(42), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid('42'), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid(-1), DEFAULT_VOICE_SID);
  assert.equal(resolveVoiceSid(2.5), DEFAULT_VOICE_SID);
});
