import type { ResumeFontId } from './types';
import { measureBundledText } from './font-metrics';

/** Break only tokens whose actual bundled-face advance exceeds their measure. */
export function wrapLongTokens(
  value: string,
  maxLineWidthPt: number,
  fontSizePt: number,
  font: ResumeFontId,
  weight: 400 | 700,
  letterSpacingPt = 0,
) {
  const graphemes = (text: string) => typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment)
    : Array.from(text);
  const spacing = Math.max(0, letterSpacingPt);
  return value.split(/(\s+)/u).map((part) => {
    if (!part || /^\s+$/u.test(part)) return part;
    const units = graphemes(part);
    if (measureBundledText(font, weight, part, fontSizePt, letterSpacingPt) <= maxLineWidthPt) return part;
    // Keep an emergency line below its exact measured limit. React-PDF can
    // add a discretionary break width at a line end even when hyphenation is
    // disabled, so this prevents the final glyph from being pushed outside.
    const chunkWidthPt = Math.max(0, maxLineWidthPt - fontSizePt * 0.5);
    const lines: string[] = [];
    let line = '';
    let lineWidth = 0;
    for (const unit of units) {
      const unitWidth = measureBundledText(font, weight, unit, fontSizePt);
      const nextWidth = lineWidth + unitWidth + (line ? spacing : 0);
      if (line && nextWidth > chunkWidthPt) {
        lines.push(line);
        line = unit;
        lineWidth = unitWidth;
      } else {
        line += unit;
        lineWidth = nextWidth;
      }
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }).join('');
}

/** Contacts share short rows; only source whitespace separates them, with no breakable punctuation. */
export function wrapContactLines(values: string[], width: number, size: number, font: ResumeFontId, weight: 400 | 700, tracking = 0) {
  const lines: string[] = [];
  let line = '';
  const measure = Math.max(0, width - size * 0.5);
  for (const value of values) {
    const wrapped = wrapLongTokens(value, measure, size, font, weight, tracking);
    if (wrapped.includes('\n')) {
      if (line) lines.push(line);
      line = ''; lines.push(wrapped); continue;
    }
    const candidate = line ? `${line}   ${wrapped}` : wrapped;
    if (line && measureBundledText(font, weight, candidate, size, tracking) > measure) { lines.push(line); line = wrapped; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
