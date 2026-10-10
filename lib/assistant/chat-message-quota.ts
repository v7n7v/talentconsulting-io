import { createHash, randomUUID } from 'node:crypto';

export function chatWeekKey(now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay());
  return `${start.getFullYear()}-W${String(Math.ceil(start.getDate() / 7)).padStart(2, '0')}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}
export function chatRequestFingerprint(body: unknown) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
const reason = (tier: string) => tier === 'pro'
  ? 'You used your weekly Taco message. Unlock Max for more Taco room.'
  : 'You used both Taco demo messages. Compare Standard for hands-on search work or Max for proactive scouting and prepared packets.';

export const CHAT_MESSAGE_LEASE_MS = 15 * 60_000;

/** Expired work releases capacity, but its request ID can never launch work again. */
export async function reserveChatMessage(db: any, uid: string, tier: string, requestId: string, fingerprint: string) {
  const usage = db.collection('users').doc(uid).collection('usage').doc('sona');
  const receipt = usage.collection('requests').doc(requestId);
  const week = chatWeekKey();
  return db.runTransaction(async (tx: any) => {
    const [u, r] = await Promise.all([tx.get(usage), tx.get(receipt)]);
    const prior = r.exists ? r.data() : null;
    if (prior && prior.fingerprint !== fingerprint) return { kind: 'conflict' };
    if (prior?.state === 'completed') return { kind: 'replay', response: prior.response };
    const data = u.exists ? u.data() : {};
    const now = Date.now();
    const pending = Object.fromEntries(Object.entries(data.messageReservations || {}).filter(([, value]: any) => value.expiresAt > now));
    const expired = prior?.state === 'pending' && (!prior.expiresAt || prior.expiresAt <= now);
    if (expired || prior?.state === 'interrupted') {
      tx.set(usage, { ...data, messageReservations: pending });
      tx.set(receipt, { ...prior, state: 'interrupted' });
      return prior.stagedResponse ? { kind: 'replay', response: prior.stagedResponse } : { kind: 'interrupted' };
    }
    if (prior?.state === 'pending') return { kind: 'pending' };
    const unlimited = tier === 'studio' || tier === 'god';
    const cap = tier === 'pro' ? 1 : 2;
    const used = tier === 'pro' ? (data.weekStart === week ? data.weeklyCount || 0 : 0) : data.lifetimeCount || 0;
    const held = Object.values(pending).filter((p: any) => tier === 'pro' ? p.tier === 'pro' && p.week === week : p.tier !== 'pro' && p.tier !== 'studio' && p.tier !== 'god').length;
    if (!unlimited && used + held >= cap) return { kind: 'denied', used: used + held, cap, reason: reason(tier) };
    const operationId = randomUUID();
    const expiresAt = now + CHAT_MESSAGE_LEASE_MS;
    tx.set(usage, { ...data, messageReservations: { ...pending, [requestId]: { tier, week, operationId, expiresAt } } });
    tx.set(receipt, { state: 'pending', fingerprint, tier, week, operationId, expiresAt, startedAt: new Date().toISOString() });
    return { kind: 'reserved', operationId };
  });
}

export async function finishChatMessage(db: any, uid: string, requestId: string, response: { body: string; status: number } | null, charge = true, operationId: string) {
  const usage = db.collection('users').doc(uid).collection('usage').doc('sona');
  const receipt = usage.collection('requests').doc(requestId);
  return db.runTransaction(async (tx: any) => {
    const [u, r] = await Promise.all([tx.get(usage), tx.get(receipt)]);
    const current = r.exists ? r.data() : null;
    if (current?.state !== 'pending' || current.operationId !== operationId || current.expiresAt <= Date.now()) return false;
    const data = u.exists ? u.data() : {};
    const pending = { ...(data.messageReservations || {}) };
    delete pending[requestId];
    // Write the complete map: merge:true would retain removed nested reservation keys.
    const next = { ...data, messageReservations: pending };
    if (response && charge && current.tier !== 'studio' && current.tier !== 'god') {
      if (current.tier === 'pro' && current.week === chatWeekKey()) {
        next.weeklyCount = (data.weekStart === current.week ? data.weeklyCount || 0 : 0) + 1;
        next.weekStart = current.week;
      } else if (current.tier !== 'pro') next.lifetimeCount = (data.lifetimeCount || 0) + 1;
      next.lastUsed = new Date().toISOString();
    }
    tx.set(usage, next);
    tx.set(receipt, { ...current, state: response ? 'completed' : 'failed', ...(response ? { response } : {}) });
    return true;
  });
}

/** Save the response before finalizing usage so a lost commit response can be recovered safely. */
export async function stageChatResponse(db: any, uid: string, requestId: string, operationId: string, response: { body: string; status: number }) {
  const receipt = db.collection('users').doc(uid).collection('usage').doc('sona').collection('requests').doc(requestId);
  return db.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(receipt);
    const value = snapshot.exists ? snapshot.data() : null;
    if (value?.state !== 'pending' || value.operationId !== operationId || value.expiresAt <= Date.now()) return false;
    tx.set(receipt, { ...value, stagedResponse: response });
    return true;
  });
}
