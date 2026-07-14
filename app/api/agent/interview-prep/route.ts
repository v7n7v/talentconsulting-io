/**
 * Interview Prep Auto-Link
 * Generates tailored interview questions + maps STAR stories
 * when an application reaches "interview_scheduled" status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { listStoryBankStories } from '@/lib/story-bank';
import { DEMO_USER_ID, getDemoJobApplications, isDemoModeEnabled } from '@/lib/demo-mode';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    const body = await req.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
    }

    if (isDemoModeEnabled() && guard.user.uid === DEMO_USER_ID) {
      const app = getDemoJobApplications().find((item: any) => item.id === applicationId);
      if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      if (app.status === 'not_applied') {
        return NextResponse.json(
          { error: 'Submit manually and mark the application applied before generating interview prep.' },
          { status: 409 }
        );
      }
      if (app.status !== 'interview_scheduled' && app.status !== 'interviewed') {
        return NextResponse.json(
          { error: 'Interview prep is available after an interview is scheduled.' },
          { status: 409 }
        );
      }

      const company = app.company_name;
      const role = app.job_title || 'the role';
      return NextResponse.json({
        success: true,
        company,
        jobTitle: role,
        questions: [
          {
            question: `Walk me through a product workflow you owned end to end that is relevant to ${role}.`,
            type: 'behavioral',
            tip: 'Anchor the answer on the user problem, the constraints, the shipped workflow, and the measurable result.',
            matchedStory: 'Career Twin and Proof Engine launch',
          },
          {
            question: 'How would you evaluate whether an AI-generated application packet is safe to send?',
            type: 'technical',
            tip: 'Talk about preserved facts, missing requirements, no-invention checks, and manual approval gates.',
          },
          {
            question: `What would you improve in ${company}'s candidate or customer workflow during your first 30 days?`,
            type: 'situational',
            tip: 'Give a structured answer: observe, map friction, pick one narrow experiment, measure it, then expand.',
          },
          {
            question: 'Tell me about a time you reduced ambiguity for a team.',
            type: 'behavioral',
            tip: 'Use a concise STAR answer and show how you turned vague goals into visible decisions.',
            matchedStory: 'Review-first application workspace',
          },
          {
            question: 'How do you decide when an automation should stop and ask for human review?',
            type: 'technical',
            tip: 'Connect risk, reversibility, privacy, and user trust to concrete UI gates.',
          },
        ],
        questionsToAsk: [
          {
            question: 'Which workflow would you most want this person to make faster or safer in the first quarter?',
            why: 'Shows you care about immediate product value',
          },
          {
            question: 'Where does the team currently draw the line between automation and user approval?',
            why: 'Surfaces trust expectations and product philosophy',
          },
          {
            question: 'What evidence would make you confident this hire is working out after 90 days?',
            why: 'Clarifies outcomes and success metrics',
          },
        ],
        prepNotes: `Prepare one concise story about shipping a review-first AI workflow, one technical example about evaluating generated output, and one product critique for ${company}. Keep answers specific and evidence-led.`,
        storiesAvailable: 2,
      });
    }

    const userId = guard.user.uid;
    const db = getAdminDb();

    // Fetch the application
    const appDoc = await db
      .collection('users').doc(userId)
      .collection('applications').doc(applicationId)
      .get();

    if (!appDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const app = appDoc.data()!;
    if (app.status === 'not_applied') {
      return NextResponse.json(
        { error: 'Submit manually and mark the application applied before generating interview prep.' },
        { status: 409 }
      );
    }
    if (app.status !== 'interview_scheduled' && app.status !== 'interviewed') {
      return NextResponse.json(
        { error: 'Interview prep is available after an interview is scheduled.' },
        { status: 409 }
      );
    }

    // Fetch user's Story Bank
    const { stories } = await listStoryBankStories(userId, { limit: 20 });

    // Fetch resume for context
    let resumeContext = '';
    if (app.resume_version_id) {
      const resumeDoc = await db
        .collection('users').doc(userId)
        .collection('resume_versions').doc(app.resume_version_id)
        .get();
      if (resumeDoc.exists) {
        const resume = resumeDoc.data()?.content;
        if (resume) {
          resumeContext = `Name: ${resume.name || ''}\nTitle: ${resume.title || ''}\nSummary: ${resume.summary || ''}\nSkills: ${(resume.skills || []).flatMap((c: any) => c.items || []).join(', ')}\nExperience: ${(resume.experience || []).map((e: any) => `${e.role} at ${e.company} (${e.duration})`).join(', ')}`;
        }
      }
    }

    const storySummary = stories.length > 0
      ? stories.map((s: any) => `[${s.title}] Tags: ${(s.tags || []).join(', ')}`).join('\n')
      : 'No stories saved yet';

    const result = await groqJSONCompletion<{
      questions: Array<{
        question: string;
        type: 'behavioral' | 'technical' | 'situational';
        tip: string;
        matchedStory?: string;
      }>;
      questionsToAsk: Array<{
        question: string;
        why: string;
      }>;
      prepNotes: string;
    }>(
      `You are an elite interview coach. Generate a tailored interview prep package.

RULES:
1. Generate 5 likely interview questions (mix of behavioral, technical, situational)
2. For each behavioral question, check the Story Bank for a matching story by tags
3. Include a "tip" for each question — HOW to answer it well
4. Generate 3 smart questions for the candidate to ASK the interviewer
5. Include brief prep notes (what to research, what to wear, etc.)

MATCHING STORIES: Match by tag overlap. If a question is about "leadership" and a story has tag "leadership", it's a match. Use the story title as the matchedStory value.

Return JSON:
{
  "questions": [{ "question": "...", "type": "behavioral", "tip": "...", "matchedStory": "story title or null" }],
  "questionsToAsk": [{ "question": "...", "why": "shows you care about X" }],
  "prepNotes": "brief paragraph"
}`,
      `INTERVIEW PREP FOR:\nCompany: ${app.company_name}\nRole: ${app.job_title || 'Not specified'}\nJD: ${(app.job_description || '').slice(0, 2000)}\n\nCANDIDATE:\n${resumeContext}\n\nSTORY BANK:\n${storySummary}`,
      { temperature: 0.5, maxTokens: 3000 }
    );

    return NextResponse.json({
      success: true,
      company: app.company_name,
      jobTitle: app.job_title,
      questions: result.questions || [],
      questionsToAsk: result.questionsToAsk || [],
      prepNotes: result.prepNotes || '',
      storiesAvailable: stories.length,
    });
  } catch (error: any) {
    console.error('[InterviewPrep] Error:', error);
    monitor.critical('Tool: agent/interview-prep', String(error));
    return NextResponse.json(
      { error: 'Failed to generate interview prep.' },
      { status: 500 }
    );
  }
}
