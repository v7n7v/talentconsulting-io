const INTERACTIVE = 'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"], [data-guidance-controls]';

export interface GuidanceShortcutEvent {
  target: EventTarget | null;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** Shared arbitration for tool action shortcuts; this helper never performs an action. */
export function isGuidanceShortcutBlocked(event: GuidanceShortcutEvent, activeRegion?: Element | null): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.keyCode === 229) return true;
  const target = event.target as Element | null;
  const doc = target?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (doc?.documentElement.hasAttribute('data-tool-guidance-open')) return true;
  if (typeof target?.closest !== 'function') return true;
  if (target.closest(INTERACTIVE)) return true;
  if (activeRegion && !activeRegion.contains(target)) return true;
  return Boolean(doc?.querySelector('[aria-modal="true"]:not([hidden])'));
}
