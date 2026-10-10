/** Device recovery for the two-step Save & Track operation. Never imports unowned drafts. */
export interface ResumeTrackingRecovery {
  schemaVersion: 1;
  ownerId: string;
  inputKey: string;
  draftKey: string;
  idempotencyKey: string;
  company: string;
  versionName: string;
  draft: Record<string, any>;
  version: { id: string; metadata?: Record<string, any>; [key: string]: any } | null;
}
const TRACKING_IDENTITY_FIELDS = [
  'pageSize', 'targetPageCount', 'workspaceSource', 'documentVersionId', 'documentName',
  'documentOrigin', 'documentManualEdits', 'proofData', 'guardrailReport',
] as const;
export function stableResumeTrackingKey(value: unknown): string {
  const stable = (item: any): any => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, stable(item[key])])) : item;
  return JSON.stringify(stable(value));
}
function legacyResumeTrackingDraftKey(draft: Record<string, any>) {
  return stableResumeTrackingKey(['originalResume', 'morphedResume', 'buildResume', 'jobDescription', 'postingUrl', 'morphPercentage', 'selectedTemplateId', 'selectedPaletteId', 'mode', 'resumeReview'].map(key => draft[key] ?? null));
}
export function resumeTrackingDraftKey(draft: Record<string, any>) {
  const base = legacyResumeTrackingDraftKey(draft);
  // Old v1 device receipts omitted these fields. Keep their legacy key stable
  // for migration/read compatibility; any new snapshot that includes one binds
  // all of them, so changing document identity or presentation cannot reuse it.
  if (!TRACKING_IDENTITY_FIELDS.some(field => Object.prototype.hasOwnProperty.call(draft, field))) return base;
  return stableResumeTrackingKey([base, ...TRACKING_IDENTITY_FIELDS.map(field => draft[field] ?? null)]);
}
function storageKey(ownerId: string) { return `talent-resume-track-recovery:v1:${encodeURIComponent(ownerId)}`; }
export function readResumeTrackingRecovery(storage: Pick<Storage, 'getItem'>, ownerId: string): ResumeTrackingRecovery | null {
  const raw = storage.getItem(storageKey(ownerId));
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || value.schemaVersion !== 1 || value.ownerId !== ownerId || typeof value.inputKey !== 'string' || typeof value.draftKey !== 'string' || !/^[a-f0-9]{40}$/.test(value.idempotencyKey || '') || !value.draft || typeof value.draft !== 'object' || typeof value.company !== 'string' || typeof value.versionName !== 'string') return null;
  const expectedDraftKey = resumeTrackingDraftKey(value.draft);
  const legacyReadable = !TRACKING_IDENTITY_FIELDS.some(field => Object.prototype.hasOwnProperty.call(value.draft, field)) && legacyResumeTrackingDraftKey(value.draft) === value.draftKey;
  if (expectedDraftKey !== value.draftKey && !legacyReadable) return null;
  if (value.version && (typeof value.version.id !== 'string' || value.version.id !== `handoff_${value.idempotencyKey}` || (value.version.user_id && value.version.user_id !== ownerId))) return null;
  return value;
}
export function writeResumeTrackingRecovery(storage: Pick<Storage, 'setItem' | 'getItem'>, receipt: ResumeTrackingRecovery) {
  const serialized = JSON.stringify(receipt);
  storage.setItem(storageKey(receipt.ownerId), serialized);
  if (storage.getItem(storageKey(receipt.ownerId)) !== serialized) throw new Error('Recovery storage did not retain the draft.');
}
export function clearResumeTrackingRecovery(storage: Pick<Storage, 'removeItem'>, ownerId: string) { storage.removeItem(storageKey(ownerId)); }
export async function resumeTrackingIdempotencyKey(ownerId: string, inputKey: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ownerId}\n${inputKey}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
