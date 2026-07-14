const DAY_MS = 24 * 60 * 60 * 1000;

export function selectDailyCronBatch<T>(items: T[], maxItems: number, now = new Date()) {
  const limit = Math.max(0, Math.floor(maxItems));
  if (limit === 0 || items.length === 0) return [];
  if (items.length <= limit) return [...items];

  const day = Math.floor(now.getTime() / DAY_MS);
  const start = (day * limit) % items.length;
  return Array.from({ length: limit }, (_, offset) => items[(start + offset) % items.length]);
}
