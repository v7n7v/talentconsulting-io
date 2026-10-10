import { getAdminDb } from '@/lib/firebase-admin';
import { recordDate } from '@/lib/application-records';

/** Read by identity: mixed timestamp schemas must not silently disappear. */
export async function readCareerSourceRecords(uid: string, collectionName: string, maxRecords = 5000): Promise<Record<string, any>[]> {
  const collection = getAdminDb().collection('users').doc(uid).collection(collectionName);
  const records: Record<string, any>[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (records.length < maxRecords) {
    const size = Math.min(250, maxRecords - records.length);
    let query = collection.orderBy('__name__').limit(size + 1);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0, size);
    records.push(...page.map(doc => ({ ...doc.data(), id: doc.id })));
    if (snapshot.size <= size) return records;
    cursor = page[page.length - 1];
  }
  throw new Error(`${collectionName} exceeds the current intelligence summary limit; saved records remain available in their source tool.`);
}
export function careerRecordTime(record: Record<string, any>): number {
  return Date.parse(recordDate(record.createdAt) || recordDate(record.created_at) || '') || 0;
}
/** A saved draft or template is not prepared behavioral evidence. */
export function isPreparedStory(story: Record<string, any>): boolean {
  return ['situation', 'task', 'action', 'result'].every(key => typeof story[key] === 'string' && story[key].trim().length >= 10 && !/fill in|placeholder|\bTODO\b/i.test(story[key]));
}
export function firstResponseDays(record: Record<string, any>): number | null {
  const sent = Date.parse(recordDate(record.applied_at) || recordDate(record.appliedAt) || '');
  if (!Number.isFinite(sent)) return null;
  const history = Array.isArray(record.outcome_history) ? record.outcome_history : [];
  const dates = [...history.filter((event: any) => ['callback','interview','offer','rejection'].includes(event.outcome)).map((event: any) => event.reportedAt), record.respondedAt,
    ...(['callback','interview','offer','rejection'].includes(record.outcome_response) ? [record.outcome_reported_at] : [])]
    .map(value => Date.parse(recordDate(value) || '')).filter(value => Number.isFinite(value) && value >= sent && value <= Date.now());
  return dates.length ? Math.floor((Math.min(...dates) - sent) / 86400000) : null;
}
