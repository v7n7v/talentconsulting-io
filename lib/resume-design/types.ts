import type { CanonicalResume } from '@/lib/resume-normalizer';

export const RESUME_FONTS = [
  { id: 'inter', label: 'Inter', family: 'ResumeInter', file: 'Inter', word: 'Arial', serif: false },
  { id: 'liberation-sans', label: 'Liberation Sans', family: 'ResumeLiberationSans', file: 'LiberationSans', word: 'Arial', serif: false },
  { id: 'liberation-serif', label: 'Liberation Serif', family: 'ResumeLiberationSerif', file: 'LiberationSerif', word: 'Times New Roman', serif: true },
  { id: 'liberation-mono', label: 'Liberation Mono', family: 'ResumeLiberationMono', file: 'LiberationMono', word: 'Courier New', serif: false },
  { id: 'dejavu-sans', label: 'DejaVu Sans', family: 'ResumeDejaVuSans', file: 'DejaVuSans', word: 'Arial', serif: false },
  { id: 'dejavu-serif', label: 'DejaVu Serif', family: 'ResumeDejaVuSerif', file: 'DejaVuSerif', word: 'Times New Roman', serif: true },
] as const;
export type ResumeFontId = typeof RESUME_FONTS[number]['id'];
export interface ResumeDesignTypography {
  bodyFont: ResumeFontId; headingFont: ResumeFontId;
  bodySize: number; headingSize: number; roleSize: number; nameSize: number; contactSize: number;
  bodyWeight: 400 | 700; headingWeight: 400 | 700;
  lineHeight: number; letterSpacing: number; headingCase: 'normal' | 'uppercase';
}
export interface ResumeDesignSection {
  id: string; title: string; visible: boolean; region: 'main' | 'rail'; breakBefore: boolean;
  typography?: Partial<ResumeDesignTypography>;
}
export interface ResumeDesignConfig {
  schemaVersion: 1; rendererVersion: 2 | 3; templateId: string;
  /** Version 3 is opt-in and must identify its composition. Old designs omit this field. */
  composition?: 'taco-signature';
  pageSize: 'A4' | 'LETTER';
  typography: ResumeDesignTypography;
  colors: { paper: string; ink: string; heading: string; accent: string; rail: string; railInk: string };
  layout: {
    columns: 1 | 2; railSide: 'left' | 'right'; railWidth: number;
    margins: { top: number; right: number; bottom: number; left: number };
    columnGap: number; sectionGap: number; entryGap: number; bulletGap: number;
    headerStyle: 'left' | 'center' | 'split' | 'band';
    headingStyle: 'plain' | 'rule' | 'box' | 'bar' | 'numbered';
    companyFirst: boolean; dates: 'inline' | 'below'; bullet: 'disc' | 'dash' | 'none';
    ruleWidth: number; showMotif: boolean;
  };
  sections: ResumeDesignSection[];
  breakBeforeEntries: string[];
  continuationHeader: boolean;
}
export interface ResumeDesignEntry {
  id: string; title: string; subtitle?: string; date?: string; text?: string; bullets: string[];
}
export interface ResumeDocumentSection extends ResumeDesignSection {
  kind: 'summary' | 'experience' | 'education' | 'skills' | 'certifications' | 'additional';
  entries: ResumeDesignEntry[];
}
export interface ResumeDocumentPlan {
  name: string; title: string; contact: string[];
  sections: ResumeDocumentSection[]; excluded: string[]; design: ResumeDesignConfig;
  source: CanonicalResume;
}
export type ResumeTemplateFamily = 'foundation' | 'outcomes' | 'specialized' | 'editorial';

export type ResumeComposition = 'standard' | 'flagship-experiment';
