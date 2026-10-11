#!/usr/bin/env node
'use strict';

// Dependency-free on purpose: this boundary runs before npm ci. New input roots,
// install hooks or local/patch/vendor artifacts require a review of this policy.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const SCRIPT = 'scripts/docker-build-context.js';
const CONTEXT_MANIFEST = '.docker-build-context-manifest.json';
const INSTALL_DIR = '.docker-install';
const INSTALL_MANIFEST = '.docker-install-manifest.json';
const TOOLCHAIN_INPUTS = Object.freeze([
  'toolchain/npm/distribution-profile.json', 'toolchain/npm/toolchain-inputs.lock.json',
  'toolchain/npm/taco-npm-12.1.0-registry-patches.20261009.r1.tgz', 'toolchain/npm/NOTICE.md',
  'scripts/toolchain/npm-distribution.cjs', 'scripts/toolchain/npm-distribution.test.cjs',
  'scripts/toolchain/npm-runtime.cjs', 'scripts/toolchain/npm-runtime.test.cjs',
]);
const PUBLIC_NPM_POLICY = Object.freeze({ legacyPeerDeps: true, strictAllowScripts: true });
const CONTEXT_VERSION = 2;
const BUILD_FILES = new Set([
  '.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json',
  'next.config.js', 'postcss.config.js', 'tailwind.config.ts', 'tsconfig.json',
  'proxy.ts', 'eslint.config.cjs', SCRIPT, ...TOOLCHAIN_INPUTS,
]);
const SOURCE_ROOTS = new Set(['app', 'components', 'hooks', 'lib', 'emails', 'types']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json']);
const ASSET_EXTENSIONS = new Set([
  '.png', '.svg', '.webp', '.ico', '.otf', '.ttf', '.woff', '.woff2',
  '.webmanifest', '.jpg', '.jpeg', '.avif', '.gif',
  // public/ only (see the root check below): robots.txt replaces app/robots.ts,
  // and bundled resume fonts ship with their licence texts.
  '.txt',
]);
const NON_BUILD_ROOTS = new Set([
  '.git', '.github', '.agent', '.agents', '.claude', '.project-map', '.firebase',
  '.next', '.security-cve', '.seo-audit', '.ui-verify', '.playwright-cli',
  'node_modules', 'docs', 'scripts', 'security', 'ops', 'output', 'tmp',
  'test-results', 'coverage', 'email-previews', 'deploy', 'prototypes',
  'supabase', '_backup', '_to_delete', 'out', 'build',
]);
const NON_BUILD_FILES = new Set([
  '.Rhistory', '.design-audit-baseline.json', '.firebaseignore', '.firebaserc',
  '.gitignore', '.npmrc', '.nvmrc', '.node-version', 'cloudbuild.yaml',
  'firebase.json', 'firebase.observability-emulator.json', 'firebase.workspace-emulator.json',
  'firestore.indexes.json',
  'firestore.rules', 'storage.rules', 'next-env.d.ts', 'tsconfig.tsbuildinfo',
  'deploy-cloudrun.sh', 'deploy-fix.js', 'force_black_text.js',
  'make_small_text_bold.js', 'test-mammoth.js', 'scratch_test_apis.js',
]);
// Exact reviewed public inputs only. Raw .npmrc remains excluded; its two public
// installation flags are a separately declared policy, never a copied config.
const INSTALL_INPUTS = Object.freeze(['package.json', 'package-lock.json', SCRIPT, ...TOOLCHAIN_INPUTS]);
const INSTALL_HOOKS = [
  'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare',
];

function fail(message) { throw new Error(message); }
function cleanPath(value) {
  if (typeof value !== 'string' || !value || /[\\\x00-\x1f\x7f]/.test(value)
      || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('Invalid context path');
  }
  return value;
}
function credentialPath(value) {
  return value.split('/').some(part => /^(?:\.env|env\.|\.envrc|\.npmrc$|hermes-agent-keys\.txt$|YOUR_CREDENTIALS\.txt$|\.aws$|\.ssh$|secrets?$|credentials?$|_backup$|id_rsa|id_ed25519)/i.test(part)
    || /service[-_]?account|credential|secret/i.test(part)
    || /\.(?:pem|key|p12|pfx|orig|save)$|\.bak|~$/i.test(part))
    || /(?:^|\/)\.config\/gcloud(?:\/|$)/i.test(value);
}
function reviewedBuildPath(value) {
  if (credentialPath(value)) return false;
  if (BUILD_FILES.has(value)) return true;
  const root = value.split('/')[0];
  return SOURCE_ROOTS.has(root) ? SOURCE_EXTENSIONS.has(path.posix.extname(value))
    : root === 'public' && ASSET_EXTENSIONS.has(path.posix.extname(value));
}
function intentionallyOmitted(value) {
  const root = value.split('/')[0];
  return credentialPath(value) || NON_BUILD_ROOTS.has(root) || NON_BUILD_FILES.has(value)
    || /\.(?:md|sql|ps1)$/.test(value) || /^fix_[^/]+\.js$/.test(value);
}
function assertRegular(root, relative) {
  cleanPath(relative);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(`Symlink context input: ${relative}`);
    if (current !== path.join(root, relative) && !stat.isDirectory()) fail(`Non-directory parent: ${relative}`);
  }
  if (!fs.lstatSync(current).isFile()) fail(`Non-file context input: ${relative}`);
}
function readPublicFile(root, relative) {
  if (credentialPath(relative)) fail(`Credential context input: ${relative}`);
  assertRegular(root, relative);
  const descriptor = fs.openSync(path.join(root, relative), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(descriptor).isFile()) fail(`Non-file context input: ${relative}`);
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}
function sha256(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
function walk(root, relative = '', skip = () => false, directories = []) {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    cleanPath(name);
    if (skip(name)) continue;
    if (credentialPath(name)) fail(`Credential context input: ${name}`);
    if (entry.isSymbolicLink()) fail(`Symlink context input: ${name}`);
    if (entry.isDirectory()) {
      directories.push(name);
      files.push(...walk(root, name, skip, directories));
    }
    else if (entry.isFile()) files.push(name);
    else fail(`Non-file context input: ${name}`);
  }
  return files.sort();
}

// The reviewed ignore file uses only * and **, no escaping, character classes,
// trailing slashes, dot components or embedded **. Unsupported rules fail closed.
// Ordered full-path matching with ancestor fallback follows Moby's
// MatchesOrParentMatches; a descendant exception can reinclude an excluded parent.
// https://github.com/moby/patternmatcher/blob/main/patternmatcher.go
function ignoreRules(contents) {
  return contents.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).map(raw => {
    const line = raw.trim();
    const include = line.startsWith('!');
    const pattern = include ? line.slice(1) : line;
    if (!pattern || pattern !== pattern.trim() || /[\\[\]?#\x00-\x1f\x7f]/.test(pattern)
        || pattern.split('/').some(part => !part || part === '.' || part === '..' || (part.includes('**') && part !== '**'))) fail('Unsupported Docker ignore rule');
    let expression = '';
    for (let i = 0; i < pattern.length; i += 1) {
      if (pattern.slice(i, i + 3) === '**/') { expression += '(?:.*/)?'; i += 2; }
      else if (pattern.slice(i, i + 2) === '**') { expression += '.*'; i += 1; }
      else if (pattern[i] === '*') expression += '[^/]*';
      else expression += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    // Unlike gitignore, a slashless Docker pattern is relative to the context root.
    return { include, match: new RegExp(`^${expression}$`) };
  });
}
function dockerIncludes(relative, rules) {
  cleanPath(relative);
  const parts = relative.split('/');
  const parents = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
  let included = true;
  for (const rule of rules) {
    if (rule.match.test(relative) || parents.some(parent => rule.match.test(parent))) included = rule.include;
  }
  return included;
}
function rejectInstallSelectors(root) {
  for (const selector of ['npm-shrinkwrap.json', 'binding.gyp']) {
    try { fs.lstatSync(path.join(root, selector)); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    // lstat also catches a dangling symlink. Selector contents are never read.
    fail(`Unreviewed root installation selector: ${selector}`);
  }
}
function installedDependencySkip(root, enabled) {
  if (!enabled) return () => false;
  let stat;
  try { stat = fs.lstatSync(path.join(root, 'node_modules')); }
  catch (error) {
    if (error.code === 'ENOENT') fail('Installed node_modules must be a real directory');
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('Installed node_modules must be a real directory');
  // Installed npm .bin links are legitimate. Verify the root, then prune the
  // installed tree rather than following any of its internal links.
  return item => item === 'node_modules';
}
function installPolicy(root) {
  rejectInstallSelectors(root);
  const manifest = JSON.parse(readPublicFile(root, 'package.json'));
  const lock = JSON.parse(readPublicFile(root, 'package-lock.json'));
  if (Object.hasOwn(manifest, 'workspaces') || Object.hasOwn(lock, 'workspaces')
      || Object.hasOwn(lock.packages?.[''] || {}, 'workspaces')) fail('Unreviewed root workspaces');
  for (const hook of INSTALL_HOOKS) {
    if (manifest.scripts?.[hook]) fail(`Unreviewed root install hook: ${hook}`);
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] || {})) {
      if (typeof spec === 'string' && /^(?:file:|git\+file:|link:|workspace:|\.\.?\/|\/)/i.test(spec)) fail(`Unreviewed local dependency input: ${name}`);
    }
  }
  for (const [name, item] of Object.entries(lock.packages || {})) {
    if (item.link || /^(?:file:|git\+file:|link:)/i.test(item.resolved || '')) fail(`Unreviewed locked local dependency input: ${name}`);
  }
}
function selectBuildPaths(root) {
  rejectInstallSelectors(root);
  const tracked = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const selected = [];
  for (const item of tracked) {
    cleanPath(item);
    if (reviewedBuildPath(item)) selected.push(item);
    else if (!intentionallyOmitted(item)) fail(`Unreviewed tracked build input: ${item}`);
  }
  const selectedSet = new Set(selected);
  for (const item of BUILD_FILES) if (!selectedSet.has(item)) fail(`Required build input is not tracked: ${item}`);
  for (const sourceRoot of [...SOURCE_ROOTS, 'public', 'toolchain', 'scripts/toolchain']) {
    if (!fs.existsSync(path.join(root, sourceRoot))) continue;
    if (fs.lstatSync(path.join(root, sourceRoot)).isSymbolicLink()) fail(`Symlink context input: ${sourceRoot}`);
    for (const item of walk(root, sourceRoot, credentialPath)) {
      if (path.posix.basename(item) === '.DS_Store') continue;
      if (!selectedSet.has(item)) fail(`Unreviewed or untracked build input: ${item}`);
    }
  }
  for (const artifactRoot of ['patches', 'vendor']) {
    if (fs.existsSync(path.join(root, artifactRoot))) fail(`Unreviewed installation artifact directory: ${artifactRoot}`);
  }
  for (const item of selected) assertRegular(root, item);
  installPolicy(root);
  return selected.sort();
}
function writeFile(root, relative, content) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content, { flag: 'wx', mode: 0o644 });
}
function installationIdentity(root) {
  installPolicy(root);
  const inputRecords = INSTALL_INPUTS.map(relative => {
    const bytes = readPublicFile(root, relative);
    return { path: relative, size: bytes.length, sha256: sha256(bytes) };
  });
  const distribution = require('./toolchain/npm-distribution.cjs');
  const profile = distribution.validateProfile(JSON.parse(readPublicFile(root, TOOLCHAIN_INPUTS[0])));
  if (profile.activation !== 'selected-for-qualification'
      || profile.cacheDisposition !== 'accepted-npm-private-cache') fail('Toolchain selection and private-cache acceptance are required');
  const { bytes: lockBytes } = distribution.loadExternalLock(profile, path.join(root, TOOLCHAIN_INPUTS[1]));
  const verified = distribution.verifyArchiveBytes(readPublicFile(root, TOOLCHAIN_INPUTS[2]), profile, lockBytes);
  const toolchain = {
    distributionId: verified.distributionId, archiveSha256: verified.archiveSha256,
    archiveIntegrity: profile.archive.integrity, treeSha256: verified.treeSha256,
    inputLockSha256: profile.inputLock.sha256, nodeVersion: profile.runtime.nodeVersion,
  };
  const identity = { schemaVersion: CONTEXT_VERSION, inputRecords, publicNpmPolicy: PUBLIC_NPM_POLICY, toolchain };
  return { ...identity, cacheKey: sha256(JSON.stringify(identity)) };
}
function makeManifest(root, paths, kind) {
  const files = paths.sort().map(relative => {
    const content = readPublicFile(root, relative);
    return { path: relative, size: content.length, sha256: sha256(content) };
  });
  const identityRoot = kind === 'talent-studio-build-context' ? path.join(root, INSTALL_DIR) : root;
  return { version: CONTEXT_VERSION, kind, installInputs: [...INSTALL_INPUTS], installation: installationIdentity(identityRoot), files, inventorySha256: sha256(JSON.stringify(files)) };
}
function readManifest(root, relative, kind) {
  const manifest = JSON.parse(readPublicFile(root, relative));
  if (manifest.version !== CONTEXT_VERSION || manifest.kind !== kind || !Array.isArray(manifest.files)
      || JSON.stringify(manifest.installInputs) !== JSON.stringify(INSTALL_INPUTS)
      || manifest.inventorySha256 !== sha256(JSON.stringify(manifest.files))) fail('Invalid prepared context manifest');
  const seen = new Set();
  for (const item of manifest.files) {
    cleanPath(item.path);
    if (seen.has(item.path) || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('Invalid prepared context file entry');
    if (credentialPath(item.path)) fail(`Credential context input: ${item.path}`);
    seen.add(item.path);
  }
  return manifest;
}
function verifyFiles(root, manifest, marker, allowed, skip) {
  const directories = [];
  const files = walk(root, '', skip, directories);
  const expected = [...manifest.files.map(item => item.path), marker].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) fail('Prepared context inventory has missing or unexpected files');
  for (const directory of directories) {
    if (!expected.some(item => item.startsWith(`${directory}/`))) fail(`Unexpected prepared context directory: ${directory}`);
  }
  for (const item of manifest.files) {
    if (!allowed(item.path)) fail(`Unreviewed prepared context input: ${item.path}`);
    const content = readPublicFile(root, item.path);
    if (content.length !== item.size || sha256(content) !== item.sha256) fail(`Prepared context integrity mismatch: ${item.path}`);
  }
}
function verifyInstall(root, afterInstall = false) {
  root = fs.realpathSync(root);
  const manifest = readManifest(root, INSTALL_MANIFEST, 'talent-studio-install-inputs');
  if (JSON.stringify(manifest.files.map(item => item.path).sort()) !== JSON.stringify([...INSTALL_INPUTS].sort())) fail('Incomplete installation input inventory');
  verifyFiles(root, manifest, INSTALL_MANIFEST, item => INSTALL_INPUTS.includes(item), installedDependencySkip(root, afterInstall));
  if (JSON.stringify(manifest.installation) !== JSON.stringify(installationIdentity(root))) fail('Prepared installation identity mismatch');
  installPolicy(root);
  return manifest;
}
function verifyContext(root, withNodeModules = false) {
  root = fs.realpathSync(root);
  const manifest = readManifest(root, CONTEXT_MANIFEST, 'talent-studio-build-context');
  const allowed = item => reviewedBuildPath(item) || item === `${INSTALL_DIR}/${INSTALL_MANIFEST}`
    || (item.startsWith(`${INSTALL_DIR}/`) && INSTALL_INPUTS.includes(item.slice(INSTALL_DIR.length + 1)));
  verifyFiles(root, manifest, CONTEXT_MANIFEST, allowed, installedDependencySkip(root, withNodeModules));
  const preparedPaths = new Set(manifest.files.map(item => item.path));
  for (const item of BUILD_FILES) if (!preparedPaths.has(item)) fail(`Missing required prepared input: ${item}`);
  const rules = ignoreRules(readPublicFile(root, '.dockerignore').toString('utf8'));
  for (const item of [...preparedPaths, CONTEXT_MANIFEST]) if (!dockerIncludes(item, rules)) fail(`Docker would omit prepared input: ${item}`);
  const installManifest = verifyInstall(path.join(root, INSTALL_DIR));
  if (JSON.stringify(manifest.installation) !== JSON.stringify(installManifest.installation)) fail('Build and install identity differ');
  installPolicy(root);
  for (const item of INSTALL_INPUTS) {
    if (!readPublicFile(root, item).equals(readPublicFile(root, `${INSTALL_DIR}/${item}`))) fail(`Installation input differs from build input: ${item}`);
  }
  if (JSON.stringify(manifest.installation) !== JSON.stringify(installationIdentity(root))) fail('Prepared build installation identity mismatch');
  return manifest;
}
function prepareContext(source, destination) {
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  const realDestination = fs.existsSync(destination) ? fs.realpathSync(destination)
    : path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
  const relative = path.relative(source, realDestination);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) fail('Prepared context must be outside the source checkout');
  if (fs.existsSync(destination) && (!fs.lstatSync(destination).isDirectory() || fs.lstatSync(destination).isSymbolicLink() || fs.readdirSync(destination).length)) fail('Prepared context destination must be a new or empty directory');
  const selected = selectBuildPaths(source);
  installationIdentity(source); // Authenticate archive/lock before creating or populating the destination.
  const rules = ignoreRules(readPublicFile(source, '.dockerignore').toString('utf8'));
  for (const item of selected) if (!dockerIncludes(item, rules)) fail(`Docker would omit reviewed build input: ${item}`);
  fs.mkdirSync(destination, { recursive: true });
  for (const item of selected) writeFile(destination, item, readPublicFile(source, item));
  for (const item of INSTALL_INPUTS) writeFile(destination, `${INSTALL_DIR}/${item}`, readPublicFile(source, item));
  const installManifest = makeManifest(path.join(destination, INSTALL_DIR), [...INSTALL_INPUTS], 'talent-studio-install-inputs');
  writeFile(destination, `${INSTALL_DIR}/${INSTALL_MANIFEST}`, `${JSON.stringify(installManifest, null, 2)}\n`);
  const inventory = walk(destination);
  const manifest = makeManifest(destination, inventory, 'talent-studio-build-context');
  writeFile(destination, CONTEXT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  return verifyContext(destination);
}
function main(argv) {
  const [command, ...flags] = argv;
  const options = {};
  for (let index = 0; index < flags.length; index += 1) {
    const name = flags[index];
    if (['--after-install', '--with-node-modules'].includes(name)) options[name] = true;
    else if (['--source', '--output', '--context'].includes(name) && flags[index + 1] && !flags[index + 1].startsWith('--')) options[name] = flags[++index];
    else fail('Invalid build-context arguments');
  }
  let manifest;
  if (command === 'prepare' && options['--source'] && options['--output']) manifest = prepareContext(options['--source'], options['--output']);
  else if (command === 'verify' && options['--context']) manifest = verifyContext(options['--context'], options['--with-node-modules']);
  else if (command === 'verify-install' && options['--context']) manifest = verifyInstall(options['--context'], options['--after-install']);
  else fail('Use prepare --source <checkout> --output <empty external directory>, verify --context <directory>, or verify-install --context <directory>');
  console.log(JSON.stringify({ version: manifest.version, kind: manifest.kind, inventorySha256: manifest.inventorySha256, installation: manifest.installation, paths: manifest.files.map(item => item.path) }, null, 2));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Build context rejected: ${error.message}`); process.exitCode = 1; }
}
module.exports = { BUILD_FILES, INSTALL_INPUTS, TOOLCHAIN_INPUTS, PUBLIC_NPM_POLICY, CONTEXT_VERSION, CONTEXT_MANIFEST, INSTALL_DIR, INSTALL_MANIFEST, credentialPath, ignoreRules, dockerIncludes, prepareContext, verifyContext, verifyInstall, installationIdentity };
