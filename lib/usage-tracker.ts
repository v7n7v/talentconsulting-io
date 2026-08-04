/**
 * Lifetime Usage Tracker
 * Server-side enforcement of free tier caps via Firestore.
 * Path: users/{uid}/usage/lifetime
 * Voice: users/{uid}/usage/voice_monthly
 * 
 * Uses Firebase Admin SDK for guaranteed write permissions.
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { PlanTier } from './pricing-tiers';

// ── Feature Keys ──
export type UsageFeature =
  | 'morphs' | 'gauntlets' | 'flashcards' | 'jdGenerations' | 'coverLetters'
  | 'resumeChecks' | 'linkedinProfiles' | 'writingTools' | 'galleryTools'
  /*
   * These three used to borrow 'resumeChecks', whose only writer is
   * /api/resume/check. While that route 403'd every free user the meter never
   * moved, so the borrowers were never really capped - and honouring the check
   * route's own free-tier contract would have meant three Quality Scans locking
   * someone out of UPLOADING A RESUME, under a message naming a tool they were
   * not using. Resume upload is the product's first step.
   *
   * Deleting them from ROUTE_FEATURE_MAP fixed that and broke something worse:
   * the ANONYMOUS cap is a self-incrementing counter in checkRateLimit, wholly
   * independent of the Firestore meter, so it HAD been working. Removing it left
   * /api/resume/parse and /api/resume/ai - both public, both allowAnonymous,
   * both calling Groq - with no lifetime bound at all, throttled only per minute
   * per IP. That is an uncapped LLM endpoint on someone else's bill.
   *
   * Their own meters: capped, but not on a stranger's counter.
   */
  | 'resumeParses' | 'resumeAssists' | 'vaultExports';

// ── Free Tier Lifetime Caps ──
/** 3 forever — no resets, no exceptions for free tier */
export const FREE_CAPS: Record<UsageFeature, number> = {
  morphs: 3,
  gauntlets: 3,
  flashcards: 3,
  jdGenerations: 3,
  coverLetters: 3,
  resumeChecks: 3,
  linkedinProfiles: 3,
  writingTools: 3,
  galleryTools: 5,
  // Upload is the first step of the product; 10 gives room to try more than one
  // file and fix a bad parse without hitting a wall on day one.
  resumeParses: 10,
  resumeAssists: 3,
  vaultExports: 3,
};

// ── Anonymous (No Account) Caps ──
/** 1 taste test per tool — then force signup. In-memory per IP. */
export const ANON_CAPS: Record<UsageFeature, number> = {
  morphs: 1,
  gauntlets: 1,
  flashcards: 1,
  jdGenerations: 1,
  coverLetters: 1,
  resumeChecks: 1,
  linkedinProfiles: 1,
  writingTools: 1,
  galleryTools: 1,
  // 2, not 1: a scanned PDF fails the parse and a stranger should be able to
  // retry once with a different file before being asked to sign up.
  resumeParses: 2,
  resumeAssists: 1,
  vaultExports: 1,
};

// ── Voice Minute Caps (per month) ──
export const VOICE_MINUTE_CAPS: Record<Exclude<PlanTier, 'god'>, number> = {
  free: 0,
  pro: 15,
  studio: 15,
};

// ── Writing Word Caps (per month) ──
export const WRITING_WORD_CAPS: Record<Exclude<PlanTier, 'god'>, number> = {
  free: 500,     // Free users: 500 words/month taste — enough for 1-2 short texts
  pro: 4_000,    // 4K words/month for humanization
  studio: 50_000, // 50K words/month for humanization
};

// ── Usage Data Shape ──
export interface UsageData {
  morphs: number;
  gauntlets: number;
  flashcards: number;
  jdGenerations: number;
  coverLetters: number;
  resumeChecks: number;
  linkedinProfiles: number;
  writingTools: number;
  galleryTools: number;
  resumeParses: number;
  resumeAssists: number;
  vaultExports: number;
}

export interface VoiceUsageData {
  usedSeconds: number;
  month: string; // "2026-03" format for monthly reset
}

export interface WritingWordUsage {
  usedWords: number;
  month: string;
}

const DEFAULT_USAGE: UsageData = {
  morphs: 0,
  gauntlets: 0,
  flashcards: 0,
  jdGenerations: 0,
  coverLetters: 0,
  resumeChecks: 0,
  linkedinProfiles: 0,
  writingTools: 0,
  galleryTools: 0,
  resumeParses: 0,
  resumeAssists: 0,
  vaultExports: 0,
};

// ── Doc References (Admin SDK) ──

function usageDocRef(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('usage').doc('lifetime');
}

function voiceDocRef(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('usage').doc('voice_monthly');
}

function writingDocRef(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('usage').doc('writing_monthly');
}

/** Current month key for reset detection */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Get current usage counts */
export async function getUsage(uid: string): Promise<UsageData> {
  try {
    const snap = await usageDocRef(uid).get();
    if (snap.exists) {
      const data = snap.data()!;
      return {
        morphs: data.morphs ?? 0,
        gauntlets: data.gauntlets ?? 0,
        flashcards: data.flashcards ?? 0,
        jdGenerations: data.jdGenerations ?? 0,
        coverLetters: data.coverLetters ?? 0,
        resumeChecks: data.resumeChecks ?? 0,
        linkedinProfiles: data.linkedinProfiles ?? 0,
        writingTools: data.writingTools ?? 0,
        galleryTools: data.galleryTools ?? 0,
        // Absent on every document written before these meters existed.
        resumeParses: data.resumeParses ?? 0,
        resumeAssists: data.resumeAssists ?? 0,
        vaultExports: data.vaultExports ?? 0,
      };
    }
    return { ...DEFAULT_USAGE };
  } catch {
    return { ...DEFAULT_USAGE };
  }
}

/** Increment usage for a feature. Call AFTER a successful action. */
export async function incrementUsage(uid: string, feature: UsageFeature): Promise<void> {
  try {
    await usageDocRef(uid).set(
      { [feature]: FieldValue.increment(1) },
      { merge: true }
    );
  } catch (err) {
    console.error(`Failed to increment usage for ${uid}:${feature}`, err);
  }
}

/**
 * Check if user is allowed to perform an action.
 * Pro users always pass. Free users are checked against lifetime caps.
 * Returns { allowed, remaining, cap } or throws a descriptive error.
 */
export async function checkUsageAllowed(
  uid: string,
  feature: UsageFeature,
  tier: PlanTier
): Promise<{ allowed: boolean; used: number; cap: number; remaining: number }> {
  // Pro, Studio & GOD users: unlimited lifetime uses
  if (tier === 'pro' || tier === 'studio' || tier === 'god') {
    return { allowed: true, used: 0, cap: Infinity, remaining: Infinity };
  }

  const usage = await getUsage(uid);
  const used = usage[feature];
  const cap = FREE_CAPS[feature];
  const remaining = Math.max(0, cap - used);

  return {
    allowed: used < cap,
    used,
    cap,
    remaining,
  };
}

// ═══════════════════════════════════════════════
// VOICE MINUTE TRACKING (Monthly Reset)
// ═══════════════════════════════════════════════

/** Get current month's voice usage in seconds */
export async function getVoiceUsage(uid: string): Promise<VoiceUsageData> {
  try {
    const snap = await voiceDocRef(uid).get();
    if (snap.exists) {
      const data = snap.data()!;
      const storedMonth = data.month || '';
      const thisMonth = currentMonthKey();

      // Auto-reset if new month
      if (storedMonth !== thisMonth) {
        return { usedSeconds: 0, month: thisMonth };
      }
      return { usedSeconds: data.usedSeconds ?? 0, month: thisMonth };
    }
    return { usedSeconds: 0, month: currentMonthKey() };
  } catch {
    return { usedSeconds: 0, month: currentMonthKey() };
  }
}

/**
 * Check if user has voice minutes remaining.
 * Free users: 0 minutes (voice is Pro-only).
 * Pro users: 15 minutes/month.
 */
export async function checkVoiceAllowed(
  uid: string,
  tier: PlanTier
): Promise<{ allowed: boolean; usedSeconds: number; capSeconds: number; remainingSeconds: number }> {
  const capMinutes = tier === 'god' ? Infinity : (VOICE_MINUTE_CAPS[tier as Exclude<PlanTier, 'god'>] || 0);
  const capSeconds = capMinutes * 60;

  if (capSeconds === 0) {
    return { allowed: false, usedSeconds: 0, capSeconds: 0, remainingSeconds: 0 };
  }

  const voice = await getVoiceUsage(uid);
  const remainingSeconds = Math.max(0, capSeconds - voice.usedSeconds);

  return {
    allowed: voice.usedSeconds < capSeconds,
    usedSeconds: voice.usedSeconds,
    capSeconds,
    remainingSeconds,
  };
}

/**
 * Record voice usage in seconds. Call AFTER a successful TTS/STT operation.
 * Automatically resets if a new month has started.
 */
export async function recordVoiceUsage(uid: string, seconds: number): Promise<void> {
  try {
    const thisMonth = currentMonthKey();
    const current = await getVoiceUsage(uid);

    if (current.month !== thisMonth) {
      // New month — reset counter
      await voiceDocRef(uid).set({
        usedSeconds: seconds,
        month: thisMonth,
        lastUsed: new Date().toISOString(),
      });
    } else {
      // Same month — increment
      await voiceDocRef(uid).set(
        {
          usedSeconds: FieldValue.increment(seconds),
          month: thisMonth,
          lastUsed: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error(`Failed to record voice usage for ${uid}`, err);
  }
}

/**
 * Estimate TTS duration from text.
 * Average speaking rate: ~150 words/min, ~5 chars/word → ~750 chars/min → ~12.5 chars/sec
 */
export function estimateTTSSeconds(text: string): number {
  const chars = text.trim().length;
  return Math.max(1, Math.ceil(chars / 12.5));
}

/**
 * Estimate STT duration from audio file size.
 * WebM/Opus at ~32kbps → ~4KB/sec. Conservative estimate.
 */
export function estimateSTTSeconds(fileSizeBytes: number): number {
  return Math.max(1, Math.ceil(fileSizeBytes / 4000));
}

// ═══════════════════════════════════════════════
// WRITING WORD TRACKING (Monthly Reset)
// ═══════════════════════════════════════════════

/** Count words in text */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Get current month's writing word usage */
export async function getWritingWordUsage(uid: string): Promise<WritingWordUsage> {
  try {
    const snap = await writingDocRef(uid).get();
    if (snap.exists) {
      const data = snap.data()!;
      const storedMonth = data.month || '';
      const thisMonth = currentMonthKey();
      if (storedMonth !== thisMonth) {
        return { usedWords: 0, month: thisMonth };
      }
      return { usedWords: data.usedWords ?? 0, month: thisMonth };
    }
    return { usedWords: 0, month: currentMonthKey() };
  } catch {
    return { usedWords: 0, month: currentMonthKey() };
  }
}

/** Check if user has writing words remaining for humanization */
export async function checkWritingWordsAllowed(
  uid: string,
  tier: PlanTier,
  wordCount: number
): Promise<{ allowed: boolean; usedWords: number; capWords: number; remainingWords: number }> {
  if (tier === 'god') {
    return { allowed: true, usedWords: 0, capWords: Infinity, remainingWords: Infinity };
  }

  const capWords = WRITING_WORD_CAPS[tier as Exclude<PlanTier, 'god'>] || 0;
  if (capWords === 0) {
    return { allowed: false, usedWords: 0, capWords: 0, remainingWords: 0 };
  }

  const writing = await getWritingWordUsage(uid);
  const remainingWords = Math.max(0, capWords - writing.usedWords);

  return {
    allowed: writing.usedWords + wordCount <= capWords,
    usedWords: writing.usedWords,
    capWords,
    remainingWords,
  };
}

/** Record word usage after successful humanization */
export async function recordWritingWords(uid: string, words: number): Promise<void> {
  try {
    const thisMonth = currentMonthKey();
    const current = await getWritingWordUsage(uid);

    if (current.month !== thisMonth) {
      await writingDocRef(uid).set({
        usedWords: words,
        month: thisMonth,
        lastUsed: new Date().toISOString(),
      });
    } else {
      await writingDocRef(uid).set(
        {
          usedWords: FieldValue.increment(words),
          month: thisMonth,
          lastUsed: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error(`Failed to record writing word usage for ${uid}`, err);
  }
}
