import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { isMasterAccount } from '@/lib/pricing-tiers';
import { TALENT_FIT_SCORE_VERSION } from '@/lib/job-recommendation-platform';
import { buildRecommendationCalibrationReport } from '@/lib/recommendation-calibration';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req);
  if (guard.error) return guard.error;
  if (!isMasterAccount(guard.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403, headers: PRIVATE_HEADERS });
  }

  const requestedDays = Number(req.nextUrl.searchParams.get('windowDays') || 180);
  const windowDays = Math.max(30, Math.min(365, Number.isFinite(requestedDays) ? requestedDays : 180));
  const cutoff = new Date(Date.now() - windowDays * 86_400_000);
  const snapshot = await getAdminDb()
    .collectionGroup('recommendation_calibration')
    .where('reportedAt', '>=', cutoff)
    .orderBy('reportedAt', 'desc')
    .limit(2001)
    .get();

  const signals = snapshot.docs.flatMap(doc => {
    const pathParts = doc.ref.path.split('/');
    if (pathParts.length !== 4) return [];
    const data = doc.data();
    return [{ userKey: pathParts[1], outcome: data.outcome, reportedAt: data.reportedAt, evidence: data.evidence }];
  });
  const report = buildRecommendationCalibrationReport(signals, {
    currentScoreVersion: TALENT_FIT_SCORE_VERSION,
    sampleLimit: 2000,
    truncated: snapshot.size > 2000,
  });

  return NextResponse.json({
    report,
    reviewSafety: {
      automaticChangesApplied: false,
      scoreWeightChangeAuthorized: false,
      thresholdChangeAuthorized: false,
      humanReviewRequired: true,
    },
    privacy: 'Aggregate response only. No user, company, role, email, or resume data is returned; evidence consists of user-reported response signals.',
  }, { headers: PRIVATE_HEADERS });
}
