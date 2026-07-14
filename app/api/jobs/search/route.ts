import { NextRequest, NextResponse } from 'next/server';
import { calculateFitScore, type JobSearchParams } from '@/lib/job-search-api';
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

        const params: JobSearchParams = {
            query: searchParams.get('query') || 'software engineer',
            location: searchParams.get('location') || '',
            country: searchParams.get('country') || 'us',
            page: parseInt(searchParams.get('page') || '1'),
            sortBy: (searchParams.get('sortBy') as 'relevance' | 'salary' | 'date') || 'relevance',
            fullTime: searchParams.get('fullTime') === 'true',
            salaryMin: searchParams.get('salaryMin') ? parseInt(searchParams.get('salaryMin')!) : undefined,
            resultsPerPage: parseInt(searchParams.get('limit') || '20'),
        };

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
        const jobs = finalizeTalentRecommendations(suppressLedgerMatches(jobsWithGhost, ledger), {
            userSkills,
            targetRoles: [params.query],
            preferredCities: params.location ? [params.location] : [],
            remotePref: params.location?.toLowerCase() === 'remote' ? 'remote' : 'any',
            salaryMin: params.salaryMin || 0,
            ledger,
        });
        const impressionId = db
            ? await createRecommendationImpressionSession(db, guard.user.uid, jobs, {
                resumeId: scoreResumeId,
                resume: scoreResume,
                sortBy: params.sortBy || 'relevance',
            }).catch(() => null)
            : null;
        if (db) await recordRecommendationImpressions(db, guard.user.uid, jobs).catch(() => {});

        const ghostStats = {
            high: ghostAssessments.filter(g => g.risk === 'high').length,
            medium: ghostAssessments.filter(g => g.risk === 'medium').length,
            fresh: ghostAssessments.filter(g => g.fresh).length,
        };

        return NextResponse.json({
            success: true,
            jobs,
            totalCount: result.totalCount,
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
