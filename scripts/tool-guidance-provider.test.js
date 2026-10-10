const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { runtime } = require('./test-ui-hooks.cjs');

async function loadProvider() {
  const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tool-guidance-provider-')), 'provider.cjs');
  await build({
    entryPoints: ['components/guidance/ToolGuidanceProvider.tsx'], outfile,
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
    plugins: [{ name: 'guidance-runtime', setup(api) {
      api.onLoad({ filter: /ToolGuidanceProvider\.tsx$/ }, args => ({ contents: `${fs.readFileSync(args.path, 'utf8')}\nexport { ToolGuidancePanel };`, loader: 'tsx' }));
      api.onResolve({ filter: /^(react(?:\/jsx-runtime)?|react-dom|next\/navigation|@\/lib\/store|@\/components\/BrandLogo)$/ }, args => ({ path: args.path, namespace: 'guidance-mock' }));
      api.onLoad({ filter: /.*/, namespace: 'guidance-mock' }, args => {
        const contents = args.path === 'react' ? `
          export const createContext=()=>({Provider:'guidance-context'});
          export const useContext=()=>globalThis.__guidanceController;
          export const useState=(...args)=>globalThis.__appUi.useState(...args);
          export const useRef=(...args)=>globalThis.__appUi.useRef(...args);
          export const useMemo=(...args)=>globalThis.__appUi.useMemo(...args);
          export const useCallback=(fn,deps)=>globalThis.__appUi.useMemo(()=>fn,deps);
          export const useEffect=(...args)=>globalThis.__appUi.useEffect(...args);
          export const useLayoutEffect=useEffect;
          export const useId=()=>globalThis.__appUi.useMemo(()=>'guidance-panel',[]);
        ` : args.path === 'react/jsx-runtime' ? `export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';`
          : args.path === 'react-dom' ? `export const createPortal=(children,surface)=>({type:'guidance-portal',props:{children,surface}});`
          : args.path === 'next/navigation' ? `export const usePathname=()=>globalThis.__guidancePath;`
          : args.path === '@/lib/store' ? `export const useStore=(...args)=>globalThis.useStore(...args);`
          : `export const TacoText='TacoText';`;
        return { contents, loader: 'js' };
      });
      api.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'guidance-css' }));
      api.onLoad({ filter: /.*/, namespace: 'guidance-css' }, () => ({ contents: '', loader: 'js' }));
    } }],
  });
  return require(outfile);
}
const provider = loadProvider();

function visibleElement(overrides = {}) {
  return Object.assign({
    isConnected: true, parentElement: null, tagName: 'DIV', style: {}, styleState: { position: 'fixed', display: 'block', visibility: 'visible', opacity: '1' },
    clientWidth: 390, clientHeight: 640, scrollTop: 0, scrollLeft: 0,
    getAttribute: () => null, hasAttribute: () => false, closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 390, bottom: 640, width: 390, height: 640 }),
    getClientRects: () => [{}], querySelectorAll: () => [], querySelector: () => null, focus() {},
  }, overrides);
}

function modalEnvironment(name = 'application-detail') {
  const trigger = visibleElement();
  const target = visibleElement({ getAttribute: attribute => attribute === 'data-guide' ? 'roles-target' : null, scrollIntoView() {} });
  const surface = visibleElement({
    getAttribute: attribute => attribute === 'data-guide-surface' ? name : attribute === 'aria-modal' ? 'true' : null,
    contains: element => [trigger, target, surface].includes(element),
    querySelectorAll: selector => selector === '[data-guide]' ? [target] : selector === '[data-tool-help]' ? [trigger] : [],
  });
  target.parentElement = surface;
  trigger.parentElement = surface;
  const modals = [surface];
  document.defaultView.getComputedStyle = element => element.styleState;
  document.querySelectorAll = selector => selector === '[data-guide-surface]' ? [surface] : selector === '[aria-modal="true"], dialog[open]' ? modals : selector === '[data-guide]' ? [target] : [];
  return { trigger, target, surface, modals };
}

const story = (toolId = 'job-search', contextKey = 'source-A', preferredChapterId = 'setup') => ({
  toolId, contextKey, preferredChapterId, version: '1', title: 'Find roles', chapters: [
    { id: 'setup', title: 'Set direction', steps: [{ id: 'target', title: 'Choose a target', description: 'Choose your real target.', anchor: 'roles-target' }] },
    { id: 'results', title: 'Review roles', availability: 'waiting', steps: [{ id: 'evidence', title: 'Inspect evidence', description: 'Wait for real results.', anchor: 'roles-evidence' }] },
  ],
});

async function setup() {
  const { ToolGuidanceProvider } = await provider;
  globalThis.__guidancePath = '/suite/job-search';
  const ui = runtime(ToolGuidanceProvider, { children: 'existing unsaved work' });
  const attributes = new Map();
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() {} };
  globalThis.document = {
    activeElement: { id: 'editor' }, defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) },
    body: {}, documentElement: { setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name), hasAttribute: name => attributes.has(name) },
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  ui.flush();
  const controller = () => ui.find(node => node.type === 'guidance-context').props.value;
  const panel = () => ui.nodes().find(node => node.type?.name === 'ToolGuidancePanel');
  return { ui, controller, panel, attributes };
}

test('registering real tool state does not auto-start, request providers or write storage', async () => {
  const { ui, controller, panel } = await setup();
  let writes = 0;
  globalThis.localStorage.setItem = () => writes++;
  globalThis.sessionStorage = { setItem: () => writes++ };
  globalThis.fetch = () => { throw Error('Guidance must not request a provider'); };
  controller().register({}, story());
  ui.flush();
  assert.equal(controller().session, null);
  assert.equal(panel(), undefined);
  assert.equal(writes, 0);
  assert.match(ui.text(), /existing unsaved work/);
});

test('one route controller selects the matching help ID among embedded tool bindings', async () => {
  const { ui, controller, panel, attributes } = await setup();
  const search = {}, preview = {};
  controller().register(search, story());
  controller().register(preview, story('ats-preview', 'resume-A'));
  ui.flush();
  controller().start('job-search');
  ui.flush();
  assert.equal(panel().props.config.toolId, 'job-search');
  assert.equal(attributes.has('data-tool-guidance-open'), true);
  controller().start('ats-preview');
  ui.flush();
  assert.equal(panel().props.config.toolId, 'ats-preview');
  assert.equal(ui.nodes().filter(node => node.type?.name === 'ToolGuidancePanel').length, 1);
});

test('availability and real preferred chapter changes preserve explanation position', async () => {
  const { ui, controller, panel } = await setup();
  const token = {}, config = story();
  controller().register(token, config); ui.flush();
  controller().start('job-search'); ui.flush();
  const next = { ...config, preferredChapterId: 'results', chapters: config.chapters.map(chapter => ({ ...chapter, availability: 'available' })) };
  controller().register(token, next); ui.flush();
  assert.equal(controller().session.position.chapterId, 'setup');
  assert.equal(panel().props.config.preferredChapterId, 'results');
  assert.equal(controller().bindings.length, 1);
});

test('context and account changes invalidate the open session without replacing work', async () => {
  const { ui, controller, panel } = await setup();
  const token = {};
  controller().register(token, story()); ui.flush();
  controller().start('job-search'); ui.flush();
  controller().register(token, story('job-search', 'source-B')); ui.flush();
  assert.equal(controller().session, null);
  assert.equal(panel(), undefined);
  controller().start('job-search'); ui.flush();
  ui.user = { uid: 'bob' }; ui.flush();
  assert.equal(controller().session, null);
  assert.match(ui.text(), /existing unsaved work/);
});

test('route changes invalidate guidance and remove shortcut ownership', async () => {
  const { ui, controller, attributes } = await setup();
  controller().register({}, story()); ui.flush();
  controller().start('job-search'); ui.flush();
  globalThis.__guidancePath = '/suite/resume'; ui.flush();
  assert.equal(controller().session, null);
  assert.equal(attributes.has('data-tool-guidance-open'), false);
});

test('unmounting an unrelated binding preserves the selected guide; selected binding removal closes it', async () => {
  const { ui, controller } = await setup();
  const search = {}, preview = {};
  controller().register(search, story());
  controller().register(preview, story('ats-preview')); ui.flush();
  controller().start('job-search'); ui.flush();
  controller().unregister(preview); ui.flush();
  assert.ok(controller().session);
  controller().unregister(search); ui.flush();
  assert.equal(controller().session, null);
});

test('Close returns to the trigger only when focus is in guidance, preserving an active editor', async () => {
  const { ui, controller, panel } = await setup();
  let focuses = 0;
  const trigger = visibleElement({ focus: () => focuses++ });
  controller().register({}, story()); ui.flush();
  controller().start('job-search', trigger); ui.flush();
  panel().props.panelRef.current = { contains: element => element.id === 'guide' };
  document.activeElement = { id: 'editor', selectionStart: 8 };
  controller().close(); ui.flush();
  assert.equal(focuses, 0);
  assert.equal(document.activeElement.selectionStart, 8);
  controller().start('job-search', trigger); ui.flush();
  panel().props.panelRef.current = { contains: element => element.id === 'guide' };
  document.activeElement = { id: 'guide' };
  controller().close(); ui.flush();
  assert.equal(focuses, 1);
});

test('explicit Close permits browser reveal of a valid offscreen trigger; invalidation never focuses it', async () => {
  const { ui, controller, panel } = await setup();
  const focusOptions = [];
  const trigger = visibleElement({
    getBoundingClientRect: () => ({ top: -500, left: 16, right: 60, bottom: -456, width: 44, height: 44 }),
    focus: options => focusOptions.push(options),
  });
  const token = {};
  controller().register(token, story()); ui.flush();
  controller().start('job-search', trigger); ui.flush();
  panel().props.panelRef.current = { contains: () => true };
  controller().close(); ui.flush();
  assert.deepEqual(focusOptions, [undefined], 'normal focus must be allowed to reveal the valid trigger');
  controller().start('job-search', trigger); ui.flush();
  controller().register(token, story('job-search', 'source-B')); ui.flush();
  assert.equal(controller().session, null);
  assert.deepEqual(focusOptions, [undefined], 'context invalidation must not restore obsolete focus');
});

test('unbound legacy help opens a readable overview in the same controller', async () => {
  const { ui, controller, panel } = await setup();
  controller().start('ats-analyzer'); ui.flush();
  assert.equal(controller().session.mode, 'overview');
  assert.equal(panel().props.config, undefined);
  controller().close(); ui.flush();
  controller().start('unknown-help-id'); ui.flush();
  assert.equal(controller().session, null);
});

test('only an internal explicit Help trigger opens the configured workflow modal surface', async () => {
  const { ui, controller, panel } = await setup();
  const { trigger, surface } = modalEnvironment();
  controller().register({}, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  controller().start('applications', visibleElement()); ui.flush();
  assert.equal(controller().session, null);
  controller().start('applications', trigger); ui.flush();
  assert.equal(controller().session.surface, surface);
  assert.equal(panel().props.session.surface, surface);
  const portal = ui.find(node => node.type === 'guidance-portal');
  assert.equal(portal.props.surface, surface);
  assert.equal(portal.props.children.type.name, 'ToolGuidancePanel');
});

test('unconfigured/auth dialogs reject start even when a Help trigger is inside', async () => {
  const { ui, controller } = await setup();
  const { trigger } = modalEnvironment('auth-dialog');
  controller().register({}, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  controller().start('applications', trigger); ui.flush();
  assert.equal(controller().session, null);
  controller().register({}, story('job-search')); ui.flush();
  controller().start('job-search', trigger); ui.flush();
  assert.equal(controller().session, null);
});

test('additional approval/auth/payment modals reject workflow guidance and never execute work', async () => {
  const { ui, controller } = await setup();
  const { trigger, modals } = modalEnvironment();
  let actions = 0;
  trigger.click = () => actions++;
  globalThis.fetch = () => { actions++; throw Error('No requests'); };
  controller().register({}, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  const competing = visibleElement({ getAttribute: attribute => attribute === 'aria-modal' ? 'true' : null });
  modals.push(competing);
  controller().start('applications', trigger); ui.flush();
  assert.equal(controller().session, null);
  assert.equal(actions, 0);
});

test('workflow session closes when its exact surface disappears and never migrates to a replacement', async () => {
  const { ui, controller, panel } = await setup();
  const { trigger, surface } = modalEnvironment();
  controller().register({}, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  controller().start('applications', trigger); ui.flush();
  assert.ok(panel());
  surface.isConnected = false;
  ui.flush();
  assert.equal(controller().session, null);
  assert.equal(panel(), undefined);
  surface.isConnected = true; ui.flush();
  assert.equal(controller().session, null);
});

test('explicit Close uses the current restarted scope and refuses hidden or obsolete-owner triggers', async () => {
  const { ui, controller, panel } = await setup();
  const token = {};
  const { trigger, surface } = modalEnvironment();
  let focuses = 0;
  trigger.focus = () => focuses++;
  controller().register(token, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  controller().start('applications', trigger); ui.flush();
  panel().props.panelRef.current = { contains: () => true };
  trigger.getClientRects = () => [];
  controller().close(); ui.flush();
  assert.equal(focuses, 0);
  trigger.getClientRects = () => [{}];
  controller().start('applications', trigger); ui.flush();
  const oldClose = controller().close;
  ui.user = { uid: 'other-owner' }; ui.flush();
  oldClose(); ui.flush();
  assert.equal(focuses, 0);
  assert.equal(surface.isConnected, true);
});

test('actual panel state pauses for an additional modal and resumes without actions or focus theft', async () => {
  const { ui, controller, panel } = await setup();
  const { trigger, modals, surface } = modalEnvironment();
  controller().register({}, { ...story('applications'), modalSurface: 'application-detail' }); ui.flush();
  controller().start('applications', trigger); ui.flush();
  const props = panel().props;
  let focuses = 0, actions = 0;
  const panelElement = visibleElement({ focus: () => focuses++, getBoundingClientRect: () => ({ top: 350, left: 16, width: 358, height: 274, right: 374, bottom: 624 }) });
  props.panelRef.current = panelElement;
  const savedDocument = document;
  const observers = [];
  globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = callback => { callback(); return 0; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.__guidanceController = controller();
  const { ToolGuidancePanel } = await provider;
  const panelUi = runtime(ToolGuidancePanel, props);
  globalThis.document = savedDocument;
  Object.assign(window, { innerWidth: 390, innerHeight: 640, getComputedStyle: element => element.styleState });
  globalThis.fetch = () => { actions++; throw Error('No request'); };
  panelUi.flush();
  const note = () => panelUi.find(node => node.type === 'aside');
  assert.equal(note().props.hidden, false);
  assert.equal(focuses, 1);
  modals.push(visibleElement({ getAttribute: name => name === 'aria-modal' ? 'true' : null }));
  observers.forEach(observer => observer.callback()); panelUi.flush();
  assert.equal(note().props.hidden, true);
  modals.pop(); observers.forEach(observer => observer.callback()); panelUi.flush();
  assert.equal(note().props.hidden, false);
  assert.equal(focuses, 1);
  assert.equal(actions, 0);
  assert.equal(surface.isConnected, true);
  panelUi.unmount();
});
