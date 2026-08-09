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

// Real collaborators kept real: interview-prompt (persona resolution) and
// persona-voices (id -> sid). Mocked: auth, LLM, TTS, monitor, and the Next
// shims. STT is driven through global.fetch (Deepgram). This lets a test steer
// each stage independently: STT ok/empty/fail, LLM ok/fail, TTS ok/fail/absent.
async function loadRoute() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-interview-turn-route-'));
  const outfile = path.join(outdir, 'route.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'app/api/interview/turn/route.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'interview-turn-route-mocks',
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
              globalThis.__turnMocks.guardCalls.push(options || {});
              return globalThis.__turnMocks.guard;
            }
          `],
          ['@/lib/ai/groq-client', `
            export async function groqChat(messages, options) {
              globalThis.__turnMocks.groqCalls.push({ messages, options });
              if (globalThis.__turnMocks.groqThrows) throw new Error('groq boom');
              return globalThis.__turnMocks.aiText;
            }
          `],
          ['@/lib/ai/supertonic-tts', `
            export class SuperTonicError extends Error {
              constructor(kind, message, status) { super(message); this.name='SuperTonicError'; this.kind=kind; this.status=status; }
            }
            export function isSuperTonicConfigured() { return globalThis.__turnMocks.ttsConfigured; }
            export async function synthesize(params) {
              globalThis.__turnMocks.synthCalls.push(params);
              if (globalThis.__turnMocks.ttsThrows) throw new SuperTonicError('non-200', 'tts boom', 502);
              return { audio: Buffer.from([1,2,3]), headers: { 'content-type': 'audio/mpeg' } };
            }
          `],
          ['@/lib/monitor', `export const monitor = { critical() {} };`],
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
  globalThis.__turnMocks = {
    guardCalls: [],
    groqCalls: [],
    synthCalls: [],
    guard: { error: null, user: { uid: 'user-1', tier: 'pro' } },
    aiText: 'Welcome. Tell me about yourself?',
    groqThrows: false,
    ttsConfigured: true,
    ttsThrows: false,
    ...overrides,
  };
}

function makeReq(fields, audioBytes) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (audioBytes) fd.append('audio', new Blob([new Uint8Array(audioBytes)], { type: 'audio/wav' }), 'turn.wav');
  return { formData: async () => fd, url: 'https://x/api/interview/turn', headers: new Headers() };
}

function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return Promise.resolve(fn()).finally(() => { global.fetch = original; });
}

const ENV = ['DEEPGRAM_API_KEY'];
test.beforeEach(() => { process.env.DEEPGRAM_API_KEY = 'dg-key'; });
test.afterEach(() => { for (const k of ENV) delete process.env[k]; });

test('kickoff: no STT, LLM produces the opener, TTS segments returned', async () => {
  const route = await routeModulePromise;
  reset();
  let deepgramHit = false;
  await withFetch(async () => { deepgramHit = true; return new Response('{}', { status: 200 }); }, async () => {
    const res = await route.POST(makeReq({ kickoff: 'true', persona: 'faang-lead', history: '[]' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(deepgramHit, false, 'kickoff must not call STT');
    assert.equal(body.userText, '');
    assert.equal(body.aiText, 'Welcome. Tell me about yourself?');
    assert.ok(Array.isArray(body.segments) && body.segments.length >= 1);
    // persona.id 'faang-lead' -> sid 0
    assert.equal(globalThis.__turnMocks.synthCalls[0].voiceSid, 0);
  });
});

test('normal turn: Deepgram STT -> userText -> LLM -> TTS', async () => {
  const route = await routeModulePromise;
  reset();
  const dgBody = JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: 'I built a payments system.' }] }] } });
  await withFetch(async (url) => {
    assert.match(String(url), /api\.deepgram\.com/);
    return new Response(dgBody, { status: 200, headers: { 'content-type': 'application/json' } });
  }, async () => {
    const res = await route.POST(makeReq({ persona: 'friendly-hr', history: '[]' }, [0x52, 0x49, 0x46, 0x46]));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.userText, 'I built a payments system.');
    assert.equal(body.aiText, 'Welcome. Tell me about yourself?');
    // friendly-hr -> sid 3
    assert.equal(globalThis.__turnMocks.synthCalls[0].voiceSid, 3);
    // The user's transcribed turn is fed to the LLM.
    const lastMsg = globalThis.__turnMocks.groqCalls[0].messages.slice(-1)[0];
    assert.equal(lastMsg.content, 'I built a payments system.');
  });
});

test('STT returns no speech -> noSpeech:true, LLM and TTS never called', async () => {
  const route = await routeModulePromise;
  reset();
  const dgBody = JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: '   ' }] }] } });
  await withFetch(async () => new Response(dgBody, { status: 200 }), async () => {
    const res = await route.POST(makeReq({ history: '[]' }, [1, 2]));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.noSpeech, true);
    assert.equal(globalThis.__turnMocks.groqCalls.length, 0);
    assert.equal(globalThis.__turnMocks.synthCalls.length, 0);
  });
});

test('STT transport fault -> 502, no upgrade nag', async () => {
  const route = await routeModulePromise;
  reset();
  await withFetch(async () => new Response('nope', { status: 500 }), async () => {
    const res = await route.POST(makeReq({ history: '[]' }, [1, 2]));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.upgrade, undefined);
    assert.equal(body.upgradeUrl, undefined);
    assert.equal(body.limitReached, undefined);
    assert.equal(globalThis.__turnMocks.groqCalls.length, 0);
  });
});

test('LLM fault -> 502, no TTS, no upgrade nag', async () => {
  const route = await routeModulePromise;
  reset({ groqThrows: true });
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    const res = await route.POST(makeReq({ kickoff: 'true', history: '[]' }));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.upgrade, undefined);
    assert.equal(globalThis.__turnMocks.synthCalls.length, 0);
  });
});

test('TTS fault -> turn still succeeds with transcript, ttsFailed flag, no upgrade nag', async () => {
  const route = await routeModulePromise;
  reset({ ttsThrows: true });
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    const res = await route.POST(makeReq({ kickoff: 'true', history: '[]' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.aiText, 'Welcome. Tell me about yourself?');
    assert.deepEqual(body.segments, []);
    assert.equal(body.ttsFailed, true);
    assert.equal(body.upgrade, undefined);
  });
});

test('TTS not configured -> transcript only, segments empty, ttsAvailable false', async () => {
  const route = await routeModulePromise;
  reset({ ttsConfigured: false });
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    const res = await route.POST(makeReq({ kickoff: 'true', history: '[]' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ttsAvailable, false);
    assert.deepEqual(body.segments, []);
    assert.equal(body.ttsFailed, undefined);
    assert.equal(globalThis.__turnMocks.synthCalls.length, 0);
  });
});

test('turn endpoint is auth+rate gated only — NOT gauntlet-gated (no per-turn cap decrement)', async () => {
  const route = await routeModulePromise;
  reset();
  await withFetch(async () => new Response('{}', { status: 200 }), async () => {
    await route.POST(makeReq({ kickoff: 'true', history: '[]' }));
    assert.equal(globalThis.__turnMocks.guardCalls.length, 1);
    // No `feature` option => the shared gauntlets/voice caps are not touched per turn.
    assert.equal(globalThis.__turnMocks.guardCalls[0].feature, undefined);
    assert.equal(typeof globalThis.__turnMocks.guardCalls[0].rateLimit, 'number');
  });
});

test('guard rejection passes straight through (auth/rate failures short-circuit)', async () => {
  const route = await routeModulePromise;
  const rejection = new Response(JSON.stringify({ error: 'Rate limit reached.' }), { status: 429 });
  reset({ guard: { error: rejection } });
  let fetched = false;
  await withFetch(async () => { fetched = true; return new Response('{}', { status: 200 }); }, async () => {
    const res = await route.POST(makeReq({ kickoff: 'true', history: '[]' }));
    assert.equal(res.status, 429);
    assert.equal(fetched, false);
    assert.equal(globalThis.__turnMocks.groqCalls.length, 0);
  });
});
