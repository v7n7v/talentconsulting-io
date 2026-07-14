import type { DashboardToolId, GuestUsageSnapshot } from '@/lib/dashboard-types';

type GuestUsageKey = 'ats-score' | 'writing-trust' | 'quick-polish' | 'job-match';

const usageConfig: Record<GuestUsageKey, { cap: number; resetLabel: string; window: 'day' | 'hour' }> = {
  'ats-score': { cap: 3, resetLabel: 'Resets daily', window: 'day' },
  'writing-trust': { cap: 5, resetLabel: 'Resets hourly', window: 'hour' },
  'quick-polish': { cap: 3, resetLabel: 'Resets daily', window: 'day' },
  'job-match': { cap: 3, resetLabel: 'Resets daily', window: 'day' },
};

export function guestUsageKeyForTool(tool: DashboardToolId): GuestUsageKey {
  if (tool === 'resume-check' || tool === 'ats-analyzer') return 'ats-score';
  if (tool === 'writing-trust') return 'writing-trust';
  if (tool === 'quick-polish') return 'quick-polish';
  return 'job-match';
}

function bucketFor(windowSize: 'day' | 'hour') {
  const now = new Date();
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (windowSize === 'day') return day;
  return `${day}-${now.getHours()}`;
}

function storageKey(key: GuestUsageKey) {
  return `tc_guest_usage_${key}`;
}

function readRaw(key: GuestUsageKey): { bucket: string; used: number } {
  if (typeof window === 'undefined') return { bucket: '', used: 0 };

  const config = usageConfig[key];
  const bucket = bucketFor(config.window);

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) || '{}') as { bucket?: string; used?: number };
    if (parsed.bucket === bucket) {
      return { bucket, used: Math.max(0, Number(parsed.used || 0)) };
    }
  } catch {
    // Ignore malformed localStorage and reset below.
  }

  return { bucket, used: 0 };
}

function writeRaw(key: GuestUsageKey, used: number) {
  if (typeof window === 'undefined') return;
  const config = usageConfig[key];
  const bucket = bucketFor(config.window);
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ bucket, used: Math.max(0, used) }));
  } catch {
    // Guest previews should continue even when storage is blocked or full.
  }
}

export function getGuestUsageForTool(tool: DashboardToolId): GuestUsageSnapshot {
  const key = guestUsageKeyForTool(tool);
  const config = usageConfig[key];
  const raw = readRaw(key);
  const used = Math.min(config.cap, raw.used);
  const remaining = Math.max(0, config.cap - used);

  return {
    used,
    cap: config.cap,
    remaining,
    resetLabel: config.resetLabel,
    exhausted: remaining <= 0,
  };
}

export function markGuestToolUsed(tool: DashboardToolId): GuestUsageSnapshot {
  const key = guestUsageKeyForTool(tool);
  const config = usageConfig[key];
  const raw = readRaw(key);
  writeRaw(key, Math.min(config.cap, raw.used + 1));
  return getGuestUsageForTool(tool);
}

export function syncGuestToolRemaining(tool: DashboardToolId, remaining: unknown): GuestUsageSnapshot {
  const key = guestUsageKeyForTool(tool);
  const config = usageConfig[key];
  const normalized = typeof remaining === 'number' && Number.isFinite(remaining)
    ? Math.max(0, Math.min(config.cap, remaining))
    : null;

  if (normalized !== null) {
    writeRaw(key, config.cap - normalized);
  }

  return getGuestUsageForTool(tool);
}

export function markGuestToolExhausted(tool: DashboardToolId): GuestUsageSnapshot {
  const key = guestUsageKeyForTool(tool);
  writeRaw(key, usageConfig[key].cap);
  return getGuestUsageForTool(tool);
}
