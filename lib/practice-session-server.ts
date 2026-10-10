import { getAdminDb } from '@/lib/firebase-admin';
import { FREE_CAPS } from '@/lib/usage-tracker';
import { getVerifiedResumeForUserById } from '@/lib/server-resume';
import { getStoryBankStory } from '@/lib/story-bank';

export function practiceRefs(uid: string, id: string) {
  if (!id || !/^[\w-]{1,120}$/.test(id)) throw new Error('SESSION_REQUIRED');
  const user = getAdminDb().collection('users').doc(uid);
  return { session: user.collection('interview_sessions').doc(id), receipt: user.collection('practice_receipts').doc(id), usage: user.collection('usage').doc('lifetime') };
}

// A start consumes one allowance even if the provider fails or the user abandons.
// Retrying this same immutable session never consumes another allowance.
export async function claimPractice(uid: string, id: string, tier: string, operation: string) {
  const refs = practiceRefs(uid, id);
  const owner = crypto.randomUUID();
  return getAdminDb().runTransaction(async tx => {
    const [session, receipt, usage] = await Promise.all([tx.get(refs.session), tx.get(refs.receipt), tx.get(refs.usage)]);
    if (!session.exists) throw new Error('SESSION_NOT_FOUND');
    const data = session.data()!;
    const feature = data.mode === 'study_cards' ? 'flashcards' : 'gauntlets';
    const previous = receipt.data() || {};
    if (previous[operation]?.result) return { ...refs, data, owner, cached: previous[operation].result };
    if (previous[operation]?.expiresAt > Date.now()) throw new Error('SESSION_BUSY');
    if (!receipt.exists) {
      const used = Number(usage.data()?.[feature] || 0);
      if (tier === 'free' && used >= FREE_CAPS[feature]) throw new Error('PRACTICE_LIMIT');
      tx.set(refs.usage, { [feature]: used + 1 }, { merge: true });
    }
    tx.set(refs.receipt, { feature, reservedAt: previous.reservedAt || new Date().toISOString(), [operation]: { owner, expiresAt: Date.now() + 120000 } }, { merge: true });
    return { ...refs, data, owner, cached: null };
  });
}

export async function finishPractice(claim: Awaited<ReturnType<typeof claimPractice>>, operation: string, result: unknown, updates: Record<string, unknown>) {
  await getAdminDb().runTransaction(async tx => {
    const receipt = await tx.get(claim.receipt);
    if (receipt.data()?.[operation]?.owner !== claim.owner) throw new Error('SESSION_STALE');
    tx.set(claim.receipt, { [operation]: { result, expiresAt: 0 } }, { merge: true });
    tx.set(claim.session, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
  });
}
export async function releasePractice(claim: Awaited<ReturnType<typeof claimPractice>> | undefined, operation: string) {
  if (!claim || claim.cached) return;
  await getAdminDb().runTransaction(async tx => {
    const receipt = await tx.get(claim.receipt);
    if (receipt.data()?.[operation]?.owner === claim.owner) tx.set(claim.receipt, { [operation]: { expiresAt: 0 } }, { merge: true });
  });
}
export async function requirePractice(uid: string, id: string) {
  const refs = practiceRefs(uid, id);
  const [session, receipt] = await Promise.all([refs.session.get(), refs.receipt.get()]);
  if (!session.exists) throw new Error('SESSION_NOT_FOUND');
  if (!receipt.exists) throw new Error('SESSION_NOT_RESERVED');
  return { ...refs, data: session.data()! };
}
export async function resolvePracticeEvidence(uid: string, data: Record<string, any>) {
  if (data.applicationId) {
    const application = await getAdminDb().collection('users').doc(uid).collection('applications').doc(data.applicationId).get();
    if (!application.exists) throw new Error('SOURCE_UNAVAILABLE');
  }
  let resume = null;
  if (data.resumeVersionId) {
    const selected = await getVerifiedResumeForUserById(getAdminDb(), uid, data.resumeVersionId);
    if (!selected.resume) throw new Error('SOURCE_UNAVAILABLE');
    resume = selected.resume;
  }
  const stories = await Promise.all((data.selectedStoryIds || []).map(async (id: string) => {
    const story = await getStoryBankStory(uid, id);
    if (!story) throw new Error('SOURCE_UNAVAILABLE');
    return { id, title: story.title, situation: story.situation, task: story.task, action: story.action, result: story.result };
  }));
  return { resume, stories };
}
export function practiceError(error: unknown) {
  const code = error instanceof Error ? error.message : 'PRACTICE_FAILED';
  const status = code === 'PRACTICE_LIMIT' ? 403 : code === 'SESSION_NOT_FOUND' ? 404 : code === 'SESSION_BUSY' || code === 'SESSION_STALE' ? 409 : code === 'SESSION_REQUIRED' ? 400 : code === 'SOURCE_UNAVAILABLE' || code === 'SESSION_NOT_RESERVED' ? 403 : 503;
  return { code, status };
}
