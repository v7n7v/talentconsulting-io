const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-tier-account-'));
const write = (name, contents) => {
  const file = path.join(directory, name);
  fs.writeFileSync(file, contents);
  return file;
};

// Execute the genuine hook with a minimal batched hooks runtime. Only React,
// the account store, and the network boundary are replaced; response validation
// and every request/owner guard are production code.
const modulePromise = (async () => {
  const react = write('react.js', `
    export const useState = (...args) => globalThis.__tierHarness.useState(...args);
    export const useRef = (...args) => globalThis.__tierHarness.useRef(...args);
    export const useMemo = (...args) => globalThis.__tierHarness.useMemo(...args);
    export const useCallback = (callback, deps) => useMemo(() => callback, deps);
    export const useEffect = (...args) => globalThis.__tierHarness.useEffect(...args);
  `);
  const store = write('store.js', `
    export function useStore(selector) { return selector(globalThis.__tierHarness.account); }
    useStore.getState = () => globalThis.__tierHarness.account;
  `);
  const fetch = write('fetch.js', `
    export const authFetch = (...args) => globalThis.__tierHarness.fetch(...args);
  `);
  const demo = write('demo.js', 'export const isDemoModeEnabled = () => false;');
  const preview = write('preview.js', 'export const isIsolatedWorkspacePreview = () => false; export const getWorkspacePreviewScenario = () => null;');
  const output = path.join(directory, 'hook.cjs');
  await build({
    entryPoints: [path.join(root, 'hooks/use-user-tier.ts')], outfile: output,
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    alias: { react, '@/lib/store': store, '@/lib/auth-fetch': fetch, '@/lib/demo-mode': demo, '@/lib/workspace-preview': preview },
  });
  return require(output);
})();

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const flush = async () => { for (let turn = 0; turn < 30; turn++) await Promise.resolve(); };

async function harness(uid) {
  const { useUserTier } = await modulePromise;
  function TierProbe() { return useUserTier(); }
  const cells = [];
  const requests = [];
  const effects = [];
  let cursor = 0;
  let pending = [];
  let scheduled = false;
  let mounted = true;
  const state = {
    account: { user: uid ? { uid } : null },
    current: null,
    requests,
    useState(initial) {
      const index = cursor++;
      if (!cells[index]) {
        const cell = { value: typeof initial === 'function' ? initial() : initial };
        cell.set = next => {
          const value = typeof next === 'function' ? next(cell.value) : next;
          if (Object.is(cell.value, value)) return;
          cell.value = value;
          if (mounted && !scheduled) {
            scheduled = true;
            queueMicrotask(() => { scheduled = false; if (mounted) state.render(); });
          }
        };
        cells[index] = cell;
      }
      return [cells[index].value, cells[index].set];
    },
    useRef(initial) { const index = cursor++; return cells[index] || (cells[index] = { current: initial }); },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) cells[index] = { value: factory(), deps };
      return cells[index].value;
    },
    useEffect(create, deps) {
      const index = cursor++;
      if (!cells[index]) { cells[index] = {}; effects.push(cells[index]); }
      const effect = cells[index];
      if (!sameDeps(effect.deps, deps)) { effect.deps = deps; pending.push(() => { effect.cleanup?.(); effect.cleanup = create(); }); }
    },
    fetch(url) { return new Promise((resolve, reject) => requests.push({ url, resolve, reject })); },
    render() {
      cursor = 0;
      pending = [];
      state.current = TierProbe();
      const committed = state.current;
      for (const run of pending) run();
      return committed;
    },
    switchAccount(nextUid) { state.account.user = nextUid ? { uid: nextUid } : null; return state.render(); },
    unmount() { mounted = false; effects.forEach(effect => effect.cleanup?.()); },
  };
  globalThis.__tierHarness = state;
  globalThis.window = Object.assign(new EventTarget(), { location: { search: '', pathname: '/suite', hash: '' } });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  state.render();
  await flush();
  return state;
}

const answer = (request, tier, used = 0) => request.resolve(Response.json({ tier, usage: { morphs: used }, caps: { morphs: 3 } }));
const failure = request => request.resolve(Response.json({ tier: 'free' }, { status: 503 }));

test('account B failure cannot inherit account A paid tier or usage', async t => {
  const h = await harness('A'); t.after(() => h.unmount());
  answer(h.requests[0], 'studio', 91); await flush();
  assert.equal(h.current.tier, 'studio');
  assert.equal(h.current.isPro, true);
  const firstBFrame = h.switchAccount('B');
  assert.equal(firstBFrame.loading, true);
  assert.equal(firstBFrame.tier, 'free');
  assert.equal(firstBFrame.usage.morphs, 0);
  failure(h.requests[1]); await flush();
  assert.equal(h.current.loading, false, 'an error must settle, not spin forever');
  assert.match(h.current.error, /could not be checked/);
  assert.equal(h.current.tier, 'free', 'compatibility fallback contains no prior account data');
  assert.equal(h.current.usage.morphs, 0);
  assert.notEqual(h.current.caps, null);
  assert.equal(h.current.isPro, false);
  assert.equal(h.current.canUse('morphs'), false, 'unknown does not confer free or paid capabilities');
  assert.equal(h.current.remaining('morphs'), 0);
});

test('late account A response cannot replace account B result', async t => {
  const h = await harness('A'); t.after(() => h.unmount());
  h.switchAccount('B'); await flush();
  answer(h.requests[1], 'free', 2); await flush();
  answer(h.requests[0], 'studio', 77); await flush();
  assert.equal(h.current.tier, 'free');
  assert.equal(h.current.usage.morphs, 2);
  assert.equal(h.current.remaining('morphs'), 1);
  assert.equal(h.current.error, null);
});

test('store owner change rejects a response even before the new render commits', async t => {
  const h = await harness('A'); t.after(() => h.unmount());
  h.account.user = { uid: 'B' };
  answer(h.requests[0], 'studio', 77); await flush();
  h.render(); await flush();
  failure(h.requests[1]); await flush();
  assert.equal(h.current.tier, 'free');
  assert.equal(h.current.usage.morphs, 0);
  assert.match(h.current.error, /could not be checked/);
});

test('same-account failure is unavailable until a successful retry and old attempts cannot win', async t => {
  const h = await harness('A'); t.after(() => h.unmount());
  answer(h.requests[0], 'studio'); await flush();
  h.current.refetch(); await flush();
  assert.equal(h.current.loading, true);
  assert.equal(h.current.isPro, false);
  failure(h.requests[1]); await flush();
  assert.equal(h.current.loading, false);
  assert.match(h.current.error, /could not be checked/);
  assert.equal(h.current.isPro, false);
  h.current.refetch(); await flush();
  h.current.refetch(); await flush();
  answer(h.requests[3], 'pro'); await flush();
  failure(h.requests[2]); await flush();
  assert.equal(h.current.tier, 'pro');
  assert.equal(h.current.error, null);
  assert.equal(h.current.isPro, true);
});

test('guest lookup settles without an API request and logout drops signed-in data', async t => {
  const h = await harness(null); t.after(() => h.unmount());
  assert.equal(h.requests.length, 0);
  assert.equal(h.current.loading, false);
  assert.equal(h.current.error, null);
  assert.equal(h.current.tier, 'free');
  h.switchAccount('A'); await flush();
  h.switchAccount(null); await flush();
  answer(h.requests[0], 'studio', 12); await flush();
  assert.equal(h.current.loading, false);
  assert.equal(h.current.tier, 'free');
  assert.equal(h.current.usage.morphs, 0);
});

test('external refresh listeners are removed when the hook unmounts', async () => {
  const h = await harness('A');
  answer(h.requests[0], 'free'); await flush();
  window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(h.requests.length, 2);
  h.unmount();
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('talent:subscription-updated'));
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  assert.equal(h.requests.length, 2);
});
