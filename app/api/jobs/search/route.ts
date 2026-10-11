import { NextRequest, NextResponse } from 'next/server';
import { calculateFitScore, type JobSearchParams } from '@/lib/job-search-api';
import { parseJobSearchQuery, selectJobSearchPage } from '@/lib/job-search-selection';
import { guardApiRoute } from '@/lib/api-auth';
import { scoreAllGhostRisks } from '@/lib/ghost-filter';
import { monitor } from '@/lib/monitor';
import { getAdminDb } from '@/lib/firebase-admin';
import { withJobDiscoveryRecovery } from '@/lib/job-discovery-route-recovery';
import {
    classifyJobDiscoveryFailure,
    jobDiscoveryRecoveryStatus,
    jobSupplyUnavailableRecovery,
} from '@/lib/job-discovery-recovery';
import {
    createRecommendationImpressionSession,
    finalizeTalentRecommendations,
    isJobSupplyOperational,
    loadRecommendationLedger,
    recordRecommendationImpressions,
    searchTalentJobSupply,
    suppressLedgerMatches,
    TALENT_FIT_SCORE_VERSION,
} from '@/lib/job-recommendation-platform';
import {
    extractResumeSkills,
    getLatestVerifiedResumeForUser,
    getVerifiedResumeForUserById,
} from '@/lib/server-resume';

export async function GET(request: NextRequest) {
    try {
        const guard = await guardApiRoute(request, { rateLimit: 15, rateLimitWindow: 60_000, allowAnonymous: true, feature: 'jdGenerations' });
        if (guard.error) return withJobDiscoveryRecovery(guard.error, 'search');

        const { searchParams } = new URL(request.url);

        let params: JobSearchParams;
        try {
            params = parseJobSearchQuery(searchParams);
        } catch (error) {
            return NextResponse.json({ success: false, error: (error as Error).message, code: 'invalid_search_parameters' }, { status: 400 });
        }

        const result = await searchTalentJobSupply(params);
        if (!isJobSupplyOperational(result.providerStatus)) {
            const recovery = jobSupplyUnavailableRecovery('search');
            return NextResponse.json({
                success: false,
                error: recovery.title,
                code: recovery.code,
                retryable: recovery.retryable,
                recovery,
            }, { status: jobDiscoveryRecoveryStatus(recovery) });
        }

        // Resume evidence is loaded from the authenticated user's verified source.
        // It never travels in the URL or comes from a client-provided skill list.
        let userSkills: string[] = [];
        let scoreResumeId: string | null = null;
        let scoreResume: unknown = null;
        if (!guard.user.uid.startsWith('anon:')) {
            const db = getAdminDb();
            const selectedResumeId = request.headers.get('x-talent-resume-id') || '';
            const resumeResult = selectedResumeId
                ? await getVerifiedResumeForUserById(db, guard.user.uid, selectedResumeId)
                : await getLatestVerifiedResumeForUser(db, guard.user.uid);
            if (resumeResult.verification?.verified) userSkills = extractResumeSkills(resumeResult.resume);
            if (resumeResult.verification?.verified) {
                scoreResumeId = resumeResult.id;
                scoreResume = resumeResult.resume;
            }
        }

        // One deterministic evidence score feeds the same composite ranking everywhere.
        const jobsWithKeywordScore = result.jobs.map(job => {
            const evidenceScore = userSkills.length > 0
                ? calculateFitScore(userSkills, job.skills, job.title)
                : null;
            return {
                ...job,
                keywordScore: evidenceScore,
                matchMethod: 'keyword' as const,
            };
        });
        const matchMethod = 'hybrid' as const;

        // ── Ghost Job Scoring ──
        const ghostAssessments = scoreAllGhostRisks(
            jobsWithKeywordScore.map(j => ({
                title: j.title,
                company: j.company,
                postedDate: j.postedDate,
                description: j.description,
                salary: j.salary,
                url: j.url,
                location: j.location,
            }))
        );

        const jobsWithGhost = jobsWithKeywordScore.map((job, i) => {
            const ghostRisk = ghostAssessments[i];
            return {
                ...job,
                ghostRisk,
                freshness: {
                    postedDate: job.postedDate,
                    isFresh: ghostRisk.fresh,
                    ghostRisk: ghostRisk.risk,
                    reasons: ghostRisk.reasons,
                },
                packetStatus: 'idle',
            };
        });

        const isAnonymous = guard.user.uid.startsWith('anon:');
        const db = isAnonymous ? null : getAdminDb();
        const ledger = db ? await loadRecommendationLedger(db, guard.user.uid) : new Map();
        const rankedCandidates = finalizeTalentRecommendations(suppressLedgerMatches(jobsWithGhost, ledger), {
            userSkills,
            targetRoles: [params.query],
            preferredCities: params.location ? [params.location] : [],
            remotePref: params.location?.toLowerCase() === 'remote' ? 'remote' : 'any',
            salaryMin: params.salaryMin || 0,
            ledger,
        });
        const selection = selectJobSearchPage(rankedCandidates, params);
        const jobs = selection.jobs;
        const impressionId = db
            ? await createRecommendationImpressionSession(db, guard.user.uid, jobs, {
                resumeId: scoreResumeId,
                resume: scoreResume,
                sortBy: params.sortBy || 'relevance',
            }).catch(() => null)
            : null;
        if (db) await recordRecommendationImpressions(db, guard.user.uid, jobs).catch(() => {});

        const ghostStats = {
            high: jobs.filter(job => job.ghostRisk?.risk === 'high').length,
            medium: jobs.filter(job => job.ghostRisk?.risk === 'medium').length,
            fresh: jobs.filter(job => job.ghostRisk?.fresh).length,
        };

        return NextResponse.json({
            success: true,
            jobs,
            totalCount: selection.totalCount,
            page: selection.page,
            pageSize: selection.pageSize,
            hasMore: selection.hasMore,
            candidateScope: 'bounded_provider_batch',
            source: result.source,
            cached: result.cached || false,
            query: params.query,
            location: params.location,
            matchMethod,
            scoreVersion: TALENT_FIT_SCORE_VERSION,
            impressionId,
            scoreResumeId,
            providerStatus: result.providerStatus,
            ghostStats,
        });
    } catch (error) {
        console.error('Job search error:', error);
        monitor.critical('Tool: jobs/search', String(error));
        const recovery = classifyJobDiscoveryFailure(error, 'search');
        return NextResponse.json(
            {
                success: false,
                error: recovery.title,
                code: recovery.code,
                retryable: recovery.retryable,
                recovery,
            },
            { status: jobDiscoveryRecoveryStatus(recovery) }
        );
    }
}
