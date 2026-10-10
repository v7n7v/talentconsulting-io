import {
  getContrastRatio,
  getRegisteredTemplate,
  resolveTemplateIdForSelection,
  type TemplateColors,
} from './catalog';
import { readResumeDesign, type ResumeDesignConfig } from '../resume-design';
import type { CanonicalResume } from '../resume-normalizer';

export interface PersistedResumeTemplateCarrier {
  template?: unknown;
  content?: unknown;
  metadata?: {
    designConfig?: unknown;
    workspace?: { presentation?: { design?: unknown } };
    template?: unknown;
    paletteId?: unknown;
    paletteColors?: unknown;
  } | null;
  skill_graph?: {
    template?: unknown;
    paletteId?: unknown;
    paletteColors?: unknown;
  } | null;
}

export function getPersistedResumeDesign(carrier: PersistedResumeTemplateCarrier, resume?: CanonicalResume): ResumeDesignConfig | null {
  const design = readResumeDesign(carrier.metadata?.workspace?.presentation?.design ?? carrier.metadata?.designConfig, resume);
  return design?.templateId === getPersistedResumeTemplateId(carrier) ? design : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getPersistedResumeTemplateId(carrier: PersistedResumeTemplateCarrier): string {
  const content = carrier.content && typeof carrier.content === 'object'
    ? carrier.content as { template?: unknown }
    : undefined;
  const raw = nonEmptyString(carrier.metadata?.template)
    || nonEmptyString(carrier.skill_graph?.template)
    || nonEmptyString(carrier.template)
    || nonEmptyString(content?.template);
  if (raw && getRegisteredTemplate(raw)) return raw;
  return resolveTemplateIdForSelection(raw);
}

export function getPersistedResumePaletteId(carrier: PersistedResumeTemplateCarrier): string | undefined {
  return nonEmptyString(carrier.metadata?.paletteId)
    || nonEmptyString(carrier.skill_graph?.paletteId);
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

function mostReadableNeutral(background: string): string {
  return getContrastRatio('#111827', background) >= getContrastRatio('#ffffff', background)
    ? '#111827'
    : '#ffffff';
}

function resolveMeaningfulColor(
  candidate: unknown,
  fallback: string,
  background: string,
): string {
  const normalizedCandidate = normalizeHex(candidate);
  if (normalizedCandidate && getContrastRatio(normalizedCandidate, background) >= 4.5) {
    return normalizedCandidate;
  }
  const normalizedFallback = normalizeHex(fallback);
  if (normalizedFallback && getContrastRatio(normalizedFallback, background) >= 4.5) {
    return normalizedFallback;
  }
  return mostReadableNeutral(background);
}

/**
 * Export palettes keep meaningful text roles readable without suppressing
 * harmless low-contrast decorative accents.
 */
export function getContrastSafeTemplateColors(
  candidate: unknown,
  defaults: TemplateColors,
): TemplateColors {
  const colors = candidate && typeof candidate === 'object'
    ? candidate as Partial<TemplateColors>
    : {};
  const background = normalizeHex(colors.background)
    ?? normalizeHex(defaults.background)
    ?? '#ffffff';
  return {
    primary: resolveMeaningfulColor(colors.primary, defaults.primary, background),
    accent: normalizeHex(colors.accent) ?? normalizeHex(defaults.accent) ?? '#64748b',
    text: resolveMeaningfulColor(colors.text, defaults.text, background),
    background,
  };
}

export function getPersistedResumePaletteColors(
  carrier: PersistedResumeTemplateCarrier,
): TemplateColors {
  const templateId = getPersistedResumeTemplateId(carrier);
  const defaults = getRegisteredTemplate(templateId)?.colors || {
    primary: '#082c4c',
    accent: '#1646b8',
    text: '#10213a',
    background: '#ffffff',
  };
  const stored = carrier.metadata?.paletteColors ?? carrier.skill_graph?.paletteColors;
  return getContrastSafeTemplateColors(stored, defaults);
}
