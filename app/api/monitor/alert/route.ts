/**
 * Internal Monitor Endpoint
 * Receives security events from middleware (Edge runtime)
 * and forwards to Discord via lib/monitor.ts.
 * POST /api/monitor/alert
 *
 * This is an internal-only route — not exposed to users.
 */
import { NextRequest, NextResponse } from 'next/server';
import { monitor } from '@/lib/monitor';

type MonitorSeverity = 'critical' | 'warning' | 'info' | 'metric';
const MONITOR_SEVERITIES = new Set<MonitorSeverity>(['critical', 'warning', 'info', 'metric']);

export async function POST(req: NextRequest) {
  // Simple shared-secret guard — not a user-facing route
  const secret = req.headers.get('x-monitor-secret');
  const expectedSecret = process.env.MONITOR_ALERT_SECRET || process.env.DISCORD_WEBHOOK_URL?.slice(-16);
  if (!expectedSecret || secret !== expectedSecret) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || '0');
    if (contentLength > 20_000) {
      return new NextResponse(null, { status: 413 });
    }
    const { severity, title, details, fields } = await req.json();
    const safeSeverity: MonitorSeverity = MONITOR_SEVERITIES.has(severity) ? severity : 'warning';
    monitor.send(
      safeSeverity,
      {
        title: typeof title === 'string' ? title.slice(0, 200) : 'Security event',
        details: typeof details === 'string' ? details.slice(0, 4000) : '',
        fields: Array.isArray(fields) ? fields.slice(0, 10) : undefined,
      }
    );
    return NextResponse.json({ ok: true });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
