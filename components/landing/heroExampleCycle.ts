export const HERO_EXAMPLE_CYCLE_MS = 5000;
const WRITE_MS = 2000;

/** One role's writing + reading cycle; selecting the next role starts a new cycle. */
export function subscribeHeroExampleCycle(
  element: HTMLElement,
  onProgress: (progress: number) => void,
  onAdvance: () => void,
) {
  if (typeof IntersectionObserver === "undefined") return () => {};

  let frame: number | null = null;
  let timer: number | null = null;
  let visible = false;
  let hovered = window.matchMedia("(hover: hover)").matches && element.matches(":hover");
  let focused = element.contains(document.activeElement);
  let started = false;
  let disposed = false;
  const canRun = () =>
    !disposed && visible && !hovered && !focused && document.visibilityState === "visible";
  const cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (timer !== null) window.clearTimeout(timer);
    frame = null;
    timer = null;
  };
  const update = () => {
    if (disposed) return;
    if (!canRun()) {
      cancel();
      // Keep the complete example readable whenever automatic motion is paused.
      onProgress(1);
      return;
    }
    if (timer !== null) return;
    if (!started) {
      started = true;
      const startTime = performance.now();
      onProgress(0);
      const tick = (now: number) => {
        frame = null;
        if (!canRun()) return;
        const progress = Math.min(1, Math.max(0, (now - startTime) / WRITE_MS));
        onProgress(progress);
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }
    timer = window.setTimeout(() => {
      timer = null;
      if (canRun()) onAdvance();
    }, HERO_EXAMPLE_CYCLE_MS);
  };
  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    update();
  };
  const onPointerLeave = () => {
    hovered = false;
    update();
  };
  const onFocusIn = () => {
    focused = true;
    update();
  };
  const onFocusOut = (event: FocusEvent) => {
    focused = element.contains(event.relatedTarget as Node | null);
    update();
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
    update();
  }, { threshold: [0, 0.25] });
  observer.observe(element);
  document.addEventListener("visibilitychange", update);
  element.addEventListener("pointerenter", onPointerEnter);
  element.addEventListener("pointerleave", onPointerLeave);
  element.addEventListener("focusin", onFocusIn);
  element.addEventListener("focusout", onFocusOut);

  return () => {
    disposed = true;
    cancel();
    observer.disconnect();
    document.removeEventListener("visibilitychange", update);
    element.removeEventListener("pointerenter", onPointerEnter);
    element.removeEventListener("pointerleave", onPointerLeave);
    element.removeEventListener("focusin", onFocusIn);
    element.removeEventListener("focusout", onFocusOut);
  };
}
