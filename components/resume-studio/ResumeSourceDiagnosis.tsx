'use client';

import { deriveSourceDiagnosis, type ResumeData } from '@/lib/resume-source-diagnosis';

export interface ResumeSourceDiagnosisProps {
  resume: ResumeData | null;
  rawText?: string;
  warnings?: string[];
  fileName?: string;
  error?: string | null;
  isProcessing?: boolean;
  onReplace?: () => void;
  onPaste?: () => void;
}

export function ResumeSourceDiagnosis({ resume, rawText, warnings, fileName, error, isProcessing, onReplace, onPaste }: ResumeSourceDiagnosisProps) {
  const diagnosis = deriveSourceDiagnosis({ resume, rawText, warnings, error, isProcessing });
  const tone = diagnosis.status === 'failed' ? 'var(--danger)' : diagnosis.status === 'parsed' ? 'var(--success)' : 'var(--accent)';

  return (
    <section aria-labelledby="resume-source-diagnosis-title" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Upload &amp; diagnose</p>
          <h2 id="resume-source-diagnosis-title" className="mt-1 text-lg font-semibold">Source check</h2>
          {fileName && <p className="mt-1 text-sm text-[var(--text-secondary)]">{fileName}</p>}
        </div>
        <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold" style={{ color: tone }}>
          {diagnosis.statusLabel}
        </span>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 rounded-xl bg-[var(--bg-elevated)] p-4">
        <p className="text-sm font-medium">{diagnosis.message}</p>
        {diagnosis.status === 'failed' && error && <p className="mt-1 text-sm text-[var(--text-secondary)]">{error}</p>}
        {diagnosis.status === 'failed' && !diagnosis.hasReadableText && <p className="mt-1 text-sm text-[var(--text-secondary)]">If this is a scanned image, paste a text version or use a text-readable file.</p>}
      </div>

      {diagnosis.status === 'parsed' && <div className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Parsed content counts">
        <span className="rounded-lg border border-[var(--border-subtle)] px-3 py-2">{diagnosis.roleCount} {diagnosis.roleCount === 1 ? 'role' : 'roles'}</span>
        <span className="rounded-lg border border-[var(--border-subtle)] px-3 py-2">{diagnosis.skillCount} {diagnosis.skillCount === 1 ? 'skill' : 'skills'}</span>
      </div>}

      {diagnosis.missing.length > 0 && <p className="mt-4 text-sm text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">Worth checking:</strong> Missing {diagnosis.missing.join(', ')}.</p>}
      {diagnosis.warnings.length > 0 && <div className="mt-4" aria-label="Parser warnings">
        <p className="text-sm font-semibold">Warnings from the parser</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">{diagnosis.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
      </div>}

      {(onReplace || onPaste) && <div className="mt-4 flex flex-wrap gap-2">
        {onReplace && <button type="button" onClick={onReplace} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Replace file</button>}
        {onPaste && <button type="button" onClick={onPaste} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Paste resume text</button>}
      </div>}

      {rawText !== undefined && <details className="mt-5 border-t border-[var(--border-subtle)] pt-4">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">Original text disclosed from source</summary>
        <p className="mt-2 text-xs text-[var(--text-muted)]">This is the readable text extracted from your source.</p>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">{rawText || 'No readable text was extracted.'}</pre>
      </details>}
    </section>
  );
}

export default ResumeSourceDiagnosis;
