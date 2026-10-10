import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { matchStoryQuestion } from '@/lib/story-intelligence';

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;
  try {
    const body = await req.json();
    const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 2_000) : '';
    if (!question) return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    const result = await matchStoryQuestion(guard.user.uid, {
      question,
      company: typeof body.company === 'string' ? body.company.slice(0, 180) : undefined,
      role: typeof body.role === 'string' ? body.role.slice(0, 180) : undefined,
      jobDescription: typeof body.jobDescription === 'string' ? body.jobDescription.slice(0, 4_000) : undefined,
      applicationId: typeof body.applicationId === 'string' ? body.applicationId.slice(0, 120) : undefined,
      maxAnswers: Math.max(1, Math.min(6, Number(body.maxAnswers) || 4)),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Story matching is unavailable' }, { status: 503 });
  }
}
