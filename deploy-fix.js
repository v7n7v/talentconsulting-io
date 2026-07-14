const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

const firebaseJsonPath = './firebase.json';

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
  const result = spawnSync('npx', ['firebase', ...args], { encoding: 'utf8' });
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
  const original = JSON.parse(originalContent);

  try {
    fileSystem.writeFileSync(firebaseJsonPath, `${JSON.stringify(buildFrameworksConfig(original), null, 2)}\n`);
    const initial = run(['deploy']);
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
  buildFrameworksConfig,
  buildStaticFallbackConfig,
  deployFirebase,
  isExpectedHostingConflict,
};
