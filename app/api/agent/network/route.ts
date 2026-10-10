/**
 * Network CRM API
 * Manage professional contacts — recruiters, hiring managers, referrals.
 * CRUD operations + AI-powered follow-up suggestions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
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
    const cursor = req.nextUrl.searchParams.get('cursor');
    if (cursor && !/^[\w-]{1,160}$/.test(cursor)) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    let query = db.collection('users').doc(userId).collection('network_contacts').orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(101).get();

    const page = snap.docs.slice(0, 100);
    const contacts = page.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ success: true, contacts, nextCursor: snap.docs.length > 100 ? page[page.length - 1].id : null });
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
    if (body.id !== undefined && !/^[\w-]{1,160}$/.test(body.id)) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });
    if (body.followUpDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.followUpDate) || Number.isNaN(Date.parse(body.followUpDate)) || new Date(body.followUpDate).toISOString().slice(0, 10) !== body.followUpDate)) return NextResponse.json({ error: 'Follow-up date must be a valid date' }, { status: 400 });
    if (body.linkedin) { try { const url = new URL(body.linkedin); if (!['http:', 'https:'].includes(url.protocol) || !/(^|\.)linkedin\.com$/.test(url.hostname)) throw new Error(); } catch { return NextResponse.json({ error: 'Enter a valid LinkedIn URL' }, { status: 400 }); } }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    for (const key of UPDATE_FIELDS) if (typeof body[key] === 'string' && body[key].length > (key === 'notes' ? 20000 : 1000)) return NextResponse.json({ error: `${key} is too long` }, { status: 400 });

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
      const requestId = cleanText(body.requestId);
      if (!/^[\w-]{1,120}$/.test(requestId) || typeof note !== 'string' || !note.trim() || note.length > 20000) return NextResponse.json({ error: 'A request id and note up to 20,000 characters are required' }, { status: 400 });
      const interaction = { id: requestId, type: cleanText(interactionType) || 'note', note, followUpDate: cleanNullable(followUpDate) };
      const fingerprint = createHash('sha256').update(JSON.stringify(interaction)).digest('hex');
      const contactRef = contactsRef.doc(id);
      const result = await db.runTransaction(async tx => {
        const contact = await tx.get(contactRef);
        if (!contact.exists) return 'missing';
        const interactions = contact.data()?.interactions || [];
        const previous = interactions.find((entry: any) => entry.id === requestId);
        if (previous) return previous.fingerprint === fingerprint ? 'duplicate' : 'conflict';
        tx.update(contactRef, { interactions: [...interactions, { ...interaction, fingerprint, date: new Date().toISOString() }], followUpDate: interaction.followUpDate, lastContactedAt: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp() });
        return 'saved';
      });
      if (result === 'missing') return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      if (result === 'conflict') return NextResponse.json({ error: 'This retry changed. Save it as a new interaction.' }, { status: 409 });
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
