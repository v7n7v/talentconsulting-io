import { Font } from '@react-pdf/renderer';
import { RESUME_FONTS, type ResumeFontId } from './types';

const weights = ['Regular', 'Bold', 'Italic', 'BoldItalic'] as const;
const weightProps = [
  { fontWeight: 400 }, { fontWeight: 700 }, { fontStyle: 'italic' as const, fontWeight: 400 },
  { fontStyle: 'italic' as const, fontWeight: 700 },
];
let registered = false;

/** Register the bundled font files; Node rendering uses absolute local paths. */
export function registerResumeDesignFonts() {
  if (registered) return;
  const base = typeof window === 'undefined'
    ? `${process.cwd()}/public/fonts/resume`
    : '/fonts/resume';
  for (const font of RESUME_FONTS) {
    const availableWeights = font.id === 'inter' ? weights.slice(0, 3) : weights;
    const files = availableWeights.map((weight) => ({ src: `${base}/${font.file}-${weight}.ttf`, ...weightProps[weights.indexOf(weight)] }));
    Font.register({ family: font.family, fonts: files });
  }
  registered = true;
}

export function resumeFontFamily(id: ResumeFontId) {
  return RESUME_FONTS.find((font) => font.id === id)?.family || RESUME_FONTS[0].family;
}

export function resumeFontFile(id: ResumeFontId, weight: 'Regular' | 'Bold' = 'Regular') {
  const font = RESUME_FONTS.find((item) => item.id === id) || RESUME_FONTS[0];
  return `${typeof window === 'undefined' ? `${process.cwd()}/public/fonts/resume` : '/fonts/resume'}/${font.file}-${weight}.ttf`;
}
