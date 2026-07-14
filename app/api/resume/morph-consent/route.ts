import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateBody } from '@/lib/validate';
import { ResumeMorphConsentSchema } from '@/lib/schemas';
import {
  RESUME_MORPH_ACKNOWLEDGEMENTS,
  RESUME_MORPH_CONSENT_VERSION,
} from '@/lib/resume-morph-safety';
import {
  getResumeMorphConsentForUser,
  hashResumeMorphAcknowledgements,
} from '@/lib/resume-morph-consent-server';
import { monitor } from '@/lib/monitor';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const status = await getResumeMorphConsentForUser(guard.user.uid);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[api/resume/morph-consent] GET error:', error);
    monitor.warn('Resume Morph Consent Read Failed', guard.user.uid);
    return NextResponse.json({ error: 'Failed to load morph consent status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 8, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const validated = await validateBody(req, ResumeMorphConsentSchema);
  if (!validated.success) return validated.error;

  try {
    const { unlock100, typedName, acknowledgements, consentVersion } = validated.data;
    const db = getAdminDb();
    const now = new Date().toISOString();
    const docRef = db
      .collection('users')
      .doc(guard.user.uid)
      .collection('settings')
      .doc('resumeMorphSafety');

    if (!unlock100) {
      await docRef.set({
        unlocked100: false,
        disabledAt: now,
        disabledByUid: guard.user.uid,
        updatedAt: now,
      }, { merge: true });
      return NextResponse.json(await getResumeMorphConsentForUser(guard.user.uid));
    }

    const cleanName = (typedName || '').trim();
    if (cleanName.length < 2) {
      return NextResponse.json({ error: 'Type your name to unlock 100% Morph.' }, { status: 400 });
    }

    if (consentVersion !== RESUME_MORPH_CONSENT_VERSION) {
      return NextResponse.json({ error: 'Consent version is out of date. Reload Settings and try again.' }, { status: 409 });
    }

    const provided = new Set(acknowledgements || []);
    const acceptedAll = RESUME_MORPH_ACKNOWLEDGEMENTS.every((text) => provided.has(text));
    if (!acceptedAll) {
      return NextResponse.json({ error: 'All acknowledgements are required before unlocking 100% Morph.' }, { status: 400 });
    }

    await docRef.set({
      unlocked100: true,
      acceptedAt: now,
      acceptedByUid: guard.user.uid,
      acceptedByEmail: guard.user.email || null,
      typedName: cleanName,
      consentVersion: RESUME_MORPH_CONSENT_VERSION,
      acknowledgementHash: hashResumeMorphAcknowledgements(),
      acknowledgements: RESUME_MORPH_ACKNOWLEDGEMENTS,
      disabledAt: null,
      updatedAt: now,
    }, { merge: true });

    monitor.metric('Resume Morph 100 Unlock', 'User enabled 100% Morph', [
      { name: 'UID', value: guard.user.uid.slice(0, 8) + '...' },
      { name: 'Consent version', value: RESUME_MORPH_CONSENT_VERSION },
    ]);

    return NextResponse.json(await getResumeMorphConsentForUser(guard.user.uid));
  } catch (error) {
    console.error('[api/resume/morph-consent] POST error:', error);
    monitor.critical('Tool: resume/morph-consent', String(error));
    return NextResponse.json({ error: 'Failed to update morph consent status' }, { status: 500 });
  }
}
