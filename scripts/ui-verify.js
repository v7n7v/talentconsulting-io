#!/usr/bin/env node
/**
 * Drives a real Chromium at every required breakpoint, in both themes, and reports
 * the things that only exist once a page is rendered.
 *
 * This repo's own rule is that a UI change is not complete without a browser run,
 * and "declared complete without a browser run" is a named anti-pattern. The problem
 * has been that running one is manual, so it gets skipped under pressure. This makes
 * it a command.
 *
 * It checks the failures this codebase has actually shipped before:
 *   - horizontal overflow (and names the offending elements, not just the fact)
 *   - console errors
 *   - touch targets under 44px
 *   - inputs under 16px, which makes iOS Safari zoom on focus
 *   - text clipped by intrinsic min-content width
 *
 *   node scripts/ui-verify.js /suite/resume
 *   node scripts/ui-verify.js /suite/resume /suite/job-search
 *   node scripts/ui-verify.js /suite/resume --base=http://localhost:3000
 *   node scripts/ui-verify.js /suite/resume --widths=320,390 --theme=dark
 *   node scripts/ui-verify.js /suite/resume --out=.ui-verify --json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WIDTHS = [320, 390, 430, 768, 1024, 1440];
const THEMES = ['dark', 'light'];
const HEIGHT = 900;

/**
 * Endpoints that answer 401 for any non-admin user on every authenticated route.
 *
 * These are shell-level probes, not page behaviour: verified identical on
 * /suite/cover-letter, a route untouched by whatever change is being verified. Before
 * this allowlist existed the run failed on every suite route for reasons no change
 * could fix, which is how a mandatory gate becomes a gate nobody runs.
 *
 * They are REPORTED on every run, never hidden. Anything not on this list - any other
 * failing request, and every JS exception - still fails.
 *
 * Do not add to this list to make a run go green. The entry has to be a request that
 * fails identically on a page the change did not touch.
 */
const KNOWN_AUTH_PROBES = ['/api/admin/session', '/api/observability/consent'];
const isKnownAuthProbe = (pathname) => KNOWN_AUTH_PROBES.includes(pathname);

// ---------------------------------------------------------------- in-page probes
//
// Everything below runs inside the browser. Kept as a single function so it can be
// passed to page.evaluate without a build step.

function probe() {
  const out = { overflow: null, offenders: [], targetBounds: [], inputBounds: [], smallTargets: [], smallInputs: [], clipped: [], truncated: [] };
  const doc = document.documentElement;
  // Inert/hidden ancestry means the element cannot currently be interacted with.
  // aria-hidden and offscreen coordinates alone are not visibility exemptions.
  function measurable(el) {
    for (let node = el; node && node instanceof Element; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (node.hidden || node.hasAttribute('inert') || cs.display === 'none'
        || cs.visibility === 'hidden' || cs.visibility === 'collapse'
        || Number(cs.opacity) === 0 || cs.contentVisibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  out.scrollWidths = { document: doc.scrollWidth, body: document.body.scrollWidth, viewport: window.innerWidth };


  const docW = doc.scrollWidth;
  const winW = window.innerWidth;
  if (Math.max(docW, document.body.scrollWidth) > winW + 1) {
    out.overflow = { documentWidth: docW, bodyWidth: document.body.scrollWidth, viewportWidth: winW, by: Math.max(docW, document.body.scrollWidth) - winW };
    // Name the elements actually sticking out - "there is overflow" is not actionable.
    for (const el of Array.from(document.querySelectorAll('body *')).slice(0, 4000)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > winW + 1 || r.left < -1) {
        const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 80);
        out.offenders.push({
          tag: el.tagName.toLowerCase(),
          cls,
          right: Math.round(r.right),
          overflowBy: Math.round(r.right - winW),
          text: (el.textContent || '').trim().slice(0, 40),
        });
        if (out.offenders.length >= 12) break;
      }
    }
  }

  // Touch targets. The mobile standard here is 44px.
  const clickable = document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], select');
  for (const el of clickable) {
    const r = el.getBoundingClientRect();
    if (!measurable(el)) continue;
    if (out.targetBounds.length < 150) out.targetBounds.push({tag:el.tagName.toLowerCase(),name:el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0,60),x:r.x,y:r.y,width:r.width,height:r.height});
    if (r.width < 44 || r.height < 44) {
      const cls = (typeof el.className === 'string' ? el.className : '').slice(0, 60);
      out.smallTargets.push({
        tag: el.tagName.toLowerCase(), cls,
        w: Math.round(r.width), h: Math.round(r.height),
        text: (el.textContent || '').trim().slice(0, 30),
      });
      if (out.smallTargets.length >= 15) break;
    }
  }

  // Inputs below 16px make iOS Safari zoom the page on focus, which then strands
  // the user at a scrolled-in viewport. It is a real usability bug, not a nitpick.
  for (const el of document.querySelectorAll('input, textarea, select')) {
    const r = el.getBoundingClientRect();
    if (!measurable(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (out.inputBounds.length < 80) out.inputBounds.push({tag:el.tagName.toLowerCase(),name:el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder"),fontSize:size,x:r.x,y:r.y,width:r.width,height:r.height});
    if (size && size < 16) {
      out.smallInputs.push({ tag: el.tagName.toLowerCase(), fontSize: size,
        name: el.getAttribute('name') || el.getAttribute('placeholder') || '' });
      if (out.smallInputs.length >= 10) break;
    }
  }

  // Text cut off by its container. Two distinct cases, and conflating them makes
  // the report noisy enough to ignore:
  //   clipped   - overflow hidden with NO ellipsis. The text just vanishes. A bug.
  //   truncated - a deliberate ellipsis. Usually fine, but worth surfacing at narrow
  //               widths, where this repo has hidden the very label that mattered
  //               ("Seniority sign...").
  out.truncated = [];
  for (const el of Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,div,td,li')).slice(0, 3000)) {
    if (!measurable(el)) continue;
    if (el.children.length) continue;                        // leaf text nodes only
    const t = (el.textContent || '').trim();
    if (t.length < 4) continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
    // Visually-hidden text is SUPPOSED to overflow a 1px box - that is how the
    // sr-only pattern works. Counting it as clipped fires on every live region and
    // every skip link in the app, which is noise that teaches people to ignore the
    // report. Real clipping happens in boxes with real width.
    if (el.clientWidth <= 1 || el.clientHeight <= 1) continue;
    const entry = { tag: el.tagName.toLowerCase(), text: t.slice(0, 40),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    if (cs.textOverflow === 'ellipsis') {
      if (out.truncated.length < 10) out.truncated.push(entry);
    } else {
      if (out.clipped.length < 10) out.clipped.push(entry);
    }
  }

  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
  const has = (f) => argv.includes(f);
  const routes = argv.filter((a) => !a.startsWith('--'));

  if (has('--fixtures')) {
    return require('./ui-verify-fixtures.cjs').runFixtureMatrix({ argv, probe, WIDTHS, THEMES, HEIGHT });
  }
  if (!routes.length) {
    console.error('  Usage: node scripts/ui-verify.js <route> [route...] [--base=http://localhost:3000]');
    process.exit(1);
  }

  const base = opt('base', 'http://localhost:3000').replace(/\/$/, '');
  const widths = opt('widths', '').split(',').filter(Boolean).map(Number);
  const themes = opt('theme', '').split(',').filter(Boolean);
  const outDir = path.resolve(process.cwd(), opt('out', '.ui-verify'));
  const W = widths.length ? widths : WIDTHS;
  const T = themes.length ? themes : THEMES;

  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    console.error('\n  Playwright is not installed.\n');
    console.error('    npm i -D playwright && npx playwright install chromium\n');
    console.error('  If a browser is already provisioned, set PLAYWRIGHT_BROWSERS_PATH.\n');
    process.exit(1);
  }

  // Fail clearly if the dev server is not up, rather than reporting 12 blank pages.
  try {
    const res = await fetch(base, { method: 'HEAD' }).catch(() => null);
    if (!res) throw new Error('no response');
  } catch {
    console.error(`\n  Nothing is serving ${base}. Start the dev server first:\n\n    npm run dev\n`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const findings = [];
  let checks = 0;

  console.log(`\n  UI verification - ${routes.length} route(s), ${W.length} widths, ${T.length} themes\n`);

  for (const route of routes) {
    for (const theme of T) {
      for (const width of W) {
        const ctx = await browser.newContext({
          viewport: { width, height: HEIGHT },
          deviceScaleFactor: 1,
          colorScheme: theme === 'dark' ? 'dark' : 'light',
        });
        const page = await ctx.newPage();
        const consoleErrors = [];
        const failedRequests = [];
        const allowlistedProbes = [];
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
        page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200)));
        // A console line reading "Failed to load resource: ... 401" names no URL, which
        // makes it unactionable. Record the response so the report can say which endpoint.
        page.on('response', (res) => {
          if (res.status() < 400) return;
          const u = new URL(res.url()).pathname;
          (isKnownAuthProbe(u) ? allowlistedProbes : failedRequests).push(`${res.status()} ${u}`);
        });

        const url = base + route;
        let loadError = null;
        try {
          // NOT networkidle. This app polls and, in dev, runs HMR - the network never goes
          // quiet for 500ms, so networkidle always burned the full timeout and reported a
          // load failure on pages that had rendered fine. Verified on an untouched route.
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          await page.waitForLoadState('domcontentloaded');
          // Theme is attribute-driven in this app; set it explicitly rather than
          // trusting colorScheme alone, then let styles settle.
          await page.evaluate((t) => {
            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.classList.toggle('dark', t === 'dark');
          }, theme);
          await page.waitForTimeout(400);
        } catch (e) { loadError = String(e.message).slice(0, 160); }

        let r = { overflow: null, offenders: [], smallTargets: [], smallInputs: [], clipped: [], truncated: [] };
        if (!loadError) { try { r = await page.evaluate(probe); } catch (e) { loadError = String(e.message).slice(0, 160); } }

        const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
        const shot = path.join(outDir, `${slug}__${theme}__${width}.png`);
        try { await page.screenshot({ path: shot, fullPage: true }); } catch { /* keep going */ }

        const problems = [];
        if (loadError) problems.push({ kind: 'load', detail: loadError });
        if (r.overflow) problems.push({ kind: 'overflow', detail: `${r.overflow.by}px wider than viewport`, offenders: r.offenders });
        // "Failed to load resource: ... 401" carries no URL, so it is dropped here and
        // the same failure is reported from the response listener WITH its endpoint.
        // Strictly more information, not less.
        const jsErrors = consoleErrors.filter((line) => !/^Failed to load resource/.test(line));
        if (jsErrors.length) problems.push({ kind: 'console', detail: `${jsErrors.length} JS error(s)`, items: jsErrors.slice(0, 5) });
        if (failedRequests.length) problems.push({ kind: 'request', detail: `${failedRequests.length} failed request(s)`, items: [...new Set(failedRequests)].slice(0, 5) });
        if (r.clipped.length) problems.push({ kind: 'clipped', detail: `${r.clipped.length} clipped text node(s)`, items: r.clipped.slice(0, 5) });
        // The actual mobile shell breakpoint is 1024px, including tablets at 768px.
        if (width < 1024 && r.smallTargets.length) problems.push({ kind: 'touch-target', detail: `${r.smallTargets.length} under 44px`, items: r.smallTargets.slice(0, 5) });
        if (width < 1024 && r.smallInputs.length) problems.push({ kind: 'input-size', detail: `${r.smallInputs.length} under 16px (iOS zooms on focus)`, items: r.smallInputs.slice(0, 5) });

        // Deliberate ellipsis is reported for a human to judge, but never fails the
        // run - a tool that cries wolf about intentional truncation gets muted.
        const notes = [];
        if (width < 1024 && (r.truncated || []).length) notes.push({ kind: 'truncated', detail: `${r.truncated.length} ellipsis truncation(s) - check none hides something load-bearing`, items: r.truncated.slice(0, 5) });
        // Surfaced every run so the allowlist stays visible rather than becoming folklore.
        if (allowlistedProbes.length) notes.push({ kind: 'auth-probe', detail: `${allowlistedProbes.length} allowlisted shell auth probe(s)`, items: [...new Set(allowlistedProbes)] });

        checks++;
        const label = `${route} ${theme} ${width}px`.padEnd(46);
        const suffix = problems.length ? `${problems.length} issue(s)`
                     : notes.length   ? `clean (${notes.length} note)` : 'clean';
        console.log(`  ${label} ${suffix}`);
        if (problems.length || notes.length) findings.push({ route, theme, width, screenshot: shot, problems, notes });

        await ctx.close();
      }
    }
  }

  await browser.close();

  if (has('--json')) {
    const jsonPath = path.join(outDir, 'result.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ ok: !findings.some(f => f.problems.length), checks, findings }, null, 2));
    console.log(`\n  ${jsonPath}`);
  }

  const failing = findings.filter((f) => f.problems.length);
  if (findings.length) {
    console.log(`\n  ${findings.length} of ${checks} checks had something to report:\n`);
    for (const f of findings) {
      console.log(`  ${f.route}  ${f.theme}  ${f.width}px`);
      for (const p of [...f.problems, ...(f.notes || [])]) {
        console.log(`    ${p.kind}: ${p.detail}`);
        for (const o of (p.offenders || []).slice(0, 4)) {
          console.log(`      <${o.tag}> +${o.overflowBy}px  "${o.text}"  ${o.cls}`);
        }
        for (const i of (p.items || []).slice(0, 4)) {
          console.log(`      ${typeof i === 'string' ? i : JSON.stringify(i)}`);
        }
      }
      console.log(`    ${f.screenshot}`);
    }
    console.log('');
    if (failing.length) process.exit(1);
    console.log(`  No failures - ${findings.length} note(s) only. Look at the screenshots.\n`);
    return;
  }

  console.log(`\n  All ${checks} checks clean. Screenshots in ${outDir}`);
  console.log('  Machine checks only - open the screenshots and look at them before calling it done.\n');
}

module.exports = { probe, WIDTHS, THEMES, HEIGHT, KNOWN_AUTH_PROBES, isKnownAuthProbe };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
