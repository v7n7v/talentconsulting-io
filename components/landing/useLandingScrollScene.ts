"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

export interface LandingScrollFrame {
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
  viewportScale: number;
  measure: boolean;
}

export function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const reducedMotionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverReducedMotionSnapshot = () => true;

/** Start with the complete static rendering until the browser's preference is known. */
export function useReducedMotionPreference() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, serverReducedMotionSnapshot);
}

/** Event-driven subscription, exported separately so lifecycle can be tested without a browser. */
export function subscribeLandingScrollScene(root: HTMLElement, onFrame: (frame: LandingScrollFrame) => void) {
  let disposed = false;
  let pending: number | null = null;
  let needsMeasure = true;

  const schedule = (measure = false) => {
    if (disposed) return;
    needsMeasure ||= measure;
    if (document.visibilityState === "hidden" || pending !== null) return;
    pending = window.requestAnimationFrame(() => {
      pending = null;
      if (disposed || document.visibilityState === "hidden") return;
      const frame = {
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        viewportScale: window.visualViewport?.scale || 1,
        measure: needsMeasure,
      };
      needsMeasure = false;
      onFrame(frame);
    });
  };
  const onScroll = () => schedule();
  const onMeasure = () => schedule(true);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (pending !== null) window.cancelAnimationFrame(pending);
      pending = null;
    } else {
      schedule(true);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onMeasure);
  window.addEventListener("orientationchange", onMeasure);
  window.addEventListener("pageshow", onMeasure);
  window.addEventListener("taco:landing-layout", onMeasure);
  window.visualViewport?.addEventListener("resize", onMeasure);
  window.visualViewport?.addEventListener("scroll", onMeasure);
  document.addEventListener("visibilitychange", onVisibility);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onMeasure);
  observer?.observe(root);
  if (document.body && document.body !== root) observer?.observe(document.body);
  document.fonts?.addEventListener("loadingdone", onMeasure);
  void document.fonts?.ready.then(onMeasure);
  schedule(true);

  return () => {
    disposed = true;
    if (pending !== null) window.cancelAnimationFrame(pending);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onMeasure);
    window.removeEventListener("orientationchange", onMeasure);
    window.removeEventListener("pageshow", onMeasure);
    window.removeEventListener("taco:landing-layout", onMeasure);
    window.visualViewport?.removeEventListener("resize", onMeasure);
    window.visualViewport?.removeEventListener("scroll", onMeasure);
    document.removeEventListener("visibilitychange", onVisibility);
    document.fonts?.removeEventListener("loadingdone", onMeasure);
    observer?.disconnect();
  };
}

export function useLandingScrollScene(
  rootRef: RefObject<HTMLElement | null>,
  onFrame: (frame: LandingScrollFrame) => void,
  { enabled, watchKey = "" }: { enabled: boolean; watchKey?: string },
) {
  const callbackRef = useRef(onFrame);
  useEffect(() => { callbackRef.current = onFrame; });
  useEffect(() => {
    if (!enabled || !rootRef.current) return;
    return subscribeLandingScrollScene(rootRef.current, frame => callbackRef.current(frame));
  }, [enabled, rootRef, watchKey]);
}
