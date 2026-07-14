/**
 * Follow-Up Email Drafter
 * Generates professional, human-sounding follow-up emails
 * based on application context and timing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { getAdminDb } from '@/lib/firebase-admin';
import { quickClean } from '@/lib/humanize-guard';
import { monitor } from '@/lib/monitor';
import { DEMO_USER_ID, getDemoJobApplications, isDemoModeEnabled } from '@/lib/demo-mode';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Follow-up drafting is a Pro feature.', upgrade: true },
        { status: 403 }
      );
    }

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
          { error: 'Submit manually and mark the application applied before drafting a follow-up.' },
          { status: 409 }
        );
      }
      if (app.status !== 'applied') {
        return NextResponse.json(
          { error: 'Follow-up drafts are only available for active applied applications.' },
          { status: 409 }
        );
      }

      const appliedDate = app.applied_at || app.created_at;
      const daysSince = Math.floor((Date.now() - new Date(appliedDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince < 5) {
        return NextResponse.json(
          { error: 'Follow-up timing is early. Wait until at least 5 days after applying.' },
          { status: 409 }
        );
      }
      const role = app.job_title || 'the role';
      return NextResponse.json({
        success: true,
        subject: `${role} follow-up`,
        body: quickClean([
          `Hi ${app.company_name} team,`,
          '',
          `I applied for the ${role} role ${daysSince} days ago and wanted to share one extra note on fit.`,
          'My recent work has focused on review-first AI workflows, proof-backed career artifacts, and product systems that keep users in control.',
          'If the team is still reviewing candidates, I would welcome the chance to connect and compare notes on the role.',
        ].join('\n')),
        timing: daysSince < 5 ? 'early' : daysSince < 14 ? 'good' : 'late',
        daysSinceApplied: daysSince,
        company: app.company_name,
        jobTitle: app.job_title,
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
        { error: 'Submit manually and mark the application applied before drafting a follow-up.' },
        { status: 409 }
      );
    }
    if (app.status !== 'applied') {
      return NextResponse.json(
        { error: 'Follow-up drafts are only available for active applied applications.' },
        { status: 409 }
      );
    }

    const appliedDate = app.applied_at || app.created_at;
    const daysSince = Math.floor((Date.now() - new Date(appliedDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 5) {
      return NextResponse.json(
        { error: 'Follow-up timing is early. Wait until at least 5 days after applying.' },
        { status: 409 }
      );
    }

    // Fetch user's resume for context
    let resumeContext = '';
    if (app.resume_version_id) {
      const resumeDoc = await db
        .collection('users').doc(userId)
        .collection('resume_versions').doc(app.resume_version_id)
        .get();
      if (resumeDoc.exists) {
        const resume = resumeDoc.data()?.content;
        if (resume) {
          resumeContext = `Candidate: ${resume.name || ''}, ${resume.title || ''}. Key skills: ${(resume.skills || []).flatMap((c: any) => c.items || []).slice(0, 10).join(', ')}`;
        }
      }
    }

    const result = await groqJSONCompletion<{
      subject: string;
      body: string;
      timing: string;
    }>(
      `You draft follow-up emails that get replies. Write like a confident professional, not a desperate applicant.

RULES:
1. Keep it SHORT — 3-5 sentences max. Hiring managers skim.
2. Reference the specific role and a relevant qualification
3. Add value — mention something useful (an insight, a relevant article, a project)
4. End with a soft CTA, not a demand
5. BANNED phrases: "I wanted to follow up", "I'm still very interested", "I hope this email finds you well", "just checking in", "touching base"
6. Use contractions naturally. Write like you'd email a smart colleague.
7. Subject line: short, specific, no "Re:" tricks

TIMING CONTEXT: The candidate applied ${daysSince} day(s) ago. ${daysSince < 5 ? 'This is early — be brief and add value.' : daysSince < 14 ? 'Good timing for a follow-up.' : 'It has been a while — be direct but respectful.'}

Return JSON: { "subject": "...", "body": "...", "timing": "good|early|late" }`,
      `APPLICATION:\nCompany: ${app.company_name}\nRole: ${app.job_title || 'Not specified'}\nApplied: ${daysSince} days ago\nNotes: ${app.notes || 'None'}\n\n${resumeContext}`,
      { temperature: 0.7, maxTokens: 800 }
    );

    return NextResponse.json({
      success: true,
      subject: result.subject,
      body: quickClean(result.body),
      timing: result.timing,
      daysSinceApplied: daysSince,
      company: app.company_name,
      jobTitle: app.job_title,
    });
  } catch (error: any) {
    console.error('[FollowUp] Error:', error);
    monitor.critical('Tool: agent/follow-up', String(error));
    return NextResponse.json(
      { error: 'Failed to draft follow-up email.' },
      { status: 500 }
    );
  }
}
