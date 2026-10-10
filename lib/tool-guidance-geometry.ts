export interface GuidanceRect { top: number; left: number; width: number; height: number }

/** A guide never places the requested control behind its own note or a sticky rail. */
export function guidanceScrollPlan({ target, viewport, panel, stickyTop = viewport.top, gap = 16 }: {
  target: GuidanceRect;
  viewport: GuidanceRect;
  panel?: GuidanceRect | null;
  stickyTop?: number;
  gap?: number;
}) {
  let top = Math.max(viewport.top, stickyTop) + gap;
  let bottom = viewport.top + viewport.height - gap;
  const overlapsHorizontally = panel && target.left < panel.left + panel.width && target.left + target.width > panel.left;
  if (panel && overlapsHorizontally && panel.top < bottom && panel.top + panel.height > top) {
    const above = Math.max(0, panel.top - gap - top);
    const below = Math.max(0, bottom - panel.top - panel.height - gap);
    if (above >= below) bottom = Math.max(top, panel.top - gap);
    else top = Math.min(bottom, panel.top + panel.height + gap);
  }
  const usableHeight = Math.max(0, bottom - top);
  const desiredTop = target.height > usableHeight ? top : Math.min(Math.max(target.top, top), bottom - target.height);
  return { top, bottom, usableHeight, desiredTop, scrollDelta: target.top - desiredTop };
}

export function guidancePanelPlacement({ width, height, offsetTop = 0, offsetLeft = 0, layoutWidth, layoutHeight }: {
  width: number; height: number; offsetTop?: number; offsetLeft?: number; layoutWidth: number; layoutHeight: number;
}) {
  return {
    bottom: Math.max(16, layoutHeight - offsetTop - height + 16),
    right: Math.max(16, layoutWidth - offsetLeft - width + 16),
    width: Math.max(0, Math.min(384, width - 32)),
    maxHeight: Math.max(0, width < 1024 ? height * 0.46 : Math.min(640, height - 32)),
  };
}

/** Fixed footer/header targets cannot move; the note uses the available side of them. */
export function guidanceModalPanelPlacement({ surface, viewport, target, scrollable, scrollTop = 0, scrollLeft = 0, gap = 16 }: {
  surface: GuidanceRect; viewport: GuidanceRect; target?: GuidanceRect | null; scrollable: boolean;
  scrollTop?: number; scrollLeft?: number; gap?: number;
}) {
  const topEdge = Math.max(surface.top, viewport.top) + gap;
  const bottomEdge = Math.min(surface.top + surface.height, viewport.top + viewport.height) - gap;
  const width = Math.max(0, Math.min(384, surface.width - gap * 2, viewport.width - gap * 2));
  const baseHeight = Math.max(0, Math.min(viewport.width < 1024 ? viewport.height * 0.46 : 640, bottomEdge - topEdge));
  const placement = {
    position: 'absolute' as const, right: gap - scrollLeft, width, maxHeight: baseHeight,
    top: 'auto' as number | 'auto', bottom: surface.top + surface.height - bottomEdge - scrollTop as number | 'auto',
  };
  const panelLeft = surface.left + surface.width - gap - width;
  if (!target || scrollable || target.left + target.width <= panelLeft) return placement;
  const above = Math.max(0, target.top - gap - topEdge);
  const below = Math.max(0, bottomEdge - target.top - target.height - gap);
  // An entire context region has no clear side; retain an operable note and Close.
  if (Math.max(above, below) < 96) return placement;
  if (above >= below) {
    placement.top = topEdge - surface.top + scrollTop;
    placement.bottom = 'auto';
    placement.maxHeight = Math.min(baseHeight, above);
  } else placement.maxHeight = Math.min(baseHeight, below);
  return placement;
}
