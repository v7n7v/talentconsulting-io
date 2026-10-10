import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { assessStoryQuality } from '@/lib/story-intelligence';
import { getStoryBankStory } from '@/lib/story-bank';

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 12, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  try {
    const body = await req.json();
    const storyId = typeof body?.storyId === 'string' ? body.storyId.trim().slice(0, 140) : '';
    if (!storyId) return NextResponse.json({ error: 'storyId is required' }, { status: 400 });
    const story = await getStoryBankStory(guard.user.uid, storyId);
    if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    const report = await assessStoryQuality(story);
    return NextResponse.json({ success: true, report, provenance: 'automated completeness and privacy hints; not factual verification' });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Story quality review is unavailable' }, { status: 503 });
  }
}
