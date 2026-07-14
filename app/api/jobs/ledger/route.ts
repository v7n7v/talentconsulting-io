import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import {
  normalizeJobKey,
  upsertRecommendationLedger,
  type RecommendationLedgerStatus,
} from '@/lib/job-recommendation-platform';

const VALID_STATUSES = new Set<RecommendationLedgerStatus>([
  'shown',
  'saved',
  'dismissed',
  'queued',
  'prepared',
  'applied',
  'interview',
  'offer',
  'rejected',
  'ghosted',
]);

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000, skipUsageCap: true });
  if (guard.error) return guard.error;

  try {
    const body = await req.json().catch(() => null);
    const status = body?.status as RecommendationLedgerStatus;
    const job = body?.job || {};

    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid recommendation status' }, { status: 400 });
    }

    const title = cleanString(job.title, 180);
    const company = cleanString(job.company, 180);
    const location = cleanString(job.location, 180);
    const url = cleanString(job.url, 1000);
    const dedupeKey = cleanString(job.dedupeKey, 500) || normalizeJobKey({ title, company, location, url });

    if (!title || !company || !dedupeKey) {
      return NextResponse.json({ error: 'Job title and company are required' }, { status: 400 });
    }

    const feedbackTags = Array.isArray(body.feedbackTags)
      ? body.feedbackTags.map((tag: unknown) => cleanString(tag, 40)).filter(Boolean).slice(0, 10)
      : [];

    await upsertRecommendationLedger(getAdminDb(), guard.user.uid, {
      id: cleanString(job.id, 180),
      title,
      company,
      location,
      url,
      dedupeKey,
      identityKey: cleanString(job.identityKey, 500) || undefined,
      salary: job.salary || { min: null, max: null, currency: 'USD' },
      description: '',
      skills: [],
      postedDate: cleanString(job.postedDate, 80) || new Date().toISOString(),
      employmentType: cleanString(job.employmentType, 80) || 'Full-time',
      source: cleanString(job.source, 100) || job.sourceMeta?.sourceName || 'unknown',
      remoteMode: 'unknown',
    }, status, { feedbackTags, preserveEvidence: true });

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('[jobs/ledger] Error:', error);
    monitor.critical('Tool: jobs/ledger', String(error));
    return NextResponse.json({ error: 'Failed to update recommendation status' }, { status: 500 });
  }
}
