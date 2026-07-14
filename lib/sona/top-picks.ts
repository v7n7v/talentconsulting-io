export function selectSonaTopPicks<T extends {
  queueId?: string;
  title?: string;
  company?: string;
}>(queued: T[], limit = 3): T[] {
  const seen = new Set<string>();
  const picks: T[] = [];
  for (const job of Array.isArray(queued) ? queued : []) {
    const queueId = String(job?.queueId || '').trim();
    if (!queueId || !String(job?.title || '').trim() || !String(job?.company || '').trim() || seen.has(queueId)) continue;
    seen.add(queueId);
    picks.push(job);
    if (picks.length >= Math.max(1, Math.min(3, limit))) break;
  }
  return picks;
}

export function findDeepLinkedPacket<T extends { id?: string }>(items: T[], search: string): T | null {
  const packetId = new URLSearchParams(search).get('packet')?.trim();
  if (!packetId || packetId.length > 200) return null;
  return items.find(item => String(item.id || '') === packetId) || null;
}

export function getSafeExternalUrl(value?: string | null): string | null {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 2048) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
