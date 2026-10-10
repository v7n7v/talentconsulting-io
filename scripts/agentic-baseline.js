#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORT_ROOT = path.join(ROOT, 'test-results', 'agentic-p0');
const PRELOAD = path.join(__dirname, 'agentic-test-isolation.cjs');
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_TIMEOUT_MS = 600_000;
const KILL_GRACE_MS = 2_000;
const OUTPUT_DRAIN_GRACE_MS = 2_000;

// Fixed, reviewed local test-file allowlist. Never accept a command, npm
// script, or test path from the caller. Provider canaries and audits are absent.
const GROUPS = Object.freeze({
  unit: [
    'scripts/resume-morph-guardrails.test.js',
    'scripts/resume-export-truth.test.js',
    'scripts/resume-morph-consent.test.js',
  ],
  analysis: [
    'scripts/oracle-provider-contract.test.js',
    'scripts/oracle-regression.test.js',
  ],
  authority: [
    'scripts/sona-activation-proof.test.js',
    'scripts/sona-activation-receipt.test.js',
    'scripts/sona-workload-policy.test.js',
  ],
  packet: [
    'scripts/job-packet-recovery.test.js',
    'scripts/cover-letter-guardrails.test.js',
    'scripts/resume-export-truth.test.js',
    'scripts/packet-generation-route.test.js',
    'scripts/packet-review-route.test.js',
  ],
  exports: [
    'scripts/resume-signature-pdf.test.js',
    'scripts/resume-signature-docx.test.js',
    'scripts/application-linked-resume-export.test.js',
  ],
  dashboard: [
    'scripts/dashboard-action-inbox.test.js',
    'scripts/application-debrief-route.test.js',
    'scripts/application-outcome-route.test.js',
  ],
  journey: [
    'scripts/agentic-journey.test.js',
  ],
});

const CREDENTIAL_NAME = /(?:^|_)(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AUTH|API_KEY)(?:$|_)/i;
const CREDENTIAL_PREFIX = /^(?:FIREBASE|GCLOUD|GOOGLE_APPLICATION|GOOGLE_CLOUD|AWS_|AZURE_|GITHUB_|OPENAI_|OPENROUTER_|GROQ_|GEMINI_|DEEPGRAM_|STRIPE_|RESEND_|UPSTASH_|DATABASE_URL|FIRESTORE_|FIREBASE_AUTH_)/i;
const SAFE_SYSTEM_ENV = new Set(['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT']);

function scrubEnvironment(source = process.env) {
  const clean = {};
  for (const name of SAFE_SYSTEM_ENV) {
    if (source[name] !== undefined) clean[name] = source[name];
  }
  // Avoid leaking keys that happen to use nonstandard names even if a future
  // allowlist change accidentally admits one.
  for (const name of Object.keys(clean)) {
    if (CREDENTIAL_NAME.test(name) || CREDENTIAL_PREFIX.test(name)) delete clean[name];
  }
  clean.NODE_ENV = 'test';
  clean.CI = '1';
  clean.NO_COLOR = '1';
  clean.NODE_OPTIONS = `--require="${PRELOAD}"`;
  return clean;
}

function parseArgs(argv) {
  const options = { group: null, list: false, help: false, timeoutMs: DEFAULT_TIMEOUT_MS, jsonFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') options.list = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--group' && argv[i + 1]) options.group = argv[++i];
    else if (arg.startsWith('--group=')) options.group = arg.slice('--group='.length);
    else if (arg === '--timeout-ms' && argv[i + 1]) options.timeoutMs = Number(argv[++i]);
    else if (arg.startsWith('--timeout-ms=')) options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--json' && argv[i + 1]) options.jsonFile = argv[++i];
    else if (arg.startsWith('--json=')) options.jsonFile = arg.slice('--json='.length);
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be between 1000 and ${MAX_TIMEOUT_MS}`);
  }
  if (options.group && options.group !== 'all' && !Object.hasOwn(GROUPS, options.group)) {
    throw new Error(`Unknown group "${options.group}". Choose ${Object.keys(GROUPS).join(', ')}, or all.`);
  }
  if (!options.list && !options.help && !options.group) throw new Error(`Select an explicit --group (${Object.keys(GROUPS).join(', ')}, or all).`);
  if (options.list && options.group) throw new Error('--list cannot be combined with --group.');
  if (options.jsonFile !== null && !options.jsonFile) throw new Error('--json requires a report filename.');
  return options;
}

function isWithin(parent, child) {
  return child === parent || child.startsWith(parent + path.sep);
}

function mkdirChecked(directory, boundary) {
  const relative = path.relative(boundary, directory);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('JSON report path resolves outside the allowed report root.');
  }
  let current = boundary;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (stat.isSymbolicLink()) throw new Error('JSON report path cannot traverse a symbolic link.');
    if (!stat.isDirectory()) throw new Error('JSON report parent path contains a non-directory.');
    const real = fs.realpathSync(current);
    if (!isWithin(boundary, real)) throw new Error('JSON report path resolves outside the allowed report root.');
  }
}

function validateReportPath(filename, { reportRoot = REPORT_ROOT, repoRoot = ROOT } = {}) {
  const repo = fs.realpathSync(path.resolve(repoRoot));
  const report = path.resolve(reportRoot);
  if (!isWithin(repo, report) || report === repo) {
    throw new Error('Configured report root must be a subdirectory of the clone.');
  }
  // Check ancestors before creating anything: mkdirSync({recursive:true}) would
  // follow a symlink in an ancestor and could create directories outside repo.
  mkdirChecked(report, repo);
  const root = fs.realpathSync(report);
  const target = path.resolve(root, filename);
  if (target === root || !isWithin(root, target)) {
    throw new Error('JSON report path must stay inside the allowed report root.');
  }
  mkdirChecked(path.dirname(target), root);
  const resolvedTarget = path.join(path.dirname(target), path.basename(target));
  try {
    if (fs.lstatSync(resolvedTarget).isSymbolicLink()) {
      throw new Error('JSON report target cannot be a symbolic link.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return resolvedTarget;
}

function signalChild(child, signal) {
  if (process.platform === 'win32') {
    // Windows fallback: Node does not expose process-group termination here.
    // The runner kills the direct child and force-closes pipes after a bound.
    try { child.kill(signal); } catch (_) { /* already exited */ }
    return;
  }
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function runChild(command, args, { cwd = ROOT, env = scrubEnvironment(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let killEscalated = false;
    let pendingClose = null;
    const maxOutput = 4 * 1024 * 1024;
    const collect = (current, chunk) => (current + chunk.toString('utf8')).slice(-maxOutput);
    child.stdout.on('data', (chunk) => { stdout = collect(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = collect(stderr, chunk); });
    let killTimer;
    let drainTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(drainTimer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signalChild(child, 'SIGTERM');
      killTimer = setTimeout(() => {
        // Do this even if the group leader has already closed: its descendants
        // can keep running without inheriting stdout/stderr.
        signalChild(child, 'SIGKILL');
        killEscalated = true;
        if (pendingClose) {
          pendingClose.killEscalated = true;
          finish(pendingClose);
        }
      }, KILL_GRACE_MS);
      // If a descendant escaped the process group but retained a pipe, do not
      // wait forever for Node's `close` event after the bounded kill attempt.
      drainTimer = setTimeout(() => {
        signalChild(child, 'SIGKILL');
        killEscalated = true;
        child.stdout.destroy();
        child.stderr.destroy();
        finish({ ok: false, code: 124, childCode: null, signal: null, timedOut: true, killEscalated, ms: Date.now() - started, stdout, stderr });
      }, KILL_GRACE_MS + OUTPUT_DRAIN_GRACE_MS);
    }, timeoutMs);

    child.on('error', (error) => {
      finish({ ok: false, code: 127, childCode: null, signal: null, timedOut, killEscalated, ms: Date.now() - started, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on('close', (code, signal) => {
      const result = { ok: code === 0 && signal === null && !timedOut, code: timedOut ? 124 : code, childCode: code, signal, timedOut, killEscalated, ms: Date.now() - started, stdout, stderr };
      if (timedOut && !killEscalated) {
        pendingClose = result;
        return;
      }
      finish(result);
    });
  });
}

async function runGroup(name, files, timeoutMs) {
  const startedAt = new Date().toISOString();
  for (const file of files) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      return { group: name, files, ok: false, code: 2, signal: null, timedOut: false, ms: 0, startedAt, stdout: '', stderr: `Allowlisted test file is missing: ${file}` };
    }
  }
  const result = await runChild(process.execPath, ['--test', ...files], { timeoutMs });
  return { group: name, files, startedAt, ...result };
}

function usage() {
  return [
    `Usage: node scripts/agentic-baseline.js --group=<${[...Object.keys(GROUPS), 'all'].join('|')}> [options]`,
    '       node scripts/agentic-baseline.js --list',
    '',
    'Options:',
    `  --timeout-ms N     Per-group timeout (1000-${MAX_TIMEOUT_MS}; default ${DEFAULT_TIMEOUT_MS})`,
    `  --json FILE        Save full results under ${path.relative(ROOT, REPORT_ROOT)}/`,
    '',
    'The runner uses fixed local node:test files, a scrubbed environment, and a Node-process network guard inherited by Node child processes.',
    'It does not load .env.local and is not an OS-level network sandbox.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`agentic-baseline: ${error.message}\n\n${usage()}`);
    return 2;
  }
  if (options.help) { console.log(usage()); return 0; }
  if (options.list) {
    for (const [name, files] of Object.entries(GROUPS)) console.log(`${name}: ${files.join(', ')}`);
    console.log('all: runs each group separately and aggregates failures');
    return 0;
  }

  const names = options.group === 'all' ? Object.keys(GROUPS) : [options.group];
  const results = [];
  for (const name of names) {
    console.log(`\n[${name}] node --test (${GROUPS[name].length} fixed files)`);
    const result = await runGroup(name, GROUPS[name], options.timeoutMs);
    results.push(result);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    const status = result.ok ? 'PASS' : result.timedOut ? 'TIMEOUT' : result.signal ? `SIGNAL ${result.signal}` : `FAIL ${result.code}`;
    console.log(`[${name}] ${status} (${(result.ms / 1000).toFixed(1)}s)`);
    // Preserve interruption semantics after recording the completed child.
    if (result.signal && !result.timedOut) {
      const report = { generatedAt: new Date().toISOString(), group: options.group, results, ok: false };
      writeReport(options.jsonFile, report);
      process.kill(process.pid, result.signal);
      return 128;
    }
  }
  const failures = results.filter((result) => !result.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    group: options.group,
    isolation: { env: 'allowlisted and scrubbed', envFiles: 'not loaded', network: 'Node-process guard', osSandbox: false },
    ok: failures.length === 0,
    failedGroups: failures.map(({ group }) => group),
    results,
  };
  try {
    writeReport(options.jsonFile, report);
  } catch (error) {
    console.error(`Could not write result artifact: ${error.message}`);
    return failures.length ? 1 : 2;
  }
  console.log(`\nBaseline ${report.ok ? 'passed' : 'failed'}: ${results.length - failures.length}/${results.length} groups`);
  if (!failures.length) return 0;
  if (results.length === 1) return Number.isInteger(results[0].code) ? results[0].code : 1;
  return 1;
}

function writeReport(filename, report) {
  if (filename === null) return;
  const target = validateReportPath(filename);
  let flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC;
  if (fs.constants.O_NOFOLLOW) flags |= fs.constants.O_NOFOLLOW;
  const fd = fs.openSync(target, flags, 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    fs.closeSync(fd);
  }
  console.log(`JSON report: ${path.relative(ROOT, target)}`);
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 2;
  });
}

module.exports = { GROUPS, REPORT_ROOT, parseArgs, scrubEnvironment, validateReportPath, runChild };
