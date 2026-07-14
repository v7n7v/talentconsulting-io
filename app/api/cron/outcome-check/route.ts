/**
 * Outcome Check Cron — /api/cron/outcome-check
 * 
 * Triggered by Cloud Scheduler every Wednesday at 10am.
 * Finds users with "applied" applications 10+ days old without outcomes,
 * sends a short outcome check-in email.
 * 
 * Setup:
 *   1. Set CRON_SECRET env var
 *   2. Cloud Scheduler:
 *      URL:  https://talentconsulting.io/api/cron/outcome-check
 *      Method: POST
 *      Headers: Authorization: Bearer <CRON_SECRET>
 *      Schedule: 0 10 * * 3 (every Wednesday at 10am)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { Resend } from 'resend';
import { monitor } from '@/lib/monitor';
import { EMAIL_FROM, buildOutcomeCheckEmail } from '@/lib/email-templates';
import { logUserCommunication } from '@/lib/communications';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const results: { uid: string; status: string; appCount?: number; error?: string }[] = [];
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;

  try {
    const usersSnap = await db.collection('users').listDocuments();

    for (const userDocRef of usersSnap.slice(0, 100)) {
      const uid = userDocRef.id;

      try {
        // Get user email
        const profileSnap = await db.collection('users').doc(uid).collection('profile').doc('main').get();
        const email = profileSnap.data()?.email;
        if (!email) { results.push({ uid, status: 'skip:no-email' }); continue; }

        // Check email notification preference
        const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();
        if (prefsSnap.exists && prefsSnap.data()?.emailNotifications === false) {
          results.push({ uid, status: 'skip:notif-off' });
          continue;
        }

        // Find applied apps 10+ days old without outcomes
        const appsSnap = await db.collection('users').doc(uid).collection('applications').get();
        const pendingApps = appsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((app: any) => {
            if (app.outcome_response) return false;
            if (app.status !== 'applied') return false;
            const appliedAt = app.applied_at || app.created_at;
            return new Date(appliedAt).getTime() < tenDaysAgo;
          })
          .map((app: any) => ({
            company: app.company_name,
            jobTitle: app.job_title || 'Position',
            daysAgo: Math.floor((Date.now() - new Date(app.applied_at || app.created_at).getTime()) / (1000 * 60 * 60 * 24)),
            appId: app.id,
          }))
          .slice(0, 5);

        if (pendingApps.length === 0) {
          results.push({ uid, status: 'skip:no-pending' });
          continue;
        }

        // Build and send email
        const name = profileSnap.data()?.fullName?.split(' ')[0] || 'there';
        const { subject, html } = buildOutcomeCheckEmail(name, pendingApps);

        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) {
          results.push({ uid, status: 'skip:no-resend-key' });
          continue;
        }

        const resend = new Resend(resendKey);
        await resend.emails.send({ from: EMAIL_FROM, to: email, subject, html });
        await logUserCommunication({
          uid,
          email,
          subject,
          bodyPreview: `Outcome check-in sent for ${pendingApps.length} pending application${pendingApps.length === 1 ? '' : 's'}.`,
          template: 'application_outcome_check',
          sentBy: 'cron/outcome-check',
          metadata: { pendingApplicationCount: pendingApps.length },
        }).catch(error => {
          console.error('[cron/outcome-check] Failed to log communication:', error);
        });

        results.push({ uid, status: 'sent', appCount: pendingApps.length });
      } catch (err: any) {
        results.push({ uid, status: 'error', error: err.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    monitor.info('Outcome Check Cron', `Sent ${sent} check-in emails`, [
      { name: 'Total Users', value: String(results.length) },
      { name: 'Sent', value: String(sent) },
    ]);

    return NextResponse.json({ success: true, results, summary: { total: results.length, sent } });
  } catch (err: any) {
    console.error('[cron/outcome-check] Fatal error:', err);
    monitor.critical('Tool: cron/outcome-check', String(err));
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
