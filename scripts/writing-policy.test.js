const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
let m;
test.before(async () => {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'writing-policy-')), 'module.cjs');
  await build({ stdin: { contents: "export * from './lib/writing-quality'; export * from './lib/writing-prompts'; export { detectAI } from './lib/ai-detection';", resolveDir: path.resolve(__dirname, '..') }, outfile, bundle: true, platform: 'node', format: 'cjs' });
  m = require(outfile);
});
test('formal conventional prose and low style readings cannot trigger a failed rewrite', () => {
  const text = 'Furthermore, we leverage a comprehensive framework to facilitate the analysis; this terminology appears in the supplied project brief.';
  const quality = m.evaluateHumanizationQuality({ originalText: text, rewrittenText: text, protectedTerms: [], lengthMode: 'exact', originalDetection: { humanScore: 30 }, finalDetection: { humanScore: 10 } });
  assert.equal(quality.passed, true);
  assert.equal(quality.gates.find(g => g.id === 'trust_score').status, 'warn');
  assert.notEqual(quality.gates.find(g => g.id === 'ai_artifacts').status, 'fail');
  assert.match(quality.gates.find(g => g.id === 'trust_score').detail, /not a quality target/);
});
test('length target reports deviation without dropping factual content to force acceptance', () => {
  const text = Array(100).fill('word').join(' ');
  const quality = m.evaluateHumanizationQuality({ originalText: text, rewrittenText: Array(115).fill('word').join(' '), protectedTerms: [], lengthMode: 'exact' });
  assert.equal(quality.gates.find(g => g.id === 'length').status, 'warn');
});
test('every tone preserves uncertainty and forbids detector optimization or imported voice facts', () => {
  for (const tone of ['professional','creative','casual','academic','confident']) {
    const prompt = m.buildHumanizePrompt('resume', tone, 'expand');
    assert.match(prompt, /Do not optimize for detector scores/);
    assert.match(prompt, /Never import its facts/);
    assert.match(prompt, /No blanket vocabulary or punctuation bans/);
    assert.match(prompt, /Never strengthen participation into ownership/);
    assert.match(prompt, /Never invent supporting details/);
    assert.doesNotMatch(prompt, /NEVER use em-dashes|no hedging|Maximum burstiness|Inject sensory details/);
  }
  assert.match(m.buildUniquenessPrompt(), /No search or reference database is available/);
});
