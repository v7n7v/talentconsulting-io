'use client';

/**
 * UploadTrigger — a button-only affordance for surfaces with no room for a
 * dropzone: the chat composer, a toolbar, a header action.
 *
 * It still carries the drag handlers. Three of the five upload surfaces were
 * click-only, which is why dropping a resume on the chat composer silently
 * did nothing — the file opened in the browser tab instead, taking the user
 * out of the product. A button is a small drop target, but it is not zero.
 *
 * The card is not rendered here. Surfaces using the trigger place it wherever
 * their layout allows, usually a row below the composer.
 *
 * One controller, one trigger: this mounts `inputProps` and `triggerProps`, so
 * a surface that also mounts a `FileDropzone` from the same controller has two
 * elements competing for one ref. The hook logs that in development rather than
 * leaving `openPicker()` pointed at a detached node — but the fix is a second
 * `useFileUpload()`, not a second mount.
 */

import type { FileUploadController } from '@/lib/upload/useFileUpload';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export interface UploadTriggerProps {
  controller: FileUploadController;
  label?: string;
  icon?: string;
  /** Icon-only: the label still ships as the accessible name. */
  iconOnly?: boolean;
  className?: string;
}

export default function UploadTrigger({
  controller,
  label = 'Attach a resume',
  icon = 'attach_file',
  iconOnly = false,
  className,
}: UploadTriggerProps) {
  const { inputProps, dropzoneProps, triggerProps, isDragActive } = controller;

  return (
    <>
      <input {...inputProps} />
      <button
        {...triggerProps}
        {...dropzoneProps}
        className={cx(
          'upload-trigger',
          iconOnly && 'upload-trigger--icon',
          isDragActive && 'upload-trigger--dragover',
          className,
        )}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          {icon}
        </span>
        {!iconOnly && label}
      </button>
    </>
  );
}
