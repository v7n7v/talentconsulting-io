import { NextRequest } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { invalidateTwin } from '@/lib/career-twin';
import { monitor } from '@/lib/monitor';
import {
  createStoryBankStory,
  deleteStoryBankStory,
  listStoryBankStories,
  updateStoryBankStory,
} from '@/lib/story-bank';

/**
 * GET /api/agent/stories
 * Fetch user's STAR stories from Firestore
 */
export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;

  try {
    const url = new URL(req.url);
    const result = await listStoryBankStories(uid, {
      search: url.searchParams.get('search') || undefined,
      category: url.searchParams.get('category') || undefined,
      source: url.searchParams.get('source') || undefined,
      applicationId: url.searchParams.get('applicationId') || undefined,
      resumeVersionId: url.searchParams.get('resumeVersionId') || undefined,
      contactId: url.searchParams.get('contactId') || undefined,
      page: Number(url.searchParams.get('page') || 1),
      limit: Number(url.searchParams.get('limit') || 100),
    });

    return new Response(JSON.stringify({
      stories: result.stories,
      count: result.count,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      migratedCount: result.migratedCount,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    monitor.critical('Tool: agent/stories', String(e));
    return new Response(JSON.stringify({ error: e.message, stories: [], count: 0 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * POST /api/agent/stories
 * Create a new STAR story manually
 */
export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;

  try {
    const body = await req.json();
    const { title, situation } = body;

    if (!title?.trim() || !situation?.trim()) {
      return new Response(JSON.stringify({ error: 'title and situation are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const story = await createStoryBankStory(uid, {
      ...body,
      source: body.source || 'manual',
      sourceTool: body.sourceTool || 'story_bank',
    });

    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ id: story.id, story, success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    monitor.critical('Tool: agent/stories', String(e));
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * PATCH /api/agent/stories
 * Update an existing Story Bank story and recompute proof metadata
 */
export async function PATCH(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;

  try {
    const body = await req.json();
    const { storyId, id, ...updates } = body;
    const targetId = storyId || id;
    if (!targetId) {
      return new Response(JSON.stringify({ error: 'storyId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const story = await updateStoryBankStory(uid, targetId, updates);
    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ success: true, story }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    monitor.critical('Tool: agent/stories/update', String(e));
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message === 'Story not found' ? 404 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * DELETE /api/agent/stories
 * Delete a story by ID
 */
export async function DELETE(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  const uid = guard.user.uid;

  try {
    const { storyId } = await req.json();
    if (!storyId) {
      return new Response(JSON.stringify({ error: 'storyId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await deleteStoryBankStory(uid, storyId);
    invalidateTwin(uid).catch(() => {});

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    monitor.critical('Tool: agent/stories', String(e));
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
