import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

import type { CanonicalResume } from './resume-normalizer';
import { getContrastRatio } from './resume-templates/catalog';
import type { TemplateColors } from './resume-templates/types';

export type CuratedSignatureTemplateId =
  | 'executive-ledger'
  | 'strategy-brief'
  | 'product-signal'
  | 'engineering-core'
  | 'data-evidence'
  | 'finance-standard'
  | 'legal-brief'
  | 'healthcare-precision'
  | 'academic-profile'
  | 'public-service'
  | 'mission-impact'
  | 'career-pivot'
  | 'emerging-professional'
  | 'sales-momentum'
  | 'creative-director'
  | 'architectural-grid'
  | 'editorial-signature';

export type CuratedResumeSection = 'Summary' | 'Experience' | 'Skills' | 'Education';

export interface CuratedSignatureDocxProfile {
  readonly id: CuratedSignatureTemplateId;
  readonly linearDocxCompanionKey: `${CuratedSignatureTemplateId}:linear-docx`;
  readonly sectionOrder: readonly CuratedResumeSection[];
  readonly bodyFont: string;
  readonly displayFont: string;
  readonly nameSize: number;
  readonly titleSize: number;
  readonly bodySize: number;
  readonly sectionSize: number;
  readonly lineSpacing: number;
  readonly bodyAfter: number;
  readonly sectionBefore: number;
  readonly sectionAfter: number;
  readonly bulletIndent: number;
  readonly bulletHanging: number;
  readonly headerAlignment: 'left' | 'center';
  readonly headingTreatment: 'title' | 'caps' | 'small-caps';
  readonly sectionRule: 'none' | 'top' | 'bottom' | 'double-bottom';
  readonly ruleSize: number;
  readonly palette: Readonly<TemplateColors>;
}

/**
 * Standard-business-brief geometry is the common baseline. Each named profile
 * is an intentional, linear override limited to typography, rhythm, rules,
 * heading treatment, and the catalog-approved section order.
 */
export const CURATED_SIGNATURE_DOCX_PROFILE_MAP = Object.freeze({
  'executive-ledger': {
    id: 'executive-ledger',
    linearDocxCompanionKey: 'executive-ledger:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Cambria', nameSize: 34, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 276, bodyAfter: 100,
    sectionBefore: 220, sectionAfter: 100, bulletIndent: 540, bulletHanging: 260,
    headerAlignment: 'left', headingTreatment: 'small-caps',
    sectionRule: 'bottom', ruleSize: 8,
    palette: { primary: '#17324d', accent: '#9b7a3d', text: '#172033', background: '#ffffff' },
  },
  'strategy-brief': {
    id: 'strategy-brief',
    linearDocxCompanionKey: 'strategy-brief:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 32, titleSize: 20,
    bodySize: 20, sectionSize: 22, lineSpacing: 270, bodyAfter: 80,
    sectionBefore: 180, sectionAfter: 80, bulletIndent: 500, bulletHanging: 240,
    headerAlignment: 'left', headingTreatment: 'caps',
    sectionRule: 'bottom', ruleSize: 6,
    palette: { primary: '#243b53', accent: '#0e7490', text: '#172033', background: '#ffffff' },
  },
  'product-signal': {
    id: 'product-signal',
    linearDocxCompanionKey: 'product-signal:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Arial', nameSize: 34, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 282, bodyAfter: 100,
    sectionBefore: 210, sectionAfter: 90, bulletIndent: 560, bulletHanging: 260,
    headerAlignment: 'left', headingTreatment: 'title',
    sectionRule: 'top', ruleSize: 8,
    palette: { primary: '#1e3a8a', accent: '#06b6d4', text: '#172033', background: '#ffffff' },
  },
  'engineering-core': {
    id: 'engineering-core',
    linearDocxCompanionKey: 'engineering-core:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 31, titleSize: 19,
    bodySize: 20, sectionSize: 21, lineSpacing: 268, bodyAfter: 72,
    sectionBefore: 170, sectionAfter: 72, bulletIndent: 480, bulletHanging: 220,
    headerAlignment: 'left', headingTreatment: 'caps',
    sectionRule: 'top', ruleSize: 6,
    palette: { primary: '#111827', accent: '#2563eb', text: '#172033', background: '#ffffff' },
  },
  'data-evidence': {
    id: 'data-evidence',
    linearDocxCompanionKey: 'data-evidence:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Cambria', nameSize: 33, titleSize: 20,
    bodySize: 21, sectionSize: 22, lineSpacing: 286, bodyAfter: 96,
    sectionBefore: 210, sectionAfter: 88, bulletIndent: 520, bulletHanging: 240,
    headerAlignment: 'left', headingTreatment: 'small-caps',
    sectionRule: 'bottom', ruleSize: 10,
    palette: { primary: '#172554', accent: '#7c3aed', text: '#172033', background: '#ffffff' },
  },
  'finance-standard': {
    id: 'finance-standard',
    linearDocxCompanionKey: 'finance-standard:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Cambria', displayFont: 'Cambria', nameSize: 32, titleSize: 19,
    bodySize: 20, sectionSize: 22, lineSpacing: 272, bodyAfter: 80,
    sectionBefore: 176, sectionAfter: 76, bulletIndent: 500, bulletHanging: 230,
    headerAlignment: 'left', headingTreatment: 'caps',
    sectionRule: 'double-bottom', ruleSize: 6,
    palette: { primary: '#064e3b', accent: '#a16207', text: '#172033', background: '#ffffff' },
  },
  'legal-brief': {
    id: 'legal-brief',
    linearDocxCompanionKey: 'legal-brief:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Georgia', displayFont: 'Georgia', nameSize: 31, titleSize: 19,
    bodySize: 20, sectionSize: 21, lineSpacing: 288, bodyAfter: 96,
    sectionBefore: 212, sectionAfter: 88, bulletIndent: 540, bulletHanging: 250,
    headerAlignment: 'center', headingTreatment: 'small-caps',
    sectionRule: 'bottom', ruleSize: 6,
    palette: { primary: '#312e81', accent: '#92400e', text: '#172033', background: '#ffffff' },
  },
  'healthcare-precision': {
    id: 'healthcare-precision',
    linearDocxCompanionKey: 'healthcare-precision:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Calibri', nameSize: 33, titleSize: 20,
    bodySize: 21, sectionSize: 22, lineSpacing: 284, bodyAfter: 104,
    sectionBefore: 204, sectionAfter: 92, bulletIndent: 530, bulletHanging: 250,
    headerAlignment: 'left', headingTreatment: 'title',
    sectionRule: 'bottom', ruleSize: 8,
    palette: { primary: '#075985', accent: '#0f766e', text: '#172033', background: '#ffffff' },
  },
  'academic-profile': {
    id: 'academic-profile',
    linearDocxCompanionKey: 'academic-profile:linear-docx',
    sectionOrder: ['Summary', 'Education', 'Experience', 'Skills'],
    bodyFont: 'Georgia', displayFont: 'Georgia', nameSize: 34, titleSize: 20,
    bodySize: 21, sectionSize: 23, lineSpacing: 300, bodyAfter: 120,
    sectionBefore: 240, sectionAfter: 104, bulletIndent: 560, bulletHanging: 260,
    headerAlignment: 'center', headingTreatment: 'small-caps',
    sectionRule: 'none', ruleSize: 0,
    palette: { primary: '#7f1d1d', accent: '#b45309', text: '#172033', background: '#ffffff' },
  },
  'public-service': {
    id: 'public-service',
    linearDocxCompanionKey: 'public-service:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 31, titleSize: 19,
    bodySize: 20, sectionSize: 22, lineSpacing: 274, bodyAfter: 84,
    sectionBefore: 184, sectionAfter: 80, bulletIndent: 520, bulletHanging: 250,
    headerAlignment: 'left', headingTreatment: 'caps',
    sectionRule: 'top', ruleSize: 10,
    palette: { primary: '#1e3a5f', accent: '#b91c1c', text: '#172033', background: '#ffffff' },
  },
  'mission-impact': {
    id: 'mission-impact',
    linearDocxCompanionKey: 'mission-impact:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Cambria', nameSize: 34, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 292, bodyAfter: 112,
    sectionBefore: 224, sectionAfter: 96, bulletIndent: 550, bulletHanging: 260,
    headerAlignment: 'left', headingTreatment: 'title',
    sectionRule: 'bottom', ruleSize: 8,
    palette: { primary: '#365314', accent: '#c2410c', text: '#172033', background: '#ffffff' },
  },
  'career-pivot': {
    id: 'career-pivot',
    linearDocxCompanionKey: 'career-pivot:linear-docx',
    sectionOrder: ['Summary', 'Skills', 'Experience', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Arial', nameSize: 34, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 286, bodyAfter: 104,
    sectionBefore: 216, sectionAfter: 92, bulletIndent: 540, bulletHanging: 250,
    headerAlignment: 'center', headingTreatment: 'title',
    sectionRule: 'top', ruleSize: 8,
    palette: { primary: '#4c1d95', accent: '#0e7490', text: '#172033', background: '#ffffff' },
  },
  'emerging-professional': {
    id: 'emerging-professional',
    linearDocxCompanionKey: 'emerging-professional:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 35, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 290, bodyAfter: 108,
    sectionBefore: 218, sectionAfter: 94, bulletIndent: 560, bulletHanging: 270,
    headerAlignment: 'center', headingTreatment: 'caps',
    sectionRule: 'bottom', ruleSize: 6,
    palette: { primary: '#1d4ed8', accent: '#059669', text: '#172033', background: '#ffffff' },
  },
  'sales-momentum': {
    id: 'sales-momentum',
    linearDocxCompanionKey: 'sales-momentum:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 34, titleSize: 20,
    bodySize: 20, sectionSize: 23, lineSpacing: 270, bodyAfter: 76,
    sectionBefore: 172, sectionAfter: 76, bulletIndent: 490, bulletHanging: 230,
    headerAlignment: 'left', headingTreatment: 'caps',
    sectionRule: 'bottom', ruleSize: 12,
    palette: { primary: '#7c2d12', accent: '#ea580c', text: '#172033', background: '#ffffff' },
  },
  'creative-director': {
    id: 'creative-director',
    linearDocxCompanionKey: 'creative-director:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Calibri', displayFont: 'Georgia', nameSize: 38, titleSize: 22,
    bodySize: 21, sectionSize: 24, lineSpacing: 296, bodyAfter: 120,
    sectionBefore: 244, sectionAfter: 104, bulletIndent: 580, bulletHanging: 270,
    headerAlignment: 'center', headingTreatment: 'title',
    sectionRule: 'none', ruleSize: 0,
    palette: { primary: '#18181b', accent: '#e11d48', text: '#172033', background: '#ffffff' },
  },
  'architectural-grid': {
    id: 'architectural-grid',
    linearDocxCompanionKey: 'architectural-grid:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Arial', displayFont: 'Arial', nameSize: 32, titleSize: 19,
    bodySize: 20, sectionSize: 21, lineSpacing: 278, bodyAfter: 88,
    sectionBefore: 196, sectionAfter: 82, bulletIndent: 510, bulletHanging: 240,
    headerAlignment: 'left', headingTreatment: 'small-caps',
    sectionRule: 'top', ruleSize: 4,
    palette: { primary: '#334155', accent: '#b45309', text: '#172033', background: '#ffffff' },
  },
  'editorial-signature': {
    id: 'editorial-signature',
    linearDocxCompanionKey: 'editorial-signature:linear-docx',
    sectionOrder: ['Summary', 'Experience', 'Skills', 'Education'],
    bodyFont: 'Georgia', displayFont: 'Georgia', nameSize: 37, titleSize: 21,
    bodySize: 21, sectionSize: 23, lineSpacing: 304, bodyAfter: 124,
    sectionBefore: 248, sectionAfter: 108, bulletIndent: 570, bulletHanging: 260,
    headerAlignment: 'left', headingTreatment: 'small-caps',
    sectionRule: 'double-bottom', ruleSize: 4,
    palette: { primary: '#3f3f46', accent: '#be123c', text: '#172033', background: '#ffffff' },
  },
} as const satisfies Record<CuratedSignatureTemplateId, CuratedSignatureDocxProfile>);

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns every non-empty canonical field exactly as supplied, in canonical
 * object order. Repeated values remain repeated so the inventory is a lossless
 * content-preservation oracle for DOCX tests and export boundaries.
 */
export function collectCanonicalContentInventory(resume: CanonicalResume): string[] {
  const inventory: string[] = [];
  const add = (value: unknown) => {
    if (isNonEmptyText(value)) inventory.push(value);
  };

  add(resume.name);
  add(resume.title);
  add(resume.email);
  add(resume.phone);
  add(resume.location);
  add(resume.linkedin);
  add(resume.website);
  add(resume.summary);

  for (const experience of resume.experience || []) {
    add(experience.company);
    add(experience.role);
    add(experience.duration);
    for (const achievement of experience.achievements || []) add(achievement);
  }
  for (const education of resume.education || []) {
    add(education.degree);
    add(education.institution);
    add(education.year);
    add(education.details);
  }
  for (const skillGroup of resume.skills || []) {
    add(skillGroup.category);
    for (const item of skillGroup.items || []) add(item);
  }
  for (const certification of resume.certifications || []) add(certification);

  return inventory;
}

export function getCuratedSignatureDocxProfile(
  templateId: string,
): CuratedSignatureDocxProfile {
  if (!Object.prototype.hasOwnProperty.call(CURATED_SIGNATURE_DOCX_PROFILE_MAP, templateId)) {
    throw new Error(`Unsupported curated signature DOCX template: ${templateId}`);
  }
  return CURATED_SIGNATURE_DOCX_PROFILE_MAP[
    templateId as CuratedSignatureTemplateId
  ];
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const candidate = value?.replace(/^#/, '');
  return candidate && /^[0-9a-f]{6}$/i.test(candidate)
    ? candidate.toUpperCase()
    : fallback.replace(/^#/, '').toUpperCase();
}

const DOCX_PAGE_BACKGROUND = '#ffffff';
const DOCX_MINIMUM_TEXT_CONTRAST = 4.5;

/**
 * DOCX companions are intentionally linear, unshaded Word documents. Word
 * renders that body flow on a white page even when a persisted web/PDF palette
 * was authored for a dark canvas, so meaningful run colors must be resolved
 * against white at this final export boundary.
 */
function resolveReadableDocxTextColor(
  candidate: string | undefined,
  fallback: string,
): string {
  const normalizedCandidate = normalizeHexColor(candidate, '');
  if (
    /^[0-9A-F]{6}$/.test(normalizedCandidate)
    && getContrastRatio(`#${normalizedCandidate}`, DOCX_PAGE_BACKGROUND)
      >= DOCX_MINIMUM_TEXT_CONTRAST
  ) {
    return normalizedCandidate;
  }

  const normalizedFallback = normalizeHexColor(fallback, '');
  if (
    /^[0-9A-F]{6}$/.test(normalizedFallback)
    && getContrastRatio(`#${normalizedFallback}`, DOCX_PAGE_BACKGROUND)
      >= DOCX_MINIMUM_TEXT_CONTRAST
  ) {
    return normalizedFallback;
  }

  return '111827';
}

function sectionBorder(
  profile: CuratedSignatureDocxProfile,
  accentColor: string,
) {
  if (profile.sectionRule === 'none') return undefined;
  const border = {
    color: accentColor,
    space: 3,
    style: profile.sectionRule === 'double-bottom' ? BorderStyle.DOUBLE : BorderStyle.SINGLE,
    size: profile.ruleSize,
  };
  return profile.sectionRule === 'top' ? { top: border } : { bottom: border };
}

function joinFieldRuns(
  values: readonly { value: unknown; bold?: boolean; italics?: boolean }[],
): TextRun[] {
  const runs: TextRun[] = [];
  for (const item of values) {
    if (!isNonEmptyText(item.value)) continue;
    if (runs.length > 0) runs.push(new TextRun({ text: ' | ' }));
    runs.push(new TextRun({
      text: item.value,
      bold: item.bold,
      italics: item.italics,
    }));
  }
  return runs;
}

function headingText(
  section: string,
  profile: CuratedSignatureDocxProfile,
): string {
  return profile.headingTreatment === 'caps' ? section.toUpperCase() : section;
}

function sectionHeading(
  section: string,
  profile: CuratedSignatureDocxProfile,
): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [
      new TextRun({
        text: headingText(section, profile),
        smallCaps: profile.headingTreatment === 'small-caps',
      }),
    ],
  });
}

function buildSummary(
  resume: CanonicalResume,
  profile: CuratedSignatureDocxProfile,
): Paragraph[] {
  if (!isNonEmptyText(resume.summary)) return [];
  return [
    sectionHeading('Summary', profile),
    new Paragraph({
      style: 'ResumeBody',
      children: [new TextRun({ text: resume.summary })],
    }),
  ];
}

function buildExperience(
  resume: CanonicalResume,
  profile: CuratedSignatureDocxProfile,
): Paragraph[] {
  const children: Paragraph[] = [];
  for (const experience of resume.experience || []) {
    const leadRuns = joinFieldRuns([
      { value: experience.role, bold: true },
      { value: experience.company, bold: true },
      { value: experience.duration, italics: true },
    ]);
    if (leadRuns.length > 0) {
      children.push(new Paragraph({
        style: 'ResumeRecordLead',
        children: leadRuns,
      }));
    }
    for (const achievement of experience.achievements || []) {
      if (!isNonEmptyText(achievement)) continue;
      children.push(new Paragraph({
        style: 'ResumeBullet',
        numbering: { reference: 'resume-bullets', level: 0 },
        children: [new TextRun({ text: achievement })],
      }));
    }
  }
  return children.length > 0
    ? [sectionHeading('Experience', profile), ...children]
    : [];
}

function buildSkills(
  resume: CanonicalResume,
  profile: CuratedSignatureDocxProfile,
): Paragraph[] {
  const children: Paragraph[] = [];
  for (const group of resume.skills || []) {
    const items = (group.items || []).filter(isNonEmptyText);
    if (!isNonEmptyText(group.category) && items.length === 0) continue;
    const runs: TextRun[] = [];
    if (isNonEmptyText(group.category)) {
      runs.push(new TextRun({ text: group.category, bold: true }));
    }
    if (items.length > 0) {
      if (runs.length > 0) runs.push(new TextRun({ text: ': ' }));
      items.forEach((item, index) => {
        if (index > 0) runs.push(new TextRun({ text: ', ' }));
        runs.push(new TextRun({ text: item }));
      });
    }
    children.push(new Paragraph({ style: 'ResumeBody', children: runs }));
  }
  return children.length > 0 ? [sectionHeading('Skills', profile), ...children] : [];
}

function buildEducation(
  resume: CanonicalResume,
  profile: CuratedSignatureDocxProfile,
): Paragraph[] {
  const children: Paragraph[] = [];
  for (const education of resume.education || []) {
    const leadRuns = joinFieldRuns([
      { value: education.degree, bold: true },
      { value: education.institution },
      { value: education.year, italics: true },
    ]);
    if (leadRuns.length > 0) {
      children.push(new Paragraph({
        style: 'ResumeRecordLead',
        children: leadRuns,
      }));
    }
    if (isNonEmptyText(education.details)) {
      children.push(new Paragraph({
        style: 'ResumeBody',
        children: [new TextRun({ text: education.details })],
      }));
    }
  }
  return children.length > 0
    ? [sectionHeading('Education', profile), ...children]
    : [];
}

function buildCertifications(
  resume: CanonicalResume,
  profile: CuratedSignatureDocxProfile,
): Paragraph[] {
  const certifications = (resume.certifications || []).filter(isNonEmptyText);
  if (certifications.length === 0) return [];
  return [
    sectionHeading('Certifications', profile),
    ...certifications.map((certification) => new Paragraph({
      style: 'ResumeBullet',
      numbering: { reference: 'resume-bullets', level: 0 },
      children: [new TextRun({ text: certification })],
    })),
  ];
}

function buildAdditionalSections(resume: CanonicalResume, profile: CuratedSignatureDocxProfile): Paragraph[] {
  const sections = (resume as CanonicalResume & { additionalSections?: { id: string; title: string; items: string[] }[] }).additionalSections || [];
  return sections.flatMap((section) => {
    const items = (section.items || []).filter(isNonEmptyText);
    if (!isNonEmptyText(section.title) && items.length === 0) return [];
    return [sectionHeading(isNonEmptyText(section.title) ? section.title : 'Additional information', profile), ...items.map((item) => new Paragraph({ style: 'ResumeBullet', numbering: { reference: 'resume-bullets', level: 0 }, children: [new TextRun({ text: item })] }))];
  });
}

/**
 * Builds the strict linear Word companion for one of the 17 curated signature
 * templates. Essential content is body-flow text only: no tables, text boxes,
 * images, headers, or footers.
 */
function createCuratedSignatureDocxDocument(
  resume: CanonicalResume,
  templateId: string,
  colors?: TemplateColors,
  pageSize: 'A4' | 'LETTER' = 'LETTER',
): Document {
  const profile = getCuratedSignatureDocxProfile(templateId);
  const primary = resolveReadableDocxTextColor(colors?.primary, profile.palette.primary);
  const accent = normalizeHexColor(colors?.accent, profile.palette.accent);
  const text = resolveReadableDocxTextColor(colors?.text, profile.palette.text);
  const alignment = profile.headerAlignment === 'center'
    ? AlignmentType.CENTER
    : AlignmentType.LEFT;

  const bodySections: Record<CuratedResumeSection, Paragraph[]> = {
    Summary: buildSummary(resume, profile),
    Experience: buildExperience(resume, profile),
    Skills: buildSkills(resume, profile),
    Education: buildEducation(resume, profile),
  };

  const children: Paragraph[] = [];
  if (isNonEmptyText(resume.name)) {
    children.push(new Paragraph({
      style: 'ResumeName',
      alignment,
      children: [new TextRun({ text: resume.name })],
    }));
  }
  if (isNonEmptyText(resume.title)) {
    children.push(new Paragraph({
      style: 'ResumeTitle',
      alignment,
      children: [new TextRun({ text: resume.title })],
    }));
  }
  const contactRuns = joinFieldRuns([
    { value: resume.email },
    { value: resume.phone },
    { value: resume.location },
    { value: resume.linkedin },
    { value: resume.website },
    ...(resume.links || []).map((link) => ({ value: link })),
  ]);
  if (contactRuns.length > 0) {
    children.push(new Paragraph({
      style: 'ResumeContact',
      alignment,
      children: contactRuns,
    }));
  }

  for (const section of profile.sectionOrder) children.push(...bodySections[section]);
  children.push(...buildCertifications(resume, profile));
  children.push(...buildAdditionalSections(resume, profile));

  const document = new Document({
    ...(isNonEmptyText(resume.name) ? { title: resume.name } : {}),
    styles: {
      default: {
        document: {
          run: { font: profile.bodyFont, size: profile.bodySize, color: text },
          paragraph: {
            spacing: {
              after: profile.bodyAfter,
              line: profile.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
        heading1: {
          run: {
            font: profile.displayFont,
            size: profile.sectionSize,
            bold: true,
            color: primary,
          },
          paragraph: {
            keepNext: true,
            outlineLevel: 0,
            spacing: {
              before: profile.sectionBefore,
              after: profile.sectionAfter,
              line: 240,
              lineRule: LineRuleType.AUTO,
            },
            border: sectionBorder(profile, accent),
          },
        },
      },
      paragraphStyles: [
        {
          id: 'ResumeName',
          name: 'Resume Name',
          basedOn: 'Normal',
          next: 'ResumeTitle',
          quickFormat: true,
          run: {
            font: profile.displayFont,
            size: profile.nameSize,
            bold: true,
            color: primary,
          },
          paragraph: {
            keepNext: true,
            spacing: { before: 0, after: 40, line: 240, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: 'ResumeTitle',
          name: 'Resume Title',
          basedOn: 'Normal',
          next: 'ResumeContact',
          quickFormat: true,
          run: {
            font: profile.bodyFont,
            size: profile.titleSize,
            bold: true,
            color: text,
          },
          paragraph: {
            keepNext: true,
            spacing: { before: 0, after: 40, line: 240, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: 'ResumeContact',
          name: 'Resume Contact',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: profile.bodyFont, size: 18, color: text },
          paragraph: {
            spacing: { before: 0, after: 80, line: 240, lineRule: LineRuleType.AUTO },
          },
        },
        {
          id: 'ResumeBody',
          name: 'Resume Body',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: profile.bodyFont, size: profile.bodySize, color: text },
          paragraph: {
            spacing: {
              before: 0,
              after: profile.bodyAfter,
              line: profile.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
        {
          id: 'ResumeRecordLead',
          name: 'Resume Record Lead',
          basedOn: 'ResumeBody',
          quickFormat: true,
          run: { font: profile.bodyFont, size: profile.bodySize, color: text },
          paragraph: {
            keepNext: true,
            spacing: {
              before: 40,
              after: 48,
              line: profile.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
        {
          id: 'ResumeBullet',
          name: 'Resume Bullet',
          basedOn: 'ResumeBody',
          quickFormat: true,
          run: { font: profile.bodyFont, size: profile.bodySize, color: text },
          paragraph: {
            spacing: {
              before: 0,
              after: Math.max(48, profile.bodyAfter - 24),
              line: profile.lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      ],
    },
    numbering: {
      config: [{
        reference: 'resume-bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: profile.bodyFont, size: profile.bodySize, color: primary },
            paragraph: {
              indent: {
                left: profile.bulletIndent,
                hanging: profile.bulletHanging,
              },
              spacing: {
                after: Math.max(48, profile.bodyAfter - 24),
                line: profile.lineSpacing,
                lineRule: LineRuleType.AUTO,
              },
            },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: pageSize === 'A4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 },
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440,
            header: 708,
            footer: 708,
          },
        },
      },
      children,
    }],
  });

  return document;
}

export async function buildCuratedSignatureDocx(
  resume: CanonicalResume,
  templateId: string,
  colors?: TemplateColors,
  pageSize: 'A4' | 'LETTER' = 'LETTER',
): Promise<Buffer> {
  return Packer.toBuffer(createCuratedSignatureDocxDocument(resume, templateId, colors, pageSize));
}

export async function buildCuratedSignatureDocxBlob(
  resume: CanonicalResume,
  templateId: string,
  colors?: TemplateColors,
  pageSize: 'A4' | 'LETTER' = 'LETTER',
): Promise<Blob> {
  return Packer.toBlob(createCuratedSignatureDocxDocument(resume, templateId, colors, pageSize));
}
