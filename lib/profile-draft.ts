export type ProfileValues = { displayName: string; phone: string; bio: string };
export type ProfileDraft = { values: ProfileValues; dirty: Array<keyof ProfileValues> };
const memory = new Map<string, ProfileDraft | null>();
const fields: Array<keyof ProfileValues> = ['displayName', 'phone', 'bio'];
const key = (owner: string) => `taco:profile-draft:${owner}`;
export function readProfileDraft(owner: string): ProfileDraft | null {
  if (memory.has(owner)) return memory.get(owner) || null;
  try {
    const raw = localStorage.getItem(key(owner));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft?.values || !fields.every(field => typeof draft.values[field] === 'string') || !Array.isArray(draft.dirty)) return null;
    const value = { values: Object.fromEntries(fields.map(field => [field, draft.values[field]])) as ProfileValues, dirty: fields.filter(field => draft.dirty.includes(field)) };
    memory.set(owner, value); return value;
  } catch { return null; }
}
export function persistProfileDraft(owner: string, values: ProfileValues, baseline: ProfileValues): boolean {
  const dirty = fields.filter(field => values[field] !== baseline[field]);
  const draft = dirty.length ? { values, dirty } : null;
  memory.set(owner, draft);
  try { if (draft) localStorage.setItem(key(owner), JSON.stringify(draft)); else localStorage.removeItem(key(owner)); return true; }
  catch { return false; }
}
export function restoreProfileDraft(fresh: ProfileValues, draft: ProfileDraft | null): ProfileValues {
  const restored = { ...fresh };
  for (const field of draft?.dirty || []) restored[field] = draft!.values[field];
  return restored;
}
