/**
 * API Route Auth Helper
 * Verifies Firebase ID token from Authorization header.
 * Free tier: lifetime cap of 3 uses per tool (Firestore-backed, never resets).
 * Pro/GOD: per-minute rate limits only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from './firebase-admin';
import { checkRateLimit } from './rate-limit';
import { getUserTier, getRateLimit as getTierRateLimit, isMasterAccount, type PlanTier } from './pricing-tiers';
import { checkUsageAllowed, incrementUsage, FREE_CAPS, ANON_CAPS, type UsageFeature } from './usage-tracker';
import { monitor } from './monitor';
import { featureLabel, limitReachedBody } from './product-copy';
import { DEMO_USER_EMAIL, DEMO_USER_ID, isDemoAuthRequest, isDemoModeEnabled } from './demo-mode';

interface AuthResult {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  tier: PlanTier;
}

/** Route → UsageFeature mapping for lifetime cap enforcement.
 *
 * A route belongs here only if it also *increments* the counter it is capped on.
 * '/api/resume/ai', '/api/resume/parse' and '/api/vault/export-plan' used to
 * borrow 'resumeChecks', whose only writer is app/api/resume/check/route.ts.
 * While that route 403'd every free user the counter never moved, so the three
 * borrowers were never actually capped. Honouring the check route's own contract
 * started the counter moving — and would have meant three Quality Scans locking
 * a free user out of uploading a resume at all, under a message naming a tool
 * they were not using. Resume upload is the product's first step and
 * '/api/resume/parse' is explicitly `allowAnonymous`; capping it on someone
 * else's meter is not a cap, it is a bug. All three keep their per-minute rate
 * limit; none of them consumes a lifetime allowance.
 */
const ROUTE_FEATURE_MAP: Record<string, UsageFeature> = {
  '/api/resume/morph':            'morphs',
  '/api/resume/ai':               'resumeAssists',
  '/api/resume/parse':            'resumeParses',
  '/api/vault/export-plan':       'vaultExports',
  '/api/gauntlet/grade':          'gauntlets',
  '/api/gauntlet/generate':       'gauntlets',
  '/api/market-oracle':           'jdGenerations',
  '/api/chat':                    'gauntlets',
  '/api/ai':                      'gauntlets',
};

function getFeatureForRoute(pathname: string): UsageFeature | null {
  for (const [route, feature] of Object.entries(ROUTE_FEATURE_MAP)) {
    if (pathname.startsWith(route)) return feature;
  }
  return null;
}

/** Extract client IP — checks Cloudflare, proxy, and direct headers */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Authenticate via Firebase ID token in Authorization header.
 */
export async function authenticateRequest(req: NextRequest): Promise<Omit<AuthResult, 'tier'> | null> {
  if (isDemoAuthRequest(req)) {
    return { uid: DEMO_USER_ID, email: DEMO_USER_EMAIL, emailVerified: true };
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  const decoded = await verifyIdToken(token);
  if (!decoded) return null;

  const emailVerified = decoded.email_verified === true;
  return { uid: decoded.uid, email: emailVerified ? decoded.email : undefined, emailVerified };
}

/**
 * Guard an API route:
 * 1. Requires valid Firebase auth (account required) unless allowAnonymous is set
 * 2. Anonymous users: same 3-per-tool hard cap as free tier (in-memory, 24h rolling window per IP)
 * 3. Free users: lifetime 3-use cap per tool (Firestore-persisted, never resets)
 * 4. Pro/GOD: per-minute rate limits only
 * 5. All unauthenticated requests: speed-throttled per IP
 *
 * The identity is surfaced on the rejection branch too.
 *
 * Without it a caller that needs to know who was rejected — /api/gauntlet/parse-resume
 * has to find and delete the Storage object a throttled request already
 * uploaded — has no choice but to call authenticateRequest a second time, which
 * means a second verifyIdToken on every rejected request. That is exactly the
 * unthrottled amplification the rate limiter is there to prevent, reintroduced
 * by the code that runs right after it. `identity` is null when the caller
 * presented no valid credential at all.
 */
export async function guardApiRoute(
  req: NextRequest,
  options?: { rateLimit?: number; rateLimitWindow?: number; feature?: UsageFeature; allowAnonymous?: boolean; skipUsageCap?: boolean }
): Promise<
  | { user: AuthResult; error?: never }
  | { user?: never; error: NextResponse; identity: Omit<AuthResult, 'tier'> | null }
> {

  const ip = getClientIp(req);
  const pathname = new URL(req.url).pathname;

  // Auth check
  const authUser = await authenticateRequest(req);
  if (!authUser) {
    // Per-minute speed throttle for all unauthenticated requests
    const anonLimit = options?.allowAnonymous ? (options.rateLimit ?? 5) : 20;
    const { allowed: speedOk } = await checkRateLimit(`unauth:${ip}`, anonLimit, options?.rateLimitWindow ?? 60_000);
    if (!speedOk) {
      monitor.warn('Unauth Rate Limit Hit', `IP: ${ip}`, [
        { name: 'Path', value: pathname },
        { name: 'Limit', value: String(anonLimit) + '/min' },
      ]);
      return {
        identity: authUser,
        error: NextResponse.json(
          { error: 'Too many requests. Create a free account to continue.', requiresAuth: true },
          { status: 429, headers: { 'Retry-After': '60' } }
        ),
      };
    }

    // If route allows anonymous access (freemium try-before-buy)
    if (options?.allowAnonymous) {
      // ── ANONYMOUS HARD CAP: 1 taste test per tool — then force signup ──
      // Tracked in-memory per IP. 30-day window = effectively permanent per server uptime.
      // Only a server restart or IP change resets this — same friction as clearing cookies.
      const feature = options.feature ?? getFeatureForRoute(pathname);
      if (feature && !options.skipUsageCap) {
        const cap = ANON_CAPS[feature] ?? 1;
        const capKey = `anon-cap:${ip}:${feature}`;
        const { allowed: capOk } = await checkRateLimit(capKey, cap, 30 * 24 * 60 * 60 * 1000); // 30-day window
        if (!capOk) {
          monitor.warn('Anon Cap Exhausted', `IP: ${ip}`, [
            { name: 'Feature', value: feature },
            { name: 'Cap', value: String(cap) },
            { name: 'Path', value: pathname },
          ]);
          return {
            identity: authUser,
            error: NextResponse.json(
              {
                error: `You've used your free trial. Create an account to unlock ${FREE_CAPS[feature]} free uses and keep your progress.`,
                requiresAuth: true,
                limitReached: true,
                feature,
                used: cap,
                cap,
                remaining: 0,
              },
              { status: 429, headers: { 'X-Usage-Cap': String(cap), 'X-RateLimit-Tier': 'anonymous' } }
            ),
          };
        }
      }

      return { user: { uid: `anon:${ip}`, email: undefined, tier: 'free' as PlanTier } };
    }

    return {
      identity: authUser,
      error: NextResponse.json(
        { error: 'Account required. Sign in to use this feature.', requiresAuth: true },
        { status: 401 }
      ),
    };
  }

  if (isDemoModeEnabled() && authUser.uid === DEMO_USER_ID) {
    return { user: { ...authUser, tier: 'studio' as PlanTier } };
  }

  // Resolve tier
  const tier = await getUserTier(authUser.uid, authUser.email);

  // GOD/Master accounts bypass everything
  if (isMasterAccount(authUser.email)) {
    return { user: { ...authUser, tier } };
  }

  // ── AUTHENTICATED SPEED LIMIT: Applies to free, pro, and studio users ──
  const limit = options?.rateLimit ?? getTierRateLimit(pathname, tier);
  const rateLimitKey = `${ip}:${authUser.uid}:${pathname}`;
  const { allowed, remaining, resetIn } = await checkRateLimit(rateLimitKey, limit, options?.rateLimitWindow ?? 60_000);

  if (!allowed) {
    monitor.warn('Authenticated Rate Limit Hit', `Tier: ${tier}`, [
      { name: 'UID', value: authUser.uid.slice(0, 8) + '…' },
      { name: 'Path', value: pathname },
      { name: 'Tier', value: tier },
    ]);
    return {
      identity: authUser,
      error: NextResponse.json(
        {
          error: 'Rate limit reached. Please wait a moment before trying again.',
          tier,
          retryAfter: Math.ceil(resetIn / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(resetIn / 1000)),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Tier': tier,
          },
        }
      ),
    };
  }

  // ── FREE TIER: Lifetime cap check ──
  if (tier === 'free') {
    const feature = options?.feature ?? getFeatureForRoute(pathname);
    if (feature && !options?.skipUsageCap) {
      const usage = await checkUsageAllowed(authUser.uid, feature, tier);
      if (!usage.allowed) {
        monitor.metric('Free Cap Hit', `User exhausted ${feature}`, [
          { name: 'UID', value: authUser.uid.slice(0, 8) + '…' },
          { name: 'Feature', value: feature },
          { name: 'Used', value: `${usage.used}/${usage.cap}` },
        ]);
        return {
          identity: authUser,
          error: NextResponse.json(
            {
              error: limitReachedBody(feature),
              limitReached: true,
              feature,
              used: usage.used,
              cap: usage.cap,
              remaining: 0,
              upgradeUrl: '/suite/upgrade',
              upgrade: `Unlock higher ${featureLabel(feature)} limits`,
            },
            {
              status: 429,
              headers: {
                'X-Usage-Cap': String(usage.cap),
                'X-Usage-Used': String(usage.used),
                'X-RateLimit-Tier': 'free',
              },
            }
          ),
        };
      }

      // Increment AFTER we confirm they're allowed — returns user context so route can use it
      // The actual increment happens post-response in each route handler via incrementUsage()
    }
  }

  return { user: { ...authUser, tier } };
}

/** Helper: call this in route handlers after a successful free-tier response to record usage */
export { incrementUsage };
export type { UsageFeature };
