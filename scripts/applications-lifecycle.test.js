const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app/suite/applications/page.tsx'),
  'utf8',
);
const resumeSource = fs.readFileSync(
  path.join(__dirname, '..', 'app/suite/resume/page.tsx'),
  'utf8',
);
const compiled = buildSync({ entryPoints: [path.join(__dirname, '..', 'lib/applications-lifecycle.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent' });
const lifecycleModule = new Module(path.join(__dirname, 'applications-lifecycle.cjs'), module);
lifecycleModule.filename = path.join(__dirname, 'applications-lifecycle.cjs');
lifecycleModule.paths = Module._nodeModulePaths(path.join(__dirname, '..'));
lifecycleModule._compile(compiled.outputFiles[0].text, lifecycleModule.filename);

test('application deep links remain in the URL until the drawer closes', () => {
  assert.match(source, /void openDrawer\(targetApp\);/);
  assert.doesNotMatch(source, /openDrawer\(targetApp\)\.finally\(cleanApplicationParams\)/);
  assert.match(source, /function closeDrawer\(\)[\s\S]*params\.delete\('application'\)/);
  assert.match(source, /params\.delete\('action'\)/);
});

test('application and linked-resume loads reject stale account or drawer responses', () => {
  assert.match(source, /applicationLoadRequestRef/);
  assert.match(source, /drawerRequestRef/);
  assert.match(source, /lifecycleRef\.current\.isCurrent\(lifecycleToken, useStore\.getState\(\)\.user\?\.uid/);
  assert.match(source, /requestId !== drawerRequestRef\.current/);
  assert.match(source, /selectedApp\.resume_version_id !== linkedResume\.id/);
});

test('Strict Mode effect setup restores the mounted guard after cleanup', () => {
  const setup = source.match(/useEffect\(\(\) => \{\s*mountedRef\.current = true;[\s\S]*?\}, \[\]\);/);
  assert.ok(setup);
  assert.match(setup[0], /mountedRef\.current = false/);
  assert.match(resumeSource, /sourceParseMountedRef\.current = true/);
  assert.match(resumeSource, /sourceParseMountedRef\.current = false/);
});

test('runtime lifecycle guard accepts the live response and rejects stale work', () => {
  const guard = lifecycleModule.exports.createApplicationsLifecycleGuard();
  guard.setup('account-a');
  const first = guard.begin('account-a');
  guard.cleanup();
  guard.setup('account-a');
  const second = guard.begin('account-a');
  assert.equal(guard.isCurrent(first, 'account-a'), false);
  assert.equal(guard.isCurrent(second, 'account-b'), false);
  assert.equal(guard.isCurrent(second, 'account-a'), true);
  guard.begin('account-b');
  assert.equal(guard.isCurrent(second, 'account-a'), false);
});
