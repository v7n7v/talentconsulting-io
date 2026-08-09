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

// The route's real collaborators for provider selection/synthesis stay real
// (persona-voices + supertonic-tts); only auth, billing, validation and the
// Next shims are mocked, so a test controls the branch via env + global.fetch.
async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-voice-speak-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/voice/speak/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'voice-speak-route-mocks',
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
            export async function guardApiRoute() {
              globalThis.__voiceSpeakMocks.guardCalls += 1;
              return globalThis.__voiceSpeakMocks.guard;
            }
          `],
          ['@/lib/usage-tracker', `
            export async function checkVoiceAllowed() {
              globalThis.__voiceSpeakMocks.checkCalls += 1;
              return globalThis.__voiceSpeakMocks.voiceCheck;
            }
            export async function recordVoiceUsage(uid, seconds) {
              globalThis.__voiceSpeakMocks.recorded.push({ uid, seconds });
            }
            export function estimateTTSSeconds() {
              return globalThis.__voiceSpeakMocks.estimatedSeconds;
            }
          `],
          ['@/lib/validate', `
            export async function validateBody() {
              return globalThis.__voiceSpeakMocks.validated;
            }
          `],
          ['@/lib/schemas', `export const VoiceSpeakSchema = {};`],
          ['@/lib/monitor', `
            export const monitor = { critical() { globalThis.__voiceSpeakMocks.criticalCalls += 1; } };
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

const ENV_KEYS = ['TTS_BASE_URL', 'TTS_API_KEY', 'OPENROUTER_API_KEY'];

function reset(overrides = {}) {
  globalThis.__voiceSpeakMocks = {
    guardCalls: 0,
    checkCalls: 0,
    criticalCalls: 0,
    recorded: [],
    estimatedSeconds: 5,
    guard: { error: null, user: { uid: 'user-1', tier: 'pro' } },
    voiceCheck: { allowed: true, capSeconds: 3600, usedSeconds: 60, remainingSeconds: 3540 },
    validated: { success: true, data: { text: 'Tell me about yourself.', voiceId: 'faang-lead' } },
    ...overrides,
  };
}

function setEnv(values) {
  for (const k of ENV_KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

function mp3(bytes = [0x49, 0x44, 0x33, 0x04]) {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
}

function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve(fn()).finally(() => { global.fetch = original; });
}

test.afterEach(() => setEnv({}));

test('SuperTonic branch: TTS_BASE_URL set -> synthesizes via VPS /speak, records usage, audio/mpeg + X-Voice headers', async () => {
  const route = await routeModulePromise;
  reset();
  setEnv({ TTS_BASE_URL: 'https://tts.example.com', TTS_API_KEY: 'tok' });

  const calls = [];
  await withFetch(async (url, init) => { calls.push({ url, init }); return mp3([1, 2, 3]); }, async () => {
    const res = await route.POST({});

    // Went to the VPS, not OpenRouter, with the token header.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://tts.example.com/speak');
    assert.equal(calls[0].init.headers['X-TTS-Token'], 'tok');
    // persona.id 'faang-lead' -> sid 0.
    assert.equal(JSON.parse(calls[0].init.body).sid, 0);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.equal(res.headers.get('X-Voice-Used-Seconds'), '65');
    assert.equal(res.headers.get('X-Voice-Remaining-Seconds'), '3535');
    assert.equal(res.headers.get('X-Voice-Cap-Minutes'), '60');
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes], [1, 2, 3]);

    // Billing recorded exactly once, only after success.
    assert.deepEqual(globalThis.__voiceSpeakMocks.recorded, [{ uid: 'user-1', seconds: 5 }]);
  });
});

test('OpenRouter fallback branch: no TTS_BASE_URL -> uses OpenRouter, records usage', async () => {
  const route = await routeModulePromise;
  reset();
  setEnv({ OPENROUTER_API_KEY: 'or-key' });

  const calls = [];
  await withFetch(async (url, init) => { calls.push({ url, init }); return mp3([9, 9]); }, async () => {
    const res = await route.POST({});

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/tts');
    assert.equal(calls[0].init.headers['Authorization'], 'Bearer or-key');

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual(globalThis.__voiceSpeakMocks.recorded, [{ uid: 'user-1', seconds: 5 }]);
  });
});

test('no provider configured -> 500 and no usage recorded', async () => {
  const route = await routeModulePromise;
  reset();
  setEnv({});

  let fetched = false;
  await withFetch(async () => { fetched = true; return mp3(); }, async () => {
    const res = await route.POST({});
    assert.equal(res.status, 500);
    assert.equal(fetched, false);
    assert.equal(globalThis.__voiceSpeakMocks.recorded.length, 0);
  });
});

test('voice cap reached -> 403, never synthesizes, never records usage', async () => {
  const route = await routeModulePromise;
  reset({ voiceCheck: { allowed: false, capSeconds: 600, usedSeconds: 600, remainingSeconds: 0 } });
  setEnv({ TTS_BASE_URL: 'https://tts.example.com', TTS_API_KEY: 'tok' });

  let fetched = false;
  await withFetch(async () => { fetched = true; return mp3(); }, async () => {
    const res = await route.POST({});
    assert.equal(res.status, 403);
    assert.equal(fetched, false);
    assert.equal(globalThis.__voiceSpeakMocks.recorded.length, 0);
  });
});

test('SuperTonic transport failure (non-200) -> 500 and usage NOT recorded (no double-count / no upgrade nag)', async () => {
  const route = await routeModulePromise;
  reset();
  setEnv({ TTS_BASE_URL: 'https://tts.example.com', TTS_API_KEY: 'tok' });

  await withFetch(async () => new Response('boom', { status: 502 }), async () => {
    const res = await route.POST({});
    assert.equal(res.status, 500);
    const payload = await res.json();
    // Generic synthesis failure — not an upgrade prompt.
    assert.equal(payload.upgrade, undefined);
    assert.equal(globalThis.__voiceSpeakMocks.recorded.length, 0);
  });
});

test('estimated seconds exceed remaining -> 403 before synthesis', async () => {
  const route = await routeModulePromise;
  reset({
    estimatedSeconds: 100,
    voiceCheck: { allowed: true, capSeconds: 600, usedSeconds: 570, remainingSeconds: 30 },
  });
  setEnv({ TTS_BASE_URL: 'https://tts.example.com', TTS_API_KEY: 'tok' });

  let fetched = false;
  await withFetch(async () => { fetched = true; return mp3(); }, async () => {
    const res = await route.POST({});
    assert.equal(res.status, 403);
    assert.equal(fetched, false);
    assert.equal(globalThis.__voiceSpeakMocks.recorded.length, 0);
  });
});
