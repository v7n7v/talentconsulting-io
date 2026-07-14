import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyJobAlertUnsubscribeToken } from '@/lib/job-alerts-unsubscribe';
import { monitor } from '@/lib/monitor';

function html(title: string, body: string, status = 200) {
  return new NextResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{margin:0;background:#0b0f14;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    main{min-height:100dvh;display:grid;place-items:center;padding:24px}
    section{max-width:520px;border:1px solid rgba(148,163,184,.2);background:#111827;border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.25)}
    h1{font-size:24px;margin:0 0 10px}
    p{color:#cbd5e1;line-height:1.6;margin:0 0 18px}
    a{color:#67e8f9;text-decoration:none;font-weight:700}
  </style>
</head>
<body><main><section><h1>${title}</h1><p>${body}</p><a href="/suite/settings">Open settings</a></section></main></body>
</html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid') || '';
  const token = searchParams.get('token');

  if (!verifyJobAlertUnsubscribeToken(uid, token)) {
    return html('Unsubscribe link expired', 'This Sona Picks unsubscribe link is invalid. You can still manage notifications from account settings.', 400);
  }

  try {
    const now = new Date().toISOString();
    await getAdminDb().collection('users').doc(uid).collection('settings').doc('jobPreferences').set({
      jobAlertsEnabled: false,
      jobAlertsUnsubscribedAt: now,
      lastUpdated: now,
    }, { merge: true });
    await getAdminDb().collection('users').doc(uid).collection('jobAlertEvents').add({
      type: 'digest_unsubscribe',
      source: searchParams.get('source') || 'email',
      createdAt: now,
    }).catch(() => {});

    return html('Sona Picks paused', 'You will no longer receive crafted job alerts. Transactional account emails are unchanged.');
  } catch (error) {
    monitor.critical('Tool: jobs/unsubscribe', String(error));
    return html('Something went wrong', 'We could not update your Sona Picks subscription. Please open settings and turn job alerts off.', 500);
  }
}
