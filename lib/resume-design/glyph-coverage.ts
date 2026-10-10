import { Font } from '@react-pdf/renderer';
import type { CanonicalResume } from '@/lib/resume-normalizer';
import { buildResumeDocumentPlan, getApplicationResumeDesign } from './index';
import { registerResumeDesignFonts, resumeFontFamily } from './fonts';
import { RESUME_FONTS, type ResumeDesignConfig, type ResumeFontId } from './types';

interface TextRun { label: string; text: string; font: ResumeFontId; weight: 400 | 700 }

/** Check only text that will be exported, using the actual selected font face. */
export async function assertResumeGlyphCoverage(resume: CanonicalResume, design: ResumeDesignConfig, mode: 'designed' | 'application' = 'designed'): Promise<void> {
  registerResumeDesignFonts();
  const plan = buildResumeDocumentPlan(resume, design);
  const d = mode === 'application' ? getApplicationResumeDesign(plan.design) : plan.design;
  const runs: TextRun[] = [
    { label: 'Name', text: plan.name, font: d.typography.headingFont, weight: d.typography.headingWeight },
    { label: 'Title', text: plan.title, font: d.typography.headingFont, weight: d.typography.headingWeight },
    { label: 'Contact details', text: plan.contact.join(' '), font: d.typography.bodyFont, weight: d.typography.bodyWeight },
  ];
  if (d.continuationHeader) runs.push({ label:'Continuation heading',text:`${plan.name} ${plan.title}`,font:d.typography.headingFont,weight:400 });
  for (const section of plan.sections) {
    const t = { ...d.typography, ...section.typography };
    runs.push({ label: section.title, text: t.headingCase === 'uppercase' ? section.title.toUpperCase() : section.title, font: t.headingFont, weight: t.headingWeight });
    for (const entry of section.entries) {
      runs.push({ label: section.title, text: entry.title, font: t.headingFont, weight: 700 });
      runs.push({ label: section.title, text: [entry.subtitle, entry.date, entry.text, ...entry.bullets].filter(Boolean).join(' '), font: t.bodyFont, weight: t.bodyWeight });
    }
  }
  const faces = new Map<string, ReturnType<typeof Font.getFont>>();
  for (const run of runs) {
    if (!run.text) continue;
    const key = `${run.font}:${run.weight}`;
    if (!faces.has(key)) faces.set(key, Font.getFont({ fontFamily: resumeFontFamily(run.font), fontWeight: run.weight }));
  }
  await Promise.all([...faces.values()].map(async face => {
    try { await face.load(); }
    catch (error) { face.loadResultPromise = null; throw error; }
  }));
  for (const run of runs) {
    if (!run.text) continue;
    const face = faces.get(`${run.font}:${run.weight}`)!;
    const unsupported = [...new Set(Array.from(run.text).filter(character => !/\s/u.test(character) && !face.data?.hasGlyphForCodePoint(character.codePointAt(0)!)))];
    if (unsupported.length) {
      const fontName = RESUME_FONTS.find(font => font.id === run.font)?.label || run.font;
      throw new Error(`${fontName} cannot render ${unsupported.slice(0, 8).map(character => `“${character}”`).join(', ')} in ${run.label}. Choose a font that supports this text before exporting. Your original text has been kept.`);
    }
  }
}
