/**
 * Agent Pipeline Cron — /api/cron/agent-pipeline
 *
 * Triggered daily at 2am UTC by Cloud Scheduler.
 * Per user: scan boards → score with AI → morph resume → generate cover letter → queue for review.
 *
 * Setup:
 *   URL:  https://talentconsulting.io/api/cron/agent-pipeline
 *   Method: POST
 *   Headers: Authorization: Bearer <CRON_SECRET>
 *   Schedule: 0 2 * * * (daily at 2am UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  dedupeTalentJobs,
  finalizeTalentRecommendations,
  isPreparationEligibleRecommendation,
  loadRecommendationLedger,
  searchTalentJobSupply,
  suppressLedgerMatches,
  upsertRecommendationLedger,
  type TalentJob,
} from '@/lib/job-recommendation-platform';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { scoreAllGhostRisks } from '@/lib/ghost-filter';
import { Resend } from 'resend';
import { monitor } from '@/lib/monitor';
import { EMAIL_FROM, buildAgentDigestEmail, type AgentJobForDigest } from '@/lib/email-templates';
import { logUserCommunication } from '@/lib/communications';
import { getOrComputeTwin, invalidateTwin, type CareerTwin } from '@/lib/career-twin';
import {
  resolveResumeMorphAccess,
  type ResumeMorphGuardrailReport,
} from '@/lib/resume-morph-guardrails';
import { getResumeMorphConsentForUser } from '@/lib/resume-morph-consent-server';
import { generateGuardedMorphDraft } from '@/lib/sona/morph-draft-generation';
import {
  buildTruthLockedCoverLetter,
  type CoverLetterGuardrailReport,
} from '@/lib/cover-letter-guardrails';
import {
  extractResumeSkills,
  getLatestVerifiedResumeForUser as getLatestResumeForUser,
} from '@/lib/server-resume';
import { getAgentDigestEmailConsent, sanitizeJobDeliveryError } from '@/lib/job-notification-delivery';
import { getResendDeliveryTags, isJobEmailDeliveryLockActive } from '@/lib/job-notification-receipt-contract';
import {
  acceptJobEmailDeliveryAttempt,
  createJobEmailDeliveryAttempt,
  failJobEmailDeliveryAttempt,
} from '@/lib/job-notification-receipts';
import { getUserTier, type PlanTier } from '@/lib/pricing-tiers';
import { resolveSonaWorkloadEntitlement } from '@/lib/sona/workload-policy';
import {
  cancelSonaPaidWorkloadRun,
  releaseSonaPaidWorkloadRun,
  reserveSonaPaidWorkloadRun,
} from '@/lib/sona/workload-reservation';
import { processSonaEconomicsOutbox } from '@/lib/sona/economics';
import { isVerifiedPrimaryJobSearch, probeJobSupplyHealth } from '@/lib/job-supply-health';
import { selectDailyCronBatch } from '@/lib/sona/cron-user-batch';
import { getJobNotificationDeliveryReadinessForStore } from '@/lib/job-notification-readiness';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // Allow ?test=true for manual testing with auth
  const isTest = req.nextUrl.searchParams.get('test') === 'true';

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const primarySupply = await probeJobSupplyHealth({ force: true });
  const notificationDelivery = await getJobNotificationDeliveryReadinessForStore(db);
  const results: { uid: string; status: string; queued?: number; error?: string }[] = [];
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const batchDate = new Date().toISOString().split('T')[0];

  try {
    const economicsRecovery = await processSonaEconomicsOutbox(db, isTest ? 5 : 25).catch(() => ({
      processed: 0,
      completed: 0,
      failed: 1,
    }));
    const userDocuments = await db.collection('users').listDocuments();
    const maxUsers = isTest ? 1 : 50;
    const usersSnap = selectDailyCronBatch(userDocuments, maxUsers);

    for (const userDocRef of usersSnap) {
      const uid = userDocRef.id;
      const workloadRunId = `${batchId}_${uid}`;
      const workloadRef = db.collection('users').doc(uid).collection('usage').doc('sona_daily');
      let workloadReserved = false;

      try {
        // 1. Load preferences
        const prefsSnap = await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').get();
        if (!prefsSnap.exists) { results.push({ uid, status: 'skip:no-prefs' }); continue; }

        const prefs = prefsSnap.data()!;
        if (!prefs.agentEnabled) { results.push({ uid, status: 'skip:agent-off' }); continue; }

        // Tier enforcement — load subscription
        const authUser = await getAdminAuth().getUser(uid).catch(() => null);
        const verifiedAuthEmail = authUser?.emailVerified ? authUser.email : undefined;
        const plan: PlanTier = await getUserTier(uid, verifiedAuthEmail);
        const AGENT_LIMITS: Record<string, number> = { free: 0, pro: 0, studio: 5, god: 50 };
        const tierLimit = AGENT_LIMITS[plan] ?? 0;

        if (tierLimit === 0) { results.push({ uid, status: 'skip:max-required' }); continue; }

        const configuredAutonomy = typeof prefs.agentAutonomyLevel === 'string'
          && ['scout', 'prepare', 'review', 'assist'].includes(prefs.agentAutonomyLevel)
          ? prefs.agentAutonomyLevel
          : 'prepare';
        if (configuredAutonomy !== 'scout' && !primarySupply.preparationReady) {
          results.push({ uid, status: `skip:primary-supply-${primarySupply.status}` });
          continue;
        }

        let twin: CareerTwin | null = null;
        try {
          twin = await getOrComputeTwin(uid);
        } catch {
          twin = null;
        }

        const memory = twin?.memory;
        const targetRoles: string[] = (prefs.targetRoles?.length ? prefs.targetRoles : memory?.goals?.targetRoles) || [];
        const preferredCities: string[] = (prefs.preferredCities?.length ? prefs.preferredCities : memory?.constraints?.preferredCities) || [];
        const remotePref: string = prefs.remotePref || memory?.goals?.remotePreference || 'any';
        const salaryMin: number = prefs.salaryMin || memory?.goals?.salaryMin || 0;
        const maxPerNight: number = Math.min(tierLimit, Math.max(1, prefs.agentMaxPerNight || 5));
        const minMatchScore: number = prefs.agentMinMatchScore || 70;
        const excludeCompanies: string[] = ((prefs.agentExcludeCompanies?.length ? prefs.agentExcludeCompanies : memory?.constraints?.excludedCompanies) || []).map((c: string) => c.toLowerCase());
        const rawAutonomyLevel = prefs.agentAutonomyLevel || memory?.constraints?.autonomyLevel;
        const autonomyLevel: 'scout' | 'prepare' | 'review' | 'assist' = typeof rawAutonomyLevel === 'string' && ['scout', 'prepare', 'review', 'assist'].includes(rawAutonomyLevel)
          ? rawAutonomyLevel as 'scout' | 'prepare' | 'review' | 'assist'
          : 'prepare';
        const wantsPreparedAssets = autonomyLevel !== 'scout';

        if (targetRoles.length === 0) { results.push({ uid, status: 'skip:no-roles' }); continue; }

        let baseResume: any = null;
        let baseResumeId: string | null = null;
        let baseResumeSource: string | null = null;
        let baseResumeHash: string | null = null;
        try {
          const latestResume = await getLatestResumeForUser(db, uid);
          baseResume = latestResume.resume;
          baseResumeId = latestResume.id;
          baseResumeSource = latestResume.source;
          if (baseResume && baseResumeId && baseResumeSource) {
            baseResumeHash = crypto.createHash('sha256').update(JSON.stringify(baseResume)).digest('hex');
          }
        } catch { /* no verified resume */ }
        const userSkills = extractResumeSkills(baseResume);
        const canPrepareAssets = wantsPreparedAssets && Boolean(baseResume && baseResumeId && baseResumeSource && baseResumeHash);
        const workloadEntitlement = resolveSonaWorkloadEntitlement(
          plan,
          canPrepareAssets ? 'prepare' : 'scout',
          maxPerNight,
        );
        const reservation = await reserveSonaPaidWorkloadRun(db, workloadRef, workloadRunId, plan, workloadEntitlement);
        if (!reservation.allowed) {
          results.push({ uid, status: `skip:workload-${reservation.reason || 'unavailable'}` });
          continue;
        }
        workloadReserved = true;

        // 2. Get user email + profile
        const profileSnap = await db.collection('users').doc(uid).collection('profile').doc('main').get();
        const email = verifiedAuthEmail || null;
        const userName = profileSnap.data()?.fullName?.split(' ')[0] || authUser?.displayName?.split(' ')[0] || 'there';

        // 3. Load existing queue + applications for dedup
        const existingQueueSnap = await db.collection('users').doc(uid).collection('agent_queue').get();
        const existingAppsSnap = await db.collection('users').doc(uid).collection('applications').get();

        const seenJobs = new Set<string>();
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

        existingQueueSnap.docs.forEach(d => {
          const data = d.data();
          if (new Date(data.created_at).getTime() > twoWeeksAgo) {
            seenJobs.add(`${data.job_title?.toLowerCase()?.trim()}|${data.company?.toLowerCase()?.trim()}`);
          }
        });
        existingAppsSnap.docs.forEach(d => {
          const data = d.data();
          seenJobs.add(`${data.job_title?.toLowerCase()?.trim()}|${data.company_name?.toLowerCase()?.trim()}`);
        });

        // 4. Fetch fresh jobs
        const ledger = await loadRecommendationLedger(db, uid);
        const allJobs: TalentJob[] = [];
        let primarySearchVerified = true;
        const cities = preferredCities.length > 0 ? preferredCities.slice(0, 3) : [''];
        const roles = targetRoles.slice(0, 3);
        const combos = roles.flatMap(role => cities.map(city => ({ role, city }))).slice(0, 6);

        for (const { role, city } of combos) {
          try {
            const result = await searchTalentJobSupply({
              query: role, location: city, country: 'us',
              page: 1, resultsPerPage: 10, sortBy: 'date',
              salaryMin: salaryMin || undefined,
            });
            if (canPrepareAssets && !isVerifiedPrimaryJobSearch(result.providerStatus)) {
              primarySearchVerified = false;
            }
            for (const job of suppressLedgerMatches(result.jobs, ledger)) {
              const dedupKey = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
              if (seenJobs.has(dedupKey)) continue;
              if (excludeCompanies.some(ex => job.company.toLowerCase().includes(ex))) continue;
              const locLower = job.location.toLowerCase();
              if (remotePref === 'remote' && !locLower.includes('remote')) continue;
              if (remotePref === 'onsite' && locLower.includes('remote')) continue;
              const salaryTop = job.salary.max || job.salary.min;
              if (salaryMin > 0 && salaryTop && salaryTop < salaryMin) continue;
              allJobs.push(job);
            }
          } catch (e) {
            if (canPrepareAssets) primarySearchVerified = false;
            console.warn(`[agent-pipeline] Fetch failed: ${role} in ${city}`, e);
          }
        }

        if (canPrepareAssets && !primarySearchVerified) {
          try {
            const reconciled = await cancelSonaPaidWorkloadRun(db, workloadRef, workloadRunId, workloadEntitlement, {
              retainRun: true,
              modelCallsConsumed: 0,
            });
            if (!reconciled) throw new Error('workload reservation no longer matched this run');
            workloadReserved = false;
            results.push({ uid, status: 'skip:primary-search-degraded' });
          } catch {
            results.push({ uid, status: 'error:primary-search-reconciliation' });
          }
          continue;
        }

        const uniqueJobs = dedupeTalentJobs(allJobs);
        if (uniqueJobs.length === 0) { results.push({ uid, status: 'skip:no-jobs' }); continue; }
        const ghostAssessments = scoreAllGhostRisks(uniqueJobs.map(job => ({
          title: job.title,
          company: job.company,
          postedDate: job.postedDate,
          description: job.description,
          salary: job.salary,
          url: job.url,
          location: job.location,
        })));
        const evidencedJobs = uniqueJobs.map((job, index) => ({ ...job, ghostRisk: ghostAssessments[index] }));

        // 5. Use the same explainable Talent Fit score shown in search and Sona.
        const scoredJobs = finalizeTalentRecommendations(evidencedJobs, {
          userSkills,
          targetRoles,
          preferredCities,
          remotePref,
          salaryMin,
          ledger,
        })
          .filter(job => (job.fitScore?.overall || job.matchScore || 0) >= minMatchScore)
          .slice(0, maxPerNight)
          .map(job => ({
            job,
            score: Math.round(job.fitScore?.overall || job.matchScore || 0),
            reason: job.recommendationReason || 'Sona ranked this role against your saved career evidence.',
          }));

        if (scoredJobs.length === 0) { results.push({ uid, status: 'skip:no-matches' }); continue; }

        const morphConsent = await getResumeMorphConsentForUser(uid);
        const morphAccess = resolveResumeMorphAccess({
          requestedMorphPercentage: 100,
          hasFullConsent: morphConsent.unlocked100,
          mode: 'automated',
        });

        // 7. Morph + Cover Letter + Queue for each job
        const queuedJobs: AgentJobForDigest[] = [];

        for (const { job, score, reason } of scoredJobs) {
          try {
            let morphedResume: any = null;
            let morphGuardrailReport: ResumeMorphGuardrailReport | null = null;
            let morphSucceeded = false;
            const recommendationCanPrepare = canPrepareAssets && isPreparationEligibleRecommendation(job);

            // Morph resume
            if (baseResume && recommendationCanPrepare) {
              try {
                const guarded = await generateGuardedMorphDraft({
                  resume: baseResume,
                  jobTitle: job.title,
                  company: job.company,
                  jobDescription: job.description || job.title,
                  access: morphAccess,
                }, groqJSONCompletion);
                morphedResume = guarded.resume;
                morphGuardrailReport = guarded.report;
                morphSucceeded = true;
              } catch { /* use original */ }
            }

            // Build a deterministic cover letter from verified source evidence.
            let coverLetter = '';
            let coverLetterGuardrailReport: CoverLetterGuardrailReport | null = null;
            if (recommendationCanPrepare) try {
              const result = buildTruthLockedCoverLetter({
                resume: baseResume,
                jobTitle: job.title,
                company: job.company,
                sourceResumeId: baseResumeId!,
                sourceResumeHash: baseResumeHash!,
              });
              coverLetter = result.content;
              coverLetterGuardrailReport = result.report;
            } catch { /* handled as needs_attention below */ }
            const coverLetterSucceeded = Boolean(coverLetter.trim() && coverLetterGuardrailReport);

            // Save morphed resume version
            let resumeVersionId: string | undefined;
            if (morphedResume && baseResume && morphSucceeded) {
              try {
                const vRef = await db.collection('users').doc(uid).collection('resume_versions').add({
                  user_id: uid,
                  version_name: `[Agent] ${job.company} — ${job.title}`,
                  content: morphedResume,
                  mode: 'technical',
                  guardrail_report: morphGuardrailReport,
                  guardrail_validator_version: morphGuardrailReport?.validatorVersion || null,
                  source_resume_id: baseResumeId,
                  source_resume_hash: baseResumeHash,
                  source_resume_type: baseResumeSource,
                  source_resume_snapshot: baseResume,
                  morph_effective_percentage: morphAccess.effectiveMorphPercentage,
                  is_active: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                resumeVersionId = vRef.id;
              } catch { /* non-critical */ }
            }
            const packetPrepared = recommendationCanPrepare
              && morphSucceeded
              && coverLetterSucceeded
              && Boolean(resumeVersionId);

            // Create queue item
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const salaryMeetsTarget = !salaryMin || !job.salary.min || job.salary.min >= salaryMin;
            const freshPosting = !job.postedDate || (Date.now() - new Date(job.postedDate).getTime()) < 14 * 24 * 60 * 60 * 1000;
            const fitSignals = [
              `Matched ${targetRoles.slice(0, 2).join(', ')} target${targetRoles.length > 1 ? 's' : ''}.`,
              score >= 85 ? 'High confidence fit based on your profile.' : 'Meets your minimum score threshold.',
              salaryMeetsTarget ? 'Salary appears aligned with your floor.' : 'Salary data is incomplete or below your target.',
              freshPosting ? 'Posting appears recent.' : 'Posting may be older.',
              ...(twin?.memory?.nextBestActions?.[0] ? [`Career Twin priority: ${twin.memory.nextBestActions[0].label}.`] : []),
            ];
            const riskSignals = [
              ...(!baseResume ? ['No saved resume version was available for tailoring.'] : []),
              ...(recommendationCanPrepare && !morphSucceeded ? ['Resume tailoring did not complete. The original resume remains unchanged.'] : []),
              ...(recommendationCanPrepare && morphSucceeded && !resumeVersionId ? ['The guarded resume draft could not be saved. Retry before using this packet.'] : []),
              ...(recommendationCanPrepare && !coverLetterSucceeded ? ['Cover letter draft needs review or regeneration.'] : []),
              ...(canPrepareAssets && !recommendationCanPrepare ? ['Fit, confidence, source, or posting-risk evidence did not meet the packet threshold.'] : []),
              ...(!job.url ? ['No direct application URL was available.'] : []),
            ];
            await db.collection('users').doc(uid).collection('agent_queue').add({
              user_id: uid,
              job_title: job.title,
              company: job.company,
              location: job.location,
              job_url: job.url,
              job_description: job.description?.slice(0, 3000) || '',
              salary: { min: job.salary.min, max: job.salary.max },
              employment_type: job.employmentType,
              posted_date: job.postedDate,
              match_score: score,
              match_reason: reason,
              morphed_resume: morphSucceeded ? morphedResume : null,
              morph_effective_percentage: morphSucceeded ? morphAccess.effectiveMorphPercentage : null,
              morph_guardrail_report: morphGuardrailReport,
              morph_source_resume_id: morphSucceeded ? baseResumeId : null,
              morph_source_resume_hash: morphSucceeded ? baseResumeHash : null,
              morph_source_resume_type: morphSucceeded ? baseResumeSource : null,
              cover_letter: coverLetter,
              cover_letter_succeeded: coverLetterSucceeded,
              cover_letter_guardrail_report: coverLetterGuardrailReport,
              cover_letter_source_resume_id: coverLetterSucceeded ? baseResumeId : null,
              cover_letter_source_resume_hash: coverLetterSucceeded ? baseResumeHash : null,
              cover_letter_source_resume_type: coverLetterSucceeded ? baseResumeSource : null,
              resume_version_id: resumeVersionId || null,
              status: 'pending',
              source: 'nightly_agent',
              generation_status: packetPrepared ? 'prepared' : recommendationCanPrepare ? 'needs_attention' : 'needs_review',
              packetStatus: packetPrepared ? 'prepared' : recommendationCanPrepare ? 'needs_attention' : 'needs_review',
              fitSignals,
              riskSignals,
              nextAction: packetPrepared
                ? 'Review the tailored resume and cover letter, then open the application when ready.'
                : recommendationCanPrepare
                  ? 'Review the role and retry the missing application assets.'
                  : 'Review the fit and source evidence before preparing application materials.',
              feedbackTags: [],
              agentRunId: batchId,
              autonomyLevel,
              created_at: new Date().toISOString(),
              expires_at: expiresAt,
              batch_id: batchId,
              batch_date: batchDate,
            });
            await upsertRecommendationLedger(db, uid, job, packetPrepared ? 'prepared' : 'queued', {
              score,
              reason,
              agentRunId: batchId,
            }).catch(() => {});

            const salaryStr = job.salary.min && job.salary.max
              ? `$${Math.round(job.salary.min / 1000)}k-$${Math.round(job.salary.max / 1000)}k`
              : '';

            queuedJobs.push({
              title: job.title,
              company: job.company,
              location: job.location,
              matchScore: score,
              salary: salaryStr,
              reason,
              nextAction: packetPrepared ? 'Review packet' : recommendationCanPrepare ? 'Retry packet' : 'Review role',
              riskCount: riskSignals.length,
            });
          } catch (e) {
            console.warn(`[agent-pipeline] Failed to process ${job.title} at ${job.company}:`, e);
          }
        }

        // 8. Send opt-in digest email to the user only
        const agentDigestConsent = getAgentDigestEmailConsent(prefs);
        const digestEnabled = agentDigestConsent.granted;
        if (queuedJobs.length > 0 && email && digestEnabled && notificationDelivery.canSendTrackedEmail) {
          let attemptId: string | null = null;
          try {
            const resendKey = process.env.RESEND_API_KEY!;
            const resend = new Resend(resendKey);
              const { subject, html } = buildAgentDigestEmail(userName, queuedJobs);
              attemptId = crypto.randomUUID();
              const prefsRef = db.collection('users').doc(uid).collection('settings').doc('jobPreferences');
              const sendingState = {
                agentDigestDeliveryStatus: 'sending',
                agentDigestDeliveryAttemptId: attemptId,
                agentDigestDeliveryUpdatedAt: new Date().toISOString(),
                agentDigestDeliveryError: null,
                agentDigestLastAttemptAt: new Date().toISOString(),
                agentDigestDeliveryLockUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              };
              const lockResult = await db.runTransaction(async transaction => {
                const latest = await transaction.get(prefsRef);
                const latestData = latest.data() || {};
                if (!getAgentDigestEmailConsent(latestData).granted) return 'consent-revoked' as const;

                const lastSentAt = new Date(
                  latestData.agentDigestLastAcceptedAt
                  || latestData.lastAgentDigestAt
                  || latestData.agentDigestLastAttemptAt
                  || 0,
                ).getTime();
                const cadenceWindow = latestData.agentDigestFrequency === 'weekly'
                  ? 6 * 24 * 60 * 60 * 1000
                  : 20 * 60 * 60 * 1000;
                if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < cadenceWindow) {
                  return 'recently-sent' as const;
                }

                const lockFresh = isJobEmailDeliveryLockActive(latestData.agentDigestDeliveryLockUntil);
                if (lockFresh) return 'delivery-in-progress' as const;

                transaction.set(prefsRef, sendingState, { merge: true });
                return 'acquired' as const;
              });
              if (lockResult !== 'acquired') {
                invalidateTwin(uid).catch(() => {});
                results.push({ uid, status: 'processed', queued: queuedJobs.length });
                continue;
              }
              await createJobEmailDeliveryAttempt(db, {
                uid,
                attemptId,
                purpose: 'agent_digest',
                source: 'agent_cron',
                createdAt: new Date().toISOString(),
                recipientEmail: email,
              });

              const delivery = await resend.emails.send({
                from: EMAIL_FROM,
                to: email,
                subject,
                html,
                tags: getResendDeliveryTags(attemptId, 'agent_digest'),
              }, { idempotencyKey: `sona-agent-${uid}-${batchDate}` });
              if (delivery.error) throw new Error(delivery.error.message);
              const acceptedAt = new Date().toISOString();
              let acceptance: { status: string } = { status: 'accepted' };
              try {
                acceptance = await acceptJobEmailDeliveryAttempt(db, {
                  attemptId,
                  providerMessageId: delivery.data?.id || null,
                  acceptedAt,
                });
              } catch (error) {
                console.error('[agent-pipeline] Digest was accepted but receipt state could not be persisted:', error);
              }
              await logUserCommunication({
                uid,
                email,
                subject,
                bodyPreview: `Sona agent digest provider outcome: ${acceptance.status} with ${queuedJobs.length} job review item${queuedJobs.length === 1 ? '' : 's'}.`,
                template: 'sona_agent_digest',
                sentBy: 'cron/agent-pipeline',
                status: acceptance.status,
                metadata: { attemptId, providerMessageId: delivery.data?.id || null, queuedJobCount: queuedJobs.length, batchId },
              }).catch(error => {
                console.error('[agent-pipeline] Failed to log digest communication:', error);
              });
              await db.runTransaction(async transaction => {
                const latest = await transaction.get(prefsRef);
                if (latest.data()?.agentDigestDeliveryAttemptId !== attemptId) return;
                transaction.set(prefsRef, {
                  lastAgentDigestAt: acceptedAt,
                  agentDigestLastAcceptedAt: acceptedAt,
                  agentDigestDeliveryLockUntil: null,
                }, { merge: true });
              }).catch(error => {
                console.error('[agent-pipeline] Digest was accepted but cadence state could not be persisted:', error);
              });
          } catch (e) {
            const safeError = sanitizeJobDeliveryError(e);
            let terminalProviderStatus: string | null = null;
            if (attemptId) {
              const failure = await failJobEmailDeliveryAttempt(db, {
                attemptId,
                failedAt: new Date().toISOString(),
                error: safeError,
              }).catch(() => ({ updated: false, status: null }));
              if (!failure.updated && failure.status && failure.status !== 'failed') {
                terminalProviderStatus = failure.status;
              }
              if (!failure.updated && failure.status === null) {
                const prefsRef = db.collection('users').doc(uid).collection('settings').doc('jobPreferences');
                await db.runTransaction(async transaction => {
                  const latest = await transaction.get(prefsRef);
                  if (latest.data()?.agentDigestDeliveryAttemptId !== attemptId) return;
                  transaction.set(prefsRef, {
                    agentDigestDeliveryStatus: 'failed',
                    agentDigestDeliveryUpdatedAt: new Date().toISOString(),
                    agentDigestDeliveryError: safeError,
                    agentDigestLastAttemptAt: null,
                    agentDigestDeliveryLockUntil: null,
                  }, { merge: true });
                }).catch(() => {});
              }
            } else {
              await db.collection('users').doc(uid).collection('settings').doc('jobPreferences').set({
                agentDigestDeliveryStatus: 'failed',
                agentDigestDeliveryAttemptId: attemptId,
                agentDigestDeliveryUpdatedAt: new Date().toISOString(),
                agentDigestDeliveryError: safeError,
              }, { merge: true }).catch(() => {});
            }
            await logUserCommunication({
              uid,
              email,
              subject: 'Sona agent digest',
              bodyPreview: terminalProviderStatus
                ? `Sona agent digest provider outcome: ${terminalProviderStatus} for ${queuedJobs.length} review item${queuedJobs.length === 1 ? '' : 's'}.`
                : `Sona agent digest delivery failed for ${queuedJobs.length} job review item${queuedJobs.length === 1 ? '' : 's'}.`,
              template: 'sona_agent_digest',
              sentBy: 'cron/agent-pipeline',
              status: terminalProviderStatus || 'failed',
              metadata: { attemptId, queuedJobCount: queuedJobs.length, batchId },
            }).catch(() => {});
            if (!terminalProviderStatus) console.warn('[agent-pipeline] Digest email failed:', e);
          }
        }

        if (queuedJobs.length > 0) {
          invalidateTwin(uid).catch(() => {});
        }

        results.push({ uid, status: 'processed', queued: queuedJobs.length });
      } catch (err: any) {
        results.push({ uid, status: 'error', error: err.message });
      } finally {
        if (workloadReserved) {
          await releaseSonaPaidWorkloadRun(db, workloadRef, workloadRunId).catch(() => {});
        }
      }
    }

    const processed = results.filter(r => r.status === 'processed');
    const totalQueued = processed.reduce((sum, r) => sum + (r.queued || 0), 0);

    monitor.info('Agent Pipeline Cron', `Processed ${processed.length} users, queued ${totalQueued} jobs`, [
      { name: 'Users', value: String(results.length) },
      { name: 'Processed', value: String(processed.length) },
      { name: 'Total Queued', value: String(totalQueued) },
      { name: 'Batch', value: batchId },
    ]);

    return NextResponse.json({
      success: true,
      batchId,
      economicsRecovery,
      primarySupply: {
        status: primarySupply.status,
        preparationReady: primarySupply.preparationReady,
        checkedAt: primarySupply.checkedAt,
      },
      results,
      summary: { total: results.length, processed: processed.length, totalQueued },
    });
  } catch (err: any) {
    console.error('[cron/agent-pipeline] Fatal error:', err);
    monitor.critical('Tool: cron/agent-pipeline', String(err));
    return NextResponse.json({ error: 'Agent pipeline failed' }, { status: 500 });
  }
}
