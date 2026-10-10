'use strict';

// A1 preparation verifier/materializer. It never executes files from the candidate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '../..');
const PROFILE_PATH = path.join(ROOT, 'toolchain/npm/distribution-profile.json');
const LOCK_PATH = path.join(ROOT, 'toolchain/npm/toolchain-inputs.lock.json');
const ARCHIVE_PATH = path.join(ROOT, 'toolchain/npm/taco-npm-12.1.0-registry-patches.20261009.r1.tgz');
const DISTRIBUTION_ID = 'taco-npm-12.1.0-registry-patches.20261009.r1';
const SAFE_LIMITS = Object.freeze({ maxArchiveBytes: 4000000, maxExpandedBytes: 20000000, maxMembers: 4096, maxMemberBytes: 1048576, maxPathBytes: 1024, maxPathDepth: 64 });
const ERR = Object.freeze({
  ARCHIVE_BYTES: 'EARCHIVE_BYTES', ARCHIVE_SHA256: 'EARCHIVE_SHA256', ARCHIVE_SRI: 'EARCHIVE_SRI',
  PROFILE: 'EPROFILE', LOCK: 'ELOCK', GZIP: 'EGZIP', TAR: 'ETAR', TAR_CHECKSUM: 'ETAR_CHECKSUM',
  TAR_PATH: 'ETAR_PATH', TAR_DUPLICATE: 'ETAR_DUPLICATE', TAR_TYPE: 'ETAR_TYPE', TAR_LIMIT: 'ETAR_LIMIT',
  MANIFEST: 'EMANIFEST', TREE: 'ETREE', EMBEDDED_LOCK: 'EEMBEDDED_LOCK', PACKAGE_ID: 'EPACKAGE_ID',
  DESTINATION: 'EDESTINATION', DEST_SYMLINK: 'EDEST_SYMLINK', WRITE: 'EWRITE', ARGV: 'EARGV',
});

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function sha512SRI(data) { return `sha512-${crypto.createHash('sha512').update(data).digest('base64')}`; }
function parseJson(data, label, code) {
  try { return JSON.parse(data.toString('utf8')); }
  catch (error) { fail(code, `${label} is not valid JSON (${error.message})`); }
}
function loadProfile(profilePath = PROFILE_PATH) {
  return validateProfile(parseJson(fs.readFileSync(profilePath), 'distribution profile', ERR.PROFILE));
}
function validateProfile(profile) {
  if (profile.schemaVersion !== 1 || profile.status !== 'candidate-preparation-only'
      || profile.activation !== 'not-selected' || profile.cacheDisposition !== 'pending') {
    fail(ERR.PROFILE, 'profile must remain an unselected preparation candidate');
  }
  if (profile.distributionId !== DISTRIBUTION_ID || profile.base?.name !== 'npm' || profile.base?.version !== '12.1.0'
      || profile.runtime?.nodeVersion !== '22.23.2' || !profile.runtime.targetPlatforms?.includes('linux-x64-musl')
      || profile.runtime.qualificationStatus !== 'archive-preparation-only; application install and runner pending'
      || profile.archive?.file !== path.basename(ARCHIVE_PATH)
      || profile.inputLock?.file !== path.basename(LOCK_PATH)
      || profile.layout?.packagePrefix !== 'distribution/package/'
      || profile.layout?.manifestPath !== 'distribution/tree-manifest.json'
      || profile.layout?.treeDigest !== 'sha256(JSON.stringify(treeManifest.entries)) in original record order'
      || profile.layout?.treeFiles !== 2014 || !Array.isArray(profile.replacements) || profile.replacements.length !== 5) {
    fail(ERR.PROFILE, 'profile identity or supported archive layout is not the reviewed A1 contract');
  }
  const limits = profile.limits;
  if (!limits || Object.entries(SAFE_LIMITS).some(([key, ceiling]) => !Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > ceiling)
      || limits.maxMemberBytes > limits.maxExpandedBytes || limits.maxPathDepth > 64) {
    fail(ERR.PROFILE, 'profile archive bounds must be positive and within fixed safe caps');
  }
  if (!/^[a-f0-9]{64}$/.test(profile.archive?.sha256 || '') || !/^[a-f0-9]{64}$/.test(profile.archive?.treeSha256 || '')
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(profile.archive?.integrity || '')
      || !/^[a-f0-9]{64}$/.test(profile.inputLock?.sha256 || '')) {
    fail(ERR.PROFILE, 'profile is missing an external identity pin');
  }
  return profile;
}
function loadExternalLock(profile = loadProfile(), lockPath = LOCK_PATH) {
  const bytes = fs.readFileSync(lockPath);
  if (sha256(bytes) !== profile.inputLock.sha256) fail(ERR.LOCK, 'external input lock SHA256 mismatch');
  const lock = parseJson(bytes, 'external input lock', ERR.LOCK);
  if (lock.schemaVersion !== 1 || lock.distribution !== profile.distributionId
      || lock.upstream?.name !== profile.base?.name || lock.upstream?.version !== profile.base?.version
      || lock.upstream?.dist?.integrity !== profile.base?.sri
      || lock.upstream?.dist?.tarball !== profile.base?.tarball
      || lock.upstream?.dist?.shasum !== profile.base?.shasum
      || lock.upstream?.registry !== profile.base?.registry
      || !Array.isArray(lock.patches) || lock.patches.length !== profile.replacements?.length) {
    fail(ERR.LOCK, 'external lock identity does not match profile');
  }
  for (const [i, patch] of profile.replacements.entries()) {
    const locked = lock.patches[i];
    if (!locked || locked.name !== patch.name || locked.version !== patch.version
        || locked.dist?.integrity !== patch.sri || locked.registry !== patch.registry
        || locked.dist?.tarball !== patch.tarball || locked.path !== `node_modules/${patch.name}`
        || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(patch.repository || '')
        || !/^[a-f0-9]{40}$/.test(patch.gitHead || '') || typeof patch.license !== 'string'
        || patch.licenseFile !== `node_modules/${patch.name}/${patch.licenseFile?.split('/').at(-1)}`) {
      fail(ERR.LOCK, `external replacement identity mismatch at index ${i}`);
    }
  }
  return { bytes, lock };
}
function verifyArchiveBytes(archiveBytes, profile, externalLockBytes) {
  if (!Buffer.isBuffer(archiveBytes) || archiveBytes.length > profile.limits.maxArchiveBytes) {
    fail(ERR.ARCHIVE_BYTES, 'archive exceeds compressed-size bound or is not bytes');
  }
  // This comparison is deliberately before decompression, tar parsing or JSON/candidate reads.
  if (sha256(archiveBytes) !== profile.archive.sha256) fail(ERR.ARCHIVE_SHA256, 'archive SHA256 differs from external profile pin');
  if (sha512SRI(archiveBytes) !== profile.archive.integrity) fail(ERR.ARCHIVE_SRI, 'archive SRI differs from external profile pin');
  if (archiveBytes.length !== profile.archive.bytes) fail(ERR.ARCHIVE_BYTES, 'archive byte length differs from external profile pin');
  const tarBytes = decompress(archiveBytes, profile.limits.maxExpandedBytes);
  const members = parseTarArchive(tarBytes, profile.limits);
  return validateMembers(members, profile, externalLockBytes);
}
function decompress(archiveBytes, maxExpandedBytes) {
  try { return zlib.gunzipSync(archiveBytes, { maxOutputLength: maxExpandedBytes }); }
  catch (error) { fail(ERR.GZIP, `gzip invalid or expanded size exceeds ${maxExpandedBytes} bytes (${error.message})`); }
}
function fieldString(header, start, length) {
  const field = header.subarray(start, start + length);
  const end = field.indexOf(0);
  const raw = end < 0 ? field : field.subarray(0, end);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { fail(ERR.TAR, 'tar path field is not valid UTF-8'); }
}
function octalField(header, start, length, label) {
  const field = header.subarray(start, start + length);
  if (field.some(byte => byte !== 0 && byte !== 32 && (byte < 48 || byte > 55))) {
    fail(ERR.TAR, `unsupported ${label} encoding`);
  }
  const end = field.indexOf(0);
  if (end >= 0 && field.subarray(end).some(byte => byte !== 0 && byte !== 32)) {
    fail(ERR.TAR, `non-padding bytes after ${label} terminator`);
  }
  const raw = field.toString('latin1').replace(/\0.*$/s, '').trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) fail(ERR.TAR, `unsupported ${label} encoding`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value)) fail(ERR.TAR_LIMIT, `${label} is out of range`);
  return value;
}
function cleanArchivePath(value, limits) {
  if (Buffer.byteLength(value, 'utf8') > limits.maxPathBytes || value.startsWith('/') || value.includes('\\')
      || /[\x00-\x1f\x7f]/.test(value)) fail(ERR.TAR_PATH, 'unsafe or overlong archive path');
  const parts = value.split('/');
  if (parts.length > limits.maxPathDepth || parts.some(part => !part || part === '.' || part === '..')) {
    fail(ERR.TAR_PATH, 'archive path contains an empty, dot or traversal component');
  }
  return value;
}
function parseTarArchive(tarBytes, limits) {
  const block = 512;
  if (!Buffer.isBuffer(tarBytes) || !Number.isSafeInteger(limits?.maxExpandedBytes)
      || limits.maxExpandedBytes <= 0 || tarBytes.length > limits.maxExpandedBytes) {
    fail(ERR.TAR_LIMIT, 'expanded tar exceeds its total-byte bound');
  }
  if (tarBytes.length < block * 2 || tarBytes.length % block !== 0) fail(ERR.TAR, 'tar length is not a complete block stream');
  const members = new Map();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + block <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + block);
    if (header.every(byte => byte === 0)) {
      zeroBlocks += 1;
      offset += block;
      if (zeroBlocks === 2) {
        if (!tarBytes.subarray(offset).every(byte => byte === 0)) fail(ERR.TAR, 'nonzero bytes after tar end marker');
        return members;
      }
      continue;
    }
    if (zeroBlocks) fail(ERR.TAR, 'single zero block inside tar member stream');
    if (members.size >= limits.maxMembers) fail(ERR.TAR_LIMIT, 'member-count bound exceeded');
    const storedChecksum = octalField(header, 148, 8, 'checksum');
    let computedChecksum = 0;
    for (let i = 0; i < block; i += 1) computedChecksum += (i >= 148 && i < 156) ? 32 : header[i];
    if (storedChecksum !== computedChecksum) fail(ERR.TAR_CHECKSUM, 'tar header checksum mismatch');
    const magic = header.subarray(257, 263);
    if (!magic.equals(Buffer.from('ustar\0')) || !header.subarray(263, 265).equals(Buffer.from('00'))) {
      fail(ERR.TAR, 'only the reviewed USTAR format and version are supported');
    }
    const name = fieldString(header, 0, 100);
    const prefix = fieldString(header, 345, 155);
    const memberPath = cleanArchivePath(prefix ? `${prefix}/${name}` : name, limits);
    const type = header[156];
    if (type !== 0 && type !== 48) fail(ERR.TAR_TYPE, `non-regular tar member rejected: type ${type}`);
    const mode = octalField(header, 100, 8, 'mode');
    const size = octalField(header, 124, 12, 'size');
    if (size > limits.maxMemberBytes || size > limits.maxExpandedBytes) fail(ERR.TAR_LIMIT, 'member-size bound exceeded');
    const payloadOffset = offset + block;
    const paddedSize = Math.ceil(size / block) * block;
    const nextOffset = payloadOffset + paddedSize;
    if (nextOffset > tarBytes.length) fail(ERR.TAR, 'truncated tar member payload');
    if (members.has(memberPath)) fail(ERR.TAR_DUPLICATE, `duplicate normalized path: ${memberPath}`);
    if (!tarBytes.subarray(payloadOffset + size, nextOffset).every(byte => byte === 0)) fail(ERR.TAR, 'nonzero tar padding');
    members.set(memberPath, { path: memberPath, mode, bytes: Buffer.from(tarBytes.subarray(payloadOffset, payloadOffset + size)) });
    offset = nextOffset;
  }
  fail(ERR.TAR, 'missing two-block tar end marker');
}
function validateMembers(members, profile, externalLockBytes) {
  const lockPath = 'distribution/toolchain-inputs.lock.json';
  const manifestPath = profile.layout.manifestPath;
  const embeddedLock = members.get(lockPath);
  const manifestMember = members.get(manifestPath);
  if (!embeddedLock || !manifestMember) fail(ERR.MANIFEST, 'required embedded lock or tree manifest is missing');
  if (!embeddedLock.bytes.equals(externalLockBytes)) fail(ERR.EMBEDDED_LOCK, 'embedded lock bytes differ from external pinned lock');
  const manifest = parseJson(manifestMember.bytes, 'embedded tree manifest', ERR.MANIFEST);
  if (manifest.distribution !== profile.distributionId || !Array.isArray(manifest.entries)
      || manifest.treeSha256 !== profile.archive.treeSha256 || manifest.entries.length !== profile.layout.treeFiles) {
    fail(ERR.MANIFEST, 'tree manifest identity or entry count differs from external profile');
  }
  // The digest intentionally uses manifest.entries in its preserved source order.
  const computedTreeSha256 = sha256(Buffer.from(JSON.stringify(manifest.entries)));
  if (computedTreeSha256 !== manifest.treeSha256) fail(ERR.TREE, 'ordered tree-manifest digest mismatch');
  const expected = new Map();
  for (const [index, entry] of manifest.entries.entries()) {
    if (!entry || Object.keys(entry).join(',') !== 'path,sha256,mode' || typeof entry.path !== 'string'
        || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
      fail(ERR.MANIFEST, `invalid tree record at original index ${index}`);
    }
    const rel = cleanArchivePath(entry.path, profile.limits);
    if (expected.has(rel)) fail(ERR.TAR_DUPLICATE, `duplicate tree record: ${rel}`);
    expected.set(rel, entry);
  }
  const requiredPaths = new Set([lockPath, manifestPath]);
  for (const entry of expected.values()) requiredPaths.add(`${profile.layout.packagePrefix}${entry.path}`);
  if (members.size !== requiredPaths.size || [...members.keys()].some(memberPath => !requiredPaths.has(memberPath))) {
    fail(ERR.MANIFEST, 'archive members do not exactly match the pinned package tree and metadata');
  }
  for (const replacement of profile.replacements) {
    const licensePath = `${profile.layout.packagePrefix}${replacement.licenseFile}`;
    if (!members.has(licensePath) || members.get(licensePath).bytes.length === 0) {
      fail(ERR.MANIFEST, `replacement license file is absent: ${replacement.licenseFile}`);
    }
  }
  for (const [rel, entry] of expected) {
    const member = members.get(`${profile.layout.packagePrefix}${rel}`);
    if (!member || member.mode !== entry.mode || sha256(member.bytes) !== entry.sha256) {
      fail(ERR.TREE, `physical package file differs from ordered tree record: ${rel}`);
    }
  }
  if (!members.has(`${profile.layout.packagePrefix}${profile.base.licenseFile}`)
      || members.get(`${profile.layout.packagePrefix}${profile.base.licenseFile}`).bytes.length === 0) {
    fail(ERR.MANIFEST, 'base npm license file is absent');
  }
  const packageJson = members.get(`${profile.layout.packagePrefix}package.json`);
  if (!packageJson) fail(ERR.PACKAGE_ID, 'root npm package manifest is missing');
  const pkg = parseJson(packageJson.bytes, 'candidate npm package manifest', ERR.PACKAGE_ID);
  if (pkg.name !== profile.base.name || pkg.version !== profile.base.version) fail(ERR.PACKAGE_ID, 'candidate base package identity mismatch');
  return {
    distributionId: profile.distributionId,
    archiveSha256: profile.archive.sha256,
    archiveIntegrity: profile.archive.integrity,
    treeSha256: computedTreeSha256,
    packageFiles: manifest.entries.length,
    archiveMembers: members.size,
    embeddedLockSha256: sha256(embeddedLock.bytes),
    entries: [...members.values()],
  };
}
function assertNoSymlinkAncestry(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const component of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) fail(ERR.DEST_SYMLINK, `symlink in destination ancestry: ${current}`);
  }
}
function materialize(destination) {
  const profile = loadProfile();
  const { bytes: lockBytes } = loadExternalLock(profile);
  const archiveBytes = fs.readFileSync(ARCHIVE_PATH);
  const verified = verifyArchiveBytes(archiveBytes, profile, lockBytes);
  if (typeof destination !== 'string' || !destination.trim()) fail(ERR.DESTINATION, 'destination must be a nonempty path string');
  const dest = path.resolve(destination);
  if (dest === path.parse(dest).root) fail(ERR.DESTINATION, 'destination must be a specific new directory');
  assertNoSymlinkAncestry(dest);
  const parent = path.dirname(dest);
  if (process.platform !== 'linux' || typeof process.getuid !== 'function') {
    fail(ERR.DESTINATION, 'materialization requires Linux descriptor anchors; other platforms are not qualified');
  }
  // Linux descriptor paths anchor every write to the opened directory, even if
  // its public pathname is subsequently renamed. Never fall back to path-only writes.
  let parentFd;
  let destinationFd;
  let anchoredDestination;
  let destinationStat;
  let reserved = false;
  const sameDirectory = (stat, expected) => stat.isDirectory() && !stat.isSymbolicLink()
    && stat.dev === expected.dev && stat.ino === expected.ino;
  try {
    parentFd = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const parentStat = fs.fstatSync(parentFd);
    if (!parentStat.isDirectory() || parentStat.uid !== process.getuid() || (parentStat.mode & 0o022) !== 0) {
      fail(ERR.DESTINATION, 'destination parent must be owned by this user and not writable by group or others');
    }
    const parentAnchor = `/proc/self/fd/${parentFd}`;
    const assertParentBinding = () => {
      assertNoSymlinkAncestry(parent);
      if (!sameDirectory(fs.lstatSync(parent), parentStat) || fs.realpathSync(parentAnchor) !== parent) {
        fail(ERR.DEST_SYMLINK, 'destination parent pathname changed during materialization');
      }
    };
    assertParentBinding();
    anchoredDestination = path.join(parentAnchor, path.basename(dest));
    try { fs.mkdirSync(anchoredDestination, { mode: 0o700 }); }
    catch (error) {
      if (error.code === 'EEXIST') fail(ERR.DESTINATION, 'destination must not already exist (including an empty directory)');
      throw error;
    }
    reserved = true;
    destinationFd = fs.openSync(anchoredDestination, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    destinationStat = fs.fstatSync(destinationFd);
    const destinationAnchor = `/proc/self/fd/${destinationFd}`;
    const assertDestinationBinding = () => {
      assertParentBinding();
      if (!sameDirectory(fs.lstatSync(anchoredDestination), destinationStat)) {
        fail(ERR.DESTINATION, 'reserved destination changed during materialization');
      }
    };
    assertDestinationBinding();
    const stage = fs.mkdtempSync(path.join(destinationAnchor, '.npm-distribution-stage-'));
    for (const entry of verified.entries) {
      const relative = entry.path;
      const clean = cleanArchivePath(relative, profile.limits);
      const target = path.join(stage, ...clean.split('/'));
      if (!target.startsWith(`${stage}${path.sep}`)) fail(ERR.TAR_PATH, 'materialized path escaped stage directory');
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
      const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), entry.mode);
      try { fs.writeFileSync(fd, entry.bytes); fs.fchmodSync(fd, entry.mode); }
      finally { fs.closeSync(fd); }
    }
    // Normalize generated directory permissions independently of the caller's umask.
    const dirs = [];
    function collectDirs(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, item.name);
        if (item.isDirectory()) { dirs.push(child); collectDirs(child); }
      }
    }
    collectDirs(stage);
    for (const dir of dirs.reverse()) fs.chmodSync(dir, 0o755);
    // The reserved destination and staging root remain private until publication.
    // Re-read and hash the complete written tree before publishing its single child.
    for (const entry of verified.entries) {
      const target = path.join(stage, ...entry.path.split('/'));
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== entry.mode
          || !crypto.timingSafeEqual(Buffer.from(sha256(fs.readFileSync(target))), Buffer.from(sha256(entry.bytes)))) {
        fail(ERR.WRITE, `staged output verification failed: ${entry.path}`);
      }
    }
    assertDestinationBinding();
    fs.renameSync(path.join(stage, 'distribution'), path.join(destinationAnchor, 'distribution'));
    assertDestinationBinding();
    fs.rmdirSync(stage);
    fs.fchmodSync(destinationFd, 0o755);
    assertDestinationBinding();
    return {
      distributionId: verified.distributionId,
      destination: dest,
      archiveSha256: verified.archiveSha256,
      treeSha256: verified.treeSha256,
      packageFiles: verified.packageFiles,
      publication: 'exclusive private destination; atomic verified distribution child',
    };
  } catch (error) {
    // Remove only the directory we exclusively reserved, using its original
    // parent anchor. Never remove a pre-existing or concurrently substituted target.
    if (reserved && destinationStat) {
      try {
        if (sameDirectory(fs.lstatSync(anchoredDestination), destinationStat)) {
          fs.rmSync(anchoredDestination, { recursive: true, force: true });
        }
      } catch { /* Preserve the primary failure if the owned directory was moved. */ }
    }
    throw error;
  } finally {
    if (destinationFd !== undefined) fs.closeSync(destinationFd);
    if (parentFd !== undefined) fs.closeSync(parentFd);
  }
}
function cli(argv) {
  const args = [...argv];
  if (args.length === 1 && args[0] === 'verify') {
    const profile = loadProfile();
    const { bytes: lockBytes } = loadExternalLock(profile);
    const result = verifyArchiveBytes(fs.readFileSync(ARCHIVE_PATH), profile, lockBytes);
    process.stdout.write(`${JSON.stringify({ distributionId: result.distributionId, archiveSha256: result.archiveSha256, treeSha256: result.treeSha256, packageFiles: result.packageFiles, archiveMembers: result.archiveMembers, status: profile.status, activation: profile.activation, cacheDisposition: profile.cacheDisposition }, null, 2)}\n`);
    return;
  }
  if (args.length === 3 && args[0] === 'materialize' && args[1] === '--dest' && args[2] && !args[2].startsWith('-')) {
    process.stdout.write(`${JSON.stringify(materialize(args[2]), null, 2)}\n`);
    return;
  }
  fail(ERR.ARGV, 'usage: node scripts/toolchain/npm-distribution.cjs verify | materialize --dest <new-directory>');
}

if (require.main === module) {
  try { cli(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { ERR, ROOT, PROFILE_PATH, LOCK_PATH, ARCHIVE_PATH, loadProfile, validateProfile, loadExternalLock, verifyArchiveBytes, parseTarArchive, validateMembers, materialize, cli };
