'use client';

import { useEffect } from 'react';
import { ATTRIBUTION_STORAGE_KEY, type StoredAttribution } from '@/lib/attribution';

export default function AttributionCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const utmSource = params.get('utm_source');
      const utmCampaign = params.get('utm_campaign');
      const utmContent = params.get('utm_content');
      if (!utmSource && !utmCampaign && !utmContent) return;

      const current = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
      const parsed = current ? JSON.parse(current) as StoredAttribution : {};
      const next: StoredAttribution = {
        ...parsed,
        utmSource: utmSource || parsed.utmSource || null,
        utmCampaign: utmCampaign || parsed.utmCampaign || null,
        utmContent: utmContent || parsed.utmContent || null,
        referrer: parsed.referrer || document.referrer || null,
        firstPath: parsed.firstPath || window.location.pathname,
        capturedAt: parsed.capturedAt || new Date().toISOString(),
      };
      window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Attribution is best-effort only.
    }
  }, []);

  return null;
}
