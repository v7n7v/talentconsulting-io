/** Deterministic presentation: the same scroll position always yields the same pose. */
export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

export function rangeProgress(value: number, start: number, end: number): number {
  if (![value, start, end].every(Number.isFinite) || end <= start) return 1;
  return clamp01((value - start) / (end - start));
}

export function journeyStage(progress: number): 0 | 1 | 2 {
  const p = clamp01(progress);
  return p < 0.31 ? 0 : p < 0.65 ? 1 : 2;
}

export function stagePresentation(progress: number, index: number) {
  const p = clamp01(progress);
  const entry = index === 0 ? 1 : rangeProgress(p, index === 1 ? 0.28 : 0.62, index === 1 ? 0.34 : 0.68);
  const exit = index === 2 ? 0 : rangeProgress(p, index === 0 ? 0.28 : 0.62, index === 0 ? 0.34 : 0.68);
  return { opacity: entry * (1 - exit), y: (1 - entry) * 12 - exit * 12 };
}

function interpolate(progress: number, points: readonly (readonly [number, number])[]) {
  const p = clamp01(progress);
  for (let index = 1; index < points.length; index++) {
    if (p <= points[index][0]) {
      const [start, from] = points[index - 1];
      const [end, to] = points[index];
      return from + (to - from) * rangeProgress(p, start, end);
    }
  }
  return points[points.length - 1][1];
}

export function stampPose(progress: number) {
  const p = clamp01(progress);
  return {
    opacity: rangeProgress(p, 0, 0.2),
    y: interpolate(p, [[0, -24], [0.48, 1.5], [0.72, -2], [1, 0]]),
    scale: interpolate(p, [[0, 1.18], [0.48, 0.97], [0.72, 1.02], [1, 1]]),
    rotation: interpolate(p, [[0, -16], [0.48, -8], [1, -8]]),
    impact: interpolate(p, [[0, 0], [0.35, 0], [0.48, 1], [0.8, 0], [1, 0]]),
  };
}
