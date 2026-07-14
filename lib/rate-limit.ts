/**
 * Distributed Rate Limiter — Upstash Redis
 *
 * Replaces the previous in-memory Map() which reset on cold starts
 * and didn't share state across serverless instances.
 *
 * Upstash Redis is persistent, shared, and edge-deployed.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';

// ── Upstash Redis client (lazy singleton) ──
let _redis: Redis | null = null;
function hasRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

// ── Pre-built rate limiters ──

const configuredRedis = hasRedisConfig() ? getRedis() : null;

/** Public free tool: 3 requests per 24 hours per IP */
export const freeToolLimiter = configuredRedis ? new Ratelimit({
  redis: configuredRedis,
  limiter: Ratelimit.fixedWindow(3, '24 h'),
  prefix: 'ratelimit:free-tool',
  analytics: true,
}) : null;

/** Authenticated API: 30 requests per 60 seconds per user */
export const authApiLimiter = configuredRedis ? new Ratelimit({
  redis: configuredRedis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'ratelimit:auth-api',
}) : null;

interface LocalRateLimitWindow {
  count: number;
  resetAt: number;
}

const localRateLimits = new Map<string, LocalRateLimitWindow>();
const MAX_LOCAL_RATE_LIMIT_KEYS = 10_000;
const MAX_LOCAL_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
let localChecks = 0;
let lastFallbackWarningAt = 0;

function warnLocalFallback() {
  const now = Date.now();
  if (now - lastFallbackWarningAt < 60_000) return;
  lastFallbackWarningAt = now;
  console.warn('[rate-limit] Distributed limiter unavailable; using bounded local fallback.');
}

function pruneLocalRateLimits(now: number) {
  localChecks += 1;
  if (localChecks % 256 !== 0 && localRateLimits.size < MAX_LOCAL_RATE_LIMIT_KEYS) return;
  for (const [key, window] of localRateLimits) {
    if (window.resetAt <= now) localRateLimits.delete(key);
  }
  while (localRateLimits.size >= MAX_LOCAL_RATE_LIMIT_KEYS) {
    const oldestKey = localRateLimits.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    localRateLimits.delete(oldestKey);
  }
}

function checkLocalRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0
    ? Math.min(Math.floor(windowMs), MAX_LOCAL_WINDOW_MS)
    : 60_000;
  pruneLocalRateLimits(now);
  const current = localRateLimits.get(key);
  const window = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + safeWindowMs }
    : current;
  window.count += 1;
  localRateLimits.delete(key);
  localRateLimits.set(key, window);
  return {
    allowed: window.count <= safeLimit,
    remaining: Math.max(0, safeLimit - window.count),
    resetIn: Math.max(0, window.resetAt - now),
  };
}

/**
 * Legacy-compatible checkRateLimit function.
 * Used by existing API routes — now backed by Upstash instead of in-memory Map.
 *
 * For new code, use freeToolLimiter or authApiLimiter directly.
 */
export async function checkRateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  if (!hasRedisConfig()) {
    warnLocalFallback();
    return checkLocalRateLimit(key, limit, windowMs);
  }
  try {
    const redis = getRedis();
    const windowKey = `rl:${key}`;
    const now = Date.now();

    // Atomic increment with TTL
    const count = await redis.incr(windowKey);

    if (count === 1) {
      // First request — set expiry
      await redis.pexpire(windowKey, windowMs);
    }

    const ttl = await redis.pttl(windowKey);

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: Math.max(0, ttl),
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      resetIn: Math.max(0, ttl),
    };
  } catch (error) {
    // A bounded per-instance limit is safer than accepting unlimited traffic.
    void error;
    warnLocalFallback();
    return checkLocalRateLimit(key, limit, windowMs);
  }
}

interface ReservationRedis {
  eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown>;
}

export interface RateLimitReservation {
  allowed: boolean;
  token: string | null;
  reason: 'reserved' | 'limit' | 'busy' | 'unavailable';
  remaining: number;
}

export async function reserveRateLimit(
  key: string,
  limit: number = 30,
  reservationMs: number = 120_000,
  redisOverride?: ReservationRedis,
): Promise<RateLimitReservation> {
  try {
    const redis = redisOverride || getRedis();
    const token = randomUUID();
    const result = await redis.eval(
      `-- reserve-monthly-slot
       local count = tonumber(redis.call('GET', KEYS[1]) or '0')
       if count >= tonumber(ARGV[1]) then return {0, count} end
       local held = redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3], 'NX')
       if not held then return {-1, count} end
       return {1, count}`,
      [`rl:${key}`, `rl-reservation:${key}`],
      [limit, token, reservationMs],
    ) as [number, number];
    const [state, count] = result;
    return {
      allowed: state === 1,
      token: state === 1 ? token : null,
      reason: state === 1 ? 'reserved' : state === -1 ? 'busy' : 'limit',
      remaining: Math.max(0, limit - count),
    };
  } catch (error) {
    console.error('[rate-limit] Upstash Redis reservation unavailable:', error);
    return { allowed: false, token: null, reason: 'unavailable', remaining: 0 };
  }
}

export async function commitRateLimitReservation(
  key: string,
  token: string,
  windowMs: number,
  redisOverride?: ReservationRedis,
): Promise<boolean> {
  try {
    const redis = redisOverride || getRedis();
    const result = await redis.eval(
      `-- commit-monthly-slot
       if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
       local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
       redis.call('DEL', KEYS[2])
       return 1`,
      [`rl:${key}`, `rl-reservation:${key}`],
      [token, windowMs],
    );
    return Number(result) === 1;
  } catch (error) {
    console.error('[rate-limit] Failed to commit reservation:', error);
    return false;
  }
}

export async function releaseRateLimitReservation(
  key: string,
  token: string,
  redisOverride?: ReservationRedis,
): Promise<void> {
  try {
    const redis = redisOverride || getRedis();
    await redis.eval(
      `-- release-monthly-slot
       if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
       return 0`,
      [`rl-reservation:${key}`],
      [token],
    );
  } catch (error) {
    console.error('[rate-limit] Failed to release reservation; lease will expire:', error);
  }
}

export async function checkRateLimitStrict(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000,
): Promise<{ allowed: boolean; remaining: number; resetIn: number; unavailable: boolean }> {
  try {
    const redis = getRedis();
    const windowKey = `rl-strict:${key}`;
    const result = await redis.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
       local ttl = redis.call('PTTL', KEYS[1])
       if ttl < 0 then
         redis.call('DEL', KEYS[1])
         return {-1, ttl}
       end
       return {count, ttl}`,
      [windowKey],
      [windowMs],
    ) as [number, number];
    const [count, ttl] = result;
    if (count < 0 || ttl < 0) {
      return { allowed: false, remaining: 0, resetIn: windowMs, unavailable: true };
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn: Math.max(0, ttl),
      unavailable: false,
    };
  } catch (error) {
    console.error('[rate-limit] Strict Upstash Redis check unavailable:', error);
    return { allowed: false, remaining: 0, resetIn: windowMs, unavailable: true };
  }
}
