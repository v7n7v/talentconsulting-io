'use strict';
// Test-only containment and real component runner. No production fixture routes.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const MARKER = 'UI_VERIFY_TEST_ONLY_COMPONENT_BOUNDARY_V1';
const ROUTES = ['/suite/job-search', '/suite', '/suite/cover-letter'];
const TOKEN = 'fixture-not-a-real-bearer';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sampleJob = (id, title, salary, remoteMode, postedDate, score = null) => ({
  id, identityKey: `sample:${id}`, dedupeKey: `sample:${id}`, title,
  company: 'Sample browser fixture company', location: 'Sample location: New York, United States and a deliberately long regional label',
  locations: ['New York, United States'], remoteMode, salary, postedDate,
  employmentType: 'Full time', url: `https://example.invalid/sample-job/${id}`,
  source: 'Sample direct ATS', skills: [], description: 'Sample job description for browser verification only. No real job, employer, salary, or applicant record.',
  matchScore: score, fitScore: null, acceptanceChance: score, acceptanceReason: 'Sample evidence only; no applicant fit measurement is available.',
  preparationEligible: false, outboundLinkVerified: false,
  sourceMeta: { sourceType: 'direct_ats', sourceName: 'Sample ATS', sourceConfidence: 'low' },
  freshness: { isFresh: false, ghostRisk: 'low', reasons: ['Sample record; unknown source freshness.'] },
  riskNotes: ['Sample data; review source evidence before any action.'],
});
const JOBS = [
  sampleJob('annual', 'Sample annual role with a deliberately long engineering title', { min: 100000, max: 120000, currency: 'USD', interval: 'year' }, 'remote', '2026-10-01T12:00:00Z'),
  sampleJob('hourly', 'Sample foreign hourly role', { min: 35, max: 45, currency: 'GBP', interval: 'hour', isPredicted: true }, 'remote', ''),
  sampleJob('unknown', 'Sample unknown-pay role', { min: null, max: null, currency: 'UNKNOWN', interval: 'unknown' }, 'onsite', ''),
  sampleJob('higher', 'Sample higher annual role', { min: 200000, max: 220000, currency: 'USD', interval: 'year' }, 'onsite', '2026-10-06T12:00:00Z'),
];
const SUGGESTION_JOBS = JOBS.map((job,index)=>({...job,acceptanceChance:[0,75,null,88][index]}));
const EXTRA_JOB = sampleJob('partial', 'Sample additional partial pick', { min: 987654, max: 1234567, currency: 'USD', interval: 'year', isPredicted: true }, 'remote', '');
const FOREIGN_ADVERSARIAL = sampleJob('foreign-high', 'Sample foreign monthly comparison boundary', {min:350000,max:450000,currency:'JPY',interval:'month'},'onsite','');
const RECOVERY = {
  partial: { code: 'suggestions_partial_results', surface: 'suggestions', title: 'Some picks need another check', message: 'Sample partial response. Previous picks stay available.', action: 'retry_suggestions', retryable: true, nextAction: 'Retry suggestions' },
};
function responseScenario(name, endpoint) {
  const rows = endpoint === '/api/jobs/suggestions' ? SUGGESTION_JOBS : JOBS;
  if (name === 'salary-adversarial') return {name,status:200,body:{success:true,jobs:[...JOBS,FOREIGN_ADVERSARIAL],total:5}};
  if (name === 'interrupted') return { name, abort: 'internetdisconnected', intentional: true };
  if (name === 'ordinary-request-failure') return { name, abort: 'connectionfailed', intentional: false };
  if (/^defensive-fit-[0-6]$/.test(name)) {
    assert.equal(endpoint, '/api/jobs/suggestions');
    const values=[0,75,null,undefined,'75',-1,101];
    const index=Number(name.at(-1));return {name,status:200,body:{success:true,jobs:[{...JOBS[0],id:'defensive-'+index,identityKey:'sample:defensive-'+index,title:'Sample defensive fit '+index,acceptanceChance:values[index]}],total:1}};
  }
  if (name === 'setup') return { name, status: 200, body: { success: true, needsSetup: true, jobs: [] } };
  if (name === 'empty') return { name, status: 200, body: { success: true, jobs: [], total: 0 } };
  if (name === 'partial-initial') return { name, status: 200, body: { success: true, partial: true, jobs: rows, recovery: RECOVERY.partial } };
  if (name === 'partial-next') return { name, status: 200, body: { success: true, partial: true, jobs: [EXTRA_JOB], recovery: RECOVERY.partial } };
  assert.equal(name, 'populated', 'Unknown named response scenario');
  return { name, status: 200, body: { success: true, jobs: rows, total: rows.length } };
}
function validateJobsResponse(body, scenarioName) {
  assert.equal(typeof body.success, 'boolean');
  assert.ok(Array.isArray(body.jobs));
  for (const job of body.jobs) {
    for (const key of ['id', 'identityKey', 'title', 'company', 'description', 'location', 'postedDate']) assert.equal(typeof job[key], 'string', `job.${key}`);
    assert.ok(job.company.startsWith('Sample '));
    assert.equal(job.preparationEligible, false);
    assert.equal(job.outboundLinkVerified, false);
    assert.ok(job.matchScore === null || Number.isFinite(job.matchScore));
    if(/^defensive-fit-[0-6]$/.test(scenarioName||'')) assert.ok([undefined,null,'75',-1,0,75,101].includes(job.acceptanceChance), 'Only explicitly named malformed-fit values allowed');
    else assert.ok(job.acceptanceChance === null || Number.isFinite(job.acceptanceChance));
    assert.ok(job.salary && ['min', 'max'].every(k => job.salary[k] === null || Number.isFinite(job.salary[k])));
    assert.ok(['remote', 'onsite', 'hybrid', 'unknown'].includes(job.remoteMode));
  }
}
function validateShellResponse(pathname, body) {
  const keys = {
    '/api/jobs/preferences':['success','isNew','preferences'], '/api/usage':['tier','usage','caps'],
    '/api/admin/session':['error'], '/api/agent/intelligence':['success','twin'],
  };
  assert.deepEqual(Object.keys(body).sort(), [...keys[pathname]].sort(), 'Shell response must satisfy its explicit schema');
  if(pathname==='/api/jobs/preferences') {
    assert.equal(body.success,true);assert.equal(typeof body.isNew,'boolean');
    assert.deepEqual(Object.keys(body.preferences).sort(),['targetRoles','preferredCities','remotePref','jobAlertsEnabled'].sort());
    assert.ok(Array.isArray(body.preferences.targetRoles)&&Array.isArray(body.preferences.preferredCities));
    assert.ok(['any','remote','hybrid','onsite'].includes(body.preferences.remotePref));assert.equal(typeof body.preferences.jobAlertsEnabled,'boolean');
  } else if(pathname==='/api/usage') {
    assert.ok(['free','pro','studio','god'].includes(body.tier));
    for(const amount of [...Object.values(body.usage),...Object.values(body.caps)])assert.ok(Number.isFinite(amount)&&amount>=0);
  } else if(pathname==='/api/admin/session')assert.equal(typeof body.error,'string');
  else {assert.equal(body.success,true);assert.equal(body.twin,null,'Fixture cannot invent Career Twin measurements')}
}
// Exact method/path/query/auth schemas. All writes are denied, including known paths.
function classifyRequest({ url, method, resourceType, headers = {}, postData = null }, origin, assets) {
  const u = new URL(url);
  assert.equal(u.origin, origin, `External request denied: ${u.origin}`);
  assert.ok(method === 'GET' || method === 'HEAD', `Write denied: ${method} ${u.pathname}`);
  assert.ok(postData === null || postData === '', 'GET body denied');
  if (!u.pathname.startsWith('/api/')) {
    assert.ok(assets.has(u.pathname), `Unlisted static/browser resource: ${u.pathname}`);
    assert.ok(!u.search, 'Unlisted static query');
    assert.ok(['document', 'script', 'stylesheet', 'image', 'font', 'other'].includes(resourceType));
    return { kind: 'asset', pathname: u.pathname };
  }
  assert.equal(method, 'GET', 'API HEAD is not allowlisted');
  assert.equal(headers.authorization, `Bearer ${TOKEN}`, 'Fixture API requires the explicit synthetic bearer');
  const table = {
    '/api/jobs/search': ['query', 'location', 'country', 'page', 'sortBy', 'limit', 'salaryMin'],
    '/api/jobs/suggestions': [], '/api/jobs/preferences': [], '/api/usage': [],
    '/api/admin/session': [], '/api/agent/intelligence': [],
  };
  assert.ok(Object.hasOwn(table, u.pathname), `Unexpected API denied: ${u.pathname}`);
  assert.ok([...u.searchParams.keys()].every(key => table[u.pathname].includes(key)), 'Unlisted API query field');
  assert.equal(new Set(u.searchParams.keys()).size, [...u.searchParams.keys()].length, 'Duplicate API query fields');
  if (u.pathname === '/api/jobs/search') {
    assert.ok((u.searchParams.get('query') || '').startsWith('Sample '), 'Only sample searches are allowed');
    assert.ok((u.searchParams.get('query') || '').length <= 160);
    assert.ok((u.searchParams.get('location') || '').length <= 160);
    assert.equal(u.searchParams.get('country'), 'us');
    assert.equal(u.searchParams.get('page'), '1');
    assert.equal(u.searchParams.get('limit'), '24');
    assert.ok(['relevance', 'salary', 'date'].includes(u.searchParams.get('sortBy')));
    if (u.searchParams.has('salaryMin')) assert.match(u.searchParams.get('salaryMin'), /^\d{1,8}$/);
    assert.ok(!headers['x-talent-resume-id'], 'Fixture does not grant a saved resume');
  }
  return { kind: 'api', pathname: u.pathname };
}
function boundaryModules() {
  const sampleUser = { uid: 'sample-ui-fixture-01', displayName: 'Sample browser verification', email: 'sample@example.invalid', emailVerified: true, accessToken: TOKEN };
  const deny = `function deny(name){window.__uiFixture?.violations.push('Unexpected fixture boundary operation: '+name);throw new Error('Unexpected fixture boundary operation: '+name)}`;
  const firebase = `export const sampleUser=${JSON.stringify(sampleUser)};sampleUser.getIdToken=async()=>sampleUser.accessToken;
export const auth={currentUser:sampleUser};export const db=null,storage=null,app=null;${deny}
export const authHelpers={onAuthStateChanged(callback){queueMicrotask(()=>callback(sampleUser));return()=>{}},getUser:async()=>({user:sampleUser}),signOut:async()=>deny('auth.signOut')};
export const serverTimestamp=()=>deny('serverTimestamp');
${['doc','setDoc','getDoc','updateDoc','deleteDoc','collection','query','where','orderBy','getDocs','addDoc'].map(n=>`export const ${n}=()=>deny('firestore.${n}');`).join('\n')}`;
  const reads = {
    getResumeVersions: { success: true, data: [] },
    getUserProfile: { success: true, data: { id: sampleUser.uid, full_name: sampleUser.displayName, onboarding_completed: true, target_roles: [], skills: [] } },
    getCoverLetters: { success: true, data: [] },
  };
  const dbSource = fs.readFileSync(path.join(ROOT, 'lib/database-suite.ts'), 'utf8');
  const exports = [...dbSource.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m => m[1]);
  const database = deny + '\n' + exports.map(name => Object.hasOwn(reads, name)
    ? `export async function ${name}(){window.__uiFixture?.boundaryReads.push('${name}');return ${JSON.stringify(reads[name])};}`
    : `export async function ${name}(){return deny('database.${name}')}`).join('\n');
  return {
    firebase, database,
    navigation: `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('ui-fixture:navigate',fn);window.addEventListener('popstate',fn);return()=>{window.removeEventListener('ui-fixture:navigate',fn);window.removeEventListener('popstate',fn)}};const location=()=>window.location.pathname+window.location.search;
const navigate=url=>{window.history.pushState({},'',url);window.dispatchEvent(new Event('ui-fixture:navigate'))};export const usePathname=()=>useSyncExternalStore(subscribe,location).split('?')[0];export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,location).split('?')[1]||'');export const useRouter=()=>({push:navigate,replace:navigate,prefetch(){},refresh(){window.dispatchEvent(new Event('ui-fixture:navigate'))}});`,
    link: `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href}>{children}</a>}`,
    image: `import React from 'react';export default function Image({src,fill,priority,unoptimized,quality,loader,placeholder,blurDataURL,...props}){return <img {...props} src={typeof src==='string'?src:src.src}/>}`,
    dynamic: `import React from 'react';export default function dynamic(load){const Lazy=React.lazy(async()=>{const value=await load();return value.default?value:{default:value}});return function Dynamic(props){return <React.Suspense fallback={null}><Lazy {...props}/></React.Suspense>}}`,
  };
}
async function buildFixture(outDir, materialFont, mutation = null) {
  const esbuild = require('esbuild');
  const modules = boundaryModules();
  const target = path.join(outDir, 'test-bundle');
  fs.mkdirSync(target, { recursive: true });
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'ui-verify-browser-entry.jsx')], absWorkingDir: ROOT, bundle: true,
    outfile: path.join(target, 'fixture.js'), metafile: true, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'explicit-test-boundaries', setup(build) {
      build.onResolve({ filter: /^(ui-fixture:firebase|@\/lib\/firebase|.*\/firebase|\.\/firebase)$/ }, () => ({ path: 'firebase', namespace: 'ui-fixture' }));
      build.onResolve({ filter: /(?:^@\/lib\/database-suite$|\/database-suite$)/ }, () => ({ path: 'database', namespace: 'ui-fixture' }));
      build.onResolve({ filter: /^next\/(navigation|link|image|dynamic)$/ }, args => ({ path: args.path.split('/')[1], namespace: 'ui-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'ui-fixture' }, args => ({ contents: modules[args.path], loader: 'jsx', resolveDir: ROOT }));
      // Each mutation must match its source exactly once-or-more; a silent no-op would make a negative control meaningless.
      const mutate=(contents,from,to)=>{assert.ok(contents.includes(from),'Negative mutation did not match source: '+from);return contents.replace(from,()=>to)};
      build.onLoad({ filter: /PageHelp\.tsx$/ }, args => {
        let contents=fs.readFileSync(args.path, 'utf8');
        // The 44px square comes from .btn-icon in globals.css; an inline override is the smallest mutation that proves the trigger-size check measures it.
        if(mutation==='help-small-trigger')contents=mutate(contents,'className="btn-secondary btn-icon"','className="btn-secondary btn-icon" style={{ width: 24, height: 24, minWidth: 24 }}');
        return {contents,loader:'tsx'};
      });
      // help-no-backdrop-close and help-transparent-backdrop were removed: the guidance panel is non-modal and has no backdrop. help-transparent-panel keeps the readable-surface protection.
      // help-transparent-panel drops .glass-card as well because that class sets its background with !important, which an inline style cannot beat.
      // help-small-close now targets the "Close guidance" button; help-oversize now targets the panel's own placement style.
      build.onLoad({ filter: /ToolGuidanceProvider\.tsx$/ }, args => {
        let contents=fs.readFileSync(args.path, 'utf8');
        if(mutation==='help-no-escape')contents=mutate(contents,"event.key !== 'Escape'","event.key !== 'NeverEscape'");
        if(mutation==='help-no-return-focus')contents=mutate(contents,'trigger?.focus();','void trigger;');
        if(mutation==='help-small-close')contents=mutate(contents,'onClick={controller.close} aria-label="Close guidance"','onClick={controller.close} aria-label="Close guidance" style={{ width: 24, height: 24, minWidth: 24, minHeight: 24, padding: 0 }}');
        if(mutation==='help-transparent-panel')contents=mutate(contents,'className="tool-guidance-panel glass-card" style={placement}',"className=\"tool-guidance-panel\" style={{ ...placement, background: 'transparent' }}");
        if(mutation==='help-oversize')contents=mutate(contents,'style={placement} data-guidance-controls data-guidance-panel',"style={{ ...placement, minWidth: '600px' }} data-guidance-controls data-guidance-panel");
        return {contents,loader:'tsx'};
      });
      build.onLoad({filter:/job-display\.ts$/},args=>{let contents=fs.readFileSync(args.path,'utf8');if(mutation==='salary-no-estimate')contents=contents.replace("salary.isPredicted === true","false");return{contents,loader:'ts'}});
      build.onLoad({filter:/job-search-selection\.ts$/},args=>{let contents=fs.readFileSync(args.path,'utf8');if(mutation==='salary-all-intervals')contents=contents.replaceAll('comparableAnnualSalary(right.salary)','(right.salary.max ?? right.salary.min ?? null)').replaceAll('comparableAnnualSalary(left.salary)','(left.salary.max ?? left.salary.min ?? null)');return{contents,loader:'ts'}});
      build.onLoad({filter:/JobFeedWidget\.tsx$/},args=>{let contents=fs.readFileSync(args.path,'utf8');if(mutation==='fit-badge-wrap')contents=mutate(contents,'shrink-0 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]','w-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]');if(mutation==='fit-no-guard')contents=mutate(contents,'const fitAvailable = hasFitScore(job.acceptanceChance);','const fitAvailable = true;');return {contents,loader:'tsx'}});
      build.onLoad({ filter: /\.css$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'css' }));
    }}],
  });
  fs.writeFileSync(path.join(target, 'metafile.json'), JSON.stringify(result.metafile, null, 2));
  const tailwindConfig = require('esbuild').transformSync(fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const cfgModule = { exports: {} }; new Function('module', 'exports', tailwindConfig)(cfgModule, cfgModule.exports);
  const css = await require('postcss')([require('tailwindcss')({ ...cfgModule.exports.default, content: cfgModule.exports.default.content.map(p => path.join(ROOT, p)) }), require('autoprefixer')])
    .process(fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8'), { from: path.join(ROOT, 'app/globals.css') });
  // Only test-label/text font declarations are added. Product geometry/styles stay real.
  let cssText = css.css + `\n:root{--font-inter:Inter}\n@font-face{font-family:Inter;src:url('/fonts/Inter-Regular.ttf')}@font-face{font-family:Inter;src:url('/fonts/Inter-Bold.ttf');font-weight:700}`;
  if (materialFont) {
    fs.copyFileSync(materialFont, path.join(target, 'material-symbols.woff2'));
    cssText += `\n@font-face{font-family:'Material Symbols Rounded';src:url('/__ui_verify__/material-symbols.woff2')} .material-symbols-rounded{font-family:'Material Symbols Rounded';font-weight:normal;font-style:normal;font-feature-settings:'liga';line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-smoothing:antialiased}`;
  }
  const bundledCss = path.join(target, 'fixture.css');
  if (fs.existsSync(bundledCss)) cssText += '\n' + fs.readFileSync(bundledCss, 'utf8');
  fs.writeFileSync(path.join(target, 'fixture.css'), cssText);
  fs.copyFileSync(path.join(ROOT,'components/resume-studio/resume-review-workbench.css'),path.join(target,'resume-review-workbench.css'));
  const assetPaths = new Map([['/__ui_verify__/fixture.js', path.join(target, 'fixture.js')], ['/__ui_verify__/fixture.css', path.join(target, 'fixture.css')]]);
  assetPaths.set('/__ui_verify__/resume-review-workbench.css',path.join(target,'resume-review-workbench.css'));
  if (materialFont) assetPaths.set('/__ui_verify__/material-symbols.woff2', path.join(target, 'material-symbols.woff2'));
  function publicFiles(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) publicFiles(file); else assetPaths.set('/' + path.relative(path.join(ROOT, 'public'), file).split(path.sep).join('/'), file); } }
  publicFiles(path.join(ROOT, 'public'));
  const assetHashes = [...assetPaths].map(([url, file]) => ({ url, provenance: path.relative(ROOT, file), sha256: hash(fs.readFileSync(file)) }));
  fs.writeFileSync(path.join(target,'static-assets.json'),JSON.stringify({assets:assetHashes,routes:ROUTES},null,2));
  return { target, assetPaths, assetHashes, inputs: Object.keys(result.metafile.inputs), boundaryNames: Object.keys(modules) };
}
async function startServer(bundle, port) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__ui_verify__/fixture.css"></head><body class="font-sans antialiased"><aside style="font:12px Inter,sans-serif;padding:12px 60px;border-bottom:1px solid currentColor">Sample data · TEST ONLY component boundary · No server-auth/live-data certification</aside><div id="fixture-root"></div><script src="/__ui_verify__/fixture.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (ROUTES.includes(url.pathname)) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? '' : html); return; }
    const file = bundle.assetPaths.get(url.pathname);
    if (!file || url.search) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(file); const mime = { '.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(req.method === 'HEAD' ? '' : fs.readFileSync(file));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
async function freezeMaterialFont(outDir) {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0';
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
  const dir = path.join(outDir, 'static-font-provenance'); fs.mkdirSync(dir, { recursive:true });
  const fontFile = path.join(dir, 'material-symbols.woff2');
  const recordFile = path.join(dir, 'provenance.json');
  if (fs.existsSync(recordFile) && fs.existsSync(fontFile)) {
    const prior = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
    assert.equal(prior.cssUrl, cssUrl); assert.equal(prior.fontSha256, hash(fs.readFileSync(fontFile))); return { fontFile, provenance:prior };
  }
  const response = await fetch(cssUrl, { headers:{ 'User-Agent':ua }, redirect:'manual', signal:AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'Exact static-font CSS request did not succeed');
  const css = await response.text();
  const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m=>m[1]);
  assert.equal(new Set(urls).size, 1, 'Expected one exact Material Symbols font resource');
  const fontUrl = new URL(urls[0]);
  assert.equal(fontUrl.origin, 'https://fonts.gstatic.com'); assert.ok(fontUrl.pathname.startsWith('/s/materialsymbolsrounded/')); assert.ok(!fontUrl.search);
  const fontResponse = await fetch(fontUrl, { headers:{'User-Agent':ua},redirect:'manual',signal:AbortSignal.timeout(20000) });
  assert.equal(fontResponse.status, 200, 'Exact static-font resource failed');
  const bytes = Buffer.from(await fontResponse.arrayBuffer()); assert.ok(bytes.length > 1000 && bytes.length < 20000000);
  fs.writeFileSync(path.join(dir, 'material-symbols.css'), css); fs.writeFileSync(fontFile, bytes);
  const provenance = { cssUrl, fontUrl:fontUrl.href, userAgent:ua, fetchedAt:new Date().toISOString(), cssSha256:hash(css),fontSha256:hash(bytes),cssContentType:response.headers.get('content-type'),fontContentType:fontResponse.headers.get('content-type'),policy:'Exact public static CSS/font GETs, manual redirects denied, no auth/cookies/payload. Browser subsequently receives frozen loopback bytes.' };
  fs.writeFileSync(recordFile,JSON.stringify(provenance,null,2)); return { fontFile, provenance };
}
function problemsFor(probeResult, width, observations) {
  const problems = [];
  if (probeResult.overflow) problems.push({kind:'overflow',detail:probeResult.overflow,items:probeResult.offenders});
  if (probeResult.clipped.length) problems.push({kind:'clipped',items:probeResult.clipped});
  if (width < 1024 && probeResult.smallTargets.length) problems.push({kind:'touch-target',items:probeResult.smallTargets});
  if (width < 1024 && probeResult.smallInputs.length) problems.push({kind:'input-size',items:probeResult.smallInputs});
  if (observations.errors.length) problems.push({kind:'console',items:[...observations.errors]});
  if (observations.unexpected.length) problems.push({kind:'unexpected-request',items:[...observations.unexpected]});
  if (observations.failed.length) problems.push({kind:'request',items:[...observations.failed]});
  return problems;
}
async function attachContainment(context, origin, assets, state) {
  const observations = { errors:[],unexpected:[],failed:[],authProbes:[],requests:[],scenarioAborts:[] };
  // Request identity, never URL: retries share paths but have independent outcomes.
  const intentionalAborts=new WeakSet(),deniedRequests=new WeakSet(),knownAuthRequests=new WeakSet();
  const lastRequestByUrl=new Map();observations.expectedResourceConsole=[];
  context.on('page', page => {
    page.on('pageerror',error=>observations.errors.push('pageerror: '+error.message));
    page.on('console',message=>{
      if(message.type()!=='error')return;
      const url=message.location().url;const request=lastRequestByUrl.get(url);
      if(/^Failed to load resource/.test(message.text()) && request && (intentionalAborts.has(request)||knownAuthRequests.has(request)))observations.expectedResourceConsole.push({url,text:message.text(),scope:intentionalAborts.has(request)?'that named interrupted Request':'exact existing admin401 Request'});
      else observations.errors.push(message.text());
    });
    page.on('response', response=>{if(response.status()>=400) {
      const pathname = new URL(response.url()).pathname;
      if (pathname === '/api/admin/session' && response.status()===401) observations.authProbes.push({status:401,pathname});
      else observations.failed.push({status:response.status(),pathname});
    }});
    page.on('requestfailed', request=>{
      const url = request.url();
      if (!intentionalAborts.has(request) && !deniedRequests.has(request)) observations.failed.push({url,error:request.failure()?.errorText});
    });
  });
  await context.route('**/*',async route=>{
    const request = route.request();lastRequestByUrl.set(request.url(),request);
    const info = {url:request.url(),method:request.method(),resourceType:request.resourceType(),headers:request.headers(),postData:request.postData()};
    let policy;
    try { policy=classifyRequest(info,origin,assets); }
    catch(error) { deniedRequests.add(request);observations.unexpected.push({url:info.url,method:info.method,reason:error.message}); await route.abort('blockedbyclient');return; }
    if(policy.kind==='asset') {observations.requests.push({method:info.method,path:policy.pathname,boundary:'explicit loopback static asset'});if(state.assetOverrides?.has(policy.pathname)){await route.fulfill({status:200,contentType:'text/javascript',body:state.assetOverrides.get(policy.pathname)});}else await route.continue();return;}
    let scenario;
    if(policy.pathname==='/api/jobs/search'||policy.pathname==='/api/jobs/suggestions') {
      const queue=policy.pathname.endsWith('/search')?state.search:state.suggestions;
      const selected=queue.length>1?queue.shift():queue[0];
      assert.ok(selected,'Missing named API response scenario');
      scenario=responseScenario(selected,policy.pathname); if(scenario.body)validateJobsResponse(scenario.body,scenario.name);
      state.calls[policy.pathname]=(state.calls[policy.pathname]||0)+1;
      if(state.delay)await wait(state.delay);
    } else {
      const responses={
        '/api/jobs/preferences': {success:true,isNew:true,preferences:{targetRoles:[],preferredCities:[],remotePref:'any',jobAlertsEnabled:true}},
        '/api/usage': {tier:'free',usage:{morphs:0,gauntlets:0,flashcards:0,jdGenerations:0,coverLetters:0,resumeChecks:0,linkedinProfiles:0,writingTools:0,galleryTools:0,resumeParses:0,resumeAssists:0,vaultExports:0},caps:{morphs:3,gauntlets:3,flashcards:2,jdGenerations:3}},
        '/api/admin/session': {error:'Sample fixture has no admin authorization'},
        '/api/agent/intelligence': {success:true,twin:null},
      };
      assert.ok(Object.hasOwn(responses,policy.pathname));validateShellResponse(policy.pathname,responses[policy.pathname]);scenario={name:'bounded-shell-read',status:policy.pathname==='/api/admin/session'?401:200,body:responses[policy.pathname]};
    }
    observations.requests.push({method:info.method,path:policy.pathname,scenario:scenario.name,boundary:'synthetic component response'});
    if(scenario.abort){if(scenario.intentional){intentionalAborts.add(request);observations.scenarioAborts.push({url:info.url,scenario:scenario.name});}await route.abort(scenario.abort);return;}
    if(policy.pathname==='/api/admin/session'&&scenario.status===401)knownAuthRequests.add(request);
    await route.fulfill({status:scenario.status,contentType:'application/json',body:JSON.stringify(scenario.body)});
  });
  await context.routeWebSocket('**/*',ws=>{observations.unexpected.push({url:ws.url(),method:'WEBSOCKET',reason:'WebSocket network is not allowlisted'});ws.close();});
  return observations;
}
async function settle(page) { await page.waitForTimeout(350); await page.evaluate(()=>document.fonts.ready); }
async function runShellStates(page, width, capture) {
  if (width<1024) {
    const trigger=page.getByRole('button',{name:'Open main menu',exact:true});
    await trigger.focus();await page.keyboard.press('Enter');await settle(page);
    const drawer=page.getByRole('dialog',{name:'Main menu',exact:true});await drawer.waitFor();
    // The sidebar now has one disclosure, "More tools"; the Build/Search and Apply/Prepare/Grow groups no longer exist.
    for(const name of [/^More tools/]) {
      const group=drawer.getByRole('button',{name});const rect=await group.boundingBox();assert.ok(rect.width>=44&&rect.height>=44,`Drawer ${name} target ${JSON.stringify(rect)}`);
      const before=await group.getAttribute('aria-expanded');await group.focus();await page.keyboard.press('Enter');assert.notEqual(await group.getAttribute('aria-expanded'),before);await page.keyboard.press('Enter');assert.equal(await group.getAttribute('aria-expanded'),before);
    }
    await page.keyboard.press('Tab');assert.ok(await drawer.evaluate(el=>el.contains(document.activeElement)),'Drawer keyboard focus escaped');
    await capture('drawer-open');await page.keyboard.press('Escape');await settle(page);
    assert.equal(await page.locator('#suite-sidebar').getAttribute('inert'),'');assert.equal(await page.locator('#suite-sidebar').getAttribute('aria-hidden'),'true');assert.ok(await trigger.evaluate(el=>el===document.activeElement),'Drawer Escape did not restore focus');
    const closedBox=await page.locator('#suite-sidebar').boundingBox();assert.ok(closedBox.x+closedBox.width<=0,'Closed drawer is not off-canvas: '+JSON.stringify(closedBox));
    await trigger.click();await settle(page);await drawer.getByRole('button',{name:'Close main menu',exact:true}).click();await settle(page);assert.ok(await trigger.evaluate(el=>el===document.activeElement));
  } else {
    const expand=page.getByRole('button',{name:'Expand sidebar',exact:true});if(await expand.count())await expand.click();
    for(const name of [/^More tools/]) {
      // Rows are min-h-11 at every density now, so the old "under 44px" desktop check is obsolete; compact (44px) must still beat the 62px default row.
      const group=page.locator('#suite-sidebar').getByRole('button',{name});const rowBox=await group.boundingBox();assert.ok(rowBox.height>=44&&rowBox.height<62,'Desktop density changed: '+rowBox.height);
      const before=await group.getAttribute('aria-expanded');await group.click();assert.notEqual(await group.getAttribute('aria-expanded'),before);await group.click();
    }
    await capture('desktop-shell');
  }
  const help=page.getByRole('button',{name:/^How to use /}).filter({visible:true}).first();
  if(!await help.count())return;
  // Guidance is a NON-MODAL region (components/guidance/ToolGuidanceProvider.tsx): no dialog role, no backdrop, no focus trap, no inert background, no scroll lock.
  const triggerBox=await help.boundingBox();assert.ok(triggerBox.width>=44&&triggerBox.height>=44,`Help trigger target ${JSON.stringify(triggerBox)}`);
  const prior=await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow}));
  const panel=page.getByRole('region',{name:/^How to use /});const closeGuide=panel.getByRole('button',{name:'Close guidance',exact:true});
  const guidanceOpen=()=>page.evaluate(()=>document.documentElement.hasAttribute('data-tool-guidance-open'));
  assert.equal(await help.getAttribute('aria-expanded'),'false');assert.equal(await panel.count(),0,'Guidance open before the trigger was used');
  await help.focus();await page.keyboard.press('Enter');await settle(page);await panel.waitFor();
  assert.equal(await help.getAttribute('aria-expanded'),'true');assert.equal(await help.getAttribute('aria-controls'),await panel.getAttribute('id'),'Trigger does not control the panel');
  assert.equal(await page.getByRole('dialog',{name:/^How to [Uu]se /}).count(),0,'Guidance became a modal dialog');assert.ok(await guidanceOpen(),'Guidance open marker missing');
  assert.ok(await panel.evaluate(el=>el===document.activeElement),'Guidance initial focus');
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=900+1,'Guidance exceeds viewport');
  await page.keyboard.press('Tab');assert.ok(await closeGuide.evaluate(el=>el===document.activeElement),'Keyboard cannot reach Close guidance from the panel');
  const closeBox=await closeGuide.boundingBox();assert.ok(closeBox.width>=44&&closeBox.height>=44,`Close guidance target ${JSON.stringify(closeBox)}`);
  assert.equal(await page.evaluate(()=>document.getElementById('fixture-root').inert),false,'Non-modal guidance made the background inert');
  assert.deepEqual(await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow})),prior,'Non-modal guidance locked page scrolling');
  const helpColors=await panel.evaluate(el=>{const surface=getComputedStyle(el);const text=getComputedStyle(el.querySelector('p'));return {background:surface.backgroundColor,text:text.color}});
  assert.notEqual(helpColors.background,'rgba(0, 0, 0, 0)','Guidance surface is transparent');
  assert.notEqual(helpColors.text,helpColors.background,'Guidance text is unreadable');
  const scrollBody=panel.locator('.tool-guidance-panel-body');await scrollBody.hover();await page.mouse.wheel(0,500);await page.waitForTimeout(100);assert.ok(await scrollBody.evaluate(el=>el.scrollTop>0||el.scrollHeight<=el.clientHeight),'Guidance content cannot scroll');
  await capture('help-open');await closeGuide.focus();await page.keyboard.press('Escape');await settle(page);
  assert.equal(await panel.count(),0,'Guidance Escape failed');assert.ok(await help.evaluate(el=>el===document.activeElement),'Guidance return focus');
  assert.equal(await help.getAttribute('aria-expanded'),'false');assert.equal(await guidanceOpen(),false,'Guidance open marker leaked after Escape');
  assert.deepEqual(await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow})),prior,'Guidance scroll cleanup');
  await help.click();await settle(page);await panel.waitFor();await closeGuide.click();await settle(page);assert.equal(await panel.count(),0,'Close guidance failed');assert.ok(await help.evaluate(el=>el===document.activeElement),'Close guidance did not return focus to the trigger');
  await help.click();await settle(page);await page.keyboard.press('Escape');await page.waitForTimeout(50);await page.evaluate(()=>window.__uiFixture.remount());await settle(page);assert.equal(await panel.count(),0,'Exit unmount retained guidance');await help.click();await settle(page);assert.ok(await panel.isVisible(),'Guidance reopen after exit interruption failed');await page.keyboard.press('Escape');await settle(page);assert.equal(await guidanceOpen(),false,'Rapid close leaked the open marker');
  await help.click();await settle(page);
  await page.evaluate(()=>{history.pushState({},'', location.pathname==='/suite/job-search'?'/suite/cover-letter':'/suite/job-search');window.dispatchEvent(new Event('ui-fixture:navigate'))});await settle(page);
  assert.equal(await panel.count(),0,'Route change retained guidance');assert.equal(await guidanceOpen(),false,'Route-change open marker leaked');assert.deepEqual(await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow})),prior,'Route-change cleanup');
  assert.equal(await page.locator('#fixture-root').evaluate(el=>el.inert),false);await capture('help-route-cleanup');
}
async function exerciseSearch(page,state,capture,width) {
  await page.getByRole('heading',{name:/^Start with a role, then let\s*Taco\s*rank the market\.$/}).waitFor();await capture('initial');
  await page.getByRole('textbox',{name:'Target role',exact:true}).fill('Sample engineering role');
  const submit=page.locator('button[type="submit"]').first();state.search=['populated'];state.delay=1400;
  await submit.click();await page.getByText('Scanning sources and ranking roles',{exact:true}).waitFor();await capture('loading');
  await page.getByRole('heading',{name:'4 ranked roles',exact:true}).waitFor();state.delay=0;await settle(page);
  const cards=page.locator('button[aria-controls="opportunity-intelligence-panel"][aria-pressed]');
  assert.ok(await cards.filter({hasText:'$100K – $120K/yr'}).first().getByText('$100K – $120K/yr').first().isVisible(),'Annual USD salary not shown inside its job card');
  assert.ok(await cards.filter({hasText:'GBP 35–45/hr (estimated)'}).first().getByText('GBP 35–45/hr (estimated)').first().isVisible(),'Foreign hourly estimated salary not shown inside its job card');
  // Unknown pay and unknown posting date are both stated in the card's sentence, never rendered as a number.
  assert.match(await cards.filter({hasText:'Sample unknown-pay role'}).first().innerText(),/· Not listed · Posted Unknown/,'Unknown pay/date not stated honestly in its job card');
  assert.ok(!(await page.locator('main').innerText()).includes('0%'),'Unknown fit rendered as measured zero');
  await capture('populated');
  state.search=['salary-adversarial'];await submit.click();await page.getByRole('heading',{name:'5 ranked roles',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Sort opportunities'}).selectOption('salary');assert.match(await cards.first().innerText(),/Sample higher annual role/);
  await capture('annual-only-salary-sort');
  await page.getByRole('combobox',{name:'Sort opportunities'}).selectOption('date');assert.match(await cards.first().innerText(),/Sample higher annual role/);
  state.search=['populated'];await submit.click();await page.getByRole('heading',{name:'4 ranked roles',exact:true}).waitFor();
  await page.getByRole('button',{name:'home_work Remote',exact:true}).click();await page.getByRole('heading',{name:'2 ranked roles',exact:true}).waitFor();
  assert.ok(!(await cards.allTextContents()).join('\n').includes('Sample higher annual role'),'Structured onsite record leaked into remote filter');
  await page.getByRole('button',{name:'view_list All',exact:true}).click();await page.getByRole('heading',{name:'4 ranked roles',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Sort opportunities'}).selectOption('relevance');
  if(width<1024){
    const disclosure=page.locator('button[aria-controls="remaining-ranked-roles"]');assert.equal(await disclosure.getAttribute('aria-expanded'),'false');
    assert.equal(await cards.filter({visible:true}).count(),3);await disclosure.focus();await page.keyboard.press('Enter');await settle(page);assert.equal(await cards.filter({visible:true}).count(),4);
    await cards.last().focus();await page.keyboard.press('Enter');assert.equal(await cards.last().getAttribute('aria-pressed'),'true');
    await disclosure.click();await settle(page);assert.equal(await cards.first().getAttribute('aria-pressed'),'true','Collapse did not recover selection to top three');await capture('top-three-collapsed');
  }
  await cards.nth(1).focus();await page.keyboard.press('Enter');assert.equal(await cards.nth(1).getAttribute('aria-pressed'),'true');
  const details=page.getByRole('button',{name:/View details/}).first();if(await details.count())await details.click();
  else await cards.nth(1).click();
  await page.locator('#opportunity-intelligence-panel').waitFor();await settle(page);await capture('detail-open');
  const close=page.getByRole('button',{name:'Close role details',exact:true});if(await close.isVisible())await close.click();
  state.search=['empty'];await submit.click();await page.getByText('No roles found for this search.',{exact:true}).waitFor();await capture('empty');
  state.search=['interrupted','populated'];await submit.click();await page.getByRole('button',{name:/Retry search/}).waitFor();await capture('interrupted');
  assert.equal(await cards.count(),0,'Failure scenario became success before retry');await page.getByRole('button',{name:/Retry search/}).click();await page.getByRole('heading',{name:'4 ranked roles',exact:true}).waitFor();await capture('retry-success');
  await runShellStates(page,width,capture);
}
async function assertWidgetBadges(page,minimum=0) {
  const badges=page.locator('[data-ui-widget-boundary] span').filter({hasText:/^(?:[0-9]+(?:\.[0-9]+)?% match · est\.|Match not scored)$/});
  const geometry=await badges.evaluateAll(elements=>elements.map(el=>{const range=document.createRange();range.selectNodeContents(el);const rects=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0);const style=getComputedStyle(el);// The count is a number plus a string, i.e. two adjacent text nodes with one client rect each; rects are grouped into visual lines by vertical position so one line is not mistaken for a wrap.
    const lines=[];for(const rect of rects)if(!lines.some(top=>Math.abs(top-rect.y)<rect.height/2))lines.push(rect.y);
    return {text:el.textContent,whiteSpace:style.whiteSpace,numeric:style.fontVariantNumeric,lines:lines.length,lineRects:rects.map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height}))}}));
  // A regex that silently matches nothing would pass every badge check; callers that know badges must exist say how many.
  assert.ok(geometry.length>=minimum,`Expected at least ${minimum} fit badge(s), found ${geometry.length}: the badge selector no longer matches the product`);
  for(const badge of geometry){assert.equal(badge.lines,1,'Measured fit badge wrapped: '+badge.text);if(/% match/.test(badge.text)){assert.equal(badge.whiteSpace,'nowrap','Fit badge missing nowrap');assert.ok(badge.numeric.includes('tabular-nums'),'Fit badge lost tabular numbers')}}
  return geometry;
}
async function exerciseWidget(page,state,capture,width) {
  const boundary=page.locator('[data-ui-widget-boundary="JobFeedWidget"]');await boundary.waitFor();
  await boundary.locator('.animate-pulse').first().waitFor();await capture('loading');
  await boundary.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();await settle(page);state.delay=0;
  assert.equal(await boundary.locator('h4').count(),3,'Widget top-three count');const badgeTexts=(await assertWidgetBadges(page,3)).map(b=>b.text);
  assert.ok((await boundary.innerText()).includes('GBP 35–45/hr (estimated)'));
  assert.ok(badgeTexts.includes('0% match · est.'),'Widget valid finite zero lost its measurement');assert.ok(badgeTexts.includes('75% match · est.'),'Widget measured 75 lost its badge');
  assert.ok(!(await boundary.innerText()).includes('\n% match'),'Widget missing fit rendered a bare percentage');
  assert.ok(badgeTexts.includes('Match not scored')&&await boundary.getByText('Match not scored',{exact:true}).isVisible(),'Widget missing fit is not labelled');
  assert.equal(await page.evaluate(()=>localStorage.getItem('talent-job-curated-count:sample-ui-fixture-01')),'4');await capture('populated-top-three-partial');
  // A partial response itself provides the real retry control. Its next response must merge picks.
  state.suggestions=['partial-next'];await boundary.getByRole('button',{name:'Retry suggestions',exact:true}).click();await boundary.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();await settle(page);
  assert.equal(await page.evaluate(()=>localStorage.getItem('talent-job-curated-count:sample-ui-fixture-01')),'5','Partial retry discarded prior picks');assert.equal(await boundary.locator('h4').count(),3);await capture('partial-retained');
  state.suggestions=['interrupted','populated'];await boundary.getByRole('button',{name:'Retry suggestions',exact:true}).click();await boundary.getByRole('button',{name:/Retry Career Picks by Taco/}).waitFor();await capture('interrupted-retained');
  await boundary.getByRole('button',{name:/Retry Career Picks by Taco/}).click();await boundary.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();await settle(page);await capture('retry-success');
  await page.evaluate(()=>window.__uiFixture.setUser(null));await settle(page);assert.equal(await boundary.locator('h4').count(),0,'Real signed-out store did not remove widget');await capture('store-signed-out');
  state.suggestions=['setup'];await page.evaluate(()=>window.__uiFixture.setUser({uid:'sample-ui-fixture-02'}));await boundary.getByRole('heading',{name:'Set up your Opportunity Radar',exact:true}).waitFor();await capture('setup-required');
  assert.equal(await page.evaluate(()=>localStorage.getItem('talent-job-curated-count:sample-ui-fixture-02')),'0');
  state.suggestions=['empty'];await page.evaluate(()=>window.__uiFixture.setUser({uid:'sample-ui-fixture-03'}));await settle(page);assert.equal(await boundary.locator('h4').count(),0);assert.equal(await boundary.getByText('Set up your Opportunity Radar',{exact:true}).count(),0);await capture('empty-success');
  state.suggestions=['populated'];await page.evaluate(()=>window.__uiFixture.setUser({uid:'sample-ui-fixture-04'}));await boundary.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();await boundary.getByRole('button',{name:/View all/}).click();await page.getByRole('textbox',{name:'Target role',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/suite/job-search');await capture('widget-navigation');
  await page.evaluate(()=>{history.pushState({},'', '/suite');window.dispatchEvent(new Event('ui-fixture:navigate'))});await settle(page);await runShellStates(page,width,capture);
}
async function runNegativeControls(browser,probe,origin,assets) {
  const results=[];
  async function control(name,fn){try{await fn();results.push({name,ok:true})}catch(error){results.push({name,ok:false,error:error.message})}finally{await page.evaluate(()=>document.querySelectorAll('#negative').forEach(el=>el.remove())).catch(()=>{})}}
  const context=await browser.newContext({viewport:{width:768,height:900},serviceWorkers:'block'});
  const observations=await attachContainment(context,origin,assets,{search:['populated'],suggestions:['populated'],calls:{},delay:0});
  const page=await context.newPage();
  await page.goto(origin+'/suite/cover-letter');await settle(page);
  await control('visible 24px target and 14px input fail at 768, desktop gate unchanged',async()=>{
    await page.evaluate(()=>{const box=document.createElement('div');box.id='negative';box.innerHTML='<button style="width:24px;height:24px">Sample negative</button><input style="font-size:14px!important" aria-label="Sample negative input">';document.body.appendChild(box)});
    const r=await page.evaluate(probe);assert.ok(problemsFor(r,768,{errors:[],unexpected:[],failed:[]}).some(p=>p.kind==='touch-target'));assert.ok(problemsFor(r,768,{errors:[],unexpected:[],failed:[]}).some(p=>p.kind==='input-size'));assert.ok(!problemsFor(r,1024,{errors:[],unexpected:[],failed:[]}).some(p=>['touch-target','input-size'].includes(p.kind)));await page.locator('#negative').evaluate(el=>el.remove());
  });
  await control('inert ancestor excluded; reopening undersized control fails; aria-hidden/offscreen alone measured',async()=>{
    await page.evaluate(()=>{const box=document.createElement('div');box.id='negative';box.inert=true;box.innerHTML='<button style="width:24px;height:24px" aria-hidden="true">Sample inert negative</button>';document.body.appendChild(box)});
    assert.ok(!(await page.evaluate(probe)).smallTargets.some(el=>el.text==='Sample inert negative'));await page.locator('#negative').evaluate(el=>{el.inert=false;el.style.position='absolute';el.style.top='4000px'});assert.ok((await page.evaluate(probe)).smallTargets.some(el=>el.text==='Sample inert negative'));await page.locator('#negative').evaluate(el=>el.remove());
  });
  await control('oversized visible content still fails independently of inert',async()=>{
    await page.evaluate(()=>{const box=document.createElement('div');box.id='negative';box.inert=true;box.style.width='10000px';box.textContent='Sample visible overflow';document.body.appendChild(box)});assert.ok((await page.evaluate(probe)).overflow);await page.locator('#negative').evaluate(el=>el.remove());
  });
  await control('ordinary failed retry at same URL after named interruption fails',async()=>{
    const extra=await browser.newContext({viewport:{width:768,height:900},serviceWorkers:'block'});
    const state={search:['interrupted','ordinary-request-failure'],suggestions:['populated'],calls:{},delay:0};
    const seen=await attachContainment(extra,origin,assets,state);const retryPage=await extra.newPage();
    try {await retryPage.goto(origin+'/suite/cover-letter');await settle(retryPage);
      await retryPage.evaluate(async token=>{const url='/api/jobs/search?query=Sample+failure&location=&country=us&page=1&sortBy=relevance&limit=24';for(let i=0;i<2;i++)await fetch(url,{headers:{Authorization:'Bearer '+token}}).catch(()=>{})},TOKEN);
      await retryPage.waitForTimeout(100);assert.equal(seen.scenarioAborts.length,1);assert.equal(seen.failed.length,1,'Named abort hid later ordinary retry failure');assert.ok(problemsFor(await retryPage.evaluate(probe),768,seen).some(p=>p.kind==='request'));
    }finally{await extra.close()}
  });
  await control('JS exception and unplanned request/write fail; console error not swallowed',async()=>{
    await page.evaluate(()=>{setTimeout(()=>{throw new Error('Sample deliberate JS exception')},0);console.error('Sample deliberate console error');console.error('Failed to load resource deliberate application defect');fetch('/api/unexpected-fixture');fetch('/api/jobs/preferences',{method:'POST',body:'{}'}).catch(()=>{});fetch('https://firestore.googleapis.com/unexpected').catch(()=>{})});await page.waitForTimeout(100);
    assert.ok(observations.errors.some(s=>s.includes('Sample deliberate JS exception')));assert.ok(observations.errors.some(s=>s.includes('Sample deliberate console error')));assert.ok(observations.errors.some(s=>s==='Failed to load resource deliberate application defect'),'Application console prefix swallowed');assert.equal(observations.unexpected.length,3);assert.ok(problemsFor(await page.evaluate(probe),768,observations).some(p=>p.kind==='unexpected-request'));
  });
  await context.close();return results;
}
async function runSupplemental(browser,origin,assets,outDir,probe) {
  const results=[];
  for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width:320,height:600},colorScheme:theme,serviceWorkers:'block'});
    const seen=await attachContainment(context,origin,assets,{search:['populated'],suggestions:['populated'],calls:{},delay:0});
    await context.addInitScript(t=>{try{localStorage.setItem('talent-studio-theme',t)}catch{}},theme);
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const result={theme,states:[],problems:[]};results.push(result);
    try {
      await page.goto(origin+'/suite/cover-letter');await settle(page);
      const help=page.getByRole('button',{name:'How to use Cover letter',exact:true}).filter({visible:true});
      await help.focus();await page.keyboard.press('Enter');await settle(page);
      const panel=page.getByRole('region',{name:'How to use Cover letter',exact:true});await panel.waitFor();
      const region=panel.locator('.tool-guidance-panel-body');
      assert.ok(await region.evaluate(el=>el.scrollHeight>el.clientHeight),'Short viewport must genuinely overflow guidance content');
      // The panel is non-modal and not a trap: Tab walks its controls, bringing overflowing ones into view, then leaves it.
      let reached=0;let top=0;for(let i=0;i<14;i++){await page.keyboard.press('Tab');if(!await panel.evaluate(el=>el.contains(document.activeElement)))break;reached++;top=Math.max(top,await region.evaluate(el=>el.scrollTop));}
      await page.waitForTimeout(250);assert.ok(reached>=2,'Keyboard cannot reach guidance controls');
      const scroll={top,reached,height:await region.evaluate(el=>el.clientHeight),scrollHeight:await region.evaluate(el=>el.scrollHeight)};assert.ok(scroll.top>0,'Keyboard cannot scroll overflowing guidance to its later controls');
      const keyboardScreenshot=path.join(outDir,'supplemental-help-keyboard-'+theme+'-320x600.png');await page.screenshot({path:keyboardScreenshot,fullPage:true});
      result.states.push({name:'short-viewport-keyboard-scroll',scroll,screenshot:keyboardScreenshot});
      await panel.getByRole('button',{name:'Close guidance',exact:true}).focus();await page.keyboard.press('Escape');await settle(page);assert.ok(await help.evaluate(el=>el===document.activeElement));
      await page.setViewportSize({width:1440,height:900});await settle(page);await help.focus();await page.keyboard.press('Enter');await settle(page);
      await page.setViewportSize({width:390,height:900});await settle(page);await page.keyboard.press('Escape');await settle(page);
      assert.ok(await help.evaluate(el=>el===document.activeElement),'Responsive resize did not restore visible equivalent trigger');
      result.states.push({name:'desktop-to-mobile-visible-focus-return',width:390,focus:await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))});
      await page.evaluate(()=>window.__uiFixture.supplement('resume-review'));await settle(page);
      const chip=page.locator('.resume-review-toolbar__signals .resume-review-signal-missing');await chip.waitFor();
      const style=await chip.evaluate(el=>({radius:getComputedStyle(el).borderRadius,text:el.textContent,background:getComputedStyle(el).backgroundColor,borderStyle:getComputedStyle(el).borderStyle}));
      assert.equal(style.radius,'999px');assert.match(style.text,/not scored yet/);
      const screenshot=path.join(outDir,'supplemental-actual-resume-chip-'+theme+'.png');await page.screenshot({path:screenshot,fullPage:true});
      result.states.push({name:'actual-resume-workbench-missing-fit-radius',style,screenshot,scope:'Supplemental actual component, sample/null evidence; radius only, no whole workbench certification'});
      result.problems.push(...seen.errors.map(detail=>({kind:'console',detail})),...seen.failed.map(detail=>({kind:'request',detail})),...seen.unexpected.map(detail=>({kind:'unexpected-request',detail})));
    }catch(error){result.problems.push({kind:'behavior',detail:error.message})}finally{await context.close()}
  }
  // Each explicitly named response reaches the real widget through its user/store fetch path.
  for(let index=0;index<7;index++){
    const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
    const state={search:['populated'],suggestions:['defensive-fit-'+index],calls:{},delay:0};const seen=await attachContainment(context,origin,assets,state);const page=await context.newPage();
    const result={name:'actual-widget-defensive-fit-'+index,problems:[],scope:'Defensive missing/malformed response only, not valid server unknown-fit certification'};results.push(result);
    try{await page.goto(origin+'/suite');const boundary=page.locator('[data-ui-widget-boundary]');await boundary.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();
      const text=await boundary.innerText();if(index<2)assert.ok(text.includes((index===0?'0':'75')+'% match · est.'));else {assert.ok(text.includes('Match not scored'));assert.ok(!/% match/.test(text),'Malformed fit rendered as a measurement');}result.text=text;
      result.problems.push(...seen.errors,...seen.failed,...seen.unexpected);
    }catch(error){result.problems.push({kind:'behavior',detail:error.message})}finally{await context.close()}
  }
  return results;
}
async function runBehaviorMutationControls(browser,origin,assets,outDir,fontFile) {
  const results=[];
  // Third item: the assertion message the mutation must trip. Any other failure (timeout, broken selector) is a harness fault, not a detection.
  const specs=[['help-no-escape','escape',/Guidance Escape failed/],['help-no-return-focus','return-focus',/Close guidance did not return focus/],['help-small-close','target',/Close guidance target below 44px/],['help-small-trigger','trigger-target',/Help trigger target below 44px/],['help-transparent-panel','surface',/Guidance surface transparent/],['help-oversize','geometry',/Guidance oversized panel outside viewport/],['salary-no-estimate','estimate',/Predicted salary lost estimate label/],['salary-all-intervals','salary',/Foreign monthly salary entered annual USD ordering/],['fit-no-guard','fit',/Unknown fit lost unavailable label/],['fit-badge-wrap','badge-wrap',/Measured fit badge wrapped|Fit badge missing nowrap/]];
  const sourceFiles=['components/PageHelp.tsx','components/guidance/ToolGuidanceProvider.tsx','components/JobFeedWidget.tsx','lib/job-display.ts','lib/job-search-selection.ts'];
  const before=Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(ROOT,file)))]));
  for(const [mutation,contract,expected] of specs){
    const result={name:'actual behavior rejects '+mutation,mutation,ok:false};results.push(result);
    let context;
    try{
      const bundle=await buildFixture(path.join(outDir,'negative-bundles',mutation),fontFile,mutation);result.mutatedBundleSha256=hash(fs.readFileSync(path.join(bundle.target,'fixture.js')));
      // Dark, like the matrix: light mode's global `[data-theme="light"] aside{background-color:...!important}` repaints any <aside>, so a transparent-surface mutation could only be seen in dark.
      context=await browser.newContext({viewport:{width:320,height:900},colorScheme:'dark',serviceWorkers:'block'});await context.addInitScript(()=>{try{localStorage.setItem('talent-studio-theme','dark')}catch{}if(document.documentElement)document.documentElement.setAttribute('data-theme','dark')});
      const state={search:[contract==='salary'?'salary-adversarial':'populated'],suggestions:[contract==='badge-wrap'?'defensive-fit-1':'defensive-fit-2'],calls:{},delay:0,assetOverrides:new Map([['/__ui_verify__/fixture.js',fs.readFileSync(path.join(bundle.target,'fixture.js'))]])};
      const seen=await attachContainment(context,origin,assets,state);const page=await context.newPage();page.setDefaultTimeout(10000);
      const route=['estimate','salary'].includes(contract)?'/suite/job-search':['fit','badge-wrap'].includes(contract)?'/suite':'/suite/cover-letter';await page.goto(origin+route);await settle(page);
      let detected;
      try{
        if(['estimate','salary'].includes(contract)){
          await page.getByRole('textbox',{name:'Target role',exact:true}).fill('Sample engineering role');await page.locator('button[type="submit"]').first().click();
          await page.getByRole('heading',{name:contract==='salary'?'5 ranked roles':'4 ranked roles',exact:true}).waitFor();
          if(contract==='estimate')assert.ok(await page.getByText('GBP 35–45/hr (estimated)',{exact:true}).count(),'Predicted salary lost estimate label');
          else {await page.getByRole('combobox',{name:'Sort opportunities'}).selectOption('salary');assert.match(await page.locator('button[aria-controls="opportunity-intelligence-panel"][aria-pressed]').first().innerText(),/Sample higher annual role/,'Foreign monthly salary entered annual USD ordering')}
        }else if(contract==='badge-wrap'){const widget=page.locator('[data-ui-widget-boundary]');await widget.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();await assertWidgetBadges(page,1);
        }else if(contract==='fit'){
          const widget=page.locator('[data-ui-widget-boundary]');await widget.getByRole('heading',{name:'Top Opportunities',exact:true}).waitFor();assert.ok(await widget.getByText('Match not scored',{exact:true}).count(),'Unknown fit lost unavailable label');
        }else {
          const help=page.getByRole('button',{name:'How to use Cover letter',exact:true}).filter({visible:true});if(contract==='trigger-target'){const b=await help.boundingBox();assert.ok(b.width>=44&&b.height>=44,'Help trigger target below 44px')}await help.focus();await page.keyboard.press('Enter');await settle(page);
          const panel=page.getByRole('region',{name:'How to use Cover letter',exact:true});await panel.waitFor();const close=panel.getByRole('button',{name:'Close guidance',exact:true});
          if(contract==='escape'){await page.keyboard.press('Escape');await settle(page);assert.equal(await panel.count(),0,'Guidance Escape failed')}
          if(contract==='return-focus'){await close.click();await settle(page);assert.ok(await help.evaluate(el=>el===document.activeElement),'Close guidance did not return focus to the trigger')}
          if(contract==='target'){const b=await close.boundingBox();assert.ok(b.width>=44&&b.height>=44,'Close guidance target below 44px')}
          if(contract==='surface'){const bg=await panel.evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(bg,'rgba(0, 0, 0, 0)','Guidance surface transparent')}
          if(contract==='geometry'){const b=await panel.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=321,'Guidance oversized panel outside viewport')}
        }
      }catch(error){detected=error.message}
      assert.ok(detected,'Mutation escaped its meaningful real DOM assertion');assert.match(detected,expected,'Mutation failed for an unrelated reason, not its own assertion');result.ok=true;result.detected=detected;
      assert.equal(seen.unexpected.length,0);assert.equal(seen.failed.length,0);assert.equal(seen.errors.length,0);
    }catch(error){result.ok=false;result.error=error.message}finally{if(context)await context.close()}
  }
  assert.deepEqual(Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(ROOT,file)))])),before,'Behavior mutation changed product source');
  return {results,sourceHashesUnchanged:before,policy:'Context-only test bundle transformations; no source rewrite or shared server mutation'};
}
async function runFixtureMatrix({argv,probe,WIDTHS,THEMES,HEIGHT}) {
  const opt=(name,value)=>{const item=argv.find(a=>a.startsWith(`--${name}=`));return item?item.slice(name.length+3):value};
  const widths=opt('widths',WIDTHS.join(',')).split(',').map(Number);const themes=opt('theme',THEMES.join(',')).split(',');
  const routes=argv.filter(a=>!a.startsWith('--'));const surfaces=routes.length?routes:ROUTES;
  assert.ok(surfaces.every(route=>ROUTES.includes(route)));assert.ok(widths.every(w=>WIDTHS.includes(w)));assert.ok(themes.every(t=>THEMES.includes(t)));
  const outDir=path.resolve(ROOT,opt('out','.ui-verify/remediation/r4'));fs.mkdirSync(outDir,{recursive:true});
  const modulePath=opt('playwright-module','') || require.resolve('playwright');const playwright=require(modulePath);
  const font=opt('material-font','')?{fontFile:path.resolve(opt('material-font','')),provenance:{policy:'Caller supplied local static font; hash in asset manifest'}}:await freezeMaterialFont(outDir);
  const bundle=await buildFixture(outDir,font.fontFile);const port=Number(opt('port','4317'));const origin=`http://127.0.0.1:${port}`;
  const assets=new Set([...bundle.assetPaths.keys(),...ROUTES]);const server=await startServer(bundle,port);
  let browser;const cases=[];let negativeControls=[];
  const report={marker:MARKER,boundary:'Real route page renderers, WorkspaceFrame, JobFeedWidget and Zustand; synthetic module/data API boundary, not server authorization or live/provider certification',staticPolicy:'Exact loopback path provenance allowlist; all browser external network/API writes/unknown requests denied',font:font.provenance,bundle:{inputs:bundle.inputs,boundaryNames:bundle.boundaryNames,assetHashes:bundle.assetHashes},runtime:{node:process.version,playwrightModule:modulePath,playwrightModuleSha256:hash(fs.readFileSync(modulePath)),playwrightVersion:require(path.join(path.dirname(modulePath),'package.json')).version},cases};
  try {
    browser=await playwright.chromium.launch();report.runtime.chromiumVersion=browser.version();report.runtime.chromiumExecutable=playwright.chromium.executablePath();report.runtime.chromiumExecutableSha256=hash(fs.readFileSync(report.runtime.chromiumExecutable));
    for(const route of surfaces)for(const theme of themes)for(const width of widths){
      const context=await browser.newContext({viewport:{width,height:HEIGHT},colorScheme:theme,deviceScaleFactor:1,serviceWorkers:'block'});
      const state={search:['populated'],suggestions:route==='/suite'?['partial-initial']:['populated'],calls:{},delay:route==='/suite'?1200:0};
      const observations=await attachContainment(context,origin,assets,state);
      await context.addInitScript(t=>{try{localStorage.setItem('talent-studio-theme',t)}catch{}if(document.documentElement)document.documentElement.setAttribute('data-theme',t)},theme);
      const page=await context.newPage();page.setDefaultTimeout(10000);const testCase={route,theme,width,states:[],problems:[],requests:observations.requests};cases.push(testCase);
      async function capture(name){await settle(page);const badgeGeometry=route==='/suite'?await assertWidgetBadges(page):undefined;const r=await page.evaluate(probe);const violations=await page.evaluate(()=>window.__uiFixture?.violations||[]);const filename=`${route.slice(1).replaceAll('/','-')}__${theme}__${width}__${name}.png`;const screenshot=path.join(outDir,filename);await page.screenshot({path:screenshot,fullPage:true});const problems=problemsFor(r,width,observations);if(violations.length)problems.push({kind:'boundary',items:violations});testCase.states.push({name,screenshot,badgeGeometry,viewport:page.viewportSize(),geometry:r,problems});testCase.problems.push(...problems.map(p=>({...p,state:name})));}
      try {
        await page.goto(origin+route,{waitUntil:'load',timeout:30000});await page.waitForFunction(()=>window.__uiFixture?.marker=== 'UI_VERIFY_TEST_ONLY_COMPONENT_BOUNDARY_V1');
        if(route==='/suite/job-search')await exerciseSearch(page,state,capture,width);
        else if(route==='/suite')await exerciseWidget(page,state,capture,width);
        else {await page.getByRole('button',{name:'How to use Cover letter',exact:true}).filter({visible:true}).first().waitFor();await capture('baseline');await runShellStates(page,width,capture)}
      }catch(error){testCase.problems.push({kind:'behavior',detail:error.message});try{await capture('behavior-failure')}catch{}}
      const finalProblems=problemsFor(await page.evaluate(probe),width,observations);testCase.problems.push(...finalProblems.map(problem=>({...problem,state:'after-all-transitions'})));
      testCase.expectedResourceConsoleNotes=observations.expectedResourceConsole;testCase.authProbeNotes=observations.authProbes;testCase.intentionalFailureScenarios=observations.scenarioAborts;testCase.boundaryReads=await page.evaluate(()=>window.__uiFixture?.boundaryReads||[]).catch(()=>[]);
      console.log(`${route} ${theme} ${width}px: ${testCase.states.length} states, ${testCase.problems.length} issue(s)`);await context.close();
      fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
    }
    negativeControls=await runNegativeControls(browser,probe,origin,assets);report.supplemental=await runSupplemental(browser,origin,assets,outDir,probe);const behavior=await runBehaviorMutationControls(browser,origin,assets,outDir,font.fontFile);report.behaviorMutationPolicy=behavior;negativeControls.push(...behavior.results);report.negativeControls=negativeControls;
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));report.ok=cases.length===surfaces.length*widths.length*themes.length&&cases.every(c=>c.problems.length===0)&&negativeControls.length>0&&negativeControls.every(c=>c.ok)&&report.supplemental?.every(c=>c.problems.length===0);report.combinations=cases.length;report.stateCaptures=cases.reduce((n,c)=>n+c.states.length,0);report.completeApprovedMatrix=surfaces.length===3&&widths.length===6&&themes.length===2;fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));}
  if(!report.ok)process.exitCode=1;console.log(`Fixture report: ${path.join(outDir,'result.json')}`);return report;
}
module.exports={classifyRequest,responseScenario,validateJobsResponse,problemsFor,buildFixture,runFixtureMatrix,MARKER,JOBS,TOKEN,startServer,attachContainment,validateShellResponse};
