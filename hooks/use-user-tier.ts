'use client';

/**
 * useUserTier — Client-side hook for tier + usage awareness
 * Fetches from /api/usage on mount and exposes tier, usage, and helper methods.
 * Subscribes to Firestore subscription doc in real time so plan changes
 * from the admin panel reflect instantly without page refresh.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import { useStore } from '@/lib/store';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UsageData } from '@/lib/usage-tracker';
import { isDemoModeEnabled } from '@/lib/demo-mode';

export type PlanTier = 'free' | 'pro' | 'studio' | 'god';

const GOD_EMAILS = ['alula2006@gmail.com'];
const MASTER_EMAILS = ['alula2006@gmail.com'];

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

const DEFAULT_USAGE: UsageData = { morphs: 0, gauntlets: 0, flashcards: 0, jdGenerations: 0, coverLetters: 0, resumeChecks: 0, linkedinProfiles: 0, writingTools: 0, galleryTools: 0 };
const DEFAULT_CAPS: Record<string, number> = { morphs: 3, gauntlets: 3, flashcards: 2, jdGenerations: 3 };

export function useUserTier(): TierState {
  const user = useStore((s) => s.user);
  const [tier, setTier] = useState<PlanTier>('free');
  const [usage, setUsage] = useState<UsageData>(DEFAULT_USAGE);
  const [caps, setCaps] = useState<Record<string, number> | null>(DEFAULT_CAPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDone = useRef(false);

  const fetchUsage = useCallback(async () => {
    if (isDemoModeEnabled()) {
      setTier('studio');
      setUsage(DEFAULT_USAGE);
      setCaps(null);
      setError(null);
      setLoading(false);
      initialFetchDone.current = true;
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        const serverTier = data.tier || 'free';
        setTier(serverTier);
        setUsage(data.usage || DEFAULT_USAGE);
        setCaps(serverTier === 'free' ? (data.caps || DEFAULT_CAPS) : null);
        setError(null);
        initialFetchDone.current = true;
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

  // Real-time Firestore listener on subscription doc
  // When admin changes a user's plan, this fires instantly
  useEffect(() => {
    if (isDemoModeEnabled()) return;
    if (!user?.uid) return;

    const email = user.email?.toLowerCase() || '';

    // God/master accounts have fixed tiers — no need to listen
    if (GOD_EMAILS.includes(email) || MASTER_EMAILS.includes(email)) return;

    const subRef = doc(db, 'users', user.uid, 'subscription', 'current');
    const unsub = onSnapshot(subRef, (snap) => {
      // Skip the first snapshot if we already loaded from /api/usage
      // to avoid a flash. After that, always apply real-time updates.
      if (!initialFetchDone.current) return;

      if (!snap.exists()) {
        setTier('free');
        setCaps(DEFAULT_CAPS);
        return;
      }

      const data = snap.data();
      const status = data?.status;
      const plan = data?.plan;

      if (status === 'active' || status === 'trialing') {
        const newTier: PlanTier = plan === 'studio' ? 'studio' : plan === 'pro' ? 'pro' : 'free';
        setTier(newTier);
        setCaps(newTier === 'free' ? DEFAULT_CAPS : null);
      } else {
        setTier('free');
        setCaps(DEFAULT_CAPS);
      }
    }, (err) => {
      console.warn('[useUserTier] Subscription listener error:', err.message);
    });

    return () => unsub();
  }, [user?.uid, user?.email]);

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
