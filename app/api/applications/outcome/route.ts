/**
 * Application Outcome API — /api/applications/outcome
 * GET: Fetch applications needing outcome updates (7+ days, no outcome reported)
 * POST: Report an outcome for an application
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { upsertRecommendationLedgerInTransaction, type RecommendationLedgerStatus } from '@/lib/job-recommendation-platform';

const VALID_OUTCOMES = ['callback', 'interview', 'offer', 'rejection', 'ghosted'] as const;
type ApplicationOutcome = typeof VALID_OUTCOMES[number];
const OUTCOME_SOURCES = new Set(['manual', 'email_nudge', 'user_prompt']);
const POSITIVE_OUTCOME_RANK: Partial<Record<ApplicationOutcome, number>> = {
  callback: 1,
  interview: 2,
  offer: 3,
};
const STATUS_ORDER: Record<string, number> = {
  not_applied: 0,
  applied: 1,
  screening: 2,
  interview_scheduled: 3,
  interviewed: 4,
  offer: 5,
  accepted: 6,
  rejected: 6,
  withdrawn: 6,
};

class OutcomeRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

function parseBoundedInteger(value: unknown, min: number, max: number, field: string) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new OutcomeRequestError(400, 'INVALID_OUTCOME_METADATA', `${field} is invalid`);
  }
  return parsed;
}

function resolveCalibrationOutcome(previous: unknown, next: ApplicationOutcome): ApplicationOutcome {
  const prior = VALID_OUTCOMES.includes(previous as ApplicationOutcome) ? previous as ApplicationOutcome : null;
  if (!prior) return next;
  const priorRank = POSITIVE_OUTCOME_RANK[prior] || 0;
  const nextRank = POSITIVE_OUTCOME_RANK[next] || 0;
  if (priorRank > 0 && nextRank === 0) return prior;
  return nextRank >= priorRank ? next : prior;
}

function assertOutcomeTransition(previous: unknown, next: ApplicationOutcome) {
  if (!previous || previous === next) return;
  if (!VALID_OUTCOMES.includes(previous as ApplicationOutcome)) return;
  const prior = previous as ApplicationOutcome;
  if (prior === 'rejection' || prior === 'ghosted' || prior === 'offer') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', `The recorded ${prior} outcome is already final`);
  }
  const priorRank = POSITIVE_OUTCOME_RANK[prior] || 0;
  const nextRank = POSITIVE_OUTCOME_RANK[next] || 0;
  if (nextRank > 0 && nextRank < priorRank) {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'Application outcomes cannot move backwards');
  }
}

function assertStatusOutcomeTransition(status: unknown, next: ApplicationOutcome) {
  if (status === 'withdrawn') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'A withdrawn application cannot record a response outcome');
  }
  if (status === 'accepted' && next !== 'offer') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'An accepted application can only preserve its offer outcome');
  }
  if (status === 'rejected' && next !== 'rejection') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'A rejected application can only preserve its rejection outcome');
  }
  if (status === 'offer' && next !== 'offer') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'An offer-stage application can only preserve its offer outcome');
  }
  if ((status === 'interview_scheduled' || status === 'interviewed') && next === 'callback') {
    throw new OutcomeRequestError(409, 'OUTCOME_TRANSITION_INVALID', 'Application outcomes cannot move backwards from interview stage');
  }
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 15, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const db = getAdminDb();
    const uid = guard.user.uid;
    const appsSnap = await db.collection('users').doc(uid).collection('applications').get();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allApps = appsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const pending = allApps
      .filter((app: any) => {
        if (app.outcome_response) return false;
        if (app.status !== 'applied') return false;
        const appliedAt = app.applied_at || app.created_at;
        return new Date(appliedAt).getTime() < sevenDaysAgo;
      })
      .map((app: any) => ({
        id: app.id,
        company_name: app.company_name,
        job_title: app.job_title || '',
        applied_at: app.applied_at || app.created_at,
        days_ago: Math.floor((Date.now() - new Date(app.applied_at || app.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        talent_density_score: app.talent_density_score || null,
      }))
      .sort((a: any, b: any) => a.days_ago - b.days_ago)
      .reverse()
      .slice(0, 10);

    // Compute aggregate outcome stats.
    //
    // `|| 1` used to stand in for the denominator here. That turned five
    // undefined ratios into five measured zeros: a brand-new account with no
    // applications was shown "Response Rate 0%", "Interview Rate 0%",
    // "Offer Rate 0%" and "Ghost Rate 0%" — and the "No Outcome Data" empty
    // state below it was unreachable, because the page gates on the stats
    // object existing rather than on the count.
    const appliedApps = allApps.filter(a => a.status !== 'not_applied');
    const withOutcome = allApps.filter(a => a.outcome_response);
    const totalApplied = appliedApps.length;
    const totalReported = withOutcome.length;

    const counts: Record<string, number> = { callback: 0, interview: 0, offer: 0, rejection: 0, ghosted: 0 };
    let totalDays = 0;
    let daysCount = 0;
    for (const app of withOutcome) {
      const outcome = app.outcome_response as string;
      if (counts[outcome] !== undefined) counts[outcome]++;
      if (app.outcome_days_to_response) {
        totalDays += app.outcome_days_to_response;
        daysCount++;
      }
    }

    /*
     * A rejection is a response.
     *
     * This used to be `callback + interview + offer`, which made "Response
     * Rate" mean "positive response rate" while the Overview tab of the same
     * page — EMPLOYER_RESPONSE_STATUSES in lib/career-graph.ts, under the
     * comment "the statuses that mean an employer came back to you" — counted
     * rejections. A user whose three employers had all written back to say no
     * read "Responded 3 — 100% of applications sent" on one tab and "Response
     * Rate 0% / Of 3 sent" on the next. `ghosted` stays out, for the obvious
     * reason. The positive outcomes keep their own tiles below.
     */
    const responded = counts.callback + counts.interview + counts.offer + counts.rejection;
    const stats = {
      totalReported,
      totalApplied,
      // Null, not zero, when there is nothing to divide by. The client renders
      // null as an em dash and hides the whole panel when totalApplied is 0.
      responseRate: totalApplied > 0 ? Math.round((responded / totalApplied) * 100) : null,
      ghostRate: totalReported > 0 ? Math.round((counts.ghosted / totalReported) * 100) : null,
      avgDaysToResponse: daysCount > 0 ? Math.round(totalDays / daysCount) : null,
      interviewRate: totalApplied > 0 ? Math.round(((counts.interview + counts.offer) / totalApplied) * 100) : null,
      offerRate: totalApplied > 0 ? Math.round((counts.offer / totalApplied) * 100) : null,
      callbackCount: counts.callback,
      interviewCount: counts.interview,
      offerCount: counts.offer,
      rejectionCount: counts.rejection,
      ghostedCount: counts.ghosted,
    };

    return NextResponse.json({ success: true, pending, count: pending.length, stats });
  } catch (error) {
    console.error('[outcome] GET error:', error);
    monitor.critical('Tool: applications/outcome', String(error));
    return NextResponse.json({ error: 'Failed to fetch pending outcomes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 20, rateLimitWindow: 60_000 });
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const { applicationId, outcome, interviewRounds, offerAmount, source } = body;

    if (typeof applicationId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(applicationId) || !outcome) {
      return NextResponse.json({ error: 'applicationId and outcome are required' }, { status: 400 });
    }

    if (!VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` }, { status: 400 });
    }

    const normalizedOutcome = outcome as ApplicationOutcome;
    const normalizedSource = OUTCOME_SOURCES.has(source) ? source : 'manual';
    const normalizedInterviewRounds = parseBoundedInteger(interviewRounds, 1, 30, 'Interview rounds');
    const normalizedOfferAmount = parseBoundedInteger(offerAmount, 1, 100_000_000, 'Offer amount');

    const db = getAdminDb();
    const uid = guard.user.uid;
    const appRef = db.collection('users').doc(uid).collection('applications').doc(applicationId);
    const calibrationRef = db.collection('users').doc(uid).collection('recommendation_calibration').doc(applicationId);
    const outcomeRef = db.collection('users').doc(uid).collection('outcomes').doc(applicationId);

    const recommendationStatus: Record<string, RecommendationLedgerStatus> = {
      callback: 'interview',
      interview: 'interview',
      offer: 'offer',
      rejection: 'rejected',
      ghosted: 'ghosted',
    };
    const result = await db.runTransaction(async transaction => {
      const [snap, calibrationSnap, outcomeSnap] = await Promise.all([
        transaction.get(appRef),
        transaction.get(calibrationRef),
        transaction.get(outcomeRef),
      ]);
      if (!snap.exists) throw new OutcomeRequestError(404, 'APPLICATION_NOT_FOUND', 'Application not found');

      const appData = snap.data()!;
      const previousOutcome = appData.outcome_response as ApplicationOutcome | undefined;
      if (appData.status === 'not_applied') {
        throw new OutcomeRequestError(409, 'APPLICATION_NOT_APPLIED', 'Mark applied before logging an outcome');
      }
      assertStatusOutcomeTransition(appData.status, normalizedOutcome);
      assertOutcomeTransition(previousOutcome, normalizedOutcome);
      if (previousOutcome === normalizedOutcome) {
        return {
          duplicate: true,
          daysToResponse: appData.outcome_days_to_response || 0,
          reportedAt: appData.outcome_reported_at || null,
          learningLinked: Boolean(calibrationSnap.data()?.evidence?.jobKey),
        };
      }

      const appliedAt = appData.applied_at || appData.created_at;
      const appliedTimestamp = new Date(appliedAt).getTime();
      const now = Date.now();
      if (!Number.isFinite(appliedTimestamp) || appliedTimestamp > now + 5 * 60 * 1000) {
        throw new OutcomeRequestError(409, 'INVALID_APPLICATION_TIMELINE', 'Application timeline is invalid');
      }
      const daysToResponse = Math.max(0, Math.floor((now - appliedTimestamp) / (1000 * 60 * 60 * 24)));
      if (normalizedOutcome === 'ghosted' && daysToResponse < 7) {
        throw new OutcomeRequestError(
          409,
          'GHOST_WINDOW_NOT_REACHED',
          'Wait at least 7 days after applying before marking this role as ghosted.',
          { daysRemaining: Math.max(1, 7 - daysToResponse) },
        );
      }

      const reportedAt = new Date(now).toISOString();
      const calibrationData = calibrationSnap.data() || {};
      const calibrationEvidence = calibrationData.evidence || null;
      const existingOutcomeData = outcomeSnap.exists ? outcomeSnap.data() || {} : {};
      const priorHistory = Array.isArray(existingOutcomeData.history) && existingOutcomeData.history.length > 0
        ? existingOutcomeData.history
        : Array.isArray(appData.outcome_history) && appData.outcome_history.length > 0
          ? appData.outcome_history
          : previousOutcome && appData.outcome_reported_at
            ? [{
                outcome: previousOutcome,
                reportedAt: appData.outcome_reported_at,
                daysToResponse: appData.outcome_days_to_response || 0,
                source: appData.outcome_source || 'manual',
              }]
            : [];
      const event = {
        outcome: normalizedOutcome,
        reportedAt,
        daysToResponse,
        source: normalizedSource,
        ...(normalizedInterviewRounds ? { interviewRounds: normalizedInterviewRounds } : {}),
        ...(normalizedOfferAmount ? { offerAmount: normalizedOfferAmount } : {}),
      };
      const history = [...priorHistory, event].slice(-25);
      const priorCalibrationOutcome = priorHistory.reduce(
        (best: ApplicationOutcome | null, item: any) => VALID_OUTCOMES.includes(item?.outcome)
          ? resolveCalibrationOutcome(best, item.outcome)
          : best,
        VALID_OUTCOMES.includes(calibrationData.outcome) ? calibrationData.outcome as ApplicationOutcome : null,
      );
      const calibrationOutcome = resolveCalibrationOutcome(priorCalibrationOutcome, normalizedOutcome);

      if (calibrationEvidence?.jobKey) {
        await upsertRecommendationLedgerInTransaction(db, transaction, uid, {
          identityKey: calibrationEvidence.jobKey,
        }, recommendationStatus[normalizedOutcome], {
          feedbackTags: [`outcome_${normalizedOutcome}`],
          score: calibrationEvidence.score,
        });
      }

      const statusMap: Partial<Record<ApplicationOutcome, string>> = {
        callback: 'screening',
        interview: 'interview_scheduled',
        offer: 'offer',
        rejection: 'rejected',
      };
      const targetStatus = statusMap[normalizedOutcome];
      const nextStatus = targetStatus && (
        normalizedOutcome === 'rejection'
        || (STATUS_ORDER[targetStatus] || 0) > (STATUS_ORDER[appData.status] || 0)
      ) ? targetStatus : appData.status;
      transaction.update(appRef, {
        outcome_response: normalizedOutcome,
        outcome_reported_at: reportedAt,
        outcome_days_to_response: daysToResponse,
        outcome_source: normalizedSource,
        outcome_history: history,
        last_updated: reportedAt,
        ...(nextStatus !== appData.status ? { status: nextStatus } : {}),
        ...(normalizedInterviewRounds ? { interview_rounds: normalizedInterviewRounds } : {}),
        ...(normalizedOfferAmount ? { offer_amount: normalizedOfferAmount } : {}),
      });
      transaction.set(calibrationRef, {
        version: 1,
        applicationId,
        outcome: calibrationOutcome,
        latestOutcome: normalizedOutcome,
        reportedAt,
        daysToResponse,
        updatedAt: reportedAt,
      }, { merge: true });
      transaction.set(outcomeRef, {
        application_id: applicationId,
        company: appData.company_name,
        job_title: appData.job_title || '',
        outcome: normalizedOutcome,
        best_outcome: calibrationOutcome,
        days_to_response: daysToResponse,
        match_score: appData.talent_density_score || null,
        reported_at: reportedAt,
        history,
      }, { merge: true });

      return { duplicate: false, daysToResponse, reportedAt, learningLinked: Boolean(calibrationEvidence?.jobKey) };
    });

    monitor.info('Outcome Reported', `${applicationId}: ${normalizedOutcome}`, [
      { name: 'Days', value: String(result.daysToResponse) },
    ]);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof OutcomeRequestError) {
      return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    console.error('[outcome] POST error:', error);
    monitor.critical('Tool: applications/outcome', String(error));
    return NextResponse.json({ error: 'Failed to report outcome' }, { status: 500 });
  }
}
