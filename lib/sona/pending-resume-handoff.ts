'use client';

const STORAGE_KEY = 'talentconsulting.pendingSonaResume';
const HANDOFF_VERSION = 1;
const MAX_TEXT_CHARS = 50_000;
const MAX_FILE_NAME_CHARS = 140;
const MAX_AGE_MS = 30 * 60 * 1000;
const VALID_TYPES = new Set(['pdf', 'docx', 'doc', 'txt']);
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

export interface PendingSonaResume {
  version: 1;
  handoffId: string;
  text: string;
  fileName: string;
  sourceType: 'direct';
  characterCount: number;
  detectedType: 'pdf' | 'docx' | 'doc' | 'txt';
  createdAt: number;
  expiresAt: number;
}

function storage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function cancelExpiryTimer() {
  if (!expiryTimer) return;
  clearTimeout(expiryTimer);
  expiryTimer = null;
}

function scheduleExpiry(expiresAt: number, now = Date.now()) {
  cancelExpiryTimer();
  const delay = Math.max(0, expiresAt - now);
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      // Storage can become unavailable while the tab is open.
    }
  }, delay);
  if (typeof expiryTimer === 'object' && 'unref' in expiryTimer) {
    expiryTimer.unref();
  }
}

async function createHandoffId(text: string, fileName: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const input = new TextEncoder().encode(`${normalizeFileName(fileName)}\u0000${text.trim()}`);
  const digest = await subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function normalizeFileName(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_FILE_NAME_CHARS)
    : '';
}

function validate(value: unknown, now = Date.now()): PendingSonaResume | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const handoffId = typeof record.handoffId === 'string' && /^[a-f0-9]{40}$/.test(record.handoffId)
    ? record.handoffId
    : null;
  const text = typeof record.text === 'string' ? record.text.trim().slice(0, MAX_TEXT_CHARS) : '';
  const fileName = normalizeFileName(record.fileName);
  const detectedType = typeof record.detectedType === 'string' && VALID_TYPES.has(record.detectedType)
    ? record.detectedType as PendingSonaResume['detectedType']
    : null;
  const createdAt = Number(record.createdAt);
  const expiresAt = Number(record.expiresAt);
  if (record.version !== HANDOFF_VERSION
    || !handoffId
    || text.length < 20
    || !fileName
    || !detectedType
    || !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || createdAt > now + 60_000
    || expiresAt <= now
    || expiresAt - createdAt > MAX_AGE_MS) {
    return null;
  }
  return {
    version: HANDOFF_VERSION,
    handoffId,
    text,
    fileName,
    sourceType: 'direct',
    characterCount: text.length,
    detectedType,
    createdAt,
    expiresAt,
  };
}

export async function stagePendingSonaResume(input: {
  text: string;
  fileName: string;
  detectedType?: string | null;
}, now = Date.now()) {
  const handoffId = await createHandoffId(input.text, input.fileName);
  if (!handoffId) return false;
  const candidate = validate({
    version: HANDOFF_VERSION,
    handoffId,
    text: input.text,
    fileName: input.fileName,
    sourceType: 'direct',
    characterCount: input.text.trim().length,
    detectedType: input.detectedType,
    createdAt: now,
    expiresAt: now + MAX_AGE_MS,
  }, now);
  if (!candidate) return false;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(candidate));
    scheduleExpiry(candidate.expiresAt, now);
    return true;
  } catch {
    return false;
  }
}

export function readPendingSonaResume(now = Date.now()) {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pending = validate(JSON.parse(raw), now);
    if (!pending) {
      cancelExpiryTimer();
      target.removeItem(STORAGE_KEY);
      return null;
    }
    scheduleExpiry(pending.expiresAt, now);
    return pending;
  } catch {
    cancelExpiryTimer();
    try {
      target.removeItem(STORAGE_KEY);
    } catch {
      // Storage can become unavailable while the tab is open.
    }
    return null;
  }
}

export function consumePendingSonaResume(now = Date.now()) {
  const pending = readPendingSonaResume(now);
  if (!pending) return null;
  clearPendingSonaResume();
  return pending;
}

export function armPendingSonaResumeExpiry(now = Date.now()) {
  const target = storage();
  if (!target) return false;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return false;
    const pending = validate(JSON.parse(raw), now);
    if (!pending) {
      target.removeItem(STORAGE_KEY);
      return false;
    }
    scheduleExpiry(pending.expiresAt, now);
    return true;
  } catch {
    try {
      target.removeItem(STORAGE_KEY);
    } catch {
      // Storage is unavailable.
    }
    return false;
  }
}

export function clearPendingSonaResume() {
  cancelExpiryTimer();
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Session storage can be unavailable in hardened browsing modes.
  }
}
