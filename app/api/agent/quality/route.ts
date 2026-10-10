import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { readApplicationRecords } from '@/lib/application-records-server';
import { computeApplicationMetrics } from '@/lib/application-records';

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60000 });
  if (guard.error) return guard.error;
  try {
    const [applications, queue] = await Promise.all([
      readApplicationRecords(guard.user.uid),
      getAdminDb().collection('users').doc(guard.user.uid).collection('agent_queue').limit(5001).get(),
    ]);
    const metrics = computeApplicationMetrics(applications.records, queue.docs.slice(0, 5000).map(doc => doc.data()));
    return NextResponse.json({ ...metrics, complete: applications.complete && queue.size <= 5000, recordLimit: applications.limit });
  } catch {
    return NextResponse.json({ error: 'Application results could not be loaded. Your records have not been changed.' }, { status: 503 });
  }
}
