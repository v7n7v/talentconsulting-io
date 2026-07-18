const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const firebaseJsonPath = './firebase.json';
const firebaseRuntimeEnvPath = './.env';
const privateRuntimeEnvPath = './.env.local';

function envKey(line) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  return match?.[1] || null;
}

function isFirebaseReservedEnvKey(key) {
  return /^(?:X_GOOGLE_|FIREBASE_|EXT_)/.test(key);
}

function buildFirebaseRuntimeEnv(baseContent, privateContent) {
  const privateLines = privateContent.replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(line => {
      const key = envKey(line);
      return !key || !isFirebaseReservedEnvKey(key);
    });
  const privateKeys = new Set(privateLines.map(envKey).filter(Boolean));
  const retainedBaseLines = baseContent.replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(line => {
      const key = envKey(line);
      return !key || !privateKeys.has(key);
    });
  return `${retainedBaseLines.join('\n').trimEnd()}\n${privateLines.join('\n').trim()}\n`;
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

function runFirebase(args) {
  const result = process.platform === 'win32'
    ? spawnSync(process.execPath, [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
        '--yes', 'firebase-tools', ...args,
      ], { encoding: 'utf8' })
    : spawnSync('npx', ['--yes', 'firebase-tools', ...args], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
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
  throw new Error(`${label} failed with exit status ${result.status ?? 'unknown'}.`);
}

function deployFirebase(dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const run = dependencies.runFirebase || runFirebase;
  const runPreflight = dependencies.runPreflight || (() => {
    execFileSync(process.execPath, ['scripts/production-deploy-preflight.js', 'firebase'], { stdio: 'inherit' });
  });
  const hostingArtifactExists = dependencies.hostingArtifactExists || (() => {
    return fileSystem.existsSync('.firebase/talent-consulting-acf16/hosting');
  });

  console.log('Starting Firebase production deployment...');
  runPreflight();

  const originalContent = fileSystem.readFileSync(firebaseJsonPath, 'utf8');
  const originalRuntimeEnvContent = fileSystem.readFileSync(firebaseRuntimeEnvPath, 'utf8');
  const privateRuntimeEnvContent = fileSystem.readFileSync(privateRuntimeEnvPath, 'utf8');
  const original = JSON.parse(originalContent);

  try {
    fileSystem.writeFileSync(
      firebaseRuntimeEnvPath,
      buildFirebaseRuntimeEnv(originalRuntimeEnvContent, privateRuntimeEnvContent),
    );
    fileSystem.writeFileSync(firebaseJsonPath, `${JSON.stringify(buildFrameworksConfig(original), null, 2)}\n`);
    // Deploying the Hosting target also deploys its generated SSR backend. Keep
    // Firestore and Storage rules out of this release so an unrelated product
    // setup cannot block or broaden an application deployment.
    const initial = run(['deploy', '--only', 'hosting']);
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
    assertSucceeded(run(['deploy', '--only', 'hosting']), 'Firebase Hosting fallback');
    console.log('Firebase production deployment completed through the hosting fallback.');
  } finally {
    fileSystem.writeFileSync(firebaseRuntimeEnvPath, originalRuntimeEnvContent);
    fileSystem.writeFileSync(firebaseJsonPath, originalContent);
  }
}

function main() {
  deployFirebase();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildFirebaseRuntimeEnv,
  buildFrameworksConfig,
  buildStaticFallbackConfig,
  deployFirebase,
  isExpectedHostingConflict,
};
