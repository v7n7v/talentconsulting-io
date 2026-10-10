import { invalidateTwin } from '@/lib/career-twin';
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { offerCommandSchema, offerUpdatePatch, offerInputSignature } from '@/lib/application-commands';
import { normalizeApplicationRecord } from '@/lib/application-records';
class OfferConflict extends Error {}
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  const parsed = offerCommandSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid offer details.' }, { status: 400 });
  try {
    const db = getAdminDb(); const command = parsed.data;
    const ref = db.collection('users').doc(guard.user.uid).collection('applications').doc(command.applicationId);
    const data = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Application unavailable.');
      const existing = snapshot.data()!;
      if (command.expectedOfferSignature !== undefined && offerInputSignature(existing.offer_details) !== command.expectedOfferSignature) throw new OfferConflict('Offer details changed in another request. Reopen the application before saving; your local edits are still visible.');
      const patch = offerUpdatePatch(existing, command, new Date().toISOString());
      transaction.update(ref, patch);
      return normalizeApplicationRecord({ ...existing, ...patch }, snapshot.id);
    });
    await invalidateTwin(guard.user.uid).catch(error => console.error('Twin invalidation failed', error));
    return NextResponse.json({ success: true, data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Offer could not be saved.' }, { status: error instanceof OfferConflict ? 409 : 503 }); }
}
