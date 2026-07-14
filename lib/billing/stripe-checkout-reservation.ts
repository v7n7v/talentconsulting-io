export const STRIPE_CHECKOUT_RESERVATION_TTL_MS = 35 * 60 * 1_000;
export const STRIPE_CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;

export function shouldRetainStripeCheckoutReservation(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const checkoutSessionOutcome = 'checkoutSessionOutcome' in error
    ? String((error as { checkoutSessionOutcome?: unknown }).checkoutSessionOutcome || '')
    : '';
  if (checkoutSessionOutcome) return checkoutSessionOutcome === 'ambiguous';
  const type = 'type' in error ? String((error as { type?: unknown }).type || '') : '';
  return type === 'StripeConnectionError' || type === 'StripeAPIError';
}

export type CheckoutGuardData = {
  activeReservationId?: string | null;
  reservationStartedAt?: string | null;
  reservationExpiresAt?: string | null;
  pendingCheckoutSessionId?: string | null;
  pendingCheckoutReservationId?: string | null;
  pendingCheckoutMode?: 'hosted' | 'embedded' | null;
  pendingCheckoutPlan?: 'pro' | 'studio' | null;
  pendingCheckoutInterval?: 'month' | 'year' | null;
  pendingCheckoutCreatedAt?: string | null;
  pendingCheckoutExpiresAt?: string | null;
  trialConsumedAt?: string | null;
};

type FirestoreTransaction = {
  get(ref: unknown): Promise<{ data(): CheckoutGuardData | undefined }>;
  set(ref: unknown, data: Record<string, unknown>, options: { merge: true }): void;
};

type FirestoreLike = {
  collection(name: string): {
    doc(id: string): {
      collection(name: string): {
        doc(id: string): unknown;
      };
    };
  };
  runTransaction<T>(callback: (transaction: FirestoreTransaction) => Promise<T>): Promise<T>;
};

function checkoutGuardRef(db: FirestoreLike, uid: string) {
  return db.collection('users').doc(uid).collection('billing').doc('checkoutGuard');
}

export async function readStripeCheckoutGuard(db: FirestoreLike, uid: string) {
  const ref = checkoutGuardRef(db, uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    return snapshot.data() || null;
  });
}

export function normalizeStripePendingCheckoutReceipt(
  guard: CheckoutGuardData | null | undefined,
) {
  if (!guard?.pendingCheckoutSessionId) return null;
  if (
    guard.pendingCheckoutReservationId !== guard.activeReservationId
    || (guard.pendingCheckoutMode !== 'hosted' && guard.pendingCheckoutMode !== 'embedded')
    || (guard.pendingCheckoutPlan !== 'pro' && guard.pendingCheckoutPlan !== 'studio')
    || (guard.pendingCheckoutInterval !== 'month' && guard.pendingCheckoutInterval !== 'year')
  ) {
    return undefined;
  }
  return {
    checkoutSessionId: guard.pendingCheckoutSessionId,
    mode: guard.pendingCheckoutMode,
    plan: guard.pendingCheckoutPlan,
    interval: guard.pendingCheckoutInterval,
  };
}

export function decideStripeCheckoutReservation(
  current: CheckoutGuardData | null | undefined,
  nowMs: number,
) {
  const reservationExpiresAt = Date.parse(current?.reservationExpiresAt || '');
  const reservationActive = Boolean(
    current?.activeReservationId
    && Number.isFinite(reservationExpiresAt)
    && reservationExpiresAt > nowMs,
  );
  return {
    acquire: !reservationActive,
    reason: reservationActive ? 'checkout_in_progress' as const : 'available' as const,
    trialPreviouslyConsumed: Boolean(current?.trialConsumedAt),
  };
}

export async function reserveStripeCheckout(
  db: FirestoreLike,
  uid: string,
  reservationId: string,
  nowMs = Date.now(),
) {
  const ref = checkoutGuardRef(db, uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const decision = decideStripeCheckoutReservation(snapshot.data(), nowMs);
    if (!decision.acquire) return decision;
    transaction.set(ref, {
      activeReservationId: reservationId,
      reservationStartedAt: new Date(nowMs).toISOString(),
      reservationExpiresAt: new Date(nowMs + STRIPE_CHECKOUT_RESERVATION_TTL_MS).toISOString(),
      pendingCheckoutSessionId: null,
      pendingCheckoutReservationId: null,
      pendingCheckoutMode: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
      pendingCheckoutExpiresAt: null,
      updatedAt: new Date(nowMs).toISOString(),
    }, { merge: true });
    return decision;
  });
}

export async function releaseStripeCheckout(
  db: FirestoreLike,
  uid: string,
  reservationId: string,
  nowMs = Date.now(),
) {
  const ref = checkoutGuardRef(db, uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.activeReservationId !== reservationId) return false;
    transaction.set(ref, {
      activeReservationId: null,
      reservationExpiresAt: null,
      pendingCheckoutSessionId: null,
      pendingCheckoutReservationId: null,
      pendingCheckoutMode: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
      pendingCheckoutExpiresAt: null,
      reservationReleasedAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    }, { merge: true });
    return true;
  });
}

export async function recordStripePendingCheckout(
  db: FirestoreLike,
  input: {
    uid: string;
    reservationId: string;
    checkoutSessionId: string;
    mode: 'hosted' | 'embedded';
    plan: 'pro' | 'studio';
    interval: 'month' | 'year';
    expiresAtMs: number;
    nowMs?: number;
  },
) {
  const nowMs = input.nowMs ?? Date.now();
  const ref = checkoutGuardRef(db, input.uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.activeReservationId !== input.reservationId) {
      return { recorded: false as const, reason: 'reservation_mismatch' as const };
    }
    if (
      current.pendingCheckoutSessionId
      && current.pendingCheckoutSessionId !== input.checkoutSessionId
    ) {
      return { recorded: false as const, reason: 'session_conflict' as const };
    }
    transaction.set(ref, {
      pendingCheckoutSessionId: input.checkoutSessionId,
      pendingCheckoutReservationId: input.reservationId,
      pendingCheckoutMode: input.mode,
      pendingCheckoutPlan: input.plan,
      pendingCheckoutInterval: input.interval,
      pendingCheckoutCreatedAt: new Date(nowMs).toISOString(),
      pendingCheckoutExpiresAt: new Date(input.expiresAtMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
    }, { merge: true });
    return { recorded: true as const, reason: 'recorded' as const };
  });
}

export async function completeStripeCheckoutReservation(
  db: FirestoreLike,
  input: {
    uid: string;
    reservationId: string | null | undefined;
    checkoutSessionId: string;
    stripeEventId: string;
    consumeTrial: boolean;
    nowMs?: number;
  },
) {
  const nowMs = input.nowMs ?? Date.now();
  const ref = checkoutGuardRef(db, input.uid);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    const reservationMatches = Boolean(
      input.reservationId
      && current?.activeReservationId === input.reservationId,
    );
    const pendingSessionMatches = current?.pendingCheckoutSessionId === input.checkoutSessionId;
    transaction.set(ref, {
      ...(reservationMatches ? {
        activeReservationId: null,
        reservationExpiresAt: null,
      } : {}),
      ...(reservationMatches || pendingSessionMatches ? {
        pendingCheckoutSessionId: null,
        pendingCheckoutReservationId: null,
        pendingCheckoutMode: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
        pendingCheckoutExpiresAt: null,
      } : {}),
      ...(input.consumeTrial && !current?.trialConsumedAt ? {
        trialConsumedAt: new Date(nowMs).toISOString(),
        trialConsumedCheckoutSessionId: input.checkoutSessionId,
      } : {}),
      lastCompletedCheckoutSessionId: input.checkoutSessionId,
      lastCompletedStripeEventId: input.stripeEventId,
      updatedAt: new Date(nowMs).toISOString(),
    }, { merge: true });
    return { reservationMatches, trialConsumed: input.consumeTrial || Boolean(current?.trialConsumedAt) };
  });
}
