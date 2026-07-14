import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeJobAlertsFrequency } from '@/lib/job-alerts';
import { monitor } from '@/lib/monitor';

function leadId(email: string) {
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const authUser = await authenticateRequest(req).catch(() => null);
    const now = new Date().toISOString();
    const frequency = normalizeJobAlertsFrequency(body.frequency || 'weekly', 'free');
    const attribution = {
      utmSource: body.utmSource || body.utm_source || null,
      utmCampaign: body.utmCampaign || body.utm_campaign || null,
      utmContent: body.utmContent || body.utm_content || null,
      referrer: body.referrer || null,
      sourcePath: body.sourcePath || null,
    };

    await getAdminDb().collection('newsletterLeads').doc(leadId(email)).set({
      email,
      uid: authUser?.uid || null,
      product: 'sona_picks',
      frequency,
      status: 'captured',
      attribution,
      updatedAt: now,
      createdAt: body.createdAt || now,
    }, { merge: true });

    if (authUser?.uid) {
      await getAdminDb().collection('users').doc(authUser.uid).collection('jobAlertEvents').add({
        type: 'newsletter_subscribe',
        source: attribution.sourcePath || 'public_capture',
        frequency,
        createdAt: now,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, captured: true, frequency });
  } catch (error) {
    monitor.critical('Tool: newsletter/lead', String(error));
    return NextResponse.json({ error: 'Failed to capture subscription' }, { status: 500 });
  }
}
