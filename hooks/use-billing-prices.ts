'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizePublicBillingPrices,
  type PublicBillingPrices,
  unavailableBillingCheckout,
  unavailableBillingPrices,
} from '@/lib/billing-price-types';

export function useBillingPrices() {
  const [prices, setPrices] = useState<PublicBillingPrices>(unavailableBillingPrices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadPrices = useCallback(async () => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/billing/prices', { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not load pricing');
        const data = await res.json();
        if (requestRef.current !== requestId) return;
        setPrices(normalizePublicBillingPrices(data));
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setPrices(previous => ({ ...previous, checkout: unavailableBillingCheckout() }));
        setError(err instanceof Error ? err.message : 'Could not load pricing');
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
  }, []);

  useEffect(() => {
    loadPrices();
    const refreshInterval = window.setInterval(loadPrices, 60_000);
    const refreshOnFocus = () => loadPrices();
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      requestRef.current += 1;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [loadPrices]);

  return { prices, checkout: prices.checkout, loading, error, refresh: loadPrices };
}
