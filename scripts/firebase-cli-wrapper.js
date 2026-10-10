const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_FIREBASE_VERSION = '15.24.0';
const PINNED_SHARP_VERSION = '0.35.5';
const ADAPTER_SHARP_RANGE = '^0.32 || ^0.33';

function findFirebaseBin(pathValue = process.env.PATH || '') {
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue;
    for (const name of process.platform === 'win32' ? ['firebase.cmd', 'firebase'] : ['firebase']) {
      const candidate = path.join(directory, name);
      try {
        if (fs.statSync(candidate).isFile() || fs.statSync(candidate).isSymbolicLink()) return fs.realpathSync(candidate);
      } catch {
        // Continue searching the npx-provided PATH.
      }
    }
  }
  return null;
}

function loadExpectedFirebaseCli(pathValue = process.env.PATH) {
  const binPath = findFirebaseBin(pathValue);
  if (!binPath || !binPath.endsWith(`${path.sep}firebase-tools${path.sep}lib${path.sep}bin${path.sep}firebase.js`)) {
    throw new Error(`Firebase CLI ${EXPECTED_FIREBASE_VERSION} was not found on the npx PATH.`);
  }
  const packageRoot = path.resolve(path.dirname(binPath), '..', '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (packageJson.version !== EXPECTED_FIREBASE_VERSION) {
    throw new Error(`Unexpected Firebase CLI version ${packageJson.version || 'unknown'}; expected ${EXPECTED_FIREBASE_VERSION}.`);
  }
  return { binPath, packageRoot };
}

function patchSharpVersion(packageRoot) {
  const constantsPath = path.join(packageRoot, 'lib', 'frameworks', 'constants.js');
  const constants = require(constantsPath);
  if (constants.SHARP_VERSION !== ADAPTER_SHARP_RANGE) {
    throw new Error(`Unexpected Firebase adapter sharp range ${constants.SHARP_VERSION || 'missing'}.`);
  }
  // The adapter mutates the generated function package's dependency manifest;
  // patch its in-memory constant only, preserving the repository's sharp pin.
  constants.SHARP_VERSION = PINNED_SHARP_VERSION;
}

function runFirebaseCli() {
  const { binPath, packageRoot } = loadExpectedFirebaseCli();
  patchSharpVersion(packageRoot);
  require(binPath);
}

if (require.main === module) {
  try {
    runFirebaseCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  ADAPTER_SHARP_RANGE,
  EXPECTED_FIREBASE_VERSION,
  PINNED_SHARP_VERSION,
  findFirebaseBin,
  loadExpectedFirebaseCli,
  patchSharpVersion,
  runFirebaseCli,
};
