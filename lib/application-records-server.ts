import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeApplicationRecord } from '@/lib/application-records';

/** Query by document identity so mixed timestamp schemas cannot exclude records. */
export async function readApplicationRecords(uid: string, maxRecords = 5000) {
  const collection = getAdminDb().collection('users').doc(uid).collection('applications');
  const records: ReturnType<typeof normalizeApplicationRecord>[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let complete = false;
  while (records.length < maxRecords) {
    const size = Math.min(250, maxRecords - records.length);
    let query = collection.orderBy('__name__').limit(size + 1);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, size);
    records.push(...page.map(doc => normalizeApplicationRecord(doc.data(), doc.id)));
    if (snapshot.size <= size) { complete = true; break; }
    cursor = page[page.length - 1];
  }
  records.sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0));
  return { records, complete, scanned: records.length, limit: maxRecords };
}
