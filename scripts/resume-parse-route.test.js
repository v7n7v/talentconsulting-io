const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
process.env.GROQ_API_KEY = 'test-mock-key';

function load(file, mocks = {}) {
  const code = esbuild.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const local = new Module(path.join(root, 'route-test.cjs'));
  local.filename = path.join(root, 'route-test.cjs');
  local.paths = Module._nodeModulePaths(root);
  local.require = id => id in mocks ? mocks[id] : require(require.resolve(id, { paths: [root] }));
  local._compile(code, local.filename);
  return local.exports;
}

let model;
let userPrompt;
const contract = load('lib/resume-parse-contract.ts');
const route = load('app/api/resume/parse/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/ai/groq-client': { groqJSONCompletion: async (_system, prompt) => { userPrompt = prompt; return model; } },
  '@/lib/api-auth': { guardApiRoute: async () => ({ user: { uid: 'test-user' } }) },
  '@/lib/validate': { validateBody: async request => ({ success: true, data: await request.json() }) },
  '@/lib/schemas': { ResumeParseSchema: {} },
  '@/lib/monitor': { monitor: { critical() {} } },
  '@/lib/resume-parse-contract': contract,
});

const source = 'Amina Noor\nEngineer at Northstar\nSystems: Linux';
const sparse = { isResume: true, name: 'Amina Noor', title: 'Engineer', email: '', phone: '', location: '', linkedin: '', website: '', summary: '', experience: [{ company: 'Northstar', role: 'Engineer', duration: '', achievements: [] }], education: [], skills: [{ category: 'Systems', items: ['Linux'] }], certifications: [], projects: [], languages: [], awards: [], volunteering: [], publications: [], links: [], evidence: [] };
const request = () => ({ json: async () => ({ text: source }) });

test('real parse handler rejects malformed model output', async () => {
  for (const invalid of [{}, null, 'false']) {
    model = invalid;
    const response = await route.POST(request());
    assert.equal(response.status, 422);
    assert.match(response.body.code, /RESUME_PARSE_FAILED/);
    assert.equal(response.body.rawText, source);
  }
});

test('real parse handler rejects empty source before provider call', async () => {
  model = sparse;
  const response = await route.POST({ json: async () => ({ text: '   ' }) });
  assert.equal(response.status, 422);
  assert.equal(response.body.code, 'EMPTY_SOURCE');
});

test('real parse handler preserves source and accepts sparse valid output', async () => {
  model = sparse;
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.body.rawText, source);
  assert.equal(response.body.resume.skills[0].items[0], 'Linux');
  assert.match(userPrompt, /Operating|Amina Noor/);
});

test('real parse handler returns review response for invented metric', async () => {
  model = { ...sparse, experience: [{ ...sparse.experience[0], achievements: ['Saved $9 million'] }] };
  const response = await route.POST(request());
  assert.equal(response.status, 422);
  assert.equal(response.body.requiresReview, true);
  assert.ok(response.body.warnings.some(warning => warning.field.includes('achievements')));
});
