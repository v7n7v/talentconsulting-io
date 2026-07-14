import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const RECEIPT_VERSION = 1;
const RECEIPT_TTL_MS = 5 * 60 * 1000;

export interface SonaActivationReceiptPayload {
  version: 1;
  uid: string;
  nonce: string;
  resumeVersionId: string;
  targetRole: string;
  location: string;
  salaryTarget: number;
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  mode: 'scout';
  notify: false;
  maxPackets: 3;
  issuedAt: string;
  expiresAt: string;
}

export type SonaActivationReceiptVerification =
  | { ok: true; payload: SonaActivationReceiptPayload }
  | { ok: false; code: 'PREFLIGHT_REQUIRED' | 'PREFLIGHT_INVALID' | 'PREFLIGHT_EXPIRED' | 'PREFLIGHT_WRONG_USER' };

function getReceiptSecret(explicitSecret?: string) {
  const rootSecret = explicitSecret
    || process.env.SONA_PREFLIGHT_SECRET
    || process.env.CRON_SECRET
    || process.env.STRIPE_WEBHOOK_SECRET
    || '';
  if (rootSecret.length < 24) throw new Error('Sona preflight receipt signing is not configured.');
  return createHash('sha256').update(`sona-preflight-receipt:v1:${rootSecret}`).digest('hex');
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function isValidPayload(value: any): value is SonaActivationReceiptPayload {
  return value?.version === RECEIPT_VERSION
    && typeof value.uid === 'string'
    && /^[0-9a-f-]{36}$/i.test(String(value.nonce || ''))
    && /^[A-Za-z0-9_-]{1,180}$/.test(String(value.resumeVersionId || ''))
    && typeof value.targetRole === 'string'
    && value.targetRole.length >= 2
    && value.targetRole.length <= 160
    && typeof value.location === 'string'
    && value.location.length >= 2
    && value.location.length <= 160
    && Number.isInteger(value.salaryTarget)
    && value.salaryTarget >= 0
    && value.salaryTarget <= 1_000_000
    && ['remote', 'hybrid', 'onsite', 'any'].includes(value.remotePreference)
    && value.mode === 'scout'
    && value.notify === false
    && value.maxPackets === 3
    && typeof value.issuedAt === 'string'
    && typeof value.expiresAt === 'string';
}

export function createSonaActivationReceipt(params: {
  uid: string;
  resumeVersionId: string;
  targetRole: string;
  location: string;
  salaryTarget: number;
  remotePreference: SonaActivationReceiptPayload['remotePreference'];
  now?: Date;
  secret?: string;
}) {
  const now = params.now || new Date();
  const expiresAt = new Date(now.getTime() + RECEIPT_TTL_MS);
  const payload: SonaActivationReceiptPayload = {
    version: RECEIPT_VERSION,
    uid: params.uid,
    nonce: randomUUID(),
    resumeVersionId: params.resumeVersionId,
    targetRole: params.targetRole,
    location: params.location,
    salaryTarget: Math.max(0, Math.min(1_000_000, Math.round(params.salaryTarget || 0))),
    remotePreference: params.remotePreference,
    mode: 'scout',
    notify: false,
    maxPackets: 3,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload, getReceiptSecret(params.secret));
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: payload.expiresAt,
  };
}

export function verifySonaActivationReceipt(params: {
  token?: string;
  uid: string;
  now?: Date;
  secret?: string;
}): SonaActivationReceiptVerification {
  if (!params.token) return { ok: false, code: 'PREFLIGHT_REQUIRED' };
  const [encodedPayload, suppliedSignature, extra] = params.token.split('.');
  if (!encodedPayload || !suppliedSignature || extra) return { ok: false, code: 'PREFLIGHT_INVALID' };

  const expectedSignature = sign(encodedPayload, getReceiptSecret(params.secret));
  const expectedBytes = Buffer.from(expectedSignature);
  const suppliedBytes = Buffer.from(suppliedSignature);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return { ok: false, code: 'PREFLIGHT_INVALID' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'PREFLIGHT_INVALID' };
  }
  if (!isValidPayload(payload)) return { ok: false, code: 'PREFLIGHT_INVALID' };
  if (payload.uid !== params.uid) return { ok: false, code: 'PREFLIGHT_WRONG_USER' };

  const now = (params.now || new Date()).getTime();
  const issuedAt = new Date(payload.issuedAt).getTime();
  const expiresAt = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 30_000) {
    return { ok: false, code: 'PREFLIGHT_INVALID' };
  }
  if (expiresAt <= now || expiresAt - issuedAt > RECEIPT_TTL_MS + 1_000) {
    return { ok: false, code: 'PREFLIGHT_EXPIRED' };
  }
  return { ok: true, payload };
}

export async function consumeSonaActivationReceipt(
  db: FirebaseFirestore.Firestore,
  payload: SonaActivationReceiptPayload,
) {
  const receiptRef = db
    .collection('users')
    .doc(payload.uid)
    .collection('agent_preflight_receipts')
    .doc(payload.nonce);
  const tokenFingerprint = createHash('sha256')
    .update(`${payload.uid}:${payload.nonce}:${payload.expiresAt}`)
    .digest('hex');

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(receiptRef);
    if (snapshot.exists) return false;
    transaction.set(receiptRef, {
      consumedAt: new Date(),
      expiresAt: new Date(payload.expiresAt),
      resumeVersionId: payload.resumeVersionId,
      targetRole: payload.targetRole,
      location: payload.location,
      mode: payload.mode,
      notify: payload.notify,
      maxPackets: payload.maxPackets,
      tokenFingerprint,
    });
    return true;
  });
}

export function buildReceiptBoundHarnessInput(
  payload: SonaActivationReceiptPayload,
) {
  const salary = payload.salaryTarget ? ` with a salary target of $${payload.salaryTarget}` : '';
  return {
    userRequest: `Scout ${payload.targetRole} roles in ${payload.location}${salary}. Work mode: ${payload.remotePreference}.`,
    resumeVersionId: payload.resumeVersionId,
    targetRole: payload.targetRole,
    location: payload.location,
    salaryTarget: payload.salaryTarget,
    remotePreference: payload.remotePreference,
    maxPackets: payload.maxPackets,
    mode: payload.mode,
    notify: payload.notify,
  } as const;
}
