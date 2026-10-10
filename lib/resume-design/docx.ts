import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import type { ResumeDesignConfig, ResumeDocumentPlan, ResumeDocumentSection } from './types';
import { buildResumeDocumentPlan } from './index';
import { RESUME_FONTS } from './types';

const hex = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).toUpperCase() : fallback;
const wordFont = (id: string) => RESUME_FONTS.find(f => f.id === id)?.word || 'Arial';
const twips = (points: number) => Math.round(points * 20);

function sectionParagraphs(section: ResumeDocumentSection, design: ResumeDesignConfig, sectionNumber: number): Paragraph[] {
  const t = section.typography ? { ...design.typography, ...section.typography } : design.typography;
  const font = wordFont(t.bodyFont);
  const headingFont = wordFont(t.headingFont);
  const ink = hex(design.colors.ink, '202124');
  const headingColor = hex(design.colors.heading, '1F2937');
  const accent = hex(design.colors.accent, '315C78');
  const border = design.layout.showMotif && design.layout.headingStyle !== 'plain' ? {
    ...(design.layout.headingStyle === 'bar' ? { left: { style: BorderStyle.SINGLE, size: Math.max(1, Math.round(design.layout.ruleWidth * 8)), color: accent, space: 2 } } : {}),
    bottom: { style: BorderStyle.SINGLE, size: Math.max(1, Math.round(design.layout.ruleWidth * 8)), color: accent, space: 2 },
  } : undefined;
  const heading = new Paragraph({
    heading: HeadingLevel.HEADING_2,
    pageBreakBefore: section.breakBefore,
    keepNext: true,
    spacing: { before: twips(design.layout.sectionGap), after: twips(3) },
    border,
    shading: design.layout.headingStyle === 'box' ? { fill: hex(design.colors.rail, 'F0F2F4') } : undefined,
    children: [new TextRun({ text: `${design.layout.headingStyle === 'numbered' ? `${sectionNumber}. ` : ''}${section.title}`, font: headingFont, bold: t.headingWeight === 700, size: Math.round(t.headingSize * 2), color: headingColor, allCaps: t.headingCase === 'uppercase', characterSpacing: twips(t.letterSpacing) })],
  });
  const output: Paragraph[] = [heading];
  const para = (text: string, options: { bold?: boolean; italic?: boolean; color?: string; breakBefore?: boolean; after?: number } = {}) => new Paragraph({
    pageBreakBefore: options.breakBefore,
    spacing: { after: twips(options.after ?? design.layout.entryGap), line: Math.round(t.lineHeight * 240) },
    children: [new TextRun({ text, font, size: Math.round(t.bodySize * 2), bold: options.bold ?? t.bodyWeight === 700, color: options.color || ink, italics: options.italic, characterSpacing: twips(t.letterSpacing) })],
  });
  const entryBreak = (id: string) => design.breakBeforeEntries.includes(id);

  for (const e of section.entries) {
    if (section.kind === 'summary') {
      if (e.text) output.push(para(e.text, { after: 0, breakBefore: entryBreak(e.id) }));
      continue;
    }
    if (section.kind === 'skills') {
      output.push(new Paragraph({ pageBreakBefore: entryBreak(e.id), spacing: { after: twips(design.layout.bulletGap) }, children: [
        new TextRun({ text: `${e.title}: `, font: headingFont, bold: true, size: Math.round(t.roleSize * 2), color: headingColor, characterSpacing: twips(t.letterSpacing) }),
        new TextRun({ text: e.text || e.bullets.join(' · '), font, size: Math.round(t.bodySize * 2), bold: t.bodyWeight === 700, color: ink, characterSpacing: twips(t.letterSpacing) }),
      ] }));
      continue;
    }
    const experience = section.kind === 'experience';
    let breakPending = entryBreak(e.id);
    const pushLine = (text: string, options: { bold?: boolean; italic?: boolean; color?: string; after?: number } = {}) => {
      output.push(para(text, { ...options, breakBefore: breakPending }));
      breakPending = false;
    };
    const primary = e.title;
    const runs = primary ? [new TextRun({ text: primary, font: headingFont, size: Math.round(t.roleSize * 2), bold: true, color: ink, characterSpacing: twips(t.letterSpacing) })] : [];
    if (e.date && design.layout.dates === 'inline') runs.push(new TextRun({ text: `\t${e.date}`, font, size: Math.round(t.bodySize * 2), bold: t.bodyWeight === 700, color: accent, characterSpacing: twips(t.letterSpacing) }));
    const pageWidth = design.pageSize === 'A4' ? 11906 : 12240;
    const availableWidth = pageWidth - mmTwips(design.layout.margins.left + design.layout.margins.right);
    if (runs.length) {
      output.push(new Paragraph({ pageBreakBefore: breakPending, keepNext: Boolean(experience && e.subtitle), tabStops: [{ type: 'right', position: Math.max(500, availableWidth - 100) }], spacing: { before: twips(2), after: twips(1) }, children: runs }));
      breakPending = false;
    }
    if (e.subtitle) pushLine(e.subtitle, { color: experience ? accent : ink, after: 1 });
    if (e.date && design.layout.dates === 'below') pushLine(e.date, { color: accent, after: 1 });
    if (e.text) pushLine(e.text, { after: 1 });
    for (const bullet of e.bullets) {
      output.push(new Paragraph({
      pageBreakBefore: breakPending,
      bullet: design.layout.bullet === 'disc' ? { level: 0 } : undefined,
      indent: design.layout.bullet === 'none' ? undefined : { left: twips(12), hanging: twips(6) },
      spacing: { after: twips(design.layout.bulletGap), line: Math.round(t.lineHeight * 240) },
      children: [new TextRun({ text: design.layout.bullet === 'dash' ? `–  ${bullet}` : bullet, font, size: Math.round(t.bodySize * 2), bold: t.bodyWeight === 700, color: ink, characterSpacing: twips(t.letterSpacing) })],
      }));
      breakPending = false;
    }
  }
  return output;
}

/** Creates an editable, linear Word companion preserving the visible plan order. */
export function createResumeDesignDocxDocument(resume: CanonicalResume, design: ResumeDesignConfig) {
  const plan = buildResumeDocumentPlan(resume, design) as ResumeDocumentPlan;
  const d = plan.design;
  const rawInk = hex(d.colors.ink, '202124');
  const rawHeading = hex(d.colors.heading, '1F2937');
  const rawAccent = hex(d.colors.accent, '315C78');
  const safeDesign = { ...d, colors: { ...d.colors, ink: contrast(rawInk, 'FFFFFF') >= 4.5 ? `#${rawInk}` : '#202124', heading: contrast(rawHeading, 'FFFFFF') >= 3 ? `#${rawHeading}` : '#1F2937', accent: contrast(rawAccent, 'FFFFFF') >= 3 ? `#${rawAccent}` : '#315C78' } };
  const bodyFont = wordFont(d.typography.bodyFont);
  const headingFont = wordFont(d.typography.headingFont);
  const ink = safeDesign.colors.ink.slice(1).toUpperCase();
  const headingColor = safeDesign.colors.heading.slice(1).toUpperCase();
  const accent = safeDesign.colors.accent.slice(1).toUpperCase();
  const centered = d.layout.headerStyle === 'center';
  const titleBorder = d.layout.showMotif ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: accent, space: 3 } } : undefined;
  const paragraphs: Paragraph[] = [new Paragraph({
    alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: twips(3) }, border: titleBorder,
    children: [new TextRun({ text: plan.name, font: headingFont, bold: d.typography.headingWeight === 700, size: Math.round(d.typography.nameSize * 2), color: headingColor, characterSpacing: twips(d.typography.letterSpacing) })],
  })];
  if (plan.title) paragraphs.push(new Paragraph({ alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: twips(3) }, children: [new TextRun({ text: plan.title, font: headingFont, size: Math.round(d.typography.headingSize * 2), bold: d.typography.headingWeight === 700, color: accent, characterSpacing: twips(d.typography.letterSpacing) })] }));
  if (plan.contact.length) paragraphs.push(new Paragraph({ alignment: centered ? AlignmentType.CENTER : d.layout.headerStyle === 'split' ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: twips(d.layout.sectionGap) }, children: [new TextRun({ text: plan.contact.join('  |  '), font: bodyFont, size: Math.round(d.typography.contactSize * 2), bold: d.typography.bodyWeight === 700, color: ink, characterSpacing: twips(d.typography.letterSpacing) })] }));
  const visible = plan.sections.filter(section => section.visible);
  visible.forEach((section, index) => paragraphs.push(...sectionParagraphs(section, safeDesign, index + 1)));
  return new Document({ creator: plan.name || 'Resume author', title: `${plan.name} Resume`, sections: [{ properties: { page: {
    size: { width: d.pageSize === 'A4' ? 11906 : 12240, height: d.pageSize === 'A4' ? 16838 : 15840 },
    margin: { top: mmTwips(d.layout.margins.top), right: mmTwips(d.layout.margins.right), bottom: mmTwips(d.layout.margins.bottom), left: mmTwips(d.layout.margins.left) },
  } }, children: paragraphs }] });
}
const mmTwips = (mm: number) => Math.round(mm * 56.7);
function contrast(fg: string, bg: string) { const lum=(hexColor:string)=>{const rgb=hexColor.match(/.{2}/g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); }
export async function buildResumeDesignDocxBlob(resume: CanonicalResume, design: ResumeDesignConfig): Promise<Blob> { return Packer.toBlob(createResumeDesignDocxDocument(resume, design)); }
export async function buildResumeDesignDocxBuffer(resume: CanonicalResume, design: ResumeDesignConfig): Promise<Buffer> { return Packer.toBuffer(createResumeDesignDocxDocument(resume, design)); }
