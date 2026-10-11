import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isDemoAuthRequest } from '@/lib/demo-mode';
import { SearchSourceValidationError } from '@/lib/resume-search-source';
import { confirmSearchSource, readBoundedSourceBody, readSearchSource } from '@/lib/resume-source-service';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  if (error instanceof SearchSourceValidationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return NextResponse.json({ error: 'Your résumé source could not be saved or read. Retry when your connection is available.', code: 'SOURCE_TEMPORARILY_UNAVAILABLE' }, { status: 503, headers });
}

export async function POST(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, { rateLimit: 12, rateLimitWindow: 60000, skipUsageCap: true });
    if (guard.error) return guard.error;
    // Fictional previews save browser-local records only; never the Admin DB.
    if (isDemoAuthRequest(request)) return NextResponse.json({ error: 'Use the local preview source store.', code: 'DEMO_LOCAL_SOURCE_ONLY' }, { status: 403, headers });
    const input = await readBoundedSourceBody(request);
    const result = await confirmSearchSource(getAdminDb(), guard.user.uid, input);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers });
  } catch (error) { return failure(error); }
}

export async function GET(request: NextRequest) {
  try {
    const guard = await guardApiRoute(request, { rateLimit: 30, rateLimitWindow: 60000, skipUsageCap: true });
    if (guard.error) return guard.error;
    if (isDemoAuthRequest(request)) return NextResponse.json({ error: 'Use the local preview source store.', code: 'DEMO_LOCAL_SOURCE_ONLY' }, { status: 403, headers });
    const id = request.nextUrl.searchParams.get('id') || '';
    return NextResponse.json(await readSearchSource(getAdminDb(), guard.user.uid, id), { headers });
  } catch (error) { return failure(error); }
}
