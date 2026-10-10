import type { CanonicalResume } from '@/lib/resume-normalizer';
import { createResumeDesign, normalizeResumeDesign } from './index';
import type { ResumeDesignConfig } from './types';

/** Presentation-only prototype; its composition identity lives outside the saved v2 envelope. */
export function createResumeFlagshipPrototypeDesign(resume: CanonicalResume, pageSize: 'A4' | 'LETTER' = 'A4'): ResumeDesignConfig {
  const base = createResumeDesign('technical-signal', resume, undefined, pageSize);
  return normalizeResumeDesign({ ...base,
    typography:{ ...base.typography, bodyFont:'inter', headingFont:'liberation-serif', nameSize:30, bodySize:10.5, headingSize:10.5, roleSize:11.5, contactSize:9.5, lineHeight:1.32, headingCase:'normal' },
    colors:{ paper:'#ffffff', ink:'#202b33', heading:'#172e36', accent:'#4a626b', rail:'#ffffff', railInk:'#202b33' },
    layout:{ ...base.layout, columns:1, headerStyle:'left', headingStyle:'plain', showMotif:false, sectionGap:10, entryGap:5, bulletGap:2, dates:'inline' },
    sections:base.sections.map(section => ({ ...section, region:'main' })),
  }, base.templateId, resume);
}


/** Explicit opt-in. Content and section identities stay with the current résumé. */
export function createResumeFlagshipDesign(resume:CanonicalResume, current?:ResumeDesignConfig):ResumeDesignConfig {
  const prototype = createResumeFlagshipPrototypeDesign(resume, current?.pageSize);
  const templateId = current?.templateId || prototype.templateId;
  return normalizeResumeDesign({ ...prototype, templateId, rendererVersion:3, composition:'taco-signature',
    sections:(current?.sections || prototype.sections).map(section => ({ ...section, region:'main' })),
    breakBeforeEntries:current?.breakBeforeEntries || [], continuationHeader:current?.continuationHeader ?? true,
  }, templateId, resume);
}

export function isResumeFlagshipDesign(design?:ResumeDesignConfig | null):boolean {
  return design?.rendererVersion === 3 && design.composition === 'taco-signature';
}
