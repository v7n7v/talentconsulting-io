'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { showToast } from '@/components/Toast';
import AssistantThinkingTile from '@/components/assistant/AssistantThinkingTile';
import { RESUME_UPLOAD_LIMITS, ResumeUploadError, uploadAndParseResume, validateResumeFile } from '@/lib/resume-upload';

const BENEFITS = [
  { icon: 'auto_awesome', text: 'Optimizes your resume for the role', color: '#f59e0b' },
  { icon: 'trending_up', text: 'Surfaces ATS and keyword fit', color: '#10b981' },
  { icon: 'psychology', text: 'Keeps your voice while improving clarity', color: '#06b6d4' },
  { icon: 'download', text: 'Exports clean PDF and Word files', color: '#a855f7' },
];

const INTAKE_STEPS = [
  { icon: 'document_scanner', label: 'Extract', detail: 'PDF, Word, or TXT' },
  { icon: 'account_tree', label: 'Structure', detail: 'Roles, skills, proof' },
  { icon: 'my_location', label: 'Target', detail: 'Match to the JD' },
];

const FILE_RULES = [
  { icon: 'description', label: 'Text-based files', detail: 'PDF, DOCX, DOC, TXT' },
  { icon: 'cloud_upload', label: 'Large resumes', detail: `Signed-in uploads up to ${RESUME_UPLOAD_LIMITS.authenticatedBytes / 1024 / 1024}MB` },
  { icon: 'visibility_off', label: 'Scanned PDFs', detail: 'OCR fallback coming soon' },
];

function BenefitTicker({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => setIdx(i => (i + 1) % BENEFITS.length), 2500);
    return () => clearInterval(t);
  }, [reduceMotion]);
  const b = BENEFITS[idx];
  if (reduceMotion) {
    return (
      <div className="h-7 flex items-center justify-center overflow-hidden">
        <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: b.color }}>
          <span className="material-symbols-rounded text-[14px]">{b.icon}</span>
          {b.text}
        </div>
      </div>
    );
  }
  return (
    <div className="h-7 flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: b.color }}
        >
          <span className="material-symbols-rounded text-[14px]">{b.icon}</span>
          {b.text}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface FileUploadDropzoneProps {
  onUploadSuccess: (text: string, fileName: string, meta?: { sourceType?: 'direct' | 'storage' | 'paste'; storagePath?: string; characterCount?: number; detectedType?: string; storagePathDeleted?: boolean }) => void;
  isUploading: boolean;
  setIsUploading: (state: boolean) => void;
  variant?: 'large' | 'compact' | 'studio' | 'arrival';
  processingStage?: 'uploading' | 'extracting' | 'parsing' | null;
  showPasteFallback?: boolean;
  onPasteText?: (text: string) => void;
  uploadContext?: 'studio' | 'onboarding' | 'compact';
  // Props for compact variant (textarea)
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string; // Additional classes for the container
}

export default function FileUploadDropzone({
  onUploadSuccess,
  isUploading,
  setIsUploading,
  variant = 'large',
  processingStage = null,
  value = '',
  onChange = () => {},
  placeholder = 'Paste your text or drop a file...',
  rows = 4,
  className = '',
  showPasteFallback = false,
  onPasteText,
  uploadContext = 'studio',
}: FileUploadDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    try {
      validateResumeFile(file);
    } catch (error: any) {
      showToast(error.message || 'Please upload a PDF, Word, or TXT file', 'cancel');
      return;
    }

    setIsUploading(true);
    try {
      // No `storagePath`: the parse route deletes the Storage object as part of
      // a successful parse, so a path handed on here would name an object that
      // no longer exists — and page.tsx persists it into an immutable
      // resume_versions record. `storagePathDeleted` is the honest provenance.
      const { text, fileName, sourceType, characterCount, detectedType, storagePathDeleted } = await uploadAndParseResume(file);

      if (!text || text.trim().length < 20) {
        throw new Error('Could not extract meaningful text from this file. Try pasting your text instead.');
      }

      onUploadSuccess(text, fileName, { sourceType, characterCount, detectedType, storagePathDeleted });
      // Don't setIsUploading(false) here — parent keeps loading state
      // through AI parsing. Parent will reset when fully done.
    } catch (error: any) {
      console.error('Upload error:', error);
      if (error instanceof ResumeUploadError && error.code === 'SCANNED_PDF') {
        showToast('This looks like a scanned PDF. OCR is coming soon — please upload a text-based PDF or Word file.', 'cancel');
        setIsUploading(false);
        return;
      }
      showToast(error.message || 'Failed to process file', 'cancel');
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const submitPasteText = () => {
    const clean = pasteValue.trim();
    if (clean.length < 40) {
      showToast('Paste a little more resume text so we have enough to structure it.', 'info');
      return;
    }
    onPasteText?.(clean);
    setPasteOpen(false);
    setPasteValue('');
  };

  if (variant === 'compact') {
    return (
      <div
        className={`relative ${className}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`w-full p-4 rounded-xl bg-[var(--bg-input)] border focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-dim)] text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none transition-all ${
            dragActive ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border-subtle)]'
          }`}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx,.doc"
          onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] hover:bg-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-all border border-[var(--border-subtle)] flex items-center gap-1.5 z-10"
        >
          {isUploading ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-[var(--accent)]"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Parsing...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              Upload File
            </>
          )}
        </button>

        {/* Drag Overlay for visual feedback */}
        <AnimatePresence>
          {dragActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 rounded-xl bg-[var(--accent-dim)] backdrop-blur-[2px] border-2 border-[var(--accent)] flex items-center justify-center pointer-events-none"
            >
              <div className="bg-[var(--bg-surface)] px-4 py-2 rounded-lg border border-[var(--accent-hover)] text-[var(--accent)] font-medium flex items-center gap-2 shadow-xl">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg>
                Drop to extract text
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (variant === 'arrival') {
    return (
      <div className={className}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(event) => event.target.files?.[0] && handleFileUpload(event.target.files[0])}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt"
        />
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          aria-describedby="resume-arrival-upload-help"
          className={`resume-arrival-dropzone ${dragActive ? 'is-dragging' : ''}`}
        >
          <div aria-live="polite" className="sr-only">
            {isUploading
              ? `Resume upload in progress: ${processingStage || 'uploading'}`
              : dragActive
                ? 'Release to upload and analyze this resume.'
                : 'Resume upload ready. Choose a file or drag and drop a resume.'}
          </div>

          {isUploading ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="resume-arrival-dropzone__loading"
            >
              <AssistantThinkingTile
                variant="resume"
                icon={processingStage === 'parsing' ? 'account_tree' : processingStage === 'extracting' ? 'document_scanner' : 'cloud_upload'}
                title={processingStage === 'parsing' ? 'Taco is structuring your resume' : processingStage === 'extracting' ? 'Taco is reading your document' : 'Taco is preparing your file'}
                description={processingStage === 'parsing' ? 'Turning raw text into roles, skills, proof, and ATS-ready structure.' : processingStage === 'extracting' ? 'Extracting clean text while protecting filenames and upload limits.' : 'Checking the file and sending it through the safest available path.'}
                activeStage={processingStage || 'uploading'}
                stages={['Uploading', 'Extracting', 'Structuring']}
                compact
              />
            </motion.div>
          ) : (
            <>
              <div className="resume-arrival-dropzone__message">
                <span className="resume-arrival-dropzone__icon material-symbols-rounded" aria-hidden="true">
                  {dragActive ? 'move_to_inbox' : 'upload_file'}
                </span>
                <div>
                  <h2>{dragActive ? 'Release to add this resume' : 'Drop your resume here'}</h2>
                  <p>We will keep its structure and guide you through targeting, improvements, and export.</p>
                </div>
              </div>
              <div className="resume-arrival-dropzone__action">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={isUploading}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">upload_file</span>
                  Choose a file
                </button>
                <p id="resume-arrival-upload-help">
                  PDF, DOCX, DOC, or TXT up to {RESUME_UPLOAD_LIMITS.authenticatedBytes / 1024 / 1024}MB
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'studio') {
    return (
      <div className={className}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={(event) => event.target.files?.[0] && handleFileUpload(event.target.files[0])}
          className="hidden"
          accept=".pdf,.docx,.doc,.txt"
        />
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          aria-describedby="resume-studio-upload-help"
          className={`relative overflow-hidden rounded-[16px] border border-dashed px-5 py-8 transition-colors sm:px-8 sm:py-10 ${
            dragActive
              ? 'border-cyan-500/60 bg-cyan-500/[0.07]'
              : 'border-[var(--border)] bg-[var(--bg-card)]'
          }`}
        >
          <div aria-live="polite" className="sr-only">
            {isUploading
              ? `Resume upload in progress: ${processingStage || 'uploading'}`
              : dragActive
                ? 'Release to upload and analyze this resume.'
                : 'Resume upload ready. Choose a file or drag and drop a resume.'}
          </div>

          {isUploading ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-md"
            >
              <AssistantThinkingTile
                variant="resume"
                icon={processingStage === 'parsing' ? 'account_tree' : processingStage === 'extracting' ? 'document_scanner' : 'cloud_upload'}
                title={processingStage === 'parsing' ? 'Taco is structuring your resume' : processingStage === 'extracting' ? 'Taco is reading your document' : 'Taco is preparing your file'}
                description={processingStage === 'parsing' ? 'Turning raw text into roles, skills, proof, and ATS-ready structure.' : processingStage === 'extracting' ? 'Extracting clean text while protecting filenames and upload limits.' : 'Checking the file and sending it through the safest available path.'}
                activeStage={processingStage || 'uploading'}
                stages={['Uploading', 'Extracting', 'Structuring']}
              />
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-hover)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                  initial={{ width: '0%' }}
                  animate={{ width: processingStage === 'parsing' ? '90%' : processingStage === 'extracting' ? '50%' : '20%' }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                />
              </div>
            </motion.div>
          ) : (
            <div className="mx-auto max-w-xl text-center">
              <div className="icon-shell-neutral mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] border">
                <span className="material-symbols-rounded text-[20px]">upload_file</span>
              </div>
              {dragActive ? (
                <motion.p
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[16px] font-semibold text-cyan-500"
                >
                  Release to add this resume
                </motion.p>
              ) : (
                <>
                  <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">Drop your resume here</h3>
                  <p id="resume-studio-upload-help" className="mt-1.5 text-[12px] text-[var(--text-secondary)]">
                    PDF, DOCX, DOC, or TXT up to {RESUME_UPLOAD_LIMITS.authenticatedBytes / 1024 / 1024}MB
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    disabled={isUploading}
                    className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[var(--text-primary)] px-4 py-2.5 text-[12px] font-semibold text-[var(--bg-deep)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 disabled:opacity-60"
                  >
                    <span className="material-symbols-rounded text-[16px]">upload_file</span>
                    Choose a file
                  </button>
                </>
              )}

              {showPasteFallback && onPasteText && (
                <div className="mt-6 border-t border-[var(--border-subtle)] pt-4 text-left">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPasteOpen(open => !open);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[8px] px-1 py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35"
                    aria-expanded={pasteOpen}
                  >
                    <span>
                      <span className="block text-[12px] font-medium text-[var(--text-primary)]">Can’t upload the file?</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Paste the resume text instead.</span>
                    </span>
                    <span className="material-symbols-rounded icon-neutral text-[18px]">{pasteOpen ? 'expand_less' : 'expand_more'}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {pasteOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 pt-3">
                          <textarea
                            value={pasteValue}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setPasteValue(event.target.value)}
                            rows={5}
                            placeholder="Paste your resume text here."
                            className="w-full resize-none rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/35"
                          />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              submitPasteText();
                            }}
                            className="rounded-[10px] bg-[var(--text-primary)] px-4 py-2.5 text-[12px] font-semibold text-[var(--bg-deep)] transition-opacity hover:opacity-90"
                          >
                            Continue with pasted text
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Large Variant (Like Liquid Resume)
  return (
    <div className={className}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        className="hidden"
        accept=".pdf,.docx,.doc,.txt"
      />
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        aria-describedby="resume-upload-help"
        className={`p-4 md:p-5 transition-all relative overflow-hidden rounded-2xl ${
          dragActive
            ? 'bg-cyan-500/[0.06] ring-2 ring-cyan-500/25'
            : 'hover:bg-[var(--bg-hover)]'
        }`}
      >
        <div aria-live="polite" className="sr-only">
          {isUploading
            ? `Resume upload in progress: ${processingStage || 'uploading'}`
            : dragActive
              ? 'Release to upload and analyze this resume.'
              : 'Resume upload ready. Use Browse files or drag and drop a resume.'}
        </div>
        {/* Subtle glow effect when dragging */}
        <AnimatePresence>
          {dragActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to top, var(--accent-dim), transparent)' }}
            />
          )}
        </AnimatePresence>

        {isUploading ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 w-full max-w-md mx-auto"
          >
            <AssistantThinkingTile
              variant="resume"
              icon={processingStage === 'parsing' ? 'account_tree' : processingStage === 'extracting' ? 'document_scanner' : 'cloud_upload'}
              title={processingStage === 'parsing' ? 'Taco is structuring your resume' : processingStage === 'extracting' ? 'Taco is reading your document' : 'Taco is preparing your file'}
              description={processingStage === 'parsing' ? 'Turning raw text into roles, skills, proof, and ATS-ready structure.' : processingStage === 'extracting' ? 'Extracting clean text while protecting filenames and upload limits.' : 'Checking the file and sending it through the safest available path.'}
              activeStage={processingStage || 'uploading'}
              stages={['Uploading', 'Extracting', 'Structuring']}
              compact={uploadContext === 'compact'}
            />
            <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
                initial={{ width: '0%' }}
                animate={{
                  width: processingStage === 'parsing' ? '90%' : processingStage === 'extracting' ? '50%' : '20%'
                }}
                transition={{ duration: 2, ease: 'easeInOut' }}
              />
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-2 uppercase tracking-wider font-medium">Step {processingStage === 'parsing' ? '3' : processingStage === 'extracting' ? '2' : '1'} of 3</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10"
          >
            <div className="grid gap-5 items-stretch xl:grid-cols-[minmax(0,1.16fr)_minmax(360px,0.84fr)]">
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 md:p-6 flex flex-col items-center justify-center text-center min-h-[360px] xl:min-h-[440px]">
                {/* ── Animated icon with rising particles ── */}
                <div className="relative w-28 h-28 mx-auto mb-5 flex items-center justify-center">

                  {/* Breathing ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ border: '1.5px solid rgba(6,182,212,0.25)' }}
                    animate={reduceMotion ? { scale: 1, opacity: 0.45 } : { scale: [1, 1.15, 1], opacity: [0.5, 0.15, 0.5] }}
                    transition={reduceMotion ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  {/* Rising sparkle particles — staggered, drift up and fade */}
                  {!reduceMotion && [
                    { left: '15%', delay: 0, size: 3 },
                    { left: '75%', delay: 1.2, size: 2 },
                    { left: '45%', delay: 2.4, size: 4 },
                    { left: '85%', delay: 0.8, size: 2.5 },
                    { left: '25%', delay: 2, size: 3 },
                  ].map((p, i) => (
                    <motion.div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        width: p.size,
                        height: p.size,
                        left: p.left,
                        bottom: '30%',
                        background: 'rgba(6,182,212,0.6)',
                        boxShadow: '0 0 4px rgba(6,182,212,0.4)',
                      }}
                      animate={{
                        y: [0, -40, -60],
                        opacity: [0, 0.8, 0],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        delay: p.delay,
                        ease: 'easeOut',
                      }}
                    />
                  ))}

                  {/* Center icon with scan line */}
                  <motion.div
                    className="icon-shell-neutral relative z-10 w-16 h-16 rounded-2xl border flex items-center justify-center overflow-hidden"
                    animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                    transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <span className="material-symbols-rounded text-[28px]">description</span>

                    {/* Scan line — sweeps down periodically */}
                    {!reduceMotion && (
                      <motion.div
                        className="absolute left-0 right-0 h-[2px] pointer-events-none"
                        style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.5) 50%, transparent 100%)' }}
                        animate={{ top: ['-10%', '110%'] }}
                        transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
                      />
                    )}
                  </motion.div>
                </div>

                {/* ── Copy ── */}
                {dragActive ? (
                  <motion.p
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[17px] font-bold text-cyan-500"
                  >
                    Release to analyze
                  </motion.p>
                ) : (
                  <>
                    <p className="text-[19px] font-semibold text-[var(--text-primary)] mb-1">
                      Drop your resume here
                    </p>
                    <p id="resume-upload-help" className="text-[13px] text-[var(--text-secondary)] mb-5">
                      Drag a file here or use Browse files · PDF, Word, TXT · Max {RESUME_UPLOAD_LIMITS.authenticatedBytes / 1024 / 1024}MB
                    </p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploading}
                      className="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold border border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/45 disabled:opacity-60"
                    >
                      <span className="material-symbols-rounded text-[14px]">upload_file</span>
                      Browse files
                    </button>

                    {/* Gentle motion cue */}
                    <motion.div
                      animate={reduceMotion ? undefined : { y: [0, 4, 0] }}
                      transition={reduceMotion ? undefined : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="mb-3"
                    >
                      <div
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold"
                        style={{
                          background: 'linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(59,130,246,0.06) 100%)',
                          border: '1px solid rgba(6,182,212,0.2)',
                          color: '#06b6d4',
                        }}
                      >
                        <span className="material-symbols-rounded text-[14px]">upload</span>
                        {uploadContext === 'onboarding' ? 'Start setup' : 'Start here'}
                      </div>
                    </motion.div>

                    {/* Benefit ticker */}
                    <BenefitTicker reduceMotion={!!reduceMotion} />
                  </>
                )}
              </div>

              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 md:p-6">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)] font-medium">Intake workspace</p>
                <h3 className="text-[18px] font-semibold text-[var(--text-primary)] mt-1">We turn one file into a working resume system.</h3>
                <p className="text-[12px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                  Upload once, then reuse the parsed version across matching, templates, cover letters, applications, and interview prep.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {INTAKE_STEPS.map(step => (
                    <div key={step.label} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <span className="material-symbols-rounded icon-neutral text-[17px]">{step.icon}</span>
                      <p className="text-[12px] font-semibold text-[var(--text-primary)] mt-2">{step.label}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">{step.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2">
                  {FILE_RULES.map(rule => (
                    <div key={rule.label} className="flex items-start gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                      <div className="w-8 h-8 rounded-[9px] bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-rounded text-[16px] text-[var(--text-secondary)]">{rule.icon}</span>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-[var(--text-primary)]">{rule.label}</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{rule.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {showPasteFallback && onPasteText && (
                  <div className="mt-5 rounded-[14px] border border-cyan-500/15 bg-cyan-500/[0.04] p-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPasteOpen(open => !open);
                      }}
                      className="w-full flex items-center justify-between gap-3 text-left"
                    >
                      <span>
                        <span className="block text-[12px] font-semibold text-[var(--text-primary)]">Paste resume text instead</span>
                        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">Best for scanned PDFs, locked files, or broken extraction.</span>
                      </span>
                      <span className="material-symbols-rounded icon-neutral text-[18px]">{pasteOpen ? 'expand_less' : 'expand_more'}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {pasteOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: reduceMotion ? 0 : 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-3 space-y-3">
                            <textarea
                              value={pasteValue}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setPasteValue(e.target.value)}
                              rows={5}
                              placeholder="Paste the resume text here. We will route it through the same parsing flow."
                              className="w-full rounded-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/35 resize-none"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                submitPasteText();
                              }}
                              className="w-full rounded-[11px] bg-[var(--text-primary)] text-[var(--bg-deep)] py-2.5 text-[12px] font-semibold hover:opacity-90 transition-all"
                            >
                              Use pasted text
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
