'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { createResumeDesign } from '@/lib/resume-design';
import { getDefaultPaletteId, getTemplateWithPalette, type ResumeTemplateMetadata } from '@/lib/resume-templates';
import { ResumeTemplate } from '@/components/resume-templates';

const A4_WIDTH = 793.7;

/** A thumbnail of the actual structured composition, with fictional or supplied content. */
export function DesignThumbnail({ template, resume, className = '' }: { template: ResumeTemplateMetadata; resume: CanonicalResume; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const palette = getTemplateWithPalette(template, getDefaultPaletteId(template.id));
  const design = useMemo(() => createResumeDesign(template.id, resume, palette.colors), [template.id, resume, palette.colors]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const next = frame.clientWidth / A4_WIDTH;
      setScale(current => Math.abs(current - next) < 0.001 ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return <div ref={frameRef} className={`relative h-full w-full overflow-hidden bg-white ${className}`} aria-label={`${template.name} customizable résumé design preview`}>
    <div className="resume-design-thumbnail-page" style={{ position: 'absolute', left: 0, top: 0, transformOrigin: 'top left', pointerEvents: 'none', width: A4_WIDTH, transform: `matrix(${scale}, 0, 0, ${scale}, 0, 0)` }}>
      <ResumeTemplate resume={resume} templateId={template.id} colors={palette.colors} design={design} />
    </div>
  </div>;
}

export default DesignThumbnail;
