'use client';

/**
 * FileDropzone — the idle surface, the drop target, and the card in one place.
 *
 * The whole surface is a drop target and the visible affordance is a real
 * <button>, so keyboard parity comes for free rather than from a hand-rolled
 * onKeyDown that handles Enter and forgets Space.
 *
 * The card persists after success. All four of the old variants unmounted the
 * dropzone the moment an upload finished, which dropped focus to <body> and
 * left the user with no evidence of what had just been read.
 */

import UploadCard, { type UploadCardRecoveryAction } from '@/components/upload/UploadCard';
import { uploadLimitHint } from '@/lib/upload/file-upload-types';
import type { FileUploadController } from '@/lib/upload/useFileUpload';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export interface FileDropzoneProps {
  controller: FileUploadController;
  title?: string;
  hint?: string;
  icon?: string;
  /** A genuine spatial axis: how much room the surface has. Not a variant. */
  density?: 'default' | 'inline';
  className?: string;
  /** Label on the button that replaces the dropzone once a card is showing. */
  replaceLabel?: string;
  /** Required for the same reason it is on UploadCard — see UploadCardProps. */
  onRecovery(action: UploadCardRecoveryAction): void;
}

export default function FileDropzone({
  controller,
  title = 'Drop your resume, or choose a file',
  hint,
  icon = 'upload_file',
  density = 'default',
  className,
  replaceLabel = 'Choose a different file',
  onRecovery,
}: FileDropzoneProps) {
  const { state, accept, limits, inputProps, dropzoneProps, triggerProps, isDragActive } = controller;
  const showDropzone = state.phase === 'idle';
  // Built from the transport's own ceilings, not from a single number. The
  // resume transport's maxBytes is the AUTHENTICATED limit, so a signed-out
  // visitor used to read "up to 10MB" here, pass the client check with a 6MB
  // file, and then be refused by the transport with a different number. The
  // hint now says "up to 4MB. Sign in for up to 10MB." until they do.
  const resolvedHint = hint ?? uploadLimitHint(accept, limits);

  return (
    <div className={cx('min-w-0', className)} {...dropzoneProps}>
      <input {...inputProps} />

      {showDropzone ? (
        <button
          {...triggerProps}
          className={cx(
            'upload-dropzone',
            density === 'inline' && 'upload-dropzone--inline',
            isDragActive && 'upload-dropzone--dragover',
          )}
        >
          <span className="upload-dropzone__icon material-symbols-rounded" aria-hidden="true">
            {icon}
          </span>
          <span className="upload-dropzone__title">{title}</span>
          <span className="upload-dropzone__hint">{resolvedHint}</span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <UploadCard controller={controller} density={density} onRecovery={onRecovery} />
          {/* Always mounted while a card is showing, so cancel() and reset()
              have somewhere real to put focus. */}
          <div className="flex min-w-0">
            <button {...triggerProps} className={cx('upload-trigger', isDragActive && 'upload-trigger--dragover')}>
              <span className="material-symbols-rounded" aria-hidden="true">
                {icon}
              </span>
              {replaceLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
