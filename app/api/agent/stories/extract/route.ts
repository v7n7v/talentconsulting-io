import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { extractStoryDrafts } from '@/lib/story-intelligence';

const SOURCE_TYPES = new Set(['resume', 'debrief', 'conversation', 'application', 'manual_text']);

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 6, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 12_000) : '';
    const sourceType = SOURCE_TYPES.has(body?.sourceType) ? body.sourceType : 'manual_text';
    if (!text) return NextResponse.json({ error: 'Source text is required' }, { status: 400 });
    const result = await extractStoryDrafts({
      sourceType,
      text,
      company: typeof body.company === 'string' ? body.company.slice(0, 180) : undefined,
      role: typeof body.role === 'string' ? body.role.slice(0, 180) : undefined,
      applicationId: typeof body.applicationId === 'string' ? body.applicationId.slice(0, 120) : undefined,
      resumeVersionId: typeof body.resumeVersionId === 'string' ? body.resumeVersionId.slice(0, 120) : undefined,
      save: false,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Story extraction is unavailable' }, { status: 503 });
  }
}
