/**
 * Cover Letter Generator API
 * Creates tailored cover letters from resume + job description.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { getAdminDb } from '@/lib/firebase-admin';
import { guardOutput } from '@/lib/humanize-guard';
import { monitor } from '@/lib/monitor';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Cover Letter Studio is a Standard feature.', upgrade: true },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { jobTitle, company, jobDescription, tone, template, resumeData } = body;

    if (!company || !jobTitle) {
      return NextResponse.json({ error: 'company and jobTitle are required' }, { status: 400 });
    }

    const userId = guard.user.uid;
    const db = getAdminDb();

    // Use client-provided resume (morphed) if available, otherwise fetch from Firestore
    let resumeContext = '';
    if (resumeData) {
      // Client sent the morphed resume directly — use it
      resumeContext = JSON.stringify({
        name: resumeData.name,
        title: resumeData.title,
        summary: resumeData.summary,
        skills: Array.isArray(resumeData.skills)
          ? resumeData.skills.flatMap((c: any) => typeof c === 'string' ? [c] : c.items || [])
          : [],
        experience: (resumeData.experience || []).map((e: any) => ({
          role: e.role || e.title,
          company: e.company,
          dates: e.dates,
          bullets: (e.bullets || e.achievements || []).slice(0, 4),
        })),
        education: resumeData.education,
      });
    } else {
      // Fallback: fetch latest saved version from Firestore
      const resumeSnap = await db
        .collection('users').doc(userId)
        .collection('resume_versions')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (!resumeSnap.empty) {
        const resume = resumeSnap.docs[0].data()?.content;
        if (resume) {
          resumeContext = JSON.stringify({
            name: resume.name,
            title: resume.title,
            summary: resume.summary,
            skills: (resume.skills || []).flatMap((c: any) => c.items || []),
            experience: (resume.experience || []).map((e: any) => ({
              role: e.role,
              company: e.company,
              dates: e.dates,
              bullets: (e.bullets || []).slice(0, 3),
            })),
            education: resume.education,
          });
        }
      }
    }

    const toneGuide: Record<string, string> = {
      professional: 'Formal, polished, corporate tone. Use industry language.',
      conversational: 'Warm but professional. Show personality. First person, natural flow.',
      confident: 'Bold, assertive, results-driven. Lead with impact and numbers.',
      storytelling: 'Open with a compelling personal anecdote or career moment that connects to the role.',
    };

    const templateGuide: Record<string, string> = {
      classic: '3 paragraphs: hook + why this company, relevant experience, closing + call to action.',
      modern: 'Short intro, 2-3 bullet points mapping skills to requirements, brief closing.',
      impact: 'Lead with your biggest achievement, connect to the role, explain why now, close with energy.',
      pain_point: 'Identify a company challenge from the JD, explain how your experience solves it, close with enthusiasm.',
    };

    const result = await groqJSONCompletion<{
      coverLetter: string;
      subject: string;
      keyHighlights: string[];
      wordCount: number;
      toneScore: number;
    }>(
      `You are a career writer. Write only from the evidence in the candidate's resume below. Do not introduce employers, titles, dates, metrics, certifications or skills that are not present in it.

RULES:
1. NEVER start with "I am writing to express my interest" or "I am excited to apply"
2. NEVER use "Dear Sir/Madam" — use "Dear ${company} Team" or the hiring manager's name if context suggests one
3. Keep to 250-350 words max — recruiters skim
4. Mirror keywords from the job description naturally
5. Include ONE specific metric or achievement from the resume
6. End with a confident call to action, not a passive "I look forward to hearing"
7. BANNED phrases: "perfect fit", "passionate about", "team player", "go-getter", "synergy"
8. The letter should feel like it was written by a human, not AI

TONE: ${toneGuide[tone || 'conversational'] || toneGuide.conversational}
TEMPLATE: ${templateGuide[template || 'classic'] || templateGuide.classic}

Return JSON:
{
  "coverLetter": "the full cover letter text",
  "subject": "email subject line for sending",
  "keyHighlights": ["highlight 1", "highlight 2", "highlight 3"],
  "wordCount": 285,
  "toneScore": 90
}`,
      `JOB:\nTitle: ${jobTitle}\nCompany: ${company}\n${jobDescription ? `Description:\n${jobDescription}` : ''}\n\nRESUME:\n${resumeContext || 'No resume available — write a general cover letter.'}`,
      { temperature: 0.6, maxTokens: 2000 }
    );

    const guarded = guardOutput(result.coverLetter);

    return NextResponse.json({
      success: true,
      ...result,
      coverLetter: guarded.text,
      humanScore: guarded.aiScore,
      wasHumanized: guarded.wasModified,
    });
  } catch (error: any) {
    console.error('[CoverLetter] Error:', error);
    monitor.critical('Tool: agent/cover-letter', String(error));
    return NextResponse.json({ error: 'Failed to generate cover letter.' }, { status: 500 });
  }
}
