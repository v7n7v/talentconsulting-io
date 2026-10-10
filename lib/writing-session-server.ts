import { getAdminDb } from '@/lib/firebase-admin';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const WritingSessionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,150}$/).optional(),
  version: z.number().int().nonnegative().default(0),
  title: z.string().trim().min(1).max(160), sourceFileName: z.string().max(180).nullable().optional(),
  inputText: z.string().max(50000), finalText: z.string().max(50000),
  domain: z.enum(['general', 'academic', 'resume', 'marketing', 'creative']),
  tone: z.enum(['professional', 'confident', 'casual', 'academic', 'creative']),
  lengthMode: z.enum(['exact', 'condense', 'expand']),
  mode: z.enum(['safe_polish','voice_match','recruiter_ready','academic_integrity','creative_rewrite']),
  step: z.enum(['scan','diagnose','humanize','verify','export']),
  metadata: z.object({
    intensity: z.enum(['light','balanced','deep']).default('balanced'), qualityMode: z.enum(['fast','best']).default('fast'),
    protectedTermsText: z.string().max(5000).default(''), voiceSample: z.string().max(5000).default(''),
    hasOutput: z.boolean().optional(),
    revisions: z.array(z.object({ text: z.string().max(50000), label: z.string().max(100), createdAt: z.string().datetime() })).max(5).default([]),
  }).default({ intensity: 'balanced', qualityMode: 'fast', protectedTermsText: '', voiceSample: '', revisions: [] }),
});
export type WritingSessionInput = z.input<typeof WritingSessionSchema>;
export class WritingConflict extends Error {}
const publicSession = (id: string, value: Record<string, any>) => ({
  id, title: value.title, source_file_name: value.source_file_name || null,
  input_text: value.input_text || '', final_text: value.final_text || '', domain: value.domain, tone: value.tone,
  length_mode: value.length_mode, mode: value.mode, step: value.step, version: value.version || 0,
  created_at: value.created_at, updated_at: value.updated_at,
  metadata: { intensity: value.metadata?.intensity || 'balanced', qualityMode: value.metadata?.qualityMode || 'fast', protectedTermsText: value.metadata?.protectedTermsText || '', voiceSample: value.metadata?.voiceSample || '', hasOutput: value.metadata?.hasOutput ?? Boolean(value.final_text), revisions: value.metadata?.revisions || [] },
});
export async function writeWritingSession(uid: string, input: WritingSessionInput) {
  const parsed = WritingSessionSchema.parse(input);
  const db = getAdminDb();
  const collection = db.collection('users').doc(uid).collection('writing_sessions');
  const ref = parsed.id ? collection.doc(parsed.id) : collection.doc();
  const { id, version, ...content } = parsed;
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    const previous = snap.data();
    if (previous && previous.user_id !== uid) throw new WritingConflict('Session unavailable');
    if (previous?.content_hash === hash) return publicSession(ref.id, previous);
    if ((previous?.version || 0) !== version) throw new WritingConflict('This session changed. Reopen the library version before saving again. Your device draft is preserved.');
    const now = new Date().toISOString();
    const data = { user_id: uid, title: content.title, source_file_name: content.sourceFileName || null, input_text: content.inputText, final_text: content.finalText, domain: content.domain, tone: content.tone, length_mode: content.lengthMode, mode: content.mode, step: content.step, metadata: content.metadata, version: version + 1, content_hash: hash, created_at: previous?.created_at || now, updated_at: now };
    transaction.set(ref, data);
    return publicSession(ref.id, data);
  });
}
export async function listWritingSessions(uid: string) {
  const snap = await getAdminDb().collection('users').doc(uid).collection('writing_sessions').orderBy('updated_at', 'desc').limit(100).get();
  return snap.docs.map(doc => publicSession(doc.id, doc.data()));
}
export async function openWritingSession(uid: string, id: string) {
  const snap = await getAdminDb().collection('users').doc(uid).collection('writing_sessions').doc(id).get();
  if (!snap.exists || snap.data()?.user_id !== uid) return null;
  return publicSession(snap.id, snap.data()!);
}

export async function deleteWritingSession(uid: string, id: string) {
  const db = getAdminDb();
  const ref = db.collection('users').doc(uid).collection('writing_sessions').doc(id);
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data()?.user_id !== uid) throw new WritingConflict('Session unavailable');
    transaction.delete(ref);
  });
}
