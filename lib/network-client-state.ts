/** Captures request ownership and selection without retaining another account's data. */
export function networkRequestIsCurrent(start: { owner?: string; selection?: string | null }, current: { owner?: string; selection?: string | null }) {
  return Boolean(start.owner) && start.owner === current.owner && (start.selection === undefined || start.selection === current.selection);
}

/** Clear an interaction only after a confirmed save, and only if the draft still matches. */
export async function saveNetworkDraft<T>(draft: T, save: () => Promise<boolean>, current: () => T, clear: () => void) {
  const saved = await save();
  if (saved && JSON.stringify(draft) === JSON.stringify(current())) clear();
  return saved;
}
