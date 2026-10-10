/**
 * Salary Negotiation Coach
 * Generates counter-offer strategies, scripts, and BATNA analysis
 * based on the user's offer details and market data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { buildOfferPlanningBrief } from '@/lib/offer-planning';
import { offerDetailsSchema } from '@/lib/application-commands';
import { DEMO_USER_ID, getDemoJobApplications, isDemoModeEnabled } from '@/lib/demo-mode';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';

export async function POST(req: NextRequest) {
  try {
    const guard = await guardApiRoute(req, { rateLimit: 10, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (guard.user.tier === 'free') {
      return NextResponse.json(
        { error: 'Offer Coach is a Standard feature.', upgrade: true },
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
    let offerBase = rawOfferBase ?? offerDetails?.base;
    let offerTotal = rawOfferTotal ?? offerDetails?.total;
    let currency = offerDetails?.currency;
    let period = offerDetails?.period;
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
      const details = offerDetailsSchema.safeParse({ base: offerBase, total: offerTotal, desiredBase, desiredTotal, currency: currency || 'USD', period: period || 'year', competingOffer: Boolean(hasCompetingOffer) });
      if (!details.success) return NextResponse.json({ error: 'Check the offer amounts and pay period.' }, { status: 400 });
      return NextResponse.json({ success: true, ...buildOfferPlanningBrief({ company, role, ...details.data }) });
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
      offerBase = offerBase ?? app.offer_details?.base ?? (app.offer_details?.total == null ? app.offer_amount : undefined);
      offerTotal = offerTotal ?? app.offer_details?.total;
      currency = currency || app.offer_details?.currency;
      period = period || app.offer_details?.period;
      desiredBase = desiredBase ?? app.offer_details?.desiredBase;
      desiredTotal = desiredTotal ?? app.offer_details?.desiredTotal;
      hasCompetingOffer = hasCompetingOffer ?? app.offer_details?.competingOffer;
      benefits = benefits ?? app.offer_details?.benefits;
      context = context ?? app.offer_details?.context;
    }

    if (!company || !role || (offerBase == null && offerTotal == null)) {
      return NextResponse.json({ error: 'company, role, and base or total compensation are required' }, { status: 400 });
    }

    const details = offerDetailsSchema.safeParse({ base: offerBase == null ? undefined : Number(offerBase), total: offerTotal, desiredBase, desiredTotal, currency: currency || 'USD', period: period || 'year', competingOffer: Boolean(hasCompetingOffer) });
    if (!details.success) return NextResponse.json({ error: 'Check the offer amounts, currency and pay period.' }, { status: 400 });
    return NextResponse.json({ success: true, benchmark: null, ...buildOfferPlanningBrief({ company: String(company), role: String(role), ...details.data }) });
  } catch (error: any) {
    console.error('[Negotiate] Error:', error);
    monitor.critical('Tool: agent/negotiate', String(error));
    return NextResponse.json(
      { error: 'Failed to generate negotiation strategy.' },
      { status: 500 }
    );
  }
}
