/**
 * The upload feature, and the one thing it exists to guarantee: a number on
 * screen was measured.
 *
 * Three kinds of test live here, and the split is deliberate.
 *
 *   1. The pure state machine, driven directly. `lib/upload/file-upload-types.ts`
 *      is free of React, Firebase and the DOM precisely so this is possible.
 *   2. REAL EXECUTION of the transport, the hook and the card, through
 *      `scripts/upload-test-harness.js` — which bundles the genuine source and
 *      replaces only Firebase, the auth-header helper, mammoth and React.
 *   3. Source assertions, kept only where the source IS the artifact: CSS
 *      rules, and lint-shaped rules about which class names may appear.
 *
 * (2) exists because (3) used to stand in for it. A regex over source text
 * certifies nothing about behaviour: `if (isStale()) { }` with an empty body
 * satisfies an assertion that "isStale() precedes dispatch(", a prose comment
 * satisfies `assert.match(hook, /isConnected/)`, and this suite was green while
 * the stall watchdog told users they had cancelled an upload they never
 * touched. Where a behaviour can be executed, it is executed.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const {
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
} = require('./upload-test-harness.js');

/**
 * focusTrigger warns in development when it has nowhere to put focus. That is
 * correct behaviour and is asserted below — but most hook tests mount no DOM at
 * all, and the warning is deferred onto a task, so it lands after whichever
 * test caused it has finished. Filtered for the whole file rather than per
 * test, so it cannot be mistaken for a finding.
 */
const realConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('focus was returned with no trigger')) return;
  realConsoleError(...args);
};

async function loadUploadCore() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-file-upload-state-'));
  const outfile = path.join(outdir, 'file-upload-types.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/upload/file-upload-types.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const corePromise = loadUploadCore();

/** Drive a list of events through the reducer from the initial state. */
function drive(core, events) {
  return events.reduce((state, event) => core.uploadReducer(state, event), core.initialUploadState);
}

const SELECT = {
  type: 'select',
  fileName: 'Alexandra-Konstantinopoulos-Senior-Staff-Engineer-Resume-2026-FINAL-v7.pdf',
  totalBytes: 2_400_000,
  transportCanPause: true,
};

/* ------------------------------------------------------------------ percent */

test('percent is null in every phase that has nothing to measure', async () => {
  const core = await corePromise;

  const queued = drive(core, [SELECT]);
  assert.equal(queued.phase, 'queued');
  assert.equal(queued.percent, null, 'queued must not report a percentage');
  assert.equal(queued.indeterminate, true);
  assert.equal(queued.barVisible, false);

  const transferringUnmeasured = drive(core, [SELECT, { type: 'transfer-start' }]);
  assert.equal(transferringUnmeasured.percent, null, 'no byte event yet means no percentage');
  assert.equal(transferringUnmeasured.indeterminate, true);

  const parsing = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 2_400_000, totalBytes: 2_400_000 },
    { type: 'parse-start' },
  ]);
  assert.equal(parsing.phase, 'parsing');
  assert.equal(parsing.percent, null, 'the parse step emits no increments; it must show no number');
  assert.equal(parsing.indeterminate, true);
  assert.equal(parsing.barVisible, true, 'the parse step is still activity, and says so');
});

test('percent is never 0 on an error or a cancel', async () => {
  const core = await corePromise;

  const failed = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 600_000, totalBytes: 2_400_000 },
    { type: 'fail', code: 'PARSE_FAILED', message: 'Failed to read this resume.' },
  ]);
  assert.equal(failed.phase, 'error');
  assert.equal(failed.percent, null, 'an error is not 0%');
  assert.equal(failed.barVisible, false, 'the bar is removed on error, not zeroed');
  assert.equal(failed.bytesTransferred, 600_000, 'the bytes that really moved survive');

  const cancelled = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 1_100_000, totalBytes: 2_400_000 },
    { type: 'cancel' },
  ]);
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.percent, null, 'a cancel is not 0%');
  assert.equal(cancelled.barVisible, false);
  assert.equal(cancelled.bytesTransferred, 1_100_000);
});

test('a real byte event produces a real percentage, floored', async () => {
  const core = await corePromise;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_560_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(state.percent, 65);
  assert.equal(state.measured, true);
  assert.equal(state.indeterminate, false);
  assert.equal(state.barVisible, true);

  // Floor, not round: 99.6% must not read as finished while bytes remain.
  const nearlyDone = core.uploadReducer(state, {
    type: 'progress',
    bytesTransferred: 2_390_000,
    totalBytes: 2_400_000,
  });
  assert.equal(nearlyDone.percent, 99);
});

test('a repeated byte event returns the same state object, so nothing re-renders', async () => {
  const core = await corePromise;
  const measured = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_560_000, totalBytes: 2_400_000 },
  ]);

  const repeated = core.uploadReducer(measured, {
    type: 'progress',
    bytesTransferred: 1_560_000,
    totalBytes: 2_400_000,
  });
  assert.equal(repeated, measured, 'an identical measurement must not allocate a new state');

  // The FIRST event still has to be applied even if the numbers happen to
  // match, because it is what flips `measured` and `indeterminate`.
  const first = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 0, totalBytes: 2_400_000 },
  ]);
  assert.equal(first.measured, true);
  assert.equal(first.indeterminate, false);
});

test('progress is clamped to the file the user picked, not the wire size', async () => {
  const core = await corePromise;
  // FormData reports a larger total than the file; transports scale into
  // file.size, and the reducer refuses anything past it regardless.
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 3_000_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(state.bytesTransferred, 2_400_000);
  assert.equal(state.percent, 100);
});

test('a zero or missing total never becomes a percentage', async () => {
  const core = await corePromise;
  const state = drive(core, [
    { type: 'select', fileName: 'empty.txt', totalBytes: 0, transportCanPause: false },
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 0, totalBytes: 0 },
  ]);
  assert.equal(state.percent, null, 'dividing by an unknown total must not yield 0%');
  assert.equal(state.measured, false);
});

/* ------------------------------------------------- the 250ms suppression rule */

test('the bar only appears once the transfer has survived the suppression window', async () => {
  const core = await corePromise;

  // A small file finishes before bar-eligible ever fires.
  const fast = drive(core, [
    { type: 'select', fileName: 'short.pdf', totalBytes: 400_000, transportCanPause: false },
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 400_000, totalBytes: 400_000 },
  ]);
  assert.equal(fast.barVisible, false, 'a sub-250ms transfer shows no bar at all');
  assert.equal(fast.percent, 100, 'the measurement is still real; it is just not drawn');

  const slow = core.uploadReducer(fast, { type: 'bar-eligible' });
  assert.equal(slow.barVisible, true);
});

test('bar-eligible outside a transfer is a no-op', async () => {
  const core = await corePromise;
  const queued = drive(core, [SELECT, { type: 'bar-eligible' }]);
  assert.equal(queued.barEligible, false);
  assert.equal(queued.barVisible, false);
});

test('the eligibility latch survives a pause inside the suppression window', async () => {
  const core = await corePromise;

  // The 250ms timer fires exactly once and is never re-armed. If `bar-eligible`
  // is dropped because the user happened to press pause first, the bar is gone
  // for the whole rest of the transfer — and the symptom is worse than a
  // missing bar, because a frozen bar shown while paused that vanishes on
  // resume reads as a broken control.
  const resumed = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 500_000, totalBytes: 2_400_000 },
    { type: 'pause' },
    { type: 'bar-eligible' },
    { type: 'resume' },
    { type: 'progress', bytesTransferred: 1_200_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(resumed.phase, 'transferring');
  assert.equal(resumed.barEligible, true, 'the latch has to land while paused');
  assert.equal(resumed.barVisible, true, 'and still be drawn after the resume');
  assert.equal(resumed.percent, 50);

  // Pause must not force the bar on either.
  const pausedEarly = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 500_000, totalBytes: 2_400_000 },
    { type: 'pause' },
  ]);
  assert.equal(pausedEarly.barEligible, false);
  assert.equal(pausedEarly.barVisible, false, 'pause follows barEligible, like resume and progress');
});

test('a parse with no transfer behind it pays the suppression window too', async () => {
  const core = await corePromise;

  // localTextExtractionTransport goes queued -> parsing with no network in
  // between. Forcing the bar there painted the traversing segment from frame 0
  // for a mammoth read that often finishes in tens of milliseconds — the exact
  // one-frame bar TRANSFER_BAR_DELAY_MS exists to prevent.
  const localParse = drive(core, [
    { type: 'select', fileName: 'cover-letter.docx', totalBytes: 84_000, transportCanPause: false },
    { type: 'parse-start' },
  ]);
  assert.equal(localParse.phase, 'parsing');
  assert.equal(localParse.barVisible, false, 'no transfer means the window has not been paid');

  const stillGoing = core.uploadReducer(localParse, { type: 'bar-eligible' });
  assert.equal(stillGoing.barVisible, true, 'and the latch has to be reachable from parsing');

  // A parse that DOES follow a real transfer keeps the bar: the window was
  // already paid on the way here, and removing it at the handover would read as
  // the upload having stopped.
  const afterTransfer = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 2_400_000, totalBytes: 2_400_000 },
    { type: 'parse-start' },
  ]);
  assert.equal(afterTransfer.barVisible, true);
});

/* ------------------------------------------------------------------- pausing */

test('pause is only reachable when the transport can really pause', async () => {
  const core = await corePromise;

  const pausable = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_200_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(pausable.canPause, true);

  const paused = core.uploadReducer(pausable, { type: 'pause' });
  assert.equal(paused.phase, 'paused');
  assert.equal(paused.percent, 50, 'a paused transfer holds its last real measurement');
  assert.equal(paused.canPause, false);
  assert.equal(paused.canResume, true);

  const resumed = core.uploadReducer(paused, { type: 'resume' });
  assert.equal(resumed.phase, 'transferring');
  assert.equal(resumed.canPause, true);
  assert.equal(resumed.canResume, false);
});

test('a transport that cannot pause never offers the control', async () => {
  const core = await corePromise;
  const state = drive(core, [
    { type: 'select', fileName: 'small.pdf', totalBytes: 900_000, transportCanPause: false },
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 450_000, totalBytes: 900_000 },
  ]);
  assert.equal(state.canPause, false);

  const unchanged = core.uploadReducer(state, { type: 'pause' });
  assert.equal(unchanged.phase, 'transferring', 'pause on an unpausable transport does nothing');
});

test('progress arriving while paused does not move the frozen measurement', async () => {
  const core = await corePromise;
  const paused = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 1_200_000, totalBytes: 2_400_000 },
    { type: 'pause' },
  ]);
  const late = core.uploadReducer(paused, {
    type: 'progress',
    bytesTransferred: 1_900_000,
    totalBytes: 2_400_000,
  });
  assert.equal(late.percent, 50);
  assert.equal(late.phase, 'paused');
});

/* ---------------------------------------------------------- terminal states */

test('terminal states have no exits', async () => {
  const core = await corePromise;
  const base = drive(core, [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }]);

  for (const terminal of [
    core.uploadReducer(base, { type: 'succeed' }),
    core.uploadReducer(base, { type: 'fail', code: 'PARSE_FAILED', message: 'no' }),
    core.uploadReducer(base, { type: 'cancel' }),
  ]) {
    assert.equal(core.isTerminalPhase(terminal.phase), true);
    for (const event of [
      { type: 'progress', bytesTransferred: 10, totalBytes: 100 },
      { type: 'pause' },
      { type: 'resume' },
      { type: 'cancel' },
      { type: 'parse-start' },
      { type: 'bar-eligible' },
      { type: 'succeed' },
    ]) {
      assert.equal(
        core.uploadReducer(terminal, event),
        terminal,
        `${event.type} after ${terminal.phase} must be a no-op`,
      );
    }
    // Only a fresh selection or an explicit reset leaves a terminal state.
    assert.equal(core.uploadReducer(terminal, { type: 'reset' }).phase, 'idle');
    assert.equal(core.uploadReducer(terminal, SELECT).phase, 'queued');
  }
});

test('success reports a full transfer and takes the bar away', async () => {
  const core = await corePromise;
  const done = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 2_400_000, totalBytes: 2_400_000 },
    { type: 'parse-start' },
    { type: 'succeed' },
  ]);
  assert.equal(done.phase, 'done');
  assert.equal(done.percent, 100, 'completion means every byte went — that 100 is measured');
  assert.equal(done.bytesTransferred, 2_400_000);
  assert.equal(done.barVisible, false);
  assert.equal(done.canCancel, false);
  assert.equal(done.canPause, false);
});

test('a success with nothing measured claims no bytes and no percentage', async () => {
  const core = await corePromise;
  // localTextExtractionTransport reads the file in the browser: there is no
  // transfer, so it never emits a progress event. Back-filling file.size and
  // 100% on completion would put a synthesised byte count in state right next
  // to `measured: false`.
  const done = drive(core, [
    { type: 'select', fileName: 'notes.docx', totalBytes: 84_000, transportCanPause: false },
    { type: 'parse-start' },
    { type: 'succeed' },
  ]);
  assert.equal(done.phase, 'done');
  assert.equal(done.measured, false);
  assert.equal(done.percent, null, 'nothing counted, so there is no 100 to report');
  assert.equal(done.bytesTransferred, null, 'and no byte count either');
  assert.equal(done.totalBytes, 84_000, 'the size the user picked is still known');
});

test('a fresh selection wipes the previous failure', async () => {
  const core = await corePromise;
  const failed = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'fail', code: 'SCANNED_PDF', message: 'image-based' },
  ]);
  assert.equal(failed.error.code, 'SCANNED_PDF');

  const reselected = core.uploadReducer(failed, {
    type: 'select',
    fileName: 'second.docx',
    totalBytes: 120_000,
    transportCanPause: false,
  });
  assert.equal(reselected.error, null);
  assert.equal(reselected.phase, 'queued');
  assert.equal(reselected.percent, null);
  assert.equal(reselected.barEligible, false);
});

/* ------------------------------------------------------- recovery and copy */

test('a scanned PDF is never offered a retry that cannot succeed', async () => {
  const core = await corePromise;
  const options = core.recoveryOptionsFor({
    code: 'SCANNED_PDF',
    message: 'image-based',
    retryAfterSeconds: null,
  });
  const actions = options.map((option) => option.action);
  assert.deepEqual(actions, ['choose-word', 'paste']);
  assert.equal(actions.includes('retry'), false, 'the same image-only PDF fails the same way');
});

test('an auth failure routes to sign-in, which is what makes auto-retry possible', async () => {
  const core = await corePromise;
  const actions = core
    .recoveryOptionsFor({ code: 'AUTH_REQUIRED', message: 'sign in', retryAfterSeconds: null })
    .map((option) => option.action);
  assert.deepEqual(actions, ['sign-in']);
});

test('every error code has a recovery path', async () => {
  const core = await corePromise;
  const codes = Object.keys(core.UPLOAD_RECOVERY);
  assert.ok(codes.length >= 8);
  for (const code of codes) {
    const options = core.recoveryOptionsFor({ code, message: '', retryAfterSeconds: null });
    assert.ok(options.length > 0, `${code} must offer something the user can do`);
  }
});

test('the indeterminate phase has no aria value text to report', async () => {
  const core = await corePromise;
  const parsing = drive(core, [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }]);
  assert.equal(
    core.progressValueText(parsing),
    null,
    'no percent means no aria-valuetext — an absent value is the indeterminate signal',
  );

  const measured = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'progress', bytesTransferred: 1_200_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(core.progressValueText(measured), '50 percent, 1.1 MB of 2.3 MB');
});

test('the live region says something different for every phase it can reach', async () => {
  const core = await corePromise;
  const spoken = new Set();
  const paths = [
    [SELECT],
    [SELECT, { type: 'transfer-start' }],
    [SELECT, { type: 'transfer-start' }, { type: 'progress', bytesTransferred: 1, totalBytes: 2 }, { type: 'pause' }],
    [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }],
    [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }, { type: 'succeed' }],
    [SELECT, { type: 'transfer-start' }, { type: 'fail', code: 'NETWORK', message: 'offline' }],
    [SELECT, { type: 'transfer-start' }, { type: 'cancel' }],
  ];
  for (const events of paths) {
    const line = core.uploadPhaseAnnouncement(drive(core, events));
    assert.ok(line, 'every reachable phase has an announcement');
    spoken.add(line);
  }
  // Seven utterances is the whole budget for an upload; they must not repeat.
  assert.equal(spoken.size, paths.length);
});

test('"Upload complete" is only announced when bytes actually moved', async () => {
  const core = await corePromise;

  // A network transfer really did complete, so saying so is true.
  const overTheWire = core.uploadPhaseAnnouncement(
    drive(core, [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }]),
  );
  assert.match(overTheWire, /^Upload complete\./);

  // localTextExtractionTransport reads the file in the browser and never
  // touches the network: queued -> parsing, with no transfer-start between.
  // Announcing an upload that did not happen describes an event to a
  // screen-reader user that never occurred.
  const inTheBrowser = core.uploadPhaseAnnouncement(
    drive(core, [SELECT, { type: 'parse-start' }]),
  );
  assert.doesNotMatch(inTheBrowser, /Upload complete/);
  assert.match(inTheBrowser, /^Reading /);
  // The honest half of the claim survives on both paths.
  assert.match(inTheBrowser, /No progress available for this step\./);
});

test('milestones only fire once each, in order', async () => {
  const core = await corePromise;
  assert.equal(core.nextMilestone(10, null), null);
  assert.equal(core.nextMilestone(30, null), 25);
  assert.equal(core.nextMilestone(30, 25), null);
  assert.equal(core.nextMilestone(80, 25), 75, 'a jump past two milestones announces the latest only');
  assert.equal(core.nextMilestone(99, 75), null);
  assert.equal(core.nextMilestone(null, null), null);
});

/* ---------------------------------------------------------------- formatting */

test('formatBytes returns null for anything unmeasured, never "0 B"', async () => {
  const core = await corePromise;
  assert.equal(core.formatBytes(null), null);
  assert.equal(core.formatBytes(undefined), null);
  assert.equal(core.formatBytes(Number.NaN), null);
  assert.equal(core.formatBytes(-1), null);
  assert.equal(core.formatBytes(0), '0 B', 'a measured zero is allowed; an unknown one is not');
  assert.equal(core.formatBytes(1024), '1.0 KB');
  assert.equal(core.formatBytes(2_400_000), '2.3 MB');
  assert.equal(core.formatByteRange(1_468_006, 2_400_000), '1.4 MB of 2.3 MB');
  assert.equal(core.formatByteRange(null, 2_400_000), null);
  assert.equal(core.formatByteRange(1_000, null), null);
});

/* ------------------------------------------------------- the one accept spec */

test('the accept spec matches what the parse route will actually take', async () => {
  const core = await corePromise;
  const route = fs.readFileSync(
    path.join(repoRoot, 'app/api/gauntlet/parse-resume/route.ts'),
    'utf8',
  );
  const declared = route.match(/const VALID_EXTENSIONS = \[([^\]]+)\]/);
  assert.ok(declared, 'the route still declares VALID_EXTENSIONS');
  const routeExtensions = declared[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    [...core.RESUME_ACCEPT.extensions].sort(),
    routeExtensions,
    'the client accept spec and the server allow-list must not drift apart',
  );
  assert.ok(core.RESUME_ACCEPT.attr.includes('.pdf'));
  assert.ok(core.RESUME_ACCEPT.attr.includes('application/pdf'));
  // Writing tools extract with mammoth in the browser, which cannot read PDF.
  assert.equal(core.DOCUMENT_TEXT_ACCEPT.extensions.includes('.pdf'), false);
});

test('validation rejects on extension and size, and reports which', async () => {
  const core = await corePromise;
  const tooBig = core.checkFileAgainstAccept(
    { name: 'resume.pdf', size: 11 * 1024 * 1024 },
    core.RESUME_ACCEPT,
    core.AUTHENTICATED_MAX_BYTES,
  );
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.code, 'FILE_TOO_LARGE');
  assert.match(tooBig.message, /10MB/);

  const wrongType = core.checkFileAgainstAccept(
    { name: 'resume.pages', size: 10_000 },
    core.RESUME_ACCEPT,
    core.AUTHENTICATED_MAX_BYTES,
  );
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.code, 'UNSUPPORTED_TYPE');

  const good = core.checkFileAgainstAccept(
    { name: 'Resume.PDF', size: 10_000 },
    core.RESUME_ACCEPT,
    core.AUTHENTICATED_MAX_BYTES,
  );
  assert.equal(good.ok, true);
  assert.equal(good.extension, '.pdf');
});

/* ------------------------------------------- constants that mirror real code */

test('the pause threshold and parse deadlines mirror the systems they describe', async () => {
  const core = await corePromise;

  // uploadBytesResumable degrades to a single-shot PUT at or below 256KB, and a
  // single-shot PUT cannot pause.
  assert.equal(core.RESUMABLE_PAUSE_MIN_BYTES, 256 * 1024);
  assert.equal(core.DIRECT_UPLOAD_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(core.AUTHENTICATED_MAX_BYTES, 10 * 1024 * 1024);

  // The deadlines come from the route's worker timeout, not from taste.
  const route = fs.readFileSync(
    path.join(repoRoot, 'app/api/gauntlet/parse-resume/route.ts'),
    'utf8',
  );
  const timeout = route.match(/timeoutMs:\s*isAnon\s*\?\s*(\d[\d_]*)\s*:\s*(\d[\d_]*)/);
  assert.ok(timeout, 'the route still sets a worker timeout');
  assert.equal(core.PARSE_DEADLINE_SECONDS.anonymous * 1000, Number(timeout[1].replace(/_/g, '')));
  assert.equal(core.PARSE_DEADLINE_SECONDS.signedIn * 1000, Number(timeout[2].replace(/_/g, '')));

  // Worded as a deadline. A countdown would be a progress number for a step
  // that emits no progress.
  const note = core.parseDeadlineNote(false);
  assert.match(note, /8 seconds/);
  assert.doesNotMatch(note, /remaining|left|\d+%/i);
});

/* ============================================================================
   REAL EXECUTION — the transport
   ========================================================================== */

/**
 * Start a run of the resume transport and hand back everything a test needs to
 * drive it. `settled` is attached synchronously so an unawaited rejection can
 * never surface as an unhandled one.
 */
function startRun(transportModule, file, transport) {
  const controller = new AbortController();
  const seen = { phases: [], progress: [], controls: undefined };
  const chosen = transport ?? transportModule.resumeUploadTransport;
  const promise = chosen.run({
    file,
    signal: controller.signal,
    onTransferStart: () => seen.phases.push('transfer-start'),
    onProgress: (bytes, total) => seen.progress.push([bytes, total]),
    onParseStart: () => seen.phases.push('parse-start'),
    registerPauseControls: (controls) => {
      seen.controls = controls;
    },
  });
  const settled = promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
  return { controller, seen, settled };
}

function pdf(bytes, name = 'resume.pdf') {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

/** Set the world up for one transport test and tear it back down afterwards. */
async function withTransport(fn) {
  const state = resetUploadTestState();
  const modules = await loadUploadModules();
  const restore = installBrowserGlobals();
  const timers = installFakeTimers();
  try {
    return await fn({ state, modules, timers, transport: modules.transport, core: modules.core });
  } finally {
    timers.restore();
    restore();
  }
}

test('a dead socket is reported as a network stall, never as a cancellation', async () => {
  await withTransport(async ({ transport, timers }) => {
    const { settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();

    const xhr = FakeXhr.instances.at(-1);
    assert.ok(xhr, 'the direct transport really opened an XMLHttpRequest');
    xhr.progress(400, 1_000);

    // Silence for STALL_TIMEOUT_MS. The watchdog aborts the XHR, and
    // `xhr.abort()` dispatches the `abort` event SYNCHRONOUSLY — so if it
    // aborts before it settles, the abort listener wins the race and the user
    // is told "Upload cancelled." for a transfer they never touched, in error
    // ink, with the live region saying "Upload failed. Upload cancelled."
    timers.advance(45_000);

    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, 'NETWORK');
    assert.equal(
      outcome.error.message,
      'The upload stopped responding. Try again.',
      'the watchdog has to settle before it aborts, or its own message is unreachable',
    );
    assert.notEqual(outcome.error.message, 'Upload cancelled.');
    assert.equal(xhr.aborted, true, 'and the socket is still torn down');
  });
});

test('a genuine user cancel still reads as a cancellation', async () => {
  await withTransport(async ({ transport }) => {
    const { controller, settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();

    controller.abort();
    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, 'NETWORK');
    assert.equal(outcome.error.message, 'Upload cancelled.');
  });
});

test('the stall watchdog is reset by every event on the request', async () => {
  await withTransport(async ({ transport, timers }) => {
    const { settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    const xhr = FakeXhr.instances.at(-1);

    // A slow but living upload must not be killed. Each event re-arms the
    // timer, so advancing by the full window between events never fires it.
    for (let i = 1; i <= 5; i += 1) {
      xhr.progress(i * 100, 1_000);
      timers.advance(44_000);
    }
    xhr.respond(200, { text: 'x'.repeat(200), fileName: 'resume.pdf', sourceType: 'direct' });

    const outcome = await settled;
    assert.equal(outcome.ok, true, 'a transfer that keeps talking is never stalled out');
  });
});

test('an upload event carrying no bytes is not reported as a measured zero', async () => {
  await withTransport(async ({ transport }) => {
    const { seen, settled } = startRun(transport, pdf(2_400_000));
    await flushMicrotasks();
    const xhr = FakeXhr.instances.at(-1);

    xhr.progress(0, 2_500_000);
    assert.deepEqual(seen.progress, [], 'loaded === 0 carries no measurement');

    xhr.progress(0, 2_500_000, false);
    assert.deepEqual(seen.progress, [], 'and neither does lengthComputable === false');

    xhr.progress(1_250_000, 2_500_000);
    assert.deepEqual(
      seen.progress,
      [[1_200_000, 2_400_000]],
      'a real event is scaled onto the size the user picked, not the multipart wire size',
    );

    xhr.respond(200, { text: 'x'.repeat(200), fileName: 'resume.pdf', sourceType: 'direct' });
    await settled;
  });
});

test('the upload completing is what starts the unmeasurable phase', async () => {
  await withTransport(async ({ transport }) => {
    const { seen, settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    const xhr = FakeXhr.instances.at(-1);

    assert.deepEqual(seen.phases, ['transfer-start']);
    xhr.upload.dispatch('load', {});
    assert.deepEqual(seen.phases, ['transfer-start', 'parse-start']);

    xhr.respond(200, { text: 'x'.repeat(200), fileName: 'resume.pdf', sourceType: 'direct' });
    await settled;
  });
});

test('a 429 that means "make an account" keeps both remedies', async () => {
  await withTransport(async ({ transport }) => {
    const { settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();

    FakeXhr.instances.at(-1).respond(
      429,
      { error: 'Too many requests. Create a free account to continue.', requiresAuth: true },
      { 'Retry-After': '60' },
    );

    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, 'AUTH_REQUIRED', 'signing in is what clears this throttle');
    assert.equal(
      outcome.error.message,
      'Too many requests. Create a free account to continue.',
      "the server's own wording survives",
    );
    // The only 429 that reaches this route is the 60-second unauthenticated
    // speed throttle, where waiting genuinely does work. Dropping the header
    // withheld a second real remedy.
    assert.equal(outcome.error.retryAfterSeconds, 60);
  });
});

test('a plain 429 is a rate limit, with the real Retry-After', async () => {
  await withTransport(async ({ transport }) => {
    const { settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    FakeXhr.instances.at(-1).respond(429, { error: 'slow down' }, { 'Retry-After': '12' });

    const outcome = await settled;
    assert.equal(outcome.error.code, 'RATE_LIMITED');
    assert.equal(outcome.error.retryAfterSeconds, 12);
  });
});

test('a body with too little text is PARSE_EMPTY, not a success', async () => {
  await withTransport(async ({ transport }) => {
    const { settled } = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    FakeXhr.instances.at(-1).respond(200, { text: 'too short', fileName: 'resume.pdf' });

    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, 'PARSE_EMPTY');
  });
});

test('a known server code survives, and an unknown one becomes PARSE_FAILED', async () => {
  await withTransport(async ({ transport }) => {
    const known = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    FakeXhr.instances.at(-1).respond(400, { code: 'SCANNED_PDF', message: 'image-based' });
    const first = await known.settled;
    assert.equal(first.error.code, 'SCANNED_PDF');
    assert.equal(first.error.message, 'image-based');

    const unknown = startRun(transport, pdf(1_000));
    await flushMicrotasks();
    FakeXhr.instances.at(-1).respond(400, { code: 'SOMETHING_NEW', message: 'unrecognised' });
    const second = await unknown.settled;
    assert.equal(second.error.code, 'PARSE_FAILED', 'an unmapped code cannot become a UI state');
  });
});

/* ---------------------------------------------- the resumable (storage) path */

/** Run the >4MB path far enough that the bucket object exists. */
async function reachStorageParse(state, transport) {
  state.currentUser = { uid: 'user-1' };
  const run = startRun(transport, pdf(5 * 1024 * 1024, 'Big Resume..pdf'));
  await flushMicrotasks();
  const task = state.tasks.at(-1);
  assert.ok(task, 'the resumable transport really created an upload task');
  return { run, task };
}

test('the storage path never hands its caller a path to a deleted object', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);

    // The priming snapshot the SDK delivers on subscribe carries no bytes.
    task.observers.next({ bytesTransferred: 0, totalBytes: 5 * 1024 * 1024 });
    assert.deepEqual(run.seen.progress, [], 'a snapshot with no bytes is not a measurement');
    task.observers.next({ bytesTransferred: 1_048_576, totalBytes: 5 * 1024 * 1024 });
    assert.deepEqual(run.seen.progress, [[1_048_576, 5 * 1024 * 1024]]);

    task.observers.complete();
    await flushMicrotasks();

    const xhr = FakeXhr.instances.at(-1);
    const body = JSON.parse(xhr.body);
    assert.match(body.storagePath, /^resume_uploads\/user-1\/\d+_Big_Resume\.pdf$/);
    assert.equal(body.storagePath.includes('..'), false);

    xhr.respond(200, {
      text: 'x'.repeat(200),
      fileName: 'Big Resume..pdf',
      sourceType: 'storage',
      storagePathDeleted: true,
    });

    const outcome = await run.settled;
    assert.equal(outcome.ok, true);
    // The route deletes the object as part of a successful parse, so a path
    // here would name something that no longer exists — and page.tsx persists
    // it into an immutable resume_versions record, carrying the user's original
    // filename with it.
    assert.equal('storagePath' in outcome.value, false, 'no dead path may reach a caller');
    assert.equal(outcome.value.storagePathDeleted, true, 'the honest provenance flag does');

    await flushMicrotasks();
    assert.equal(state.fetches.length, 0, 'and nothing is chased when the route says it deleted');
  });
});

test('a server that failed its own cleanup gets chased exactly once', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);
    task.observers.complete();
    await flushMicrotasks();

    // 200 with no `storagePathDeleted` means the route swallowed a delete error.
    FakeXhr.instances.at(-1).respond(200, {
      text: 'x'.repeat(200),
      fileName: 'Big Resume..pdf',
      sourceType: 'storage',
    });
    const outcome = await run.settled;
    assert.equal(outcome.ok, true);
    await flushMicrotasks();

    assert.equal(state.fetches.length, 1, 'the flag has to be acted on, not noted and dropped');
    assert.equal(state.fetches[0].url, transport.PARSE_RESUME_ABANDON_ENDPOINT);
    assert.match(JSON.parse(state.fetches[0].init.body).storagePath, /^resume_uploads\/user-1\//);
  });
});

test('a parse that fails abandons the object it left in the bucket', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);
    task.observers.complete();
    await flushMicrotasks();

    FakeXhr.instances.at(-1).respond(500, { code: 'PARSE_FAILED', message: 'boom' });
    const outcome = await run.settled;
    assert.equal(outcome.ok, false);
    await flushMicrotasks();
    assert.equal(state.fetches.length, 1, 'a failed parse must not leave a resume behind');
  });
});

test('closing the tab mid-parse still abandons the object, with a real credential', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);

    // Nothing is registered before the bytes are finalised: there is nothing in
    // the bucket to abandon yet.
    firePageHide();
    assert.equal(state.beacons.length, 0);

    task.observers.complete();
    await flushMicrotasks();

    // Now the object exists and the parse is in flight. This is the one exit no
    // promise can reach — no catch, no finally, no unmount effect runs.
    firePageHide();
    assert.equal(state.beacons.length, 1, 'a tab close during the parse must not orphan a resume');

    const beacon = state.beacons[0];
    assert.equal(beacon.url, transport.PARSE_RESUME_ABANDON_ENDPOINT);
    const payload = JSON.parse(await beacon.body.text());
    assert.match(payload.storagePath, /^resume_uploads\/user-1\//);
    // sendBeacon cannot set headers, so the bearer has to travel in the body.
    assert.equal(payload.idToken, 'test-id-token');

    FakeXhr.instances.at(-1).respond(200, {
      text: 'x'.repeat(200),
      fileName: 'Big Resume..pdf',
      sourceType: 'storage',
      storagePathDeleted: true,
    });
    await run.settled;
    await flushMicrotasks();

    // Released on the way out: a later pagehide must not delete an object that
    // was already parsed and removed.
    firePageHide();
    assert.equal(state.beacons.length, 1);
  });
});

test('a signed-in user whose token cannot be read fails closed, not anonymously', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);
    state.tokenUnavailable = true;
    task.observers.complete();
    await flushMicrotasks();

    const outcome = await run.settled;
    assert.equal(outcome.ok, false);
    // Falling through unauthenticated made the route resolve `anon:<ip>`, miss
    // this object's uid prefix, answer 401 and delete nothing.
    assert.equal(outcome.error.code, 'AUTH_REQUIRED');
    await flushMicrotasks();
    assert.equal(state.fetches.length, 1, 'and the object is still chased');
  });
});

test('cancelling a paused Firebase upload resumes it first', async () => {
  await withTransport(async ({ state, transport }) => {
    const { run, task } = await reachStorageParse(state, transport);

    run.seen.controls.pause();
    assert.deepEqual(task.calls, ['pause']);

    run.controller.abort();
    // UploadTask.cancel() is a documented no-op while paused, so a cancel that
    // does not resume first leaves the upload holding its slot forever.
    assert.deepEqual(task.calls, ['pause', 'resume', 'cancel']);

    task.observers.error({ code: 'storage/canceled' });
    const outcome = await run.settled;
    assert.equal(outcome.error.message, 'Upload cancelled.');
    await flushMicrotasks();
    assert.equal(state.fetches.length, 0, 'nothing was finalised, so there is nothing to abandon');
  });
});

test('storage errors map to the code that names a remedy', async () => {
  await withTransport(async ({ state, transport }) => {
    for (const [code, expected] of [
      ['storage/unauthorized', 'AUTH_REQUIRED'],
      ['storage/unauthenticated', 'AUTH_REQUIRED'],
      ['storage/retry-limit-exceeded', 'NETWORK'],
    ]) {
      const { run, task } = await reachStorageParse(state, transport);
      task.observers.error({ code });
      const outcome = await run.settled;
      assert.equal(outcome.error.code, expected, `${code} must not be flattened`);
    }
  });
});

test('an already-cancelled resumable upload never reaches the bucket', async () => {
  await withTransport(async ({ state, transport }) => {
    state.currentUser = { uid: 'user-1' };
    const controller = new AbortController();
    controller.abort();
    const settled = transport.resumeUploadTransport
      .run({
        file: pdf(5 * 1024 * 1024),
        signal: controller.signal,
        onTransferStart: () => {},
        onProgress: () => {},
        onParseStart: () => {},
        registerPauseControls: () => {},
      })
      .then(() => ({ ok: true }), (error) => ({ ok: false, error }));

    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.message, 'Upload cancelled.');
    assert.equal(state.tasks.length, 0, 'no bytes may be created for a cancelled request');
  });
});

test('an anonymous visitor is refused the storage path before anything is created', async () => {
  await withTransport(async ({ state, transport }) => {
    state.currentUser = null;
    const { settled } = startRun(transport, pdf(5 * 1024 * 1024));
    const outcome = await settled;
    assert.equal(outcome.error.code, 'AUTH_REQUIRED');
    assert.equal(state.tasks.length, 0, 'storage.rules would refuse it anyway');
  });
});

/* ------------------------------------------------ the browser-only transport */

test('the local transport never claims a transfer it did not make', async () => {
  await withTransport(async ({ state, transport, timers }) => {
    state.mammothText = 'Ten years of platform engineering, mostly in Go.';
    const file = new File([new Uint8Array(4_000)], 'cover-letter.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const { seen, settled } = startRun(transport, file, transport.localTextExtractionTransport);
    // file.arrayBuffer() is a real async read, so this one needs real timers.
    timers.restore();
    const outcome = await settled;

    assert.equal(outcome.ok, true);
    assert.equal(outcome.value.text, state.mammothText);
    // mammoth runs in the browser. Announcing "Upload complete" for a file that
    // never left the machine was a claim only screen-reader users heard.
    assert.deepEqual(seen.phases, ['parse-start']);
    assert.deepEqual(seen.progress, []);
    assert.equal(seen.controls, null, 'and nothing here can be paused');
  });
});

test('a document with no readable text is PARSE_EMPTY, in the browser too', async () => {
  await withTransport(async ({ state, transport, timers }) => {
    state.mammothText = '   ';
    const file = new File([new Uint8Array(4_000)], 'empty.docx', { type: 'application/msword' });
    const { settled } = startRun(transport, file, transport.localTextExtractionTransport);
    timers.restore();
    const outcome = await settled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, 'PARSE_EMPTY');
  });
});

/* --------------------------------------------------- the imperative handle */

test('the imperative handle never leaves a rejection unhandled', async () => {
  await withTransport(async ({ state, transport, timers }) => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      // The documented use is: take the handle, cancel it, walk away. Both of
      // these are promises nobody ever looks at.
      transport.startResumeUpload(new File([new Uint8Array(10)], 'notes.pages'));
      const live = transport.startResumeUpload(pdf(1_000));
      live.cancel();
      timers.restore();
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    assert.deepEqual(unhandled, [], 'an unawaited handle must not crash the page');
    assert.equal(state.tasks.length, 0);
  });
});

test('the handle still reports the real rejection to a caller that awaits it', async () => {
  await withTransport(async ({ transport }) => {
    const handle = transport.startResumeUpload(new File([new Uint8Array(10)], 'notes.pages'));
    await assert.rejects(handle.promise, (error) => {
      assert.equal(error.code, 'UNSUPPORTED_TYPE');
      return true;
    });
    assert.equal(handle.canPause, false);
  });
});

/* ------------------------------------------------------- transport helpers */

test('the storage object name can never produce a path the server will reject', async () => {
  const { transport } = await loadUploadModules();
  const { safeStorageFileName } = transport;

  // Stripping to [A-Za-z0-9._-] PRESERVES a literal `..`, and both server
  // checks refuse a path containing one: route.ts skips the cleanup bind and
  // then answers 403 'Invalid resume upload path.', and abandon/route.ts
  // refuses the same path — so for a signed-in user with a >4MB resume called
  // `Sr. Engineer..docx` the whole file stayed in the bucket with nothing on
  // either side able to delete it, behind a 'Try again' that regenerated the
  // identical name forever.
  const uid = 'AbC123uid';
  const paths = [
    'Sr. Engineer..docx',
    'Jane Doe Resume..pdf',
    '../../etc/passwd',
    '....pdf',
    'ré́sumé (final) v2 .. copy.docx',
    'no-extension',
    'a'.repeat(400) + '.pdf',
  ].map((name) => `resume_uploads/${uid}/${Date.now()}_${safeStorageFileName(name)}`);

  for (const storagePath of paths) {
    assert.equal(storagePath.includes('..'), false, `'..' survived in ${storagePath}`);
    assert.equal(
      storagePath.startsWith(`resume_uploads/${uid}/`),
      true,
      `prefix broken by ${storagePath}`,
    );
    assert.ok(!storagePath.slice(`resume_uploads/${uid}/`.length).includes('/'));
  }

  assert.equal(safeStorageFileName('Sr. Engineer..docx'), 'Sr._Engineer.docx');
  assert.ok(safeStorageFileName('a'.repeat(400) + '.pdf').endsWith('.pdf'), 'the tail is kept');
});

test('the content type is re-derived from the extension the server will use', async () => {
  const { transport } = await loadUploadModules();
  // Browsers hand out application/x-pdf, application/download, or nothing at
  // all from a share sheet, and storage.rules matches on contentType.
  assert.equal(transport.resolveStorageContentType('Resume.PDF'), 'application/pdf');
  assert.equal(
    transport.resolveStorageContentType('resume.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(transport.resolveStorageContentType('resume.pages'), 'application/octet-stream');
});

test('pause is only advertised where the SDK can really deliver it', async () => {
  await withTransport(async ({ state, transport, core }) => {
    state.currentUser = { uid: 'user-1' };
    assert.equal(transport.resumeUploadCanPause(pdf(5 * 1024 * 1024)), true);
    assert.equal(
      transport.resumeUploadCanPause(pdf(core.DIRECT_UPLOAD_MAX_BYTES)),
      false,
      'everything at or below 4MB goes through XHR, which cannot pause',
    );

    state.currentUser = null;
    assert.equal(
      transport.resumeUploadCanPause(pdf(5 * 1024 * 1024)),
      false,
      'storage.rules requires an authenticated user, so anonymous never can',
    );

    // The ceilings move with the user, and the transport is the authority.
    state.currentUser = null;
    assert.deepEqual(transport.resumeUploadLimits(), {
      maxBytes: core.AUTHENTICATED_MAX_BYTES,
      authRequiredAboveBytes: core.DIRECT_UPLOAD_MAX_BYTES,
    });
    state.currentUser = { uid: 'user-1' };
    assert.equal(transport.resumeUploadLimits().authRequiredAboveBytes, null);
  });
});

test('the 256KB pause floor matches the SDK it cites, at the boundary', async () => {
  const transportSource = fs.readFileSync(
    path.join(repoRoot, 'lib/upload/upload-transport.ts'),
    'utf8',
  );
  // @firebase/storage `_shouldDoResumable(blob)` is `blob.size() > 256 * 1024` —
  // strictly greater, so a file of exactly 262144 bytes is one-shot and cannot
  // pause. The branch is unreachable behind the 4MB gate today, which is why
  // this is asserted against the source: it exists for the day that gate moves,
  // and at the boundary a `<` would advertise a control that does nothing.
  assert.match(transportSource, /file\.size <= RESUMABLE_PAUSE_MIN_BYTES/);
  assert.doesNotMatch(transportSource, /file\.size < RESUMABLE_PAUSE_MIN_BYTES/);
});

/* ============================================================================
   REAL EXECUTION — the hook
   ========================================================================== */

/** A stand-in transport whose every step the test drives by hand. */
function scriptedTransport(core, script = {}) {
  return {
    id: 'scripted',
    accept: core.RESUME_ACCEPT,
    maxBytes: core.AUTHENTICATED_MAX_BYTES,
    canPause: () => Boolean(script.canPause),
    limits: script.limits,
    parseNote: script.parseNote,
    run(context) {
      return new Promise((resolve, reject) => {
        script.runs.push({ context, resolve, reject });
      });
    },
  };
}

/** Mount the real hook on the harness runtime. */
async function mountHook(modules, options) {
  const controller = modules.__runtime.mount(() => modules.useFileUpload(options));
  await modules.__runtime.flush();
  return {
    get current() {
      return modules.__runtime.current;
    },
    initial: controller,
    unmount: () => modules.__runtime.unmount(),
    flush: () => modules.__runtime.flush(),
  };
}

function fakeButton() {
  return { focused: 0, isConnected: true, focus() { this.focused += 1; } };
}

async function withHook(fn) {
  const state = resetUploadTestState();
  const modules = await loadUploadModules();
  const restore = installBrowserGlobals();
  try {
    return await fn({ state, modules, core: modules.core });
  } finally {
    modules.__runtime.unmount();
    restore();
  }
}

test('a superseded run cannot report an outcome for the file that replaced it', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const cancels = [];
    const errors = [];
    const successes = [];
    const host = await mountHook(modules, {
      transport: scriptedTransport(core, script),
      onCancel: (file) => cancels.push(file.name),
      onError: (failure) => errors.push(failure.code),
      onSuccess: (result) => successes.push(result),
    });

    host.current.selectFile(new File([new Uint8Array(10)], 'first.pdf'));
    await host.flush();
    host.current.selectFile(new File([new Uint8Array(10)], 'second.pdf'));
    await host.flush();

    assert.equal(script.runs.length, 2);
    assert.equal(host.current.state.fileName, 'second.pdf');

    // The first run's rejection lands a microtask after the second selection.
    // Allowed to dispatch, it drives the second file's brand-new `queued` state
    // to terminal `cancelled` — and the reducer then swallows everything the
    // second run says while that upload happily succeeds.
    script.runs[0].reject(new Error('aborted'));
    await host.flush();

    assert.equal(host.current.state.phase, 'queued', 'the second file is untouched');
    assert.deepEqual(cancels, [], 'and no outcome is reported for it');
    assert.deepEqual(errors, []);

    script.runs[1].context.onTransferStart();
    script.runs[1].context.onParseStart();
    script.runs[1].resolve({ text: 'ok' });
    await host.flush();
    assert.equal(host.current.state.phase, 'done');
    assert.equal(successes.length, 1);
  });
});

test('an unmounted host is never told about the upload it left behind', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const cancels = [];
    const host = await mountHook(modules, {
      transport: scriptedTransport(core, script),
      onCancel: (file) => cancels.push(file.name),
    });

    host.current.selectFile(new File([new Uint8Array(10)], 'first.pdf'));
    await host.flush();

    // Unmount aborts the controller. If the run is not also marked stale, the
    // rejection that lands a microtask later runs the whole terminal path —
    // dispatch on a dead reducer, and onCancel on a host that is gone.
    host.unmount();
    script.runs[0].reject(new Error('aborted'));
    await modules.__runtime.flush();

    assert.deepEqual(cancels, [], 'a route change during an upload is not a user cancel');
  });
});

test('a second validation failure is announced, even from the same phase', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });

    host.current.selectFile(new File([new Uint8Array(10)], 'photo.png'));
    await host.flush();
    assert.equal(host.current.state.phase, 'error');
    assert.equal(host.current.state.error.code, 'UNSUPPORTED_TYPE');
    const first = host.current.announcement;
    assert.match(first, /^Upload failed\./);

    // `select` and `fail` are dispatched with no await between them, so they
    // batch into ONE commit at phase 'error' — 'queued' is never rendered. A
    // gate on phase identity therefore returned early here and left the live
    // region holding the previous message while the visible card changed.
    host.current.selectFile(new File([new Uint8Array(11 * 1024 * 1024)], 'huge.pdf'));
    await host.flush();
    assert.equal(host.current.state.phase, 'error');
    assert.equal(host.current.state.error.code, 'FILE_TOO_LARGE');
    assert.notEqual(host.current.announcement, first, 'the second failure has to be spoken');
    assert.match(host.current.announcement, /too large/i);
  });
});

test('an identical repeat is not re-announced, so nothing chatters', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });

    host.current.selectFile(new File([new Uint8Array(10)], 'photo.png'));
    await host.flush();
    const first = host.current.announcement;
    const rendersAfterFirst = modules.__runtime.renders;

    host.current.selectFile(new File([new Uint8Array(10)], 'photo.png'));
    await host.flush();
    assert.equal(host.current.announcement, first);
    assert.ok(modules.__runtime.renders > rendersAfterFirst, 'the card still re-rendered');
  });
});

test('every path that unmounts the control under the user returns focus', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });
    const button = fakeButton();
    host.current.triggerProps.ref(button);

    // selectFile was the ONLY entry point that did not return focus, and it is
    // the one that unmounts the most: the idle dropzone is a <button> and the
    // queued state renders a <div>, so the focused node is destroyed outright.
    host.current.selectFile(new File([new Uint8Array(10)], 'resume.pdf'));
    await host.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(button.focused, 1, 'selectFile has to put focus somewhere real');

    host.current.cancel();
    await host.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(button.focused, 2, 'and so does cancel');

    host.current.reset();
    await host.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(button.focused, 3, 'and reset');
  });
});

test('focus falls back to the card when a surface mounts no trigger at all', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });
    const card = fakeButton();
    host.current.containerProps.ref(card);
    assert.equal(host.current.containerProps.tabIndex, -1, 'never a tab stop');

    host.current.selectFile(new File([new Uint8Array(10)], 'resume.pdf'));
    await host.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    // UploadCard mounts no trigger of its own; hosted bare, cancel/reset/retry
    // all landed on <body>.
    assert.equal(card.focused, 1);
  });
});

test('a host that throws from onCancel or onError does not become an unhandled rejection', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    const thrown = [];
    const realSetTimeout = globalThis.setTimeout;
    // The re-throw lands on its own task; capture it rather than crashing the
    // test runner, and assert it was re-thrown rather than swallowed.
    globalThis.setTimeout = (fn, ms) => {
      if (ms === 0) {
        try {
          fn();
        } catch (error) {
          thrown.push(error);
        }
        return 0;
      }
      return realSetTimeout(fn, ms);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const host = await mountHook(modules, {
        transport: scriptedTransport(core, script),
        onError: () => {
          throw new Error('host onError is broken');
        },
      });
      host.current.selectFile(new File([new Uint8Array(10)], 'photo.png'));
      await host.flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      globalThis.setTimeout = realSetTimeout;
    }
    assert.deepEqual(unhandled, []);
    assert.equal(thrown.length, 1, "the host's bug is re-thrown, not swallowed");
    assert.match(thrown[0].message, /host onError is broken/);
  });
});

test('the terminal phase is final, whatever the transport says afterwards', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });

    host.current.selectFile(new File([new Uint8Array(10)], 'resume.pdf'));
    await host.flush();
    const run = script.runs[0];
    run.context.onTransferStart();
    run.context.onProgress(500, 1_000);
    await host.flush();

    host.current.cancel();
    await host.flush();
    assert.equal(host.current.state.phase, 'cancelled');
    assert.equal(host.current.state.percent, null, 'a cancel is not 0%');
    assert.equal(host.current.state.bytesTransferred, 500, 'what really moved survives');

    // Late events from a transport that has not noticed yet are normal, not
    // exceptional, and must change nothing.
    run.context.onProgress(900, 1_000);
    run.context.onParseStart();
    await host.flush();
    assert.equal(host.current.state.phase, 'cancelled');
    assert.equal(host.current.state.bytesTransferred, 500);
  });
});

test('the visible line and the spoken line are different things', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, {
      transport: scriptedTransport(core, script),
      processingLabel: 'Reading your resume',
    });

    host.current.selectFile(new File([new Uint8Array(10)], 'resume.pdf'));
    await host.flush();
    script.runs[0].context.onTransferStart();
    await host.flush();
    assert.equal(host.current.statusLine, 'Uploading');

    script.runs[0].context.onProgress(500, 1_000);
    await host.flush();
    // The percentage is rendered outside the live region on purpose.
    assert.equal(host.current.state.percent, 50);
    assert.doesNotMatch(host.current.announcement, /50/);

    script.runs[0].context.onParseStart();
    await host.flush();
    assert.equal(host.current.statusLine, 'Reading your resume', 'the host may rename the step');
  });
});

test('the hidden input is named from the accept spec it enforces', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });
    // It is visually hidden with clip/clip-path, which keeps it in the
    // accessibility tree deliberately — so it needs a name, and the name has to
    // come from the same spec as the filter so the two cannot drift.
    assert.equal(host.current.inputProps['aria-label'], 'Choose a PDF, Word or TXT file');
    assert.equal(host.current.inputProps.accept, core.RESUME_ACCEPT.attr);
    assert.equal(host.current.inputProps.tabIndex, -1);
  });
});

/* ============================================================================
   REAL EXECUTION — the card
   ========================================================================== */

/** A controller shaped exactly like the hook's, for rendering the card alone. */
function controllerFor(core, state, overrides = {}) {
  return {
    state,
    file: null,
    accept: core.RESUME_ACCEPT,
    limits: { maxBytes: core.AUTHENTICATED_MAX_BYTES, authRequiredAboveBytes: null },
    statusLine: core.uploadStatusLine(state),
    announcement: core.uploadPhaseAnnouncement(state) ?? '',
    parseNote: null,
    isDragActive: false,
    recovery: core.recoveryOptionsFor(state.error),
    inputRef: { current: null },
    triggerRef: { current: null },
    inputProps: { 'aria-label': 'Choose a PDF, Word or TXT file' },
    containerProps: { ref: () => {}, tabIndex: -1 },
    dropzoneProps: {},
    triggerProps: {},
    selectFile: () => {},
    openPicker: () => {},
    pause: () => {},
    resume: () => {},
    cancel: () => {},
    retry: () => {},
    reset: () => {},
    ...overrides,
  };
}

async function renderCard(modules, state, overrides) {
  const controller = controllerFor(modules.core, state, overrides);
  const tree = modules.__runtime.mount(() =>
    modules.UploadCard({ controller, onRecovery: overrides?.onRecovery ?? (() => {}) }),
  );
  return { tree, controller };
}

test('pausing does not move focus, because the same button stays mounted', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const transferring = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_200_000, totalBytes: 2_400_000 },
  ]);
  const paused = core.uploadReducer(transferring, { type: 'pause' });

  const isPauseResume = (node) =>
    node.type === 'button' && /^(Pause|Resume) upload of /.test(node.props['aria-label'] ?? '');

  const running = await renderCard(modules, transferring);
  const runningButtons = findElements(running.tree, isPauseResume);
  assert.equal(runningButtons.length, 1);
  assert.match(runningButtons[0].props['aria-label'], /^Pause upload of/);

  const held = await renderCard(modules, paused);
  const heldButtons = findElements(held.tree, isPauseResume);
  // Rendered as two positional children of .upload-actions, `pause` unmounted
  // child[0] and mounted child[1], so the keyboard user who pressed Pause
  // landed on <body> mid-upload. One element with a flipped label, icon and
  // handler keeps the same DOM node.
  assert.equal(heldButtons.length, 1, 'one control, not two');
  assert.match(heldButtons[0].props['aria-label'], /^Resume upload of/);
  assert.equal(heldButtons[0].key, running.tree && runningButtons[0].key);

  // Never disabled: a greyed-out pause would advertise a capability the
  // transport does not have.
  for (const node of [...runningButtons, ...heldButtons]) {
    assert.equal(node.props.disabled, undefined);
  }

  const unpausable = drive(core, [
    { type: 'select', fileName: 'small.pdf', totalBytes: 900_000, transportCanPause: false },
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 450_000, totalBytes: 900_000 },
  ]);
  const hidden = await renderCard(modules, unpausable);
  assert.equal(findElements(hidden.tree, isPauseResume).length, 0, 'hidden, never disabled');
});

test('the card never says a step reports no progress while it is about to', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;

  const opening = drive(core, [SELECT, { type: 'transfer-start' }, { type: 'bar-eligible' }]);
  assert.equal(opening.indeterminate, true, 'the pre-first-byte window is real');
  const transferring = await renderCard(modules, opening);
  const transferNote = findElements(
    transferring.tree,
    (node) => node.props?.className === 'upload-note',
  );
  assert.equal(transferNote.length, 1);
  // Progress IS available for a transfer; it simply has not arrived yet, and
  // the first byte event replaces this sentence with a percentage. Claiming
  // otherwise and then retracting it is what a screen-reader user heard.
  assert.equal(textContent(transferNote[0]), 'Starting the transfer.');

  const parsing = drive(core, [SELECT, { type: 'transfer-start' }, { type: 'parse-start' }]);
  const reading = await renderCard(modules, parsing);
  const parseNote = findElements(reading.tree, (node) => node.props?.className === 'upload-note');
  assert.equal(textContent(parseNote[0]), 'No progress available for this step.');

  // The note is what the indeterminate bar is described by, so the bar carries
  // no value of its own.
  const bar = findElements(
    reading.tree,
    (node) => node.props?.role === 'progressbar' && node.props?.['aria-describedby'],
  );
  assert.equal(bar.length, 1);
  assert.equal(bar[0].props['aria-valuenow'], undefined);
  assert.equal(bar[0].props['aria-valuemin'], undefined);
  assert.equal(bar[0].props['aria-valuemax'], undefined);
  assert.equal(bar[0].props['aria-describedby'], parseNote[0].props.id);
});

test('the determinate bar reports exactly what was measured', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_560_000, totalBytes: 2_400_000 },
  ]);
  const { tree } = await renderCard(modules, state);

  const bar = findElements(tree, (node) => node.props?.role === 'progressbar');
  assert.equal(bar.length, 1);
  assert.equal(bar[0].props['aria-valuenow'], 65);
  assert.equal(bar[0].props['aria-valuetext'], '65 percent, 1.5 MB of 2.3 MB');

  const meta = findElements(tree, (node) => node.props?.className === 'upload-meta');
  const text = textContent(meta[0]);
  assert.match(text, /Uploading/);
  assert.match(text, /65%/);
  assert.match(text, /1\.5 MB of 2\.3 MB/);
});

test('a cancelled card reports the bytes that really moved, and no percentage', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_100_000, totalBytes: 2_400_000 },
    { type: 'cancel' },
  ]);
  const { tree } = await renderCard(modules, state);

  assert.equal(findElements(tree, (node) => node.props?.role === 'progressbar').length, 0);
  const meta = textContent(findElements(tree, (node) => node.props?.className === 'upload-meta')[0]);
  assert.match(meta, /Upload cancelled/);
  assert.match(meta, /1\.0 MB of 2\.3 MB/);
  assert.doesNotMatch(meta, /%/, 'a cancel is not 0% and not 46% either');
});

test('both of the card’s hidden pickers carry a name of their own', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;

  const scanned = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'fail', code: 'SCANNED_PDF', message: 'image-based' },
  ]);
  const word = await renderCard(modules, scanned);
  const wordInputs = findElements(word.tree, (node) => node.type === 'input');
  assert.equal(wordInputs.length, 1);
  assert.equal(wordInputs[0].props['aria-label'], 'Choose a Word document');
  // The picker offered BECAUSE the last PDF was image-only must not highlight
  // .pdf, or it hands back another scanned PDF and reproduces the error.
  assert.equal(wordInputs[0].props.accept.includes('application/pdf'), false);

  const empty = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'fail', code: 'PARSE_EMPTY', message: 'nothing readable' },
  ]);
  const another = await renderCard(modules, empty);
  const anotherInputs = findElements(another.tree, (node) => node.type === 'input');
  assert.equal(anotherInputs.length, 1);
  assert.equal(anotherInputs[0].props['aria-label'], 'Choose another file');

  for (const input of [...wordInputs, ...anotherInputs]) {
    assert.equal(input.props.className, 'upload-input-hidden');
    assert.equal(input.props.tabIndex, -1);
  }
});

test('the card draws every recovery option and serves the ones it can', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'fail', code: 'PARSE_FAILED', message: 'Failed to read this resume.' },
  ]);

  const served = [];
  let retried = 0;
  const { tree } = await renderCard(modules, state, {
    retry: () => {
      retried += 1;
    },
    onRecovery: (action) => served.push(action),
  });

  const buttons = findElements(
    tree,
    (node) => node.type === 'button' && String(node.props.className).includes('upload-trigger'),
  );
  assert.deepEqual(
    buttons.map((node) => textContent(node)),
    ['Try again', 'Paste instead'],
    'nothing is filtered away — that is how the sign-in path once disappeared',
  );

  buttons[0].props.onClick();
  assert.equal(retried, 1, 'retry is served by the card itself');
  assert.deepEqual(served, [], 'and is not forwarded to the host');

  buttons[1].props.onClick();
  assert.deepEqual(served, ['paste'], 'paste needs a text box the host owns');
});

test('a rate-limited card shows the real Retry-After as a note, not a button', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'fail', code: 'RATE_LIMITED', message: 'Too many uploads.', retryAfterSeconds: 45 },
  ]);
  const { tree } = await renderCard(modules, state);
  const notes = findElements(tree, (node) => node.props?.className === 'upload-note');
  assert.equal(notes.length, 1);
  assert.equal(textContent(notes[0]), 'Try again in about 45 seconds.');
  // Waiting is not something you click, which is why `wait` is not in the union.
  assert.equal(
    findElements(tree, (node) => /Wait/i.test(textContent(node))).length,
    0,
  );
});

test('status is never carried by colour alone', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  assert.equal(core.uploadStatusIcon('error'), 'error');
  assert.equal(core.uploadStatusIcon('done'), 'check_circle');
  assert.equal(core.uploadStatusIcon('cancelled'), 'cancel');
  assert.equal(core.uploadStatusIcon('transferring'), null, 'untinted phases need no icon');

  for (const [phase, glyph] of [
    ['error', 'error'],
    ['cancelled', 'cancel'],
    ['done', 'check_circle'],
  ]) {
    const base = drive(core, [SELECT, { type: 'transfer-start' }]);
    const state =
      phase === 'error'
        ? core.uploadReducer(base, { type: 'fail', code: 'PARSE_FAILED', message: 'no' })
        : core.uploadReducer(base, { type: phase === 'done' ? 'succeed' : 'cancel' });
    const { tree } = await renderCard(modules, state);
    const icon = findElements(tree, (node) =>
      String(node.props?.className ?? '').includes('upload-status__icon'),
    );
    assert.equal(icon.length, 1, `${phase} needs an icon, not just a hue`);
    assert.equal(textContent(icon[0]), glyph);
  }
});

test('the live region holds the announcement and nothing numeric', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 1_560_000, totalBytes: 2_400_000 },
  ]);
  const { tree } = await renderCard(modules, state);
  const live = findElements(tree, (node) => node.props?.['aria-live'] === 'polite');
  assert.equal(live.length, 1, 'there is exactly one live region');
  assert.equal(live[0].props.role, 'status');
  assert.equal(live[0].props.className, 'sr-only');
  // Routing a real progress number through aria-live makes a progress bar
  // unusable with a screen reader.
  assert.doesNotMatch(textContent(live[0]), /65|%/);
});

test('the card is a focus target of last resort, and knows it is not a tab stop', async () => {
  const modules = await loadUploadModules();
  const core = modules.core;
  const state = drive(core, [SELECT]);
  let attached = null;
  const { tree } = await renderCard(modules, state, {
    containerProps: {
      ref: (element) => {
        attached = element;
      },
      tabIndex: -1,
    },
  });
  const card = findElements(tree, (node) =>
    String(node.props?.className ?? '').startsWith('upload-card'),
  )[0];
  assert.ok(card, 'the card root still carries its named class');
  assert.equal(card.props.tabIndex, -1);
  assert.equal(typeof card.props.ref, 'function');
  assert.equal(attached, null, 'the ref is React’s to call, not the card’s');
});

/* ============================================================================
   SOURCE ASSERTIONS — kept only where the source IS the artifact
   ========================================================================== */

test('the indeterminate bar has a defined appearance under reduced motion', async () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  const globalFlatten = css.indexOf('animation-duration: 0.01ms !important');
  assert.ok(globalFlatten > 0, 'the global reduced-motion flattener still exists');

  const ruleAt = css.lastIndexOf('.upload-bar--indeterminate .upload-bar__fill');
  assert.ok(ruleAt > 0, 'the indeterminate bar must define its own reduced-motion appearance');
  const mediaAt = css.lastIndexOf('@media (prefers-reduced-motion: reduce)', ruleAt);
  assert.ok(mediaAt > globalFlatten, 'and after the global flattener it has to outrank');
  assert.ok(mediaAt > 0, 'that rule has to sit inside a reduced-motion query');
  const block = css.slice(mediaAt, css.indexOf('\n}', ruleAt) + 2);

  assert.match(block, /animation:\s*none\s*!important/);
  assert.match(block, /width:\s*100%/, 'a partial static fill would read as a percentage');
  assert.match(block, /background:\s*var\(--accent\)\s*;/, 'the fill has to be perceivable');
  assert.doesNotMatch(block, /--accent-dim/, 'a dim wash is not a defined appearance');
});

test('the reduced-motion comment does not claim something the reducer disproves', async () => {
  const core = await corePromise;
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  // The justification printed above that rule used to say the determinate bar
  // is never drawn at 100% because `succeed` sets barVisible:false. It is:
  const full = drive(core, [
    SELECT,
    { type: 'transfer-start' },
    { type: 'bar-eligible' },
    { type: 'progress', bytesTransferred: 2_400_000, totalBytes: 2_400_000 },
  ]);
  assert.equal(full.phase, 'transferring');
  assert.equal(full.percent, 100);
  assert.equal(full.barVisible, true, 'a final byte event lands while the bar is still up');

  const at = css.lastIndexOf('.upload-bar--indeterminate .upload-bar__fill');
  const comment = css.slice(css.lastIndexOf('/* ====', at), at);
  // The comment may quote the old reasoning, but only to withdraw it, and it
  // has to name what really disambiguates the full-width fill.
  assert.match(comment, /That is false/, 'the old claim has to be withdrawn, not repeated');
  assert.match(comment, /note directly beneath the bar/);
  assert.match(comment, /no percentage at all during the parse/);
  assert.match(comment, /aria-valuenow/, 'and the ARIA signal is part of the answer');
});

test('the bar track is legible, so the fill is a fraction of something', async () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');
  const track = css.slice(css.indexOf('\n.upload-bar {'), css.indexOf('.upload-bar__fill {'));
  // --bg-hover on --bg-elevated is 1.09:1 dark / 1.03:1 light: the fill floats
  // with no visible extent. The ring is what makes the denominator readable.
  assert.match(track, /outline:\s*1px solid var\(--border-hover\)/);
});

test('no upload surface puts accent ink on an accent-tinted fill', async () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');
  const start = css.indexOf('.upload-card {');
  const end = css.indexOf('.upload-input-hidden {');
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end);

  for (const rule of block.split('}')) {
    if (!/background:\s*var\(--accent-dim\)/.test(rule)) continue;
    assert.doesNotMatch(
      rule,
      /(?<!border-)color:\s*var\(--accent\)\s*;/,
      `accent ink on an accent-dim fill fails AA in light theme:\n${rule.trim()}`,
    );
  }
});

test('the card is built from named classes, not utilities the audit counts', async () => {
  const card = fs.readFileSync(path.join(repoRoot, 'components/upload/UploadCard.tsx'), 'utf8');

  // scripts/design-audit.js counts px-/py-/rounded in a className as a
  // hand-rolled button and rounded-* + border as a hand-rolled card.
  assert.doesNotMatch(card, /className="[^"]*\bpx-\d[^"]*\bpy-\d[^"]*\brounded[^"]*"/);
  assert.doesNotMatch(card, /className="[^"]*\brounded-(?:lg|xl|2xl|3xl|\[\d+px\])[^"]*\bborder\b[^"]*"/);

  for (const banned of [
    /\btext-white\b/,
    /\bbackdrop-blur\b/,
    /\bbg-gradient-to-\w+\b/,
    /\bshadow-(?:sm|md|lg|xl|2xl)\b/,
    /\b(?:bg|text|border)-(?:purple|violet|indigo|fuchsia)-\d{2,3}\b/,
    /#[0-9a-fA-F]{6}\b/,
  ]) {
    assert.doesNotMatch(card, banned, `UploadCard must not contain ${banned}`);
  }
});

test('the filename clamp covers every phone width the repo requires', async () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');
  const baseRule = css.indexOf('.upload-name {', css.indexOf('.upload-body {'));
  const clampAt = css.indexOf('.upload-name {', baseRule + 1);
  assert.ok(baseRule > 0 && clampAt > baseRule, 'the clamped rule still exists');
  const queryAt = css.lastIndexOf('@media (max-width:', clampAt);
  const width = Number(css.slice(queryAt).match(/@media \(max-width: (\d+)px\)/)[1]);
  assert.match(css.slice(clampAt, clampAt + 400), /line-clamp: 2/);
  // The required breakpoints are 320 / 390 / 430 / 768 / 1024 / 1440.
  assert.ok(width >= 430, `a ${width}px clamp leaves the 430px breakpoint uncovered`);
  assert.ok(width < 768, 'and 768 is wide enough that one line plus a title reads better');
});

test('the card gives the text column back the room the touch targets take', async () => {
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  // globals.css raises every button to min-height:44px below 1024px, so a 32px
  // square control silently rendered 32x44. Matching the width makes it a real
  // target — and measured in Chromium at 320px, that alone left the text column
  // 96px against a 92px byte pair and a 156px cancelled line, which clipped.
  assert.match(css, /@media \(max-width: 1023px\) \{\s*\.upload-action \{\s*width: 44px;\s*height: 44px;/);
  assert.match(css, /@media \(max-width: 480px\) \{\s*\.upload-card \{\s*gap: 8px;\s*padding: 8px;/);

  const card = fs.readFileSync(path.join(repoRoot, 'components/upload/UploadCard.tsx'), 'utf8');
  assert.doesNotMatch(card, /\{byteRange\} transferred/);
});

test('a surface never quotes a ceiling its transport will not honour', async () => {
  const core = await corePromise;

  const anonymous = { maxBytes: 10 * 1024 * 1024, authRequiredAboveBytes: 4 * 1024 * 1024 };
  const signedIn = { maxBytes: 10 * 1024 * 1024, authRequiredAboveBytes: null };

  assert.equal(
    core.uploadLimitHint(core.RESUME_ACCEPT, anonymous),
    'PDF, Word or TXT, up to 4MB. Sign in for up to 10MB.',
  );
  assert.equal(core.uploadLimitHint(core.RESUME_ACCEPT, signedIn), 'PDF, Word or TXT, up to 10MB');

  const midBand = core.checkFileAgainstAccept(
    { name: 'resume.pdf', size: 6 * 1024 * 1024 },
    core.RESUME_ACCEPT,
    anonymous.maxBytes,
    anonymous.authRequiredAboveBytes,
  );
  assert.equal(midBand.ok, false);
  assert.equal(midBand.code, 'AUTH_REQUIRED');

  // Over the hard ceiling stays FILE_TOO_LARGE, which offers no sign-in —
  // because signing in genuinely cannot change it.
  const overCeiling = core.checkFileAgainstAccept(
    { name: 'resume.pdf', size: 11 * 1024 * 1024 },
    core.RESUME_ACCEPT,
    anonymous.maxBytes,
    anonymous.authRequiredAboveBytes,
  );
  assert.equal(overCeiling.code, 'FILE_TOO_LARGE');

  const dropzone = fs.readFileSync(path.join(repoRoot, 'components/upload/FileDropzone.tsx'), 'utf8');
  assert.match(dropzone, /uploadLimitHint\(accept, limits\)/);
  assert.doesNotMatch(dropzone, /maxBytes \/ 1024 \/ 1024/, 'one number cannot say both things');
});

test('the ceiling follows the user across a sign-in', async () => {
  await withHook(async ({ state, modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, {
      transport: scriptedTransport(core, {
        ...script,
        runs: script.runs,
        limits: () => ({
          maxBytes: core.AUTHENTICATED_MAX_BYTES,
          authRequiredAboveBytes: state.currentUser ? null : core.DIRECT_UPLOAD_MAX_BYTES,
        }),
      }),
    });

    assert.equal(host.current.limits.authRequiredAboveBytes, core.DIRECT_UPLOAD_MAX_BYTES);

    // A 6MB file signed out is AUTH_REQUIRED, and the recovery is sign-in.
    host.current.selectFile(new File([new Uint8Array(10)], 'resume.pdf', {}));
    await host.flush();

    // The retry after signing in has to read the ceiling FRESH — not through a
    // closure captured before the sign-in, and not from the rendered copy,
    // which may not have committed yet.
    state.currentUser = { uid: 'user-1' };
    host.current.retry();
    await host.flush();
    assert.equal(script.runs.length >= 1, true);
  });
});

test('the modal can tell a host the sign-in worked, before it closes', async () => {
  const modal = fs.readFileSync(path.join(repoRoot, 'components/modals/AuthModal.tsx'), 'utf8');
  assert.match(modal, /onAuthSuccess\?: \(\) => void;/, 'the modal can tell a host it worked');
  const complete = modal.slice(modal.indexOf('const completeAndClose'), modal.indexOf('}, [onAuthSuccess'));
  assert.ok(
    complete.indexOf('onAuthSuccess?.()') < complete.indexOf('onClose()'),
    'fired before the modal closes, so the host can restart what it is holding',
  );
});

test('the parse route can clean up a storage upload it is about to reject', async () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'app/api/gauntlet/parse-resume/route.ts'),
    'utf8',
  );

  const guard = route.indexOf('const guard = await guardApiRoute');
  const bind = route.indexOf('storageFile = getAdminStorage()');
  const sizeGate = route.indexOf('const maxRequestBytes');
  const bodyRead = route.indexOf('await req.json()', guard);
  assert.ok(guard > 0 && bind > 0 && sizeGate > 0 && bodyRead > 0);

  // The identity is the one guardApiRoute already verified — never a second one.
  assert.ok(bind > guard, 'the identity comes from the guard, not a second verification');
  assert.ok(sizeGate < bodyRead, 'the anon-aware size gate must precede the body read');

  // ...and the bind still precedes every early return that CAN follow a real
  // Storage upload, which is all of them from the JSON branch down.
  const firstJsonExit = route.indexOf("'The upload could not be read.'");
  assert.ok(firstJsonExit > 0);
  assert.ok(bind < firstJsonExit, 'a rejection must not orphan a resume the client already uploaded');

  // ...but it is bound ONLY for a caller who could have created one.
  // storage.rules is `request.auth != null`, so an anonymous caller has never
  // written to the bucket — and `guard.user.uid` for one is `anon:<ip>` from a
  // client-supplied header, so a 45-byte unauthenticated POST naming its own
  // derived prefix used to bind here and pay a Cloud Storage delete RPC on the
  // way out through the 400 below.
  const bindBlock = route.slice(route.lastIndexOf('if (', bind) - 400, bind);
  assert.match(bindBlock, /if \(!isAnon\) \{/, 'an anonymous caller has nothing to bind');
  assert.ok(
    route.indexOf('const isAnon =') < bind,
    'and the gate has to be resolved before the bind reads it',
  );

  // ...and the guard's own rejection reclaims it too — that is the 429 case.
  const guardBlock = route.slice(route.indexOf('if (guard.error) {', guard));
  assert.match(guardBlock.slice(0, 700), /bindAbandonedStorageObject\(req, contentType, guard\.identity\)/);
  assert.match(guardBlock.slice(0, 700), /await cleanupStorageUpload\(\);/);

  // Nothing expensive may run before the rate limiter.
  const post = route.slice(route.indexOf('export async function POST'));
  const guardInPost = post.indexOf('const guard = await guardApiRoute');
  for (const expensive of ['await req.json()', 'await req.formData()', 'authenticateRequest(req)']) {
    const at = post.indexOf(expensive);
    if (at < 0) continue;
    assert.ok(at > guardInPost, `${expensive} must not run before the rate limiter`);
  }

  // The cleanup helper checks for a verified identity before reading a body.
  const helper = route.slice(
    route.indexOf('async function bindAbandonedStorageObject'),
    route.indexOf('export async function POST'),
  );
  assert.ok(helper.length > 0, 'the guard-rejection path has a named cleanup helper');
  assert.ok(
    helper.indexOf('if (!identity) return null;') < helper.indexOf('req.json()'),
    'an unauthenticated rejection must not pay for a body parse',
  );
  assert.doesNotMatch(helper, /authenticateRequest/, 'no second token verification');

  const apiAuth = fs.readFileSync(path.join(repoRoot, 'lib/api-auth.ts'), 'utf8');
  assert.match(
    apiAuth,
    /error: NextResponse;\s*identity: Omit<AuthResult, 'tier'> \| null/,
    'guardApiRoute has to surface the identity it already resolved',
  );
});

test('the abandon route bounds its body and admits only a verified owner', async () => {
  const abandon = fs.readFileSync(
    path.join(repoRoot, 'app/api/gauntlet/parse-resume/abandon/route.ts'),
    'utf8',
  );
  assert.match(abandon, /guardApiRoute/);
  assert.doesNotMatch(
    abandon,
    /allowAnonymous:\s*true/,
    'only a signed-in owner can abandon their own object',
  );
  assert.match(abandon, /storagePath\.startsWith\(expectedPrefix\)/);
  assert.match(abandon, /ignoreNotFound: true/);

  // The sibling route refuses a body it has not bounded first; so does this
  // one. App Router handlers have no default body cap.
  const gate = abandon.indexOf("req.headers.get('content-length')");
  const read = abandon.indexOf('await req.text()');
  assert.ok(gate > 0 && read > gate, 'the size gate has to precede the body read');
  assert.match(abandon, /status: 413/);

  // sendBeacon cannot set headers, so the unload path carries its bearer in the
  // body — and it goes through the same guard, not around it.
  const tokenAt = abandon.indexOf('body?.idToken');
  const guardAt = abandon.indexOf('await guardApiRoute');
  assert.ok(tokenAt > 0 && guardAt > tokenAt, 'the beacon token is fed INTO the guard');
  assert.match(abandon, /headers\.set\('authorization', `Bearer \$\{beaconToken\}`\)/);
});

test('no comment claims a retention backstop that does not exist', async () => {
  // Five comments used to assert that a bucket lifecycle rule sweeps up
  // abandoned resumes. No lifecycle configuration exists anywhere in this repo:
  // firebase.json's storage key is {"rules": "storage.rules"} and nothing else.
  // A retention guarantee for real resume PII must not rest on an unverifiable
  // claim, so the comments now say plainly that creating it is an outstanding
  // owner action, and the command lives in docs/.
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  const hasLifecycleConfig = JSON.stringify(firebaseJson.storage ?? {}).includes('lifecycle');

  const sources = [
    'lib/upload/upload-transport.ts',
    'app/api/gauntlet/parse-resume/route.ts',
    'app/api/gauntlet/parse-resume/abandon/route.ts',
  ];
  for (const relative of sources) {
    const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
    for (const claim of source.matchAll(/[^\n]*lifecycle[^\n]*/gi)) {
      if (hasLifecycleConfig) continue;
      assert.doesNotMatch(
        claim[0],
        /lifecycle rule is the backstop|the lifecycle rule is the backstop/i,
        `${relative} asserts a lifecycle backstop that this repo does not configure`,
      );
    }
  }

  const runbook = path.join(repoRoot, 'docs/storage-retention-runbook.md');
  assert.ok(fs.existsSync(runbook), 'the owner needs the command, not just the warning');
  const text = fs.readFileSync(runbook, 'utf8');
  assert.match(text, /UNCOMPLETED OWNER ACTION/);
  assert.match(text, /gcloud storage buckets update/);
  assert.match(text, /matchesPrefix/, 'the rule must not be widened past resume_uploads/');
});

test('the parse deadline note quotes the deadline the route will really apply', async () => {
  const transport = fs.readFileSync(path.join(repoRoot, 'lib/upload/upload-transport.ts'), 'utf8');
  const route = fs.readFileSync(
    path.join(repoRoot, 'app/api/gauntlet/parse-resume/route.ts'),
    'utf8',
  );

  // route.ts applies `timeoutMs` only inside the binary branch. A `.txt` takes
  // `detectedType === 'txt'` and returns with no worker at all.
  const txtBranch = route.indexOf("if (detectedType === 'txt')");
  assert.ok(txtBranch > 0, 'the route still has a txt branch');
  const txtReturn = route.indexOf('return await parseSuccess(', txtBranch);
  const workerCall = route.indexOf('await parseResumeBinaryInWorker(');
  assert.ok(
    txtReturn > txtBranch && workerCall > txtReturn,
    'the txt branch still returns before the worker is ever reached',
  );
  assert.match(route, /timeoutMs: isAnon \? 4_000 : 8_000/, 'and only the worker carries a deadline');

  const { transport: transportModule } = await loadUploadModules();
  assert.equal(
    transportModule.resumeUploadTransport.parseNote(
      { name: 'notes.txt', size: 10 },
      false,
    ),
    null,
    'a .txt is never quoted a deadline nothing will enforce',
  );
  assert.match(
    transportModule.resumeUploadTransport.parseNote({ name: 'resume.pdf', size: 10 }, true),
    /4 seconds/,
  );
  assert.equal(
    transportModule.localTextExtractionTransport.parseNote,
    undefined,
    'the browser transport has no deadline to quote, and says so by having none',
  );
  assert.doesNotMatch(transport, /x-demo-auth-bypass/, 'auth rules are not duplicated here');
});

test('the hook is told the transport must be referentially stable', async () => {
  const hook = fs.readFileSync(path.join(repoRoot, 'lib/upload/useFileUpload.ts'), 'utf8');
  // resolveLimits depends on `transport`, and the onAuthStateChanged
  // subscription depends on resolveLimits — so an inline object literal tears
  // down and re-registers a Firebase listener on every render. Nothing can
  // enforce it in the type system; the doc comment is the enforcement.
  const options = hook.slice(
    hook.indexOf('export interface UseFileUploadOptions'),
    hook.indexOf('transport: UploadTransport<TResult>;'),
  );
  assert.match(options, /referentially stable/);
  assert.match(hook, /onAuthStateChanged\(auth, apply\)/);
});

test('the controller is not generic, and its file is not a ref read during render', async () => {
  const hook = fs.readFileSync(path.join(repoRoot, 'lib/upload/useFileUpload.ts'), 'utf8');

  assert.match(hook, /export interface FileUploadController \{/);
  assert.match(
    hook,
    /options: UseFileUploadOptions<TResult>,\n\): FileUploadController \{/,
    'the hook returns the plain controller',
  );
  // Comments may still describe the phantom; no declaration may still use it.
  const code = hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /FileUploadController</, 'no declaration keeps the phantom parameter');
  assert.match(hook, /export interface UseFileUploadOptions<TResult>/, 'TResult still earns its place');

  assert.match(hook, /file: selectedFile,/);
  assert.doesNotMatch(hook, /file: fileRef\.current/);

  // React 19's rule is that ref.current is neither read nor written while
  // rendering: a discarded render — a transition, an offscreen tree,
  // StrictMode's double render — would otherwise leave `handlers` holding
  // callbacks from a commit that never happened, and a terminal transport event
  // landing in that window would call them.
  const assignments = code.match(/handlers\.current = \{/g) ?? [];
  assert.equal(assignments.length, 1, 'the handler ref is written in exactly one place');
  assert.match(
    hook,
    /useEffect\(\(\) => \{\n\s*handlers\.current = \{/,
    'and that place is an effect, not the render body',
  );

  for (const component of ['UploadCard', 'FileDropzone', 'UploadTrigger']) {
    const source = fs.readFileSync(
      path.join(repoRoot, `components/upload/${component}.tsx`),
      'utf8',
    );
    assert.doesNotMatch(source, /FileUploadController<unknown>/, `${component} still uses the phantom`);
  }
});

test('two mounted triggers on one controller are reported, not silently broken', async () => {
  await withHook(async ({ modules, core }) => {
    const script = { runs: [] };
    const host = await mountHook(modules, { transport: scriptedTransport(core, script) });

    const errors = [];
    const realError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      const first = fakeButton();
      const second = fakeButton();
      host.current.triggerProps.ref(first);
      // An ordinary swap is not a second live consumer: React can attach the
      // replacement before detaching the old node.
      first.isConnected = false;
      host.current.triggerProps.ref(second);
      assert.deepEqual(errors, [], 'a swap of a detached node is normal');

      first.isConnected = true;
      host.current.triggerProps.ref(first);
      assert.equal(errors.length, 1, 'two live triggers on one controller is not');
      assert.match(errors[0], /two upload trigger <button> elements/);
    } finally {
      console.error = realError;
    }
  });
});
