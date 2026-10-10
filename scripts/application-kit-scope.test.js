const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

function fixture() {
  let owner = 'a';
  const storage = new Map();
  const window = { location: { pathname: '/suite/cover-letter', search: '' }, sessionStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  }, addEventListener() {}, removeEventListener() {} };
  const built = buildSync({ entryPoints: [path.join(__dirname, '../lib/application-kit.ts')], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['@/lib/store'], logLevel: 'silent' });
  const mod = new Module(__filename, module);
  mod.require = id => id === '@/lib/store' ? { useStore: { getState: () => ({ user: owner ? { uid: owner } : null }) } } : require(id);
  mod._compile(`const window = global.__kitWindow;\n${built.outputFiles[0].text}`, __filename);
  // Evaluation uses the test's isolated window, never any real browser storage.
  return { api: mod.exports, storage, window, setOwner: next => { owner = next; } };
}

function withKit(run) {
  global.__kitWindow = { location: { pathname: '/suite/cover-letter', search: '' }, sessionStorage: {
    values: new Map(), getItem(key) { return this.values.get(key) || null; }, setItem(key, value) { this.values.set(key, value); },
  }, addEventListener() {}, removeEventListener() {} };
  const f = fixture();
  f.window = global.__kitWindow;
  try { return run(f); } finally { delete global.__kitWindow; }
}

test('ownerless legacy drafts never hydrate a signed-in account; A and B remain separate', () => withKit(({ api, window, setOwner }) => {
  window.sessionStorage.setItem(api.APPLICATION_KIT_STORAGE_KEY, JSON.stringify({ company: 'Legacy private' }));
  assert.equal(api.loadApplicationKitContext().company, '');
  api.mergeApplicationKitContext({ company: 'Account A', resumeText: 'A source' });
  setOwner('b');
  assert.equal(api.loadApplicationKitContext().company, '');
  api.mergeApplicationKitContext({ company: 'Account B' });
  setOwner('a');
  assert.equal(api.loadApplicationKitContext().company, 'Account A');
}));

test('independent application scopes retain their documents and results', () => withKit(({ api }) => {
  const a = { scopeId: 'application:first' }, b = { scopeId: 'application:second' };
  api.mergeApplicationKitContext({ applicationId: 'first', company: 'First', resumeText: 'Facts A' }, a);
  api.mergeApplicationKitContext({ coverLetterResult: { status: 'success', data: { letter: 'Letter A' } } }, a);
  api.mergeApplicationKitContext({ applicationId: 'second', company: 'Second', resumeText: 'Facts B' }, b);
  assert.equal(api.loadApplicationKitContext(a).coverLetterResult.data.letter, 'Letter A');
  assert.equal(api.loadApplicationKitContext(a).company, 'First');
  assert.equal(api.loadApplicationKitContext(b).company, 'Second');
}));

test('changed inputs invalidate derived outputs and reject stale completions', () => withKit(({ api, setOwner }) => {
  api.mergeApplicationKitContext({ resumeText: 'First source' });
  api.mergeApplicationKitContext({ atsResult: { status: 'success', data: { overallScore: 0 } } });
  const before = api.loadApplicationKitContext();
  const current = api.captureApplicationKitGuard();
  api.mergeApplicationKitContext({ resumeText: 'Second source' });
  assert.equal(current(), false);
  assert.equal(api.loadApplicationKitContext().atsResult.status, 'stale');
  api.mergeApplicationKitContext({ company: 'Late response' }, { expectedRevision: before.revision });
  assert.notEqual(api.loadApplicationKitContext().company, 'Late response');
  const ownerGuard = api.captureApplicationKitGuard();
  setOwner('b');
  assert.equal(ownerGuard(), false);
  api.mergeApplicationKitContext({ company: 'Old owner write' }, { ownerId: 'a' });
  assert.equal(api.loadApplicationKitContext().company, '');
}));

test('latest operation wins even with identical inputs; storage failure preserves unsaved work', () => withKit(({ api, window }) => {
  const first = api.captureApplicationKitGuard(), second = api.captureApplicationKitGuard();
  assert.equal(first(), false); assert.equal(second(), true);
  window.sessionStorage.setItem = () => { throw new Error('storage blocked'); };
  const next = api.mergeApplicationKitContext({ resumeText: 'Keep my typed facts' });
  assert.equal(next.storageStatus, 'unavailable');
  assert.equal(api.loadApplicationKitContext().resumeText, 'Keep my typed facts');
}));

test('reactive subscribers observe another consumer update and unsubscribe cleanly', () => withKit(({ api }) => {
  let changes = 0; const off = api.subscribeApplicationKit(() => changes++);
  api.mergeApplicationKitContext({ company: 'Updated' });
  assert.equal(changes, 1); off();
  api.mergeApplicationKitContext({ company: 'Again' }); assert.equal(changes, 1);
}));

test('style and profile changes invalidate only their dependent outputs and guards', () => withKit(({ api }) => {
  api.mergeApplicationKitContext({ resumeText: 'Facts', jobDescription: 'Role', coverLetterResult:{status:'success',data:{letter:'Reviewed letter'}}, linkedinResult:{status:'success',data:{headline:'Reviewed profile'}}, atsResult:{status:'success',data:{overallScore:0}}, oracleResult:{status:'success',data:{decision:'review'}} });
  const letterGuard=api.captureApplicationKitGuard({outputKey:'coverLetterResult'});
  const profileGuard=api.captureApplicationKitGuard({outputKey:'linkedinResult'});
  api.mergeApplicationKitContext({profileHeadline:'New biography evidence'});
  const context=api.loadApplicationKitContext();
  assert.equal(context.linkedinResult.status,'stale');assert.equal(context.coverLetterResult.status,'success');assert.equal(context.atsResult.status,'success');assert.equal(context.oracleResult.status,'success');
  assert.equal(letterGuard(),true);assert.equal(profileGuard(),false);
  api.mergeApplicationKitContext({coverLetterTone:'professional'});
  assert.equal(letterGuard(),false);assert.equal(api.loadApplicationKitContext().atsResult.status,'success');
}));

test('explicit handoff updates an existing destination while retaining its old draft as stale and leaves other applications untouched', () => withKit(({ api }) => {
  api.mergeApplicationKitContext({resumeText:'Old source',company:'Old company',coverLetterTone:'professional',coverLetterResult:{status:'success',data:{coverLetter:'My reviewed words'}}},{scopeId:'letter:draft'});
  api.mergeApplicationKitContext({applicationId:'other',resumeText:'Other application',coverLetterResult:{status:'success',data:{coverLetter:'Other letter'}}},{scopeId:'application:other'});
  const source=api.mergeApplicationKitContext({resumeText:'Selected source',company:'Selected company'},{scopeId:'resume:workspace'});
  assert.equal(api.handoffApplicationKitContext('/suite/cover-letter',source),'/suite/cover-letter');
  const letter=api.loadApplicationKitContext({scopeId:'letter:draft'});
  assert.equal(letter.resumeText,'Selected source');assert.equal(letter.company,'Selected company');assert.equal(letter.coverLetterTone,'professional');assert.equal(letter.coverLetterResult.status,'stale');assert.equal(letter.coverLetterResult.data.coverLetter,'My reviewed words');
  assert.equal(api.loadApplicationKitContext({scopeId:'application:other'}).coverLetterResult.data.coverLetter,'Other letter');
}));

test('application links retain the exact application scope and passive seeds never import its target', () => withKit(({api}) => {
  const source=api.mergeApplicationKitContext({applicationId:'abc',company:'Private company',jobDescription:'Private target',resumeText:'Shared selected source'},{scopeId:'application:abc'});
  assert.equal(api.handoffApplicationKitContext('/suite/cover-letter',source),'/suite/cover-letter?application=abc');
  const fresh=api.loadApplicationKitContext({scopeId:'profile:linkedin'});
  assert.equal(fresh.resumeText,'Shared selected source');assert.equal(fresh.company,'');assert.equal(fresh.jobDescription,'');assert.equal(fresh.applicationId,null);
}));
