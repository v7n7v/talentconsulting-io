const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

async function load() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-groups-'));
  const outfile = path.join(dir, 'groups.cjs');
  await build({ entryPoints: [path.join(__dirname, '..', 'lib', 'resume-library-groups.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const result = require(outfile);
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

function version(id, parentVersionId, updated_at = '2026-01-01') {
  return { id, user_id: 'u', version_name: id, content: {}, skill_graph: null, mode: 'technical', is_active: true, created_at: updated_at, updated_at, metadata: { workspace: parentVersionId === undefined ? {} : { parentVersionId } } };
}

test('groups recorded parent lineage and leaves missing-parent legacy records available', async () => {
  const { groupResumeVersions } = await load();
  const input = [version('root'), version('newer', 'root', '2026-03-01'), version('orphan-child', 'missing'), version('legacy')];
  const groups = groupResumeVersions(input);
  assert.deepEqual(groups.map(group => group.versions.map(item => item.id)), [['newer', 'root'], ['legacy'], ['orphan-child']]);
  assert.equal(groups.flatMap(group => group.versions).length, input.length);
});

test('cycles remain a visible group and unrelated records are never inferred by name', async () => {
  const { groupResumeVersions } = await load();
  const input = [version('cycle-a', 'cycle-b'), version('cycle-b', 'cycle-a'), version('same-name'), { ...version('also-same-name'), version_name: 'same-name' }];
  const groups = groupResumeVersions(input);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.find(group => group.versions.some(item => item.id === 'cycle-a')).versions.map(item => item.id), ['cycle-a', 'cycle-b']);
  assert.equal(groups.flatMap(group => group.versions).length, input.length);
});

test('filters matching revisions inside the recorded lineage group', async () => {
  const { groupResumeVersions, filterResumeVersionGroups } = await load();
  const root = version('root');
  const middle = { ...version('middle', 'root'), metadata: { archived: true, workspace: { parentVersionId: 'root' } } };
  const latest = version('latest', 'middle', '2026-03-01');
  const groups = groupResumeVersions([root, middle, latest]);
  const active = filterResumeVersionGroups(groups, item => item.metadata?.archived !== true);
  const archived = filterResumeVersionGroups(groups, item => item.metadata?.archived === true);
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].versions.map(item => item.id), ['latest', 'root']);
  assert.equal(active[0].id, groups[0].id);
  assert.deepEqual(archived[0].versions.map(item => item.id), ['middle']);
});

test('groups deep recorded lineage without recursive stack growth', async () => {
  const { groupResumeVersions } = await load();
  const count = 12000;
  const input = Array.from({ length: count }, (_, index) => version(`revision-${index}`, index === 0 ? undefined : `revision-${index - 1}`));
  const groups = groupResumeVersions(input);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].versions.length, count);
});
