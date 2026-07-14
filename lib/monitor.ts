/**
 * Real-Time Monitor — Discord Alert System
 * Routes alerts to dedicated channels by severity.
 *
 * Channels:
 *  #alerts-critical → 🔴 CRITICAL + 🟠 WARNING (tool down, security, abuse)
 *  #alerts-business → 🟢 INFO + 🔵 METRIC (signups, subscriptions, stats)
 *  General fallback → DISCORD_WEBHOOK_URL (if channel-specific not set)
 *
 * Deduplication: same alert suppressed for 5 minutes.
 * Fire-and-forget: never blocks the API response.
 */

type Severity = 'critical' | 'warning' | 'info' | 'metric';

interface AlertOptions {
  title: string;
  details?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Skip dedup (for unique events like signups) */
  unique?: boolean;
}

const COLORS: Record<Severity, number> = {
  critical: 0xff0000,  // Red
  warning:  0xff8c00,  // Orange
  info:     0x10b981,  // Emerald
  metric:   0x3b82f6,  // Blue
};

const ICONS: Record<Severity, string> = {
  critical: '🔴',
  warning:  '🟠',
  info:     '🟢',
  metric:   '🔵',
};

/** Get the right webhook URL based on severity */
function getWebhookUrl(severity: Severity): string | undefined {
  switch (severity) {
    case 'critical':
    case 'warning':
      return process.env.DISCORD_WEBHOOK_CRITICAL || process.env.DISCORD_WEBHOOK_URL;
    case 'info':
    case 'metric':
      return process.env.DISCORD_WEBHOOK_BUSINESS || process.env.DISCORD_WEBHOOK_URL;
    default:
      return process.env.DISCORD_WEBHOOK_URL;
  }
}

// Deduplication cache — prevents spam for the same alert
const recentAlerts = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Clean up dedup cache every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentAlerts) {
    if (now - timestamp > DEDUP_WINDOW_MS) recentAlerts.delete(key);
  }
}, 120_000);

function isDuplicate(key: string): boolean {
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return true;
  recentAlerts.set(key, Date.now());
  return false;
}

async function sendToDiscord(severity: Severity, opts: AlertOptions): Promise<void> {
  const webhookUrl = getWebhookUrl(severity);
  if (!webhookUrl) return;

  // Dedup check (unless explicitly unique)
  if (!opts.unique) {
    const dedupKey = `${severity}:${opts.title}`;
    if (isDuplicate(dedupKey)) return;
  }

  const embed: Record<string, unknown> = {
    title: `${ICONS[severity]} ${opts.title}`,
    color: COLORS[severity],
    timestamp: new Date().toISOString(),
    footer: { text: 'TalentConsulting.io Monitor' },
  };

  if (opts.details) embed.description = opts.details;
  if (opts.fields?.length) {
    embed.fields = opts.fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: f.inline ?? true,
    }));
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    // Never throw — monitoring should not break the app
    console.error('[monitor] Discord send failed:', err);
  }
}

// ═══════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════

export const monitor = {
  /** 🔴 Tool failure, security breach, service down → #alerts-critical */
  critical(title: string, details?: string, fields?: AlertOptions['fields']) {
    sendToDiscord('critical', { title, details, fields }).catch(() => {});
  },

  /** 🟠 Rate limit abuse, repeated auth failures → #alerts-critical */
  warn(title: string, details?: string, fields?: AlertOptions['fields']) {
    sendToDiscord('warning', { title, details, fields }).catch(() => {});
  },

  /** 🟢 New signup, subscription, trial event → #alerts-business */
  info(title: string, details?: string, fields?: AlertOptions['fields']) {
    sendToDiscord('info', { title, details, fields, unique: true }).catch(() => {});
  },

  /** 🔵 Daily stats, conversion events → #alerts-business */
  metric(title: string, details?: string, fields?: AlertOptions['fields']) {
    sendToDiscord('metric', { title, details, fields }).catch(() => {});
  },

  /** Direct send with full control */
  send(severity: Severity, opts: AlertOptions) {
    sendToDiscord(severity, opts).catch(() => {});
  },
};

// ═══════════════════════════════════════
// ROUTE HANDLER WRAPPER
// ═══════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>;

/**
 * Wraps a Next.js route handler with automatic error monitoring.
 * On any uncaught error, sends a 🔴 CRITICAL alert to Discord
 * and returns a clean 500 response.
 *
 * Usage:
 *   export const POST = withMonitor('resume/morph', async (req) => { ... });
 */
export function withMonitor(routeName: string, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: any): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 3).join('\n') : '';

      console.error(`[${routeName}] Uncaught error:`, err);

      monitor.critical(`Tool Failure: ${routeName}`, message, [
        { name: 'Route', value: `/api/${routeName}`, inline: true },
        { name: 'Method', value: req.method, inline: true },
        ...(stack ? [{ name: 'Stack', value: `\`\`\`${stack.slice(0, 500)}\`\`\``, inline: false }] : []),
      ]);

      return NextResponse.json(
        { error: 'Something went wrong. Our team has been notified.' },
        { status: 500 }
      );
    }
  };
}
