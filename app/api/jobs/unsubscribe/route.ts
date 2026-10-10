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
    :root{--paper:#fffaf5;--ink:#151515;--muted:#6e6964;--line:#ded7cf;--soft:#f2ebe3;--coral-ink:#a82c18;--shadow:#c6b6ff}
    body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    main{min-height:100dvh;display:grid;place-items:center;padding:24px}
    section{max-width:520px;border:1px solid var(--line);background:var(--paper);border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(198,182,255,.24)}
    h1{font-size:24px;margin:0 0 10px}
    p{color:var(--muted);line-height:1.6;margin:0 0 18px}
    a{color:var(--coral-ink);text-decoration:none;font-weight:700}
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
    return html('Unsubscribe link expired', 'This Career Picks by Taco unsubscribe link is invalid. You can still manage notifications from account settings.', 400);
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

    return html('Career Picks by Taco paused', 'You will no longer receive crafted job alerts. Transactional account emails are unchanged.');
  } catch (error) {
    monitor.critical('Tool: jobs/unsubscribe', String(error));
    return html('Something went wrong', 'We could not update your Career Picks by Taco subscription. Please open settings and turn job alerts off.', 500);
  }
}
