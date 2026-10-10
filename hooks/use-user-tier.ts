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
import { getWorkspacePreviewScenario, isIsolatedWorkspacePreview } from '@/lib/workspace-preview';
import { readUserTierResponse } from '@/lib/user-tier-response';

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
  // The owner of successful data is separate from the owner of the latest
  // lookup. A failed lookup must never relabel another account's billing data.
  const [loadedFor, setLoadedFor] = useState<string | null>();
  const [requestedFor, setRequestedFor] = useState<string | null>();
  const requestSequence = useRef(0);
  const userId = user?.uid || null;

  const fetchUsage = useCallback(async () => {
    const requestId = ++requestSequence.current;
    const isCurrent = () => requestId === requestSequence.current
      && (useStore.getState().user?.uid || null) === userId;
    setRequestedFor(userId);
    if (isDemoModeEnabled()) {
      const previewTier = isIsolatedWorkspacePreview() && getWorkspacePreviewScenario() === 'new' ? 'free' : 'studio';
      setTier(previewTier);
      setUsage(DEFAULT_USAGE);
      setCaps(previewTier === 'free' ? DEFAULT_CAPS : null);
      setError(null);
      setLoading(false);
      setLoadedFor(userId);
      return;
    }
    if (!userId) {
      setTier('free');
      setUsage(DEFAULT_USAGE);
      setCaps(DEFAULT_CAPS);
      setError(null);
      setLoadedFor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await readUserTierResponse(await authFetch('/api/usage'));
      if (!isCurrent()) return;
      setTier(data.tier);
      setUsage(data.usage || DEFAULT_USAGE);
      setCaps(data.tier === 'free' ? (data.caps || DEFAULT_CAPS) : null);
      setError(null);
      setLoadedFor(userId);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Your plan could not be checked. Please retry.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // A new account gets a new request generation; old responses cannot commit.
    // Billing is an external resource; clear/refresh it when the authenticated owner changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsage();
    return () => { requestSequence.current += 1; };
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
      params.delete('upgrade');
      const newUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
      const timer = setTimeout(() => fetchUsage(), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetchUsage]);

  const accountPending = requestedFor !== userId;
  const hasOwnedData = loadedFor === userId;
  const effectiveLoading = loading || accountPending;
  const effectiveTier = hasOwnedData ? tier : 'free';
  const effectiveUsage = hasOwnedData ? usage : DEFAULT_USAGE;
  const effectiveCaps = hasOwnedData ? caps : DEFAULT_CAPS;
  const effectiveError = accountPending ? null : error;
  const isPro = useMemo(() => !effectiveLoading && !effectiveError && (effectiveTier === 'pro' || effectiveTier === 'studio' || effectiveTier === 'god'), [effectiveTier, effectiveLoading, effectiveError]);

  const canUse = useCallback(
    (feature: keyof UsageData): boolean => {
      if (effectiveLoading || effectiveError) return false;
      if (isPro) return true;
      if (!effectiveCaps) return true;
      return (effectiveUsage[feature] ?? 0) < (effectiveCaps[feature] ?? Infinity);
    },
    [isPro, effectiveUsage, effectiveCaps, effectiveLoading, effectiveError]
  );

  const remaining = useCallback(
    (feature: keyof UsageData): number => {
      if (effectiveLoading || effectiveError) return 0;
      if (isPro) return Infinity;
      if (!effectiveCaps) return Infinity;
      return Math.max(0, (effectiveCaps[feature] ?? 0) - (effectiveUsage[feature] ?? 0));
    },
    [isPro, effectiveUsage, effectiveCaps, effectiveLoading, effectiveError]
  );

  return { tier: effectiveTier, isPro, usage: effectiveUsage, caps: effectiveCaps, loading: effectiveLoading, error: effectiveError, refetch: fetchUsage, canUse, remaining };
}
