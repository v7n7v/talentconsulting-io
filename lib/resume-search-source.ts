/** Immutable, explicitly confirmed source contract for role search. */

import type { CanonicalResume } from './resume-normalizer';

export type { CanonicalResume } from './resume-normalizer';

export type SearchSourceOrigin = 'user_upload' | 'user_authored';

export interface SearchSourceWorkspace {
  schemaVersion: 2;
  kind: 'source';
  purpose: 'role_search';
  origin: SearchSourceOrigin;
  sourceVersionId: string;
  sourceHash: string;
  contentHash: string;
  sourceConfirmedAt: string;
}

export interface SearchSourceReceipt {
  schemaVersion: 1;
  ownerId: string;
  sourceId: string;
  requestId: string;
  contentHash: string;
  packetHash: string;
  payloadHash: string;
  confirmedAt: string;
  contentHashEncoding: 'sha256-stable-json-v1';
  hashEncoding: 'sha256-json-stringify-v1';
}

export interface ConfirmSearchSourceRequest {
  requestId: string;
  confirmedContent: CanonicalResume;
  origin: SearchSourceOrigin;
  intake?: {
    fileName?: string;
    sourceType?: string;
    rawText?: string;
    parserVersion?: string;
    warnings?: string[];
    acknowledgedWarnings?: boolean;
  };
}

export class SearchSourceValidationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'SearchSourceValidationError';
    this.code = code;
    this.status = status;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,180}$/;
const HASH = /^[a-f0-9]{64}$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function fail(message: string): never {
  throw new SearchSourceValidationError('INVALID_SEARCH_SOURCE', message);
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function assertKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[] = []): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail('Hostile object key is not allowed');
    if (!allowed.includes(key)) fail('Unknown field is not allowed');
  }
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`Missing field: ${key}`);
}
function stringField(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('Text contains an unsupported character. Replace it and confirm the résumé again.');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      fail('Text contains an unsupported character. Replace it and confirm the résumé again.');
    }
  }
  if (value.length > max) fail(`${label} exceeds the ${max} character limit`);
  return value;
}
function stringArray(value: unknown, label: string, maxLength = 1000): string[] {
  if (!Array.isArray(value) || value.length > 1000) fail(`${label} must be an array of at most 1000 strings`);
  return Array.from({ length: value.length }, (_, index) => stringField(value[index], `${label}[${index}]`, maxLength));
}
function entries<T>(value: unknown, label: string, required: readonly string[], optional: readonly string[], parse: (item: Record<string, unknown>, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) fail(`${label} must contain at most 1000 entries`);
  return Array.from({ length: value.length }, (_, index) => {
    const raw = value[index];
    if (!isPlainObject(raw)) fail(`${label}[${index}] must be an object`);
    assertKeys(raw, [...required, ...optional], required);
    return parse(raw, index);
  });
}

/** Validate without cleaning, trimming, synthesizing ids, or coercing source facts. */
export function normalizeConfirmedSource(value: unknown): CanonicalResume {
  if (!isPlainObject(value)) fail('confirmedContent must be a plain object');
  const required = ['name', 'title', 'email', 'phone', 'location', 'summary', 'experience', 'education', 'skills', 'certifications'];
  const optional = ['linkedin', 'website', 'links', 'additionalSections'];
  assertKeys(value, [...required, ...optional], required);
  const content: Record<string, unknown> = {
    name: stringField(value.name, 'name', 1000), title: stringField(value.title, 'title', 1000),
    email: stringField(value.email, 'email', 1000), phone: stringField(value.phone, 'phone', 1000),
    location: stringField(value.location, 'location', 1000), summary: stringField(value.summary, 'summary', 100000),
    experience: entries(value.experience, 'experience', ['company', 'role', 'duration', 'achievements'], ['id'], (item, index) => ({
      ...(item.id === undefined ? {} : { id: stringField(item.id, `experience[${index}].id`, 1000) }),
      company: stringField(item.company, `experience[${index}].company`, 1000),
      role: stringField(item.role, `experience[${index}].role`, 1000),
      duration: stringField(item.duration, `experience[${index}].duration`, 1000),
      achievements: stringArray(item.achievements, `experience[${index}].achievements`, 10000),
    })),
    education: entries(value.education, 'education', ['degree', 'institution', 'year'], ['id', 'details'], (item, index) => ({
      ...(item.id === undefined ? {} : { id: stringField(item.id, `education[${index}].id`, 1000) }),
      degree: stringField(item.degree, `education[${index}].degree`, 1000),
      institution: stringField(item.institution, `education[${index}].institution`, 1000),
      year: stringField(item.year, `education[${index}].year`, 1000),
      ...(item.details === undefined ? {} : { details: stringField(item.details, `education[${index}].details`, 1000) }),
    })),
    skills: entries(value.skills, 'skills', ['category', 'items'], ['id'], (item, index) => ({
      ...(item.id === undefined ? {} : { id: stringField(item.id, `skills[${index}].id`, 1000) }),
      category: stringField(item.category, `skills[${index}].category`, 1000),
      items: stringArray(item.items, `skills[${index}].items`),
    })),
    certifications: stringArray(value.certifications, 'certifications'),
  };
  for (const key of ['linkedin', 'website'] as const) if (value[key] !== undefined) content[key] = stringField(value[key], key, 1000);
  if (value.links !== undefined) content.links = stringArray(value.links, 'links', 1000);
  if (value.additionalSections !== undefined) content.additionalSections = entries(value.additionalSections, 'additionalSections', ['id', 'title', 'items'], [], (item, index) => ({
    id: stringField(item.id, `additionalSections[${index}].id`, 1000),
    title: stringField(item.title, `additionalSections[${index}].title`, 1000),
    items: stringArray(item.items, `additionalSections[${index}].items`),
  }));
  if (!hasCanonicalSourceFact(content as unknown as CanonicalResume)) fail('confirmedContent must contain at least one non-empty source fact');
  const normalized = sortPlainJson(content) as CanonicalResume;
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > 500000) fail('confirmedContent exceeds the 500000 byte limit');
  return normalized;
}

function hasCanonicalSourceFact(content: CanonicalResume): boolean {
  const populated = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  return [content.name, content.title, content.email, content.phone, content.location, content.summary, content.linkedin, content.website].some(populated)
    || content.experience.some(item => [item.company, item.role, item.duration, ...item.achievements].some(populated))
    || content.education.some(item => [item.degree, item.institution, item.year, item.details].some(populated))
    || content.skills.some(item => item.items.some(populated))
    || content.certifications.some(populated) || content.links?.some(populated) === true
    || content.additionalSections?.some(item => item.items.some(populated)) === true;
}

function sortPlainJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPlainJson);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) out[key] = sortPlainJson(value[key]);
  }
  return out;
}

/** Same key order and undefined-to-null semantics as stableWorkspaceContentHash. */
export function stableSourceStringify(value: unknown): string {
  if (value === undefined || value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(stableSourceStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableSourceStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

export function parseConfirmSearchSourceRequest(value: unknown): ConfirmSearchSourceRequest {
  if (!isPlainObject(value)) fail('Request must be a plain object');
  assertKeys(value, ['requestId', 'confirmedContent', 'origin', 'intake'], ['requestId', 'confirmedContent', 'origin']);
  if (typeof value.requestId !== 'string' || !UUID.test(value.requestId)) fail('requestId must be a UUID');
  if (value.origin !== 'user_upload' && value.origin !== 'user_authored') fail('origin is invalid');
  const confirmedContent = normalizeConfirmedSource(value.confirmedContent);
  const request: ConfirmSearchSourceRequest = { requestId: value.requestId.toLowerCase(), confirmedContent, origin: value.origin };
  if (value.intake !== undefined) {
    if (!isPlainObject(value.intake)) fail('intake must be an object');
    const intake = value.intake;
    assertKeys(intake, ['fileName', 'sourceType', 'rawText', 'parserVersion', 'warnings', 'acknowledgedWarnings']);
    const parsed: NonNullable<ConfirmSearchSourceRequest['intake']> = {};
    for (const key of ['fileName', 'sourceType', 'rawText', 'parserVersion'] as const) if (intake[key] !== undefined) parsed[key] = stringField(intake[key], `intake.${key}`, key === 'rawText' ? 100000 : 1000);
    if (intake.warnings !== undefined) parsed.warnings = stringArray(intake.warnings, 'intake.warnings', 1000);
    if (intake.acknowledgedWarnings !== undefined) {
      if (typeof intake.acknowledgedWarnings !== 'boolean') fail('intake.acknowledgedWarnings must be a boolean');
      parsed.acknowledgedWarnings = intake.acknowledgedWarnings;
    }
    if (parsed.warnings?.length && parsed.acknowledgedWarnings !== true) fail('intake warnings require acknowledgedWarnings=true');
    request.intake = parsed;
  }
  const requestBytes = new TextEncoder().encode(JSON.stringify(request)).byteLength;
  if (requestBytes > 800000) fail('Request exceeds the 800000 byte limit');
  return request;
}

export function createSearchSourceWorkspace(input: { sourceId: string; origin: SearchSourceOrigin; contentHash: string; confirmedAt: string }): SearchSourceWorkspace {
  if (!input || typeof input.sourceId !== 'string' || !SOURCE_ID.test(input.sourceId)
    || (input.origin !== 'user_upload' && input.origin !== 'user_authored')
    || !HASH.test(input.contentHash) || !isValidDate(input.confirmedAt)) fail('Invalid source workspace values');
  return { schemaVersion: 2, kind: 'source', purpose: 'role_search', origin: input.origin, sourceVersionId: input.sourceId, sourceHash: input.contentHash, contentHash: input.contentHash, sourceConfirmedAt: input.confirmedAt };
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function isNoGeneratedMarkers(data: Record<string, unknown>): boolean {
  const markerKeys = new Set([
    'guardrail_report', 'morph_guardrail_report', 'morph_effective_percentage', 'guardrailReport', 'proofScore',
    'proof_score', 'proofReport', 'proof_report', 'packetProof', 'packet_proof', 'generatedBy', 'generated_by', 'skill_graph', 'skillGraph',
  ]);
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return true;
    if (Array.isArray(value)) return value.every(walk);
    for (const [key, item] of Object.entries(value)) {
      if (markerKeys.has(key)) return false;
      if (key === 'source' && typeof item === 'string' && /morph|optimi[sz]e|tailor|agent|generated|packet|auto_fix|nightly|apply_pipeline/i.test(item)) return false;
      if (key === 'savedFrom' && typeof item === 'string' && /morph|optimi[sz]e/i.test(item)) return false;
      if (key === 'mode' && typeof item === 'string' && /agent|morph/i.test(item)) return false;
      if (!walk(item)) return false;
    }
    return true;
  };
  return walk(data);
}

export function isSearchSourceWorkspace(value: unknown): value is SearchSourceWorkspace {
  if (!isPlainObject(value)) return false;
  return value.schemaVersion === 2 && value.kind === 'source' && value.purpose === 'role_search'
    && (value.origin === 'user_upload' || value.origin === 'user_authored')
    && typeof value.sourceVersionId === 'string' && SOURCE_ID.test(value.sourceVersionId)
    && typeof value.sourceHash === 'string' && HASH.test(value.sourceHash)
    && value.contentHash === value.sourceHash && isValidDate(value.sourceConfirmedAt);
}

export function isSearchSourceRecord(data: unknown): boolean {
  if (!isPlainObject(data) || typeof data.id !== 'string' || !SOURCE_ID.test(data.id) || typeof data.user_id !== 'string' || !data.user_id) return false;
  const metadata = data.metadata;
  if (!isPlainObject(metadata) || !isSearchSourceWorkspace(metadata.workspace)) return false;
  const receipt = data.source_confirmation_receipt;
  if (!isPlainObject(receipt)) return false;
  const workspace = metadata.workspace as SearchSourceWorkspace;
  return receipt.schemaVersion === 1 && receipt.ownerId === data.user_id && receipt.sourceId === data.id
    && workspace.sourceVersionId === data.id
    && receipt.contentHash === workspace.contentHash && receipt.confirmedAt === workspace.sourceConfirmedAt
    && receipt.contentHashEncoding === 'sha256-stable-json-v1' && receipt.hashEncoding === 'sha256-json-stringify-v1'
    && [receipt.contentHash, receipt.packetHash, receipt.payloadHash].every(hash => typeof hash === 'string' && HASH.test(hash))
    && typeof receipt.requestId === 'string' && UUID.test(receipt.requestId)
    && data.is_active !== false && data.archived !== true && metadata.archived !== true && data.status !== 'archived'
    && isNoGeneratedMarkers(data);
}
