/**
 * File upload — types, the single accept spec, and the pure state machine.
 *
 * Nothing in this file touches React, Firebase or the DOM. Every export is a
 * value or a pure function, so `scripts/file-upload-state.test.js` drives the
 * whole state machine in Node without a browser.
 *
 * The rule this file exists to enforce:
 *
 *   `percent` is `number | null`. A missing measurement is `null`, never 0.
 *
 * A 0 renders as a bar with a real width and a "0%" label, which reads as
 * "we measured, and the answer is nothing". That is a fabricated value, and
 * this product's whole claim is that it does not invent things. `null` cannot
 * be formatted into a width by accident; a 0 can.
 */

/* -------------------------------------------------------------- accept spec */

export interface AcceptSpec {
  /** Lowercase, dot-prefixed. The authority for what the server will take. */
  readonly extensions: readonly string[];
  /** MIME types added to the `accept` attribute so mobile pickers behave. */
  readonly mimeTypes: readonly string[];
  /** Ready-made value for `<input type="file" accept>`. */
  readonly attr: string;
  /** Human phrasing, used in hints and error copy. One source, one wording. */
  readonly label: string;
}

function buildAccept(
  extensions: readonly string[],
  mimeTypes: readonly string[],
  label: string,
): AcceptSpec {
  return {
    extensions,
    mimeTypes,
    attr: [...extensions, ...mimeTypes].join(','),
    label,
  };
}

/**
 * The resume accept spec. Four surfaces used to spell this four different
 * ways, which is how a file the server accepts became un-pickable on one
 * screen and a file it rejects became pickable on another.
 *
 * Kept in step with VALID_EXTENSIONS in app/api/gauntlet/parse-resume/route.ts.
 */
export const RESUME_ACCEPT = buildAccept(
  ['.pdf', '.docx', '.doc', '.txt'],
  [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  'PDF, Word or TXT',
);

/**
 * Writing tools extract text in the browser with mammoth, which cannot read
 * PDF. The narrower spec is a real capability difference, not drift.
 */
export const DOCUMENT_TEXT_ACCEPT = buildAccept(
  ['.txt', '.docx', '.doc'],
  [
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  'TXT, DOC or DOCX',
);

/**
 * The picker behind "Upload a Word version".
 *
 * SCANNED_PDF is offered only because the previous PDF was image-only, so a
 * picker still highlighting `.pdf` would let the user pick another scanned PDF
 * and hit the identical error. The label promises a narrowing; this is the
 * narrowing.
 */
export const WORD_DOCUMENT_ACCEPT = buildAccept(
  ['.docx', '.doc'],
  [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  'Word',
);

/* ----------------------------------------------------------------- limits */

/** Above this the client must go through Firebase Storage. Mirrors the route. */
export const DIRECT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Hard ceiling for signed-in users. Mirrors storage.rules and the route. */
export const AUTHENTICATED_MAX_BYTES = 10 * 1024 * 1024;
/** Server-side extraction cap, surfaced so copy can quote a real number. */
export const EXTRACTED_TEXT_CHAR_LIMIT = 50_000;

/**
 * `uploadBytesResumable` silently degrades to a single-shot PUT at or below
 * this size, and a single-shot PUT cannot be paused. Verified in
 * @firebase/storage: `_shouldDoResumable(blob)` is `blob.size() > 256 * 1024`,
 * strictly greater — so a file of exactly this many bytes is one-shot too.
 * A pause control on any of them would be a button that does nothing.
 */
export const RESUMABLE_PAUSE_MIN_BYTES = 256 * 1024;

/**
 * A 400KB resume transfers in well under 100ms. Showing a determinate bar for
 * one frame is worse than showing none, so the bar only appears if the
 * transfer is still running at this mark.
 *
 * Do not raise this to make the bar easier to see in a demo. The bar is
 * supposed to be rare.
 */
export const TRANSFER_BAR_DELAY_MS = 250;

/** Milestones are only worth announcing on a transfer long enough to have any. */
export const MILESTONE_MIN_TRANSFER_MS = 5_000;
export const PROGRESS_MILESTONES: readonly number[] = [25, 50, 75];

/** How long the parse phase runs before the extra deadline note is shown. */
export const PARSE_NOTE_DELAY_MS = 5_000;

/**
 * The worker deadlines the route actually enforces
 * (app/api/gauntlet/parse-resume/route.ts: `timeoutMs: isAnon ? 4_000 : 8_000`).
 * Quoted as a deadline, never counted down — a countdown would be a
 * progress number for a step that emits no progress.
 */
export const PARSE_DEADLINE_SECONDS = { anonymous: 4, signedIn: 8 } as const;

/**
 * The note itself. Only ever shown for work the route really puts through the
 * worker — a transport decides that, see `UploadTransport.parseNote`. A `.txt`
 * takes the `detectedType === 'txt'` branch with no worker and no deadline at
 * all, and quoting one there would state a limit nothing enforces, in the one
 * piece of copy whose entire justification is that the number is real.
 */
export function parseDeadlineNote(isAnonymous: boolean): string {
  const seconds = isAnonymous ? PARSE_DEADLINE_SECONDS.anonymous : PARSE_DEADLINE_SECONDS.signedIn;
  return `Reading stops after ${seconds} seconds if the document will not give up its text.`;
}

/* ------------------------------------------------------------------ errors */

export type UploadErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'AUTH_REQUIRED'
  | 'SCANNED_PDF'
  | 'PARSE_EMPTY'
  | 'PARSE_FAILED'
  | 'RATE_LIMITED'
  | 'NETWORK';

export class FileUploadError extends Error {
  readonly code: UploadErrorCode;
  /** Only ever set from a real `Retry-After` header. Never guessed. */
  readonly retryAfterSeconds: number | null;

  constructor(code: UploadErrorCode, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'FileUploadError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface UploadFailure {
  code: UploadErrorCode;
  message: string;
  retryAfterSeconds: number | null;
}

/**
 * Every member here is something the user can click.
 *
 * There used to be a `wait` member carrying the label "Wait and try again".
 * Nothing ever rendered it — the card filtered it out and drove the delay from
 * `state.error.retryAfterSeconds` instead — so it was data shaped like a
 * rendered option that no surface could ever show. Waiting is not an action;
 * the real Retry-After is a note.
 */
export type UploadRecoveryAction =
  | 'retry'
  | 'sign-in'
  | 'choose-word'
  | 'choose-another'
  | 'paste';

export interface UploadRecoveryOption {
  action: UploadRecoveryAction;
  label: string;
}

/**
 * Recovery is offered only where it can succeed.
 *
 * SCANNED_PDF gets no Retry: the same image-only PDF will fail the same way
 * every time, and a Retry button that is guaranteed to fail is a lie about
 * what the product can do.
 */
export const UPLOAD_RECOVERY: Record<UploadErrorCode, readonly UploadRecoveryOption[]> = {
  // Deliberately no sign-in here, and `checkFileAgainstAccept` is ordered to
  // keep that true: the hard ceiling is tested first, so a file in the
  // signed-out band answers AUTH_REQUIRED and only a file past the ceiling
  // answers FILE_TOO_LARGE. The route agrees. So FILE_TOO_LARGE always means
  // "bigger than the product's ceiling", which an account cannot change.
  FILE_TOO_LARGE: [{ action: 'choose-another', label: 'Choose a smaller file' }],
  UNSUPPORTED_TYPE: [
    { action: 'choose-another', label: 'Choose another file' },
    { action: 'paste', label: 'Paste instead' },
  ],
  AUTH_REQUIRED: [{ action: 'sign-in', label: 'Sign in and continue' }],
  SCANNED_PDF: [
    { action: 'choose-word', label: 'Upload a Word version' },
    { action: 'paste', label: 'Paste instead' },
  ],
  PARSE_EMPTY: [
    { action: 'choose-another', label: 'Choose another file' },
    { action: 'paste', label: 'Paste instead' },
  ],
  PARSE_FAILED: [
    { action: 'retry', label: 'Try again' },
    { action: 'paste', label: 'Paste instead' },
  ],
  // The delay itself renders as the real Retry-After note, driven from
  // `state.error.retryAfterSeconds`. The retry is the exit once the window has
  // passed — the only thing here there is to click.
  RATE_LIMITED: [{ action: 'retry', label: 'Try again' }],
  NETWORK: [{ action: 'retry', label: 'Try again' }],
};

export function recoveryOptionsFor(failure: UploadFailure | null): readonly UploadRecoveryOption[] {
  if (!failure) return [];
  return UPLOAD_RECOVERY[failure.code] ?? UPLOAD_RECOVERY.PARSE_FAILED;
}

/* ------------------------------------------------------------- validation */

export type AcceptCheck =
  | { ok: true; extension: string }
  | {
      ok: false;
      code: Extract<UploadErrorCode, 'UNSUPPORTED_TYPE' | 'FILE_TOO_LARGE' | 'AUTH_REQUIRED'>;
      message: string;
    };

export interface FileFacts {
  name: string;
  size: number;
}

/**
 * The two ceilings a surface has to tell the truth about.
 *
 * They are different questions. `maxBytes` is the point past which nothing
 * helps. `authRequiredAboveBytes` is the point past which an account helps —
 * on the resume transport that is a real capability boundary, because Firebase
 * Storage is the only path above 4MB and `storage.rules` is
 * `request.auth != null`.
 *
 * Collapsing them was a live defect: the idle dropzone quoted 10MB to a
 * signed-out visitor, the client check passed a 6MB file against that number,
 * and the transport then failed it with a *different* number. The surface
 * stated a ceiling the transport would not honour for the person reading it.
 */
export interface UploadLimits {
  maxBytes: number;
  /** `null` when signing in changes nothing about what will be accepted. */
  authRequiredAboveBytes: number | null;
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

/**
 * Extension + size, both synchronous and sub-millisecond.
 *
 * Deliberately returns a result instead of throwing, and deliberately is not
 * a state: a "Validating…" frame would be fabricated activity for work that
 * takes no measurable time.
 *
 * FILE_TOO_LARGE is tested BEFORE the sign-in threshold, so the two codes keep
 * meaning what UPLOAD_RECOVERY says they mean: over the hard ceiling is a dead
 * end that an account cannot open, and only the band between the two offers
 * sign-in.
 */
export function checkFileAgainstAccept(
  file: FileFacts,
  spec: AcceptSpec,
  maxBytes: number,
  authRequiredAboveBytes: number | null = null,
): AcceptCheck {
  const lowerName = file.name.toLowerCase();
  const extension = spec.extensions.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: `Please upload a ${spec.label} file.`,
    };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `File is too large. Upload a resume under ${megabytes(maxBytes)}.`,
    };
  }
  if (authRequiredAboveBytes !== null && file.size > authRequiredAboveBytes) {
    return {
      ok: false,
      code: 'AUTH_REQUIRED',
      message: `Sign in to upload resumes over ${megabytes(authRequiredAboveBytes)}.`,
    };
  }
  return { ok: true, extension };
}

/**
 * The idle hint. Quotes the ceiling in force for whoever is reading it, and
 * names the second one only when signing in would really move it.
 */
export function uploadLimitHint(
  spec: AcceptSpec,
  limits: UploadLimits,
): string {
  const { maxBytes, authRequiredAboveBytes } = limits;
  if (authRequiredAboveBytes === null || authRequiredAboveBytes >= maxBytes) {
    return `${spec.label}, up to ${megabytes(maxBytes)}`;
  }
  return `${spec.label}, up to ${megabytes(authRequiredAboveBytes)}. Sign in for up to ${megabytes(maxBytes)}.`;
}

/* -------------------------------------------------------------- formatting */

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * Returns `null` for anything unmeasured. Callers must render the missing
 * state rather than substituting "0 B" — an unknown size is not zero bytes.
 */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 100 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
}

/** "1.4 MB of 2.3 MB", or `null` when either half is unmeasured. */
export function formatByteRange(
  transferred: number | null | undefined,
  total: number | null | undefined,
): string | null {
  const left = formatBytes(transferred);
  const right = formatBytes(total);
  if (left === null || right === null) return null;
  return `${left} of ${right}`;
}

/* ----------------------------------------------------------- state machine */

export type UploadPhase =
  | 'idle'
  | 'queued'
  | 'transferring'
  | 'paused'
  | 'parsing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface UploadState {
  phase: UploadPhase;
  fileName: string | null;
  /** Always the size the user picked — never the multipart wire size. */
  totalBytes: number | null;
  bytesTransferred: number | null;
  /** number only when a real byte count was observed; null otherwise. */
  percent: number | null;
  /** True when there is activity but no measurement to report. */
  indeterminate: boolean;
  /** Has the transport ever reported a byte count for this file? */
  measured: boolean;
  /**
   * Did bytes actually leave the machine for this file?
   *
   * Not the same as `measured`: a transfer can start and be over before a
   * single progress event lands. This exists so the parsing announcement can
   * only say "Upload complete" when something was in fact uploaded —
   * localTextExtractionTransport reads the file in the browser and never
   * touches the network, and telling a screen-reader user their upload
   * completed would be describing an event that did not happen.
   */
  transferred: boolean;
  /** Transfer survived TRANSFER_BAR_DELAY_MS, so a bar is worth drawing. */
  barEligible: boolean;
  /** The one flag the card reads to decide whether any bar renders at all. */
  barVisible: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  /** Capability of the chosen transport for this file, fixed at selection. */
  transportCanPause: boolean;
  error: UploadFailure | null;
}

export type UploadEvent =
  | { type: 'select'; fileName: string; totalBytes: number; transportCanPause: boolean }
  | { type: 'transfer-start' }
  | { type: 'progress'; bytesTransferred: number; totalBytes: number }
  | { type: 'bar-eligible' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'parse-start' }
  | { type: 'succeed' }
  | { type: 'fail'; code: UploadErrorCode; message: string; retryAfterSeconds?: number | null }
  | { type: 'cancel' }
  | { type: 'reset' };

export const initialUploadState: UploadState = {
  phase: 'idle',
  fileName: null,
  totalBytes: null,
  bytesTransferred: null,
  percent: null,
  indeterminate: false,
  measured: false,
  transferred: false,
  barEligible: false,
  barVisible: false,
  canPause: false,
  canResume: false,
  canCancel: false,
  transportCanPause: false,
  error: null,
};

const TERMINAL_PHASES: readonly UploadPhase[] = ['done', 'error', 'cancelled'];

export function isTerminalPhase(phase: UploadPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The reducer is the only place a phase changes, and the only place `percent`
 * is written. Every transition here is total: unreachable events return the
 * state unchanged rather than throwing, because a transport that emits a late
 * progress event after a cancel is normal, not exceptional.
 */
export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  // Terminal states have no exits. Only a fresh selection or an explicit reset
  // leaves them, so a pause/resume/cancel arriving after the fact is a no-op
  // rather than a resurrection.
  if (isTerminalPhase(state.phase) && event.type !== 'select' && event.type !== 'reset') {
    return state;
  }

  switch (event.type) {
    case 'select':
      return {
        ...initialUploadState,
        phase: 'queued',
        fileName: event.fileName,
        totalBytes: Number.isFinite(event.totalBytes) && event.totalBytes >= 0 ? event.totalBytes : null,
        // Queued is honest activity with nothing to measure yet.
        indeterminate: true,
        canCancel: true,
        transportCanPause: event.transportCanPause,
      };

    case 'transfer-start':
      if (state.phase !== 'queued') return state;
      return {
        ...state,
        phase: 'transferring',
        transferred: true,
        // No byte event has arrived yet, so the transfer is genuinely
        // unmeasured. `measured` flips on the first real progress event.
        indeterminate: !state.measured,
        canPause: false,
        canCancel: true,
      };

    case 'progress': {
      if (state.phase !== 'transferring') return state;
      const total = Number.isFinite(event.totalBytes) && event.totalBytes > 0 ? event.totalBytes : state.totalBytes;
      if (total === null || total <= 0) return state;
      const transferred = clamp(event.bytesTransferred, 0, total);
      // Nothing observable moved. Returning the SAME OBJECT is what makes this
      // worth doing: React skips the re-render entirely, so a repeated byte
      // count stops re-rendering the hook, the card and the dropzone (neither
      // is memoised) and stops re-running the live-region effect. Only valid
      // once `measured` is true — before that the first event still has to flip
      // indeterminate off and set canPause, even if the numbers match.
      if (state.measured && transferred === state.bytesTransferred && total === state.totalBytes) {
        return state;
      }
      // floor, not round: 99.6% must not display as 100% while bytes remain.
      const percent = Math.floor((transferred / total) * 100);
      return {
        ...state,
        totalBytes: total,
        bytesTransferred: transferred,
        percent,
        measured: true,
        indeterminate: false,
        barVisible: state.barEligible,
        canPause: state.transportCanPause,
      };
    }

    case 'bar-eligible':
      // `paused` counts, not just `transferring`. The 250ms timer fires exactly
      // once and is never re-armed, so an event landing while the user has the
      // transfer paused used to be dropped for good: the bar would then be gone
      // for the whole rest of the upload. `parsing` counts for the transport
      // that has no transfer at all — see `parse-start`. Queued is still
      // excluded: nothing has started, so there is nothing to have survived.
      if (state.phase !== 'transferring' && state.phase !== 'paused' && state.phase !== 'parsing') {
        return state;
      }
      return { ...state, barEligible: true, barVisible: true };

    case 'pause':
      // barVisible follows barEligible here exactly as it does in `resume` and
      // in every `progress`. Forcing it true was an unguarded exit from the
      // suppression rule, and it produced the worst reading of all: a bar that
      // appears on pause and vanishes on resume, which is a control that looks
      // broken. (`parse-start` still forces it, but only for a parse that
      // follows a real transfer — see the note there. That is the single
      // deliberate exception, and it never fires without the window already
      // having been paid.)
      if (state.phase !== 'transferring' || !state.canPause) return state;
      return {
        ...state,
        phase: 'paused',
        canPause: false,
        canResume: true,
        barVisible: state.barEligible,
      };

    case 'resume':
      if (state.phase !== 'paused') return state;
      return {
        ...state,
        phase: 'transferring',
        canPause: state.transportCanPause,
        canResume: false,
        barVisible: state.barEligible,
      };

    case 'parse-start':
      if (state.phase !== 'queued' && state.phase !== 'transferring' && state.phase !== 'paused') {
        return state;
      }
      return {
        ...state,
        phase: 'parsing',
        // The worker emits no increments. There is no number to show, so the
        // number is removed — not zeroed, not held at 100.
        percent: null,
        indeterminate: true,
        // A parse that follows a real transfer keeps the bar: the 250ms
        // suppression window was already paid on the way here, and removing the
        // bar at the handover would read as the upload having stopped.
        //
        // A parse entered straight from `queued` has paid nothing.
        // localTextExtractionTransport goes queued -> parsing with no network
        // in between, so forcing the bar there painted the traversing segment
        // from frame 0 for a mammoth read that often finishes in tens of
        // milliseconds — the exact one-frame bar TRANSFER_BAR_DELAY_MS exists
        // to prevent. That path obeys the same latch as every other exit, and
        // the hook arms a fresh window for it.
        barVisible: state.phase === 'queued' ? state.barEligible : true,
        canPause: false,
        canResume: false,
        canCancel: true,
      };

    case 'succeed':
      if (state.phase === 'idle') return state;
      return {
        ...state,
        phase: 'done',
        // 100 is only claimable where something counted. On a transport that
        // never transfers — localTextExtractionTransport reads the file in the
        // browser and emits no progress at all — there is no measurement to
        // round up to, so the percentage and the byte count stay unknown
        // rather than being back-filled from file.size. Nothing renders them
        // today, but a synthesised byte count sitting next to `measured:false`
        // is one gating mistake away from being shown.
        percent: state.measured ? 100 : null,
        bytesTransferred: state.measured ? state.totalBytes : state.bytesTransferred,
        indeterminate: false,
        // The bar is removed on success: a finished transfer is not a
        // progress state, and a full bar invites a second read of "waiting".
        barVisible: false,
        canPause: false,
        canResume: false,
        canCancel: false,
        error: null,
      };

    case 'fail':
      if (state.phase === 'idle') return state;
      return {
        ...state,
        phase: 'error',
        // An error is not 0%. Whatever was measured stays in bytesTransferred
        // where it is true; the percentage is withdrawn with the bar.
        percent: null,
        indeterminate: false,
        barVisible: false,
        canPause: false,
        canResume: false,
        canCancel: false,
        error: {
          code: event.code,
          message: event.message,
          retryAfterSeconds: event.retryAfterSeconds ?? null,
        },
      };

    case 'cancel':
      if (state.phase === 'idle') return state;
      return {
        ...state,
        phase: 'cancelled',
        // A cancel is not 0% either. The real bytes transferred survive so the
        // card can say what actually happened.
        percent: null,
        indeterminate: false,
        barVisible: false,
        canPause: false,
        canResume: false,
        canCancel: false,
      };

    case 'reset':
      return initialUploadState;

    default:
      return state;
  }
}

/* ------------------------------------------------------------------- copy */

/**
 * The visible status line. Must NOT be placed inside the live region — the
 * percentage changes many times a second and would be read out every time.
 */
export function uploadStatusLine(state: UploadState): string | null {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'queued':
      return 'Preparing upload';
    case 'transferring':
      return 'Uploading';
    case 'paused':
      return 'Paused';
    case 'parsing':
      return 'Reading the document';
    case 'done':
      return 'Ready';
    case 'error':
      return state.error?.message ?? 'Upload failed';
    case 'cancelled':
      return 'Upload cancelled';
    default:
      return null;
  }
}

/**
 * The Material Symbol that ships beside the status line on a terminal phase.
 *
 * The three terminal phases are the only ones the card tints — error, success
 * and cancelled — and `references/tokens.md` is explicit that status never
 * travels on colour alone: the icon is what carries the meaning for anyone who
 * cannot distinguish the hue. Non-terminal phases return null because their
 * status text is already the whole message.
 */
export function uploadStatusIcon(phase: UploadPhase): string | null {
  switch (phase) {
    case 'error':
      return 'error';
    case 'done':
      return 'check_circle';
    case 'cancelled':
      return 'cancel';
    default:
      return null;
  }
}

/**
 * What the live region says. Fired on phase transitions only, plus the
 * 25/50/75 milestones on a transfer long enough for them to mean anything —
 * see useFileUpload. Seven utterances is the ceiling for a whole upload.
 */
export function uploadPhaseAnnouncement(state: UploadState): string | null {
  const name = state.fileName ?? 'file';
  switch (state.phase) {
    case 'queued':
      return `${name} selected. Preparing upload.`;
    case 'transferring':
      return `Uploading ${name}.`;
    case 'paused':
      return `Upload of ${name} paused.`;
    case 'parsing':
      // "Upload complete" only when bytes really moved. A browser-side
      // extraction goes queued -> parsing with no transfer at all.
      return state.transferred
        ? `Upload complete. Reading ${name}. No progress available for this step.`
        : `Reading ${name}. No progress available for this step.`;
    case 'done':
      return `${name} is ready.`;
    case 'error':
      return `Upload failed. ${state.error?.message ?? ''}`.trim();
    case 'cancelled':
      return `Upload of ${name} cancelled.`;
    default:
      return null;
  }
}

/** `aria-valuetext` for the determinate bar. Null when there is no measurement. */
export function progressValueText(state: UploadState): string | null {
  if (state.percent === null) return null;
  const range = formatByteRange(state.bytesTransferred, state.totalBytes);
  return range ? `${state.percent} percent, ${range}` : `${state.percent} percent`;
}

/** The milestones a transfer has crossed, given the last one already spoken. */
export function nextMilestone(percent: number | null, lastSpoken: number | null): number | null {
  if (percent === null) return null;
  let candidate: number | null = null;
  for (const milestone of PROGRESS_MILESTONES) {
    if (percent >= milestone && (lastSpoken === null || milestone > lastSpoken)) {
      candidate = milestone;
    }
  }
  return candidate;
}
