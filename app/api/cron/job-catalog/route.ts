import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { JOB_PROVIDERS, type JobProvider } from '@/lib/job-provider-contract';
import { runJobCatalogIngestion } from '@/lib/job-catalog-ingestion';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };
const IN_PROGRESS_STATUSES = new Set(['pending', 'busy', 'partial', 'budget']);
const FAILURE_STATUSES = new Set(['unavailable', 'malformed', 'timeout', 'rate_limited']);

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authorization = request.headers.get('authorization');
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : request.headers.get('x-cron-secret') || '';
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function response(body: Record<string, unknown>, status: number, retryAfterSeconds?: number) {
  const headers = { ...PRIVATE_HEADERS };
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds! > 0) {
    Object.assign(headers, { 'Retry-After': String(Math.min(86_400, Math.floor(retryAfterSeconds!))) });
  }
  return NextResponse.json(body, { status, headers });
}

function requestedProvider(request: NextRequest): JobProvider | null | undefined {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'provider')) return null;
  const values = params.getAll('provider');
  if (values.length > 1) return null;
  if (values.length === 0) return 'fantastic';
  return (JOB_PROVIDERS as readonly string[]).includes(values[0])
    ? values[0] as JobProvider
    : null;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return response({ error: 'Unauthorized' }, 401);

  const provider = requestedProvider(request);
  if (!provider) return response({ error: 'Invalid provider request' }, 400);

  let result;
  try {
    result = await runJobCatalogIngestion({ provider });
  } catch {
    return response({
      success: false,
      enabled: true,
      provider,
      status: 'unavailable',
      complete: false,
      records: 0,
      closed: 0,
      requests: 0,
    }, 503);
  }

  const status = String(result?.status || 'unavailable');
  const retryAfter = safeCount(result?.retryAfterSeconds) || undefined;
  const receipt = {
    success: result?.enabled === false || (result?.complete === true && (status === 'success' || status === 'empty')),
    enabled: result?.enabled === true,
    provider,
    status: ['success', 'empty', 'disabled', ...IN_PROGRESS_STATUSES, ...FAILURE_STATUSES].includes(status)
      ? status : 'unavailable',
    complete: result?.complete === true,
    records: safeCount(result?.records),
    closed: safeCount(result?.closed),
    requests: safeCount(result?.requests),
    ...(retryAfter ? { retryAfterSeconds: Math.min(86_400, retryAfter) } : {}),
  };

  if (status === 'disabled' || result?.enabled === false) return response(receipt, 200);
  if (IN_PROGRESS_STATUSES.has(status)) return response(receipt, 202, retryAfter);
  if (FAILURE_STATUSES.has(status) || receipt.status === 'unavailable') {
    return response(receipt, 503, retryAfter);
  }
  if ((status === 'success' || status === 'empty') && result?.complete === true) {
    return response(receipt, 200);
  }
  return response({ ...receipt, status: 'partial', success: false }, 202, retryAfter);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
