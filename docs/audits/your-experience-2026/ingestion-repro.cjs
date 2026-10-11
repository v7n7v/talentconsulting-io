// Audit reproduction, not an acceptance test: executes the real route with local mocks.
// Input validation/auth/provider boundaries are mocked; no network or account calls.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const esbuild = require('esbuild');

function load(file, mocks = {}) {
  const code = esbuild.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    loader: 'ts', format: 'cjs',
  }).code;
  const localModule = new Module(path.join(root, 'audit.cjs'));
  localModule.filename = path.join(root, 'audit.cjs');
  localModule.paths = Module._nodeModulePaths(root);
  localModule.require = id => id in mocks
    ? mocks[id]
    : require(require.resolve(id, { paths: [root] }));
  localModule._compile(code, localModule.filename);
  return localModule.exports;
}

const sanitize = load('lib/sanitize.ts');
let output;
let prompt;
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/ai/groq-client': { groqJSONCompletion: async (_system, value) => { prompt = value; return output; } },
  '@/lib/api-auth': { guardApiRoute: async () => ({ user: { uid: 'audit' } }) },
  '@/lib/validate': { validateBody: async request => ({ success: true, data: await request.json() }) },
  '@/lib/schemas': { ResumeParseSchema: {} },
  '@/lib/sanitize': sanitize,
  '@/lib/monitor': { monitor: { critical() {} } },
};
process.env.GROQ_API_KEY = 'audit-mock-no-network';
const route = load('app/api/resume/parse/route.ts', mocks);

(async () => {
  for (const model of [
    {},
    { isResume: 'false', name: 'Invented Person' },
    { isResume: true, name: 'Amina', experience: [{ company: 'Invented', role: 'CEO', achievements: ['Saved $9 million'] }] },
  ]) {
    output = model;
    const response = await route.POST({ json: async () => ({ text: 'Amina\nOperating system: Linux\nEngineer at Northstar.' }) });
    console.log(JSON.stringify({ model, response, prompt }));
  }
  console.log(JSON.stringify({
    sanitizeInput: 'Operating system: Linux',
    sanitizeOutput: sanitize.sanitizeForAI('Operating system: Linux'),
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
