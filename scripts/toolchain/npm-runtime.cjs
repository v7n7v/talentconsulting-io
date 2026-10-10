'use strict';

// A3 selected npm runtime boundary. This prepares and verifies a private cache;
// candidate npm is invoked only through the explicit `exec` command.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const distribution = require('./npm-distribution.cjs');
const buildContext = require('../docker-build-context.js');

const ROOT = path.resolve(__dirname, '../..');
const NODE_VERSION = 'v22.23.2';
const REGISTRY = 'https://registry.npmjs.org/';
const SYSTEM_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const ERR = Object.freeze({ POLICY: 'ERUNTIME_POLICY', CACHE: 'ERUNTIME_CACHE', PLATFORM: 'ERUNTIME_PLATFORM', ARGV: 'ERUNTIME_ARGV', CHILD: 'ERUNTIME_CHILD' });
function fail(code, message) { const error = new Error(`${code}: ${message}`); error.code = code; throw error; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function assertNoSymlinkAncestry(target) {
  const absolute = path.resolve(target); let current = path.parse(absolute).root;
  for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try { if (fs.lstatSync(current).isSymbolicLink()) fail(ERR.CACHE, 'symlink in cache path ancestry'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function ownedPrivateDirectory(dir, { create = false } = {}) {
  const resolved = path.resolve(dir);
  if (create && !fs.existsSync(resolved)) fs.mkdirSync(resolved, { mode: 0o700 });
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0) {
    fail(ERR.CACHE, 'cache parent must be an existing real directory owned by this user and not group/other writable');
  }
  assertNoSymlinkAncestry(resolved);
  return resolved;
}
function ensurePrivateDirectory(dir, { allowCreate = true } = {}) {
  if (!fs.existsSync(dir)) {
    if (!allowCreate) fail(ERR.CACHE, 'private runtime directory is missing');
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) {
    fail(ERR.CACHE, `private runtime directory is not a mode-0700 owned directory: ${path.basename(dir)}`);
  }
  return dir;
}
function verifyProjectNpmrc() {
  const filename = path.join(ROOT, '.npmrc');
  if (!fs.existsSync(filename)) return null;
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(ERR.POLICY, 'project npm configuration is not a regular file');
  const bytes = fs.readFileSync(filename);
  // Hash before comparison so diagnostics and callers can identify that the
  // file was examined without ever exposing its contents.
  const digest = sha256(bytes);
  const approved = Buffer.from('legacy-peer-deps=true\nstrict-allow-scripts=true\n');
  if (digest !== sha256(approved) || !bytes.equals(approved)) fail(ERR.POLICY, 'project npm configuration is outside approved public policy');
  return digest;
}
function validatePlatform(platform, arch, version, glibc, muslLoader) {
  if (platform !== 'linux' || arch !== 'x64' || version !== NODE_VERSION) fail(ERR.PLATFORM, `requires Linux x64 Node ${NODE_VERSION}`);
  let libc;
  if (typeof glibc === 'string' && glibc) libc = `glibc-${glibc}`;
  if (!libc && muslLoader) libc = 'musl';
  if (!libc) fail(ERR.PLATFORM, 'cannot identify glibc runtime or verified x86_64 musl loader');
  return { platform, arch, libc };
}
function platformIdentity() {
  let glibc;
  try { glibc = process.report?.getReport?.()?.header?.glibcVersionRuntime; }
  catch { /* Fall through to the explicit musl loader check. */ }
  return validatePlatform(process.platform, process.arch, process.version, glibc, fs.existsSync('/lib/ld-musl-x86_64.so.1'));
}
function freshIdentity() {
  verifyProjectNpmrc();
  if (typeof buildContext.installationIdentity !== 'function') fail(ERR.POLICY, 'docker-build-context installationIdentity(root) is unavailable');
  const identity = buildContext.installationIdentity(ROOT);
  const profile = distribution.loadProfile();
  if (!identity || identity.schemaVersion !== 2 || !/^[a-f0-9]{64}$/.test(identity.cacheKey || '')
      || identity.publicNpmPolicy?.legacyPeerDeps !== true || identity.publicNpmPolicy?.strictAllowScripts !== true
      || identity.toolchain?.distributionId !== distribution.loadProfile().distributionId
      || identity.toolchain?.nodeVersion !== '22.23.2') {
    fail(ERR.POLICY, 'installation identity does not describe the selected qualification candidate and required public npm policy');
  }
  const { cacheKey, ...identityPayload } = identity;
  if (sha256(Buffer.from(JSON.stringify(identityPayload))) !== cacheKey
      || !Array.isArray(identity.inputRecords) || identity.inputRecords.length !== buildContext.INSTALL_INPUTS.length) fail(ERR.POLICY, 'installation identity cache key or input inventory is invalid');
  for (const [index, record] of identity.inputRecords.entries()) {
    const relative = buildContext.INSTALL_INPUTS[index];
    if (!record || record.path !== relative || !Number.isSafeInteger(record.size) || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) fail(ERR.POLICY, `installation identity input record is invalid at index ${index}`);
    const filename = path.join(ROOT, ...relative.split('/'));
    assertNoSymlinkAncestry(filename);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(ERR.POLICY, `installation identity input is not a regular file: ${relative}`);
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== record.size || sha256(bytes) !== record.sha256) fail(ERR.POLICY, `installation identity input bytes changed: ${relative}`);
  }
  const { bytes: lockBytes } = distribution.loadExternalLock(profile);
  const archive = fs.readFileSync(distribution.ARCHIVE_PATH);
  const verified = distribution.verifyArchiveBytes(archive, profile, lockBytes);
  for (const [field, actual] of [['archiveSha256', verified.archiveSha256], ['archiveIntegrity', verified.archiveIntegrity], ['treeSha256', verified.treeSha256], ['inputLockSha256', verified.embeddedLockSha256]]) {
    const expected = identity.toolchain[field];
    if (expected !== actual) fail(ERR.POLICY, `fresh A1 verification disagrees with installation identity: ${field}`);
  }
  const nodePath = fs.realpathSync(process.execPath);
  return { identity: stable(identity), platform: platformIdentity(), node: { version: process.version, realpath: nodePath, sha256: sha256(fs.readFileSync(nodePath)) }, verified, profile, lockBytes };
}
function cachePaths(parent, fresh) {
  const key = sha256(Buffer.from(JSON.stringify(stable({ identity: fresh.identity, platform: fresh.platform, node: fresh.node, helperRealpath: fs.realpathSync(__filename) }))));
  return { key, distribution: path.join(parent, `npm-${key}`), bin: path.join(parent, `npm-bin-${key}`), state: path.join(parent, `npm-state-${key}`) };
}
function walkPhysical(root) {
  const files = new Map(); const dirs = new Set(['']);
  function visit(abs, rel) {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name; const child = path.join(abs, entry.name); const stat = fs.lstatSync(child);
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) fail(ERR.CACHE, `cached tree contains a link or special file: ${childRel}`);
      if (entry.isDirectory()) { dirs.add(childRel); visit(child, childRel); }
      else files.set(childRel, { abs: child, stat });
    }
  }
  visit(root, ''); return { files, dirs };
}
function verifyCachedTree(destination, fresh) {
  const destinationStat = fs.lstatSync(destination);
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink() || destinationStat.uid !== process.getuid?.() || (destinationStat.mode & 0o777) !== 0o755) fail(ERR.CACHE, 'cache destination is not a real owned directory');
  if (JSON.stringify(fs.readdirSync(destination)) !== JSON.stringify(['distribution'])) fail(ERR.CACHE, 'cache destination has missing or unexpected entries');
  const distRoot = path.join(destination, 'distribution');
  const rootStat = fs.lstatSync(distRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail(ERR.CACHE, 'cached distribution root is not a real directory');
  // The external archive verification supplies the authoritative bytes and modes
  // for all 2,016 physical members, including the internal manifest and lock.
  const actual = walkPhysical(distRoot); const expectedFiles = new Map(); const expectedDirs = new Set(['']);
  const addDirs = rel => { const parts = rel.split('/'); for (let i = 1; i < parts.length; i += 1) expectedDirs.add(parts.slice(0, i).join('/')); };
  for (const entry of fresh.verified.entries) {
    if (!entry.path.startsWith('distribution/')) fail(ERR.CACHE, 'A1 verifier returned a path outside distribution');
    const rel = entry.path.slice('distribution/'.length);
    expectedFiles.set(rel, { bytes: entry.bytes, mode: entry.mode }); addDirs(rel);
  }
  if (actual.files.size !== expectedFiles.size || actual.dirs.size !== expectedDirs.size
      || [...expectedDirs].some(dir => !actual.dirs.has(dir)) || [...expectedFiles.keys()].some(rel => !actual.files.has(rel))) fail(ERR.CACHE, 'cached tree has missing or unexpected paths');
  for (const dir of actual.dirs) {
    const abs = dir ? path.join(distRoot, ...dir.split('/')) : distRoot;
    if ((fs.lstatSync(abs).mode & 0o777) !== 0o755) fail(ERR.CACHE, `cached directory mode mismatch: ${dir || 'distribution'}`);
  }
  for (const [rel, expected] of expectedFiles) {
    const got = actual.files.get(rel);
    const bytes = got && fs.readFileSync(got.abs);
    if (!got || (got.stat.mode & 0o777) !== expected.mode || !bytes.equals(expected.bytes)) fail(ERR.CACHE, `cached file bytes or mode mismatch: ${rel}`);
  }
  return { files: actual.files.size, treeSha256: fresh.verified.treeSha256 };
}
function quote(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }
function shimBytes(helper, cacheParent, executable) {
  return Buffer.from(`#!/bin/sh\nexec ${quote(fs.realpathSync(process.execPath))} ${quote(fs.realpathSync(helper))} exec --cache-parent ${quote(cacheParent)} -- ${quote(executable)} "$@"\n`);
}
function ensureShims(paths, parent, { allowCreate = false } = {}) {
  const helper = path.resolve(__filename);
  const directoryWasMissing = !fs.existsSync(paths.bin);
  if (directoryWasMissing) {
    if (!allowCreate) fail(ERR.CACHE, 'content-addressed shim directory is missing');
    fs.mkdirSync(paths.bin, { mode: 0o700 });
  }
  const st = fs.lstatSync(paths.bin);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) fail(ERR.CACHE, 'shim directory is not private and owned');
  const expected = new Map([['npm', shimBytes(helper, parent, 'npm')], ['npx', shimBytes(helper, parent, 'npx')]]);
  const found = fs.readdirSync(paths.bin).sort();
  if (JSON.stringify(found) !== JSON.stringify([...expected.keys()].sort()) && !(allowCreate && directoryWasMissing && found.length === 0)) fail(ERR.CACHE, 'shim directory is missing expected entries or contains unexpected entries');
  for (const [name, bytes] of expected) {
    const file = path.join(paths.bin, name);
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o755 || !fs.readFileSync(file).equals(bytes)) fail(ERR.CACHE, `cached shim differs: ${name}`);
    } else {
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o755);
      try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, 0o755); } finally { fs.closeSync(fd); }
    }
  }
}
function prepare(cacheParent, { requireExisting = false } = {}) {
  const parent = ownedPrivateDirectory(cacheParent);
  const fresh = freshIdentity(); const paths = cachePaths(parent, fresh);
  const isCacheHit = fs.existsSync(paths.distribution);
  if (!isCacheHit) {
    if (requireExisting) fail(ERR.CACHE, 'identity requires an existing content-addressed distribution cache');
    distribution.materialize(paths.distribution);
  }
  verifyCachedTree(paths.distribution, fresh);
  ensureShims(paths, parent, { allowCreate: !isCacheHit });
  ensurePrivateDirectory(paths.state, { allowCreate: !isCacheHit });
  const npm = path.join(paths.distribution, 'distribution/package/bin/npm-cli.js');
  const npx = path.join(paths.distribution, 'distribution/package/bin/npx-cli.js');
  for (const filename of [npm, npx]) if (!fs.realpathSync(filename).startsWith(`${fs.realpathSync(paths.distribution)}${path.sep}`)) fail(ERR.CACHE, 'npm CLI escaped selected distribution');
  const selected = { ...fresh, parent, paths, npm, npx, shimNpm: path.join(paths.bin, 'npm'), shimNpx: path.join(paths.bin, 'npx') };
  runtimeEnvironment(selected, { allowCreate: !isCacheHit });
  return selected;
}
function identity(cacheParent) {
  const selected = prepare(cacheParent, { requireExisting: true });
  return identityFromSelection(selected);
}
function checkArgs(command, args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) fail(ERR.ARGV, 'invalid child arguments');
  if (command === 'node') return args;
  if (args.length === 1 && ['--version', '-v'].includes(args[0]) && ['npm', 'npx'].includes(command)) return args;
  // Closed option sets prevent npm's aliases, negated forms and dangerous
  // lifecycle bypasses from overriding the selected policy. Arguments after
  // npm run's -- are owned by the application script, not npm configuration.
  const safeFlags = new Set(['--no-audit', '--no-fund', '--foreground-scripts', '--offline', '--prefer-offline', '--json', '--all', '--long', '--parseable']);
  if (command === 'npx') {
    let index = 0;
    while (index < args.length && ['--yes', '--no', '--no-install'].includes(args[index])) index += 1;
    if (index >= args.length || !args[index] || args[index].startsWith('-')) fail(ERR.ARGV, 'unsupported npx option or missing executable');
    return args;
  }
  if (command !== 'npm') fail(ERR.ARGV, 'command must be npm, npx, or node');
  const verb = args[0];
  if (['run', 'run-script', 'test'].includes(verb)) {
    const separator = args.indexOf('--');
    const own = separator === -1 ? args : args.slice(0, separator);
    if (verb === 'test' ? own.length !== 1 : own.length !== 2 || !own[1] || own[1].startsWith('-')) fail(ERR.ARGV, 'unsupported npm script arguments');
    return args;
  }
  if (verb === 'cache' && args.length === 2 && args[1] === 'verify') return args;
  if (!['ci', 'install', 'i', 'add', 'update', 'uninstall', 'remove', 'view', 'ls', 'audit', 'root'].includes(verb)) fail(ERR.ARGV, 'unsupported npm command');
  for (const arg of args.slice(1)) {
    if (arg.startsWith('-') && !safeFlags.has(arg)) fail(ERR.ARGV, 'npm policy override or unreviewed option is forbidden');
    if (['ci', 'audit', 'ls', 'root'].includes(verb) && !safeFlags.has(arg)) fail(ERR.ARGV, 'unsupported npm command argument');
  }
  return args;
}
function runtimeEnvironment(selected, { allowCreate = true } = {}) {
  const state = selected.paths.state; const home = ensurePrivateDirectory(path.join(state, 'home'), { allowCreate }); const tmp = ensurePrivateDirectory(path.join(state, 'tmp'), { allowCreate });
  const config = path.join(state, 'npmrc');
  const globalConfig = path.join(state, 'global-npmrc');
  if (fs.existsSync(globalConfig)) {
    const stat = fs.lstatSync(globalConfig);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || fs.readFileSync(globalConfig).length !== 0) fail(ERR.CACHE, 'derived global npm config differs');
  } else {
    if (!allowCreate) fail(ERR.CACHE, 'derived global npm config is missing');
    fs.writeFileSync(globalConfig, '', { mode: 0o600, flag: 'wx' });
  }
  const configBytes = Buffer.from(`registry=${REGISTRY}\nlegacy-peer-deps=true\nstrict-allow-scripts=true\ndangerously-allow-all-scripts=false\ncache=${path.join(state, 'cache')}\n`);
  if (fs.existsSync(config)) {
    const stat = fs.lstatSync(config);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || !fs.readFileSync(config).equals(configBytes)) fail(ERR.CACHE, 'derived npm config differs from public selected policy');
  } else {
    if (!allowCreate) fail(ERR.CACHE, 'derived npm config is missing');
    fs.writeFileSync(config, configBytes, { mode: 0o600, flag: 'wx' });
  }
  const cache = ensurePrivateDirectory(path.join(state, 'cache'), { allowCreate });
  const env = {
    PATH: `${selected.paths.bin}:${path.dirname(selected.node.realpath)}:${SYSTEM_PATH}`,
    HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
    NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS: 'false', NPM_CONFIG_CACHE: cache, NPM_CONFIG_REGISTRY: REGISTRY,
    NPM_CONFIG_LEGACY_PEER_DEPS: 'true', NPM_CONFIG_STRICT_ALLOW_SCRIPTS: 'true',
  };
  for (const [key, value] of Object.entries(process.env)) if (key.startsWith('NEXT_PUBLIC_') && /^[A-Z0-9_]+$/.test(key)) env[key] = value;
  return env;
}
function runChild(executable, argv, env, spawn = spawnSync, cwd = ROOT) {
  const child = spawn(executable, argv, { cwd, env, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.signal) return { status: null, signal: child.signal };
  if (Number.isInteger(child.status)) return { status: child.status, signal: null };
  fail(ERR.CHILD, 'child process did not return a status');
}
function execute(cacheParent, command, args, spawn = spawnSync) {
  const selected = prepare(cacheParent, { requireExisting: true });
  const checkedArgs = checkArgs(command, args);
  let executable; let argv;
  if (command === 'npm') { executable = selected.node.realpath; argv = [selected.npm, ...checkedArgs]; }
  else if (command === 'npx') { executable = selected.node.realpath; argv = [selected.npx, ...checkedArgs]; }
  else if (command === 'node') { executable = selected.node.realpath; argv = checkedArgs; }
  else fail(ERR.ARGV, 'command must be npm, npx, or node');
  const env = runtimeEnvironment(selected, { allowCreate: false });
  const child = runChild(executable, argv, env, spawn);
  // Detect replacement/tampering even when the child exits unsuccessfully.
  verifyCachedTree(selected.paths.distribution, selected);
  ensureShims(selected.paths, selected.parent);
  runtimeEnvironment(selected, { allowCreate: false });
  const current = freshIdentity();
  if (JSON.stringify(stable(current.identity)) !== JSON.stringify(stable(selected.identity))) fail(ERR.POLICY, 'installation inputs changed during child execution');
  if (JSON.stringify(stable(current.node)) !== JSON.stringify(stable(selected.node))
      || JSON.stringify(stable(current.platform)) !== JSON.stringify(stable(selected.platform))) fail(ERR.POLICY, 'Node runtime identity changed during child execution');
  if (Number.isInteger(child.status)) process.exitCode = child.status;
  if (child.signal) process.kill(process.pid, child.signal);
  return { status: child.status, signal: child.signal || null };
}
function parseCli(argv) {
  const args = [...argv]; const command = args.shift();
  if (!['prepare', 'identity', 'exec'].includes(command)) fail(ERR.ARGV, 'usage: npm-runtime.cjs prepare|identity|exec --cache-parent <existing-private-dir> [-- <npm|npx|node> ...]');
  if (args.shift() !== '--cache-parent') fail(ERR.ARGV, 'expected --cache-parent');
  const parent = args.shift(); if (!parent || parent.startsWith('-')) fail(ERR.ARGV, 'cache parent is required');
  if (command === 'exec') {
    if (args.shift() !== '--') fail(ERR.ARGV, 'exec requires -- before the child command');
    const executable = args.shift(); if (!executable) fail(ERR.ARGV, 'exec requires npm, npx, or node');
    const result = execute(parent, executable, args); return result;
  }
  if (args.length) fail(ERR.ARGV, 'unexpected arguments');
  const result = command === 'identity' ? identity(parent) : (() => { const selected = prepare(parent); return identityFromSelection(selected); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return result;
}
function identityFromSelection(selected) { return {
  distributionId: selected.verified.distributionId, cacheKey: selected.paths.key,
  installationCacheKey: selected.identity.cacheKey, inputRecords: selected.identity.inputRecords,
  toolchain: selected.identity.toolchain,
  archiveSha256: selected.verified.archiveSha256, archiveIntegrity: selected.verified.archiveIntegrity,
  inputLockSha256: selected.verified.embeddedLockSha256, treeSha256: selected.verified.treeSha256,
  nodeVersion: selected.node.version, nodeRealpath: selected.node.realpath, nodeSha256: selected.node.sha256, platform: selected.platform,
  npmRealpath: fs.realpathSync(selected.npm), npxRealpath: fs.realpathSync(selected.npx),
  npmShimRealpath: fs.realpathSync(selected.shimNpm), npxShimRealpath: fs.realpathSync(selected.shimNpx),
  cacheParent: selected.parent, statePath: selected.paths.state, npmContentCache: path.join(selected.paths.state, 'cache', '_cacache'), publicNpmPolicy: selected.identity.publicNpmPolicy,
}; }
function cli(argv) { return parseCli(argv); }
if (require.main === module) { try { cli(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
module.exports = { ROOT, NODE_VERSION, REGISTRY, ERR, sha256, assertNoSymlinkAncestry, ownedPrivateDirectory, validatePlatform, platformIdentity, freshIdentity, cachePaths, verifyCachedTree, shimBytes, ensureShims, prepare, identity, checkArgs, runtimeEnvironment, runChild, execute, parseCli, cli };
