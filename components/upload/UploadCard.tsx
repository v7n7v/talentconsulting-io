'use client';

/**
 * UploadCard — a browser-download-style card for one file.
 *
 * Two phases, two different claims, and the card never blurs them:
 *
 *   Transfer  measurable   → determinate bar, "Uploading · 65% · 1.4 MB of 2.3 MB"
 *   Parse     unmeasurable → traversing segment, no number at all
 *
 * The number is removed during the parse rather than pinned at 0 or 100,
 * because the worker emits no increments and any figure would be invented.
 * The bar is removed entirely on success, error and cancel for the same
 * reason: an error is not 0%, and a cancel is not 0% either.
 *
 * HOST RESPONSIBILITY — the card does not frame itself. A default-density card
 * belongs inside a `SuitePanel` (components/suite/SuiteToolChrome.tsx), which
 * owns the panel surface, padding and heading; the card is the row inside it.
 * `density='inline'` is the one sanctioned unpanelled case, for a chat composer
 * or toolbar where a panel would be wrong. Nothing enforces this — the design
 * audit counts suite routes missing SuiteToolShell, not cards missing a panel —
 * so it has to be checked when a surface adopts the card.
 */

import {
  Fragment,
  useRef,
  useId,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  WORD_DOCUMENT_ACCEPT,
  formatByteRange,
  formatBytes,
  progressValueText,
  uploadStatusIcon,
  type UploadRecoveryAction,
} from '@/lib/upload/file-upload-types';
import type { FileUploadController } from '@/lib/upload/useFileUpload';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const GLYPHS: ReadonlyArray<readonly [string, string]> = [
  ['.pdf', 'picture_as_pdf'],
  ['.docx', 'description'],
  ['.doc', 'description'],
  ['.txt', 'article'],
];

function glyphFor(fileName: string | null): string {
  const lower = (fileName ?? '').toLowerCase();
  for (const [ext, glyph] of GLYPHS) {
    if (lower.endsWith(ext)) return glyph;
  }
  return 'draft';
}

/**
 * Every recovery action is something the user can click, so this is the whole
 * union. It stays as a named alias because `FileDropzone` and every host that
 * implements `onRecovery` refers to it, and because a future card-served action
 * would narrow here rather than at each call site.
 */
export type UploadCardRecoveryAction = UploadRecoveryAction;

export interface UploadCardProps {
  controller: FileUploadController;
  density?: 'default' | 'inline';
  className?: string;
  /**
   * Required, not optional, and that is the point.
   *
   * The card serves 'retry', 'choose-another' and 'choose-word' itself. It
   * cannot serve 'sign-in' or 'paste' — those need a modal and a text box the
   * host owns. When this prop was optional, a host that omitted it silently
   * lost the ONLY option AUTH_REQUIRED offers, which is the single most
   * valuable recovery path in the whole flow: sign in, then auto-retry the
   * same in-memory File. No warning, no fallback, no type error — and every
   * migration could drop it by accident.
   *
   * So the type asks the question instead. A host must decide what happens.
   */
  onRecovery(action: UploadCardRecoveryAction): void;
}

export default function UploadCard({
  controller,
  density = 'default',
  className,
  onRecovery,
}: UploadCardProps) {
  const { state, statusLine, parseNote, announcement, recovery } = controller;
  const nameId = useId();
  const noteId = useId();

  // The card's own pickers, with their own refs.
  //
  // It cannot reuse controller.inputProps: FileDropzone already mounts that
  // input, and a second element sharing the ref would leave inputRef pointing
  // at whichever unmounted last. It also cannot reuse controller.openPicker()
  // for "Upload a Word version" — that picker's accept still highlights .pdf,
  // so the button offered *because* the last PDF was image-only would happily
  // hand back another scanned PDF and reproduce the identical error.
  const anyFileRef = useRef<HTMLInputElement | null>(null);
  const wordFileRef = useRef<HTMLInputElement | null>(null);

  if (state.phase === 'idle' || !state.fileName) return null;

  const determinate = state.barVisible && !state.indeterminate && state.percent !== null;
  const indeterminate = state.barVisible && state.indeterminate;

  // The note is wired to the bar through aria-describedby, so it has to be true
  // of the step it is describing.
  //
  // "No progress available for this step." is true and permanent during the
  // parse: the worker emits no increments and never will. During a transfer it
  // was a capability claim the card retracted moments later — progress IS
  // available there, it simply has not arrived yet, and the first byte event
  // replaces the sentence with a percentage. That window is the normal opening
  // of every resumable upload (the priming snapshot is deliberately dropped)
  // and of any XHR upload whose handshake outlasts 250ms, so a screen-reader
  // user was told the transfer reports nothing and then heard percentages.
  const indeterminateNote =
    state.phase === 'parsing'
      ? 'No progress available for this step.'
      : 'Starting the transfer.';
  const byteRange = formatByteRange(state.bytesTransferred, state.totalBytes);
  const totalSize = formatBytes(state.totalBytes);

  const statusToneClass =
    state.phase === 'error'
      ? 'upload-status--error'
      : state.phase === 'cancelled'
        ? 'upload-status--muted'
        : state.phase === 'done'
          ? 'upload-status--success'
          : undefined;
  const statusIcon = uploadStatusIcon(state.phase);

  // What the meta row says, in order. Each entry is something that was
  // actually observed — there is no slot here that has to be filled.
  const metaParts: Array<{ key: string; node: ReactNode }> = [];
  if (statusLine) {
    metaParts.push({
      key: 'status',
      node: (
        <span className={cx('upload-status', statusToneClass)}>
          {statusIcon && (
            <span className="upload-status__icon material-symbols-rounded" aria-hidden="true">
              {statusIcon}
            </span>
          )}
          <span className="min-w-0">{statusLine}</span>
        </span>
      ),
    });
  }
  if (determinate && state.percent !== null) {
    metaParts.push({
      key: 'percent',
      node: <span className="upload-percent">{state.percent}%</span>,
    });
  }
  if ((state.phase === 'transferring' || state.phase === 'paused') && determinate && byteRange) {
    metaParts.push({ key: 'bytes', node: <span className="upload-bytes">{byteRange}</span> });
  } else if (state.phase === 'cancelled' && byteRange) {
    // Cancelled reports what genuinely moved, not a zero. No " transferred"
    // suffix: the byte pair is `white-space: nowrap` by design, and the longer
    // string measured 156px against a 160px text column at 320px — surviving on
    // 4px, which is luck rather than a layout. "Upload cancelled · 1.1 MB of
    // 2.3 MB" says the same thing with room to spare.
    metaParts.push({
      key: 'bytes',
      node: <span className="upload-bytes upload-status--muted">{byteRange}</span>,
    });
  } else if (totalSize && state.phase !== 'error') {
    metaParts.push({ key: 'size', node: <span className="upload-bytes">{totalSize}</span> });
  }

  // Every option becomes a button. Nothing is filtered away — dropping an
  // option silently is how the sign-in path disappeared, and the one member
  // that used to be filtered (`wait`) is gone from the union entirely, because
  // waiting was never something a user could click. The real Retry-After is a
  // note, rendered below from state.error.retryAfterSeconds.
  const recoveryButtons = recovery;
  const offersAnotherFile = recoveryButtons.some((option) => option.action === 'choose-another');
  const offersWord = recoveryButtons.some((option) => option.action === 'choose-word');

  const pick = (ref: RefObject<HTMLInputElement | null>) => {
    // Reset first so re-picking the same file still fires onChange.
    if (ref.current) ref.current.value = '';
    ref.current?.click();
  };

  const handlePicked = (event: ChangeEvent<HTMLInputElement>) => {
    controller.selectFile(event.target.files?.[0]);
  };

  const handleRecovery = (action: UploadCardRecoveryAction) => {
    if (action === 'retry') {
      controller.retry();
      return;
    }
    if (action === 'choose-another') {
      pick(anyFileRef);
      return;
    }
    if (action === 'choose-word') {
      pick(wordFileRef);
      return;
    }
    onRecovery(action);
  };

  const retryAfter = state.error?.retryAfterSeconds ?? null;

  return (
    <div
      // containerProps makes the card itself a focus target of last resort.
      // The card mounts no trigger of its own and its docstring sanctions
      // hosting it inside a SuitePanel, so a host that never spreads
      // triggerProps had cancel(), reset() and retry() all dropping focus to
      // <body>. tabIndex is -1: programmatic focus only, never a tab stop.
      {...controller.containerProps}
      className={cx(
        'upload-card',
        density === 'inline' && 'upload-card--inline',
        state.phase === 'error' && 'upload-card--error',
        state.phase === 'cancelled' && 'upload-card--cancelled',
        className,
      )}
    >
      <span className="upload-glyph" aria-hidden="true">
        <span className="material-symbols-rounded">{glyphFor(state.fileName)}</span>
      </span>

      <div className="upload-body">
        <p className="upload-name" id={nameId} title={state.fileName}>
          {state.fileName}
        </p>
        {metaParts.length > 0 && (
          <p className="upload-meta">
            {metaParts.map((part, index) => (
              <Fragment key={part.key}>
                {index > 0 && (
                  <span className="upload-meta__sep" aria-hidden="true">
                    ·
                  </span>
                )}
                {part.node}
              </Fragment>
            ))}
          </p>
        )}
        {indeterminate && (
          <p className="upload-note" id={noteId}>
            {indeterminateNote}
          </p>
        )}
        {parseNote && <p className="upload-note">{parseNote}</p>}
        {retryAfter !== null && (
          <p className="upload-note">Try again in about {retryAfter} seconds.</p>
        )}
      </div>

      <div className="upload-actions">
        {/* Pause is hidden, never disabled, when the transport cannot pause —
            anonymous uploads and everything under 4MB. A greyed-out control
            would advertise a capability that does not exist.

            ONE button, not two. Rendered as separate positional children the
            pause and resume controls were child[0] and child[1] of this row,
            and `pause` sets canPause:false/canResume:true — so React unmounted
            the button under the user's finger and mounted a different one in
            its place. A keyboard user who pressed Pause landed on <body>
            mid-upload, and again on Resume. Flipping the label, icon and
            handler on one element keeps the same DOM node, so focus never
            moves and nothing has to be restored. */}
        {(state.canPause || state.canResume) && (
          <button
            type="button"
            className="upload-action"
            onClick={state.canResume ? controller.resume : controller.pause}
            aria-label={
              state.canResume
                ? `Resume upload of ${state.fileName}`
                : `Pause upload of ${state.fileName}`
            }
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {state.canResume ? 'play_arrow' : 'pause'}
            </span>
          </button>
        )}
        {state.canCancel && (
          <button
            type="button"
            className="upload-action"
            onClick={controller.cancel}
            aria-label={`Cancel upload of ${state.fileName}`}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        )}
        {/* "Dismiss", not "Remove". reset() clears the card and nothing else —
            after a success the host is already holding the parsed text, and the
            card cannot reach it. Hosts that want a true removal subscribe to
            `onReset` on the hook and undo their own ingest there; the label
            stays honest for the ones that cannot. */}
        {!state.canCancel && (
          <button
            type="button"
            className="upload-action"
            onClick={controller.reset}
            aria-label={`Dismiss ${state.fileName}`}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        )}
      </div>

      {determinate && state.percent !== null && (
        <div
          className={cx('upload-bar', state.phase === 'paused' && 'upload-bar--paused')}
          role="progressbar"
          aria-labelledby={nameId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.percent}
          aria-valuetext={progressValueText(state) ?? undefined}
        >
          <span className="upload-bar__fill" style={{ width: `${state.percent}%` }} />
        </div>
      )}

      {indeterminate && (
        /* An absent value is the ARIA signal for indeterminate. aria-valuenow={0}
           would be announced as "0 percent" — the same lie the bar itself is
           avoiding — so valuenow/valuemin/valuemax are omitted entirely. */
        <div
          className="upload-bar upload-bar--indeterminate"
          role="progressbar"
          aria-labelledby={nameId}
          aria-describedby={noteId}
        >
          <span className="upload-bar__fill" />
        </div>
      )}

      {recoveryButtons.length > 0 && (
        <div className="upload-recovery">
          {/* Both inputs are visually hidden with clip/clip-path, which keeps
              them in the accessibility tree deliberately — so both need a
              name. tabIndex={-1} takes them out of the tab order, not out of a
              virtual cursor's reach, and they can be present at the same time
              (PARSE_EMPTY offers choose-another, SCANNED_PDF offers
              choose-word), so "file input" twice was not distinguishable. */}
          {offersAnotherFile && (
            <input
              ref={anyFileRef}
              type="file"
              accept={controller.accept.attr}
              className="upload-input-hidden"
              tabIndex={-1}
              aria-label="Choose another file"
              onChange={handlePicked}
            />
          )}
          {offersWord && (
            <input
              ref={wordFileRef}
              type="file"
              accept={WORD_DOCUMENT_ACCEPT.attr}
              className="upload-input-hidden"
              tabIndex={-1}
              aria-label="Choose a Word document"
              onChange={handlePicked}
            />
          )}
          {recoveryButtons.map((option, index) => (
            <button
              key={option.action}
              type="button"
              className={cx('upload-trigger', index === 0 && 'upload-trigger--accent')}
              onClick={() => handleRecovery(option.action)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* The live region. Phase transitions and gated milestones only — the
          visible percentage above is deliberately outside it, because routing
          a real progress number through aria-live is unusable. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
