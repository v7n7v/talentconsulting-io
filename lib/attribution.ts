export const ATTRIBUTION_STORAGE_KEY = 'talent-attribution';

export interface StoredAttribution {
  utmSource?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  referrer?: string | null;
  firstPath?: string | null;
  capturedAt?: string;
}

export function readStoredAttribution(): StoredAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
