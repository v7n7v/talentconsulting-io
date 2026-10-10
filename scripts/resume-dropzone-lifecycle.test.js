const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../components/FileUploadDropzone.tsx'), 'utf8');

function functionSource(marker, nextMarker) {
  const start = source.indexOf(marker); const end = source.indexOf(nextMarker, start);
  let cursor = source.indexOf('{', start); let depth = 0; let quote = null;
  for (; cursor < end; cursor++) {
    const c = source[cursor];
    if (quote) { if (c === quote && source[cursor - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) { cursor++; break; }
  }
  return source.slice(start, cursor).replace(/^  const handleFileUpload = async \(/, 'return async (');
}
function makeHarness({ owner = 'alice', workspaceOwned = false } = {}) {
  const calls = []; const successes = []; const toasts = []; const starts = []; const operations = []; const errors = [];
  const pending = [];
  const auth = { currentUser: { uid: owner } };
  const parent = { valid: true, owner, operation: null, id: null };
  const operationRef = { current: null }; const mountedRef = { current: true };
  const state = { operationRef, mountedRef, auth, onUploadSuccess: (...args) => successes.push(args), onUploadStart: id => starts.push(id),
    onUploadOperation: operation => { operations.push(operation); parent.operation = operation; parent.id = operation.id; },
    canContinueUpload: workspaceOwned ? id => parent.valid && parent.id === id && parent.owner === (auth.currentUser?.uid ?? null) : undefined,
    onUploadError: (...args) => errors.push(args), isUploading: false, setUploadError: value => { state.uploadError = value; }, setIsUploading: value => { state.isUploading = value; }, validateResumeFile: () => {}, showToast: (...args) => toasts.push(args), ResumeUploadError: class ResumeUploadError extends Error {} };
  const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('const mountedRef'));
  const effectEnd = source.indexOf('\n  }, [canContinueUpload]);', effectStart);
  const effectBody = source.slice(effectStart + '  useEffect(() => {'.length, effectEnd);
  const setupEffect = new Function('mountedRef', 'invalidateOperation', 'operationRef', 'canContinueUpload', effectBody);
  const invalidateOperation = () => { operationRef.current?.cancel(); operationRef.current = null; };
  let cleanup = setupEffect(mountedRef, invalidateOperation, operationRef, state.canContinueUpload);
  const fnSource = functionSource('  const handleFileUpload = async (file: File) => {', '\n  const handleDrag =');
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${fnSource}`, { loader: 'tsx', target: 'es2022' }).code;
  const handleRaw = new Function('state', 'startResumeUpload', body)(state, (file, options = {}) => {
    const item = { file, resolve: null, reject: null, cancelled: false };
    item.promise = new Promise((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
    calls.push(item); pending.push(item);
    options.signal?.addEventListener('abort', () => { item.cancelled = true; }, { once: true });
    return { promise: item.promise, cancel: () => { item.cancelled = true; } };
  });
  const harness = { state, auth, calls, pending, successes, starts, toasts, errors, operations, parent, handle: file => handleRaw(file).catch(error => { harness.failure = error; throw error; }),
    unmount: () => cleanup(), strictModeRemount: () => { cleanup(); cleanup = setupEffect(mountedRef, invalidateOperation, operationRef, state.canContinueUpload); } };
  return harness;
}

test('old file completion cannot supersede the replacement file', async () => {
  const h = makeHarness();
  const a = h.handle({ name: 'a.txt', size: 20 }); const b = h.handle({ name: 'b.txt', size: 20 });
  await Promise.resolve();
  assert.equal(h.calls.length, 2, `upload did not start: ${h.failure?.stack || 'no captured error'}; starts=${h.starts.length}; state=${JSON.stringify(h.state)}`);
  h.calls[0].resolve({ text: 'A sufficiently long source text', fileName: 'a.txt', sourceType: 'direct' });
  h.calls[1].resolve({ text: 'B sufficiently long source text', fileName: 'b.txt', sourceType: 'direct' });
  await Promise.all([a, b]);
  assert.equal(h.successes.length, 1);
  assert.equal(h.successes[0][1], 'b.txt');
  assert.equal(h.calls[0].cancelled, true);
});

test('default consumer unmount still cancels its active operation and suppresses success', async () => {
  const h = makeHarness(); const run = h.handle({ name: 'a.txt', size: 20 }); await Promise.resolve();
  h.unmount();
  h.calls[0].resolve({ text: 'A source text', fileName: 'a.txt', sourceType: 'direct' });
  await run;
  assert.equal(h.successes.length, 0); assert.equal(h.calls[0].cancelled, true);
});

test('workspace-owned transfer completes after the source view unmounts', async () => {
  const h = makeHarness({ workspaceOwned: true });
  const run = h.handle({ name: 'resume.pdf', size: 42 }); await Promise.resolve();
  h.unmount();
  assert.equal(h.calls[0].cancelled, false);
  h.calls[0].resolve({ text: 'A sufficiently long extracted resume source', fileName: 'resume.pdf', sourceType: 'storage' });
  await run;
  assert.equal(h.successes.length, 1);
  assert.equal(h.successes[0][1], 'resume.pdf');
});

test('parent invalidation and account change cancel transfer and suppress completion', async () => {
  const h = makeHarness({ workspaceOwned: true });
  const run = h.handle({ name: 'resume.pdf', size: 42 }); await Promise.resolve();
  h.parent.valid = false; h.parent.operation.cancel();
  h.auth.currentUser = { uid: 'bob' };
  h.calls[0].resolve({ text: 'A sufficiently long extracted resume source', fileName: 'resume.pdf', sourceType: 'storage' });
  await run;
  assert.equal(h.calls[0].cancelled, true);
  assert.equal(h.successes.length, 0);
  assert.equal(h.errors.length, 0);
});

test('background transfer errors reach the workspace after the view unmounts', async () => {
  const h = makeHarness({ workspaceOwned: true });
  const run = h.handle({ name: 'broken.pdf', size: 42 }); await Promise.resolve();
  h.unmount();
  h.calls[0].reject(new Error('Upload timed out'));
  await run;
  assert.deepEqual(h.errors, [['Upload timed out', 'broken.pdf']]);
  assert.equal(h.state.uploadError, '', 'an unmounted view does not update its local error state');
  assert.equal(h.state.isUploading, false);
});

test('owner change suppresses late success', async () => {
  const h = makeHarness(); const run = h.handle({ name: 'a.txt', size: 20 });
  h.auth.currentUser = { uid: 'bob' };
  h.calls[0].resolve({ text: 'A source text', fileName: 'a.txt', sourceType: 'direct' });
  await run;
  assert.equal(h.successes.length, 0);
});

test('paste starts after invalidating the active file operation', () => {
  const start = source.indexOf('  const submitPasteText = () => {');
  const end = source.indexOf('\n  if (variant ===', start);
  const fn = source.slice(start, end).split('\n').slice(0, 18).join('\n').replace(/const (\w+) = \(/, 'return (');
  const state = { pasteValue: 'A sufficiently long pasted resume source', invalidateOperation: () => { state.invalidated = true; }, setIsUploading: value => { state.uploading = value; }, onUploadStart: id => { state.started = id; }, onPasteText: value => { state.pasted = value; }, setPasteOpen: () => {}, setPasteValue: () => {}, showToast: () => {}, invalidated: false };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${fn}`, { loader: 'tsx', target: 'es2022' }).code;
  new Function('state', body)(state)();
  assert.equal(state.invalidated, true); assert.equal(state.pasted, state.pasteValue); assert.match(state.started, /^paste-/);
});

test('StrictMode setup cleanup setup preserves delegated transfer and its outcome', async () => {
  const h = makeHarness();
  const delegated = makeHarness({ workspaceOwned: true });
  const first = delegated.handle({ name: 'actual.txt', size: 30 }); await Promise.resolve();
  delegated.strictModeRemount();
  assert.equal(delegated.calls[0].cancelled, false);
  delegated.calls[0].resolve({ text: 'Actual person and original resume content', fileName: 'actual.txt', sourceType: 'direct' });
  await first; assert.equal(delegated.successes.length, 1);

  const defaultConsumer = makeHarness();
  defaultConsumer.strictModeRemount();
  assert.equal(defaultConsumer.state.mountedRef.current, true);
  const firstUpload = defaultConsumer.handle({ name: 'actual.txt', size: 30 });
  defaultConsumer.calls[0].resolve({ text: 'Actual person and original resume content', fileName: 'actual.txt', sourceType: 'direct' });
  await firstUpload; assert.equal(defaultConsumer.successes.length, 1);
  const second = defaultConsumer.handle({ name: 'broken.pdf', size: 30 });
  defaultConsumer.calls[1].reject(new Error('Unreadable file')); await second;
  assert.equal(defaultConsumer.state.isUploading, false); assert.equal(defaultConsumer.state.uploadError, 'Unreadable file');
});
