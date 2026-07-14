const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-top-picks-'));
const outfile = path.join(outdir, 'sona-top-picks.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'top-picks.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const { findDeepLinkedPacket, getSafeExternalUrl, selectSonaTopPicks } = require(outfile);

test('mobile review exposes at most three complete, unique picks', () => {
  const picks = selectSonaTopPicks([
    { queueId: 'one', title: 'Security Engineer', company: 'A' },
    { queueId: 'one', title: 'Duplicate', company: 'A' },
    { queueId: 'missing-company', title: 'Incomplete', company: '' },
    { queueId: 'two', title: 'Cloud Engineer', company: 'B' },
    { queueId: 'three', title: 'Platform Engineer', company: 'C' },
    { queueId: 'four', title: 'Fourth role', company: 'D' },
  ]);

  assert.deepEqual(picks.map(pick => pick.queueId), ['one', 'two', 'three']);
});

test('packet deep links require an exact queue id', () => {
  const items = [{ id: 'packet-1' }, { id: 'packet-10' }];
  assert.equal(findDeepLinkedPacket(items, '?packet=packet-1')?.id, 'packet-1');
  assert.equal(findDeepLinkedPacket(items, '?packet=packet')?.id, undefined);
  assert.equal(findDeepLinkedPacket(items, '?view=queue'), null);
});

test('oversized packet ids are rejected', () => {
  const oversized = `?packet=${'x'.repeat(201)}`;
  assert.equal(findDeepLinkedPacket([{ id: 'x'.repeat(201) }], oversized), null);
});

test('external posting links allow only bounded http and https URLs', () => {
  assert.equal(getSafeExternalUrl('https://jobs.example.com/role?id=1'), 'https://jobs.example.com/role?id=1');
  assert.equal(getSafeExternalUrl('http://localhost:3000/posting'), 'http://localhost:3000/posting');
  assert.equal(getSafeExternalUrl('javascript:alert(1)'), null);
  assert.equal(getSafeExternalUrl('data:text/html,hello'), null);
  assert.equal(getSafeExternalUrl('/relative-posting'), null);
  assert.equal(getSafeExternalUrl(`https://example.com/${'x'.repeat(2049)}`), null);
});
