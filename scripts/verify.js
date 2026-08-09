#!/usr/bin/env node
/**
 * One command that runs every gate, in cost order, and stops at the first failure.
 *
 * Why this exists: the gates were seven separate npm scripts. An agent (or a human
 * on a Friday) has to remember all seven and run them in a sensible order. They
 * won't. This makes "did I break anything?" a single question with a single answer.
 *
 * Gates run cheapest-first so a typo fails in seconds rather than after a 3-minute
 * build. On failure it prints the command you need to reproduce it, and exits 1.
 *
 *   node scripts/verify.js                 # everything, stop at first failure
 *   node scripts/verify.js --fast          # skip build and the slow suites
 *   node scripts/verify.js --all           # keep going after a failure, report at end
 *   node scripts/verify.js --only=design   # run one gate by name
 *   node scripts/verify.js --list          # show the gates and exit
 *   node scripts/verify.js --json          # machine-readable result
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- gates
//
// tier:
//   'mechanical' - fully machine-checkable; an agent may iterate on these freely
//   'observable' - needs a rendered page; see scripts/ui-verify.js
//
// Order is deliberate: fastest and most-likely-to-fail first.

const GATES = [
  { name: 'design',   tier: 'mechanical', fast: true,
    cmd: 'node', args: ['scripts/design-audit.js', '--ci'],
    desc: 'design system drift has not regressed',
    fix: 'Fix the regressed metric, or `node scripts/design-audit.js --update` if the increase is deliberate and explained in the commit.' },

  { name: 'types',    tier: 'mechanical', fast: true,
    cmd: 'npm', args: ['run', 'type-check'],
    desc: 'TypeScript compiles',
    fix: 'Read the first error only - later ones are usually cascades from it.' },

  { name: 'release-safety', tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:release-safety'],
    desc: 'billing, Stripe and deploy-safety suites (expect 244/244)',
    fix: 'These guard live payments. Never skip or weaken one to get green.' },

  { name: 'assistant', tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:assistant-harness'],
    desc: 'Taco harness and resume truth locks (expect 329/329)',
    fix: 'A failure here often means a guardrail was bypassed, not that the test is stale.' },

  { name: 'admin',    tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:admin-command-grid'],
    desc: 'admin RBAC and aggregates (expect 24/24)' },

  { name: 'email',    tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:email-system'],
    desc: 'email catalog, outbox and unsubscribe (expect 59/59)' },

  { name: 'observability', tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:observability'],
    desc: 'observability foundation and privacy contract (expect 31/31)' },

  { name: 'voice',    tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'test:voice'],
    desc: 'SuperTonic TTS client, persona/agent voice mapping and speak-route billing invariants',
    fix: 'A failure here means the voice code regressed - including the "usage only after successful synthesis" billing invariant. Do not weaken the guard to get green.' },

  { name: 'cve',      tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'security:cve:ci'],
    desc: 'no high or critical CVEs' },

  { name: 'build',    tier: 'mechanical', fast: false,
    cmd: 'npm', args: ['run', 'build'],
    desc: 'production build succeeds (expect 180-181 static pages)',
    fix: 'Build-time crashes here are usually a client initialised at module scope - see the lazy-init commits.' },
];

// ---------------------------------------------------------------- helpers

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', bold: '', off: '' };

const secs = (ms) => (ms / 1000).toFixed(1) + 's';

function run(gate) {
  const started = Date.now();
  const res = spawnSync(gate.cmd, gate.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',   // npm.cmd on Windows needs a shell
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    code: res.status,
    ms: Date.now() - started,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    spawnError: res.error ? String(res.error.message) : null,
  };
}

/** Pull the lines most likely to say what actually broke. */
function excerpt(out, limit = 25) {
  const lines = out.split('\n');
  const interesting = lines.filter((l) =>
    /error|fail|✗|✖|not ok|cannot|missing|expected|regress|WORSE/i.test(l));
  const chosen = interesting.length ? interesting : lines.filter((l) => l.trim());
  return chosen.slice(0, limit);
}

// ---------------------------------------------------------------- main

function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const only = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];

  if (has('--list')) {
    console.log('\n  Gates, in run order:\n');
    for (const g of GATES) {
      console.log(`    ${g.name.padEnd(16)} ${g.fast ? 'fast' : 'slow'}  ${g.desc}`);
    }
    console.log('\n  Not covered here - these need a rendered page:');
    console.log('    ui-verify        node scripts/ui-verify.js  (6 widths x 2 themes)\n');
    return;
  }

  if (!fs.existsSync(path.join(process.cwd(), 'package.json'))) {
    console.error('  Run this from the repository root.');
    process.exit(1);
  }

  let gates = GATES;
  if (only) gates = gates.filter((g) => g.name === only);
  else if (has('--fast')) gates = gates.filter((g) => g.fast);

  if (!gates.length) {
    console.error(`  No gate matched "${only}". Try --list.`);
    process.exit(1);
  }

  const keepGoing = has('--all');
  const results = [];
  const started = Date.now();

  if (!has('--json')) {
    console.log(`\n  ${C.bold}Verifying${C.off} ${C.dim}(${gates.length} gates${keepGoing ? ', continuing past failures' : ', stopping at first failure'})${C.off}\n`);
  }

  for (const gate of gates) {
    // Only draw the in-progress line on a real terminal; in CI logs a \r does not
    // erase, and you end up with "design ... design pass" on one line.
    const interactive = process.stdout.isTTY && !has('--json');
    if (interactive) process.stdout.write(`  ${gate.name.padEnd(16)} ${C.dim}running...${C.off}`);

    const r = run(gate);
    results.push({ name: gate.name, tier: gate.tier, ok: r.ok, ms: r.ms, code: r.code });

    if (!has('--json')) {
      if (interactive) process.stdout.write('\r' + ' '.repeat(40) + '\r');
      const mark = r.ok ? `${C.green}pass${C.off}` : `${C.red}FAIL${C.off}`;
      console.log(`  ${gate.name.padEnd(16)} ${mark}  ${C.dim}${secs(r.ms)}${C.off}`);
    }

    if (!r.ok) {
      if (!has('--json')) {
        console.log(`\n  ${C.red}${C.bold}${gate.name} failed${C.off} - ${gate.desc}`);
        console.log(`  ${C.dim}reproduce:${C.off} ${gate.cmd} ${gate.args.join(' ')}\n`);
        if (r.spawnError) console.log(`  could not start: ${r.spawnError}\n`);
        for (const l of excerpt(r.stdout + '\n' + r.stderr)) console.log(`    ${l}`);
        if (gate.fix) console.log(`\n  ${C.yellow}${gate.fix}${C.off}`);
        console.log('');
      }
      if (!keepGoing) {
        if (has('--json')) console.log(JSON.stringify({ ok: false, failed: gate.name, results }, null, 2));
        process.exit(1);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const total = Date.now() - started;

  if (has('--json')) {
    console.log(JSON.stringify({ ok: !failed.length, failed: failed.map((f) => f.name), results }, null, 2));
  } else if (failed.length) {
    console.log(`  ${C.red}${failed.length} gate(s) failed${C.off}: ${failed.map((f) => f.name).join(', ')}  ${C.dim}${secs(total)}${C.off}\n`);
  } else {
    console.log(`\n  ${C.green}All ${results.length} gates passed${C.off}  ${C.dim}${secs(total)}${C.off}`);
    console.log(`  ${C.dim}Mechanical gates only. A UI change also needs: node scripts/ui-verify.js${C.off}\n`);
  }

  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { GATES };
