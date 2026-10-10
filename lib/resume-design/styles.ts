import { normalizeResumeDesign } from './index';
import type { ResumeDesignConfig, ResumeDesignTypography } from './types';

export interface ResumeDesignStyle {
  id: string;
  name: string;
  design: Pick<ResumeDesignConfig, 'typography' | 'colors' | 'layout' | 'pageSize' | 'continuationHeader'>;
}
export interface ResumeDesignStylesRecord { version: 1; styles: ResumeDesignStyle[] }
export const MAX_RESUME_DESIGN_STYLES = 20;
export const MAX_RESUME_DESIGN_STYLE_NAME = 60;
const STYLE_STORAGE_PREFIX = 'resume-design-styles:v1:';

export function getResumeDesignStylesStorageKey(ownerId: string | null): string {
  return ownerId ? `${STYLE_STORAGE_PREFIX}owner:${encodeURIComponent(ownerId)}` : `${STYLE_STORAGE_PREFIX}guest-session`;
}

export function createResumeDesignStyle(name: string, design: ResumeDesignConfig, id = createStyleId()): ResumeDesignStyle {
  const canonical = normalizeResumeDesign(design, design.templateId);
  return {
    id,
    name: name.trim().slice(0, MAX_RESUME_DESIGN_STYLE_NAME),
    design: {
      typography: { ...canonical.typography },
      colors: { ...canonical.colors },
      layout: { ...canonical.layout, margins: { ...canonical.layout.margins } },
      pageSize: canonical.pageSize,
      continuationHeader: canonical.continuationHeader,
    },
  };
}

function createStyleId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `style-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function validateStyle(value: unknown): value is ResumeDesignStyle {
  if (!isObject(value) || !hasOnlyKeys(value, ['id', 'name', 'design']) || typeof value.id !== 'string' || !value.id.trim() || typeof value.name !== 'string' || !value.name.trim() || value.name.length > MAX_RESUME_DESIGN_STYLE_NAME || !isObject(value.design) || !hasOnlyKeys(value.design, ['typography', 'colors', 'layout', 'pageSize', 'continuationHeader'])) return false;
  const design = value.design;
  if (!isObject(design.typography) || !hasOnlyKeys(design.typography, ['bodyFont', 'headingFont', 'bodySize', 'headingSize', 'roleSize', 'bodyWeight', 'headingWeight', 'nameSize', 'contactSize', 'lineHeight', 'letterSpacing', 'headingCase']) || !isObject(design.colors) || !hasOnlyKeys(design.colors, ['paper', 'ink', 'heading', 'accent', 'rail', 'railInk']) || !isObject(design.layout) || !hasOnlyKeys(design.layout, ['columns', 'railSide', 'railWidth', 'margins', 'columnGap', 'sectionGap', 'entryGap', 'bulletGap', 'headerStyle', 'headingStyle', 'companyFirst', 'dates', 'bullet', 'ruleWidth', 'showMotif']) || !isObject(design.layout.margins) || !hasOnlyKeys(design.layout.margins, ['top', 'right', 'bottom', 'left'])) return false;
  if (design.pageSize !== 'A4' && design.pageSize !== 'LETTER' || typeof design.continuationHeader !== 'boolean') return false;
  const typography = design.typography as Record<string, unknown>;
  const fonts = ['inter', 'liberation-sans', 'liberation-serif', 'liberation-mono', 'dejavu-sans', 'dejavu-serif'];
  if (!fonts.includes(String(typography.bodyFont)) || !fonts.includes(String(typography.headingFont)) || !['normal', 'uppercase'].includes(String(typography.headingCase))) return false;
  if (typography.roleSize !== undefined && (typeof typography.roleSize !== 'number' || !Number.isFinite(typography.roleSize) || typography.roleSize < 6 || typography.roleSize > 24)) return false;
  if (typography.bodyWeight !== undefined && typography.bodyWeight !== 400 && typography.bodyWeight !== 700) return false;
  if (typography.headingWeight !== undefined && typography.headingWeight !== 400 && typography.headingWeight !== 700) return false;
  const typographyRanges: Record<string, [number, number]> = { bodySize:[6,24], headingSize:[7,30], nameSize:[12,60], contactSize:[6,18], lineHeight:[1,2.2], letterSpacing:[-.3,3] };
  for (const [key, [min, max]] of Object.entries(typographyRanges)) if (typeof typography[key] !== 'number' || !Number.isFinite(typography[key]) || (typography[key] as number) < min || (typography[key] as number) > max) return false;
  const colors = design.colors as Record<string, unknown>;
  for (const key of ['paper', 'ink', 'heading', 'accent', 'rail', 'railInk']) if (typeof colors[key] !== 'string' || !/^#[\da-f]{6}$/i.test(colors[key] as string)) return false;
  const layout = design.layout as Record<string, unknown>;
  if (![1, 2].includes(layout.columns as number) || !['left', 'right'].includes(String(layout.railSide)) || !['left', 'center', 'split', 'band'].includes(String(layout.headerStyle)) || !['plain', 'rule', 'box', 'bar', 'numbered'].includes(String(layout.headingStyle)) || !['inline', 'below'].includes(String(layout.dates)) || !['disc', 'dash', 'none'].includes(String(layout.bullet))) return false;
  const layoutRanges: Record<string, [number, number]> = { railWidth:[20,45], columnGap:[6,36], sectionGap:[0,30], entryGap:[0,24], bulletGap:[0,12], ruleWidth:[0,4] };
  for (const [key, [min, max]] of Object.entries(layoutRanges)) if (typeof layout[key] !== 'number' || !Number.isFinite(layout[key]) || (layout[key] as number) < min || (layout[key] as number) > max) return false;
  for (const key of ['top', 'right', 'bottom', 'left']) if (typeof (design.layout.margins as Record<string, unknown>)[key] !== 'number' || !Number.isFinite((design.layout.margins as Record<string, unknown>)[key]) || ((design.layout.margins as Record<string, number>)[key] < 5 || (design.layout.margins as Record<string, number>)[key] > 40)) return false;
  return typeof layout.companyFirst === 'boolean' && typeof layout.showMotif === 'boolean';
}

export function readResumeDesignStyles(raw: string | null): { record: ResumeDesignStylesRecord; error: string | null } {
  if (raw === null || raw === '') return { record: { version: 1, styles: [] }, error: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.styles)) return { record: { version: 1, styles: [] }, error: 'Saved styles use an unsupported or invalid format.' };
    if (parsed.styles.length > MAX_RESUME_DESIGN_STYLES || !parsed.styles.every(validateStyle)) return { record: { version: 1, styles: [] }, error: 'Saved styles could not be validated. You can clear this saved list and start again.' };
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const style of parsed.styles) {
      const normalizedName = style.name.trim().toLowerCase();
      if (ids.has(style.id) || names.has(normalizedName)) return { record: { version: 1, styles: [] }, error: 'Saved styles contain duplicate names or identifiers.' };
      ids.add(style.id); names.add(normalizedName);
    }
    return { record: { version: 1, styles: parsed.styles as ResumeDesignStyle[] }, error: null };
  } catch {
    return { record: { version: 1, styles: [] }, error: 'Saved styles could not be read. You can clear this saved list and start again.' };
  }
}

export function serializeResumeDesignStyles(styles: ResumeDesignStyle[]): string {
  if (styles.length > MAX_RESUME_DESIGN_STYLES) throw new Error(`You can save up to ${MAX_RESUME_DESIGN_STYLES} styles.`);
  const bounded = styles;
  if (!bounded.every(validateStyle)) throw new Error('Styles must have a valid name and design settings.');
  const names = bounded.map(style => style.name.trim().toLowerCase());
  const ids = bounded.map(style => style.id);
  if (new Set(names).size !== names.length || new Set(ids).size !== ids.length) throw new Error('Each saved style needs a unique name and identifier.');
  return JSON.stringify({ version: 1, styles: bounded });
}

export function addResumeDesignStyle(styles: ResumeDesignStyle[], style: ResumeDesignStyle, replaceExisting = false): { styles: ResumeDesignStyle[]; status: 'added' | 'replaced' | 'duplicate' | 'limit' } {
  const name = style.name.trim().toLowerCase();
  const existingIndex = styles.findIndex(item => item.name.trim().toLowerCase() === name);
  if (existingIndex >= 0) {
    if (!replaceExisting) return { styles, status: 'duplicate' };
    const next = [...styles];
    next[existingIndex] = { ...style, id: next[existingIndex].id };
    return { styles: next, status: 'replaced' };
  }
  if (styles.length >= MAX_RESUME_DESIGN_STYLES) return { styles, status: 'limit' };
  return { styles: [...styles, style], status: 'added' };
}

/** Applies only style tokens. Current content, section identity/order/visibility, and breaks stay owned by the résumé. */
export function applyResumeDesignStyle(current: ResumeDesignConfig, style: ResumeDesignStyle): ResumeDesignConfig {
  return normalizeResumeDesign({
    ...current,
    typography: { ...style.design.typography } as ResumeDesignTypography,
    colors: { ...style.design.colors },
    layout: { ...style.design.layout, margins: { ...style.design.layout.margins } },
    pageSize: style.design.pageSize,
    continuationHeader: style.design.continuationHeader,
    sections: current.sections.map(section => ({ ...section, region: section.region, typography: section.typography ? { ...section.typography } : undefined })),
    breakBeforeEntries: [...current.breakBeforeEntries],
  }, current.templateId);
}
