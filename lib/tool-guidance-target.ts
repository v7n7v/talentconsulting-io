import { guidanceScrollPlan, type GuidanceRect } from './tool-guidance-geometry';

/** Only connected, visible semantic anchors may be highlighted. */
export function isGuidanceTargetVisible(element: HTMLElement, view: Window): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.getClientRects().length === 0) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    if (style.contentVisibility === 'hidden') return false;
  }
  return true;
}

export function resolveGuidanceTarget(root: Document, anchor?: string, surface?: HTMLElement | null): HTMLElement | null {
  if (!anchor || !root.defaultView) return null;
  if (surface && !isGuidanceTargetVisible(surface, root.defaultView)) return null;
  // Comparing attributes avoids selector injection and translated-text guessing.
  const candidates = surface ? [surface, ...Array.from(surface.querySelectorAll<HTMLElement>('[data-guide]'))] : Array.from(root.querySelectorAll<HTMLElement>('[data-guide]'));
  return candidates
    .find(element => element.getAttribute('data-guide') === anchor && isGuidanceTargetVisible(element, root.defaultView!)) || null;
}

/** Rendered offscreen controls still resolve; their outline is clipped to real scrollports. */
export function guidanceTargetVisibleRect(root: Document, target: HTMLElement, surface?: HTMLElement | null): GuidanceRect | null {
  const view = root.defaultView;
  if (!view || !isGuidanceTargetVisible(target, view)) return null;
  const virtual = view.visualViewport;
  const bounds = target.getBoundingClientRect();
  let top = Math.max(bounds.top, virtual?.offsetTop || 0);
  let left = Math.max(bounds.left, virtual?.offsetLeft || 0);
  let right = Math.min(bounds.right, (virtual?.offsetLeft || 0) + (virtual?.width || view.innerWidth || Infinity));
  let bottom = Math.min(bounds.bottom, (virtual?.offsetTop || 0) + (virtual?.height || view.innerHeight || Infinity));
  const clip = (element: HTMLElement, horizontal: boolean, vertical: boolean) => {
    const area = element.getBoundingClientRect();
    if (horizontal) { left = Math.max(left, area.left); right = Math.min(right, area.right); }
    if (vertical) { top = Math.max(top, area.top); bottom = Math.min(bottom, area.bottom); }
  };
  if (surface) clip(surface, true, true);
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    clip(parent, /auto|scroll|hidden|clip/.test(style.overflowX || style.overflow), /auto|scroll|hidden|clip/.test(style.overflowY || style.overflow));
    if (parent === surface) break;
  }
  return right > left && bottom > top ? { top, left, width: right - left, height: bottom - top } : null;
}

/** The exception applies to one exact, visible workflow dialog, never its children/ancestors. */
export function hasCompetingGuidanceModal(root: Document, allowedSurface?: HTMLElement | null): boolean {
  if (!root.defaultView) return false;
  return Array.from(root.querySelectorAll<HTMLElement>('[aria-modal="true"], dialog[open]'))
    .some(element => element !== allowedSurface && isGuidanceTargetVisible(element, root.defaultView!));
}

export function isGuidanceSurfaceActive(root: Document, surface: HTMLElement | null, name?: string): surface is HTMLElement {
  return Boolean(surface && name && root.defaultView
    && surface.getAttribute('data-guide-surface') === name
    && (surface.getAttribute('aria-modal') === 'true' || (surface.tagName === 'DIALOG' && surface.hasAttribute('open')))
    && isGuidanceTargetVisible(surface, root.defaultView));
}

export function resolveGuidanceSurface(root: Document, name?: string, trigger?: HTMLElement | null): HTMLElement | null {
  if (!name || !trigger) return null;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-guide-surface]'))
    .find(surface => isGuidanceSurfaceActive(root, surface, name) && surface.contains(trigger)) || null;
}

export function guidanceScrollContainer(root: Document, target: HTMLElement | null, surface: HTMLElement): HTMLElement | null {
  if (!target || !root.defaultView) return null;
  for (let parent = target.parentElement; parent && surface.contains(parent); parent = parent.parentElement) {
    const style = root.defaultView.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

/** Scrolling is the only presentation effect exposed by guidance. */
export function showGuidanceTarget(root: Document, anchor?: string, surface?: HTMLElement | null): boolean {
  const target = resolveGuidanceTarget(root, anchor, surface);
  if (!target || hasCompetingGuidanceModal(root, surface)) return false;
  const view = root.defaultView!;
  if (!surface) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  else {
    // Native scrollIntoView traverses outer ancestors. A modal must not scroll its inert page.
    for (let parent = target.parentElement; parent && surface.contains(parent); parent = parent.parentElement) {
      const style = view.getComputedStyle(parent);
      if (!/(auto|scroll)/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight || typeof parent.scrollBy !== 'function') continue;
      const bounds = target.getBoundingClientRect(), port = parent.getBoundingClientRect();
      const amount = bounds.height > port.height || bounds.top < port.top ? bounds.top - port.top : Math.max(0, bounds.bottom - port.bottom);
      if (amount) parent.scrollBy({ top: amount, left: 0, behavior: 'auto' });
    }
  }
  if (!view.innerHeight || typeof view.scrollBy !== 'function') return true;
  const virtual = view.visualViewport;
  const viewport: GuidanceRect = { top: virtual?.offsetTop || 0, left: virtual?.offsetLeft || 0, width: virtual?.width || view.innerWidth, height: virtual?.height || view.innerHeight };
  const panel = (surface || root).querySelector<HTMLElement>('[data-guidance-panel]');
  const panelBounds = panel && isGuidanceTargetVisible(panel, view) ? panel.getBoundingClientRect() : null;
  let stickyTop = viewport.top;
  for (const candidate of Array.from((surface || root).querySelectorAll<HTMLElement>('header, nav, [role="navigation"], [data-guidance-sticky]'))) {
    const style = view.getComputedStyle(candidate);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    const bounds = candidate.getBoundingClientRect();
    if (bounds.top <= stickyTop + 16 && bounds.bottom > stickyTop && bounds.height < viewport.height / 2) stickyTop = Math.max(stickyTop, bounds.bottom);
  }
  const delta = () => guidanceScrollPlan({ target: target.getBoundingClientRect(), viewport, panel: panelBounds, stickyTop }).scrollDelta;
  // Inner scroll containers get the first opportunity. Re-read the target after each scroll.
  for (let parent = target.parentElement; parent && (!surface || surface.contains(parent)); parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (!/(auto|scroll)/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight || typeof parent.scrollBy !== 'function') continue;
    const amount = delta();
    if (amount) parent.scrollBy({ top: amount, left: 0, behavior: 'auto' });
  }
  const amount = delta();
  // A workflow dialog owns scrolling; the inert background never moves.
  if (amount && !surface) view.scrollBy({ top: amount, left: 0, behavior: 'auto' });
  return true;
}
