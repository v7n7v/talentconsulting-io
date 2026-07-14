/**
 * Contact Form API — Routes feedback via Resend
 * POST /api/contact
 * Accepts: { name, email, category, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { monitor } from '@/lib/monitor';
import { EMAIL_FROM, buildContactEmail } from '@/lib/email-templates';
import { getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rate-limit';

const CONTACT_EMAIL = 'alula.gebre@gmail.com';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

/** Escape HTML entities to prevent injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const { allowed, resetIn } = await checkRateLimit(`contact:${ip}`, 3, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(resetIn / 1000)) } }
      );
    }

    const body = await req.json();
    const { name, email, category, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    if (message.length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 chars).' }, { status: 400 });
    }

    const categoryLabel = ({
      bug: 'Bug Report',
      feature: 'Feature Request',
      general: 'General Feedback',
      other: 'Other',
    } as Record<string, string>)[category] || 'General';

    const safeName = escapeHtml(name.slice(0, 200));
    const safeEmail = escapeHtml(email.slice(0, 320));
    const safeMessage = escapeHtml(message);

    const { subject, html } = buildContactEmail(safeName, safeEmail, categoryLabel, safeMessage);

    await getResend().emails.send({
      from: EMAIL_FROM,
      to: [CONTACT_EMAIL],
      replyTo: email.slice(0, 320),
      subject,
      html,
    });

    try {
      await getAdminDb().collection('contact_submissions').add({
        type: 'contact',
        name: safeName,
        email: safeEmail.toLowerCase(),
        category: category || 'general',
        categoryLabel,
        message: safeMessage,
        createdAt: new Date().toISOString(),
        source: 'contact_form',
        status: 'new',
      });
    } catch (persistError) {
      console.error('[api/contact] Failed to persist contact submission:', persistError);
    }

    return NextResponse.json({ success: true, message: 'Feedback sent. We\'ll get back to you soon.' });
  } catch (error) {
    console.error('[api/contact] Error:', error);
    monitor.critical('Tool: contact', String(error));
    return NextResponse.json({ error: 'Failed to send feedback.' }, { status: 500 });
  }
}
