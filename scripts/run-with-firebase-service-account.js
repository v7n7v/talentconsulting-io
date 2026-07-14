const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const EXPECTED_PROJECT = 'talent-consulting-acf16';

function readServiceAccount(envPath = '.env.local') {
  const source = fs.readFileSync(envPath, 'utf8');
  const line = source.split(/\r?\n/).find(item => item.startsWith('FIREBASE_SERVICE_ACCOUNT_JSON='));
  if (!line) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing from .env.local.');
  let value = line.slice(line.indexOf('=') + 1).trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  const account = JSON.parse(value);
  if (
    account?.type !== 'service_account'
    || account?.project_id !== EXPECTED_PROJECT
    || typeof account?.private_key !== 'string'
    || typeof account?.client_email !== 'string'
  ) {
    throw new Error(`The local service account is not valid for ${EXPECTED_PROJECT}.`);
  }
  return account;
}

function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error('A command is required.');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'talent-firebase-'));
  const credentialPath = path.join(temporaryDirectory, 'service-account.json');
  try {
    fs.writeFileSync(credentialPath, JSON.stringify(readServiceAccount()), { mode: 0o600, flag: 'wx' });
    if (process.platform !== 'win32') fs.chmodSync(credentialPath, 0o600);
    const result = spawnSync(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credentialPath },
      stdio: 'inherit',
      shell: false,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
