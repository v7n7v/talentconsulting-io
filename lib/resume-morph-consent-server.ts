import { createHash } from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  RESUME_MORPH_ACKNOWLEDGEMENTS,
  RESUME_MORPH_CONSENT_VERSION,
  isValidResumeMorphConsentRecord,
  type ResumeMorphConsentStatus,
} from '@/lib/resume-morph-safety';

export function hashResumeMorphAcknowledgements() {
  return createHash('sha256')
    .update(`${RESUME_MORPH_CONSENT_VERSION}:${RESUME_MORPH_ACKNOWLEDGEMENTS.join('|')}`)
    .digest('hex');
}

export async function getResumeMorphConsentForUser(uid: string): Promise<ResumeMorphConsentStatus> {
  if (!uid || uid.startsWith('anon:')) {
    return {
      unlocked100: false,
      acceptedAt: null,
      consentVersion: RESUME_MORPH_CONSENT_VERSION,
    };
  }

  const snap = await getAdminDb()
    .collection('users')
    .doc(uid)
    .collection('settings')
    .doc('resumeMorphSafety')
    .get();
  const data = snap.exists ? snap.data() || {} : {};
  const unlocked100 = isValidResumeMorphConsentRecord(
    data,
    uid,
    hashResumeMorphAcknowledgements(),
  );

  return {
    unlocked100,
    acceptedAt: typeof data.acceptedAt === 'string' ? data.acceptedAt : null,
    consentVersion: typeof data.consentVersion === 'string' ? data.consentVersion : RESUME_MORPH_CONSENT_VERSION,
    disabledAt: typeof data.disabledAt === 'string' ? data.disabledAt : null,
  };
}
