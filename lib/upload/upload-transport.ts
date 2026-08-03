'use client';

/**
 * Upload transports — where the real bytes come from.
 *
 * Two transports for resumes, and both are required:
 *
 *   ≤4MB, and every anonymous upload  → XMLHttpRequest + upload.onprogress
 *   >4MB signed in                    → uploadBytesResumable
 *
 * XHR rather than a streamed fetch body, because our own route answers 411
 * when Content-Length is absent (app/api/gauntlet/parse-resume/route.ts) and a
 * chunked stream cannot set it. `fetch` also cannot report request progress at
 * all outside a Chromium-only streaming path.
 *
 * Firebase Storage rather than XHR for large files, because it is the only one
 * of the two that can genuinely pause — and storage.rules requires
 * `request.auth != null`, which is why anonymous users never get a pause
 * control. That is the constraint, not a shortfall.
 */

import { ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { AuthTokenUnavailableError, resolveAuthHeaders } from '@/lib/auth-fetch';
import {
  AUTHENTICATED_MAX_BYTES,
  DIRECT_UPLOAD_MAX_BYTES,
  DOCUMENT_TEXT_ACCEPT,
  FileUploadError,
  RESUMABLE_PAUSE_MIN_BYTES,
  RESUME_ACCEPT,
  checkFileAgainstAccept,
  parseDeadlineNote,
  type AcceptSpec,
  type UploadErrorCode,
  type UploadLimits,
} from './file-upload-types';

export const PARSE_RESUME_ENDPOINT = '/api/gauntlet/parse-resume';
export const PARSE_RESUME_ABANDON_ENDPOINT = '/api/gauntlet/parse-resume/abandon';

/* ------------------------------------------------------------- transport API */

export interface PauseControls {
  pause(): void;
  resume(): void;
}

export interface TransportContext {
  file: File;
  signal: AbortSignal;
  /** Bytes have started moving. Fired once, before the first progress event. */
  onTransferStart(): void;
  /**
   * A real measurement. `totalBytes` is always the size the user picked —
   * transports that know a different wire size scale into this one.
   */
  onProgress(bytesTransferred: number, totalBytes: number): void;
  /** Transfer finished; an unmeasurable server-side step has begun. */
  onParseStart(): void;
  /** Hand the hook pause/resume, or null when this transport cannot. */
  registerPauseControls(controls: PauseControls | null): void;
}

export interface UploadTransport<TResult> {
  readonly id: string;
  /** The accept spec this transport's backend actually honours. */
  readonly accept: AcceptSpec;
  readonly maxBytes: number;
  /**
   * The ceilings in force for whoever is holding the browser right now.
   *
   * Read at run time, never cached: `maxBytes` alone cannot express "10MB, but
   * only with an account", and a surface that quotes a number the transport
   * will not honour for its reader is stating something untrue.
   */
  limits?(): UploadLimits;
  /** Whether *this* file, on *this* transport, can really be paused. */
  canPause(file: File): boolean;
  /**
   * The real deadline the backend will enforce on the unmeasurable step for
   * *this* file, or null when nothing will. Shown only after the parse has
   * been running PARSE_NOTE_DELAY_MS.
   */
  parseNote?(file: File, isAnonymous: boolean): string | null;
  run(context: TransportContext): Promise<TResult>;
}

export interface ResumeUploadResult {
  text: string;
  fileName: string;
  sourceType: 'direct' | 'storage';
  characterCount?: number;
  detectedType?: 'pdf' | 'docx' | 'doc' | 'txt';
  /**
   * Whether the route deleted the Storage object it read from.
   *
   * This is the whole of the provenance a caller gets, and deliberately so.
   * There is no `storagePath` here: on the success path the object is gone by
   * the time this resolves, so a path would name something that does not exist
   * — see runResumableUpload. Do not re-add one.
   */
  storagePathDeleted?: boolean;
}

/* ------------------------------------------------------------------ helpers */

/** Storage rules match on contentType, and `file.type` is not trustworthy. */
const STORAGE_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

/**
 * Browsers hand out exotic values for the same file — `application/x-pdf`,
 * `application/download`, or an empty string from a share-sheet. storage.rules
 * matches contentType against a fixed list and rejects anything else, so the
 * type is re-derived from the extension the server will use anyway.
 */
export function resolveStorageContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  for (const [ext, type] of Object.entries(STORAGE_CONTENT_TYPES)) {
    if (lower.endsWith(ext)) return type;
  }
  return 'application/octet-stream';
}

/**
 * A file name the object path can safely carry.
 *
 * Replacing everything outside `[A-Za-z0-9._-]` is not enough on its own,
 * because it PRESERVES a literal `..` — and both server checks reject a path
 * containing one. `Sr. Engineer..docx` became `Sr._Engineer..docx`, and for a
 * signed-in user with a resume over 4MB that produced exactly the orphan this
 * module exists to prevent: the whole file written to the bucket, the parse
 * answering 403 'Invalid resume upload path.', neither the server's cleanup
 * nor the client's abandon call able to name the path, and a 'Try again'
 * button regenerating the identical name forever.
 *
 * So dot runs collapse. After both replacements the string contains only
 * `[A-Za-z0-9._-]` with no two dots adjacent, and `slice` cannot bring two
 * apart dots together — which means the path this builds can never contain
 * `..` and can never contain a slash, for any input at all.
 *
 * `slice(-140)` keeps the TAIL so a long name still ends in its extension.
 */
export function safeStorageFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-140);
}

function retryAfterFrom(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function abortError(): FileUploadError {
  return new FileUploadError('NETWORK', 'Upload cancelled.');
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Turn a route response body into the one error shape the UI understands. */
function failureFromResponse(
  status: number,
  payload: Record<string, unknown>,
  retryAfter: string | null,
): FileUploadError {
  const rawCode = typeof payload.code === 'string' ? payload.code : '';
  const message =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error === 'string' && payload.error) ||
    'Failed to read this resume.';

  if (status === 429) {
    // Two different 429s come out of lib/api-auth.ts and both carry
    // `requiresAuth: true`, so the server's own remedy — create an account —
    // is the one this branch keeps. Flattening them into the rate-limit copy
    // sent the card to Retry when the thing that works is Sign in.
    //
    // The Retry-After travels with it. Only ONE of the two is actually
    // reachable here: ROUTE_FEATURE_MAP (api-auth.ts) has no
    // '/api/gauntlet/parse-resume' prefix, so the anonymous hard cap never
    // fires on this route and the unauthenticated speed throttle is what
    // answers — a 60-second sliding window that ships `Retry-After: 60`.
    // Waiting genuinely does work there, so dropping the header withheld a
    // second real remedy. The card renders both: the sign-in button, and the
    // note driven from retryAfterSeconds.
    if (payload.requiresAuth === true) {
      return new FileUploadError('AUTH_REQUIRED', message, retryAfterFrom(retryAfter));
    }
    return new FileUploadError(
      'RATE_LIMITED',
      'Too many uploads in a row. Give it a minute and try again.',
      retryAfterFrom(retryAfter),
    );
  }

  const known: readonly UploadErrorCode[] = [
    'FILE_TOO_LARGE',
    'UNSUPPORTED_TYPE',
    'AUTH_REQUIRED',
    'SCANNED_PDF',
    'PARSE_EMPTY',
    'PARSE_FAILED',
  ];
  const code = known.includes(rawCode as UploadErrorCode)
    ? (rawCode as UploadErrorCode)
    : 'PARSE_FAILED';
  return new FileUploadError(code, message);
}

/* ---------------------------------------------------------------- XHR leg */

interface XhrRequestOptions {
  url: string;
  body: FormData | string;
  headers: Headers;
  signal: AbortSignal;
  /**
   * Size the user picked. FormData reports the *wire* size in
   * `event.total` — multipart boundaries, headers and the filename are all in
   * there — so progress is scaled back onto this number. Otherwise the card
   * shows a total the user never chose and a percentage that finishes early.
   */
  totalBytes: number | null;
  onProgress?(bytesTransferred: number, totalBytes: number): void;
  onUploadComplete?(): void;
}

/**
 * How long the request may go with nothing at all happening on it.
 *
 * Deliberately NOT `xhr.timeout`, which is a ceiling on the *whole* request:
 * a 10MB resume on a slow mobile link legitimately takes minutes, so any total
 * timeout large enough to be safe is too large to catch a dead socket. A stall
 * watchdog measures the thing that actually distinguishes the two — silence —
 * and is reset by every upload-progress, download-progress and readystate
 * event.
 *
 * The quiet stretch it has to tolerate is the server-side parse: the worker
 * deadline is 8s for a signed-in caller, plus the bucket download for the
 * resumable path. 45s leaves a wide margin over both.
 */
const STALL_TIMEOUT_MS = 45_000;

function xhrJson<T>(options: XhrRequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = () => {
      if (stallTimer !== null) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearStallTimer();
      options.signal.removeEventListener('abort', onAbort);
      fn();
    };

    // Without this the one exit from a dead connection is the user pressing
    // cancel, and the card sits on "Uploading" at its last real percentage
    // indefinitely — the only state in the machine with no way out.
    //
    // ORDER IS LOAD-BEARING. `xhr.abort()` dispatches the `abort` progress
    // event SYNCHRONOUSLY (XHR spec, "the abort() method steps"), so aborting
    // first hands the race to the `abort` listener below and the caller
    // receives abortError() — "Upload cancelled." The user is then told they
    // cancelled a transfer they never touched, in error ink, and because the
    // stall path aborts the XHR rather than the AbortController the hook takes
    // its `fail` branch rather than its `cancel` one. Settling first makes the
    // subsequent abort event a no-op, because `finish` sets `settled` before it
    // rejects.
    const armStallTimer = () => {
      clearStallTimer();
      if (settled) return;
      stallTimer = setTimeout(() => {
        finish(() =>
          reject(new FileUploadError('NETWORK', 'The upload stopped responding. Try again.')),
        );
        try {
          xhr.abort();
        } catch {
          /* already finished */
        }
      }, STALL_TIMEOUT_MS);
    };

    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        /* the request had already finished */
      }
      finish(() => reject(abortError()));
    };

    xhr.open('POST', options.url, true);
    options.headers.forEach((value, key) => xhr.setRequestHeader(key, value));

    xhr.upload.addEventListener('progress', (event) => {
      armStallTimer();
      // lengthComputable false means the browser genuinely does not know.
      // Reporting anything here would be inventing a measurement.
      //
      // `loaded <= 0` is refused for the same reason the Firebase leg refuses
      // its priming snapshot below: an event carrying no bytes carries no
      // measurement, and passing it through flips the card from honestly
      // indeterminate to `measured: true, percent: 0` — a determinate bar
      // reading "Uploading · 0% · 0 B of 2.3 MB" for a transfer that has not
      // moved anything. Both legs now state the same rule.
      if (!event.lengthComputable || event.total <= 0 || event.loaded <= 0) return;
      const total = options.totalBytes ?? event.total;
      const scaled = Math.min(total, Math.round((event.loaded / event.total) * total));
      options.onProgress?.(scaled, total);
    });

    xhr.upload.addEventListener('load', () => {
      armStallTimer();
      options.onUploadComplete?.();
    });

    xhr.addEventListener('progress', armStallTimer);
    xhr.addEventListener('readystatechange', armStallTimer);

    xhr.addEventListener('error', () => {
      finish(() => reject(new FileUploadError('NETWORK', 'The upload could not reach the server.')));
    });
    xhr.addEventListener('abort', () => {
      finish(() => reject(abortError()));
    });

    xhr.addEventListener('load', () => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && !payload.error) {
        finish(() => resolve(payload as T));
        return;
      }
      const retryAfter = xhr.getResponseHeader('Retry-After');
      finish(() => reject(failureFromResponse(xhr.status, payload, retryAfter)));
    });

    options.signal.addEventListener('abort', onAbort);
    armStallTimer();
    xhr.send(options.body);
  });
}

function assertParsedText(result: ResumeUploadResult): ResumeUploadResult {
  if (!result.text || result.text.trim().length < 20) {
    throw new FileUploadError('PARSE_EMPTY', 'Could not extract meaningful text from this resume.');
  }
  return result;
}

/* --------------------------------------------------------- direct transport */

async function runDirectUpload(context: TransportContext): Promise<ResumeUploadResult> {
  const formData = new FormData();
  formData.append('file', context.file);

  const headers = await resolveAuthHeaders({ method: 'POST', body: formData });
  if (context.signal.aborted) throw abortError();

  // No pause control: an XHR body cannot be suspended mid-flight, so there is
  // nothing to expose. The card hides the affordance rather than disabling it.
  context.registerPauseControls(null);
  context.onTransferStart();

  const result = await xhrJson<ResumeUploadResult>({
    url: PARSE_RESUME_ENDPOINT,
    body: formData,
    headers,
    signal: context.signal,
    totalBytes: context.file.size,
    onProgress: context.onProgress,
    onUploadComplete: context.onParseStart,
  });

  return assertParsedText(result);
}

/* ------------------------------------------------------ resumable transport */

/**
 * Tell the server the object is dead so it can delete it.
 *
 * storage.rules denies client deletes outright (`allow read, update, delete,
 * list: if false`), so cleanup has to go through the Admin SDK.
 *
 * THERE IS NO BACKSTOP BEHIND THIS CALL. This module used to say a bucket
 * lifecycle rule would sweep up whatever the client failed to abandon. No such
 * rule exists on this project — `firebase.json`'s storage key is
 * `{"rules": "storage.rules"}` and nothing anywhere configures object
 * lifecycle. Creating it is an UNCOMPLETED OWNER ACTION; the command is in
 * `docs/storage-retention-runbook.md`. Until it has been run, this call and the
 * parse route's own cleanup are the ONLY things that remove an abandoned
 * resume, which is why a failure here is now reported rather than swallowed.
 */
export async function abandonStorageUpload(
  storagePath: string,
  /**
   * The bearer captured when the upload started, used only if `resolveAuthHeaders`
   * comes back without one.
   *
   * This is not belt-and-braces. `resolveAuthHeaders` swallows a `getIdToken()`
   * failure and returns headers with no Authorization unless `requireToken` is
   * set (`lib/auth-fetch.ts`), and the single path that routes into this call is
   * the token becoming unreadable AFTER the bucket write. So the one scenario
   * that produces an abandonable object was also the one that sent the abandon
   * unauthenticated, where `abandon/route.ts` 401s it and the resume survives.
   * The beacon is down at the same moment for the same reason, so both cleanup
   * mechanisms failed together. There is no lifecycle rule behind them.
   */
  fallbackBearer?: string | null,
): Promise<boolean> {
  try {
    const headers = await resolveAuthHeaders({ method: 'POST' });
    if (!headers.get('Authorization') && fallbackBearer) {
      headers.set('Authorization', fallbackBearer);
    }
    const response = await fetch(PARSE_RESUME_ABANDON_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ storagePath }),
      keepalive: true,
    });
    if (!response.ok) {
      console.warn('[upload] abandon rejected', { status: response.status });
      return false;
    }
    const payload = (await response.json().catch(() => null)) as { deleted?: boolean } | null;
    // The route answers 202 { deleted: false } when its own delete threw. That
    // is not a success, and nothing downstream was reading it.
    if (payload?.deleted !== true) {
      console.warn('[upload] abandon did not delete the object', { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      '[upload] abandon failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return false;
  }
}

interface UnloadGuard {
  /** The freshest bearer we hold. A beacon with no token cannot authenticate. */
  setToken(token: string | null): void;
  release(): void;
}

/**
 * Cover the one exit a promise cannot reach: the page going away.
 *
 * Between "the bytes are finalised in the bucket" and "the parse route has
 * answered" there is a real resume in Storage — name, employers, dates,
 * sometimes an address. Every other exit from that window reaches cleanup:
 * user cancel, 429, 4xx, client-side PARSE_EMPTY, network failure, the stall
 * watchdog, and the route's own failed-delete case all run either
 * `abandonStorageUpload` or the route's `cleanupStorageUpload`. A tab close or
 * a hard navigation runs no catch, no finally and no unmount effect, so it
 * reached neither, and `keepalive: true` on the abandon fetch was protecting a
 * call nothing made on unload.
 *
 * `pagehide`, not `beforeunload`: beforeunload does not fire reliably on mobile
 * Safari, which is exactly where a backgrounded tab gets discarded outright.
 *
 * `sendBeacon` rather than `fetch(keepalive)` because it is the one dispatch
 * guaranteed to survive a pagehide handler across browsers — and sendBeacon
 * CANNOT SET HEADERS, so the bearer travels in the JSON body instead. The
 * abandon route accepts `idToken` there for this caller alone and verifies it
 * through the same `verifyIdToken` path as an Authorization header; it is the
 * same credential in the only place a beacon can carry one, and a body over
 * HTTPS is a strictly better place for it than the query string, which is the
 * only alternative a beacon offers.
 *
 * One honest gap remains: the token is captured when `resolveAuthHeaders`
 * resolves, so a page closed in the microtask between the bucket finalising and
 * that call returning sends nothing. Nothing can be sent there — there is no
 * credential in hand yet, and a beacon cannot await one.
 */
function guardStorageObjectOnUnload(storagePath: string): UnloadGuard {
  let token: string | null = null;
  let done = false;

  const onPageHide = () => {
    if (done || !token) return;
    done = true;
    try {
      navigator.sendBeacon(
        PARSE_RESUME_ABANDON_ENDPOINT,
        new Blob([JSON.stringify({ storagePath, idToken: token })], {
          type: 'application/json',
        }),
      );
    } catch {
      /* the page is leaving; there is nothing left to try */
    }
  };

  const supported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function';
  if (supported) window.addEventListener('pagehide', onPageHide);

  return {
    setToken(next) {
      token = next;
    },
    release() {
      done = true;
      if (supported) window.removeEventListener('pagehide', onPageHide);
    },
  };
}

/** The bearer `resolveAuthHeaders` produced, for the beacon that cannot set one. */
function bearerFrom(headers: Headers): string | null {
  const value = headers.get('Authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

async function runResumableUpload(context: TransportContext): Promise<ResumeUploadResult> {
  // Checked before anything is created, mirroring runDirectUpload. The abort
  // listener below is registered after `uploadBytesResumable` has already
  // started moving bytes, and a signal that was aborted on entry has already
  // dispatched its event — so without this a cancelled-before-it-started
  // request would push the whole file to the bucket before the check further
  // down noticed.
  if (context.signal.aborted) throw abortError();

  const user = auth.currentUser;
  if (!user) {
    throw new FileUploadError(
      'AUTH_REQUIRED',
      'Sign in to upload resumes larger than 4MB, or use a smaller PDF/Word file.',
    );
  }

  const file = context.file;
  const storagePath = `resume_uploads/${user.uid}/${Date.now()}_${safeStorageFileName(file.name)}`;
  const task: UploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
    contentType: resolveStorageContentType(file.name),
    customMetadata: {
      originalName: file.name,
      uploadedBy: user.uid,
      purpose: 'resume_parse',
    },
  });

  let storageObjectExists = false;
  let unloadGuard: UnloadGuard | null = null;

  const cancelTask = () => {
    // UploadTask.cancel() is a documented no-op while the task is paused
    // (@firebase/storage index.cjs.js). Resuming first is what actually makes
    // the cancel land; without it a paused upload silently keeps its slot.
    try {
      task.resume();
    } catch {
      /* already running, or already finished */
    }
    try {
      task.cancel();
    } catch {
      /* already settled */
    }
  };

  const onAbort = () => cancelTask();
  context.signal.addEventListener('abort', onAbort);

  context.registerPauseControls({
    pause: () => {
      try {
        task.pause();
      } catch {
        /* already settled */
      }
    },
    resume: () => {
      try {
        task.resume();
      } catch {
        /* already settled */
      }
    },
  });
  context.onTransferStart();

  // Capture a bearer WHILE the token still resolves, before a byte moves.
  //
  // The cleanup paths below all run at a moment when `getIdToken()` may have
  // started failing — that is precisely what routes into them — so asking for a
  // token there is asking at the one time it cannot be had. `abandon/route.ts`
  // requires a verified uid, so an unauthenticated abandon is a 401 and the
  // resume stays in the bucket. Best-effort: a failure here is not fatal,
  // because the token still working is the common case and the parse call does
  // its own `requireToken` check.
  let cleanupBearer: string | null = null;
  try {
    cleanupBearer = bearerFrom(await resolveAuthHeaders({ method: 'POST' }));
  } catch {
    /* No token now means no token later; the parse call reports it properly. */
  }

  try {
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          // `_addObserver` notifies on subscribe, one microtask later — it
          // routes through `_notifyObserver`, which wraps every callback in
          // `async()`, which is `Promise.resolve().then(...)`. The TIMING is
          // not what makes this guard necessary; the VALUE is. For a task this
          // new the priming snapshot is `bytesTransferred: 0` with a full
          // `totalBytes`. Passing it through flips the state from honestly
          // indeterminate to `measured: true, percent: 0` on an event that
          // carries no measurement — on a slow link the card would then draw a
          // determinate bar reading "Uploading · 0% · 0 B of 6.0 MB" before a
          // single byte had left the machine. A confirmed byte is the signal.
          if (snapshot.totalBytes > 0 && snapshot.bytesTransferred > 0) {
            context.onProgress(snapshot.bytesTransferred, snapshot.totalBytes);
          }
        },
        (error: unknown) => {
          const code = (error as { code?: string })?.code ?? '';
          if (code === 'storage/canceled') {
            reject(abortError());
            return;
          }
          if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
            reject(new FileUploadError('AUTH_REQUIRED', 'Sign in again to upload this resume.'));
            return;
          }
          reject(new FileUploadError('NETWORK', 'The upload could not reach storage.'));
        },
        () => {
          storageObjectExists = true;
          resolve();
        },
      );
    });

    // From here until the parse settles there is a real resume in the bucket
    // and no promise-shaped exit covers a tab close. See guardStorageObjectOnUnload.
    unloadGuard = guardStorageObjectOnUnload(storagePath);
    // Arm the beacon with the pre-upload bearer immediately. Waiting for the
    // parse call's token left the beacon unauthenticated for the whole window
    // in which the token failing is what puts us here.
    unloadGuard.setToken(cleanupBearer);

    context.onParseStart();
    if (context.signal.aborted) throw abortError();

    // requireToken: a signed-in user whose getIdToken() fails must NOT fall
    // through to an anonymous request. The route would resolve `anon:<ip>`,
    // fail to match this object's uid prefix, answer 401 and delete nothing —
    // the exact orphan this path exists to prevent. Failing here instead sends
    // the user to AUTH_REQUIRED with the object abandoned by the catch below.
    let headers: Headers;
    try {
      headers = await resolveAuthHeaders({ method: 'POST', requireToken: true });
    } catch (error) {
      if (error instanceof AuthTokenUnavailableError) {
        throw new FileUploadError('AUTH_REQUIRED', 'Sign in again to finish this upload.');
      }
      throw error;
    }
    // Refresh with the newer bearer now that the parse call resolved one.
    unloadGuard.setToken(bearerFrom(headers) ?? cleanupBearer);
    const result = await xhrJson<ResumeUploadResult>({
      url: PARSE_RESUME_ENDPOINT,
      body: JSON.stringify({ storagePath, fileName: file.name }),
      headers,
      signal: context.signal,
      totalBytes: null,
    });

    // The route deletes the object as part of a successful parse; only chase
    // it ourselves when it says it did not — which happens when its own
    // cleanup swallowed a delete error and still answered 200.
    //
    // Detecting that and then returning was the whole bug: the flag is read
    // only by the catch below, which does not run on this path, so the one
    // case the assignment exists for was found and silently discarded, leaving
    // a real resume in the bucket with nothing scheduled to remove it.
    //
    // assertParsedText runs BEFORE the chase, so a PARSE_EMPTY throw still
    // routes through the catch and the object is abandoned exactly once.
    //
    // `storagePath` is deliberately NOT merged into the result. The route never
    // sends one back, and putting ours in handed callers a path to an object
    // that had just been deleted — on the success path the route's own cleanup
    // removes it and answers `storagePathDeleted: true`, so the path is dead by
    // construction. app/suite/resume/page.tsx persists that field into a
    // `resume_versions` document which firestore.rules makes immutable once a
    // guardrail_report is attached, so it was writing a permanent provenance
    // record pointing at nothing — and carrying the user's original filename
    // (via safeStorageFileName) into it. Callers that need to know whether the
    // object survived read `storagePathDeleted`, which the route does send.
    storageObjectExists = result.storagePathDeleted !== true;
    const parsed = assertParsedText(result);
    if (storageObjectExists) {
      storageObjectExists = false;
      void abandonStorageUpload(storagePath, cleanupBearer);
    }
    return parsed;
  } catch (error) {
    if (storageObjectExists) {
      storageObjectExists = false;
      void abandonStorageUpload(storagePath, cleanupBearer);
    }
    throw error;
  } finally {
    unloadGuard?.release();
    context.signal.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------ the transports */

/**
 * Whether a pause control would do anything for this file.
 *
 * Three conditions, all of them real:
 *   1. Only Firebase Storage can pause, and it is only used above 4MB.
 *   2. storage.rules requires an authenticated user, so anonymous never can.
 *   3. uploadBytesResumable degrades to a single-shot PUT at or below 256KB.
 *
 * (3) cannot co-occur with (1) today, but it is checked rather than assumed:
 * the day the 4MB threshold moves, the pause button must not start lying.
 *
 * `<=`, not `<`, because the SDK's own test is `blob.size() > 256 * 1024`
 * (@firebase/storage `_shouldDoResumable`). A file of exactly 262144 bytes
 * takes the one-shot PUT and cannot pause — a `<` here would advertise a pause
 * control for it, at the one boundary this check exists to get right.
 */
export function resumeUploadCanPause(file: File): boolean {
  if (file.size <= DIRECT_UPLOAD_MAX_BYTES) return false;
  if (file.size <= RESUMABLE_PAUSE_MIN_BYTES) return false;
  return Boolean(auth.currentUser);
}

/**
 * What this transport will really accept from whoever is holding the browser.
 *
 * The 4MB step is a capability boundary, not a policy one: everything above it
 * goes through Firebase Storage, and `storage.rules` is `request.auth != null`.
 *
 * Keyed on `auth.currentUser` alone, deliberately — NOT on the wider
 * `isAnonymous` predicate the parse-deadline note uses. Demo mode has a null
 * currentUser but sends a bearer the route resolves to a real uid, so the
 * server treats it as signed in; Storage does not, because there is no Firebase
 * credential behind it. 4MB is genuinely demo mode's ceiling too, and this is
 * the number the transport can honour rather than the number the route would.
 */
export function resumeUploadLimits(): UploadLimits {
  return {
    maxBytes: AUTHENTICATED_MAX_BYTES,
    authRequiredAboveBytes: auth.currentUser ? null : DIRECT_UPLOAD_MAX_BYTES,
  };
}

export const resumeUploadTransport: UploadTransport<ResumeUploadResult> = {
  id: 'resume-upload',
  accept: RESUME_ACCEPT,
  maxBytes: AUTHENTICATED_MAX_BYTES,
  limits: resumeUploadLimits,
  canPause: resumeUploadCanPause,
  parseNote(file, isAnonymous) {
    // Only the binary branch of the route runs in the worker. A `.txt` takes
    // `detectedType === 'txt'` and returns with no worker and no deadline at
    // all — so a large one on the storage path can genuinely sit past the 5s
    // mark and be told "Reading stops after 8 seconds", which nothing in the
    // request will enforce.
    if (file.name.toLowerCase().endsWith('.txt')) return null;
    return parseDeadlineNote(isAnonymous);
  },
  run(context) {
    return context.file.size <= DIRECT_UPLOAD_MAX_BYTES
      ? runDirectUpload(context)
      : runResumableUpload(context);
  },
};

export interface LocalTextExtractionResult {
  text: string;
  fileName: string;
}

/**
 * Writing tools never touch the network — mammoth runs in the browser.
 *
 * There is no transfer to measure, so this transport goes straight to the
 * unmeasurable phase: `queued` to `parsing`, with no `transfer-start` in
 * between. It never emits a progress event, and therefore never shows a
 * percentage.
 */
export const localTextExtractionTransport: UploadTransport<LocalTextExtractionResult> = {
  id: 'local-text-extraction',
  accept: DOCUMENT_TEXT_ACCEPT,
  maxBytes: AUTHENTICATED_MAX_BYTES,
  canPause: () => false,
  // No limits() and no parseNote(): nothing here needs an account, and nothing
  // enforces a deadline on work that happens in the browser. Both absences are
  // the honest answer, not an omission.
  async run(context) {
    context.registerPauseControls(null);
    // No onTransferStart(): nothing is transferred. Firing it drove the state
    // machine queued -> transferring -> parsing in one commit, and the live
    // region's sole utterance for the whole operation became "Upload complete.
    // Reading cover-letter.docx." for a file that never left the machine. The
    // visible status line was truthful; only the announcement lied, so it
    // reached screen-reader users and nobody else. queued -> parsing is what
    // actually happens.
    context.onParseStart();

    const file = context.file;
    const lower = file.name.toLowerCase();

    try {
      if (lower.endsWith('.txt')) {
        const text = await file.text();
        if (context.signal.aborted) throw abortError();
        if (!text.trim()) {
          throw new FileUploadError('PARSE_EMPTY', 'That file had no readable text in it.');
        }
        return { text, fileName: file.name };
      }

      const arrayBuffer = await file.arrayBuffer();
      if (context.signal.aborted) throw abortError();
      // mammoth is a CJS `export =` module and bundlers disagree about whether
      // the namespace or its `default` carries the API. Loaded dynamically so
      // it stays out of the bundle for the four surfaces that never call it.
      const loaded = await import('mammoth');
      const mammoth =
        'extractRawText' in loaded ? loaded : (loaded as { default: typeof loaded }).default;
      const extracted = await mammoth.extractRawText({ arrayBuffer });
      if (context.signal.aborted) throw abortError();
      if (!extracted.value.trim()) {
        throw new FileUploadError('PARSE_EMPTY', 'That document had no readable text in it.');
      }
      return { text: extracted.value, fileName: file.name };
    } catch (error) {
      if (error instanceof FileUploadError) throw error;
      if (isAbort(error)) throw abortError();
      throw new FileUploadError('PARSE_FAILED', 'That document could not be read in the browser.');
    }
  },
};

/* -------------------------------------------------------- imperative handle */

export interface StartResumeUploadOptions {
  onPhase?(phase: 'transferring' | 'parsing'): void;
  onProgress?(bytesTransferred: number, totalBytes: number): void;
  signal?: AbortSignal;
}

export interface ResumeUploadHandle {
  promise: Promise<ResumeUploadResult>;
  canPause: boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
}

/**
 * An imperative handle hands out a promise nobody is *obliged* to await — the
 * documented use is to take the handle, cancel it and walk away. Cancelling
 * rejects the promise, so without a sink attached at construction that is an
 * `unhandledrejection` on every cancel, and a second one on every rejected
 * accept check.
 *
 * Attaching a `.catch` marks the original promise handled; the original is
 * still what gets returned, so a caller that does await it sees the real
 * rejection.
 */
function sink<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {
    /* the caller may legitimately never look at this */
  });
  return promise;
}

/**
 * Imperative entry point for callers that are not using the hook.
 *
 * The hook is the normal path; this exists so `uploadAndParseResume` keeps its
 * old signature and so a non-React caller can still get real bytes.
 */
export function startResumeUpload(
  file: File,
  options: StartResumeUploadOptions = {},
): ResumeUploadHandle {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let controls: PauseControls | null = null;

  const limits = resumeUploadLimits();
  const check = checkFileAgainstAccept(
    file,
    RESUME_ACCEPT,
    limits.maxBytes,
    limits.authRequiredAboveBytes,
  );
  if (!check.ok) {
    return {
      promise: sink(Promise.reject(new FileUploadError(check.code, check.message))),
      canPause: false,
      pause() {},
      resume() {},
      cancel() {},
    };
  }

  const promise = sink(
    resumeUploadTransport.run({
      file,
      signal: controller.signal,
      onTransferStart: () => options.onPhase?.('transferring'),
      onProgress: (bytesTransferred, totalBytes) =>
        options.onProgress?.(bytesTransferred, totalBytes),
      onParseStart: () => options.onPhase?.('parsing'),
      registerPauseControls: (next) => {
        controls = next;
      },
    }),
  );

  return {
    promise,
    canPause: resumeUploadTransport.canPause(file),
    pause: () => controls?.pause(),
    resume: () => controls?.resume(),
    cancel: () => controller.abort(),
  };
}
