#!/usr/bin/env node
/**
 * Design system drift audit for Talent Studio.
 *
 * Measures how far the implementation has drifted from a single design system,
 * and — with --ci — fails the build when any metric gets worse than the recorded
 * baseline. It is a ratchet, not a cliff: you are never asked to fix everything
 * at once, only to avoid adding more.
 *
 * Pure Node, no dependencies, no shell calls — so it behaves identically on
 * Windows, macOS and Linux, and inside CI.
 *
 *   node scripts/design-audit.js              # human-readable report
 *   node scripts/design-audit.js --json       # machine-readable
 *   node scripts/design-audit.js --update     # write/refresh the baseline
 *   node scripts/design-audit.js --ci         # exit 1 if any metric regressed
 *   node scripts/design-audit.js --verbose    # include worst-offender file lists
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- config

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', 'out',
  '_backup', '_to_delete', 'test-results', '.playwright-cli',
  'email-previews', '.firebase', 'coverage',
]);

/**
 * Resume templates are deliberately excluded. They are documents rendered for
 * employers, not product UI — they intentionally use their own fonts and
 * palettes, and that separation has been verified clean. Auditing them against
 * product tokens would produce noise that trains people to ignore this tool.
 */
const EXCLUDE_PATHS = [
  'components/resume-templates',
  'lib/resume-templates',
];

/**
 * Files that DEFINE the tokens. Hex literals here are not hardcoded colors -
 * they are the definitions every other file is supposed to point at, so
 * counting them as violations means the metric goes up whenever someone does
 * the right thing and edits a token instead of inlining a value. Same
 * reasoning as EXCLUDE_PATHS above: noise here trains people to ignore the
 * tool. These files are still audited for prohibited classes, radii, inline
 * patterns and undefined tokens - only the hex metrics skip them.
 */
const TOKEN_DEF_FILES = [
  'app/globals.css',
];

/**
 * Tokens that ARE defined, just not in any file this script reads.
 *
 * next/font/google emits its CSS custom properties at build time from the
 * `variable` option in app/layout.tsx - there is no stylesheet declaring
 * --font-inter, so a text scan will always call it undefined. Listing them
 * here is not an exemption; it is the scanner being told where the definition
 * actually lives. Anything added to this list needs that same sentence.
 */
const EXTERNAL_TOKENS = new Set([
  '--font-inter', '--font-brand', '--font-mono', '--font-poppins',
]);

const BASELINE_FILE = '.design-audit-baseline.json';

/* --------------------------------------------------------------------------
 * Accent contrast across every surface the token system defines.
 *
 * docs/design-system-v2-plan.md 3.1 found the real defect: one accent step
 * per mode only works if the surfaces stay inside the luminance band that
 * step can reach. Contrast had been validated against ONE surface per mode,
 * so hover and active - exactly where accent-coloured interactive text lives
 * - were failing AA unnoticed.
 *
 * Nobody re-derives that by hand when they nudge a hover colour, so it is a
 * metric. It reads the token file directly; the number is how many
 * (theme x surface) pairs put accent text below 4.5:1, and it must be 0.
 * ------------------------------------------------------------------------ */
const ACCENT_SURFACES = [
  '--bg-deep', '--bg-surface', '--bg-elevated', '--bg-input', '--bg-hover',
  '--card-bg', '--theme-surface-hover', '--theme-surface-active', '--sidebar-bg',
];

function relLuminance(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function accentContrastFailures(root) {
  const fails = [];
  for (const file of TOKEN_DEF_FILES) {
    let css;
    try { css = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
    for (const theme of ['dark', 'light']) {
      const i = css.indexOf(`[data-theme="${theme}"]`);
      if (i < 0) continue;
      const end = css.indexOf('}', css.indexOf('color-scheme', i));
      const block = css.slice(i, end < 0 ? undefined : end);
      const tok = {};
      for (const m of block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) tok[m[1]] = m[2];
      if (!tok['--accent']) continue;
      for (const su of ACCENT_SURFACES) {
        if (!tok[su]) continue;
        const r = contrast(tok['--accent'], tok[su]);
        if (r < 4.5) fails.push(`${theme} ${su} ${tok[su]} = ${r.toFixed(2)}:1`);
      }
    }
  }
  return fails;
}


/**
 * Classes the design system prohibits. Each carries the reason, because a
 * violation report that only says "don't" teaches nothing and gets argued with.
 *
 * A rule may carry `allowIn: [path, ...]`. That is a NARROW, per-rule, per-path
 * exception - not a way to switch a rule off. Today the only entry is the
 * marketing landing surface, which is a brand surface rather than product UI:
 * gradients and one backdrop-filter are the language there and banned
 * everywhere else. Everything else on that path - text-white, bg-white/N,
 * shadows, the purple family - still applies to it.
 *
 * The alternative was running `--update` to absorb the landing page's
 * gradients into the baseline, which would have raised the accepted floor
 * for the WHOLE codebase and unlocked glass in the admin console and the
 * suite, where nobody would have noticed until it had spread.
 */
const PROHIBITED = [
  { key: 'text-white',    re: /\btext-white\b/g,                     why: 'breaks theming; use var(--text-primary)' },
  { key: 'bg-white/',     re: /\bbg-white\/\d+/g,                    why: 'translucent overlay; use a surface token' },
  { key: 'bg-black',      re: /\bbg-black\b/g,                       why: 'raw black ignores the theme; use var(--bg-deep)' },
  { key: 'backdrop-blur', re: /\bbackdrop-blur(?:-\w+)?\b/g,         why: 'glass is banned by the design system' },
  { key: 'bg-gradient',   re: /\bbg-gradient-to-\w+\b/g,             why: 'decorative gradient; surfaces are flat' },
  { key: 'shadow-',       re: /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/g,why: 'elevation is expressed with borders, not shadows' },
  { key: 'purple-family', re: /\b(?:bg|text|border|from|to|via)-(?:purple|violet|indigo|fuchsia)-\d{2,3}\b/g,
                          why: 'purple is not an accent in this system' },

  // The same bans, expressed in CSS. Without these the gate only stops the Tailwind
  // spelling, and "make it look premium" reliably reaches for the CSS one instead.
  { key: 'css-gradient',  re: /(?:linear|radial|conic)-gradient\s*\(/g,
                          why: 'decorative gradient in CSS; surfaces are flat',
                          allowIn: ['components/landing'] },
  { key: 'css-shadow',    re: /box-shadow\s*:\s*(?!none)[^;}]+/g,
                          why: 'elevation is expressed with borders, not shadows' },
  { key: 'css-backdrop',  re: /backdrop-filter\s*:\s*(?!none)[^;}]+/g,
                          allowIn: ['components/landing'],
                          why: 'glass is banned by the design system' },
];

const METRICS = [
  ['distinctHex',        'Distinct hardcoded hex colors',        'lower'],
  ['hexOccurrences',     'Total hex occurrences',                'lower'],
  ['prohibitedTotal',    'Prohibited class occurrences',          'lower'],
  ['distinctRadii',      'Distinct radius values',               'lower'],
  ['inlineButtons',      'Inline button patterns',               'lower'],
  ['inlineCards',        'Inline card patterns',                 'lower'],
  ['routesOffShell',     'Suite routes not using SuiteToolShell','lower'],
  ['tokenDefFiles',      'Files defining CSS custom properties', 'lower'],
  ['undefinedTokens',    'Tokens referenced but never defined',  'lower'],
  ['accentContrastFails','Accent below 4.5:1 on a surface',      'lower'],
];

// ---------------------------------------------------------------- helpers

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }

  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (EXCLUDE_PATHS.some((p) => rel === p || rel.startsWith(p + '/'))) continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(e.name))) {
      if (EXCLUDE_PATHS.some((p) => rel.startsWith(p + '/'))) continue;
      out.push({ full, rel });
    }
  }
  return out;
}

const countMatches = (s, re) => (s.match(re) || []).length;
const bump = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);

function topN(map, n = 10) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ---------------------------------------------------------------- audit

function audit() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

  const hexCounts = new Map();      // '#rrggbb' -> occurrences
  const hexByFile = new Map();      // file -> distinct hex count
  const prohibitedCounts = new Map();
  const prohibitedByFile = new Map();
  const radii = new Set();
  const tokenDefs = new Set();
  const tokenUses = new Set();
  const tokenDefFiles = new Set();

  let hexOccurrences = 0;
  let inlineButtons = 0;
  let inlineCards = 0;
  let sharedButtons = 0;
  let sharedCards = 0;

  for (const { full, rel } of files) {
    let src;
    try { src = fs.readFileSync(full, 'utf8'); } catch { continue; }

    // Strip comments first. A comment that says "never use text-white" should not
    // count as a use of text-white - false positives train people to ignore the gate.
    // Line comments are only stripped when the // starts the line (after whitespace),
    // so URLs like https://... inside strings survive.
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // --- hex colors. Normalise #abc -> #aabbcc and lowercase, so the same
    //     color written three ways counts once.
    const seenHere = new Set();
    const isTokenDef = TOKEN_DEF_FILES.includes(rel.split(path.sep).join('/'));
    for (const m of (isTokenDef ? [] : src.matchAll(/#([0-9a-fA-F]{3,8})\b/g))) {
      let h = m[1].toLowerCase();
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      if (h.length !== 6 && h.length !== 8) continue;   // ignore 4/5/7-digit noise
      const hex = '#' + h.slice(0, 6);
      bump(hexCounts, hex);
      hexOccurrences++;
      seenHere.add(hex);
    }
    if (seenHere.size) hexByFile.set(rel, seenHere.size);

    // --- prohibited classes
    let fileProhibited = 0;
    const relPosix = rel.split(path.sep).join('/');
    for (const p of PROHIBITED) {
      if (p.allowIn && p.allowIn.some((a) => relPosix === a || relPosix.startsWith(a + '/'))) continue;
      const n = countMatches(src, p.re);
      if (n) { bump(prohibitedCounts, p.key, n); fileProhibited += n; }
    }
    if (fileProhibited) prohibitedByFile.set(rel, fileProhibited);

    // --- radius values, both Tailwind and raw CSS
    for (const m of src.matchAll(/\brounded-\[(\d+)px\]/g)) radii.add(m[1] + 'px');
    for (const m of src.matchAll(/\brounded-(xs|sm|md|lg|xl|2xl|3xl)\b/g)) radii.add('tw-' + m[1]);
    for (const m of src.matchAll(/border-radius:\s*(\d+)px/g)) radii.add(m[1] + 'px');

    // --- CSS custom properties: definitions vs uses
    let definesHere = false;
    for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) { tokenDefs.add(m[1]); definesHere = true; }
    for (const m of src.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) tokenUses.add(m[1]);
    if (definesHere) tokenDefFiles.add(rel);

    // --- component duplication
    sharedButtons += countMatches(src, /\bbtn-(?:primary|secondary|ghost)\b/g);
    sharedCards   += countMatches(src, /\b(?:glass-card|surface-card)\b/g);
    // An inline button: padding + rounding on something clickable.
    inlineButtons += countMatches(src, /className="[^"]*\bpx-\d[^"]*\bpy-\d[^"]*\brounded[^"]*"/g);
    // An inline card: rounding + border on a container.
    inlineCards   += countMatches(src, /className="[^"]*\brounded-(?:lg|xl|2xl|3xl|\[\d+px\])[^"]*\bborder\b[^"]*"/g);
  }

  // --- suite routes on the shell
  // A legacy path that only forwards into a consolidated tool renders no UI of
  // its own, so the shell question does not apply to it. Counting those as
  // off-shell reports a violation no edit to the route could ever clear.
  const isRedirectOnly = (src) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    return /from\s+['"]next\/navigation['"]/.test(code)
      && /\bredirect\s*\(/.test(code)
      && !/<[A-Za-z]/.test(code);
  };
  const suiteDir = path.join(ROOT, 'app', 'suite');
  const suitePages = walk(suiteDir).filter((f) => /[\\/]page\.tsx$/.test(f.full));
  const offShell = [];
  for (const { full, rel } of suitePages) {
    let src = '';
    try { src = fs.readFileSync(full, 'utf8'); } catch { /* ignore */ }
    if (isRedirectOnly(src)) continue;
    if (!/SuiteToolShell|SuiteToolHeader/.test(src)) offShell.push(rel);
  }

  const undefinedTokens = [...tokenUses]
    .filter((t) => !tokenDefs.has(t) && !EXTERNAL_TOKENS.has(t))
    .sort();
  const accentFails = accentContrastFailures(ROOT);
  const prohibitedTotal = [...prohibitedCounts.values()].reduce((a, b) => a + b, 0);

  return {
    filesScanned: files.length,
    metrics: {
      distinctHex: hexCounts.size,
      hexOccurrences,
      prohibitedTotal,
      distinctRadii: radii.size,
      inlineButtons,
      inlineCards,
      routesOffShell: offShell.length,
      tokenDefFiles: tokenDefFiles.size,
      undefinedTokens: undefinedTokens.length,
      accentContrastFails: accentFails.length,
    },
    detail: {
      sharedButtons,
      sharedCards,
      suitePages: suitePages.length,
      offShell,
      undefinedTokenNames: undefinedTokens,
      accentFailures: accentFails,
      topHex: topN(hexCounts, 15),
      worstHexFiles: topN(hexByFile, 10),
      prohibitedBreakdown: topN(prohibitedCounts, 20),
      worstProhibitedFiles: topN(prohibitedByFile, 10),
      radii: [...radii].sort(),
    },
  };
}

// ---------------------------------------------------------------- reporting

const pad = (s, n) => String(s).padEnd(n);
const num = (n) => String(n).padStart(6);

function report(result, baseline, verbose) {
  const m = result.metrics;
  const b = baseline && baseline.metrics;

  console.log('\n  Design system audit');
  console.log('  ' + '-'.repeat(64));
  console.log(`  ${result.filesScanned} files scanned in ${SCAN_DIRS.join(', ')}\n`);

  let regressions = 0;
  for (const [key, label] of METRICS) {
    const cur = m[key];
    let delta = '';
    if (b && typeof b[key] === 'number') {
      const d = cur - b[key];
      if (d > 0) { delta = `  WORSE +${d}`; regressions++; }
      else if (d < 0) delta = `  better ${d}`;
      else delta = '  =';
    }
    console.log(`  ${pad(label, 40)}${num(cur)}${delta}`);
  }

  console.log('');
  console.log(`  ${pad('Shared button usages (btn-*)', 40)}${num(result.detail.sharedButtons)}`);
  console.log(`  ${pad('Shared card usages', 40)}${num(result.detail.sharedCards)}`);
  console.log(`  ${pad('Suite routes total', 40)}${num(result.detail.suitePages)}`);

  if (verbose) {
    const d = result.detail;
    if (d.prohibitedBreakdown.length) {
      console.log('\n  Prohibited classes:');
      for (const [k, n] of d.prohibitedBreakdown) {
        const why = (PROHIBITED.find((p) => p.key === k) || {}).why || '';
        console.log(`    ${pad(k, 16)}${num(n)}   ${why}`);
      }
    }
    if (d.worstProhibitedFiles.length) {
      console.log('\n  Worst files (prohibited classes):');
      for (const [f, n] of d.worstProhibitedFiles) console.log(`    ${num(n)}  ${f}`);
    }
    if (d.worstHexFiles.length) {
      console.log('\n  Worst files (distinct hex):');
      for (const [f, n] of d.worstHexFiles) console.log(`    ${num(n)}  ${f}`);
    }
    if (d.offShell.length) {
      console.log('\n  Suite routes not on SuiteToolShell:');
      for (const f of d.offShell) console.log(`      ${f}`);
    }
    if (d.undefinedTokenNames.length) {
      console.log('\n  Tokens referenced but never defined:');
      console.log('      ' + d.undefinedTokenNames.join(', '));
    }
  }

  return regressions;
}

// ---------------------------------------------------------------- main

function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);

  const result = audit();
  const baselinePath = path.join(ROOT, BASELINE_FILE);
  let baseline = null;
  if (fs.existsSync(baselinePath)) {
    try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch { /* ignore */ }
  }

  if (flag('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const regressions = report(result, baseline, flag('--verbose'));
    if (flag('--ci')) {
      if (!baseline) {
        console.log('\n  No baseline found. Run with --update to record one.\n');
        process.exit(1);
      }
      if (regressions) {
        console.log(`\n  FAIL - ${regressions} metric(s) regressed against ${BASELINE_FILE}.`);
        console.log('  Fix the regression, or run --update if the increase is deliberate.\n');
        process.exit(1);
      }
      console.log('\n  PASS - no metric regressed.\n');
    } else {
      console.log('');
    }
  }

  if (flag('--update')) {
    const payload = { updated: new Date().toISOString(), metrics: result.metrics };
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`  Baseline written to ${BASELINE_FILE}\n`);
  }
}

if (require.main === module) main();
module.exports = { audit };
