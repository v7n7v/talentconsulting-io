const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

function runFixture(extraEnv = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-cloudrun-context-'));
  const root = path.join(fixture, 'source');
  const temporary = path.join(fixture, 'temporary');
  fs.mkdirSync(root); fs.mkdirSync(temporary);
  try {
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    const log = path.join(root, 'commands.jsonl');
    const publicKeys = ['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID',
      'FIREBASE_STORAGE_BUCKET', 'FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_APP_ID',
      'GOOGLE_AUTH_ENABLED', 'MFA_ENABLED', 'ADMIN_COMMAND_GRID_V2', 'STRIPE_PUBLISHABLE_KEY'];
    fs.writeFileSync(path.join(root, '.env.production'), publicKeys.map(key =>
      `NEXT_PUBLIC_${key}=synthetic_public_value`).join('\n') + '\n');
    const mock = `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const command = path.basename(process.argv[1]); const args = process.argv.slice(2);
const record = { command, args };
if (command === 'node' && args[0] === 'scripts/docker-build-context.js') {
  if (args[1] === 'prepare') {
    if (process.env.TACO_MOCK_FAIL_PREPARE === '1') {
      fs.appendFileSync(process.env.TACO_MOCK_LOG, JSON.stringify(record) + '\\n'); process.exit(6);
    }
    const context = args[args.indexOf('--output') + 1];
    const source = args[args.indexOf('--source') + 1];
    const relative = path.relative(source, context);
    if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new Error('Mock contract: context must be outside the source');
    }
    fs.writeFileSync(path.join(context, '.docker-build-context-manifest.json'), '{}');
  }
  if (args[1] === 'verify' && process.env.TACO_MOCK_FAIL_VERIFY === '1') {
    fs.appendFileSync(process.env.TACO_MOCK_LOG, JSON.stringify(record) + '\\n'); process.exit(7);
  }
}
if (command === 'gcloud' && args[0] === 'builds') {
  record.context = args[args.length - 1];
  record.contextExists = fs.existsSync(record.context);
  record.prepared = fs.existsSync(path.join(record.context, '.docker-build-context-manifest.json'));
  if (process.env.TACO_MOCK_FAIL_BUILD === '1') {
    fs.appendFileSync(process.env.TACO_MOCK_LOG, JSON.stringify(record) + '\\n'); process.exit(9);
  }
}
fs.appendFileSync(process.env.TACO_MOCK_LOG, JSON.stringify(record) + '\\n');
`;
    for (const name of ['node', 'gcloud']) fs.writeFileSync(path.join(bin, name), mock, { mode: 0o755 });
    const result = spawnSync('bash', [path.resolve(__dirname, '..', 'deploy-cloudrun.sh')], {
      cwd: root, encoding: 'utf8', timeout: 20000,
      env: { ...process.env, ...extraEnv, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        TMPDIR: temporary, TACO_MOCK_LOG: log },
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const contexts = calls.filter(call => call.command === 'node' && call.args[1] === 'prepare')
      .map(call => call.args[call.args.indexOf('--output') + 1]);
    return { result, calls, contexts, contextSurvived: contexts.some(context => fs.existsSync(context)), source: root };
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
}

test('Cloud Run wrapper submits only a prepared and verified external context', () => {
  const { result, calls, source, contextSurvived } = runFixture();
  assert.equal(result.status, 0, result.stderr);
  const prepare = calls.findIndex(call => call.command === 'node' && call.args[1] === 'prepare');
  const verify = calls.findIndex(call => call.command === 'node' && call.args[1] === 'verify');
  const build = calls.findIndex(call => call.command === 'gcloud' && call.args[0] === 'builds');
  assert.ok(prepare >= 0 && verify > prepare && build > verify);
  assert.equal(calls[build].prepared, true);
  assert.equal(calls[build].contextExists, true);
  assert.notEqual(calls[build].context, source);
  assert.notEqual(calls[build].context, '.');
  const relative = path.relative(source, calls[build].context);
  assert.ok(relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative));
  assert.equal(calls.filter(call => call.command === 'gcloud' && call.args[0] === 'run').length, 1);
  assert.equal(contextSurvived, false);
});
test('context preparation failure prevents verification and mocked cloud operations', () => {
  const { result, calls, contextSurvived } = runFixture({ TACO_MOCK_FAIL_PREPARE: '1' });
  assert.equal(result.status, 6);
  assert.equal(calls.some(call => call.command === 'node' && call.args[1] === 'verify'), false);
  assert.equal(calls.some(call => call.command === 'gcloud'), false);
  assert.equal(contextSurvived, false);
});
test('context verification failure prevents all mocked cloud operations and cleans up', () => {
  const { result, calls, contextSurvived } = runFixture({ TACO_MOCK_FAIL_VERIFY: '1' });
  assert.equal(result.status, 7);
  assert.equal(calls.some(call => call.command === 'gcloud'), false);
  assert.equal(contextSurvived, false);
});
test('mocked build failure prevents promotion and cleans up the context', () => {
  const { result, calls, contextSurvived } = runFixture({ TACO_MOCK_FAIL_BUILD: '1' });
  assert.equal(result.status, 9);
  assert.equal(calls.some(call => call.command === 'gcloud' && call.args[0] === 'run'), false);
  assert.equal(contextSurvived, false);
});
