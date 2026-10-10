'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runtime = require('./npm-runtime.cjs');
const distribution = require('./npm-distribution.cjs');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'npm-runtime-a3-')); }
function fixtureTree(parent) {
  const destination = path.join(parent, 'cache');
  const distRoot = path.join(destination, 'distribution');
  const files = [
    { path: 'distribution/package/bin/npm-cli.js', bytes: Buffer.from('# verified fixture\n'), mode: 0o644 },
    { path: 'distribution/package/bin/npx-cli.js', bytes: Buffer.from('# verified fixture\n'), mode: 0o644 },
    { path: 'distribution/toolchain-inputs.lock.json', bytes: Buffer.from('{"schemaVersion":1}\n'), mode: 0o644 },
    { path: 'distribution/tree-manifest.json', bytes: Buffer.from('{"fixture":true}\n'), mode: 0o644 },
  ];
  for (const item of files) {
    const target = path.join(destination, ...item.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, item.bytes, { mode: item.mode }); fs.chmodSync(target, item.mode);
  }
  for (const dir of [distRoot, path.join(distRoot, 'package'), path.join(distRoot, 'package/bin')]) fs.chmodSync(dir, 0o755);
  fs.chmodSync(destination, 0o755);
  return { destination, fresh: { profile: { distributionId: 'fixture' }, verified: { treeSha256: 'fixture', entries: files }, lockBytes: files[2].bytes } };
}

test('cache hit verifies every physical file, mode, directory, and rejects tampering without repair', () => {
  const parent = tempDir();
  try {
    const { destination, fresh } = fixtureTree(parent);
    assert.deepEqual(runtime.verifyCachedTree(destination, fresh), { files: 4, treeSha256: 'fixture' });
    fs.writeFileSync(path.join(destination, 'unexpected-sibling'), 'extra');
    assert.throws(() => runtime.verifyCachedTree(destination, fresh), error => error.code === runtime.ERR.CACHE);
    fs.unlinkSync(path.join(destination, 'unexpected-sibling'));
    const tampered = path.join(destination, 'distribution/package/bin/npm-cli.js');
    fs.writeFileSync(tampered, 'changed');
    assert.throws(() => runtime.verifyCachedTree(destination, fresh), error => error.code === runtime.ERR.CACHE);
    assert.equal(fs.readFileSync(tampered, 'utf8'), 'changed');
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('cache hit rejects extra directories and symlinks', () => {
  const parent = tempDir();
  try {
    const { destination, fresh } = fixtureTree(parent);
    fs.mkdirSync(path.join(destination, 'distribution', 'unexpected'));
    assert.throws(() => runtime.verifyCachedTree(destination, fresh), error => error.code === runtime.ERR.CACHE);
    fs.rmdirSync(path.join(destination, 'distribution', 'unexpected'));
    fs.symlinkSync('npm-cli.js', path.join(destination, 'distribution/package/bin/alias'));
    assert.throws(() => runtime.verifyCachedTree(destination, fresh), error => error.code === runtime.ERR.CACHE);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('cache identity changes with selected input records and platform tuple', () => {
  const parent = tempDir();
  try {
    const base = { identity: { inputRecords: [{ path: 'a', sha256: '1' }], publicNpmPolicy: { strictAllowScripts: true } }, platform: { platform: 'linux', arch: 'x64', libc: 'musl' }, node: { version: runtime.NODE_VERSION, realpath: '/runtime/node', sha256: 'a'.repeat(64) } };
    const key = runtime.cachePaths(parent, base).key;
    assert.notEqual(key, runtime.cachePaths(parent, { ...base, identity: { ...base.identity, inputRecords: [{ path: 'a', sha256: '2' }] } }).key);
    assert.notEqual(key, runtime.cachePaths(parent, { ...base, platform: { ...base.platform, libc: 'glibc-2.36' } }).key);
    assert.notEqual(key, runtime.cachePaths(parent, { ...base, node: { ...base.node, sha256: 'b'.repeat(64) } }).key);
    const originalRealpath = fs.realpathSync;
    try {
      fs.realpathSync = function (filename, ...args) {
        if (path.resolve(filename) === path.resolve(__dirname, 'npm-runtime.cjs')) return '/other/scripts/npm-runtime.cjs';
        return originalRealpath.call(this, filename, ...args);
      };
      assert.notEqual(key, runtime.cachePaths(parent, base).key);
    } finally { fs.realpathSync = originalRealpath; }
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('bootstrap materializes the pinned archive offline, verifies cache hits, and never repairs tampered bytes', () => {
  const parent = tempDir();
  const profile = distribution.loadProfile();
  try {
    const selected = runtime.prepare(parent);
    assert.equal(selected.verified.archiveSha256, profile.archive.sha256);
    assert.equal(runtime.verifyCachedTree(selected.paths.distribution, selected).files, 2016);
    const identity = runtime.identity(parent);
    assert.equal(identity.distributionId, profile.distributionId);
    assert.equal(identity.npmRealpath, fs.realpathSync(selected.npm));
    assert.equal(identity.npxRealpath, fs.realpathSync(selected.npx));
    assert.equal(identity.inputRecords.length > 0, true);
    const npmCli = path.join(selected.paths.distribution, 'distribution/package/bin/npm-cli.js');
    fs.appendFileSync(npmCli, '\ncache tamper\n');
    assert.throws(() => runtime.prepare(parent), error => error.code === runtime.ERR.CACHE);
    assert.match(fs.readFileSync(npmCli, 'utf8'), /cache tamper/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('npm and npx reject global, script, cache, registry, and policy overrides', () => {
  for (const argv of [
    ['ci', '-g'], ['ci', '--global'], ['ci', '--ignore-scripts'], ['ci', '--strict-allow-scripts=false'],
    ['ci', '--legacy-peer-deps=false'], ['ci', '--registry=https://other.invalid'], ['ci', '--userconfig', '/tmp/other'],
    ['ci', '--script-shell=/bin/sh'], ['ci', '--dangerously-allow-all-scripts'],
    ['ci', '--no-dangerously-allow-all-scripts'], ['ci', '-dag'], ['ci', '--dangerously-allow-all-scripts=false'],
  ]) {
    assert.throws(() => runtime.checkArgs('npm', argv), error => error.code === runtime.ERR.ARGV, argv.join(' '));
  }
  // The short-looking form is rejected as unreviewed input; this test makes no claim that npm accepts it as an abbreviation.
  for (const args of [['--cache', '/tmp/host'], ['--dangerously-allow-all-scripts', 'pkg'], ['--no-dangerously-allow-all-scripts', 'pkg'], ['-dag', 'pkg']]) {
    assert.throws(() => runtime.checkArgs('npx', args), error => error.code === runtime.ERR.ARGV, args.join(' '));
  }
  assert.deepEqual(runtime.checkArgs('npm', ['ci', '--foreground-scripts']), ['ci', '--foreground-scripts']);
  assert.deepEqual(runtime.checkArgs('npm', ['--version']), ['--version']);
  assert.deepEqual(runtime.checkArgs('npx', ['--version']), ['--version']);
  assert.deepEqual(runtime.checkArgs('npm', ['run', 'lint', '--', '--dangerously-allow-all-scripts', '-g']), ['run', 'lint', '--', '--dangerously-allow-all-scripts', '-g']);
});

test('platform gate rejects non-target runtime and shims are deterministic shell-safe wrappers', () => {
  assert.throws(() => runtime.validatePlatform('darwin', 'x64', runtime.NODE_VERSION, '2.43', false), error => error.code === runtime.ERR.PLATFORM);
  assert.throws(() => runtime.validatePlatform('linux', 'x64', 'v22.23.1', '2.43', false), error => error.code === runtime.ERR.PLATFORM);
  assert.throws(() => runtime.validatePlatform('linux', 'x64', runtime.NODE_VERSION, undefined, false), error => error.code === runtime.ERR.PLATFORM);
  assert.deepEqual(runtime.platformIdentity().platform, 'linux');
  const temp = tempDir(); const helper = path.join(temp, "helper's.cjs"); const parent = path.join(temp, "private cache's");
  fs.writeFileSync(helper, ''); fs.mkdirSync(parent);
  const shim = runtime.shimBytes(helper, parent, 'npm').toString('utf8');
  assert.equal(shim, runtime.shimBytes(helper, parent, 'npm').toString('utf8'));
  assert.match(shim, /^#!\/bin\/sh\nexec /);
  assert.match(shim, /helper/);
  assert.match(shim, /\\''/);
  fs.rmSync(temp, { recursive: true, force: true });
});

test('mocked child execution preserves exact argv, cwd, environment and exit or signal outcome', () => {
  const calls = [];
  const child = runtime.runChild('/verified/node', ['/verified/npm-cli.js', 'ci'], { PATH: '/private/bin' }, (...args) => { calls.push(args); return { status: 7, signal: null }; }, '/repo');
  assert.deepEqual(child, { status: 7, signal: null });
  assert.equal(calls[0][0], '/verified/node');
  assert.deepEqual(calls[0][1], ['/verified/npm-cli.js', 'ci']);
  assert.equal(calls[0][2].cwd, '/repo');
  assert.deepEqual(runtime.runChild('/verified/node', [], {}, () => ({ status: null, signal: 'SIGTERM' })), { status: null, signal: 'SIGTERM' });
  assert.throws(() => runtime.runChild('/verified/node', [], {}, () => ({ status: null, signal: null })), error => error.code === runtime.ERR.CHILD);
});

test('ambient npm configuration and Node injection variables are absent from child environment', () => {
  const parent = tempDir(); const state = path.join(parent, 'state'); fs.mkdirSync(state, { mode: 0o700 });
  const selected = { paths: { state, bin: path.join(parent, 'bin') }, node: { realpath: '/runtime/bin/node' } };
  const before = { NPM_CONFIG_REGISTRY: process.env.NPM_CONFIG_REGISTRY, NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS: process.env.NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS, NODE_OPTIONS: process.env.NODE_OPTIONS, NEXT_PUBLIC_A3_TEST: process.env.NEXT_PUBLIC_A3_TEST };
  try {
    process.env.NPM_CONFIG_REGISTRY = 'https://ambient.invalid'; process.env.NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS = 'true'; process.env.NODE_OPTIONS = '--require /tmp/ambient.js'; process.env.NEXT_PUBLIC_A3_TEST = 'public';
    const env = runtime.runtimeEnvironment(selected);
    assert.equal(env.NPM_CONFIG_REGISTRY, runtime.REGISTRY);
    assert.equal(env.NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS, 'false');
    assert.equal(env.NPM_CONFIG_GLOBALCONFIG.startsWith(state), true);
    assert.equal(fs.readFileSync(env.NPM_CONFIG_GLOBALCONFIG, 'utf8'), '');
    assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.NPM_CONFIG_USERCONFIG.startsWith(state), true);
    assert.equal(env.NEXT_PUBLIC_A3_TEST, 'public');
    assert.match(fs.readFileSync(env.NPM_CONFIG_USERCONFIG, 'utf8'), /strict-allow-scripts=true/);
  } finally {
    for (const [key, value] of Object.entries(before)) value === undefined ? delete process.env[key] : process.env[key] = value;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('mocked npm execution preserves the selected CLI and exact application script arguments', () => {
  const parent = tempDir();
  try {
    const selected = runtime.prepare(parent);
    const calls = [];
    const result = runtime.execute(parent, 'npm', ['run', 'lint', '--', '--dangerously-allow-all-scripts', '-g'], (...args) => {
      calls.push(args); return { status: 0, signal: null };
    });
    assert.deepEqual(result, { status: 0, signal: null });
    assert.equal(calls[0][0], selected.node.realpath);
    assert.deepEqual(calls[0][1], [selected.npm, 'run', 'lint', '--', '--dangerously-allow-all-scripts', '-g']);
    assert.equal(calls[0][2].cwd, runtime.ROOT);
    assert.equal(calls[0][2].env.NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS, 'false');
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});

test('post-child verification rejects altered shims, private config, and derived global config', () => {
  for (const kind of ['shim', 'userconfig', 'globalconfig']) {
    const parent = tempDir();
    try {
      const selected = runtime.prepare(parent);
      const spawn = () => {
        if (kind === 'shim') fs.appendFileSync(selected.shimNpm, '\nchanged\n');
        if (kind === 'userconfig') fs.appendFileSync(path.join(selected.paths.state, 'npmrc'), 'ignore-scripts=true\n');
        if (kind === 'globalconfig') fs.writeFileSync(path.join(selected.paths.state, 'global-npmrc'), 'dangerously-allow-all-scripts=true\n');
        return { status: 0, signal: null };
      };
      assert.throws(() => runtime.execute(parent, 'npm', ['--version'], spawn), error => error.code === runtime.ERR.CACHE, kind);
    } finally { fs.rmSync(parent, { recursive: true, force: true }); }
  }
});

test('POSIX shim quoting preserves apostrophes and spaces in helper, cache path, and app arguments', () => {
  const parent = tempDir(); const privateDir = path.join(parent, "private cache's"); fs.mkdirSync(privateDir);
  const helper = path.join(parent, "record argv's.cjs");
  const shimPath = path.join(privateDir, 'npm');
  fs.writeFileSync(helper, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  fs.writeFileSync(shimPath, runtime.shimBytes(helper, privateDir, 'npm'), { mode: 0o755 }); fs.chmodSync(shimPath, 0o755);
  try {
    const args = ["argument with spaces", "it's an apostrophe", '--'];
    const result = spawnSync('/bin/sh', [shimPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ['exec', '--cache-parent', privateDir, '--', 'npm', ...args]);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});


test('offline preparation creates private cache/config before restore and cache hits reject missing policy files', () => {
  const parent = tempDir();
  try {
    const selected = runtime.prepare(parent);
    const env = runtime.runtimeEnvironment(selected, { allowCreate: false });
    assert.equal(fs.statSync(path.dirname(env.NPM_CONFIG_CACHE)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(env.NPM_CONFIG_CACHE).mode & 0o777, 0o700);
    assert.equal(fs.statSync(env.NPM_CONFIG_GLOBALCONFIG).mode & 0o777, 0o600);
    fs.unlinkSync(env.NPM_CONFIG_GLOBALCONFIG);
    assert.throws(() => runtime.identity(parent), error => error.code === runtime.ERR.CACHE);
    assert.equal(fs.existsSync(env.NPM_CONFIG_GLOBALCONFIG), false);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
