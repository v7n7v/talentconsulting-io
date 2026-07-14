/**
 * Salary Negotiation Coach
 * Generates counter-offer strategies, scripts, and BATNA analysis
 * based on the user's offer details and market data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { DEMO_USER_ID, getDemoJobApplications, isDemoModeEnabled } from '@/lib/demo-mode';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Offer Coach is a Pro feature.', upgrade: true },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      applicationId,
      company: rawCompany,
      role: rawRole,
      jobDescription: rawJobDescription,
      resumeVersionId: rawResumeVersionId,
      offerDetails,
      offerBase: rawOfferBase,
      offerTotal: rawOfferTotal,
      desiredBase: rawDesiredBase,
      desiredTotal: rawDesiredTotal,
      hasCompetingOffer: rawHasCompetingOffer,
      benefits: rawBenefits,
      context: rawContext,
    } = body;

    let company = rawCompany;
    let role = rawRole;
    let jobDescription = rawJobDescription;
    let resumeVersionId = rawResumeVersionId;
    let offerBase = rawOfferBase ?? offerDetails?.base ?? offerDetails?.total;
    let offerTotal = rawOfferTotal ?? offerDetails?.total;
    let desiredBase = rawDesiredBase ?? offerDetails?.desiredBase;
    let desiredTotal = rawDesiredTotal ?? offerDetails?.desiredTotal;
    let hasCompetingOffer = rawHasCompetingOffer ?? offerDetails?.competingOffer;
    let benefits = rawBenefits ?? offerDetails?.benefits;
    let context = rawContext ?? offerDetails?.context;

    const userId = guard.user.uid;

    if (isDemoModeEnabled() && userId === DEMO_USER_ID) {
      const application = applicationId
        ? getDemoJobApplications().find((app: any) => app.id === applicationId)
        : null;

      if (applicationId && !application) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }

      company = company || application?.company_name || 'Vector Harbor';
      role = role || application?.job_title || 'AI Growth Lead';
      offerBase = offerBase ?? application?.offer_details?.base ?? application?.offer_amount ?? 190000;
      offerTotal = offerTotal ?? application?.offer_details?.total ?? 235000;
      desiredBase = desiredBase ?? application?.offer_details?.desiredBase ?? 215000;
      desiredTotal = desiredTotal ?? application?.offer_details?.desiredTotal ?? 275000;
      hasCompetingOffer = hasCompetingOffer ?? application?.offer_details?.competingOffer ?? false;
      context = context || application?.offer_details?.context || 'High-scope AI growth role with room on base and equity.';
      const desiredBaseText = formatCompForCopy(desiredBase) || '$215k';
      const desiredTotalText = formatCompForCopy(desiredTotal) || '$275k';

      return NextResponse.json({
        success: true,
        marketRange: { low: 185000, mid: 220000, high: 275000 },
        verdict: 'below_market',
        verdictMessage: `${company}'s base offer is credible, but total compensation trails the impact expected from a senior ${role}.`,
        counterStrategy: `Anchor on ${desiredBaseText} base and ${desiredTotalText} total compensation. Tie the ask to immediate ownership of AI workflow shipping, onboarding experiments, and review-first product systems.`,
        emailScript: `Thank you for the offer. I am excited about the scope of the ${role} role and the chance to own high-impact AI growth systems at ${company}. Based on the responsibilities, my product engineering background, and the market range for this level, I would be ready to sign at ${desiredBaseText} base and roughly ${desiredTotalText} total compensation. If base flexibility is limited, I would like to close the gap through additional equity, a signing bonus, and a written 6-month compensation review. I am confident this package better matches the ownership and outcomes expected from the role.`,
        phoneScript: `Lead with enthusiasm for the role, then state the revised target clearly. Keep the conversation anchored on scope, speed to impact, and the blend of engineering plus growth ownership. If they push back, ask which compensation lever has the most room: base, equity, sign-on, or a scheduled review.`,
        batna: hasCompetingOffer
          ? 'Keep the competing process active until the revised package is documented.'
          : 'Keep the Aurora Labs process warm and avoid signing before equity, review timing, and decision deadlines are clear.',
        leveragePoints: [
          'Direct experience building review-first AI career workflows from ambiguous requirements.',
          'Rare blend of full-stack product engineering, growth systems, and trust-focused AI UX.',
          'Can own onboarding experiments and lifecycle messaging without a long ramp.',
        ],
        nonSalaryAsks: [
          '6-month compensation review tied to launch outcomes.',
          'Additional equity refresh after the first major growth milestone.',
          'AI tooling stipend and conference budget.',
        ],
        redFlags: [
          context,
          'Equity refresh terms and review timing should be written into the final offer.',
        ],
      });
    }

    const db = getAdminDb();

    if (applicationId) {
      const appSnap = await db.collection('users').doc(userId).collection('applications').doc(applicationId).get();
      if (!appSnap.exists) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
      }
      const app = appSnap.data() || {};
      company = company || app.company_name;
      role = role || app.job_title;
      jobDescription = jobDescription || app.job_description;
      resumeVersionId = resumeVersionId || app.resume_version_id;
      offerBase = offerBase ?? app.offer_details?.base ?? app.offer_details?.total ?? app.offer_amount;
      offerTotal = offerTotal ?? app.offer_details?.total;
      desiredBase = desiredBase ?? app.offer_details?.desiredBase;
      desiredTotal = desiredTotal ?? app.offer_details?.desiredTotal;
      hasCompetingOffer = hasCompetingOffer ?? app.offer_details?.competingOffer;
      benefits = benefits ?? app.offer_details?.benefits;
      context = context ?? app.offer_details?.context;
    }

    if (!company || !role || !offerBase) {
      return NextResponse.json({ error: 'company, role, and offerBase are required' }, { status: 400 });
    }

    // Fetch resume for leverage context
    let resumeContext = '';
    const resumeDoc = resumeVersionId
      ? await db.collection('users').doc(userId).collection('resume_versions').doc(resumeVersionId).get()
      : null;
    const resumeSnap = resumeDoc?.exists
      ? null
      : await db
        .collection('users').doc(userId)
        .collection('resume_versions')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

    const resumeData = resumeDoc?.exists ? resumeDoc.data() : resumeSnap?.docs[0]?.data();
    if (resumeData) {
      const resume = resumeData.content;
      if (resume) {
        const yearsExp = (resume.experience || []).length;
        resumeContext = `Candidate: ${resume.name || ''}, ${resume.title || ''}, ~${yearsExp} roles. Top skills: ${(resume.skills || []).flatMap((c: any) => c.items || []).slice(0, 8).join(', ')}`;
      }
    }

    const result = await groqJSONCompletion<{
      marketRange: { low: number; mid: number; high: number };
      verdict: 'below_market' | 'at_market' | 'above_market';
      verdictMessage: string;
      counterStrategy: string;
      emailScript: string;
      phoneScript: string;
      batna: string;
      leveragePoints: string[];
      nonSalaryAsks: string[];
      redFlags: string[];
    }>(
      `You are an elite salary negotiation coach. You have coached 1000+ candidates to get 10-30% higher offers. Your tone is confident, practical, and data-driven.

RULES:
1. Always recommend negotiating — even above-market offers have room
2. Provide specific dollar amounts and percentage targets
3. Email script should be 5-7 sentences, professional but assertive
4. Phone script should be conversational talking points, not a word-for-word script
5. BATNA = Best Alternative To Negotiated Agreement
6. Focus on total comp (base + bonus + equity + benefits), not just base
7. Never sound desperate or apologetic
8. BANNED phrases: "I really appreciate the offer", "I don't want to seem greedy", "I know these are tough times"
9. Leverage points should reference specific experience/skills from the resume
10. Non-salary asks: signing bonus, extra PTO, remote flexibility, title bump, relocation, equity refresh

Return JSON:
{
  "marketRange": { "low": 120000, "mid": 140000, "high": 165000 },
  "verdict": "below_market",
  "verdictMessage": "This offer is ~15% below market median for this role and experience level.",
  "counterStrategy": "paragraph explaining the overall approach",
  "emailScript": "the actual email to send",
  "phoneScript": "talking points for a call",
  "batna": "what to do if they don't budge",
  "leveragePoints": ["specific leverage point 1", "point 2"],
  "nonSalaryAsks": ["signing bonus", "extra PTO week"],
  "redFlags": ["any red flags in this offer or company"]
}`,
      `OFFER DETAILS:\nCompany: ${company}\nRole: ${role}\nBase Offer: ${formatCompForCopy(offerBase)}\n${offerTotal ? `Total Comp Offer: ${formatCompForCopy(offerTotal)}` : ''}\n${desiredBase ? `Desired Base: ${formatCompForCopy(desiredBase)}` : ''}\n${desiredTotal ? `Desired Total: ${formatCompForCopy(desiredTotal)}` : ''}\nCompeting Offer: ${hasCompetingOffer ? 'Yes' : 'No'}\nBenefits: ${benefits || 'Not specified'}\nContext: ${context || 'Standard negotiation'}\n${jobDescription ? `Job Description Context: ${String(jobDescription).slice(0, 2500)}` : ''}\n\nCANDIDATE:\n${resumeContext}`,
      { temperature: 0.5, maxTokens: 3000 }
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[Negotiate] Error:', error);
    monitor.critical('Tool: agent/negotiate', String(error));
    return NextResponse.json(
      { error: 'Failed to generate negotiation strategy.' },
      { status: 500 }
    );
  }
}

function formatCompForCopy(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Not specified';
  const thousands = amount >= 1000 ? Math.round(amount / 1000) : Math.round(amount);
  return `$${thousands}k`;
}
