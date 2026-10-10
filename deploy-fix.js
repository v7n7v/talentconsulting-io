const fs = require('fs');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('child_process');

const firebaseJsonPath = './firebase.json';
const firebaseEnvPath = './.env';
const localEnvPath = './.env.local';
const FIREBASE_RESERVED_ENV_PREFIX = /^(?:FIREBASE_|EXT_|X_GOOGLE_)/;
const DEPLOY_LOCAL_ONLY_ENV_KEYS = new Set([
  'ADMIN_SMOKE_MFA_ID_TOKEN',
  'ADMIN_SMOKE_OWNER_EMAIL',
  'ADMIN_AGGREGATE_BASE_URL',
  // Local demo auth bypass (lib/demo-mode.ts). It has to live in .env.local to run the
  // browser gate against a seeded user, and this file merges .env.local into the
  // deployed runtime env - so without this line a developer's local flag rides along
  // into a production build, where NEXT_PUBLIC_* is baked into the client bundle.
  // isDemoModeEnabled() also refuses when NODE_ENV is production, but one guard is not
  // a safety margin for an auth bypass. Excluded here so it cannot travel at all.
  'NEXT_PUBLIC_DISABLE_AUTH_GATE',
]);
const PRODUCTION_FIREBASE_PROJECT = 'talent-consulting-acf16';
const PRODUCTION_SSR_SERVICE = 'ssrtalentconsultingacf1';
const PRODUCTION_REGION = 'us-east1';
const ROLLBACK_CHANNEL = 'admin-command-grid-rollback';

function parseEnvLines(content) {
  const lines = content.split(/\r?\n/);
  const entries = new Map();
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match) entries.set(match[1], line);
  }
  return entries;
}

function buildFirebaseRuntimeEnv(originalContent, localContent) {
  const merged = parseEnvLines(originalContent);
  for (const [key, line] of parseEnvLines(localContent)) {
    if (FIREBASE_RESERVED_ENV_PREFIX.test(key) || DEPLOY_LOCAL_ONLY_ENV_KEYS.has(key)) continue;
    merged.set(key, line);
  }
  for (const key of [...merged.keys()]) {
    if (FIREBASE_RESERVED_ENV_PREFIX.test(key) || DEPLOY_LOCAL_ONLY_ENV_KEYS.has(key)) {
      merged.delete(key);
    }
  }
  return `${[...merged.values()].join('\n')}\n`;
}

function buildFrameworksConfig(original) {
  return {
    ...original,
    hosting: {
      ...(original.hosting || {}),
      source: '.',
      frameworksBackend: {
        ...(original.hosting?.frameworksBackend || {}),
        region: 'us-east1',
      },
    },
  };
}

function buildStaticFallbackConfig(original) {
  const { source: _source, frameworksBackend: _frameworksBackend, ...hosting } = original.hosting || {};
  return {
    ...original,
    hosting: {
      ...hosting,
      public: '.firebase/talent-consulting-acf16/hosting',
      rewrites: [{
        source: '**',
        run: { serviceId: 'ssrtalentconsultingacf1', region: 'us-east1' },
      }],
    },
  };
}

function runFirebase(args, options = {}) {
  const cliArgs = ['--yes', '--package', 'firebase-tools@15.24.0', 'node', 'scripts/firebase-cli-wrapper.js', ...args];
  const executable = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : 'npx';
  const executableArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx.cmd', ...cliArgs]
    : cliArgs;
  const result = spawnSync(
    executable,
    executableArgs,
    { encoding: 'utf8' },
  );
  if (result.stdout && !options.quiet) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`Firebase CLI launch failed: ${result.error.code || result.error.name || 'unknown_error'}\n`);
  }
  return result;
}

function runGcloud(args) {
  const executable = process.platform === 'win32' ? 'gcloud.cmd' : 'gcloud';
  return spawnSync(executable, args, { encoding: 'utf8' });
}

function runProductionPreflight() {
  execFileSync(
    process.execPath,
    ['scripts/production-deploy-preflight.js', 'firebase'],
    { stdio: 'inherit' },
  );
}

function captureProductionRollbackPoint(dependencies = {}) {
  const run = dependencies.runFirebase || runFirebase;
  const gcloud = dependencies.runGcloud || runGcloud;
  assertSucceeded(run([
    'hosting:clone',
    `${PRODUCTION_FIREBASE_PROJECT}:live`,
    `${PRODUCTION_FIREBASE_PROJECT}:${ROLLBACK_CHANNEL}`,
    '--project',
    PRODUCTION_FIREBASE_PROJECT,
    // No --force here. hosting:clone takes no options beyond --help in the
    // firebase-tools version pinned in runFirebase, and --force is not a global
    // either, so passing it made commander exit 1 with "unknown option
    // '--force'" before the clone ran. --non-interactive is a real global and is
    // what actually makes this safe to run unattended: it errors out rather than
    // waiting on a prompt.
    '--non-interactive',
  ]), 'Firebase Hosting rollback capture');
  const revisionResult = gcloud([
    'run',
    'services',
    'describe',
    PRODUCTION_SSR_SERVICE,
    '--region',
    PRODUCTION_REGION,
    '--project',
    PRODUCTION_FIREBASE_PROJECT,
    '--format=json(status.traffic)',
  ]);
  assertSucceeded(revisionResult, 'Cloud Run rollback revision capture');
  let parsedTraffic;
  try {
    const parsed = JSON.parse(String(revisionResult.stdout || ''));
    parsedTraffic = parsed?.status?.traffic || parsed?.traffic || parsed;
  } catch {
    throw new Error('Cloud Run rollback traffic capture returned invalid JSON.');
  }
  if (!Array.isArray(parsedTraffic)) {
    throw new Error('Cloud Run rollback traffic capture did not return a traffic assignment.');
  }
  const trafficByRevision = new Map();
  for (const entry of parsedTraffic) {
    const revision = String(entry?.revisionName || '').trim();
    const percent = Number(entry?.percent);
    // Tag-only entries carry no `percent`, and Number(undefined) is NaN. NaN <= 0
    // is false, so a bare `percent <= 0` did NOT skip them: each one added
    // 0 + NaN, Number.isInteger(NaN) failed the check below, and the whole
    // capture threw. Firebase Hosting leaves one `fh-`-tagged revision behind per
    // preview channel it has ever created — production carries 69 of them against
    // a single revision actually serving traffic, so this threw every time on real
    // data while the fixtures, which only ever had percent-bearing entries, passed.
    if (!Number.isFinite(percent) || percent <= 0) continue;
    trafficByRevision.set(revision, (trafficByRevision.get(revision) || 0) + percent);
  }
  const traffic = [...trafficByRevision].map(([revision, percent]) => ({ revision, percent }));
  if (
    traffic.length < 1
    || traffic.some(entry => !/^[a-z][a-z0-9-]{0,62}$/.test(entry.revision)
      || !Number.isInteger(entry.percent)
      || entry.percent < 1
      || entry.percent > 100)
    || traffic.reduce((sum, entry) => sum + entry.percent, 0) !== 100
  ) {
    throw new Error('Cloud Run rollback traffic capture returned an invalid resolved traffic assignment.');
  }
  return { traffic };
}

function restoreProductionRollbackPoint(rollback, dependencies = {}) {
  const run = dependencies.runFirebase || runFirebase;
  const gcloud = dependencies.runGcloud || runGcloud;
  assertSucceeded(run([
    'hosting:clone',
    `${PRODUCTION_FIREBASE_PROJECT}:${ROLLBACK_CHANNEL}`,
    `${PRODUCTION_FIREBASE_PROJECT}:live`,
    '--project',
    PRODUCTION_FIREBASE_PROJECT,
    // Same as the capture path above — no --force. This one matters more: it is
    // the automatic restore, so an unknown-option exit here would strand
    // production on a half-deployed state instead of rolling it back.
    '--non-interactive',
  ]), 'Firebase Hosting rollback');
  assertSucceeded(gcloud([
    'run',
    'services',
    'update-traffic',
    PRODUCTION_SSR_SERVICE,
    `--to-revisions=${rollback.traffic.map(entry => `${entry.revision}=${entry.percent}`).join(',')}`,
    '--region',
    PRODUCTION_REGION,
    '--project',
    PRODUCTION_FIREBASE_PROJECT,
    '--quiet',
  ]), 'Cloud Run rollback');
}

function promoteDeployedRevision(dependencies = {}) {
  const gcloud = dependencies.runGcloud || runGcloud;
  const result = gcloud([
    'functions',
    'describe',
    PRODUCTION_SSR_SERVICE,
    '--gen2',
    '--region',
    PRODUCTION_REGION,
    '--project',
    PRODUCTION_FIREBASE_PROJECT,
    '--format=json(state,serviceConfig.revision)',
  ]);
  assertSucceeded(result, 'Cloud Function deployed revision lookup');
  let descriptor;
  try {
    descriptor = JSON.parse(String(result.stdout || ''));
  } catch {
    throw new Error('Cloud Function deployed revision lookup returned invalid JSON.');
  }
  const state = String(descriptor.state || '').trim();
  const created = String(descriptor.serviceConfig?.revision || '').trim();
  if (state !== 'ACTIVE' || !created.startsWith(`${PRODUCTION_SSR_SERVICE}-`) || !/^[a-z][a-z0-9-]{0,62}$/.test(created)) {
    throw new Error('Cloud Function deployed revision is not active or valid.');
  }
  assertSucceeded(gcloud([
    'run',
    'services',
    'update-traffic',
    PRODUCTION_SSR_SERVICE,
    '--to-revisions=' + created + '=100',
    '--region', PRODUCTION_REGION, '--project', PRODUCTION_FIREBASE_PROJECT, '--quiet',
  ]), 'Cloud Run deployed revision promotion');
  return created;
}

// Hosting's pinTag conversion uses Cloud Run's latestReadyRevisionName, which
// can still describe the previous function when Hosting finalizes. Default
// traffic promotion does not change a tagged rewrite. Retarget only this new
// Hosting version's own tag; the captured rollback version must stay untouched.
function pinPublishedHostingRevision(revision, dependencies = {}) {
  if (!revision.startsWith(`${PRODUCTION_SSR_SERVICE}-`) || !/^[a-z][a-z0-9-]{0,62}$/.test(revision)) {
    throw new Error('Hosting revision binding received an invalid deployed revision.');
  }
  const run = dependencies.runFirebase || runFirebase;
  const gcloud = dependencies.runGcloud || runGcloud;
  const result = run([
    'hosting:channel:list', '--project', PRODUCTION_FIREBASE_PROJECT, '--json', '--non-interactive',
  ], { quiet: true });
  assertSucceeded(result, 'Firebase Hosting published version lookup');
  let channels;
  try { channels = JSON.parse(result.stdout).result.channels; } catch {
    throw new Error('Firebase Hosting published version lookup returned invalid JSON.');
  }
  if (!Array.isArray(channels)) throw new Error('Firebase Hosting channel lookup returned no channels.');
  const channelRoot = `projects/${PRODUCTION_FIREBASE_PROJECT}/sites/${PRODUCTION_FIREBASE_PROJECT}/channels/`;
  const versionRoot = `projects/${PRODUCTION_FIREBASE_PROJECT}/sites/${PRODUCTION_FIREBASE_PROJECT}/versions/`;
  const versionFor = channel => {
    const matches = channels.filter(entry => entry.name === channelRoot + channel);
    if (matches.length !== 1) throw new Error(`Firebase Hosting ${channel} channel is ambiguous or absent.`);
    const version = matches[0].release?.version;
    if (version?.status !== 'FINALIZED' || !version.name?.startsWith(versionRoot)
      || !/^[a-f0-9]{16}$/.test(version.name.slice(versionRoot.length))) {
      throw new Error(`Firebase Hosting ${channel} version is not a valid finalized production version.`);
    }
    return version;
  };
  const live = versionFor('live');
  const rollback = versionFor(ROLLBACK_CHANNEL);
  if (live.name === rollback.name) throw new Error('Hosting revision binding cannot modify the rollback version.');
  const expectedTag = `fh-${live.name.slice(versionRoot.length)}`;
  if (!Array.isArray(rollback.config?.rewrites)
    || rollback.config.rewrites.some(rewrite => rewrite.run?.tag === expectedTag)) {
    throw new Error('Hosting revision binding cannot modify a tag used by the rollback version.');
  }
  const rewrites = live.config?.rewrites;
  if (!Array.isArray(rewrites) || rewrites.length !== 1 || rewrites[0].glob !== '**'
    || rewrites[0].run?.serviceId !== PRODUCTION_SSR_SERVICE
    || rewrites[0].run.region !== PRODUCTION_REGION
    || (rewrites[0].run.tag !== undefined && rewrites[0].run.tag !== expectedTag)) {
    throw new Error('Hosting revision binding requires the new production version\'s own SSR tag.');
  }
  // The bounded ALREADY_EXISTS fallback deliberately uses the default service
  // route. It needs the same exact-revision check but no tag mutation.
  const tag = rewrites[0].run.tag === undefined ? null : expectedTag;
  const readTraffic = () => {
    const lookup = gcloud([
      'run', 'services', 'describe', PRODUCTION_SSR_SERVICE,
      '--region', PRODUCTION_REGION, '--project', PRODUCTION_FIREBASE_PROJECT, '--format=json(status.traffic)',
    ]);
    assertSucceeded(lookup, 'Cloud Run Hosting tag lookup');
    let traffic;
    try { traffic = JSON.parse(lookup.stdout).status.traffic; } catch {
      throw new Error('Cloud Run Hosting tag lookup returned invalid JSON.');
    }
    const routes = Array.isArray(traffic) ? traffic.filter(entry => Number(entry.percent) > 0) : [];
    if (!routes.length || routes.some(entry => entry.revisionName !== revision || !Number.isInteger(entry.percent))
      || routes.reduce((sum, entry) => sum + entry.percent, 0) !== 100) {
      throw new Error('Hosting revision binding requires 100% traffic to the exact deployed revision.');
    }
    const tags = new Map();
    for (const entry of traffic) {
      if (!entry.tag) continue;
      if (tags.has(entry.tag)) throw new Error('Cloud Run Hosting tags are ambiguous.');
      tags.set(entry.tag, entry.revisionName);
    }
    if (tag && !tags.has(tag)) throw new Error('The new Hosting version\'s SSR tag is absent.');
    return tags;
  };
  const before = readTraffic();
  if (tag && before.get(tag) !== revision) {
    assertSucceeded(gcloud([
      'run', 'services', 'update-traffic', PRODUCTION_SSR_SERVICE,
      `--update-tags=${tag}=${revision}`,
      '--region', PRODUCTION_REGION, '--project', PRODUCTION_FIREBASE_PROJECT, '--quiet',
    ]), 'Cloud Run exact Hosting revision binding');
    const after = readTraffic();
    if (after.size !== before.size || after.get(tag) !== revision
      || [...before].some(([name, target]) => name !== tag && after.get(name) !== target)) {
      throw new Error('Cloud Run Hosting revision binding did not preserve the other revision tags.');
    }
  }
  console.log(`Hosting version ${live.name.slice(versionRoot.length)} is bound to ${revision}.`);
  return { hostingVersion: live.name, hostingTag: tag, revision };
}

function isExpectedHostingConflict(result) {
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  return result.status !== 0
    && /409/i.test(output)
    && /ALREADY_EXISTS/i.test(output)
    && /hosting|hosting\s+version|sites\//i.test(output);
}

function assertSucceeded(result, label) {
  if (result.status === 0) return;
  const launchDetail = result.error?.code ? ` (${result.error.code})` : '';
  throw new Error(`${label} failed with exit status ${result.status ?? 'unknown'}${launchDetail}.`);
}

// Neither of these is used at runtime: `next dev` fills .next/dev, `next build`
// leaves .next/cache. Firebase's framework adapter copies .next wholesale into
// the function bundle, and nothing in firebase.json excludes them — hosting.ignore
// only governs hosting, and there is no functions key or .gcloudignore.
//
// One local dev-server run was enough to push .next to 7.4 GB (5.9 GB of it
// .next/dev), the packaged upload to 4.67 GB, and the Cloud Run function update
// to `Task index 0 failed: timed out after 1500000ms` — 25 minutes, then a failed
// deploy. The parts actually needed are .next/server, .next/standalone and
// .next/static, together about 180 MB.
//
// Pruning is safe: both directories are pure caches, are gitignored, and are
// regenerated by the build that runs immediately after this.
const DISPOSABLE_BUILD_CACHES = ['.next/dev', '.next/cache'];

function pruneBuildCaches(fileSystem = fs) {
  const pruned = [];
  for (const target of DISPOSABLE_BUILD_CACHES) {
    if (!fileSystem.existsSync(target)) continue;
    fileSystem.rmSync(target, { recursive: true, force: true });
    pruned.push(target);
  }
  if (pruned.length) console.log(`Pruned build caches before deploy: ${pruned.join(', ')}.`);
  return pruned;
}

function deployFirebase(dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const run = dependencies.runFirebase || runFirebase;
  const runPreflight = dependencies.runPreflight || runProductionPreflight;
  const prune = dependencies.pruneBuildCaches || (() => pruneBuildCaches(fileSystem));
  const hostingArtifactExists = dependencies.hostingArtifactExists || (() => {
    return fileSystem.existsSync('.firebase/talent-consulting-acf16/hosting');
  });

  console.log('Starting Firebase production deployment...');
  runPreflight();
  // Before the adapter's `next build`, not after — it copies whatever .next holds.
  prune();

  const originalContent = fileSystem.readFileSync(firebaseJsonPath, 'utf8');
  const originalEnvContent = fileSystem.readFileSync(firebaseEnvPath, 'utf8');
  const localEnvContent = fileSystem.readFileSync(localEnvPath, 'utf8');
  const original = JSON.parse(originalContent);

  try {
    fileSystem.writeFileSync(
      firebaseEnvPath,
      buildFirebaseRuntimeEnv(originalEnvContent, localEnvContent),
    );
    fileSystem.writeFileSync(firebaseJsonPath, `${JSON.stringify(buildFrameworksConfig(original), null, 2)}\n`);
    const initial = run([
      'deploy',
      '--only',
      'hosting,firestore',
      '--project',
      PRODUCTION_FIREBASE_PROJECT,
      '--non-interactive',
    ]);
    if (initial.status === 0) {
      console.log('Firebase production deployment completed.');
      return;
    }
    if (!isExpectedHostingConflict(initial)) {
      assertSucceeded(initial, 'Firebase deployment');
    }

    if (!hostingArtifactExists()) {
      throw new Error('Firebase Hosting fallback stopped because no freshly built hosting artifact exists.');
    }

    console.log('Firebase Hosting returned the known 409 conflict. Running the bounded hosting finalization fallback...');
    fileSystem.writeFileSync(firebaseJsonPath, `${JSON.stringify(buildStaticFallbackConfig(original), null, 2)}\n`);
    assertSucceeded(run([
      'deploy',
      '--only',
      'hosting',
      '--project',
      PRODUCTION_FIREBASE_PROJECT,
      '--non-interactive',
    ]), 'Firebase Hosting fallback');
    console.log('Firebase production deployment completed through the hosting fallback.');
  } finally {
    fileSystem.writeFileSync(firebaseJsonPath, originalContent);
    fileSystem.writeFileSync(firebaseEnvPath, originalEnvContent);
  }
}

function primeAdminAggregates() {
  execFileSync(
    process.execPath,
    ['--env-file=.env.local', 'scripts/admin-aggregate-prime.js'],
    { stdio: 'inherit' },
  );
}

function runPostDeploySmoke() {
  execFileSync(process.execPath, ['scripts/resume-production-smoke.js'], { stdio: 'inherit' });
  execFileSync(
    process.execPath,
    ['scripts/admin-public-production-smoke.js'],
    { stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [
      '--env-file=.env.local',
      'scripts/admin-production-smoke.js',
      '--online',
    ],
    { stdio: 'inherit' },
  );
}

function extractSsrBuildId(html) {
  const payloads = [];
  const identities = new Set();
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\);?<\/script>/g)) {
    try {
      const payload = JSON.parse(match[1]);
      if (payload[0] === 1 && typeof payload[1] === 'string') payloads.push(payload[1]);
    } catch { /* Unrelated or incomplete scripts do not establish build identity. */ }
  }
  for (const line of payloads.join('').split('\n')) {
    const row = line.trimStart();
    if (!row.startsWith('0:')) continue;
    try {
      const root = JSON.parse(row.slice(2));
      if (typeof root.b === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(root.b)) identities.add(root.b);
    } catch { /* Fail closed when the server payload is incomplete. */ }
  }
  return identities.size === 1 ? [...identities][0] : null;
}

async function waitForPublishedBuild(options = {}) {
  const expectedBuildId = options.expectedBuildId || fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(expectedBuildId)) throw new Error('Invalid final production build identity.');
  const manifest = options.manifest || fs.readFileSync(`.firebase/${PRODUCTION_FIREBASE_PROJECT}/hosting/_next/static/${expectedBuildId}/_buildManifest.js`);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const expectedHash = hash(manifest);
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  const deadline = now() + (options.timeoutMs ?? 180_000);
  let attempt = 0;
  do {
    attempt++;
    try {
      let actualBuildId = null;
      let serverReady = true;
      for (const route of ['/suite/resume', '/templates']) {
        const response = await fetchImpl(`https://talentconsulting.io${route}?release_build=${expectedBuildId}&attempt=${attempt}`, {
          headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        });
        actualBuildId = response.status === 200 ? extractSsrBuildId(await response.text()) : null;
        if (actualBuildId !== expectedBuildId) { serverReady = false; break; }
      }
      if (serverReady) {
        const asset = await fetchImpl(`https://talentconsulting.io/_next/static/${expectedBuildId}/_buildManifest.js`, {
          cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(20_000),
        });
        if (asset.status === 200 && hash(Buffer.from(await asset.arrayBuffer())) === expectedHash) {
          console.log(`Published SSR and Hosting assets verified for build ${expectedBuildId}.`);
          return { buildId: expectedBuildId, attempts: attempt };
        }
      }
      if (attempt === 1 || attempt % 10 === 0) console.log(`Waiting for Hosting to serve build ${expectedBuildId}; observed ${actualBuildId || 'an incomplete response'}.`);
    } catch {
      if (attempt === 1 || attempt % 10 === 0) console.log(`Waiting for Hosting publication of build ${expectedBuildId}.`);
    }
    if (now() >= deadline) break;
    await sleep(Math.min(options.intervalMs ?? 3_000, deadline - now()));
  } while (now() < deadline);
  throw new Error(`Hosting did not publish the final SSR/assets build ${expectedBuildId} before the release deadline.`);
}

async function main() {
  runProductionPreflight();
  const rollback = captureProductionRollbackPoint();
  try {
    deployFirebase({ runPreflight: () => {} });
    const revision = promoteDeployedRevision();
    pinPublishedHostingRevision(revision);
    await waitForPublishedBuild();
    primeAdminAggregates();
    runPostDeploySmoke();
  } catch (error) {
    try {
      restoreProductionRollbackPoint(rollback);
    } catch (rollbackError) {
      throw new Error(
        `Production release failed and rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        { cause: error },
      );
    }
    throw error;
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildFrameworksConfig,
  buildFirebaseRuntimeEnv,
  buildStaticFallbackConfig,
  captureProductionRollbackPoint,
  deployFirebase,
  DISPOSABLE_BUILD_CACHES,
  isExpectedHostingConflict,
  primeAdminAggregates,
  pruneBuildCaches,
  PRODUCTION_FIREBASE_PROJECT,
  restoreProductionRollbackPoint,
  promoteDeployedRevision,
  pinPublishedHostingRevision,
  runFirebase,
  runGcloud,
  runPostDeploySmoke,
  runProductionPreflight,
  extractSsrBuildId,
  waitForPublishedBuild,
};
