/**
 * Weekly Job Suggestions API
 * Fetches jobs from the Talent supply adapter and returns one explainable fit score.
 * 
 * GET /api/jobs/suggestions
 * Requires auth. Cached per user for 24h.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { guardApiRoute } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { scoreAllGhostRisks } from '@/lib/ghost-filter';
import {
  dedupeTalentJobs,
  finalizeTalentRecommendations,
  getTrustedTalentJobApplyUrl,
  isJobSupplyOperational,
  loadRecommendationLedger,
  recordRecommendationImpressions,
  searchTalentJobSupply,
  suppressLedgerMatches,
  TALENT_FIT_SCORE_VERSION,
  type TalentJob,
} from '@/lib/job-recommendation-platform';
import { monitor } from '@/lib/monitor';
import { extractResumeSkills, getLatestVerifiedResumeForUser as getLatestResumeForUser } from '@/lib/server-resume';
import { withJobDiscoveryRecovery } from '@/lib/job-discovery-route-recovery';
import {
  classifyJobDiscoveryFailure,
  jobDiscoveryRecoveryStatus,
  jobSuggestionsPartialRecovery,
  jobSuggestionsSetupRecovery,
  jobSupplyUnavailableRecovery,
} from '@/lib/job-discovery-recovery';

interface ScoredJob extends TalentJob {
  acceptanceChance: number;
  acceptanceReason: string;
  matchMethod: 'hybrid';
  outboundLinkVerified: boolean;
}

// In-memory cache: hash → { data, expiry }
const suggestionsCache = new Map<string, { data: ScoredJob[]; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000;

function stableList(values: unknown): string {
  return Array.isArray(values)
    ? [...values].map(String).map(value => value.trim().toLowerCase()).filter(Boolean).sort().join(',')
    : '';
}

function prefsHash({
  uid,
  roles,
  cities,
  remotePref,
  salaryMin,
  userSkills,
  ledgerFingerprint,
}: {
  uid: string;
  roles: string[];
  cities: string[];
  remotePref: string;
  salaryMin: number;
  userSkills: string[];
  ledgerFingerprint: string;
}): string {
  return [
    uid,
    TALENT_FIT_SCORE_VERSION,
    stableList(roles),
    stableList(cities),
    remotePref || 'any',
    String(salaryMin || 0),
    stableList(userSkills),
    ledgerFingerprint,
  ].join(':');
}

function fingerprintLedger(ledger: Awaited<ReturnType<typeof loadRecommendationLedger>>) {
  const unique = new Map<string, string>();
  for (const entry of ledger.values()) {
    if (entry.status === 'shown' && entry.feedbackTags.length === 0) continue;
    unique.set(entry.jobKey, `${entry.status}:${entry.feedbackTags.join(',')}:${entry.updatedAt || ''}`);
  }
  const stable = [...unique.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  return crypto.createHash('sha1').update(stable).digest('hex');
}

export async function GET(req: NextRequest) {
  const guard = await guardApiRoute(req, { rateLimit: 30, rateLimitWindow: 60_000 });
  if (guard.error) return withJobDiscoveryRecovery(guard.error, 'suggestions');

  try {
    const db = getAdminDb();
    const uid = guard.user.uid;

    // 1. Load preferences from Firestore
    const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();
    if (!prefsSnap.exists) {
      const recovery = jobSuggestionsSetupRecovery();
      return NextResponse.json({
        success: true,
        jobs: [],
        needsSetup: true,
        message: recovery.message,
        recovery,
      });
    }

    const prefs = prefsSnap.data()!;
    const targetRoles: string[] = prefs.targetRoles || [];
    const preferredCities: string[] = prefs.preferredCities || [];
    const remotePref: string = prefs.remotePref || 'any';
    const salaryMin: number = prefs.salaryMin || 0;

    if (targetRoles.length === 0) {
      const recovery = jobSuggestionsSetupRecovery();
      return NextResponse.json({
        success: true,
        jobs: [],
        needsSetup: true,
        message: recovery.message,
        recovery,
      });
    }

    // 2. Load user skills from the newest saved resume.
    let userSkills: string[] = [];
    try {
      const latestResume = await getLatestResumeForUser(db, uid);
      userSkills = extractResumeSkills(latestResume.resume);
    } catch (e) {
      console.warn('[suggestions] Could not load latest resume skills:', e);
    }

    // Fallback: try manual skills from job search preferences
    if (userSkills.length === 0) {
      const skillsKey = prefs.manualSkills;
      if (skillsKey && Array.isArray(skillsKey)) userSkills = skillsKey;
    }

    // 3. Include feedback in the cache key so save and skip signals affect the next ranking.
    const ledger = await loadRecommendationLedger(db, uid);
    const hash = prefsHash({
      uid,
      roles: targetRoles,
      cities: preferredCities,
      remotePref,
      salaryMin,
      userSkills,
      ledgerFingerprint: fingerprintLedger(ledger),
    });
    const cached = suggestionsCache.get(hash);
    if (cached && Date.now() < cached.expiry) {
      await recordRecommendationImpressions(db, uid, cached.data);
      return NextResponse.json({
        success: true,
        jobs: cached.data,
        cached: true,
        count: cached.data.length,
        scoreVersion: TALENT_FIT_SCORE_VERSION,
      });
    }

    // 4. Fetch jobs from Talent supply adapter for each role+city combination
    const allJobs: TalentJob[] = [];

    // Build search combinations (max 6 to stay within API limits)
    const cities = preferredCities.length > 0 ? preferredCities.slice(0, 3) : [''];
    const roles = targetRoles.slice(0, 3);
    const combos = roles.flatMap(role => cities.map(city => ({ role, city }))).slice(0, 6);
    let failedSearches = 0;

    for (const { role, city } of combos) {
      try {
        const result = await searchTalentJobSupply({
          query: role,
          location: city,
          country: 'us',
          page: 1,
          resultsPerPage: 10,
          sortBy: 'relevance',
          salaryMin: salaryMin || undefined,
        });
        if (!isJobSupplyOperational(result.providerStatus)) {
          failedSearches += 1;
          continue;
        }
        for (const job of suppressLedgerMatches(result.jobs, ledger)) {
          const locLower = job.location.toLowerCase();
          if (remotePref === 'remote' && !locLower.includes('remote')) continue;
          if (remotePref === 'onsite' && locLower.includes('remote')) continue;
          const salaryTop = job.salary.max || job.salary.min;
          if (salaryMin > 0 && salaryTop && salaryTop < salaryMin) continue;
          allJobs.push(job);
        }
      } catch (e) {
        failedSearches += 1;
        console.warn(`[suggestions] Failed to fetch ${role} in ${city}:`, e);
      }
    }

    if (allJobs.length === 0) {
      if (failedSearches > 0) {
        const recovery = jobSupplyUnavailableRecovery('suggestions');
        return NextResponse.json({
          success: false,
          error: recovery.title,
          code: recovery.code,
          retryable: recovery.retryable,
          recovery,
        }, { status: jobDiscoveryRecoveryStatus(recovery) });
      }
      return NextResponse.json({
        success: true,
        jobs: [],
        message: 'No jobs found matching your preferences. Try broadening your search criteria.',
      });
    }

    const ghostAssessments = scoreAllGhostRisks(
      allJobs.map(job => ({
        title: job.title,
        company: job.company,
        postedDate: job.postedDate,
        description: job.description,
        salary: job.salary,
        url: job.url,
        location: job.location,
      })),
    );
    const rankedCandidates = finalizeTalentRecommendations(
      dedupeTalentJobs(allJobs.map((job, index) => ({ ...job, ghostRisk: ghostAssessments[index] }))),
      {
        userSkills,
        targetRoles,
        preferredCities,
        remotePref,
        salaryMin,
        ledger,
      },
    );

    // 5. Use the same explainable score for ranking, display and follow-up learning.
    const scoredJobs: ScoredJob[] = rankedCandidates.slice(0, 10).map(job => {
      const trustedApplyUrl = getTrustedTalentJobApplyUrl(job);
      return {
        ...job,
        url: trustedApplyUrl || '',
        acceptanceChance: job.fitScore!.overall,
        acceptanceReason: job.recommendationReason || 'Review the fit evidence before preparing a packet.',
        matchMethod: 'hybrid',
        outboundLinkVerified: Boolean(trustedApplyUrl),
      };
    });
    const partialRecovery = failedSearches > 0 ? jobSuggestionsPartialRecovery() : null;

    // 6. Only complete multi-source searches are safe to cache as the weekly set.
    if (!partialRecovery) {
      suggestionsCache.set(hash, { data: scoredJobs, expiry: Date.now() + CACHE_TTL });
    }
    await recordRecommendationImpressions(db, uid, scoredJobs);

    // Prune old cache entries
    if (suggestionsCache.size > 500) {
      const oldest = suggestionsCache.keys().next().value;
      if (oldest) suggestionsCache.delete(oldest);
    }

    // 7. Save last suggestions timestamp to Firestore (for notification logic)
    if (!partialRecovery) {
      await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').update({
        lastSuggestionsAt: new Date().toISOString(),
        lastSuggestionsCount: scoredJobs.length,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      jobs: scoredJobs,
      count: scoredJobs.length,
      cached: false,
      partial: Boolean(partialRecovery),
      recovery: partialRecovery,
      scoreVersion: TALENT_FIT_SCORE_VERSION,
      skillsUsed: userSkills.length,
      searchCombos: combos.length,
    });
  } catch (error) {
    console.error('[jobs/suggestions] Error:', error);
    monitor.critical('Tool: jobs/suggestions', String(error));
    const recovery = classifyJobDiscoveryFailure(error, 'suggestions');
    return NextResponse.json({
      success: false,
      error: recovery.title,
      code: recovery.code,
      retryable: recovery.retryable,
      recovery,
    }, { status: jobDiscoveryRecoveryStatus(recovery) });
  }
}
