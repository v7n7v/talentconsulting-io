const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadChatFormatting() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-chat-formatting-'));
  const outfile = path.join(outdir, 'chat-ui-formatting.cjs');

  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'chat-ui-formatting.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });

  return require(outfile);
}

const {
  formatSonaPlanSteps,
  formatSonaPlanTitle,
  normalizeSonaMessage,
  parseSonaMessage,
} = loadChatFormatting();

test('formatSonaPlanSteps does not crash when plannedSteps is missing', () => {
  assert.equal(formatSonaPlanSteps({ capabilityId: 'jobs.find_rank_prepare' }), 'Plan ready');
  assert.equal(formatSonaPlanSteps({ capabilityId: 'jobs.find_rank_prepare', approvalRequired: true }), 'Review required');
});

test('formatSonaPlanSteps labels known steps and preserves unknown steps', () => {
  assert.equal(formatSonaPlanSteps({ plannedSteps: ['understand', 'plan', 'custom_step'] }), 'Understand -> Plan -> custom_step');
});

test('formatSonaPlanTitle uses known capability labels with safe fallback', () => {
  assert.equal(formatSonaPlanTitle({ capabilityId: 'jobs.find_rank_prepare' }), 'Find and rank jobs');
  assert.equal(formatSonaPlanTitle({ intent: 'Review queue' }), 'Review queue');
  assert.equal(formatSonaPlanTitle(null), 'Sona plan');
});

test('normalizeSonaMessage turns raw markdown headings into chat labels', () => {
  assert.equal(
    normalizeSonaMessage('### Fit Score + Verdict\n\n- **Fit Score:** 98%'),
    'Fit Score + Verdict:\n\n- **Fit Score:** 98%',
  );
});

test('parseSonaMessage returns semantic headings and grouped lists', () => {
  assert.deepEqual(
    parseSonaMessage('### Key Considerations\n\n- **Salary:** $120k\n- Location: New Jersey\n\nNext: Review the draft.'),
    [
      { type: 'heading', text: 'Key Considerations' },
      { type: 'list', ordered: false, items: ['**Salary:** $120k', 'Location: New Jersey'] },
      { type: 'paragraph', text: 'Next: Review the draft.' },
    ],
  );
});
