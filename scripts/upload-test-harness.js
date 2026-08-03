/**
 * Execution harness for the upload modules.
 *
 * The state machine in `lib/upload/file-upload-types.ts` is pure and drives in
 * Node unassisted. Everything else in the feature — the XHR listener wiring,
 * the hook's staleness and focus rules, the card's markup — used to be
 * "covered" by reading the source with `readFileSync` and matching regexes
 * against it. That certifies nothing: a guard whose body is empty still
 * contains the string, and a prose comment satisfies `assert.match(hook,
 * /isConnected/)`. The suite was green while a live defect shipped through the
 * exact function three of those assertions claimed to cover.
 *
 * So this file bundles the real modules with esbuild, replacing only what
 * genuinely cannot run in Node — Firebase, the auth-header helper, mammoth, and
 * React itself — and runs them.
 *
 * The React replacement is a real (small) hooks runtime, not a mock of the
 * hook. It implements useState/useReducer/useRef/useMemo/useCallback/useEffect
 * with React's batching semantics: updates queue and flush together on a
 * microtask, which is what makes `dispatch(select)` immediately followed by
 * `dispatch(fail)` land as ONE commit at phase 'error' — the batching that a
 * per-phase announcement gate was silent for.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

/* --------------------------------------------------------------- test state */

/**
 * Everything the stubs read and record. Reset between tests rather than
 * rebuilt, so the bundle is built exactly once.
 */
function resetUploadTestState() {
  globalThis.__uploadTest = {
    currentUser: null,
    token: 'test-id-token',
    tokenUnavailable: false,
    authHeaderCalls: [],
    tasks: [],
    fetches: [],
    beacons: [],
    listeners: {},
    warnings: [],
    respond: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true }),
    }),
  };
  return globalThis.__uploadTest;
}

/* ------------------------------------------------------------ fake XHR */

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type);
    if (!list) return;
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  }

  dispatch(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
}

/**
 * As close to the XHR spec as the tests need, and deliberately faithful on the
 * one point that matters: `abort()` dispatches the `abort` event
 * SYNCHRONOUSLY. That is the whole reason the stall watchdog has to settle
 * before it aborts.
 */
class FakeXhr extends FakeEventTarget {
  constructor() {
    super();
    this.upload = new FakeEventTarget();
    this.status = 0;
    this.responseText = '';
    this.requestHeaders = {};
    this.responseHeaders = {};
    this.aborted = false;
    this.sent = false;
    FakeXhr.instances.push(this);
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key, value) {
    this.requestHeaders[key.toLowerCase()] = value;
  }

  send(body) {
    this.body = body;
    this.sent = true;
  }

  abort() {
    this.aborted = true;
    this.dispatch('abort', {});
  }

  getResponseHeader(name) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }

  /** Answer the request the way a server would. */
  respond(status, payload, headers = {}) {
    this.status = status;
    this.responseText = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [key, value] of Object.entries(headers)) {
      this.responseHeaders[key.toLowerCase()] = String(value);
    }
    this.dispatch('load', {});
  }

  /** A byte event from the request body, as the browser reports it. */
  progress(loaded, total, lengthComputable = true) {
    this.upload.dispatch('progress', { loaded, total, lengthComputable });
  }
}
FakeXhr.instances = [];

/* ------------------------------------------------------- fake browser globals */

function installBrowserGlobals() {
  const state = globalThis.__uploadTest;
  const previous = {};
  const define = (name, value) => {
    previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };

  FakeXhr.instances.length = 0;
  define('XMLHttpRequest', FakeXhr);
  define('window', {
    addEventListener(type, fn) {
      if (!state.listeners[type]) state.listeners[type] = [];
      state.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      const list = state.listeners[type];
      if (!list) return;
      const at = list.indexOf(fn);
      if (at >= 0) list.splice(at, 1);
    },
  });
  define('navigator', {
    sendBeacon(url, body) {
      state.beacons.push({ url, body });
      return true;
    },
  });
  define('fetch', async (url, init) => {
    state.fetches.push({ url, init });
    return state.respond(url, init);
  });

  return function restore() {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

/** Fire every `pagehide` handler the transport registered. */
function firePageHide() {
  for (const fn of [...(globalThis.__uploadTest.listeners.pagehide ?? [])]) fn({});
}

/* ------------------------------------------------------------- fake timers */

/**
 * The stall watchdog is 45 seconds and the bar-suppression window is 250ms.
 * Neither is worth waiting for, and neither should be lowered so a test can
 * see it. Timers are swapped for a controllable queue for the duration of the
 * window under test and restored immediately afterwards.
 */
function installFakeTimers() {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const pending = new Map();
  let seq = 1;

  globalThis.setTimeout = (fn, ms = 0) => {
    const id = seq++;
    pending.set(id, { fn, ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    pending.delete(id);
  };

  return {
    /** Fire every timer whose delay is at or below `ms`, oldest first. */
    advance(ms) {
      for (const [id, timer] of [...pending]) {
        if (timer.ms <= ms) {
          pending.delete(id);
          timer.fn();
        }
      }
    },
    pending: () => pending.size,
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    },
  };
}

/** Let every queued microtask run. Nothing here needs a real macrotask. */
async function flushMicrotasks(turns = 40) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

/* ------------------------------------------------------------------ stubs */

const MINI_REACT = `
const runtime = {
  slots: [],
  index: 0,
  render: null,
  mounted: false,
  scheduled: false,
  result: null,
  pending: [],
  effects: [],
  renders: 0,
};

function sameDeps(a, b) {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function slot(create) {
  const i = runtime.index++;
  if (runtime.slots.length <= i) runtime.slots[i] = create();
  return runtime.slots[i];
}

function schedule() {
  if (!runtime.mounted || runtime.scheduled) return;
  runtime.scheduled = true;
  queueMicrotask(() => {
    runtime.scheduled = false;
    if (runtime.mounted) commit();
  });
}

function commit() {
  runtime.index = 0;
  runtime.pending = [];
  runtime.result = runtime.render();
  runtime.renders += 1;
  const due = runtime.pending;
  runtime.pending = [];
  for (const effect of due) {
    if (typeof effect.cleanup === 'function') effect.cleanup();
    const cleanup = effect.create();
    effect.cleanup = typeof cleanup === 'function' ? cleanup : null;
  }
}

export function useState(initial) {
  const s = slot(() => ({ value: typeof initial === 'function' ? initial() : initial, set: null }));
  if (!s.set) {
    s.set = (next) => {
      const value = typeof next === 'function' ? next(s.value) : next;
      if (Object.is(value, s.value)) return;
      s.value = value;
      schedule();
    };
  }
  return [s.value, s.set];
}

export function useReducer(reducer, initialArg, init) {
  const s = slot(() => ({
    value: typeof init === 'function' ? init(initialArg) : initialArg,
    dispatch: null,
  }));
  if (!s.dispatch) {
    s.dispatch = (action) => {
      const next = reducer(s.value, action);
      if (Object.is(next, s.value)) return;
      s.value = next;
      schedule();
    };
  }
  return [s.value, s.dispatch];
}

export function useRef(initial) {
  return slot(() => ({ current: initial }));
}

export function useMemo(factory, deps) {
  const s = slot(() => ({ deps: undefined, value: undefined, primed: false }));
  if (!s.primed || !sameDeps(s.deps, deps)) {
    s.value = factory();
    s.deps = deps;
    s.primed = true;
  }
  return s.value;
}

export function useCallback(fn, deps) {
  return useMemo(() => fn, deps);
}

export function useEffect(create, deps) {
  const s = slot(() => {
    const effect = { deps: undefined, cleanup: null, primed: false, create: null };
    runtime.effects.push(effect);
    return effect;
  });
  const changed = !s.primed || deps === undefined || !sameDeps(s.deps, deps);
  s.primed = true;
  s.deps = deps;
  if (changed) {
    s.create = create;
    runtime.pending.push(s);
  }
}

export const useLayoutEffect = useEffect;

let ids = 0;
export function useId() {
  return slot(() => ({ current: ':tc' + (ids += 1) + ':' })).current;
}

export const Fragment = Symbol.for('tc.test.fragment');

export const __runtime = {
  mount(render) {
    runtime.slots = [];
    runtime.effects = [];
    runtime.index = 0;
    runtime.renders = 0;
    runtime.render = render;
    runtime.mounted = true;
    commit();
    return runtime.result;
  },
  get current() { return runtime.result; },
  get renders() { return runtime.renders; },
  async flush(turns = 40) {
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  },
  unmount() {
    runtime.mounted = false;
    for (const effect of runtime.effects) {
      if (typeof effect.cleanup === 'function') effect.cleanup();
      effect.cleanup = null;
    }
  },
};

export default { useState, useReducer, useRef, useMemo, useCallback, useEffect, useId, Fragment };
`;

const JSX_RUNTIME = `
export { Fragment } from './mini-react.js';
export function jsx(type, props, key) {
  return { type, props: props ?? {}, key: key ?? null };
}
export const jsxs = jsx;
export const jsxDEV = jsx;
`;

const FIREBASE_STUB = `
export const auth = {
  get currentUser() { return globalThis.__uploadTest.currentUser; },
};
export const storage = { __stub: 'storage' };
export default { auth, storage };
`;

const FIREBASE_AUTH_STUB = `
export function onAuthStateChanged() {
  return () => {};
}
`;

const FIREBASE_STORAGE_STUB = `
export function ref(_storage, fullPath) {
  return { fullPath };
}
export function uploadBytesResumable(reference, file, metadata) {
  const task = {
    reference,
    file,
    metadata,
    calls: [],
    observers: null,
    on(_event, next, error, complete) {
      task.observers = { next, error, complete };
    },
    pause() { task.calls.push('pause'); },
    resume() { task.calls.push('resume'); },
    cancel() { task.calls.push('cancel'); },
  };
  globalThis.__uploadTest.tasks.push(task);
  return task;
}
`;

const AUTH_FETCH_STUB = `
export class AuthTokenUnavailableError extends Error {
  constructor(message = 'Your session could not be verified.') {
    super(message);
    this.name = 'AuthTokenUnavailableError';
    this.code = 'auth/token-unavailable';
  }
}
export async function resolveAuthHeaders(options = {}) {
  const state = globalThis.__uploadTest;
  state.authHeaderCalls.push(options);
  if (state.tokenUnavailable) {
    if (options.requireToken) throw new AuthTokenUnavailableError();
    return new Headers();
  }
  const headers = new Headers();
  headers.set('Authorization', 'Bearer ' + state.token);
  return headers;
}
export async function authFetch(url, options) {
  return fetch(url, options);
}
`;

const DEMO_MODE_STUB = `
export function isDemoModeEnabled() { return false; }
export const DEMO_AUTH_TOKEN = 'demo';
`;

const MAMMOTH_STUB = `
export async function extractRawText() {
  return { value: globalThis.__uploadTest.mammothText ?? '' };
}
export default { extractRawText };
`;

/* ------------------------------------------------------------------ build */

let bundlePromise = null;

/**
 * Build the real modules once, with only the unrunnable edges replaced.
 *
 * Everything under lib/upload and components/upload is the genuine source.
 */
function loadUploadModules() {
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-upload-harness-'));
    const write = (name, source) => {
      const file = path.join(workdir, name);
      fs.writeFileSync(file, source, 'utf8');
      return file;
    };

    const miniReact = write('mini-react.js', MINI_REACT);
    const jsxRuntime = write('jsx-runtime.js', JSX_RUNTIME);
    const firebase = write('firebase-stub.js', FIREBASE_STUB);
    const firebaseAuth = write('firebase-auth-stub.js', FIREBASE_AUTH_STUB);
    const firebaseStorage = write('firebase-storage-stub.js', FIREBASE_STORAGE_STUB);
    const authFetch = write('auth-fetch-stub.js', AUTH_FETCH_STUB);
    const demoMode = write('demo-mode-stub.js', DEMO_MODE_STUB);
    const mammoth = write('mammoth-stub.js', MAMMOTH_STUB);

    const source = (relative) => path.join(repoRoot, relative);
    const entry = write(
      'entry.js',
      [
        `export { __runtime } from ${JSON.stringify(miniReact)};`,
        `export * as core from ${JSON.stringify(source('lib/upload/file-upload-types.ts'))};`,
        `export * as transport from ${JSON.stringify(source('lib/upload/upload-transport.ts'))};`,
        `export { useFileUpload } from ${JSON.stringify(source('lib/upload/useFileUpload.ts'))};`,
        `export { default as UploadCard } from ${JSON.stringify(source('components/upload/UploadCard.tsx'))};`,
        `export { default as FileDropzone } from ${JSON.stringify(source('components/upload/FileDropzone.tsx'))};`,
      ].join('\n'),
    );

    const outfile = path.join(workdir, 'bundle.cjs');
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      jsx: 'automatic',
      logLevel: 'silent',
      alias: {
        react: miniReact,
        'react/jsx-runtime': jsxRuntime,
        'firebase/auth': firebaseAuth,
        'firebase/storage': firebaseStorage,
        mammoth: mammoth,
        '@/lib/firebase': firebase,
        '@/lib/auth-fetch': authFetch,
        '@/lib/demo-mode': demoMode,
        '@/lib/upload/file-upload-types': source('lib/upload/file-upload-types.ts'),
        '@/lib/upload/useFileUpload': source('lib/upload/useFileUpload.ts'),
        '@/lib/upload/upload-transport': source('lib/upload/upload-transport.ts'),
        '@/components/upload/UploadCard': source('components/upload/UploadCard.tsx'),
      },
    });

    return require(outfile);
  })();

  return bundlePromise;
}

/* ------------------------------------------------- element-tree assertions */

/** Walk a tree of `{ type, props }` nodes produced by the jsx stub. */
function walkElements(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkElements(child, visit);
    return;
  }
  if (!('type' in node)) return;
  visit(node);
  walkElements(node.props?.children, visit);
}

function findElements(tree, predicate) {
  const found = [];
  walkElements(tree, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

/** Every string rendered inside a node, joined. */
function textContent(node) {
  const parts = [];
  const collect = (value) => {
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) collect(child);
      return;
    }
    if (typeof value === 'object' && 'props' in value) collect(value.props?.children);
  };
  collect(node);
  // Joined with nothing, exactly as the DOM concatenates text nodes: an
  // interpolated `{retryAfter}` between two strings is one sentence, not three
  // words with gaps in it.
  return parts.join('');
}

module.exports = {
  FakeXhr,
  findElements,
  firePageHide,
  flushMicrotasks,
  installBrowserGlobals,
  installFakeTimers,
  loadUploadModules,
  repoRoot,
  resetUploadTestState,
  textContent,
  walkElements,
};
