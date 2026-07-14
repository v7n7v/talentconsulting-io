import {
  RESUME_MORPH_DEFAULT_MAX,
  RESUME_MORPH_FULL_UNLOCK,
} from '@/lib/resume-morph-safety';

export interface ResumeMorphAccess {
  requestedMorphPercentage: number;
  effectiveMorphPercentage: number;
  maxAllowedMorphPercentage: number;
  consentUsed: boolean;
  requiresMorphConsent: boolean;
  mode: 'manual' | 'automated';
}

export interface GuardrailBlockedChange {
  path: string;
  original: string;
  attempted: string;
  action: 'restored' | 'removed';
}

export interface ResumeMorphGuardrailReport {
  validatorVersion: string;
  protectedContractHash: string;
  requestedMorphPercentage: number;
  effectiveMorphPercentage: number;
  maxAllowedMorphPercentage: number;
  consentUsed: boolean;
  protectedFields: string[];
  blockedChanges: GuardrailBlockedChange[];
  blockedChangeCount: number;
  blockedChangesTruncated: boolean;
}

export const RESUME_MORPH_VALIDATOR_VERSION = '2026-07-10.7';
const MAX_REPORTED_BLOCKED_CHANGES = 100;
const blockedChangeTotals = new WeakMap<GuardrailBlockedChange[], number>();

const PROTECTED_FIELDS = [
  'education',
  'skills',
  'certifications',
  'licenses',
  'contact',
  'contactInfo',
  'personalInfo',
  'personalDetails',
  'identity',
  'summary',
  'numeric claims',
  'experience.company',
  'experience.role',
  'experience.duration',
  'experience.location',
  'experience.achievements',
  'experience.bullets',
  'workHistory',
  'workExperience',
  'employmentHistory',
  'projects',
  'publications',
  'awards',
];

const TOP_LEVEL_IDENTITY_KEYS = [
  'name',
  'title',
  'headline',
  'currentRole',
  'email',
  'phone',
  'location',
  'linkedin',
  'website',
  'address',
  'city',
  'state',
  'country',
];

const TOP_LEVEL_PROSE_KEYS = [
  'summary',
  'objective',
  'about',
  'professionalSummary',
  'profile',
];

const EXPERIENCE_IDENTITY_GROUPS = [
  ['company', 'organization', 'employer'],
  ['role', 'title', 'position', 'jobTitle'],
  ['duration', 'dates', 'period', 'startDate', 'endDate'],
  ['location'],
];

const EXPERIENCE_PROSE_KEYS = [
  'description',
  'summary',
  'details',
  'achievements',
  'bullets',
  'responsibilities',
];

const FACT_ARRAY_KEYS = [
  'education',
  'skills',
  'certifications',
  'licenses',
  'professionalLicenses',
  'projects',
  'publications',
  'awards',
  'volunteer',
  'languages',
];

const FACT_OBJECT_KEYS = [
  'contact',
  'contactInfo',
  'personalInfo',
  'personalDetails',
];

const EXPERIENCE_ARRAY_KEYS = [
  'experience',
  'workHistory',
  'workExperience',
  'employmentHistory',
];

const PRESENTATION_ONLY_KEYS = new Set([
  'template',
  'templateId',
  'layout',
  'sectionOrder',
  'theme',
  'colorway',
  'fontFamily',
]);

export const RESUME_MORPH_PROTECTED_CONTRACT = Object.freeze({
  topLevelIdentityKeys: TOP_LEVEL_IDENTITY_KEYS,
  topLevelProseKeys: TOP_LEVEL_PROSE_KEYS,
  factArrayKeys: FACT_ARRAY_KEYS,
  factObjectKeys: FACT_OBJECT_KEYS,
  experienceArrayKeys: EXPERIENCE_ARRAY_KEYS,
  experienceIdentityGroups: EXPERIENCE_IDENTITY_GROUPS,
  experienceProseKeys: EXPERIENCE_PROSE_KEYS,
  presentationOnlyKeys: Array.from(PRESENTATION_ONLY_KEYS),
  structurePolicy: 'source-shape-only',
  primitivePolicy: 'phrase-preserving-reorder-or-restore',
  numericPolicy: 'reject-unsupported-digits-and-number-words',
  outputPolicy: 'deep-frozen-terminal-output',
});

// Keep this literal so the deterministic guardrail remains browser-safe.
// The snapshot test requires an intentional fingerprint update when this contract changes.
export const RESUME_MORPH_PROTECTED_CONTRACT_HASH = 'db85e84bd5c5d2aa8a3f9aaed66cd7a2b35e32e317caccb8219b8c6054a5cb42';

function clampPercentage(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(10, Math.min(RESUME_MORPH_FULL_UNLOCK, Math.round(parsed)));
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function comparable(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  return JSON.stringify(value);
}

function printable(value: unknown) {
  const text = value === undefined ? 'undefined' : value === null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || value === '';
}

function recordChange(
  changes: GuardrailBlockedChange[],
  path: string,
  original: unknown,
  attempted: unknown,
  action: 'restored' | 'removed' = 'restored'
) {
  if (comparable(original) === comparable(attempted)) return;
  blockedChangeTotals.set(changes, (blockedChangeTotals.get(changes) || 0) + 1);
  if (changes.length >= MAX_REPORTED_BLOCKED_CHANGES) return;
  changes.push({
    path,
    original: printable(original),
    attempted: printable(attempted),
    action,
  });
}

function restoreTopLevelProtectedFields(original: any, target: any, changes: GuardrailBlockedChange[]) {
  for (const key of TOP_LEVEL_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(original || {}, key)) {
      recordChange(changes, key, original[key], target?.[key], 'restored');
      target[key] = clone(original[key]);
    } else if (!isBlank(target?.[key])) {
      recordChange(changes, key, undefined, target[key], 'removed');
      delete target[key];
    }
  }
}

function protectedExperienceKey(entry: any) {
  return [
    entry?.company || entry?.organization || entry?.employer || '',
    entry?.role || entry?.title || entry?.position || entry?.jobTitle || '',
    entry?.duration || entry?.dates || entry?.period || entry?.startDate || '',
    entry?.endDate || '',
  ].map((part) => String(part).toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
}

function restoreAliasGroup(originalEntry: any, targetEntry: any, aliases: string[], path: string, changes: GuardrailBlockedChange[]) {
  const originalHasAny = aliases.some((key) => Object.prototype.hasOwnProperty.call(originalEntry || {}, key));

  for (const key of aliases) {
    const fieldPath = `${path}.${key}`;
    if (Object.prototype.hasOwnProperty.call(originalEntry || {}, key)) {
      recordChange(changes, fieldPath, originalEntry[key], targetEntry?.[key], 'restored');
      targetEntry[key] = clone(originalEntry[key]);
    } else if (originalHasAny && !isBlank(targetEntry?.[key])) {
      recordChange(changes, fieldPath, undefined, targetEntry[key], 'removed');
      delete targetEntry[key];
    }
  }
}

function restoreExperience(original: any, target: any, key: string, changes: GuardrailBlockedChange[]) {
  if (!Object.prototype.hasOwnProperty.call(original || {}, key)) {
    if (Array.isArray(target?.[key]) ? target[key].length > 0 : !isBlank(target?.[key])) {
      recordChange(changes, key, undefined, target[key], 'removed');
    }
    delete target[key];
    return;
  }
  const originalExperience = Array.isArray(original?.[key]) ? original[key] : [];
  const targetExperience = Array.isArray(target?.[key]) ? target[key] : [];

  if (targetExperience.length > originalExperience.length) {
    recordChange(changes, key, `${originalExperience.length} entries`, `${targetExperience.length} entries`, 'removed');
  } else if (targetExperience.length < originalExperience.length) {
    recordChange(changes, key, `${originalExperience.length} entries`, `${targetExperience.length} entries`, 'restored');
  }

  const targetEntries = originalExperience.map((originalEntry: any, index: number) => (
    targetExperience[index] ? targetExperience[index] : clone(originalEntry)
  ));

  type ExperienceSource = { entry: any; index: number; key: string; used: boolean };

  const available: ExperienceSource[] = originalExperience.map((entry: any, index: number) => ({
    entry,
    index,
    key: protectedExperienceKey(entry),
    used: false,
  }));

  const guardedExperience = targetEntries.slice(0, originalExperience.length).map((targetEntry: any, index: number) => {
    const targetKey = protectedExperienceKey(targetEntry);
    const exactMatch = targetKey
      ? available.find((item: ExperienceSource) => !item.used && item.key && item.key === targetKey)
      : undefined;
    const source = exactMatch || available.find((item: ExperienceSource) => !item.used && item.index === index) || available[index];
    if (source) source.used = true;

    const guardedEntry = clone(targetEntry || {});
    const originalEntry = source?.entry || originalExperience[index] || {};

    for (const aliases of EXPERIENCE_IDENTITY_GROUPS) {
      restoreAliasGroup(originalEntry, guardedEntry, aliases, `${key}.${index}`, changes);
    }

    return guardedEntry;
  });

  target[key] = guardedExperience;
}

function restoreExactObject(original: any, target: any, key: string, changes: GuardrailBlockedChange[]) {
  if (!Object.prototype.hasOwnProperty.call(original || {}, key)) {
    if (!isBlank(target?.[key])) recordChange(changes, key, undefined, target[key], 'removed');
    delete target[key];
    return;
  }
  const originalValue = original?.[key] && typeof original[key] === 'object' ? original[key] : {};
  const targetValue = target?.[key] && typeof target[key] === 'object' ? target[key] : {};
  recordChange(changes, key, originalValue, targetValue, 'restored');
  target[key] = clone(originalValue);
}

function restoreExactArray(original: any, target: any, key: string, changes: GuardrailBlockedChange[]) {
  if (!Object.prototype.hasOwnProperty.call(original || {}, key)) {
    if (Array.isArray(target?.[key]) ? target[key].length > 0 : !isBlank(target?.[key])) {
      recordChange(changes, key, undefined, target[key], 'removed');
    }
    delete target[key];
    return;
  }
  const originalValue = Array.isArray(original?.[key]) ? original[key] : [];
  const targetValue = Array.isArray(target?.[key]) ? target[key] : [];
  recordChange(changes, key, originalValue, targetValue, originalValue.length ? 'restored' : 'removed');
  target[key] = clone(originalValue);
}

const NUMERIC_CLAIM_PATTERN = /(?:[$£€]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|x|k|m|b|thousand|million|billion|hours?|days?|weeks?|months?|years?|users?|customers?|people|members?))?/gi;
const NUMBER_WORD_CLAIM_PATTERN = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|hundred|thousand|million|billion|double|doubled|triple|tripled)(?:\s+(?:percent|times|hours?|days?|weeks?|months?|years?|users?|customers?|people|members?|engineers?|employees?|projects?|accounts?|applications?))?\b/gi;

function normalizeEvidenceUnit(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function evidenceUnits(value: string) {
  return value
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(normalizeEvidenceUnit)
    .filter(Boolean)
    .sort();
}

function isPhrasePreservingRewrite(original: string, target: string) {
  if (target === original) return true;
  if (!target.trim() && original.trim()) return false;
  const originalUnits = evidenceUnits(original);
  const targetUnits = evidenceUnits(target);
  return originalUnits.length === targetUnits.length
    && originalUnits.every((unit, index) => unit === targetUnits[index]);
}

function isExactStringPermutation(original: unknown[], target: unknown[]) {
  if (!original.every((item) => typeof item === 'string')
    || !target.every((item) => typeof item === 'string')
    || original.length !== target.length) {
    return false;
  }
  const source = original.map((item) => normalizeEvidenceUnit(String(item))).sort();
  const attempted = target.map((item) => normalizeEvidenceUnit(String(item))).sort();
  return source.every((item, index) => item === attempted[index]);
}

function numericClaims(value: string | number) {
  const text = String(value);
  return [
    ...(text.match(NUMERIC_CLAIM_PATTERN) || []),
    ...(text.match(NUMBER_WORD_CLAIM_PATTERN) || []),
  ].map((claim) => claim.toLowerCase().replace(/[\s,]+/g, ''));
}

function alignToOriginalStructure(
  original: unknown,
  target: unknown,
  path: string,
  changes: GuardrailBlockedChange[],
): unknown {
  if (Array.isArray(original)) {
    const targetItems = Array.isArray(target) ? target : [];
    if (isExactStringPermutation(original, targetItems)) return clone(targetItems);
    if (targetItems.length > original.length) {
      recordChange(changes, path || 'resume', `${original.length} entries`, `${targetItems.length} entries`, 'removed');
    }
    if (!Array.isArray(target) || targetItems.length < original.length) {
      recordChange(changes, path || 'resume', `${original.length} entries`, Array.isArray(target) ? `${targetItems.length} entries` : target, 'restored');
    }
    return original.map((item, index) => alignToOriginalStructure(
      item,
      targetItems[index],
      `${path}[${index}]`,
      changes,
    ));
  }

  if (original && typeof original === 'object') {
    const originalRecord = original as Record<string, unknown>;
    const targetRecord = target && typeof target === 'object' && !Array.isArray(target)
      ? target as Record<string, unknown>
      : {};
    const aligned: Record<string, unknown> = {};

    for (const key of Object.keys(targetRecord)) {
      if (!Object.prototype.hasOwnProperty.call(originalRecord, key)) {
        recordChange(changes, path ? `${path}.${key}` : key, undefined, targetRecord[key], 'removed');
      }
    }
    for (const key of Object.keys(originalRecord)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(targetRecord, key)) {
        recordChange(changes, fieldPath, originalRecord[key], undefined, 'restored');
        aligned[key] = clone(originalRecord[key]);
        continue;
      }
      aligned[key] = alignToOriginalStructure(
        originalRecord[key],
        targetRecord[key],
        fieldPath,
        changes,
      );
    }
    return aligned;
  }

  if (target === undefined || target === null || typeof target !== typeof original) {
    recordChange(changes, path || 'resume', original, target, 'restored');
    return clone(original);
  }

  const fieldName = path.replace(/\[\d+\]/g, '').split('.').filter(Boolean).pop() || '';
  if (PRESENTATION_ONLY_KEYS.has(fieldName)) return clone(target);
  if (typeof original === 'string' && typeof target === 'string'
    && isPhrasePreservingRewrite(original, target)) {
    return clone(target);
  }
  recordChange(changes, path || 'resume', original, target, 'restored');
  return clone(original);
}

function collectNumericClaims(value: unknown, claims = new Set<string>()) {
  if (typeof value === 'string' || typeof value === 'number') {
    for (const claim of numericClaims(value)) claims.add(claim);
    return claims;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumericClaims(item, claims);
    return claims;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectNumericClaims(item, claims);
  }
  return claims;
}

function restoreUnsupportedNumericClaims(
  original: unknown,
  target: unknown,
  path: string,
  changes: GuardrailBlockedChange[],
): unknown {
  if (typeof target === 'string' || typeof target === 'number') {
    const allowedClaims = collectNumericClaims(original);
    const unsupported = numericClaims(target).filter((claim) => !allowedClaims.has(claim));
    if (unsupported.length === 0) return target;

    const replacement = typeof original === typeof target ? clone(original) : undefined;
    recordChange(changes, path || 'resume', replacement, target, replacement === undefined ? 'removed' : 'restored');
    return replacement;
  }

  if (Array.isArray(target)) {
    const originalItems = Array.isArray(original) ? original : [];
    return target
      .map((item, index) => restoreUnsupportedNumericClaims(
        originalItems[index],
        item,
        `${path}[${index}]`,
        changes,
      ))
      .filter((item) => item !== undefined);
  }

  if (target && typeof target === 'object') {
    const originalRecord = original && typeof original === 'object' && !Array.isArray(original)
      ? original as Record<string, unknown>
      : {};
    const guardedRecord = clone(target) as Record<string, unknown>;

    for (const key of Object.keys(guardedRecord)) {
      const guardedValue = restoreUnsupportedNumericClaims(
        originalRecord[key],
        guardedRecord[key],
        path ? `${path}.${key}` : key,
        changes,
      );
      if (guardedValue === undefined) delete guardedRecord[key];
      else guardedRecord[key] = guardedValue;
    }
    return guardedRecord;
  }

  return target;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function resolveResumeMorphAccess(input: {
  requestedMorphPercentage?: number;
  hasFullConsent: boolean;
  mode: 'manual' | 'automated';
}): ResumeMorphAccess {
  const requestedMorphPercentage = clampPercentage(input.requestedMorphPercentage ?? 50);
  const maxAllowedMorphPercentage = input.hasFullConsent ? RESUME_MORPH_FULL_UNLOCK : RESUME_MORPH_DEFAULT_MAX;
  const requiresMorphConsent = input.mode === 'manual'
    && requestedMorphPercentage > RESUME_MORPH_DEFAULT_MAX
    && !input.hasFullConsent;
  const effectiveMorphPercentage = input.mode === 'automated' || !requiresMorphConsent
    ? Math.min(requestedMorphPercentage, maxAllowedMorphPercentage)
    : RESUME_MORPH_DEFAULT_MAX;

  return {
    requestedMorphPercentage,
    effectiveMorphPercentage,
    maxAllowedMorphPercentage,
    consentUsed: input.hasFullConsent && requestedMorphPercentage > RESUME_MORPH_DEFAULT_MAX,
    requiresMorphConsent,
    mode: input.mode,
  };
}

export function applyResumeMorphGuardrails(
  originalResume: any,
  morphedResume: any,
  access: ResumeMorphAccess
): { resume: any; report: ResumeMorphGuardrailReport } {
  const original = clone(originalResume || {});
  const blockedChanges: GuardrailBlockedChange[] = [];
  const guarded = alignToOriginalStructure(original, morphedResume || {}, '', blockedChanges) as Record<string, unknown>;

  restoreTopLevelProtectedFields(original, guarded, blockedChanges);
  for (const key of FACT_ARRAY_KEYS) restoreExactArray(original, guarded, key, blockedChanges);
  for (const key of FACT_OBJECT_KEYS) restoreExactObject(original, guarded, key, blockedChanges);
  for (const key of EXPERIENCE_ARRAY_KEYS) restoreExperience(original, guarded, key, blockedChanges);
  const numericGuarded = restoreUnsupportedNumericClaims(
    original,
    guarded,
    '',
    blockedChanges,
  ) as Record<string, unknown>;
  const blockedChangeCount = blockedChangeTotals.get(blockedChanges) || blockedChanges.length;

  return {
    resume: deepFreeze(numericGuarded),
    report: {
      validatorVersion: RESUME_MORPH_VALIDATOR_VERSION,
      protectedContractHash: RESUME_MORPH_PROTECTED_CONTRACT_HASH,
      requestedMorphPercentage: access.requestedMorphPercentage,
      effectiveMorphPercentage: access.effectiveMorphPercentage,
      maxAllowedMorphPercentage: access.maxAllowedMorphPercentage,
      consentUsed: access.consentUsed,
      protectedFields: PROTECTED_FIELDS,
      blockedChanges,
      blockedChangeCount,
      blockedChangesTruncated: blockedChangeCount > blockedChanges.length,
    },
  };
}

export function isCurrentResumeMorphGuardrailReport(value: unknown): value is ResumeMorphGuardrailReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<ResumeMorphGuardrailReport>;
  return report.validatorVersion === RESUME_MORPH_VALIDATOR_VERSION
    && report.protectedContractHash === RESUME_MORPH_PROTECTED_CONTRACT_HASH
    && Array.isArray(report.protectedFields)
    && Array.isArray(report.blockedChanges)
    && typeof report.blockedChangeCount === 'number'
    && Number.isInteger(report.blockedChangeCount)
    && typeof report.blockedChangesTruncated === 'boolean'
    && report.blockedChangeCount >= report.blockedChanges.length
    && report.blockedChangesTruncated === (report.blockedChangeCount > report.blockedChanges.length)
    && Number.isFinite(report.effectiveMorphPercentage)
    && Number.isFinite(report.maxAllowedMorphPercentage);
}
