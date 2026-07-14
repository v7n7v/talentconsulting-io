import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * POST /api/onboarding/seed-vault
 * Seeds the user's `vault` collection with their onboarding resume.
 * This is the collection Sona and all AI tools read from.
 */
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const { resume } = await req.json();
    if (!resume) {
      return NextResponse.json({ error: 'No resume data provided' }, { status: 400 });
    }

    const uid = guard.user.uid;
    const db = getAdminDb();
    const now = new Date().toISOString();

    // Save to the vault collection that Sona reads from
    await db.collection('users').doc(uid).collection('vault').add({
      resume,
      parsed: resume,
      source: 'onboarding',
      provenance: {
        verified: true,
        origin: 'onboarding_upload',
        recordedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[api/onboarding/seed-vault] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
