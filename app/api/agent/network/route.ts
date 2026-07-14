/**
 * Network CRM API
 * Manage professional contacts — recruiters, hiring managers, referrals.
 * CRUD operations + AI-powered follow-up suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { monitor } from '@/lib/monitor';

const CONTACT_TYPES = new Set(['recruiter', 'hiring_manager', 'referral', 'peer', 'other']);
const UPDATE_FIELDS = [
  'name',
  'company',
  'role',
  'email',
  'phone',
  'linkedin',
  'type',
  'notes',
  'applicationId',
  'followUpDate',
] as const;

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanType(value: unknown) {
  return typeof value === 'string' && CONTACT_TYPES.has(value) ? value : 'other';
}

function cleanNullable(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const userId = guard.user.uid;
    const db = getAdminDb();
    const snap = await db
      .collection('users').doc(userId)
      .collection('network_contacts')
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get();

    const contacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, contacts });
  } catch (error: any) {
    console.error('[Network] GET Error:', error);
    monitor.critical('Tool: agent/network', String(error));
    return NextResponse.json({ error: 'Failed to fetch contacts.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const userId = guard.user.uid;
    const body = await req.json();
    const { action } = body;

    const db = getAdminDb();
    const contactsRef = db.collection('users').doc(userId).collection('network_contacts');

    if (action === 'create') {
      const { name, company, role, email, phone, linkedin, type, notes, applicationId, followUpDate } = body;
      const safeName = cleanText(name);
      if (!safeName) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

      const doc = await contactsRef.add({
        name: safeName,
        company: cleanText(company),
        role: cleanText(role),
        email: cleanText(email),
        phone: cleanText(phone),
        linkedin: cleanText(linkedin),
        type: cleanType(type), // recruiter | hiring_manager | referral | peer | other
        notes: cleanText(notes),
        applicationId: cleanNullable(applicationId),
        lastContactedAt: null,
        followUpDate: cleanNullable(followUpDate),
        interactions: [],
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, id: doc.id });
    }

    if (action === 'update') {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });

      const safeUpdates: Record<string, unknown> = {};
      for (const field of UPDATE_FIELDS) {
        if (!(field in updates)) continue;
        if (field === 'type') safeUpdates[field] = cleanType(updates[field]);
        else if (field === 'applicationId' || field === 'followUpDate') safeUpdates[field] = cleanNullable(updates[field]);
        else safeUpdates[field] = cleanText(updates[field]);
      }

      if (typeof safeUpdates.name === 'string' && !safeUpdates.name) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 });
      }

      await contactsRef.doc(id).update({
        ...safeUpdates,
        updated_at: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'log_interaction') {
      const { id, interactionType, note, followUpDate } = body;
      if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
      const updateData: Record<string, unknown> = {
        interactions: FieldValue.arrayUnion({
          type: cleanText(interactionType) || 'note', // email | call | meeting | linkedin | referral | note
          note: cleanText(note),
          date: new Date().toISOString(),
        }),
        lastContactedAt: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      if ('followUpDate' in body) updateData.followUpDate = cleanNullable(followUpDate);
      await contactsRef.doc(id).update(updateData);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'Contact ID required' }, { status: 400 });
      await contactsRef.doc(id).delete();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Network] POST Error:', error);
    monitor.critical('Tool: agent/network', String(error));
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
