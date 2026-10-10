const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.join(__dirname, '..');
async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-local-resume-import-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(root, 'app/api/workspace-preview/resume-import/route.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: [{ name: 'route-stubs', setup(api) {
      api.onResolve({ filter: /^@\/lib\/workspace-preview$/ }, () => ({ path: 'workspace-preview', namespace: 'stub' }));
      api.onResolve({ filter: /^@\/lib\/resume-binary-parser-worker$/ }, () => ({ path: 'worker', namespace: 'stub' }));
      api.onLoad({ filter: /^workspace-preview$/, namespace: 'stub' }, () => ({ contents: "exports.isIsolatedWorkspacePreview = () => process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW === 'true' && process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE === 'true';", loader: 'js' }));
      api.onLoad({ filter: /^worker$/, namespace: 'stub' }, () => ({ contents: 'exports.parseResumeBinaryInWorker = async ({ buffer, type }) => ({ text: buffer.toString().includes("placeholder") && type === "pdf" ? "" : `Worker supplied ${type} text\\nExperience\\nDid not invent 42%`, truncated: false });', loader: 'js' }));
    } }],
  });
  return require(outfile);
}

function request(route, { host = '127.0.0.1', body, contentType = 'application/json', length = 100 } = {}) {
  return route.POST({
    nextUrl: { hostname: host },
    headers: { get: (name) => name === 'content-length' ? String(length) : contentType },
    json: async () => body,
    formData: async () => body,
  });
}

test('resumeTextDraft keeps source lines, negation, numbers, and safely handles sparse text', async () => {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-text-draft-'));
  const outfile = path.join(outdir, 'draft.cjs');
  await build({ entryPoints: [path.join(root, 'lib/resume-text-draft.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { resumeTextDraft } = require(outfile);
  const source = 'Maya Chen\nProduct Designer\nSummary\nDid not increase churn by 42%.\nProjects\nBuilt a scheduling tool — 3x faster';
  const draft = resumeTextDraft(source);
  assert.equal(draft.name, 'Maya Chen');
  assert.equal(draft.email, '');
  assert.ok(draft.additionalSections.flatMap((section) => section.items).some((item) => item.includes('Did not increase churn by 42%.')));
  assert.ok(draft.additionalSections.flatMap((section) => section.items).some((item) => item.includes('3x faster')));
  assert.deepEqual(resumeTextDraft('').experience, []);
  assert.deepEqual(resumeTextDraft('just words').education, []);
});

test('route rejects non-loopback and production requests', async () => {
  process.env.NODE_ENV = 'development'; process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW = 'true'; process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE = 'true';
  const route = await loadRoute();
  assert.equal((await request(route, { host: '192.168.1.20' })).status, 404);
  process.env.NODE_ENV = 'production';
  assert.equal((await request(route)).status, 404);
  process.env.NODE_ENV = 'development';
});

test('local text JSON extracts the supplied person and preserves explicit fallback warning', async () => {
  const route = await loadRoute();
  const response = await request(route, { body: { text: 'Jordan Lee\nSummary\nDid not claim 17 wins.\nProjects\nBuilt a public library tool.' }, length: 90 });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.resume.name, 'Jordan Lee');
  assert.match(payload.rawText, /Jordan Lee/);
  assert.match(payload.rawText, /Did not claim 17 wins/);
  assert.ok(payload.warnings.some((warning) => /AI field extraction is disabled/i.test(warning)));
  assert.doesNotMatch(payload.rawText, /Amina|demo/i);
});

test('local import enforces text limits, NUL/scanned failures, and worker output boundary', async () => {
  const route = await loadRoute();
  assert.equal((await request(route, { body: { text: 'too short' }, length: 9 })).status, 422);
  assert.equal((await request(route, { body: { text: 'x'.repeat(50_001) }, length: 50_001 })).status, 422);
  const file = new File([Buffer.from('placeholder')], 'scan.pdf', { type: 'application/pdf' });
  const form = new FormData(); form.set('file', file);
  const scanned = await request(route, { body: form, contentType: 'multipart/form-data', length: file.size });
  assert.equal(scanned.status, 422);
  const docx = new File([Buffer.from('placeholder')], 'resume.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const docxForm = new FormData(); docxForm.set('file', docx);
  const parsed = await request(route, { body: docxForm, contentType: 'multipart/form-data', length: docx.size });
  assert.equal(parsed.status, 200);
  const payload = await parsed.json();
  assert.match(payload.text, /Worker supplied docx text/);
  assert.match(payload.text, /Did not invent 42%/);
});
