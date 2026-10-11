/**
 * Apply Pipeline — Review-first application packet with Taco
 * Orchestrates: Resume Morph → Cover Letter → Application Tracker
 * All in a single server-side pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { guardApiRoute } from '@/lib/api-auth';
import { getPacketSourceContent, packetJobDescriptionHash } from '@/lib/job-packet-review';
import { canPrepareApplicationPackets } from '@/lib/assistant/workload-policy';
import { checkUsageAllowed, incrementUsage } from '@/lib/usage-tracker';
import { groqJSONCompletion } from '@/lib/ai/groq-client';
import { sanitizeForAI } from '@/lib/sanitize';
import { getAdminDb } from '@/lib/firebase-admin';
import { monitor } from '@/lib/monitor';
import { calculateATSScore } from '@/lib/ats-score';
import { invalidateTwin } from '@/lib/career-twin';
import {
  getLatestVerifiedResumeForUser as getLatestResumeForUser,
  getVerifiedResumeForUserById,
} from '@/lib/server-resume';
import {
  isCurrentResumeMorphGuardrailReport,
  resolveResumeMorphAccess,
  type ResumeMorphGuardrailReport,
} from '@/lib/resume-morph-guardrails';
import { getResumeMorphConsentForUser } from '@/lib/resume-morph-consent-server';
import { generateGuardedMorphDraft } from '@/lib/assistant/morph-draft-generation';
import {
  buildTruthLockedCoverLetter,
  normalizeJobPacketLabel,
  type CoverLetterGuardrailReport,
} from '@/lib/cover-letter-guardrails';
import {
  classifyJobPacketFailure,
  packetIdentityConflictRecovery,
  packetGenerationInProgressRecovery,
  packetIncompleteRecovery,
  packetInputRecovery,
  packetResumeRequiredRecovery,
  packetUpgradeRecovery,
} from '@/lib/job-packet-recovery';
import {
  getJobPacketIdentity,
  getLegacyJobPacketDocumentId,
  legacyJobPacketMatches,
} from '@/lib/job-packet-identity';
import {
  isCurrentGuardedResumeArtifact,
  isJobPacketGenerationLocked,
  isPersistedJobPacketReady,
  resolveJobPacketArtifacts,
  type PersistedGuardedResumeArtifact,
} from '@/lib/job-packet-state';
import {
  getTrustedTalentJobApplyUrl,
  loadRecommendationCalibrationEvidenceFromImpression,
} from '@/lib/job-recommendation-platform';

function flattenResumeToText(resume: any): string {
  if (!resume) return '';
  const parts: string[] = [];
  if (resume.name) parts.push(resume.name);
  if (resume.title) parts.push(resume.title);
  if (resume.summary) parts.push(resume.summary);
  if (Array.isArray(resume.skills)) {
    parts.push(resume.skills.map((skill: any) => typeof skill === 'string' ? skill : skill?.name || skill?.label || '').filter(Boolean).join(', '));
  }
  if (Array.isArray(resume.experience)) {
    for (const exp of resume.experience) {
      parts.push([exp.role || exp.title, exp.company].filter(Boolean).join(' at '));
      if (exp.description) parts.push(exp.description);
      if (Array.isArray(exp.bullets)) parts.push(...exp.bullets);
      if (Array.isArray(exp.achievements)) parts.push(...exp.achievements);
    }
  }
  if (Array.isArray(resume.education)) {
    parts.push(...resume.education.map((edu: any) => [edu.degree, edu.institution || edu.school].filter(Boolean).join(' ')));
  }
  return parts.filter(Boolean).join('\n');
}

async function loadGuardedResumeArtifact(
  db: FirebaseFirestore.Firestore,
  userId: string,
  resumeVersionId: unknown,
): Promise<PersistedGuardedResumeArtifact | null> {
  if (typeof resumeVersionId !== 'string' || !resumeVersionId) return null;
  const snapshot = await db.collection('users').doc(userId)
    .collection('resume_versions').doc(resumeVersionId).get();
  return snapshot.exists ? snapshot.data() || null : null;
}

function existingApplicationResponse(
  applicationId: string,
  data: Record<string, any>,
  linkedResumeArtifact: PersistedGuardedResumeArtifact | null,
) {
  const keywordGaps = Array.isArray(data.keyword_gaps) ? data.keyword_gaps : [];
  const hasLinkedResume = Boolean(data.resume_version_id);
  const verifiedMorph = data.morph_succeeded === true
    && isCurrentResumeMorphGuardrailReport(data.morph_guardrail_report);
  const packetReady = isPersistedJobPacketReady(data, linkedResumeArtifact);
  const sourceResumeId = typeof data.morph_source_resume_id === 'string' ? data.morph_source_resume_id : '';
  const sourceResumeHash = typeof data.morph_source_resume_hash === 'string' ? data.morph_source_resume_hash : '';
  const morphSucceeded = packetReady || (verifiedMorph
    && isCurrentGuardedResumeArtifact(
      linkedResumeArtifact,
      data.morph_guardrail_report,
      { id: sourceResumeId, hash: sourceResumeHash },
    ));
  const coverLetterSucceeded = packetReady;
  const recovery = packetReady
    ? null
    : packetIncompleteRecovery({
        morphSucceeded,
        coverLetterSucceeded,
        atsSucceeded: Number.isFinite(data.ats_score),
      });

  return NextResponse.json({
    success: true,
    applicationId,
    packetStatus: packetReady ? 'ready_for_review' : 'needs_attention',
    code: recovery?.code,
    retryable: recovery?.retryable,
    recovery,
    morphedResume: null,
    matchScore: data.talent_density_score || 0,
    coverLetter: data.cover_letter || '',
    morphedVersionId: data.resume_version_id || null,
    effectiveMorphPercentage: data.morph_effective_percentage || null,
    maxAllowedMorphPercentage: data.morph_effective_percentage || null,
    guardrailReport: verifiedMorph ? data.morph_guardrail_report : null,
    hasResume: hasLinkedResume,
    atsResult: Number.isFinite(data.ats_score) ? { overallScore: Number(data.ats_score) } : null,
    keywordGaps,
    idempotent: true,
    warnings: [
      packetReady
        ? 'A tracker draft already exists for this posting. Open it from Applications before preparing another packet.'
        : 'An incomplete tracker draft is preserved. Retry packet preparation before using these materials.',
    ],
  });
}

export async function POST(req: NextRequest) {
  let activeLease: { db: FirebaseFirestore.Firestore; ref: FirebaseFirestore.DocumentReference; owner: string } | null = null;
  try {
    const guard = await guardApiRoute(req, { rateLimit: 5, rateLimitWindow: 60_000 });
    if (guard.error) return guard.error;

    if (!canPrepareApplicationPackets(guard.user.tier)) {
      const recovery = packetUpgradeRecovery(false);
      return NextResponse.json(
        { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery, upgrade: true },
        { status: 403 }
      );
    }

    const usageCheck = await checkUsageAllowed(guard.user.uid, 'morphs', guard.user.tier);
    if (!usageCheck.allowed) {
      const recovery = packetUpgradeRecovery(true);
      return NextResponse.json(
        { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery, upgrade: true, cap: usageCheck.cap },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { jobDescription, jobUrl, jobId, jobLocation, jobCategory, sourceJobId, sourceMeta, resumeVersionId: requestedResumeVersionId, impressionId } = body;
    const jobTitle = normalizeJobPacketLabel(body.jobTitle);
    const company = normalizeJobPacketLabel(body.company);
    const trustedJobUrl = typeof jobUrl === 'string' && sourceMeta && typeof sourceMeta === 'object'
      ? getTrustedTalentJobApplyUrl({ url: jobUrl, sourceMeta })
      : null;

    if (!jobTitle || !company) {
      const recovery = packetInputRecovery();
      return NextResponse.json(
        { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery },
        { status: 400 },
      );
    }

    const jobDescriptionHash = packetJobDescriptionHash(jobDescription);
    const safeJD = sanitizeForAI(jobDescription || `${jobTitle} at ${company}`);
    const userId = guard.user.uid;
    const db = getAdminDb();
    const applicationsCollection = db.collection('users').doc(userId).collection('applications');
    const packetIdentity = getJobPacketIdentity({
      jobId,
      jobTitle,
      company,
      jobUrl: trustedJobUrl || '',
      canonicalUrl: sourceMeta?.canonicalUrl,
      sourceName: sourceMeta?.sourceName,
      jobDescription,
    });
    let applicationRef = applicationsCollection.doc(packetIdentity.documentId);
    let existingApplicationData: Record<string, any> | null = null;

    let existingApplicationSnap = await applicationRef.get();
    const legacyDocumentId = getLegacyJobPacketDocumentId(jobId);
    if (!existingApplicationSnap.exists && legacyDocumentId && legacyDocumentId !== packetIdentity.documentId) {
      const legacyRef = applicationsCollection.doc(legacyDocumentId);
      const legacySnap = await legacyRef.get();
      const legacyData = legacySnap.exists ? legacySnap.data() || {} : null;
      if (legacyData && legacyJobPacketMatches(legacyData, { company, jobTitle, jobUrl: trustedJobUrl || '' })) {
        await db.runTransaction(async transaction => {
          const canonicalSnapshot = await transaction.get(applicationRef);
          const legacySnapshot = await transaction.get(legacyRef);
          if (canonicalSnapshot.exists || !legacySnapshot.exists) return;
          const latestLegacyData = legacySnapshot.data() || {};
          if (!legacyJobPacketMatches(latestLegacyData, { company, jobTitle, jobUrl: trustedJobUrl || '' })) return;
          transaction.set(applicationRef, {
            ...latestLegacyData,
            packet_identity_hash: packetIdentity.identityHash,
            migrated_from_application_id: legacyRef.id,
            last_updated: new Date().toISOString(),
          }, { merge: true });
          transaction.delete(legacyRef);
        });
        existingApplicationSnap = await applicationRef.get();
      }
    }
    if (existingApplicationSnap.exists) {
      existingApplicationData = existingApplicationSnap.data() || {};
      const storedIdentity = existingApplicationData.packet_identity_hash;
      const legacyIdentityMatches = legacyJobPacketMatches(existingApplicationData, { company, jobTitle, jobUrl: trustedJobUrl || '' });
      if ((storedIdentity && storedIdentity !== packetIdentity.identityHash) || (!storedIdentity && !legacyIdentityMatches)) {
        const recovery = packetIdentityConflictRecovery();
        return NextResponse.json(
          { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery },
          { status: 409 },
        );
      }
    }

    const morphConsent = await getResumeMorphConsentForUser(userId);
    const morphAccess = resolveResumeMorphAccess({
      requestedMorphPercentage: 100,
      hasFullConsent: morphConsent.unlocked100,
      mode: 'automated',
    });

    // Step 1: Fetch user's latest resume from Vault
    let baseResume: any = null;
    let baseResumeId: string | null = null;
    let baseResumeSource: 'resume_versions' | 'vault' | 'profile' | null = null;
    if (requestedResumeVersionId) {
      const selectedResume = await getVerifiedResumeForUserById(db, userId, requestedResumeVersionId);
      if (!selectedResume.resume || !selectedResume.id) {
        const recovery = packetResumeRequiredRecovery();
        return NextResponse.json(
          { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery, needsResume: true },
          { status: 409 },
        );
      }
      baseResume = selectedResume.resume;
      baseResumeId = selectedResume.id;
      baseResumeSource = selectedResume.source;
    }

    if (!requestedResumeVersionId && (!baseResume || !baseResumeId)) {
      const latestResume = await getLatestResumeForUser(db, userId);
      baseResume = latestResume.resume;
      baseResumeId = latestResume.id;
      baseResumeSource = latestResume.source;
    }
    if (!baseResume || !baseResumeId) {
      const recovery = packetResumeRequiredRecovery();
      return NextResponse.json(
        { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery, needsResume: true },
        { status: 409 }
      );
    }
    const baseResumeHash = crypto.createHash('sha256').update(JSON.stringify(baseResume)).digest('hex');
    if (body.expectedSourceHash && body.expectedSourceHash !== baseResumeHash) {
      return NextResponse.json({ error: 'Your confirmed source changed after analysis. Analyze this role again before preparing.', code: 'packet_source_changed' }, { status: 409 });
    }

    const sourceReference = db.collection('users').doc(userId).collection(baseResumeSource || 'resume_versions').doc(baseResumeId);
    const generationOwner = crypto.randomUUID();
    const generationStartedAt = new Date();
    const generationLeaseExpiresAt = new Date(generationStartedAt.getTime() + 10 * 60_000).toISOString();
    const leaseResult = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(applicationRef);
      const currentData = snapshot.exists ? snapshot.data() || {} : {};
      const linkedResumeSnapshot = typeof currentData.resume_version_id === 'string'
        ? await transaction.get(
            db.collection('users').doc(userId)
              .collection('resume_versions').doc(currentData.resume_version_id),
          )
        : null;
      const linkedResumeArtifact = linkedResumeSnapshot?.exists
        ? linkedResumeSnapshot.data() || null
        : null;
      const sourceSnapshot = await transaction.get(sourceReference);
      const currentSource = sourceSnapshot.exists ? getPacketSourceContent(sourceSnapshot.data() || {}, baseResumeSource || 'resume_versions', { uid: userId, id: baseResumeId }) : null;
      if (!currentSource || crypto.createHash('sha256').update(JSON.stringify(currentSource)).digest('hex') !== baseResumeHash) {
        return { state: 'source_changed' as const, data: currentData };
      }
      const currentSourceMatches = currentData.morph_source_resume_id === baseResumeId
        && currentData.morph_source_resume_hash === baseResumeHash
        && currentData.packet_job_description_hash === jobDescriptionHash
        && currentData.job_title === jobTitle
        && currentData.company_name === company;
      if (currentSourceMatches && isPersistedJobPacketReady(currentData, linkedResumeArtifact)) {
        return { state: 'ready' as const, data: currentData, linkedResumeArtifact };
      }
      if (isJobPacketGenerationLocked(currentData, generationStartedAt.getTime())) {
        return { state: 'locked' as const, data: currentData };
      }
      transaction.set(applicationRef, {
        user_id: userId,
        job_id: jobId || null,
        company_name: currentData.company_name || company,
        job_title: currentData.job_title || jobTitle,
        application_link: trustedJobUrl,
        packet_identity_hash: packetIdentity.identityHash,
        packet_status: 'needs_attention',
        packet_revision: generationOwner,
        human_review: null,
        packet_generation_state: 'running',
        packet_generation_owner: generationOwner,
        packet_generation_lease_expires_at: generationLeaseExpiresAt,
        created_at: currentData.created_at || generationStartedAt.toISOString(),
        last_updated: generationStartedAt.toISOString(),
      }, { merge: true });
      return { state: 'acquired' as const, data: currentData };
    });

    if (leaseResult.state === 'source_changed') {
      return NextResponse.json({ error: 'Your source changed. Reload it before preparing this packet.', code: 'packet_source_changed', retryable: true }, { status: 409 });
    }
    if (leaseResult.state === 'ready') {
      return existingApplicationResponse(
        applicationRef.id,
        leaseResult.data,
        leaseResult.linkedResumeArtifact,
      );
    }
    if (leaseResult.state === 'locked') {
      const recovery = packetGenerationInProgressRecovery();
      return NextResponse.json(
        { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery },
        { status: 409, headers: { 'Retry-After': '30' } },
      );
    }
    existingApplicationData = leaseResult.data;
    activeLease = { db, ref: applicationRef, owner: generationOwner };
    const existingResumeArtifact = await loadGuardedResumeArtifact(
      db,
      userId,
      existingApplicationData.resume_version_id,
    );

    // Step 2: Morph resume (if base exists)
    let morphedResume = baseResume;
    let morphGuardrailReport: ResumeMorphGuardrailReport | null = null;
    let morphSucceeded = false;

    if (baseResume) {
      try {
        const guarded = await generateGuardedMorphDraft({
          resume: baseResume,
          jobTitle,
          company,
          jobDescription: safeJD,
          access: morphAccess,
        }, groqJSONCompletion);
        morphedResume = guarded.resume;
        morphGuardrailReport = guarded.report;
        morphSucceeded = true;
      } catch (e) {
        console.warn('[ApplyPipeline] Resume morph failed, using original:', e);
      }
    }

    // Step 3: Build a source-backed cover letter
    let coverLetter = '';
    let coverLetterSucceeded = false;
    let coverLetterGuardrailReport: CoverLetterGuardrailReport | null = null;
    try {
      const result = buildTruthLockedCoverLetter({
        resume: baseResume,
        jobTitle,
        company,
        sourceResumeId: baseResumeId,
        sourceResumeHash: baseResumeHash,
      });
      coverLetter = result.content;
      coverLetterGuardrailReport = result.report;
      coverLetterSucceeded = true;
    } catch (e) {
      console.warn('[ApplyPipeline] Cover letter failed:', e);
    }

    const {
      priorMorphVersionId,
      effectiveMorphSucceeded,
      effectiveCoverLetter,
      effectiveCoverLetterSucceeded,
      effectiveCoverLetterReport,
    } = resolveJobPacketArtifacts({
      existing: existingApplicationData,
      existingResumeArtifact,
      currentSourceResumeId: baseResumeId,
      currentSourceResumeHash: baseResumeHash,
      currentJobTitle: jobTitle,
      currentCompany: company,
      currentJobDescriptionHash: jobDescriptionHash,
      morphSucceeded,
      coverLetterSucceeded,
      coverLetter,
      coverLetterReport: coverLetterGuardrailReport,
    });
    // Step 4: Save to Firestore applications tracker
    const now = new Date().toISOString();
    const effectiveResumeForAnalysis = morphSucceeded
      ? morphedResume
      : priorMorphVersionId && existingResumeArtifact?.content
        ? existingResumeArtifact.content
        : morphedResume;
    const resumeText = flattenResumeToText(effectiveResumeForAnalysis);
    const preservePriorResumeAnalysis = !morphSucceeded && Boolean(priorMorphVersionId);
    const atsResult = preservePriorResumeAnalysis && Number.isFinite(existingApplicationData?.ats_score)
      ? { overallScore: Number(existingApplicationData.ats_score) }
      : resumeText && safeJD
        ? calculateATSScore(resumeText, safeJD)
        : null;
    const keywordGaps = preservePriorResumeAnalysis && Array.isArray(existingApplicationData?.keyword_gaps)
      ? existingApplicationData.keyword_gaps
      : atsResult && 'keywords' in atsResult
        ? atsResult.keywords
          ?.filter(keyword => keyword.status === 'missing' || keyword.status === 'partial')
          .map(keyword => keyword.keyword)
          .slice(0, 12) || []
        : [];
    const recommendationEvidence = await loadRecommendationCalibrationEvidenceFromImpression(db, userId, {
      impressionId,
      resumeId: baseResumeId,
      resume: baseResume,
      job: {
        title: jobTitle,
        company,
        location: typeof jobLocation === 'string' ? jobLocation : '',
        category: typeof jobCategory === 'string' ? jobCategory : '',
        url: trustedJobUrl || '',
        sourceJobId: sourceJobId || jobId || undefined,
        sourceMeta: sourceMeta || undefined,
      },
    }).catch(() => null);
    const packetMatchScore = recommendationEvidence?.cohortEligible
      ? recommendationEvidence.score ?? atsResult?.overallScore ?? 0
      : atsResult?.overallScore
        ?? (preservePriorResumeAnalysis ? existingApplicationData?.talent_density_score : 0)
        ?? 0;
    const calibrationRef = db.collection('users').doc(userId).collection('recommendation_calibration').doc(applicationRef.id);
    const applicationData = {
      user_id: userId,
      job_id: jobId || null,
      company_name: company,
      job_title: jobTitle,
      job_description: jobDescription || null,
      packet_job_description_hash: jobDescriptionHash,
      resume_version_id: priorMorphVersionId,
      morphed_resume_name: `${company} — ${jobTitle}`,
      talent_density_score: packetMatchScore,
      ats_score: Number.isFinite(atsResult?.overallScore) ? atsResult?.overallScore : null,
      keyword_gaps: keywordGaps,
      cover_letter: effectiveCoverLetter,
      morph_effective_percentage: morphSucceeded
        ? morphAccess.effectiveMorphPercentage
        : existingApplicationData?.morph_effective_percentage || morphAccess.effectiveMorphPercentage,
      morph_guardrail_report: morphGuardrailReport
        || (isCurrentResumeMorphGuardrailReport(existingApplicationData?.morph_guardrail_report)
          ? existingApplicationData?.morph_guardrail_report
          : null),
      morph_source_resume_id: effectiveMorphSucceeded ? baseResumeId : null,
      morph_source_resume_hash: effectiveMorphSucceeded ? baseResumeHash : null,
      morph_source_resume_type: effectiveMorphSucceeded ? baseResumeSource : null,
      morph_succeeded: effectiveMorphSucceeded,
      cover_letter_succeeded: effectiveCoverLetterSucceeded,
      cover_letter_guardrail_report: effectiveCoverLetterReport,
      cover_letter_source_resume_id: effectiveCoverLetterSucceeded ? baseResumeId : null,
      cover_letter_source_resume_hash: effectiveCoverLetterSucceeded ? baseResumeHash : null,
      packet_identity_hash: packetIdentity.identityHash,
      application_link: trustedJobUrl,
      status: existingApplicationData?.status || 'not_applied' as const,
      // Remain non-ready until the verified tailored version is saved and linked below.
      packet_status: 'needs_attention',
      source_meta: sourceMeta || null,
      morphed_at: now,
      last_updated: now,
      created_at: existingApplicationData?.created_at || now,
      source: 'apply_pipeline',
    };

    const appRef = applicationRef;
    await db.runTransaction(async transaction => {
      const [snapshot, calibrationSnapshot] = await Promise.all([
        transaction.get(appRef),
        transaction.get(calibrationRef),
      ]);
      const currentData = snapshot.exists ? snapshot.data() || {} : {};
      if (currentData.packet_generation_owner !== generationOwner) {
        throw new Error('Packet generation ownership was lost before artifact persistence.');
      }
      transaction.set(appRef, {
        ...applicationData,
        status: currentData.status || applicationData.status,
        packet_generation_state: 'running',
        packet_generation_owner: generationOwner,
        packet_generation_lease_expires_at: generationLeaseExpiresAt,
      }, { merge: true });
      const existingCalibration = calibrationSnapshot.exists ? calibrationSnapshot.data() || {} : {};
      transaction.set(calibrationRef, {
        version: 1,
        applicationId: appRef.id,
        evidence: recommendationEvidence,
        firstCapturedAt: existingCalibration.firstCapturedAt || now,
        updatedAt: now,
      }, { merge: true });
    });

    // Save morphed resume as a new version
    let morphedVersionId: string | null = priorMorphVersionId;
    if (morphSucceeded && morphedResume && baseResume) {
      const versionData = {
        user_id: userId,
        version_name: `${company} — ${jobTitle}`,
        content: morphedResume,
        skill_graph: null,
        guardrail_report: morphGuardrailReport,
        guardrail_validator_version: morphGuardrailReport?.validatorVersion || null,
        source_resume_id: baseResumeId,
        source_resume_type: baseResumeSource,
        source_resume_hash: baseResumeHash,
        morph_effective_percentage: morphAccess.effectiveMorphPercentage,
        mode: 'technical',
        is_active: false,
        created_at: now,
        updated_at: now,
      };
      const versionRef = await db
        .collection('users').doc(userId)
        .collection('resume_versions')
        .add(versionData);
      morphedVersionId = versionRef.id;

    }

    const finalPacketPrepared = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(appRef);
      const currentData = snapshot.exists ? snapshot.data() || {} : {};
      if (currentData.packet_generation_owner !== generationOwner) {
        throw new Error('Packet generation ownership was lost before finalization.');
      }
      const linkedResumeVersionId = morphedVersionId || currentData.resume_version_id || null;
      const linkedResumeSnapshot = typeof linkedResumeVersionId === 'string'
        ? await transaction.get(
            db.collection('users').doc(userId)
              .collection('resume_versions').doc(linkedResumeVersionId),
          )
        : null;
      const linkedResumeArtifact = linkedResumeSnapshot?.exists
        ? linkedResumeSnapshot.data() || null
        : null;
      const sourceSnapshot = await transaction.get(sourceReference);
      const currentSource = sourceSnapshot.exists ? getPacketSourceContent(sourceSnapshot.data() || {}, baseResumeSource || 'resume_versions', { uid: userId, id: baseResumeId }) : null;
      const sourceStillMatches = Boolean(currentSource)
        && crypto.createHash('sha256').update(JSON.stringify(currentSource)).digest('hex') === baseResumeHash;
      const persistedReady = sourceStillMatches && isPersistedJobPacketReady({
        ...currentData,
        resume_version_id: linkedResumeVersionId,
        packet_status: 'ready_for_review',
      }, linkedResumeArtifact);
      transaction.set(appRef, {
        resume_version_id: linkedResumeVersionId,
        packet_status: persistedReady ? 'ready_for_review' : 'needs_attention',
        packet_generation_state: persistedReady ? 'complete' : 'needs_attention',
        packet_generation_owner: null,
        packet_generation_lease_expires_at: null,
        last_updated: new Date().toISOString(),
      }, { merge: true });
      return persistedReady;
    });
    activeLease = null;

    const finalPacketRecovery = finalPacketPrepared
      ? null
      : packetIncompleteRecovery({
          morphSucceeded: effectiveMorphSucceeded && Boolean(morphedVersionId),
          coverLetterSucceeded: effectiveCoverLetterSucceeded,
          atsSucceeded: Number.isFinite(atsResult?.overallScore),
        });

    await incrementUsage(userId, 'morphs').catch(error => {
      console.warn('[ApplyPipeline] Packet completed but usage accounting needs reconciliation:', error);
    });
    invalidateTwin(userId).catch(() => {});

    return NextResponse.json({
      success: true,
      applicationId: appRef.id,
      packetStatus: finalPacketPrepared ? 'ready_for_review' : 'needs_attention',
      code: finalPacketRecovery?.code,
      retryable: finalPacketRecovery?.retryable,
      recovery: finalPacketRecovery,
      morphedResume: morphSucceeded ? morphedResume : null,
      matchScore: packetMatchScore,
      coverLetter: effectiveCoverLetter,
      morphedVersionId,
      effectiveMorphPercentage: morphSucceeded
        ? morphAccess.effectiveMorphPercentage
        : existingApplicationData?.morph_effective_percentage || morphAccess.effectiveMorphPercentage,
      maxAllowedMorphPercentage: morphAccess.maxAllowedMorphPercentage,
      guardrailReport: morphGuardrailReport
        || (isCurrentResumeMorphGuardrailReport(existingApplicationData?.morph_guardrail_report)
          ? existingApplicationData?.morph_guardrail_report
          : null),
      hasResume: !!baseResume,
      atsResult,
      keywordGaps,
      warnings: [
        ...(!effectiveMorphSucceeded ? ['Taco did not finish a verified tailored resume. Retry before using this packet.'] : []),
        ...(!effectiveCoverLetterSucceeded ? ['Taco did not finish the cover letter. Retry before using this packet.'] : []),
        ...(keywordGaps.length > 0 ? [`${keywordGaps.length} keyword gaps remain for review.`] : []),
      ],
    });
  } catch (error: any) {
    const lease = activeLease;
    if (lease) {
      try {
        await lease.db.runTransaction(async transaction => {
          const snapshot = await transaction.get(lease.ref);
          const currentData = snapshot.exists ? snapshot.data() || {} : {};
          if (currentData.packet_generation_owner !== lease.owner) return;
          transaction.set(lease.ref, {
            packet_status: 'needs_attention',
            packet_generation_state: 'needs_attention',
            packet_generation_owner: null,
            packet_generation_lease_expires_at: null,
            last_updated: new Date().toISOString(),
          }, { merge: true });
        });
      } catch (leaseError) {
        console.error('[ApplyPipeline] Failed to release packet generation lease:', leaseError);
      }
      activeLease = null;
    }
    console.error('[ApplyPipeline] Error:', error);
    monitor.critical('Tool: agent/apply-pipeline', String(error));
    const recovery = classifyJobPacketFailure(error);
    return NextResponse.json(
      { error: recovery.title, code: recovery.code, retryable: recovery.retryable, recovery },
      {
        status: recovery.code === 'packet_busy' ? 429 : 500,
        headers: recovery.code === 'packet_busy' ? { 'Retry-After': '30' } : undefined,
      }
    );
  }
}
