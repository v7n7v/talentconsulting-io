'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, scrubEnvironment, GROUPS, validateReportPath, runChild } = require('./agentic-baseline');

test('runner accepts only explicit fixed groups and rejects command or file passthrough', () => {
  assert.equal(parseArgs(['--group=unit']).group, 'unit');
  assert.equal(parseArgs(['--group=analysis']).group, 'analysis');
  assert.equal(parseArgs(['--group=exports']).group, 'exports');
  assert.equal(parseArgs(['--group=journey']).group, 'journey');
  assert.equal(parseArgs(['--group=all']).group, 'all');
  assert.throws(() => parseArgs([]), /explicit --group/);
  assert.throws(() => parseArgs(['--group=unit', 'scripts/arbitrary.test.js']), /Unknown/);
  assert.throws(() => parseArgs(['--group=provider-canary']), /Unknown group/);
  assert.ok(Object.values(GROUPS).flat().every((file) => file.startsWith('scripts/') && file.endsWith('.test.js')));
});

test('child environment removes credentials and application configuration', () => {
  const clean = scrubEnvironment({
    PATH: '/usr/bin',
    TMPDIR: '/tmp',
    OPENAI_API_KEY: 'secret',
    STRIPE_SECRET_KEY: 'secret',
    GOOGLE_APPLICATION_CREDENTIALS: '/private/key.json',
    FIRESTORE_EMULATOR_HOST: 'example.invalid:8080',
    NODE_OPTIONS: '--require=/tmp/inject.js',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'public-but-unneeded',
  });
  assert.deepEqual(clean, {
    PATH: '/usr/bin', TMPDIR: '/tmp', NODE_ENV: 'test', CI: '1', NO_COLOR: '1',
    NODE_OPTIONS: `--require="${path.resolve(__dirname, 'agentic-test-isolation.cjs')}"`,
  });
});

test('report path checks reject ancestor and dangling symlinks before creating outside directories', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-report-fixture-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const repoRoot = path.join(fixture, 'clone');
  const outside = path.join(fixture, 'outside');
  fs.mkdirSync(repoRoot);
  fs.mkdirSync(outside);

  const reportRoot = path.join(repoRoot, 'test-results', 'agentic-p0');
  const linkedParent = path.join(repoRoot, 'test-results');
  fs.symlinkSync(outside, linkedParent, 'dir');
  assert.throws(() => validateReportPath('report.json', {
    repoRoot,
    reportRoot: path.join(linkedParent, 'agentic-p0'),
  }), /symbolic link/);
  assert.equal(fs.existsSync(path.join(outside, 'agentic-p0')), false);

  fs.unlinkSync(linkedParent);
  assert.throws(() => validateReportPath('../../outside/escaped.json', { repoRoot, reportRoot }), /inside|stay inside/);
  assert.equal(fs.existsSync(path.join(outside, 'escaped.json')), false);
  fs.mkdirSync(reportRoot, { recursive: true });
  fs.symlinkSync(path.join(outside, 'not-created.json'), path.join(reportRoot, 'dangling.json'));
  assert.throws(() => validateReportPath('dangling.json', { repoRoot, reportRoot }), /symbolic link/);

  const missingParent = path.join(outside, 'not-created-directory');
  fs.symlinkSync(missingParent, path.join(reportRoot, 'dangling-parent'));
  assert.throws(() => validateReportPath('dangling-parent/report.json', { repoRoot, reportRoot }), /symbolic link/);
  assert.equal(fs.existsSync(missingParent), false);
});

test('timeout kills a POSIX child group even after its leader exits and descendants retain pipes', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows fallback cannot terminate an arbitrary descendant process group');
    return;
  }
  const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'inherit', 'inherit'] });
    process.stdout.write('descendant=' + child.pid + '\\n');
    setTimeout(() => process.exit(0), 80);
  `;
  const started = Date.now();
  const result = await runChild(process.execPath, ['-e', script], { timeoutMs: 500 });
  assert.equal(result.timedOut, true);
  assert.equal(result.code, 124);
  assert.match(result.stdout, /descendant=\d+/);
  assert.ok(Date.now() - started < 7_000, 'runner must bound descendant pipe draining');
});

test('timeout still escalates to SIGKILL after leader close when descendant ignores TERM and has no pipes', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('this regression inspects Linux process state after group escalation');
    return;
  }
  const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
    process.stdout.write(String(child.pid) + '\\n');
    setInterval(() => {}, 1000);
  `;
  const started = Date.now();
  const result = await runChild(process.execPath, ['-e', script], { timeoutMs: 400 });
  assert.equal(result.timedOut, true);
  assert.equal(result.killEscalated, true);
  assert.ok(Date.now() - started >= 1_800, 'leader close must not cancel the SIGKILL grace timer');
  const descendantPid = Number(result.stdout.trim());
  assert.ok(descendantPid > 0);
  let processState = null;
  // kill(2) queues a signal; allow the kernel to reap the target before checking
  // its final state. A live process after this bounded wait still fails.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const status = fs.readFileSync(`/proc/${descendantPid}/stat`, 'utf8');
      processState = status.slice(status.lastIndexOf(')') + 2).split(' ')[0];
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
      processState = null;
    }
    if (processState === null || processState === 'Z') break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(processState === null || processState === 'Z', `descendant should be dead, state was ${processState}`);
});

test('preload denies fetch, ESM net/http/tls imports, DNS, and direct TCP in a child process', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { connect } from 'node:net';
    import { connect as tlsConnect } from 'node:tls';
    import { request } from 'node:http';
    import dns from 'node:dns';
    const denied = (fn) => assert.throws(fn, { code: 'AGENTIC_NETWORK_DENIED' });
    denied(() => connect(9, '127.0.0.1'));
    denied(() => tlsConnect({ host: '127.0.0.1', port: 9 }));
    denied(() => request('http://127.0.0.1:9'));
    denied(() => dns.lookup('localhost'));
    await assert.rejects(fetch('http://127.0.0.1:9'), { code: 'AGENTIC_NETWORK_DENIED' });
    process.stdout.write('network guard denied all probes\\n');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: scrubEnvironment({ PATH: process.env.PATH }),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /network guard denied all probes/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('guarded ESM named imports are synchronized by the preload', () => {
  const source = `import { connect } from 'node:net'; try { connect(9, '127.0.0.1'); process.exitCode = 1; } catch (e) { process.exitCode = e.code === 'AGENTIC_NETWORK_DENIED' ? 0 : 2; }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: path.resolve(__dirname, '..'), env: scrubEnvironment({ PATH: process.env.PATH }), encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('OS sandbox wrapper has fixed subcommands and rejects command passthrough', () => {
  const sandbox = path.resolve(__dirname, 'agentic-sandbox.py');
  const result = spawnSync('python3', [sandbox, 'rules', 'node -e "process.exit(0)"'], {
    cwd: path.resolve(__dirname, '..'),
    env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unrecognized arguments/);
});
