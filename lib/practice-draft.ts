export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function practiceDraftKey(owner: string | undefined, session: string, question: number) {
  if (!owner || !session || !Number.isInteger(question) || question < 0) return null;
  return `taco:practice-draft:v1:${encodeURIComponent(owner)}:${encodeURIComponent(session)}:${question}`;
}
export function readPracticeDraft(storage: DraftStorage, key: string | null): { text: string; error: boolean } {
  if (!key) return { text: '', error: false };
  try { return { text: storage.getItem(key) || '', error: false }; }
  catch { return { text: '', error: true }; }
}
export function savePracticeDraft(storage: DraftStorage, key: string | null, text: string): boolean {
  if (!key) return false;
  try { if (text) storage.setItem(key, text); else storage.removeItem(key); return true; }
  catch { return false; }
}
export function approvedPracticeStoryIds(ownedStories: Array<{ id: string }>, approvedIds: string[]) {
  const owned = new Set(ownedStories.map(story => story.id));
  return [...new Set(approvedIds)].filter(id => owned.has(id)).slice(0, 8);
}

export function practiceBrowserStorage(): DraftStorage {
  try { return window.localStorage; }
  catch { return { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); }, removeItem() { throw new Error('Storage unavailable'); } }; }
}
