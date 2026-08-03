'use client';

/**
 * useFileUpload — the headless half of the upload experience.
 *
 * Every surface in the product wanted the same logic and a different chrome.
 * The 737-line FileUploadDropzone tried to solve that with a `variant` prop
 * and ended up with four branches that differed only in markup, which is why
 * three other surfaces reimplemented the logic instead of accepting a chrome.
 *
 * So: the logic lives here, and chrome is somebody else's problem. The hook
 * hands back prop spreads, which is also how the three click-only surfaces
 * pick up drag-and-drop without asking.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isDemoModeEnabled } from '@/lib/demo-mode';
import {
  MILESTONE_MIN_TRANSFER_MS,
  PARSE_NOTE_DELAY_MS,
  TRANSFER_BAR_DELAY_MS,
  FileUploadError,
  checkFileAgainstAccept,
  initialUploadState,
  isTerminalPhase,
  nextMilestone,
  recoveryOptionsFor,
  uploadPhaseAnnouncement,
  uploadReducer,
  uploadStatusLine,
  type AcceptSpec,
  type UploadFailure,
  type UploadLimits,
  type UploadRecoveryOption,
  type UploadState,
} from './file-upload-types';
import type { PauseControls, UploadTransport } from './upload-transport';

export interface UseFileUploadOptions<TResult> {
  /**
   * Must be referentially stable — a module constant, or something held in a
   * ref or useMemo by the host.
   *
   * It is a dependency of `resolveLimits`, which is a dependency of the
   * `onAuthStateChanged` subscription: a new object literal on every render
   * tears down and re-registers a Firebase auth listener on every render. It
   * cannot loop (setLimits bails on an equal value) but it churns. Both
   * shipped transports are module-level singletons.
   */
  transport: UploadTransport<TResult>;
  /** Overrides the transport's own accept spec. Rarely needed. */
  accept?: AcceptSpec;
  /**
   * Overrides the transport's ceiling entirely, including its sign-in step.
   * Only pass this where the surface genuinely knows better than the transport.
   */
  maxBytes?: number;
  disabled?: boolean;
  /**
   * Replaces "Reading the document" while the unmeasurable phase runs. Named
   * steps are fine here; numbers on them are not.
   */
  processingLabel?: string;
  onSuccess?(result: TResult, file: File): void | Promise<void>;
  onError?(failure: UploadFailure, file: File): void;
  onCancel?(file: File): void;
  /**
   * The card's remove control was cleared, and everything the host derived
   * from this upload is now stale.
   *
   * `reset()` only clears hook-local state. After a success the host is already
   * holding the parsed text — delivered through `onSuccess` — and nothing here
   * can reach it, so without this hook the control was clearing the card and
   * leaving the ingest in place: a button whose label overstated what happened.
   * Hosts that cannot undo their ingest should leave this unset; the control is
   * labelled "Dismiss" precisely because dismissing is all the card guarantees.
   */
  onReset?(file: File | null): void;
}

/**
 * The controller is deliberately NOT generic.
 *
 * It used to be `FileUploadController<TResult>` with `TResult` appearing in no
 * member at all — a phantom parameter. Every instantiation was structurally
 * identical, so `UploadCard`'s `controller: FileUploadController<unknown>`
 * accepted every controller by accident while implying it had checked
 * something. `TResult` still lives on `UseFileUploadOptions`, where
 * `onSuccess(result: TResult)` genuinely uses it.
 */
export interface FileUploadController {
  state: UploadState;
  /**
   * The file the card is currently about. Reducer-adjacent React state, not a
   * ref read during render — a ref would hand a consumer whatever it happened
   * to hold at that render, would not re-render when it changed, and is unsafe
   * under concurrent rendering.
   */
  file: File | null;
  accept: AcceptSpec;
  /** The ceilings really in force for this viewer, so hint copy can be true. */
  limits: UploadLimits;
  /** Visible status text. Deliberately NOT inside the live region. */
  statusLine: string | null;
  /** Live-region text. Changes on phase transitions and gated milestones only. */
  announcement: string;
  /** The backend's real deadline, shown once the parse has run 5s. */
  parseNote: string | null;
  isDragActive: boolean;
  recovery: readonly UploadRecoveryOption[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  inputProps: {
    ref: (element: HTMLInputElement) => () => void;
    type: 'file';
    accept: string;
    className: string;
    tabIndex: -1;
    disabled: boolean;
    /**
     * The input is visually hidden with clip/clip-path, which leaves it in the
     * accessibility tree on purpose — so it needs a name. `tabIndex: -1` takes
     * it out of the tab order but not out of a virtual cursor's reach, and
     * without this it read as an unlabelled file input (WCAG 4.1.2).
     */
    'aria-label': string;
    onChange(event: ChangeEvent<HTMLInputElement>): void;
  };
  /**
   * Spread onto the element that wraps the card, so focus has somewhere to go
   * when the surface mounts no trigger. Carries `tabIndex: -1`: programmatic
   * focus only, never a tab stop.
   */
  containerProps: {
    /* Widened to HTMLElement so this spreads onto whatever element the host
       wraps the card in, not just a div. It has to accept null to stay
       assignable to React's Ref<T>, even though the cleanup-returning form is
       never called with one. */
    ref: (element: HTMLElement | null) => (() => void) | void;
    tabIndex: -1;
  };
  /** Spread onto any element to make it a drop target. Carries no click. */
  dropzoneProps: {
    onDragEnter(event: DragEvent<HTMLElement>): void;
    onDragOver(event: DragEvent<HTMLElement>): void;
    onDragLeave(event: DragEvent<HTMLElement>): void;
    onDrop(event: DragEvent<HTMLElement>): void;
  };
  /** Spread onto a <button>. Keyboard parity comes from it being a button. */
  triggerProps: {
    ref: (element: HTMLButtonElement) => () => void;
    type: 'button';
    disabled: boolean;
    onClick(): void;
  };
  selectFile(file: File | null | undefined): void;
  openPicker(): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  retry(): void;
  reset(): void;
}

/**
 * One controller drives exactly one mounted input and one mounted trigger.
 *
 * `inputProps` and `triggerProps` both carry a ref, so a surface that mounts
 * two of them from a single controller — a dropzone and a separate trigger,
 * say — ends up with the ref pointing at whichever attached last, and
 * `openPicker()` / focus return silently target the other, detached element.
 * UploadCard defends against exactly this for its own two pickers; nothing was
 * watching the public spreads.
 *
 * `isConnected` is what keeps this from firing on an ordinary swap: React can
 * attach the replacement before detaching the old node, and a node that has
 * already left the document is not a second live consumer.
 */
function warnSharedControl(kind: string): void {
  if (process.env.NODE_ENV === 'production') return;
  console.error(
    `[useFileUpload] two ${kind} elements are attached to one controller. ` +
      'openPicker() and focus return will target whichever mounted last, and the ' +
      'other is silently dead. Give each mounted surface its own useFileUpload().',
  );
}

/**
 * One upload attempt.
 *
 * The timers live on the run rather than in refs shared across runs, because a
 * superseded run used to clear the *current* run's timers on its way out —
 * which silently disabled the 250ms bar-suppression window and the 5s parse
 * note for the file the user had actually just picked.
 */
interface ActiveRun {
  controller: AbortController;
  controls: PauseControls | null;
  barTimer: ReturnType<typeof setTimeout> | null;
  parseTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Call a host callback without letting its bug become ours.
 *
 * `onCancel` and `onError` are invoked from inside the catch of an async
 * function that is started as `void runUpload(file)`. A host that throws from
 * either produced an unhandled promise rejection with nothing attached — the
 * same hazard `onSuccess` is carefully guarded against a few lines below, and
 * the same one `sink()` exists to prevent on the imperative handle.
 *
 * Re-thrown on its own task rather than swallowed, so the host's error boundary
 * and `window.onerror` still see it as what it is: a bug in the host.
 */
function callHost<TArgs extends unknown[]>(
  name: string,
  fn: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): void {
  if (!fn) return;
  try {
    fn(...args);
  } catch (hostError) {
    console.error(`[useFileUpload] the host ${name} handler threw`, hostError);
    setTimeout(() => {
      throw hostError;
    }, 0);
  }
}

function clearRunTimers(run: ActiveRun | null): void {
  if (!run) return;
  if (run.barTimer !== null) {
    clearTimeout(run.barTimer);
    run.barTimer = null;
  }
  if (run.parseTimer !== null) {
    clearTimeout(run.parseTimer);
    run.parseTimer = null;
  }
}

export function useFileUpload<TResult>(
  options: UseFileUploadOptions<TResult>,
): FileUploadController {
  const { transport, onSuccess, onError, onCancel, onReset, processingLabel } = options;
  const accept = options.accept ?? transport.accept;
  const maxBytesOverride = options.maxBytes;
  const disabled = options.disabled ?? false;

  const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [parseNote, setParseNote] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const runRef = useRef<ActiveRun | null>(null);
  const dragDepth = useRef(0);
  const transferStartedAt = useRef<number | null>(null);
  const lastMilestone = useRef<number | null>(null);
  const spokenLine = useRef<string>('');

  // Callbacks are read through a ref so a caller that passes an inline arrow
  // does not restart the upload on every render.
  //
  // Written from an effect, not during render. React 19's rule is that
  // `ref.current` is neither read nor written while rendering: a render that is
  // discarded — a transition, an offscreen tree, StrictMode's double render —
  // would otherwise leave this holding callbacks from a commit that never
  // happened, and a terminal transport event landing in that window would call
  // them. Nothing here needs the render-time value: every read is from an async
  // continuation, which cannot run before the commit that scheduled it.
  const handlers = useRef({ onSuccess, onError, onCancel, onReset });
  useEffect(() => {
    handlers.current = { onSuccess, onError, onCancel, onReset };
  });

  useEffect(() => () => {
    clearRunTimers(runRef.current);
    runRef.current?.controller.abort();
    // Nulled so the pending abort-rejection is classified STALE.
    //
    // Without this, `isStale()` is false when the transport's rejection lands a
    // microtask later and the catch runs its whole terminal path — the `cancel`
    // dispatch on a dead reducer, and `handlers.current.onCancel?.(file)` on a
    // host that has unmounted. A parent that shows a toast, logs an event or
    // setStates on a surviving ancestor got a false cancel on every route
    // change during an upload.
    runRef.current = null;
  }, []);

  /* ---- the ceiling in force ----------------------------------------------
     Read from the transport rather than assumed, because "10MB" is only true
     with an account: `resumeUploadTransport.maxBytes` is the authenticated
     ceiling, and a signed-out visitor reading "up to 10MB" on the idle
     dropzone was being told something the transport would refuse. */
  const resolveLimits = useCallback((): UploadLimits => {
    if (maxBytesOverride !== undefined) {
      return { maxBytes: maxBytesOverride, authRequiredAboveBytes: null };
    }
    return (
      transport.limits?.() ?? { maxBytes: transport.maxBytes, authRequiredAboveBytes: null }
    );
  }, [maxBytesOverride, transport]);

  const [limits, setLimits] = useState<UploadLimits>(resolveLimits);

  // The ceiling moves the moment the user signs in, and the copy quoting it has
  // to move with them — otherwise the AUTH_REQUIRED → sign in → retry path
  // lands back on the anonymous ceiling and fails identically. runUpload reads
  // it fresh as well, so a retry is correct even before this commits.
  useEffect(() => {
    const apply = () =>
      setLimits((previous) => {
        const next = resolveLimits();
        return previous.maxBytes === next.maxBytes &&
          previous.authRequiredAboveBytes === next.authRequiredAboveBytes
          ? previous
          : next;
      });
    apply();
    return onAuthStateChanged(auth, apply);
  }, [resolveLimits]);

  /* React 19 ref cleanups, not the `(el | null)` form. The identity check in the
     cleanup is what makes a swap safe: when a surface replaces one trigger with
     another, the outgoing node must not blank a ref the newcomer has already
     claimed. `isConnected` on the way in is the mirror of it — a node that has
     already left the document is not a second live consumer. */
  const attachInput = useCallback((element: HTMLInputElement) => {
    if (inputRef.current && inputRef.current !== element && inputRef.current.isConnected) {
      warnSharedControl('<input type="file">');
    }
    inputRef.current = element;
    return () => {
      if (inputRef.current === element) inputRef.current = null;
    };
  }, []);

  const attachTrigger = useCallback((element: HTMLButtonElement) => {
    if (triggerRef.current && triggerRef.current !== element && triggerRef.current.isConnected) {
      warnSharedControl('upload trigger <button>');
    }
    triggerRef.current = element;
    return () => {
      if (triggerRef.current === element) triggerRef.current = null;
    };
  }, []);

  /* No shared-control warning here: two containers are not the same defect as
     two triggers. A container is only ever a focus fallback, so a stale one
     costs a focus landing on a detached node in a case where the alternative
     is <body>. */
  const attachContainer = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    if (!element) return;
    return () => {
      if (containerRef.current === element) containerRef.current = null;
    };
  }, []);

  /* ---- live region -------------------------------------------------------
     Phase transitions only. The visible percentage is rendered outside this
     region on purpose: routing it through aria-live would make a real
     progress bar unusable with a screen reader, which is precisely why the
     old component's fabricated one was tolerable.

     Gated on the UTTERANCE, not on the phase. A phase gate was silent for the
     second of two consecutive client-side validation failures: `select` and
     `fail` are dispatched with no await between them inside one React event
     handler, so they batch into a single commit at phase 'error' and 'queued'
     is never rendered. Pick foo.png, be told to upload a PDF; click "Choose
     another file", pick bar.png — same phase, so the effect returned and the
     live region still held the first message while the visible card changed
     underneath it. Comparing the rendered line also covers a second failure
     carrying a DIFFERENT message, which a phase gate can never catch. */
  useEffect(() => {
    const line = uploadPhaseAnnouncement(state);
    if (!line || line === spokenLine.current) return;
    spokenLine.current = line;
    setAnnouncement(line);
  }, [state]);

  const focusTrigger = useCallback(() => {
    // Never let focus fall to <body>. All four old variants unmounted the
    // dropzone on success and did exactly that.
    //
    // Deferred by a task because the element that should receive focus is
    // often the one this same state change is about to mount — calling
    // focus() inline would run before React commits and land nowhere.
    //
    // The container is the fallback, and it is not theoretical: UploadCard
    // mounts no trigger of its own, and its docstring sanctions hosting it
    // inside a SuitePanel. In that arrangement there is no `triggerProps`
    // anywhere, so cancel(), reset() and retry() all landed on <body> — the
    // exact failure this function exists to prevent. `containerProps` gives the
    // card itself somewhere to put focus.
    setTimeout(() => {
      const target = triggerRef.current ?? containerRef.current;
      if (target) {
        target.focus();
        return;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          '[useFileUpload] focus was returned with no trigger and no container mounted, ' +
            'so it fell to <body>. Spread triggerProps onto a button, or containerProps ' +
            'onto the element wrapping the card.',
        );
      }
    }, 0);
  }, []);

  const runUpload = useCallback(
    async (file: File) => {
      // Whatever was in flight belongs to a file the user has moved on from.
      // Its timers go with it; its rejection is handled by the staleness guard
      // further down, not by this call.
      const superseded = runRef.current;
      superseded?.controller.abort();
      clearRunTimers(superseded);

      const controller = new AbortController();
      const run: ActiveRun = { controller, controls: null, barTimer: null, parseTimer: null };
      runRef.current = run;
      setSelectedFile(file);
      transferStartedAt.current = null;
      lastMilestone.current = null;

      /**
       * The one guard that matters.
       *
       * Picking a second file aborts the first run and then *synchronously*
       * dispatches `select` for the second. The first run's rejection lands a
       * microtask later — and if it is allowed to dispatch, it drives the
       * second file's brand-new `queued` state to the terminal `cancelled`
       * phase. Every later event from the second run is then swallowed by the
       * reducer's terminal guard while the second run happily uploads to
       * completion: the card reports a cancellation for an upload that
       * succeeded, which is exactly the class of fabricated state this
       * rebuild exists to remove.
       *
       * Staleness, not abortion, is therefore the test. `signal.aborted` is
       * true for a superseded run *and* for a genuine user cancel; only
       * "am I still the run the card is about" separates them.
       */
      const isStale = () => runRef.current !== run;

      // Read fresh, not from the rendered copy: after AUTH_REQUIRED → sign in →
      // retry, the run has to see the ceiling the user now has, and the auth
      // listener above may not have committed yet.
      const runLimits = resolveLimits();
      const check = checkFileAgainstAccept(
        file,
        accept,
        runLimits.maxBytes,
        runLimits.authRequiredAboveBytes,
      );
      dispatch({
        type: 'select',
        fileName: file.name,
        totalBytes: file.size,
        transportCanPause: check.ok ? transport.canPause(file) : false,
      });

      if (!check.ok) {
        runRef.current = null;
        dispatch({ type: 'fail', code: check.code, message: check.message });
        callHost(
          'onError',
          handlers.current.onError,
          { code: check.code, message: check.message, retryAfterSeconds: null },
          file,
        );
        return;
      }

      // The server decides "anonymous" as `guard.user.uid.startsWith('anon:')`,
      // and in demo mode `auth.currentUser` is null while resolveAuthHeaders
      // still sends the demo bearer — so the route resolves a real uid and
      // enforces the 8s worker deadline, not the 4s one. Quoting 4 seconds
      // there would state a deadline the system does not apply, in the one
      // piece of copy whose whole point is that the number is real.
      const isAnonymous = !auth.currentUser && !isDemoModeEnabled();

      // Asked of the transport, per file, because only the transport knows
      // whether anything will enforce a deadline on THIS document. The route
      // applies its worker timeout to the binary branch only: a `.txt` returns
      // with no worker at all, and localTextExtractionTransport never leaves
      // the browser. Both correctly answer null, and a null note is never armed.
      const parseNoteText = transport.parseNote?.(file, isAnonymous) ?? null;

      // Whether this transport ever moved bytes. A transport that goes straight
      // to the unmeasurable phase has not paid the bar-suppression window, so
      // the window is armed for it on parse-start instead.
      let transferHappened = false;

      let result: TResult;
      try {
        result = await transport.run({
          file,
          signal: controller.signal,
          onTransferStart: () => {
            if (controller.signal.aborted || isStale()) return;
            transferStartedAt.current = Date.now();
            transferHappened = true;
            dispatch({ type: 'transfer-start' });
            // Suppression rule: a 400KB resume is gone in under 100ms, and a
            // bar that exists for one frame is worse than no bar. Only a
            // transfer still running at 250ms earns one.
            run.barTimer = setTimeout(() => {
              if (!controller.signal.aborted && !isStale()) dispatch({ type: 'bar-eligible' });
            }, TRANSFER_BAR_DELAY_MS);
          },
          onProgress: (bytesTransferred, totalBytes) => {
            if (controller.signal.aborted || isStale()) return;
            dispatch({ type: 'progress', bytesTransferred, totalBytes });

            // Milestones are announced only on a transfer long enough for
            // them to carry information. On a fast one they would be three
            // interruptions describing something already over.
            const startedAt = transferStartedAt.current;
            if (startedAt === null || Date.now() - startedAt <= MILESTONE_MIN_TRANSFER_MS) return;
            const percent = totalBytes > 0 ? Math.floor((bytesTransferred / totalBytes) * 100) : null;
            const milestone = nextMilestone(percent, lastMilestone.current);
            if (milestone === null) return;
            lastMilestone.current = milestone;
            setAnnouncement(`${milestone} percent uploaded.`);
          },
          onParseStart: () => {
            if (controller.signal.aborted || isStale()) return;
            if (run.barTimer !== null) {
              clearTimeout(run.barTimer);
              run.barTimer = null;
            }
            dispatch({ type: 'parse-start' });
            // No transfer means no suppression window has been paid, so the
            // parse gets its own. localTextExtractionTransport reads the file
            // in the browser and is frequently done inside 250ms; a bar for
            // that is a bar for one frame.
            if (!transferHappened) {
              run.barTimer = setTimeout(() => {
                if (!controller.signal.aborted && !isStale()) dispatch({ type: 'bar-eligible' });
              }, TRANSFER_BAR_DELAY_MS);
            }
            if (!parseNoteText) return;
            run.parseTimer = setTimeout(() => {
              if (!controller.signal.aborted && !isStale()) setParseNote(parseNoteText);
            }, PARSE_NOTE_DELAY_MS);
          },
          registerPauseControls: (controls) => {
            run.controls = controls;
          },
        });
      } catch (error) {
        // Superseded: the card is about a different file now, and everything
        // below — the dispatch, the note, the handlers — would be applied to
        // it. Its own run will report its own outcome.
        if (isStale()) {
          clearRunTimers(run);
          return;
        }
        clearRunTimers(run);
        runRef.current = null;
        setParseNote(null);
        if (controller.signal.aborted) {
          dispatch({ type: 'cancel' });
          callHost('onCancel', handlers.current.onCancel, file);
          return;
        }
        const failure: UploadFailure =
          error instanceof FileUploadError
            ? { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds }
            : {
                code: 'PARSE_FAILED',
                message: error instanceof Error ? error.message : 'Failed to read this resume.',
                retryAfterSeconds: null,
              };
        dispatch({
          type: 'fail',
          code: failure.code,
          message: failure.message,
          retryAfterSeconds: failure.retryAfterSeconds,
        });
        callHost('onError', handlers.current.onError, failure, file);
        return;
      }

      if (isStale()) {
        clearRunTimers(run);
        return;
      }
      clearRunTimers(run);
      runRef.current = null;
      if (controller.signal.aborted) return;
      dispatch({ type: 'succeed' });
      setParseNote(null);

      // onSuccess runs OUTSIDE the try on purpose.
      //
      // By here the bytes have moved and the text has come back — the upload
      // did succeed, and the card says so. What the host does next is its own
      // transaction. Routing a host rejection into onError would be a category
      // error twice over: it reports an upload failure that did not happen,
      // and the matching `fail` dispatch is a no-op out of the terminal `done`
      // phase, so the card would keep reading "Ready" in success ink while the
      // host showed an error.
      //
      // Not swallowed either. It is re-thrown on its own task so the host's
      // error boundary and window.onerror see it as what it is: a bug in the
      // host's success handler.
      try {
        await handlers.current.onSuccess?.(result, file);
      } catch (hostError) {
        console.error('[useFileUpload] the host onSuccess handler threw', hostError);
        setTimeout(() => {
          throw hostError;
        }, 0);
      }
    },
    [accept, resolveLimits, transport],
  );

  const selectFile = useCallback(
    (file: File | null | undefined) => {
      if (!file || disabled) return;
      setParseNote(null);
      void runUpload(file);
      // Focus is returned for the same reason retry() returns it, and this was
      // the only entry point that did not. Every selection path unmounts the
      // element the user just activated: the idle dropzone is a <button> and
      // the queued state renders a <div>, different element types, so React
      // destroys the focused node; and the card's "Choose another file" clears
      // state.error, which unmounts the whole .upload-recovery block including
      // the button under focus AND the hidden input the picker returns focus
      // to. Both landed on <body>.
      focusTrigger();
    },
    [disabled, focusTrigger, runUpload],
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    // Reset the value so re-picking the same file still fires onChange.
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  }, [disabled]);

  const pause = useCallback(() => {
    if (!state.canPause) return;
    runRef.current?.controls?.pause();
    dispatch({ type: 'pause' });
  }, [state.canPause]);

  const resume = useCallback(() => {
    if (!state.canResume) return;
    runRef.current?.controls?.resume();
    dispatch({ type: 'resume' });
  }, [state.canResume]);

  const cancel = useCallback(() => {
    if (isTerminalPhase(state.phase) || state.phase === 'idle') return;
    // runRef is deliberately left pointing at this run: its rejection is a
    // genuine user cancel, and the catch has to stay non-stale to report it
    // through onCancel.
    clearRunTimers(runRef.current);
    runRef.current?.controller.abort();
    setParseNote(null);
    dispatch({ type: 'cancel' });
    focusTrigger();
  }, [focusTrigger, state.phase]);

  const reset = useCallback(() => {
    clearRunTimers(runRef.current);
    runRef.current?.controller.abort();
    runRef.current = null;
    // Told BEFORE the file is dropped, and told at all because reset() reaches
    // nothing but hook-local state. After a success the host already holds the
    // parsed text; without this it had no way to learn the card was cleared.
    handlers.current.onReset?.(selectedFile);
    setSelectedFile(null);
    setParseNote(null);
    setAnnouncement('');
    spokenLine.current = '';
    dispatch({ type: 'reset' });
    focusTrigger();
  }, [focusTrigger, selectedFile]);

  /**
   * Retry the same in-memory File — no second pick, no lost bytes. This is
   * what makes "sign in, then carry on" work after AUTH_REQUIRED.
   *
   * Focus is returned for the same reason cancel() returns it: the control that
   * invoked this is a recovery button, and clearing the error unmounts the whole
   * recovery row underneath the user's own focus. Without this it lands on
   * <body>.
   */
  const retry = useCallback(() => {
    if (!selectedFile || disabled) return;
    setParseNote(null);
    void runUpload(selectedFile);
    focusTrigger();
  }, [disabled, focusTrigger, runUpload, selectedFile]);

  /* ---- drag surface ----------------------------------------------------- */

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      dragDepth.current += 1;
      setIsDragActive(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Counted, not toggled: dragging across a child element fires leave on the
    // parent, and a naive toggle makes the highlight flicker.
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragActive(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = 0;
      setIsDragActive(false);
      if (disabled) return;
      selectFile(event.dataTransfer?.files?.[0]);
    },
    [disabled, selectFile],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      selectFile(event.target.files?.[0]);
    },
    [selectFile],
  );

  const statusLine = useMemo(() => {
    if (state.phase === 'parsing' && processingLabel) return processingLabel;
    return uploadStatusLine(state);
  }, [processingLabel, state]);

  const recovery = useMemo(() => recoveryOptionsFor(state.error), [state.error]);

  return {
    state,
    file: selectedFile,
    accept,
    limits,
    statusLine,
    announcement,
    parseNote: state.phase === 'parsing' ? parseNote : null,
    isDragActive,
    recovery,
    inputRef,
    triggerRef,
    inputProps: {
      ref: attachInput,
      type: 'file',
      accept: accept.attr,
      className: 'upload-input-hidden',
      tabIndex: -1,
      disabled,
      // Named from the accept spec, so the name and the filter cannot drift:
      // "Choose a PDF, Word or TXT file".
      'aria-label': `Choose a ${accept.label} file`,
      onChange: onInputChange,
    },
    containerProps: { ref: attachContainer, tabIndex: -1 },
    dropzoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    triggerProps: {
      ref: attachTrigger,
      type: 'button',
      disabled,
      onClick: openPicker,
    },
    selectFile,
    openPicker,
    pause,
    resume,
    cancel,
    retry,
    reset,
  };
}
