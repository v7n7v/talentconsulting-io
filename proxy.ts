/**
 * Next.js Proxy — Security Hardening Layer
 * 
 * Responsibilities:
 * 1. Inject security headers on every response
 * 2. Lightweight Bearer token presence check for API routes
 * 3. Bot/scanner fingerprint blocking
 * 4. Route matching for protected paths
 * 
 * Note: Full token verification happens in guardApiRoute().
 * This is a fast network-level gatekeeper.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Track repeated 401s per IP for abuse detection
const authFailures = new Map<string, { count: number; resetAt: number }>();

/** Fire-and-forget alert to internal monitor endpoint (Proxy-safe) */
function edgeAlert(req: NextRequest, severity: string, title: string, details: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const monitorSecret = process.env.MONITOR_ALERT_SECRET || webhookUrl?.slice(-16);
  if (!monitorSecret) return;
  const origin = req.nextUrl.origin;
  fetch(`${origin}/api/monitor/alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-monitor-secret': monitorSecret },
    body: JSON.stringify({ severity, title, details }),
  }).catch(() => {});
}

// API routes that explicitly allow unauthenticated access
const PUBLIC_API_PATHS = [
  '/api/auth',
  '/api/billing/prices',
  '/api/health',
  '/api/contact',
  '/api/stripe/webhook',
  '/api/webhooks/resend',
  '/api/teams/interest',
  '/api/monitor/alert',
  '/api/newsletter/lead',
  '/api/jobs/unsubscribe',
];

// Routes that allow optionally-authenticated access (freemium anonymous)
const FREEMIUM_API_PATHS = [
  '/api/gauntlet/generate',
  '/api/gauntlet/grade',
  '/api/gauntlet/parse-resume',
  '/api/chat',
  '/api/jobs/portal',
  '/api/jobs/search',
  '/api/resume/ats-score',
  '/api/resume/ai',
  '/api/resume/morph',
  '/api/resume/parse',
  '/api/writing/humanize-free',
  '/api/gallery/run',
  '/api/tools/free',
  '/api/onboarding',
];

// Known scanner/exploit paths to reject instantly
const BLOCKED_PATHS = [
  '/wp-admin', '/wp-login', '/xmlrpc.php', '/.env',
  '/admin/config', '/cgi-bin', '/phpmyadmin',
  '/actuator', '/.git', '/debug', '/trace',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 0. MAINTENANCE MODE GATE ──
  // When MAINTENANCE_MODE=true, redirect everything to /maintenance
  // except: the maintenance page itself, static assets, health check, and admin API
  if (process.env.MAINTENANCE_MODE === 'true') {
    const isExempt =
      pathname === '/maintenance' ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.includes('.') ||
      pathname === '/api/health' ||
      pathname === '/api/stripe/webhook' ||
      pathname === '/api/webhooks/resend' ||
      pathname.startsWith('/api/admin/settings') ||
      pathname.startsWith('/api/monitor');

    if (!isExempt) {
      const url = request.nextUrl.clone();
      url.pathname = '/maintenance';
      return NextResponse.redirect(url);
    }
  }

  // If user manually goes to /maintenance when mode is OFF, send them home
  if (pathname === '/maintenance' && process.env.MAINTENANCE_MODE !== 'true') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // ── 1. Block known scanner paths instantly ──
  if (BLOCKED_PATHS.some(p => pathname.toLowerCase().startsWith(p))) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    edgeAlert(request, 'critical', 'Scanner Path Detected', `IP: ${ip}\nPath: ${pathname}`);
    return new NextResponse(null, { status: 404 });
  }

  // ── 2. Allow static assets and public pages through ──
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/help' ||
    pathname.startsWith('/templates') ||
    pathname.startsWith('/tools') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/for-teams')
  ) {
    return addSecurityHeaders(NextResponse.next(), request);
  }

  // ── 3. Public API routes — no auth required ──
  if (PUBLIC_API_PATHS.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next(), request);
  }

  // ── 4. Freemium API routes — allow without Bearer but let guardApiRoute handle caps ──
  if (FREEMIUM_API_PATHS.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next(), request);
  }

  // ── 5. All other API routes: require Bearer token presence ──
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      // Track repeated auth failures per IP
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const now = Date.now();
      const entry = authFailures.get(ip);
      if (!entry || now > entry.resetAt) {
        authFailures.set(ip, { count: 1, resetAt: now + 60_000 });
      } else {
        entry.count++;
        if (entry.count === 5) {
          edgeAlert(request, 'warning', 'Repeated Auth Failures', `IP: ${ip}\n5 unauthenticated API requests in 1 minute\nLatest: ${pathname}`);
        }
      }
      // `requiresAuth` is the flag every client gate reads (hooks/useAuthGate.tsx
      // and the resume page's handlers) to open a sign-in modal instead of a red
      // error toast. lib/api-auth.ts sets it on its own 401; the edge stops
      // non-freemium routes before that code runs, so without it here a
      // signed-out visitor on, say, /suite/resume got "Authentication required"
      // as a failure message and no way to act on it.
      const unauthorized = NextResponse.json(
        { error: 'Authentication required. Please sign in.', requiresAuth: true },
        { status: 401 },
      );
      unauthorized.headers.set('Cache-Control', 'private, no-store, max-age=0');
      unauthorized.headers.set('Vary', 'Authorization');
      return addSecurityHeaders(unauthorized, request);
    }
    return addSecurityHeaders(NextResponse.next(), request);
  }

  // ── 6. Protected suite pages — pass through (page-level guards handle auth) ──
  return addSecurityHeaders(NextResponse.next(), request);
}

/**
 * Inject security headers on every response.
 * These supplement the headers in next.config.js (which only apply to static responses).
 * Proxy headers apply to ALL responses including API routes.
 */
function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable unused browser APIs
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(self)');
  // HSTS — force HTTPS for 2 years
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Cross-Origin-Opener-Policy — only on API routes.
  // Page routes need popup auth (Firebase signInWithPopup) which requires window.opener,
  // so COOP must NOT be set there.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  }
  // Restrict cross-origin resource access for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  }
  // Prevent leaking server info
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/suite/:path*',
    '/dashboard/:path*',
    '/settings/:path*',
    '/maintenance',
    // Catch all pages for maintenance redirect
    '/((?!_next/static|_next/image|favicon).*)',
    // Block scanner paths before route handlers
    '/wp-admin/:path*',
    '/wp-login.php',
    '/.env',
    '/.git/:path*',
  ],
};
