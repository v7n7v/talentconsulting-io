const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

function resolveRootImport(importPath) {
  const base = path.join(repoRoot, importPath.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate)) || base;
}

// interview-prompt stays real; only auth, TTS-config and the Next shim are
// mocked. The point of these tests is the SESSION GATE contract: it uses the
// shared `gauntlets` cap and returns the guard's own upgrade body unchanged.
async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-interview-session-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/interview/session/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'interview-session-route-mocks',
      setup(buildApi) {
        const modules = new Map([
          ['next/server', `
            export class NextRequest {}
            export class NextResponse extends Response {
              static json(body, init) {
                const headers = new Headers(init && init.headers);
                if (!headers.has('content-type')) headers.set('content-type', 'application/json');
                return new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers });
              }
            }
          `],
          ['@/lib/api-auth', `
            export async function guardApiRoute(req, options) {
              globalThis.__sessionMocks.guardCalls.push(options || {});
              return globalThis.__sessionMocks.guard;
            }
          `],
          ['@/lib/ai/supertonic-tts', `
            export function isSuperTonicConfigured() { return globalThis.__sessionMocks.ttsConfigured; }
          `],
        ]);
        for (const [specifier, contents] of modules) {
          const key = specifier.replace(/[^a-z0-9]/gi, '-');
          buildApi.onResolve({ filter: new RegExp('^' + specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, () => ({ path: key, namespace: 'mock' }));
          buildApi.onLoad({ filter: new RegExp('^' + key + '$'), namespace: 'mock' }, () => ({ contents, loader: 'js' }));
        }
        buildApi.onResolve({ filter: /^@\// }, args => ({ path: resolveRootImport(args.path) }));
      },
    }],
  });
  return require(outfile);
}

const routeModulePromise = loadRoute();

function reset(overrides = {}) {
  globalThis.__sessionMocks = {
    guardCalls: [],
    guard: { error: null, user: { uid: 'user-1', tier: 'pro' } },
    ttsConfigured: true,
    ...overrides,
  };
}

function makeReq(body) {
  return { json: async () => body, url: 'https://x/api/interview/session', headers: new Headers() };
}

test('authorized: gated on the shared gauntlets cap, returns ok + resolved persona name', async () => {
  const route = await routeModulePromise;
  reset();
  const res = await route.POST(makeReq({ persona: 'faang-lead' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.persona, 'faang-lead');
  assert.equal(body.personaName, 'FAANG Tech Lead');
  assert.equal(body.ttsAvailable, true);
  // The session is the gauntlets gate — exactly like the retired live-token.
  assert.equal(globalThis.__sessionMocks.guardCalls[0].feature, 'gauntlets');
  assert.equal(globalThis.__sessionMocks.guardCalls[0].allowAnonymous, false);
});

test('cap/tier rejection: guard upgrade body passes through unchanged (errorUpgradeUrl contract)', async () => {
  const route = await routeModulePromise;
  const capBody = { error: 'You used your free interview practice runs', limitReached: true, upgradeUrl: '/suite/upgrade' };
  const rejection = new Response(JSON.stringify(capBody), { status: 429, headers: { 'content-type': 'application/json' } });
  reset({ guard: { error: rejection } });
  const res = await route.POST(makeReq({ persona: 'friendly-hr' }));
  assert.equal(res.status, 429);
  const body = await res.json();
  // The client reads limitReached/upgradeUrl to build errorUpgradeUrl — must survive.
  assert.equal(body.limitReached, true);
  assert.equal(body.upgradeUrl, '/suite/upgrade');
});

test('ttsAvailable reflects configuration (text-only fallback is reported honestly)', async () => {
  const route = await routeModulePromise;
  reset({ ttsConfigured: false });
  const res = await route.POST(makeReq({ persona: 'startup-cto' }));
  const body = await res.json();
  assert.equal(body.ttsAvailable, false);
});
