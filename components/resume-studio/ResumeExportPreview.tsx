"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CanonicalResume } from "@/lib/resume-normalizer";
import { buildResumePDFArtifact } from "@/lib/pdf-templates";
import type { TemplateColors } from "@/lib/resume-templates/catalog";
import "./resume-export-preview.css";
import { resumeDesignSignature, type ResumeDesignConfig } from '@/lib/resume-design';

export interface ResumeExportPreviewProps {
  resume: CanonicalResume;
  templateId: string;
  colors?: TemplateColors;
  pageSize?: "A4" | "LETTER";
  design?: ResumeDesignConfig;
  mode?: 'designed' | 'application';
  composition?: 'standard' | 'flagship-experiment';
  onArtifact?: (artifact: { blob: Blob; pageCount: number | null; url: string } | null) => void;
}

export function ResumeExportPreview({ resume, templateId, colors, pageSize = "A4", design, mode = 'designed', composition = 'standard', onArtifact }: ResumeExportPreviewProps) {
  const [state, setState] = useState<{ url: string; pageCount: number | null; signature: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const urlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const generation = useRef(0);
  const signature = resumeDesignSignature(resume, templateId, colors, pageSize, design, mode, composition);
  const signatureRef = useRef(signature);
  useLayoutEffect(() => { signatureRef.current = signature; }, [signature]);
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(null); setError(null); setBusy(false); canvasRef.current?.replaceChildren(); onArtifact?.(null);
    return () => { mounted.current = false; generation.current += 1; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
  // Signature is the explicit invalidation boundary for controlled content.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const build = async () => {
    const buildGeneration = generation.current;
    const host = canvasRef.current;
    const isCurrent = () => mounted.current && signatureRef.current === signature && buildGeneration === generation.current && host === canvasRef.current;
    setBusy(true);
    setError(null);
    setState(null);
    onArtifact?.(null);
    host?.replaceChildren();
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    try {
      const artifact = await buildResumePDFArtifact(resume, colors, templateId, pageSize, design, mode, composition);
      if (!isCurrent()) return;
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!isCurrent()) return;
      if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = await artifact.blob.arrayBuffer();
      if (!isCurrent()) return;
      const loadingTask = pdfjs.getDocument({ data });
      let document: PDFDocumentProxy | null = null;
      try {
        document = await loadingTask.promise;
        if (!isCurrent()) return;
        const pdfDocument = document;
        host?.replaceChildren();
        const maxPages = Math.min(pdfDocument.numPages, 30);
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          if (!isCurrent()) return;
          const page = await pdfDocument.getPage(pageNumber);
          if (!isCurrent()) { page.cleanup(); return; }
          const viewport = page.getViewport({ scale: 1.25 });
          const canvas = window.document.createElement("canvas");
          canvas.className = "resume-export-preview__page";
          canvas.setAttribute("aria-label", `PDF page ${pageNumber} of ${pdfDocument.numPages}`);
          canvas.width = viewport.width; canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) { page.cleanup(); throw new Error("Canvas preview is unavailable in this browser."); }
          await page.render({ canvasContext: context, viewport }).promise;
          if (!isCurrent()) { page.cleanup(); return; }
          host?.appendChild(canvas);
          page.cleanup();
        }
      } finally {
        if (document) await document.destroy();
        else await loadingTask.destroy();
      }
      if (!isCurrent()) return;
      const url = URL.createObjectURL(artifact.blob);
      urlRef.current = url;
      setState({ url, pageCount: artifact.pageCount, signature });
      onArtifact?.({ ...artifact, url });
    } catch (buildError) {
      if (isCurrent()) { host?.replaceChildren(); setError(buildError instanceof Error ? buildError.message : "The PDF could not be built."); }
    } finally { if (mounted.current && buildGeneration === generation.current) setBusy(false); }
  };
  const currentState = state?.signature === signature ? state : null;
  return <section className="resume-export-preview" aria-label="PDF export preview" data-guide="resume-export"><header><div><p className="resume-export-preview__eyebrow">Final artifact</p><h2>PDF preview</h2><p>Built on demand from the current content and template.</p></div><button type="button" onClick={build} disabled={busy}>{busy ? "Building…" : currentState ? "Refresh preview" : "Build preview"}</button></header>{error && <p className="resume-export-preview__error" role="alert">{error}</p>}{currentState ? <><p className="resume-export-preview__meta">{currentState.pageCount === null ? "Page count unavailable" : `${currentState.pageCount} ${currentState.pageCount === 1 ? "page" : "pages"}`} · {pageSize}</p>{currentState.pageCount !== null && currentState.pageCount > 30 && <p className="resume-export-preview__caption">Canvas preview shows the first 30 pages. Download includes the complete PDF.</p>}</> : <p className="resume-export-preview__empty">{error ? "Try building the preview again." : "Build a preview when you are ready to inspect pagination."}</p>}<div ref={canvasRef} className="resume-export-preview__pages" aria-label="Rendered PDF pages" />{currentState && <a className="resume-export-preview__fallback" href={currentState.url} download="resume.pdf">Download this exact PDF</a>}</section>;
}
