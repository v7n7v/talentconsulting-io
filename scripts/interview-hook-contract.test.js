'use strict';

/**
 * Hook-level contract test for the turn-based interview client.
 *
 * Why this file exists: `hooks/useTurnBasedInterview.ts` is the drop-in
 * replacement for the retired Gemini-live hook and carries the session's most
 * delicate client invariants — the barge-in audio accumulation (#12) and the
 * sentence-by-sentence transcript commit that a flush must truncate (#10).
 * Round 1 shipped those fixes with ZERO automated coverage: a mutation that
 * reverted the barge seed to a single frame left the whole voice suite green.
 * This test guards them, and pins the public surface parity against the old
 * hook so the "one-line import swap" claim stays true.
 *
 * Approach: the hook is ref-centric — every piece of mutable state lives in a
 * useRef cell, not in captured render values — so we can drive it with a tiny
 * deterministic hooks dispatcher supplied in place of `react` (via esbuild),
 * plus a fake Web Audio / mic layer. No DOM, no jsdom, no react renderer.
 */

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

// A minimal, synchronous hooks dispatcher standing in for `react`. It supports
// exactly the four hooks the interview hooks use. Everything hangs off
// globalThis so the test (outside the bundle) can render and re-render. setState
// re-runs the hook body synchronously — safe here because neither hook calls
// setState during render, only from async callbacks.
const REACT_SHIM = `
  const g = globalThis;
  function shim() {
    if (!g.__shim) g.__shim = { cells: [], cursor: 0, renderFn: null, result: null, mountedEffects: [] };
    return g.__shim;
  }
  g.__resetShim = function () { g.__shim = { cells: [], cursor: 0, renderFn: null, result: null, mountedEffects: [] }; };
  function doRender() {
    const s = shim();
    s.cursor = 0;
    s.result = s.renderFn();
  }
  g.__renderHook = function (fn) {
    const s = shim();
    s.renderFn = fn;
    doRender();
    // Run mount effects once, after first render.
    for (const cell of s.cells) {
      if (cell && cell.type === 'effect' && !cell.ran) {
        cell.ran = true;
        cell.cleanup = typeof cell.pending === 'function' ? cell.pending() : null;
      }
    }
    return s.result;
  };
  g.__result = function () { return shim().result; };
  export function useState(init) {
    const s = shim();
    const i = s.cursor++;
    if (s.cells[i] === undefined) s.cells[i] = { type: 'state', value: typeof init === 'function' ? init() : init };
    const cell = s.cells[i];
    const setter = (next) => {
      const v = typeof next === 'function' ? next(cell.value) : next;
      if (Object.is(v, cell.value)) return;
      cell.value = v;
      doRender(); // synchronous re-render; refs persist, closures re-read them
    };
    return [cell.value, setter];
  }
  export function useRef(init) {
    const s = shim();
    const i = s.cursor++;
    if (s.cells[i] === undefined) s.cells[i] = { type: 'ref', current: init };
    return s.cells[i];
  }
  export function useCallback(fn) { return fn; }
  export function useMemo(fn) { return fn(); }
  export function useEffect(fn) {
    const s = shim();
    const i = s.cursor++;
    if (s.cells[i] === undefined) s.cells[i] = { type: 'effect', pending: fn, ran: false, cleanup: null };
    return undefined;
  }
  export default { useState, useRef, useCallback, useMemo, useEffect };
`;

async function loadHooks() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-interview-hook-'));
  const outfile = path.join(outdir, 'hooks.cjs');
  await build({
    stdin: {
      contents: `
        export { useTurnBasedInterview } from '@/hooks/useTurnBasedInterview';
      `,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
    plugins: [{
      name: 'interview-hook-mocks',
      setup(buildApi) {
        const modules = new Map([
          ['react', REACT_SHIM],
          ['@/lib/auth-fetch', `
            export async function authFetch(url, init) {
              globalThis.__authFetchCalls.push({ url, init });
              const next = globalThis.__authFetchQueue.shift();
              if (typeof next === 'function') return next(url, init);
              return next;
            }
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

const hooksPromise = loadHooks();

// ── Fake browser audio layer ───────────────────────────────────────────────

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function installAudioMocks() {
  globalThis.__micScriptNode = null;
  globalThis.__segDuration = 5; // seconds per TTS segment buffer

  class FakeAudioContext {
    constructor(opts) {
      this.isMic = !!(opts && opts.sampleRate);
      this.state = 'running';
      this.currentTime = 0;
      this.destination = { __dest: true };
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const node = { onaudioprocess: null, connect() {}, disconnect() {} };
      globalThis.__micScriptNode = node;
      return node;
    }
    createAnalyser() {
      return { fftSize: 512, connect() {}, getFloatTimeDomainData(buf) { buf.fill(0); } };
    }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    async decodeAudioData() { return { duration: globalThis.__segDuration }; }
    async resume() {}
    async close() { this.state = 'closed'; }
  }
  globalThis.AudioContext = FakeAudioContext;

  const fakeStream = { getTracks: () => [{ stop() {} }] };
  const nav = { mediaDevices: { getUserMedia: async () => fakeStream } };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(pred, label, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await delay(5);
  }
  throw new Error(`waitFor timed out: ${label}`);
}

// A ~128 ms mic frame (2048 samples @ 16 kHz). amplitude 0 = silence; a loud
// frame clears both SPEECH_LEVEL and BARGE_LEVEL after normalizeFloatRms gain.
function frame(amplitude) {
  const f = new Float32Array(2048);
  f.fill(amplitude);
  return f;
}
function feedFrame(f) {
  const node = globalThis.__micScriptNode;
  assert.ok(node && typeof node.onaudioprocess === 'function', 'mic script node not wired');
  node.onaudioprocess({ inputBuffer: { getChannelData: () => f } });
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('interface parity: the turn-based hook exposes the identical public surface as the retired Gemini-live hook', async () => {
  const hooks = await hooksPromise;
  installAudioMocks();

  globalThis.__authFetchCalls = [];
  globalThis.__authFetchQueue = [];
  globalThis.__resetShim();
  const turnBased = globalThis.__renderHook(() => hooks.useTurnBasedInterview());

  // The retired Gemini-live hook (hooks/useGeminiLiveAvatar.ts) was deleted in
  // Phase 3. Its public surface is frozen here as the contract the turn-based hook
  // must match EXACTLY, so app/suite/interview-sim/page.tsx still swaps with a
  // one-line import change. (Was: a live deepEqual against the old hook.)
  const surface = (o) => Object.keys(o).sort();
  const RETIRED_HOOK_SURFACE = [
    'connect', 'disconnect', 'getTranscript', 'sendText', 'setOnAudioChunk', 'setOnTurnComplete',
    'isConnected', 'isConnecting', 'isListening', 'isSpeaking',
    'error', 'errorUpgradeUrl', 'fullTranscript', 'userTranscript', 'aiTranscript',
    'elapsedSeconds', 'questionCount', 'inputLevel', 'outputLevel',
  ].sort();
  assert.deepEqual(surface(turnBased), RETIRED_HOOK_SURFACE,
    'the hook must expose exactly the retired Gemini-live surface so page.tsx swaps with a one-line import change');

  // The exact members app/suite/interview-sim/page.tsx (and LiveRoom) consume.
  const consumed = [
    'connect', 'disconnect', 'getTranscript', 'sendText', 'setOnAudioChunk', 'setOnTurnComplete',
    'isConnected', 'isConnecting', 'isListening', 'isSpeaking',
    'error', 'errorUpgradeUrl', 'fullTranscript', 'elapsedSeconds', 'questionCount',
  ];
  for (const key of consumed) {
    assert.ok(key in turnBased, `missing public member: ${key}`);
  }
  for (const method of ['connect', 'disconnect', 'getTranscript', 'sendText', 'setOnAudioChunk', 'setOnTurnComplete']) {
    assert.equal(typeof turnBased[method], 'function', `${method} must be callable`);
  }
  assert.deepEqual(turnBased.fullTranscript, []);
  assert.equal(turnBased.questionCount, 0);
  assert.equal(turnBased.error, null);
});

test('barge-in (#12): the audio that TRIGGERED the interruption is captured and sent to STT, not a single post-trigger frame', async () => {
  const hooks = await hooksPromise;
  installAudioMocks();
  globalThis.__segDuration = 1; // keep the interviewer "speaking" while we barge

  globalThis.__authFetchCalls = [];
  const seg = { audio: 'AAAA', text: 'Tell me about a hard bug.' };
  globalThis.__authFetchQueue = [
    () => jsonResponse({}),                                            // session
    () => jsonResponse({ aiText: seg.text, segments: [seg] }),         // kickoff turn
    () => jsonResponse({ noSpeech: true }),                            // barge-driven turn (audio inspected below)
  ];
  globalThis.__resetShim();
  const api = () => globalThis.__result();
  globalThis.__renderHook(() => hooks.useTurnBasedInterview());

  await api().connect({ persona: 'friendly-hr', jobDescription: '', interviewStyle: 'behavioral' });
  try {
    await waitFor(() => api().isSpeaking, 'interviewer speaking');

    // Barge in: sustained loud speech during playback. BARGE_MIN_MS=350, frame≈128ms
    // → 4 loud frames trigger. Every loud frame must be retained.
    const LOUD = 0.3;
    for (let i = 0; i < 4; i++) feedFrame(frame(LOUD));
    await waitFor(() => api().isListening && !api().isSpeaking, 'barge flipped to listening');

    // End the (barged) user turn with trailing silence: END_SILENCE_MS=900 → 8 frames.
    for (let i = 0; i < 8; i++) feedFrame(frame(0));
    await waitFor(() => globalThis.__authFetchCalls.some(c => String(c.url).includes('/api/interview/turn') && c.init && c.init.body instanceof FormData && c.init.body.get('audio')),
      'barged turn posted audio');

    const turnCalls = globalThis.__authFetchCalls.filter(c => String(c.url).includes('/api/interview/turn'));
    const bargedTurn = turnCalls[turnCalls.length - 1];
    const wav = bargedTurn.init.body.get('audio');
    const buf = Buffer.from(await wav.arrayBuffer());

    // Decode the 16-bit PCM body and count how many ~2048-sample frames are LOUD.
    // Accumulation keeps all 4 onset frames; the old single-frame seed would keep 1.
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let loudSamples = 0;
    for (let pos = 44; pos + 1 < buf.byteLength; pos += 2) {
      if (Math.abs(view.getInt16(pos, true)) > 1000) loudSamples++;
    }
    const loudFrames = Math.round(loudSamples / 2048);
    assert.ok(loudFrames >= 3,
      `expected the barge onset (>=3 loud frames) to reach STT, got ${loudFrames} — the single-frame seed regressed`);
  } finally {
    api().disconnect(); // always clear the 1 s elapsed interval, even on assertion failure
  }
});

test('transcript fidelity (#10): a flush commits only the sentences already heard and drops the un-heard tail', async () => {
  const hooks = await hooksPromise;
  installAudioMocks();
  globalThis.__segDuration = 1; // both sentences scheduled; second starts far in the future

  globalThis.__authFetchCalls = [];
  const heard = { audio: 'AAAA', text: 'First sentence.' };
  const unheard = { audio: 'AAAA', text: 'Second question?' };
  globalThis.__authFetchQueue = [
    () => jsonResponse({}),                                                       // session
    () => jsonResponse({ aiText: `${heard.text} ${unheard.text}`, segments: [heard, unheard] }), // kickoff
    () => jsonResponse({ noSpeech: true }),                                        // barge turn
  ];
  globalThis.__resetShim();
  const api = () => globalThis.__result();
  globalThis.__renderHook(() => hooks.useTurnBasedInterview());

  await api().connect({ persona: 'friendly-hr', jobDescription: '', interviewStyle: 'behavioral' });
  try {
    await waitFor(() => api().isSpeaking, 'interviewer speaking');

    // Segment 1 commits at playback start (delay 0). Segment 2 is scheduled ~1 s out.
    await waitFor(() => api().fullTranscript.some(t => t.role === 'ai' && t.text.includes('First sentence')),
      'first sentence committed as it begins to sound');

    // Barge before the second sentence is ever heard → flushPlayback → clearAppendTimers.
    const LOUD = 0.3;
    for (let i = 0; i < 4; i++) feedFrame(frame(LOUD));
    await waitFor(() => api().isListening && !api().isSpeaking, 'barge flipped to listening');
    await delay(30); // give any (wrongly) pending commit a chance to fire

    const aiText = api().fullTranscript.filter(t => t.role === 'ai').map(t => t.text).join(' ');
    assert.ok(aiText.includes('First sentence'), 'the heard sentence stays committed');
    assert.ok(!aiText.includes('Second question'),
      'the un-heard tail must be dropped by clearAppendTimers, not graded');
    assert.equal(api().questionCount, 0,
      'questionCount must count only questions actually asked aloud — the dropped "?" tail must not increment it');
  } finally {
    api().disconnect(); // always clear the 1 s elapsed interval, even on assertion failure
  }
});
