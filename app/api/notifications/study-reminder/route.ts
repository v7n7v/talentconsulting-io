/**
 * Study Reminder Email API
 * Sends daily progress email for Skill Bridge study plans.
 * Uses shared email template system + Resend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { guardApiRoute } from '@/lib/api-auth';
import { validateBody } from '@/lib/validate';
import { StudyReminderSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';
import { EMAIL_FROM, buildStudyReminderEmail } from '@/lib/email-templates';
import { logUserCommunication } from '@/lib/communications';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set');
    _resend = new Resend(key);
  }
  return _resend;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 2, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const validated = await validateBody(req, StudyReminderSchema);
    if (!validated.success) return validated.error;
    const { skills, userName, email } = validated.data;
    const targetEmail = email.trim().toLowerCase();
    if (!guard.user.email || targetEmail !== guard.user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Reminder email must match the signed-in account.' }, { status: 403 });
    }

    const totalCompleted = skills.reduce((sum, s) => sum + (s.completedDays || 0), 0);
    const totalDays = skills.reduce((sum, s) => sum + (s.totalDays || 7), 0);
    const streak = skills.reduce((max, s) => Math.max(max, s.completedDays || 0), 0);

    const { subject, html } = buildStudyReminderEmail(
      userName || 'there',
      skills,
      totalCompleted,
      totalDays,
      streak,
    );

    await getResend().emails.send({
      from: EMAIL_FROM,
      to: [targetEmail],
      subject,
      html,
    });
    await logUserCommunication({
      uid: guard.user.uid,
      email: targetEmail,
      subject,
      bodyPreview: `Skill Bridge reminder for ${skills.length} skill plan${skills.length === 1 ? '' : 's'}.`,
      template: 'skill_bridge_study_reminder',
      sentBy: 'notifications/study-reminder',
      metadata: { skillCount: skills.length, totalCompleted, totalDays, streak },
    }).catch(error => {
      console.error('[api/notifications/study-reminder] Failed to log communication:', error);
    });

    return NextResponse.json({ sent: true, subject });
  } catch (error: unknown) {
    console.error('[api/notifications/study-reminder] Error:', error);
    monitor.critical('Tool: notifications/study-reminder', String(error));
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
