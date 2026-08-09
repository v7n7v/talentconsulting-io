const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-interview-prompt-'));
  const outfile = path.join(outdir, 'prompt.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/ai/interview-prompt.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const modPromise = loadModule();

test('persona-id keying: each id resolves to its own profile (the live-token bug)', async () => {
  const { resolvePersonaProfile, PERSONA_PROFILES } = await modPromise;
  // The client sends persona.id, e.g. 'faang-lead' — NOT the display name.
  assert.equal(resolvePersonaProfile('faang-lead').displayName, 'FAANG Tech Lead');
  assert.equal(resolvePersonaProfile('friendly-hr').gender, 'female');
  assert.equal(resolvePersonaProfile('startup-cto').displayName, 'Startup CTO');
  // All six persona ids from the page are present.
  for (const id of ['faang-lead', 'friendly-hr', 'startup-cto', 'vp-engineering', 'consulting-partner', 'behavioral-specialist']) {
    assert.ok(PERSONA_PROFILES[id], `missing profile for ${id}`);
  }
});

test('unknown / display-name key falls back to the default identity (never throws)', async () => {
  const { resolvePersonaProfile } = await modPromise;
  // The OLD display-name key must NOT resolve — proving we key by id now.
  assert.equal(resolvePersonaProfile('FAANG Tech Lead').displayName, 'Friendly HR');
  assert.equal(resolvePersonaProfile(undefined).displayName, 'Friendly HR');
  assert.equal(resolvePersonaProfile('nonsense').displayName, 'Friendly HR');
});

test('buildInterviewPrompt embeds the resolved identity, style and JD context', async () => {
  const { buildInterviewPrompt } = await modPromise;
  const prompt = buildInterviewPrompt('faang-lead', 'Senior Backend role at Acme', 'technical');
  assert.match(prompt, /FAANG Tech Lead/);
  assert.match(prompt, /technical interview/);
  assert.match(prompt, /Senior Backend role at Acme/);
  assert.match(prompt, /a male interviewer/);

  const noJd = buildInterviewPrompt('friendly-hr', '', 'behavioral');
  assert.doesNotMatch(noJd, /TARGET ROLE CONTEXT/);
});

test('splitIntoSpeechChunks: one chunk per sentence, no empties, long sentences wrapped', async () => {
  const { splitIntoSpeechChunks } = await modPromise;
  assert.deepEqual(splitIntoSpeechChunks(''), []);
  assert.deepEqual(splitIntoSpeechChunks('   '), []);
  const three = splitIntoSpeechChunks('Hello there. Tell me about yourself. Why this role?');
  assert.equal(three.length, 3);
  assert.equal(three[2], 'Why this role?');
  // A very long run-on with no terminators is hard-wrapped, never dropped.
  const long = splitIntoSpeechChunks(Array.from({ length: 120 }, (_, i) => `word${i}`).join(' '), 100);
  assert.ok(long.length > 1);
  assert.ok(long.every(c => c.length <= 100));
});
