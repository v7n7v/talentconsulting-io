const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { buildSync } = require("esbuild");

const root = path.resolve(__dirname, "..");
function load(entry) {
  const result = buildSync({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    jsx: "automatic",
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const compiled = new Module(
    path.join(root, "landing-motion-test.cjs"),
    module,
  );
  compiled.filename = path.join(root, "landing-motion-test.cjs");
  compiled.paths = Module._nodeModulePaths(root);
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  return compiled.exports;
}

const motion = load("components/landing/landingMotion.ts");
const lifecycle = load("components/landing/useLandingScrollScene.ts");

test("progress clamps fast scrolls and completes safely when geometry is unavailable", () => {
  assert.equal(motion.rangeProgress(-100, 20, 120), 0);
  assert.equal(motion.rangeProgress(70, 20, 120), 0.5);
  assert.equal(motion.rangeProgress(1000, 20, 120), 1);
  assert.equal(motion.rangeProgress(70, 20, 20), 1);
  assert.equal(motion.rangeProgress(NaN, 20, 120), 1);
});

test("stage changes occur at transition midpoints, including direct scroll jumps", () => {
  for (const [position, expected] of [
    [0, 0],
    [0.309, 0],
    [0.31, 1],
    [0.649, 1],
    [0.65, 2],
    [1, 2],
  ]) {
    assert.equal(motion.journeyStage(position), expected);
  }
});

test("crossfades reserve visual continuity across each document transition", () => {
  for (const progress of [0, 0.28, 0.3, 0.31, 0.34, 0.5, 0.62, 0.65, 0.68, 1]) {
    const poses = [0, 1, 2].map((index) =>
      motion.stagePresentation(progress, index),
    );
    assert.ok(
      Math.abs(poses.reduce((total, pose) => total + pose.opacity, 0) - 1) <
        1e-9,
    );
    assert.ok(poses.every((pose) => pose.opacity >= 0 && pose.opacity <= 1));
  }
});

test("stamp approaches, contacts the paper, rebounds and settles in its reserved slot", () => {
  const start = motion.stampPose(0);
  const contact = motion.stampPose(0.48);
  const rebound = motion.stampPose(0.72);
  const end = motion.stampPose(1);
  assert.equal(start.opacity, 0);
  assert.equal(start.y, -24);
  assert.ok(start.scale > 1);
  assert.equal(contact.impact, 1);
  assert.ok(contact.scale < 1);
  assert.ok(rebound.scale > 1);
  assert.deepEqual(end, {
    opacity: 1,
    y: 0,
    scale: 1,
    rotation: -8,
    impact: 0,
  });
});

test("reverse and repeated scroll samples produce identical presentation, with no clock state", () => {
  const positions = [0, 0.2, 0.31, 0.65, 0.86, 0.91, 0.96, 1];
  const capture = (progress) => ({
    stage: motion.journeyStage(progress),
    stamp: motion.stampPose(motion.rangeProgress(progress, 0.86, 0.96)),
  });
  const forward = positions.map(capture);
  assert.deepEqual([...positions].reverse().map(capture).reverse(), forward);
  assert.deepEqual(positions.map(capture), forward);
});

function fakeBrowser() {
  const previous = {
    window: global.window,
    document: global.document,
    ResizeObserver: global.ResizeObserver,
  };
  const win = new EventTarget();
  const doc = new EventTarget();
  const pending = new Map();
  const observers = [];
  let nextId = 0;
  let fontsReady;
  win.innerWidth = 1440;
  win.innerHeight = 900;
  win.scrollY = 0;
  win.visualViewport = new EventTarget();
  win.visualViewport.height = 900;
  win.visualViewport.scale = 1;
  win.requestAnimationFrame = (callback) => {
    pending.set(++nextId, callback);
    return nextId;
  };
  win.cancelAnimationFrame = (id) => pending.delete(id);
  doc.visibilityState = "visible";
  doc.body = {};
  doc.fonts = new EventTarget();
  doc.fonts.ready = new Promise((resolve) => {
    fontsReady = resolve;
  });
  global.window = win;
  global.document = doc;
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  return {
    win,
    doc,
    pending,
    observers,
    fontsReady,
    flush() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(0));
    },
    restore() {
      Object.assign(global, previous);
    },
  };
}

test("scroll events coalesce into one frame and leave no work running while idle", () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    const frames = [];
    cleanup = lifecycle.subscribeLandingScrollScene({}, (frame) =>
      frames.push(frame),
    );
    browser.flush();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].measure, true);
    assert.equal(browser.pending.size, 0);
    browser.win.scrollY = 350;
    for (let i = 0; i < 20; i++) browser.win.dispatchEvent(new Event("scroll"));
    assert.equal(browser.pending.size, 1);
    browser.flush();
    assert.equal(frames.length, 2);
    assert.equal(frames[1].scrollY, 350);
    assert.equal(frames[1].measure, false);
    assert.equal(browser.pending.size, 0);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("hidden tabs cancel pending work and restore actual geometry and scroll position", () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    const frames = [];
    cleanup = lifecycle.subscribeLandingScrollScene({}, (frame) =>
      frames.push(frame),
    );
    browser.doc.visibilityState = "hidden";
    browser.doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(browser.pending.size, 0);
    browser.win.scrollY = 1700;
    browser.win.dispatchEvent(new Event("scroll"));
    assert.equal(browser.pending.size, 0);
    browser.doc.visibilityState = "visible";
    browser.doc.dispatchEvent(new Event("visibilitychange"));
    browser.flush();
    assert.equal(frames.length, 1);
    assert.equal(frames[0].scrollY, 1700);
    assert.equal(frames[0].measure, true);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("resizes, font completion and page restoration invalidate cached measurements", async () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    const frames = [];
    cleanup = lifecycle.subscribeLandingScrollScene({}, (frame) =>
      frames.push(frame),
    );
    browser.flush();
    for (const type of [
      "resize",
      "orientationchange",
      "pageshow",
      "taco:landing-layout",
    ]) {
      browser.win.dispatchEvent(new Event(type));
      browser.flush();
      assert.equal(frames.at(-1).measure, true);
    }
    browser.fontsReady();
    await Promise.resolve();
    assert.equal(browser.pending.size, 1);
    browser.flush();
    assert.equal(frames.at(-1).measure, true);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("Strict Mode cleanup prevents duplicate subscriptions and late font callbacks", async () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    let staleCalls = 0;
    let liveCalls = 0;
    const firstCleanup = lifecycle.subscribeLandingScrollScene(
      {},
      () => staleCalls++,
    );
    firstCleanup();
    cleanup = lifecycle.subscribeLandingScrollScene({}, () => liveCalls++);
    browser.fontsReady();
    await Promise.resolve();
    browser.win.dispatchEvent(new Event("scroll"));
    browser.flush();
    assert.equal(staleCalls, 0);
    assert.equal(liveCalls, 1);
    cleanup();
    browser.win.dispatchEvent(new Event("resize"));
    browser.doc.fonts.dispatchEvent(new Event("loadingdone"));
    assert.equal(browser.pending.size, 0);
    assert.ok(browser.observers.every((observer) => observer.disconnected));
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("pinch panning invalidates geometry and exposes scale without mixing layout coordinates", () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    const frames = [];
    cleanup = lifecycle.subscribeLandingScrollScene({}, (frame) =>
      frames.push(frame),
    );
    browser.flush();
    browser.win.visualViewport.scale = 2;
    browser.win.visualViewport.height = 450;
    browser.win.scrollY = 1000;
    browser.win.visualViewport.dispatchEvent(new Event("scroll"));
    browser.flush();
    assert.equal(frames.at(-1).viewportHeight, 900);
    assert.equal(frames.at(-1).viewportScale, 2);
    assert.equal(frames.at(-1).scrollY, 1000);
    assert.equal(frames.at(-1).measure, true);
    cleanup();
    browser.win.visualViewport.dispatchEvent(new Event("scroll"));
    assert.equal(browser.pending.size, 0);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("system reduced-motion preference changes notify the shared store and clean up", () => {
  const browser = fakeBrowser();
  let cleanup;
  try {
    const query = new EventTarget();
    browser.win.matchMedia = (text) => {
      assert.equal(text, "(prefers-reduced-motion: reduce)");
      return query;
    };
    let calls = 0;
    cleanup = lifecycle.subscribeReducedMotion(() => calls++);
    query.dispatchEvent(new Event("change"));
    assert.equal(calls, 1);
    cleanup();
    query.dispatchEvent(new Event("change"));
    assert.equal(calls, 1);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("every static example contains all three documents and one review stamp without duplicate IDs", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { CareerJourneyDemo } = load(
    "components/landing/CareerJourneyDemo.tsx",
  );
  const { LANDING_EXAMPLES } = load("components/landing/landingExamples.ts");
  for (const example of LANDING_EXAMPLES) {
    const html = renderToStaticMarkup(
      React.createElement(CareerJourneyDemo, {
        example,
        motionEnabled: false,
      }),
    );
    assert.equal((html.match(/<article\b/g) || []).length, 3, example.id);
    assert.equal((html.match(/FOR REVIEW/g) || []).length, 1, example.id);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(
      new Set(ids).size,
      ids.length,
      "document and heading IDs must be unique",
    );
    for (const content of [example.source, example.rewrite, example.gap])
      assert.ok(html.includes(content), content);
    assert.ok(
      !/<article[^>]+(?:aria-hidden="true"|\sinert=)/.test(html),
      "static documents must remain accessible",
    );
    assert.ok(
      !/Play walkthrough|Follow scroll|Motion on|Motion off|Step [123] of 3/.test(
        html,
      ),
    );
  }
});

test("static hero preserves source and draft and exposes only one accessible copy of each", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { AnimatedCareerExample } = load(
    "components/landing/AnimatedCareerExample.tsx",
  );
  const { LANDING_EXAMPLES } = load("components/landing/landingExamples.ts");
  for (const example of LANDING_EXAMPLES) {
    const html = renderToStaticMarkup(
      React.createElement(AnimatedCareerExample, {
        example,
        motionEnabled: false,
        onExampleChange() {},
      }),
    );
    const readable = html
      .replace(/<span aria-hidden="true">[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "");
    assert.equal(readable.split(example.source).length - 1, 1);
    assert.equal(readable.split(example.rewrite).length - 1, 1);
    assert.ok(html.includes('data-writing="complete"'));
    assert.ok(!html.includes("hero-writing-cursor"));
    const enabledHtml = renderToStaticMarkup(
      React.createElement(AnimatedCareerExample, {
        example,
        motionEnabled: true,
        onExampleChange() {},
      }),
    );
    assert.ok(enabledHtml.includes('data-writing="complete"'));
    assert.ok(!enabledHtml.includes("hero-writing-cursor"));
  }
});

const heroCycle = load("components/landing/heroExampleCycle.ts");

function fakeHeroBrowser() {
  const browser = fakeBrowser();
  const previous = { IntersectionObserver: global.IntersectionObserver, performance: global.performance };
  const timers = new Map();
  const observers = [];
  let now = 0;
  let nextId = 0;
  const element = new EventTarget();
  const child = {};
  element.contains = (node) => node === element || node === child;
  element.matches = () => false;
  browser.win.matchMedia = () => ({ matches: true });
  browser.win.setTimeout = (callback, delay) => {
    timers.set(++nextId, { callback, at: now + delay });
    return nextId;
  };
  browser.win.clearTimeout = (id) => timers.delete(id);
  global.performance = { now: () => now };
  global.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  return {
    ...browser,
    element,
    child,
    timers,
    cycleObservers: observers,
    intersect(ratio = 1) {
      observers.at(-1).callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    },
    event(type, properties = {}) {
      element.dispatchEvent(Object.assign(new Event(type), properties));
    },
    advance(ms) {
      now += ms;
      const frames = [...browser.pending.values()];
      browser.pending.clear();
      frames.forEach((callback) => callback(now));
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    restore() {
      Object.assign(global, previous);
      browser.restore();
    },
  };
}

test("hero writes for two seconds, holds readable text, and cycles every five seconds beyond a full loop", () => {
  const browser = fakeHeroBrowser();
  const { LANDING_EXAMPLES } = load("components/landing/landingExamples.ts");
  let cleanup;
  let selected = 0;
  const seen = [LANDING_EXAMPLES[selected].id];
  const progress = [];
  const mount = () => {
    cleanup = heroCycle.subscribeHeroExampleCycle(browser.element, (value) => progress.push(value), () => {
      cleanup();
      selected = (selected + 1) % LANDING_EXAMPLES.length;
      seen.push(LANDING_EXAMPLES[selected].id);
      mount();
    });
    browser.intersect();
  };
  try {
    mount();
    for (let cycle = 0; cycle < 7; cycle++) {
      assert.equal(progress.at(-1), 0, "each role starts writing again");
      browser.advance(1000);
      assert.equal(progress.at(-1), 0.5);
      browser.advance(1000);
      assert.equal(progress.at(-1), 1);
      assert.equal(browser.pending.size, 0, "no animation frames during reading time");
      browser.advance(2999);
      assert.equal(seen.length, cycle + 1);
      browser.advance(1);
      assert.equal(seen.length, cycle + 2);
      assert.equal(browser.timers.size, 1);
    }
    assert.deepEqual(seen, ["designer", "engineer", "marketer", "designer", "engineer", "marketer", "designer", "engineer"]);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("hero pauses for reading, hidden tabs and offscreen content, then restarts with a full dwell", () => {
  const browser = fakeHeroBrowser();
  let cleanup;
  let advances = 0;
  let progress;
  try {
    cleanup = heroCycle.subscribeHeroExampleCycle(browser.element, (value) => { progress = value; }, () => advances++);
    browser.intersect();
    browser.advance(1000);
    const pauses = [
      [() => browser.event("pointerenter", { pointerType: "mouse" }), () => browser.event("pointerleave")],
      [() => browser.event("focusin"), () => browser.event("focusout", { relatedTarget: null })],
      [() => browser.intersect(0.1), () => browser.intersect()],
      [() => { browser.doc.visibilityState = "hidden"; browser.doc.dispatchEvent(new Event("visibilitychange")); },
        () => { browser.doc.visibilityState = "visible"; browser.doc.dispatchEvent(new Event("visibilitychange")); }],
    ];
    for (const [pause, resume] of pauses) {
      pause();
      assert.equal(progress, 1);
      assert.equal(browser.pending.size, 0);
      assert.equal(browser.timers.size, 0);
      browser.advance(15000);
      assert.equal(advances, 0);
      resume();
      browser.advance(4999);
      assert.equal(advances, 0);
    }
    browser.advance(1);
    assert.equal(advances, 1);
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("manual changes and Strict Mode cleanup cancel old cycles and delayed observer callbacks", () => {
  const browser = fakeHeroBrowser();
  let cleanup;
  let advances = 0;
  let staleProgress = 0;
  try {
    cleanup = heroCycle.subscribeHeroExampleCycle(browser.element, () => staleProgress++, () => advances++);
    browser.intersect();
    browser.advance(4500);
    const staleObserver = browser.cycleObservers[0];
    cleanup();
    const previousProgress = staleProgress;
    staleObserver.callback([{ isIntersecting: true, intersectionRatio: 1 }]);
    assert.equal(staleProgress, previousProgress);
    cleanup = heroCycle.subscribeHeroExampleCycle(browser.element, () => {}, () => advances++);
    browser.intersect();
    browser.advance(500);
    assert.equal(advances, 0, "old role's deadline cannot change the new selection");
    browser.advance(4500);
    assert.equal(advances, 1);
    cleanup();
    browser.doc.dispatchEvent(new Event("visibilitychange"));
    browser.event("pointerleave");
    browser.advance(10000);
    assert.equal(advances, 1);
    assert.equal(browser.pending.size, 0);
    assert.equal(browser.timers.size, 0);
    assert.ok(browser.cycleObservers.every((observer) => observer.disconnected));
  } finally {
    cleanup?.();
    browser.restore();
  }
});

test("hero leaves the static text alone when intersection observation is unavailable", () => {
  const browser = fakeHeroBrowser();
  try {
    global.IntersectionObserver = undefined;
    const cleanup = heroCycle.subscribeHeroExampleCycle(browser.element,
      () => assert.fail("static text must not be hidden"),
      () => assert.fail("roles must not rotate without visibility information"));
    browser.advance(10000);
    assert.equal(browser.timers.size, 0);
    cleanup();
  } finally {
    browser.restore();
  }
});
