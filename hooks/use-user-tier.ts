'use client';

/**
 * useUserTier — Client-side hook for tier + usage awareness
 * Fetches server-authoritative billing data from /api/usage and refreshes it
 * when the customer returns to the app or a local billing action completes.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';
import type { UsageData } from '@/lib/usage-tracker';
import { isDemoModeEnabled } from '@/lib/demo-mode';

export type PlanTier = 'free' | 'pro' | 'studio' | 'god';

interface TierState {
  tier: PlanTier;
  isPro: boolean; // true for 'pro', 'studio', OR 'god'
  usage: UsageData;
  caps: Record<string, number> | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  canUse: (feature: keyof UsageData) => boolean;
  remaining: (feature: keyof UsageData) => number;
}

const DEFAULT_USAGE: UsageData = { morphs: 0, gauntlets: 0, flashcards: 0, jdGenerations: 0, coverLetters: 0, resumeChecks: 0, linkedinProfiles: 0, writingTools: 0, galleryTools: 0, resumeParses: 0, resumeAssists: 0, vaultExports: 0 };
const DEFAULT_CAPS: Record<string, number> = { morphs: 3, gauntlets: 3, flashcards: 2, jdGenerations: 3 };

export function useUserTier(): TierState {
  const user = useStore((s) => s.user);
  const [tier, setTier] = useState<PlanTier>('free');
  const [usage, setUsage] = useState<UsageData>(DEFAULT_USAGE);
  const [caps, setCaps] = useState<Record<string, number> | null>(DEFAULT_CAPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const fetchUsage = useCallback(async () => {
    if (isDemoModeEnabled()) {
      setTier('studio');
      setUsage(DEFAULT_USAGE);
      setCaps(null);
      setError(null);
      setLoading(false);
      hasLoaded.current = true;
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }
    try {
      if (!hasLoaded.current) setLoading(true);
      const res = await authFetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        const serverTier = data.tier || 'free';
        setTier(serverTier);
        setUsage(data.usage || DEFAULT_USAGE);
        setCaps(serverTier === 'free' ? (data.caps || DEFAULT_CAPS) : null);
        setError(null);
        hasLoaded.current = true;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Subscription documents are server-only by design. Revalidate through the
  // authenticated API instead of opening a client Firestore watch that rules deny.
  useEffect(() => {
    if (isDemoModeEnabled()) return;
    if (!user?.uid) return;

    const refreshUsage = () => {
      void fetchUsage();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshUsage();
    };

    window.addEventListener('focus', refreshUsage);
    window.addEventListener('talent:subscription-updated', refreshUsage);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshUsage);
      window.removeEventListener('talent:subscription-updated', refreshUsage);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchUsage, user?.uid]);

  // Auto-detect upgrade success from URL params and refetch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      const timer = setTimeout(() => fetchUsage(), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetchUsage]);

  const isPro = useMemo(() => tier === 'pro' || tier === 'studio' || tier === 'god', [tier]);

  const canUse = useCallback(
    (feature: keyof UsageData): boolean => {
      if (isPro) return true;
      if (!caps) return true;
      return (usage[feature] ?? 0) < (caps[feature] ?? Infinity);
    },
    [isPro, usage, caps]
  );

  const remaining = useCallback(
    (feature: keyof UsageData): number => {
      if (isPro) return Infinity;
      if (!caps) return Infinity;
      return Math.max(0, (caps[feature] ?? 0) - (usage[feature] ?? 0));
    },
    [isPro, usage, caps]
  );

  return { tier, isPro, usage, caps, loading, error, refetch: fetchUsage, canUse, remaining };
}
