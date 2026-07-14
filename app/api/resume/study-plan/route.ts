import { NextRequest, NextResponse } from 'next/server';
import { geminiJSONCompletion } from '@/lib/ai/gemini-client';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { validateBody } from '@/lib/validate';
import { StudyPlanSchema } from '@/lib/schemas';
import { monitor } from '@/lib/monitor';
import { normalizePrepMemoryItem } from '@/lib/prep-memory';

interface StudyDay {
  day: number;
  focus: string;
  tasks: string[];
  resources: { title: string; url: string; type: 'video' | 'article' | 'practice' | 'project' | 'course' | 'reading' }[];
  timeEstimate: string;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5 });
    if (guard.error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const validated = await validateBody(req, StudyPlanSchema);
    if (!validated.success) return validated.error;
    const { skills, userContext, totalDays, platforms } = validated.data;

    const skillList = skills.slice(0, 8).join(', ');
    
    // Detect hour-based vs day-based durations
    // Client sends fractional values for hours: 0.08≈2h, 0.17≈4h, 0.33≈8h
    const rawDays = totalDays ?? 4;
    const isHourBased = rawDays < 1;
    let totalHours = 0;
    let days = 0;
    let durationLabel = '';
    
    if (isHourBased) {
      // Map fractional values to actual hours
      if (rawDays <= 0.1) { totalHours = 2; durationLabel = '2-hour'; }
      else if (rawDays <= 0.2) { totalHours = 4; durationLabel = '4-hour'; }
      else { totalHours = 8; durationLabel = '8-hour'; }
      // For hour plans, we split into sessions (blocks)
      days = totalHours <= 2 ? 2 : totalHours <= 4 ? 3 : 4;
    } else {
      days = Math.min(Math.max(rawDays, 1), 7);
      durationLabel = `${days}-day`;
    }

    // Fetch compact Skill Bridge Memory context without loading full note bodies into the prompt.
    let memoryContext = '';
    if (guard.user?.uid) {
      try {
        const snapshot = await getAdminDb()
          .collection('study_vault')
          .where('userId', '==', guard.user.uid)
          .limit(12)
          .get();
        if (!snapshot.empty) {
          memoryContext = snapshot.docs
            .map(doc => normalizePrepMemoryItem(doc.id, doc.data(), { includeContent: false }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 4)
            .map(item => `- ${item.title}: ${item.excerpt}`)
            .join('\n');
        }
      } catch (e) {
        console.error('Failed to fetch memory context for skill bridge:', e);
        monitor.critical('Tool: resume/study-plan', String(e));
      }
    }

    const timeUnit = isHourBased ? 'session' : 'day';
    const timeConstraint = isHourBased
      ? `Total time budget: ${totalHours} hours. Split into ${days} focused sessions of ${Math.round(totalHours / days * 10) / 10} hours each.`
      : `EXACTLY ${days} days, each 1.5-2.5 hours max`;

    const systemPrompt = `You are a career skills coach. Generate a SHORT, focused ${durationLabel} study plan.

CRITICAL: Generate EXACTLY ${days} ${timeUnit}s. Not more, not less.
${timeConstraint}

This platform supports ALL careers (Healthcare, Finance, Sales, Engineering, Creative Arts, Trades, etc.).
Adapt your tone and resources to the user's specific field.

RULES:
1. EXACTLY ${days} ${timeUnit}s${isHourBased ? `, totaling ~${totalHours} hours` : ', each 1.5-2.5 hours max'}
2. ${timeUnit === 'session' ? 'Session' : 'Day'} 1: Core fundamentals
3. Middle ${timeUnit}s: Applied practice + scenarios
4. Final ${timeUnit}: Interview prep — practice explaining the skill
5. Keep tasks CONCISE — max 3 bullet points per ${timeUnit}, each under 15 words
6. Use FREE resources: YouTube, official docs, Coursera audit, freeCodeCamp
7. Each resource needs a real, plausible URL
8. Be SPECIFIC — no vague "learn about X"
${platforms && platforms.length > 0 ? `9. PRIORITIZE these platforms: ${platforms.join(', ')}. Use them for at least 70% of resources.` : ''}

Return JSON:
{
  "schedule": [
    {
      "day": 1,
      "focus": "Short focus title (max 8 words)",
      "tasks": ["Concise task 1", "Concise task 2"],
      "resources": [
        { "title": "Resource Name", "url": "https://...", "type": "video" }
      ],
      "timeEstimate": "${isHourBased ? Math.round(totalHours / days * 10) / 10 + 'h' : '2h'}"
    }
  ],
  "summary": "One sentence: what you'll achieve in ${durationLabel}",
  "interviewTips": ["Tip 1", "Tip 2"]
}`;

    const userPrompt = `Generate a ${durationLabel} crash course for: ${skillList}

${userContext ? `User context: ${userContext}` : 'Professional getting interview-ready.'}

${memoryContext ? `RECENT SKILL BRIDGE MEMORY (target these patterns):\n${memoryContext}\n` : ''}

Keep it short, practical, interview-focused.`;

    const result = await geminiJSONCompletion<{
      schedule: StudyDay[];
      summary: string;
      interviewTips: string[];
    }>(systemPrompt, userPrompt, { temperature: 0.4, maxTokens: 2000 });

    // Safety: ensure schedule length matches requested days
    if (result.schedule && result.schedule.length > days) {
      result.schedule = result.schedule.slice(0, days);
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[api/resume/study-plan] Error:', error);
    monitor.critical('Tool: resume/study-plan', String(error));
    return NextResponse.json(
      { error: 'Failed to generate study plan' },
      { status: 500 }
    );
  }
}
