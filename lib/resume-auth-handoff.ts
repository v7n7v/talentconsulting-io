import { resumeDraftStorageKey } from './resume-intake';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function previousResumeDraftKey(uid: string) {
  return `${resumeDraftStorageKey(uid)}:before-sign-in`;
}

// Called only by the successful sign-in callback for an anonymous studio.
// Account switches never invoke this handoff. Keep an existing tab draft recoverable.
export function handoffGuestResumeDraft(storage: DraftStorage, uid: string, draft: unknown) {
  const key = resumeDraftStorageKey(uid);
  if (!key) throw new Error('Sign in before keeping this resume.');
  const incoming = JSON.stringify(draft);
  const previous = storage.getItem(key);
  if (previous && previous !== incoming) storage.setItem(previousResumeDraftKey(uid), previous);
  storage.setItem(key, incoming);
}

export function restorePreviousResumeDraft(storage: DraftStorage, uid: string) {
  const key = resumeDraftStorageKey(uid);
  if (!key) return false;
  const previousKey = previousResumeDraftKey(uid);
  const previous = storage.getItem(previousKey);
  if (!previous) return false;
  JSON.parse(previous); // A corrupt backup must not replace a usable active draft.
  const current = storage.getItem(key);
  storage.setItem(key, previous);
  try {
    // Swap so both drafts stay recoverable if the user wants to go back again.
    storage.setItem(previousKey, current || previous);
  } catch (error) {
    if (current) storage.setItem(key, current);
    throw error;
  }
  return true;
}
