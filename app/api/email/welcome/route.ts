/**
 * Welcome Email API — POST /api/email/welcome
 * Sends a welcome email after signup.
 * Rate-limited to 1 per email per day to prevent abuse.
 */
import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@/lib/email';
import { monitor } from '@/lib/monitor';
import { authenticateRequest } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminAuth } from '@/lib/firebase-admin';

// Simple dedup: track emails sent in the last 24h
const sentMap = new Map<string, number>();
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const authUser = await authenticateRequest(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // New Firebase email/password accounts are authenticated before their email
    // is verified. Resolve the address from the authenticated UID without
    // weakening the shared helper's verified-email boundary.
    const userRecord = await getAdminAuth().getUser(authUser.uid);
    if (!userRecord.email) {
      return NextResponse.json({ error: 'Authenticated account has no email' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const { allowed } = await checkRateLimit(`welcome-email:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many welcome email requests' }, { status: 429 });
    }

    const { email, name } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }
    if (normalizedEmail !== userRecord.email.toLowerCase()) {
      return NextResponse.json({ error: 'Email does not match authenticated user' }, { status: 403 });
    }

    // Rate limit: 1 welcome email per address per day
    const lastSent = sentMap.get(normalizedEmail);
    if (lastSent && Date.now() - lastSent < DAY_MS) {
      return NextResponse.json({ sent: false, reason: 'already_sent_today' });
    }

    const displayName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : normalizedEmail.split('@')[0] || 'there';
    const success = await sendWelcomeEmail(normalizedEmail, displayName);

    if (success) {
      sentMap.set(normalizedEmail, Date.now());
      // Cleanup old entries periodically
      if (sentMap.size > 500) {
        const cutoff = Date.now() - DAY_MS;
        for (const [key, ts] of sentMap) {
          if (ts < cutoff) sentMap.delete(key);
        }
      }
    }

    return NextResponse.json({ sent: success });
  } catch (error) {
    console.error('[api/email/welcome] Error:', error);
    monitor.critical('Tool: email/welcome', String(error));
    return NextResponse.json({ error: 'Failed to send welcome email' }, { status: 500 });
  }
}
