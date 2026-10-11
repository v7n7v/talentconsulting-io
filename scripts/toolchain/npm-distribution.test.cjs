'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const tool = require('./npm-distribution.cjs');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function octal(value, width) { return Buffer.from(`${value.toString(8).padStart(width - 1, '0')}\0`, 'ascii'); }
function tarHeader(name, size, mode = 0o644, type = 0) {
  const header = Buffer.alloc(512);
  const put = (at, bytes) => bytes.copy(header, at, 0, Math.min(bytes.length, header.length - at));
  put(0, Buffer.from(name, 'utf8'));
  put(100, octal(mode, 8));
  put(108, octal(0, 8)); put(116, octal(0, 8)); put(124, octal(size, 12)); put(136, octal(0, 12));
  header.fill(32, 148, 156);
  header[156] = type;
  put(257, Buffer.from('ustar\0')); put(263, Buffer.from('00'));
  let sum = 0; for (const byte of header) sum += byte;
  put(148, Buffer.from(`${sum.toString(8).padStart(6, '0')}\0 `, 'ascii'));
  return header;
}
function makeTar(members) {
  const blocks = [];
  for (const member of members) {
    const bytes = Buffer.from(member.bytes || '');
    blocks.push(tarHeader(member.path, bytes.length, member.mode ?? 0o644, member.type ?? 0));
    blocks.push(bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}
function fixtureLimits() {
  return { maxArchiveBytes: 100000, maxExpandedBytes: 100000, maxMembers: 8, maxMemberBytes: 2048, maxPathBytes: 128, maxPathDepth: 12 };
}
function addTarCase(name, opts = {}) {
  return makeTar([{ path: name, bytes: 'x', type: opts.type || 0, mode: 0o644 }]);
}
function parsedArchive(profile = tool.loadProfile()) {
  const archive = fs.readFileSync(tool.ARCHIVE_PATH);
  return tool.parseTarArchive(zlib.gunzipSync(archive), profile.limits);
}
function compressedTar(members) { return zlib.gzipSync(makeTar(members), { mtime: 0 }); }

async function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-dist-a1-'));
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('pinned candidate verifies against external archive, ordered-tree, and embedded-lock identities', () => {
  const profile = tool.loadProfile();
  const { bytes: lockBytes, lock } = tool.loadExternalLock(profile);
  const archive = fs.readFileSync(tool.ARCHIVE_PATH);
  const result = tool.verifyArchiveBytes(archive, profile, lockBytes);
  assert.equal(sha256(archive), profile.archive.sha256);
  assert.equal(result.treeSha256, 'b0a8bd113b1a91cac4add6ddfaa4e031079dafcc3a86074f5692539c1b642b9e');
  assert.equal(result.packageFiles, 2014);
  assert.equal(result.archiveMembers, 2016);
  assert.equal(result.embeddedLockSha256, profile.inputLock.sha256);
  assert.equal(lock.upstream.version, '12.1.0');
  assert.equal(result.entries.some(entry => entry.path === 'distribution/package/bin/npm'), true);
});

test('profile states keep owner/private-cache acceptance distinct from qualification success', () => {
  const selected = tool.loadProfile();
  assert.equal(selected.activation, 'selected-for-qualification');
  assert.equal(selected.cacheDisposition, 'accepted-npm-private-cache');
  assert.equal(selected.cacheAcceptance.upstreamBehaviorStillDisputed, true);
  for (const change of [
    { cacheDisposition: 'pending' }, { activation: 'release-certified' },
    { cacheAcceptance: { ...selected.cacheAcceptance, upstreamBehaviorStillDisputed: false } },
    { maintenanceOwner: { role: 'unassigned' } },
  ]) assert.throws(() => tool.validateProfile({ ...selected, ...change }), error => error.code === tool.ERR.PROFILE);
  const preparation = { ...selected, status: 'candidate-preparation-only', activation: 'not-selected', cacheDisposition: 'pending',
    runtime: { ...selected.runtime, qualificationStatus: 'archive-preparation-only; application install and runner pending' } };
  assert.equal(tool.validateProfile(preparation).activation, 'not-selected');
});

test('materializer writes a fully verified exact tree atomically with recorded modes', async () => {
  await withTemp(async temp => {
    const destination = path.join(temp, 'selected-npm');
    const emptyDestination = path.join(temp, 'empty'); fs.mkdirSync(emptyDestination);
    assert.throws(() => tool.materialize(emptyDestination), error => error.code === tool.ERR.DESTINATION);
    assert.deepEqual(fs.readdirSync(emptyDestination), []);
    const result = tool.materialize(destination);
    assert.equal(result.treeSha256, 'b0a8bd113b1a91cac4add6ddfaa4e031079dafcc3a86074f5692539c1b642b9e');
    const { bytes: lockBytes } = tool.loadExternalLock();
    assert.deepEqual(fs.readFileSync(path.join(destination, 'distribution/toolchain-inputs.lock.json')), lockBytes);
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'distribution/tree-manifest.json'), 'utf8'));
    assert.equal(sha256(Buffer.from(JSON.stringify(manifest.entries))), manifest.treeSha256);
    for (const entry of manifest.entries) {
      const file = path.join(destination, 'distribution/package', ...entry.path.split('/'));
      const stat = fs.lstatSync(file);
      assert.equal(stat.isFile(), true, entry.path);
      assert.equal(stat.isSymbolicLink(), false, entry.path);
      assert.equal(stat.mode & 0o777, entry.mode, entry.path);
      assert.equal(sha256(fs.readFileSync(file)), entry.sha256, entry.path);
    }
    assert.throws(() => tool.materialize(destination), error => error.code === tool.ERR.DESTINATION);
  });
});

test('one-byte archive mutation and regenerated internal manifest still fail at external pin before writes', async () => {
  await withTemp(async temp => {
    const profile = tool.loadProfile();
    const { bytes: lockBytes } = tool.loadExternalLock(profile);
    const original = fs.readFileSync(tool.ARCHIVE_PATH);
    const byteMutation = Buffer.from(original); byteMutation[byteMutation.length - 20] ^= 1;
    assert.throws(() => tool.verifyArchiveBytes(byteMutation, profile, lockBytes), error => error.code === tool.ERR.ARCHIVE_SHA256);

    const members = parsedArchive(profile);
    const manifestPath = profile.layout.manifestPath;
    const manifestMember = members.get(manifestPath);
    const manifest = JSON.parse(manifestMember.bytes.toString('utf8'));
    const npmScript = members.get('distribution/package/bin/npm');
    npmScript.bytes = Buffer.concat([npmScript.bytes, Buffer.from('\n# A1 non-executed identity mutation\n')]);
    const record = manifest.entries.find(entry => entry.path === 'bin/npm');
    record.sha256 = sha256(npmScript.bytes);
    manifest.treeSha256 = sha256(Buffer.from(JSON.stringify(manifest.entries)));
    manifestMember.bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const regenerated = compressedTar([...members.values()]);
    const destination = path.join(temp, 'must-not-exist');
    assert.throws(() => tool.verifyArchiveBytes(regenerated, profile, lockBytes), error => error.code === tool.ERR.ARCHIVE_SHA256);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(zlib.gunzipSync(regenerated).includes(Buffer.from('A1 non-executed identity mutation')), true);
  });
});

test('external input-lock mutation fails its profile pin', async () => {
  await withTemp(async temp => {
    const profile = tool.loadProfile();
    const lock = fs.readFileSync(tool.LOCK_PATH);
    const mutated = Buffer.from(lock); mutated[mutated.length - 2] ^= 1;
    const lockPath = path.join(temp, 'mutated-lock.json'); fs.writeFileSync(lockPath, mutated);
    assert.throws(() => tool.loadExternalLock(profile, lockPath), error => error.code === tool.ERR.LOCK);
  });
});

test('bounded tar parser rejects traversal, duplicate paths, links, bad checksums, and truncation', () => {
  const limits = fixtureLimits();
  assert.throws(() => tool.parseTarArchive(addTarCase('../escape'), limits), error => error.code === tool.ERR.TAR_PATH);
  assert.throws(() => tool.parseTarArchive(makeTar([
    { path: 'distribution/package/a', bytes: 'a' }, { path: 'distribution/package/a', bytes: 'b' },
  ]), limits), error => error.code === tool.ERR.TAR_DUPLICATE);
  assert.throws(() => tool.parseTarArchive(addTarCase('distribution/package/link', { type: 50 }), limits), error => error.code === tool.ERR.TAR_TYPE);
  const broken = makeTar([{ path: 'distribution/package/a', bytes: 'a' }]); broken[0] ^= 1;
  assert.throws(() => tool.parseTarArchive(broken, limits), error => error.code === tool.ERR.TAR_CHECKSUM);
  const truncated = makeTar([{ path: 'distribution/package/a', bytes: 'a' }]).subarray(0, 512);
  assert.throws(() => tool.parseTarArchive(truncated, limits), error => error.code === tool.ERR.TAR);
});

test('tar parser enforces member-count, member-size, path-depth, and expanded-byte bounds', () => {
  const limits = fixtureLimits();
  assert.throws(() => tool.parseTarArchive(makeTar([
    { path: 'a', bytes: '1' }, { path: 'b', bytes: '2' }, { path: 'c', bytes: '3' }, { path: 'd', bytes: '4' },
    { path: 'e', bytes: '5' }, { path: 'f', bytes: '6' }, { path: 'g', bytes: '7' }, { path: 'h', bytes: '8' }, { path: 'i', bytes: '9' },
  ]), limits), error => error.code === tool.ERR.TAR_LIMIT);
  assert.throws(() => tool.parseTarArchive(makeTar([{ path: 'oversize', bytes: Buffer.alloc(2049) }]), limits), error => error.code === tool.ERR.TAR_LIMIT);
  assert.throws(() => tool.parseTarArchive(addTarCase('a/b/c/d/e/f/g/h/i/j/k/l/m'), limits), error => error.code === tool.ERR.TAR_PATH);
  const profile = tool.loadProfile();
  const tooSmall = { ...profile, limits: { ...profile.limits, maxArchiveBytes: 64 } };
  assert.throws(() => tool.verifyArchiveBytes(Buffer.alloc(100), tooSmall, tool.loadExternalLock(profile).bytes), error => error.code === tool.ERR.ARCHIVE_BYTES);
  const expandedTooSmall = { ...profile, limits: { ...profile.limits, maxExpandedBytes: 32 } };
  assert.throws(() => tool.verifyArchiveBytes(fs.readFileSync(tool.ARCHIVE_PATH), expandedTooSmall, tool.loadExternalLock(profile).bytes), error => error.code === tool.ERR.GZIP);
});

test('materializer rejects symlink ancestry and CLI rejects ambiguous or unsafe argv', async () => {
  await withTemp(async temp => {
    const real = path.join(temp, 'real'); fs.mkdirSync(real);
    const linked = path.join(temp, 'linked'); fs.symlinkSync(real, linked);
    assert.throws(() => tool.materialize(path.join(linked, 'child')), error => error.code === tool.ERR.DEST_SYMLINK);
  });
  const profile = tool.loadProfile();
  const invalidBounds = { ...profile, limits: { ...profile.limits, maxExpandedBytes: 20000001 } };
  assert.throws(() => tool.validateProfile(invalidBounds), error => error.code === tool.ERR.PROFILE);
  assert.throws(() => tool.validateProfile({ ...profile, layout: { ...profile.layout, manifestPath: '../manifest.json' } }), error => error.code === tool.ERR.PROFILE);
  assert.throws(() => tool.cli(['verify', '--archive', '/tmp/other.tgz']), error => error.code === tool.ERR.ARGV);
  assert.throws(() => tool.cli(['materialize', '--dest', '--help']), error => error.code === tool.ERR.ARGV);
  assert.throws(() => tool.cli(['materialize', '--dest', 'relative', 'extra']), error => error.code === tool.ERR.ARGV);
});

test('exclusive reservation preserves a destination created concurrently instead of replacing it', async () => {
  await withTemp(async temp => {
    const destination = path.join(temp, 'concurrent-target');
    const mkdir = fs.mkdirSync;
    let originalInode;
    fs.mkdirSync = function (target, ...args) {
      if (String(target).endsWith('/concurrent-target')) {
        mkdir(destination, { mode: 0o700 });
        originalInode = fs.statSync(destination).ino;
      }
      return mkdir.call(fs, target, ...args);
    };
    try {
      assert.throws(() => tool.materialize(destination), error => error.code === tool.ERR.DESTINATION);
      assert.equal(fs.statSync(destination).ino, originalInode);
      assert.deepEqual(fs.readdirSync(destination), []);
    } finally { fs.mkdirSync = mkdir; }
  });
});

test('parent namespace swap fails and anchored writes never follow its replacement symlink', async () => {
  await withTemp(async temp => {
    const parent = path.join(temp, 'parent');
    const relocated = path.join(temp, 'relocated');
    const redirected = path.join(temp, 'redirected');
    fs.mkdirSync(parent, { mode: 0o700 });
    fs.mkdirSync(redirected, { mode: 0o700 });
    const destination = path.join(parent, 'selected-npm');
    const rename = fs.renameSync;
    let swapped = false;
    fs.renameSync = function (source, target) {
      if (!swapped && path.basename(String(target)) === 'distribution') {
        swapped = true;
        rename(parent, relocated);
        fs.symlinkSync(redirected, parent);
      }
      return rename.call(fs, source, target);
    };
    try {
      assert.throws(() => tool.materialize(destination), error => error.code === tool.ERR.DEST_SYMLINK);
      assert.equal(swapped, true);
      assert.deepEqual(fs.readdirSync(redirected), []);
      assert.equal(fs.existsSync(path.join(relocated, 'selected-npm')), false);
    } finally { fs.renameSync = rename; }
  });
});

test('direct parser rejects total-byte overflow and high-bit numeric encodings', () => {
  assert.throws(() => tool.parseTarArchive(Buffer.alloc(1024), { ...fixtureLimits(), maxExpandedBytes: 512 }),
    error => error.code === tool.ERR.TAR_LIMIT);
  const header = tarHeader('a', 1);
  header[124] |= 0x80;
  header.fill(32, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  Buffer.from(`${sum.toString(8).padStart(6, '0')}\0 `).copy(header, 148);
  const malformed = Buffer.concat([header, Buffer.from('x'), Buffer.alloc(511), Buffer.alloc(1024)]);
  assert.throws(() => tool.parseTarArchive(malformed, fixtureLimits()), error => error.code === tool.ERR.TAR);
});

test('tar format validation compares raw magic and version bytes without lossy decoding', () => {
  for (const mutate of [header => { header[257] |= 0x80; }, header => { header[263] = 49; }]) {
    const header = tarHeader('a', 1);
    mutate(header);
    header.fill(32, 148, 156);
    let sum = 0;
    for (const byte of header) sum += byte;
    Buffer.from(`${sum.toString(8).padStart(6, '0')}\0 `).copy(header, 148);
    const malformed = Buffer.concat([header, Buffer.from('x'), Buffer.alloc(511), Buffer.alloc(1024)]);
    assert.throws(() => tool.parseTarArchive(malformed, fixtureLimits()), error => error.code === tool.ERR.TAR);
  }
});
