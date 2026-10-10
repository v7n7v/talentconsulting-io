'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  BUILD_FILES, INSTALL_INPUTS, TOOLCHAIN_INPUTS, CONTEXT_MANIFEST, INSTALL_DIR, INSTALL_MANIFEST,
  credentialPath, ignoreRules, dockerIncludes, prepareContext, verifyContext, verifyInstall, installationIdentity,
} = require('./docker-build-context');
const repoRoot = path.resolve(__dirname, '..');
const SECRET_SENTINEL = 'SYNTHETIC_ONLY_DO_NOT_COPY_0b84549e';

function write(root, relative, content) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
}
function tracked(root, names) {
  execFileSync('git', ['add', '--force', '--', ...names], { cwd: root, stdio: 'pipe' });
}
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'talent-build-context-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, 'source');
  const output = path.join(base, 'prepared');
  fs.mkdirSync(source);
  execFileSync('git', ['init', '--quiet', source], { stdio: 'pipe' });
  for (const name of BUILD_FILES) {
    const content = ['.dockerignore', 'Dockerfile', 'eslint.config.cjs', 'scripts/docker-build-context.js', ...TOOLCHAIN_INPUTS].includes(name)
      ? fs.readFileSync(path.join(repoRoot, name))
      : name === 'package.json' ? JSON.stringify({ name: 'synthetic-build-context', private: true, scripts: { build: 'next build --webpack' } })
        : name === 'package-lock.json' ? JSON.stringify({ name: 'synthetic-build-context', lockfileVersion: 3, packages: { '': { name: 'synthetic-build-context' } } })
          : name.endsWith('.json') ? '{}\n' : '// synthetic public build input\n';
    write(source, name, content);
  }
  write(source, 'app/page.tsx', 'export default function Page() { return null; }\n');
  write(source, 'public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(source, 'docs/review.md', '# Synthetic non-build document\n');
  tracked(source, [...BUILD_FILES, 'app/page.tsx', 'public/favicon.svg', 'docs/review.md']);
  return { source, output, base };
}
function injectManifestEntry(root, relative) {
  const marker = path.join(root, CONTEXT_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'));
  const content = fs.readFileSync(path.join(root, relative));
  manifest.files.push({ path: relative, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  manifest.inventorySha256 = crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
  fs.writeFileSync(marker, JSON.stringify(manifest));
}
function refreshInstallFileInventory(root) {
  const marker = path.join(root, INSTALL_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'));
  manifest.files = INSTALL_INPUTS.map(relative => {
    const content = fs.readFileSync(path.join(root, relative));
    return { path: relative, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
  }).sort((a, b) => a.path.localeCompare(b.path));
  manifest.inventorySha256 = crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
  fs.writeFileSync(marker, JSON.stringify(manifest));
}

test('prepares the reviewed tracked inputs and exact pre-install bundle, with deterministic path hashes', t => {
  const { source, output, base } = fixture(t);
  const first = prepareContext(source, output);
  const second = prepareContext(source, path.join(base, 'prepared-again'));
  assert.equal(first.inventorySha256, second.inventorySha256);
  assert.deepEqual(first.files, second.files);
  assert.ok(first.files.some(item => item.path === 'app/page.tsx'));
  assert.ok(first.files.some(item => item.path === 'public/favicon.svg'));
  assert.ok(!first.files.some(item => item.path.startsWith('docs/')));
  assert.deepEqual(verifyInstall(path.join(output, INSTALL_DIR)).files.map(item => item.path).sort(), [...INSTALL_INPUTS].sort());
  for (const name of INSTALL_INPUTS) assert.deepEqual(fs.readFileSync(path.join(output, name)), fs.readFileSync(path.join(output, INSTALL_DIR, name)));
  assert.equal(verifyContext(output).inventorySha256, first.inventorySha256);
});

test('source credential/public-env/backup sentinels are never read or copied; actual ignore rules exclude their paths', t => {
  const { source, output } = fixture(t);
  const sentinels = [
    'hermes-agent-keys.txt', '.env', '.env.production', '.env.local', '.env.local.bak.123',
    '.env-backup', '.env.cloudrun.yaml', '.env.cloudrun.yaml.example', '.envrc', '.npmrc',
    'env.example', 'YOUR_CREDENTIALS.txt', '.aws/credentials', '.ssh/id_ed25519',
    '.config/gcloud/application_default_credentials.json', 'app/.env-backup',
    'lib/hermes-agent-keys.txt', 'public/serviceAccount.json', 'lib/service-account.json',
    'lib/secrets/config.json', 'public/credentials/client.json', 'public/key.pem',
    'public/key.key', 'public/cert.p12', 'public/cert.pfx', 'app/_backup/settings.json',
    'lib/settings.json.bak.123', 'lib/settings.json.orig', 'lib/settings.json.save',
  ];
  for (const name of sentinels) write(source, name, SECRET_SENTINEL);
  // Tracked credentials are not a reason to trust them. This also proves the
  // deliberate public .env.production exclusion without opening the real file.
  tracked(source, sentinels);
  const originalOpen = fs.openSync;
  const reads = [];
  fs.openSync = function (filename, flags, ...rest) {
    const relative = path.relative(source, String(filename)).split(path.sep).join('/');
    if (sentinels.includes(relative)) { reads.push(relative); throw new Error('Synthetic credential was read'); }
    return originalOpen.call(this, filename, flags, ...rest);
  };
  let manifest;
  try { manifest = prepareContext(source, output); }
  finally { fs.openSync = originalOpen; }
  assert.deepEqual(reads, []);
  const rules = ignoreRules(fs.readFileSync(path.join(source, '.dockerignore'), 'utf8'));
  for (const name of sentinels) {
    assert.equal(credentialPath(name), true, name);
    assert.equal(dockerIncludes(name, rules), false, name);
    assert.ok(!manifest.files.some(item => item.path === name || item.path === `${INSTALL_DIR}/${name}`), name);
    assert.equal(fs.existsSync(path.join(output, name)), false, name);
  }
  for (const item of manifest.files) assert.ok(!fs.readFileSync(path.join(output, item.path)).includes(SECRET_SENTINEL));
});

test('untracked, unknown-extension and unknown-root inputs fail before the destination is populated', t => {
  for (const name of ['lib/unreviewed.ts', 'public/unreviewed.bin', 'future-build/config.json']) {
    const { source, output } = fixture(t);
    write(source, name, 'synthetic public unknown input');
    if (name !== 'lib/unreviewed.ts') tracked(source, [name]);
    assert.throws(() => prepareContext(source, output), /Unreviewed|untracked/);
    assert.equal(fs.existsSync(output), false);
  }
});

test('missing required tracked input and symlinks fail before copying', t => {
  const missing = fixture(t);
  execFileSync('git', ['rm', '--cached', '--quiet', 'proxy.ts'], { cwd: missing.source });
  assert.throws(() => prepareContext(missing.source, missing.output), /not tracked/);
  const link = fixture(t);
  fs.unlinkSync(path.join(link.source, 'app/page.tsx'));
  fs.symlinkSync(path.join(link.source, 'docs/review.md'), path.join(link.source, 'app/page.tsx'));
  assert.throws(() => prepareContext(link.source, link.output), /Symlink/);
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory.base, 'external-lib'));
  fs.symlinkSync(path.join(directory.base, 'external-lib'), path.join(directory.source, 'lib'));
  assert.throws(() => prepareContext(directory.source, directory.output), /Symlink/);
});

test('new root install hooks, local locked dependencies and patch/vendor directories cannot be silently omitted', t => {
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    const { source, output } = fixture(t);
    write(source, 'package.json', JSON.stringify({ name: 'synthetic-build-context', scripts: { [hook]: 'node scripts/future-install.js' } }));
    assert.throws(() => prepareContext(source, output), /Unreviewed root install hook/);
  }
  for (const root of ['patches', 'vendor']) {
    const { source, output } = fixture(t);
    write(source, `${root}/synthetic-public-artifact.txt`, 'public artifact');
    assert.throws(() => prepareContext(source, output), /Unreviewed installation artifact directory/);
  }
  const local = fixture(t);
  write(local.source, 'package.json', JSON.stringify({ dependencies: { synthetic: 'file:vendor/synthetic.tgz' } }));
  assert.throws(() => prepareContext(local.source, local.output), /Unreviewed local dependency/);
  const locked = fixture(t);
  write(locked.source, 'package-lock.json', JSON.stringify({ packages: { 'node_modules/synthetic': { resolved: 'file:vendor/synthetic.tgz' } } }));
  assert.throws(() => prepareContext(locked.source, locked.output), /Unreviewed locked local dependency/);
});

test('actual ignore changes that omit a reviewed source or pre-install input fail closed', t => {
  for (const rule of ['app/**', '.docker-install/**', 'scripts/docker-build-context.js']) {
    const { source, output } = fixture(t);
    fs.appendFileSync(path.join(source, '.dockerignore'), `\n${rule}\n`);
    assert.throws(() => prepareContext(source, output), /Docker would omit/);
  }
});

test('Docker ignore rules use root-relative names, final-match ordering and ancestor fallback', t => {
  const differentialCases = [
    // Moby MatchesOrParentMatches fixtures and Docker's documented README order,
    // restricted to this verifier's literal/*/whole-component-** grammar.
    // https://github.com/moby/patternmatcher/blob/main/patternmatcher_test.go
    { rules: '**', name: 'dir/file', included: false },
    { rules: '**/**', name: 'dir/file', included: false },
    { rules: 'dir/**', name: 'dir/dir2/file', included: false },
    { rules: '**/dir', name: 'dir/file', included: false },
    { rules: '**/dir2/*', name: 'dir/dir2/file', included: false },
    { rules: '**/*.txt', name: 'file.txt', included: false },
    { rules: '**/**/*.txt2', name: 'dir/dir/file.txt', included: true },
    { rules: 'a/*.txt', name: 'a/dir/file.txt', included: true },
    { rules: 'abc/**', name: 'abc', included: true },
    { rules: 'abc/**', name: 'abc/def/ghi', included: false },
    { rules: 'docs\n!docs/README.md', name: 'docs/README.md', included: true },
    { rules: '**\n!util/docker/web', name: 'util/docker/web/foo', included: true },
    { rules: '**\n!util/docker/web\nutil/docker/web/foo', name: 'util/docker/web/foo', included: false },
    { rules: '*.md\n!README*.md\nREADME-secret.md', name: 'README-secret.md', included: false },
    { rules: '*.md\nREADME-secret.md\n!README*.md', name: 'README-secret.md', included: true },
    { rules: '*.md', name: 'docs/README.md', included: true },
    // Exact independent-review reproductions and descendant exception controls.
    { rules: '**\n!app\n!app/**\napp/page.tsx\n!page.tsx', name: 'app/page.tsx', included: false },
    { rules: '**\n!app/page.tsx', name: 'app/page.tsx', included: true },
    { rules: '**\n!app/page.tsx', name: 'app/other.tsx', included: false },
    { rules: 'app\n!app/page.tsx\napp', name: 'app/page.tsx', included: false },
    { rules: 'app/*', name: 'app/nested/page.tsx', included: false },
  ];
  for (const item of differentialCases) assert.equal(dockerIncludes(item.name, ignoreRules(item.rules)), item.included, JSON.stringify(item));
  for (const unsupported of ['./app/page.tsx', 'app/../page.tsx', 'app//page.tsx', 'a**/*.txt', ' #ambiguous-comment']) {
    assert.throws(() => ignoreRules(unsupported), /Unsupported Docker ignore rule/, unsupported);
  }
  const excluded = fixture(t);
  fs.appendFileSync(path.join(excluded.source, '.dockerignore'), '\napp/page.tsx\n!page.tsx\n');
  assert.throws(() => prepareContext(excluded.source, excluded.output), /Docker would omit reviewed build input: app\/page.tsx/);
  assert.equal(fs.existsSync(excluded.output), false);
  const descendant = fixture(t);
  fs.appendFileSync(path.join(descendant.source, '.dockerignore'), '\napp\n!app/page.tsx\n');
  prepareContext(descendant.source, descendant.output);
  verifyContext(descendant.output);
});

test('after-install dependency root must be a real directory; legitimate nested npm symlinks stay unwalked', t => {
  for (const mode of ['build', 'install']) {
    for (const rootKind of ['symlink', 'dangling-symlink', 'file']) {
      const { source, output, base } = fixture(t);
      prepareContext(source, output);
      const context = mode === 'build' ? output : path.join(output, INSTALL_DIR);
      const external = path.join(base, 'external-node-modules');
      if (rootKind === 'symlink') fs.mkdirSync(external);
      if (rootKind === 'file') write(context, 'node_modules', '// not a dependency directory');
      else fs.symlinkSync(external, path.join(context, 'node_modules'));
      assert.throws(() => mode === 'build' ? verifyContext(context, true) : verifyInstall(context, true), /node_modules must be a real directory/);
    }
    const valid = fixture(t);
    prepareContext(valid.source, valid.output);
    const context = mode === 'build' ? valid.output : path.join(valid.output, INSTALL_DIR);
    write(context, 'node_modules/synthetic/bin.js', '// synthetic executable');
    fs.mkdirSync(path.join(context, 'node_modules/.bin'));
    fs.symlinkSync('../synthetic/bin.js', path.join(context, 'node_modules/.bin/synthetic'));
    if (mode === 'build') verifyContext(context, true);
    else verifyInstall(context, true);
  }
});

test('declared workspaces fail before copying even with a stale or incomplete lock', t => {
  for (const workspaces of [['docs/packages/*'], { packages: ['docs/packages/*'] }, [], null]) {
    const { source, output } = fixture(t);
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json')));
    manifest.workspaces = workspaces;
    write(source, 'package.json', JSON.stringify(manifest));
    assert.throws(() => prepareContext(source, output), /Unreviewed root workspaces/);
    assert.equal(fs.existsSync(output), false);
  }
  const stale = fixture(t);
  write(stale.source, 'package-lock.json', JSON.stringify({ packages: { '': { workspaces: ['docs/packages/*'] } } }));
  assert.throws(() => prepareContext(stale.source, stale.output), /Unreviewed root workspaces/);
  assert.equal(fs.existsSync(stale.output), false);
});

test('local file Git URLs and case variants are rejected in every manifest dependency field and lock-only inputs', t => {
  const localSpecs = [
    'git+file:///synthetic/local/repo#abc123',
    'Git+File:///synthetic/local/repo#abc123',
    'GIT+FILE:///synthetic/local/repo#abc123',
    'FILE:../synthetic-local-package',
  ];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const spec of localSpecs) {
      const { source, output } = fixture(t);
      write(source, 'package.json', JSON.stringify({ [field]: { synthetic: spec } }));
      assert.throws(() => prepareContext(source, output), /Unreviewed local dependency input/);
      assert.equal(fs.existsSync(output), false);
    }
  }
  for (const resolved of localSpecs) {
    const { source, output } = fixture(t);
    write(source, 'package-lock.json', JSON.stringify({ packages: { 'node_modules/synthetic': { resolved } } }));
    assert.throws(() => prepareContext(source, output), /Unreviewed locked local dependency input/);
    assert.equal(fs.existsSync(output), false);
  }
  const registryAlias = fixture(t);
  write(registryAlias.source, 'package.json', JSON.stringify({ dependencies: { 'synthetic-alias': 'npm:synthetic-package@^1.0.0' } }));
  write(registryAlias.source, 'package-lock.json', JSON.stringify({ packages: {
    '': { dependencies: { 'synthetic-alias': 'npm:synthetic-package@^1.0.0' } },
    'node_modules/synthetic-alias': { name: 'synthetic-package', version: '1.0.0', resolved: 'https://registry.npmjs.org/synthetic-package/-/synthetic-package-1.0.0.tgz' },
  } }));
  prepareContext(registryAlias.source, registryAlias.output);
  verifyContext(registryAlias.output);
});

test('tracked or untracked npm-shrinkwrap/binding.gyp selectors are rejected by lstat before reads or writes', t => {
  for (const name of ['npm-shrinkwrap.json', 'binding.gyp']) {
    for (const rootKind of ['untracked', 'tracked', 'dangling-symlink']) {
      const { source, output, base } = fixture(t);
      if (rootKind === 'dangling-symlink') fs.symlinkSync(path.join(base, 'nonexistent-selector'), path.join(source, name));
      else write(source, name, SECRET_SENTINEL);
      if (rootKind === 'tracked') tracked(source, [name]);
      const originalOpen = fs.openSync;
      fs.openSync = function (filename, ...args) {
        if (String(filename) === path.join(source, name)) throw new Error('Selector content was read');
        return originalOpen.call(this, filename, ...args);
      };
      try { assert.throws(() => prepareContext(source, output), /Unreviewed root installation selector/); }
      finally { fs.openSync = originalOpen; }
      assert.equal(fs.existsSync(output), false);
    }
  }
});

test('prepared credential, unknown, missing, tampered and symlink inputs are rejected before Docker', t => {
  for (const name of ['lib/unreviewed.bin', 'lib/.env.local', 'public/serviceAccount.json']) {
    const { source, output } = fixture(t);
    prepareContext(source, output);
    write(output, name, SECRET_SENTINEL);
    assert.throws(() => verifyContext(output), /inventory|Credential/);
    injectManifestEntry(output, name);
    assert.throws(() => verifyContext(output), name === 'lib/unreviewed.bin' ? /inventory|Unreviewed/ : /Credential/);
  }
  const missing = fixture(t);
  prepareContext(missing.source, missing.output);
  fs.unlinkSync(path.join(missing.output, 'app/page.tsx'));
  assert.throws(() => verifyContext(missing.output), /inventory/);
  const tampered = fixture(t);
  prepareContext(tampered.source, tampered.output);
  fs.appendFileSync(path.join(tampered.output, 'app/page.tsx'), '// changed after prepare');
  assert.throws(() => verifyContext(tampered.output), /integrity mismatch/);
  const symlink = fixture(t);
  prepareContext(symlink.source, symlink.output);
  fs.unlinkSync(path.join(symlink.output, 'app/page.tsx'));
  fs.symlinkSync(path.join(symlink.source, 'app/page.tsx'), path.join(symlink.output, 'app/page.tsx'));
  assert.throws(() => verifyContext(symlink.output), /Symlink/);
});

test('installation bundle hashes survive generated node_modules but reject lock mutation and omitted script', t => {
  const { source, output } = fixture(t);
  prepareContext(source, output);
  const install = path.join(output, INSTALL_DIR);
  write(install, 'node_modules/synthetic/index.js', '// simulated installed dependency');
  assert.throws(() => verifyInstall(install), /inventory/);
  verifyInstall(install, true);
  fs.appendFileSync(path.join(install, 'package-lock.json'), ' ');
  assert.throws(() => verifyInstall(install, true), /integrity mismatch/);
  const missing = fixture(t);
  prepareContext(missing.source, missing.output);
  fs.unlinkSync(path.join(missing.output, INSTALL_DIR, 'scripts/docker-build-context.js'));
  assert.throws(() => verifyInstall(path.join(missing.output, INSTALL_DIR)), /inventory/);
});

test('unexpected empty directories and traversal/absolute/duplicate manifest paths fail without reading outside files', t => {
  for (const directory of ['future-inputs', 'lib/credentials']) {
    const { source, output } = fixture(t);
    prepareContext(source, output);
    fs.mkdirSync(path.join(output, directory), { recursive: true });
    assert.throws(() => verifyContext(output), /Unexpected prepared context directory|Credential/);
  }
  for (const invalidPath of ['../outside.json', '/outside.json', 'lib/../outside.json', 'lib\\outside.json', 'lib/\u0000outside.json']) {
    const { source, output } = fixture(t);
    prepareContext(source, output);
    const marker = path.join(output, CONTEXT_MANIFEST);
    const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'));
    manifest.files[0].path = invalidPath;
    manifest.inventorySha256 = crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
    fs.writeFileSync(marker, JSON.stringify(manifest));
    assert.throws(() => verifyContext(output), /Invalid context path/);
  }
  const duplicate = fixture(t);
  prepareContext(duplicate.source, duplicate.output);
  const marker = path.join(duplicate.output, CONTEXT_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(marker, 'utf8'));
  manifest.files.push(manifest.files[0]);
  manifest.inventorySha256 = crypto.createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
  fs.writeFileSync(marker, JSON.stringify(manifest));
  assert.throws(() => verifyContext(duplicate.output), /Invalid prepared context file entry/);
});

test('source destinations, non-empty outputs and unsupported ignore rules are rejected', t => {
  const { source, output } = fixture(t);
  assert.throws(() => prepareContext(source, path.join(source, 'prepared')), /outside/);
  fs.mkdirSync(output);
  write(output, 'existing.txt', 'existing output stays intact');
  assert.throws(() => prepareContext(source, output), /empty directory/);
  assert.equal(fs.readFileSync(path.join(output, 'existing.txt'), 'utf8'), 'existing output stays intact');
  assert.throws(() => ignoreRules('**\n!app/[a-z].tsx\n'), /Unsupported/);
});

test('schema-v1 manifests and incomplete or extra installation artifacts are rejected', t => {
  assert.equal(INSTALL_INPUTS.length, 11);
  assert.equal(new Set(INSTALL_INPUTS).size, INSTALL_INPUTS.length);

  const oldBuild = fixture(t);
  prepareContext(oldBuild.source, oldBuild.output);
  const contextManifestPath = path.join(oldBuild.output, CONTEXT_MANIFEST);
  const contextManifest = JSON.parse(fs.readFileSync(contextManifestPath, 'utf8'));
  contextManifest.version = 1;
  fs.writeFileSync(contextManifestPath, JSON.stringify(contextManifest));
  assert.throws(() => verifyContext(oldBuild.output), /Invalid prepared context manifest/);

  const oldInstall = fixture(t);
  prepareContext(oldInstall.source, oldInstall.output);
  const installRoot = path.join(oldInstall.output, INSTALL_DIR);
  const installManifestPath = path.join(installRoot, INSTALL_MANIFEST);
  const installManifest = JSON.parse(fs.readFileSync(installManifestPath, 'utf8'));
  installManifest.version = 1;
  fs.writeFileSync(installManifestPath, JSON.stringify(installManifest));
  assert.throws(() => verifyInstall(installRoot), /Invalid prepared context manifest/);

  for (const change of ['missing', 'extra']) {
    const { source, output } = fixture(t);
    prepareContext(source, output);
    const install = path.join(output, INSTALL_DIR);
    if (change === 'missing') fs.unlinkSync(path.join(install, 'toolchain/npm/NOTICE.md'));
    else write(install, 'toolchain/npm/unreviewed-install-input.json', '{}\n');
    assert.throws(() => verifyInstall(install), /inventory/);
  }
});

test('regenerated installation file manifests cannot bypass external archive or lock pins', t => {
  for (const artifact of [
    { path: 'toolchain/npm/taco-npm-12.1.0-registry-patches.20261009.r1.tgz', error: /EARCHIVE_SHA256|EARCHIVE_SRI/ },
    { path: 'toolchain/npm/toolchain-inputs.lock.json', error: /ELOCK/ },
  ]) {
    const { source, output } = fixture(t);
    prepareContext(source, output);
    const install = path.join(output, INSTALL_DIR);
    const target = path.join(install, artifact.path);
    if (artifact.path.endsWith('.tgz')) {
      const bytes = fs.readFileSync(target);
      bytes[bytes.length - 1] ^= 1;
      fs.writeFileSync(target, bytes);
    } else fs.appendFileSync(target, ' ');

    // A recomputed per-file inventory is not an authority for the selected
    // distribution. Verification must still compare against the profile pins.
    refreshInstallFileInventory(install);
    assert.throws(() => verifyInstall(install), artifact.error);
  }
});

test('installation cache identity changes when reviewed verifier, runtime, notice or package inputs change', t => {
  const changedInputs = [
    'scripts/docker-build-context.js',
    'scripts/toolchain/npm-runtime.cjs',
    'toolchain/npm/NOTICE.md',
    'package.json',
  ];
  for (const relative of changedInputs) {
    const { source } = fixture(t);
    const before = installationIdentity(source).cacheKey;
    fs.appendFileSync(path.join(source, relative), relative.endsWith('.json') ? '\n  \n' : '\n// synthetic identity change\n');
    const after = installationIdentity(source).cacheKey;
    assert.notEqual(after, before, relative);
  }
});

test('raw .npmrc is excluded from installation identity, never opened or copied', t => {
  const { source, output } = fixture(t);
  write(source, '.npmrc', SECRET_SENTINEL);
  tracked(source, ['.npmrc']);
  assert.equal(INSTALL_INPUTS.includes('.npmrc'), false);
  const originalOpen = fs.openSync;
  const reads = [];
  fs.openSync = function (filename, flags, ...rest) {
    if (String(filename) === path.join(source, '.npmrc')) {
      reads.push(String(filename));
      throw new Error('Raw npm config was read');
    }
    return originalOpen.call(this, filename, flags, ...rest);
  };
  try {
    installationIdentity(source);
    prepareContext(source, output);
  } finally { fs.openSync = originalOpen; }
  assert.deepEqual(reads, []);
  assert.equal(fs.existsSync(path.join(output, '.npmrc')), false);
  assert.equal(fs.existsSync(path.join(output, INSTALL_DIR, '.npmrc')), false);
});

test('Docker excludes unreviewed toolchain files while including the exact reviewed set', t => {
  const { source } = fixture(t);
  const rules = ignoreRules(fs.readFileSync(path.join(source, '.dockerignore'), 'utf8'));
  assert.equal(dockerIncludes('toolchain/npm/unreviewed-install-input.json', rules), false);
  for (const relative of TOOLCHAIN_INPUTS) assert.equal(dockerIncludes(relative, rules), true, relative);
});

test('CLI uses the same preparation and verifier, emits paths/hashes and fails without a prepared manifest', t => {
  const { source, output } = fixture(t);
  const script = path.join(repoRoot, 'scripts/docker-build-context.js');
  const prepared = spawnSync(process.execPath, [script, 'prepare', '--source', source, '--output', output], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.ok(JSON.parse(prepared.stdout).paths.includes('app/page.tsx'));
  assert.ok(!prepared.stdout.includes('export default'));
  const checked = spawnSync(process.execPath, [script, 'verify', '--context', output], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  const raw = spawnSync(process.execPath, [script, 'verify', '--context', source], { encoding: 'utf8' });
  assert.notEqual(raw.status, 0);
  assert.ok(raw.stderr.includes('Build context rejected:'));
});
