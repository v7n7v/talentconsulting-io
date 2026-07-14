const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadRecoveryModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-packet-recovery-'));
  const outfile = path.join(outdir, 'packet-recovery.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-packet-recovery.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const recoveryModule = loadRecoveryModule();

async function loadIdentityModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-packet-identity-'));
  const outfile = path.join(outdir, 'packet-identity.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-packet-identity.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const identityModule = loadIdentityModule();

async function loadStateModule() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-packet-state-'));
  const outfile = path.join(outdir, 'packet-state.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'job-packet-state.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const stateModule = loadStateModule();

const CURRENT_GUARDRAIL_REPORT = {
  validatorVersion: '2026-07-10.7',
  protectedContractHash: 'db85e84bd5c5d2aa8a3f9aaed66cd7a2b35e32e317caccb8219b8c6054a5cb42',
  requestedMorphPercentage: 80,
  effectiveMorphPercentage: 80,
  maxAllowedMorphPercentage: 80,
  consentUsed: false,
  protectedFields: ['education'],
  blockedChanges: [],
  blockedChangeCount: 0,
  blockedChangesTruncated: false,
};

const SOURCE_RESUME_ID = 'verified-resume-1';
const SOURCE_RESUME_HASH = 'verified-source-hash-1';
const JOB_TITLE = 'Security Engineer';
const COMPANY = 'Verified Systems';
const COVER_LETTER = 'New source-backed cover letter.';
const coverLetterReport = content => ({
  validatorVersion: '2026-07-10.2',
  sourceResumeId: SOURCE_RESUME_ID,
  sourceResumeHash: SOURCE_RESUME_HASH,
  targetJobTitle: JOB_TITLE,
  targetCompany: COMPANY,
  targetHash: crypto.createHash('sha256').update(JSON.stringify({ company: COMPANY, jobTitle: JOB_TITLE })).digest('hex'),
  contentHash: crypto.createHash('sha256').update(content).digest('hex'),
  evidenceCount: 1,
  evidenceHashes: ['evidence-hash'],
});

const CURRENT_GUARDED_RESUME_ARTIFACT = {
  content: { summary: 'Source-grounded tailored resume.' },
  guardrail_report: CURRENT_GUARDRAIL_REPORT,
  source_resume_id: SOURCE_RESUME_ID,
  source_resume_hash: SOURCE_RESUME_HASH,
};

test('missing resume recovery names the next action and confirms no submission', async () => {
  const { packetResumeRequiredRecovery } = await recoveryModule;
  const recovery = packetResumeRequiredRecovery();

  assert.equal(recovery.code, 'packet_resume_required');
  assert.equal(recovery.action, 'upload_resume');
  assert.equal(recovery.retryable, false);
  assert.equal(recovery.externalApplicationSubmitted, false);
  assert.match(recovery.message, /nothing was submitted/i);
});

test('partial packet recovery preserves the tracker draft and identifies unfinished work', async () => {
  const { packetIncompleteRecovery } = await recoveryModule;
  const recovery = packetIncompleteRecovery({ morphSucceeded: true, coverLetterSucceeded: false, atsSucceeded: true });

  assert.equal(recovery.code, 'packet_incomplete');
  assert.equal(recovery.action, 'retry_packet');
  assert.equal(recovery.trackerDraftState, 'preserved');
  assert.match(recovery.message, /cover letter/i);
  assert.match(recovery.message, /nothing was submitted externally/i);
});

test('packet failure classifier returns bounded busy, network and safe fallback states', async () => {
  const { classifyJobPacketFailure } = await recoveryModule;
  const busy = classifyJobPacketFailure(new Error('provider returned 429'));
  const network = classifyJobPacketFailure(new Error('fetch failed: network timeout'));
  const unknown = classifyJobPacketFailure(new Error('secret provider stack detail'));

  assert.equal(busy.code, 'packet_busy');
  assert.equal(busy.retryable, true);
  assert.equal(network.code, 'packet_network_interrupted');
  assert.equal(network.action, 'retry_packet');
  assert.equal(network.trackerDraftState, 'unknown');
  assert.equal(unknown.code, 'packet_failed');
  assert.doesNotMatch(unknown.message, /secret provider stack detail/);
});

test('packet recovery reader accepts only the complete fail-closed contract', async () => {
  const { packetIncompleteRecovery, readJobPacketRecovery } = await recoveryModule;
  const valid = packetIncompleteRecovery({ morphSucceeded: true, coverLetterSucceeded: false, atsSucceeded: true });

  assert.deepEqual(readJobPacketRecovery(valid), valid);
  assert.equal(readJobPacketRecovery(null), null);
  assert.equal(readJobPacketRecovery({ ...valid, action: 'submit_application' }), null);
  assert.equal(readJobPacketRecovery({ ...valid, externalApplicationSubmitted: true }), null);
  assert.equal(readJobPacketRecovery({ ...valid, message: '' }), null);
  assert.equal(readJobPacketRecovery({ ...valid, retryable: 'yes' }), null);
  assert.equal(readJobPacketRecovery({ ...valid, code: 'packet_resume_required' }), null);
  assert.equal(readJobPacketRecovery({ ...valid, trackerDraftState: 'not_created' }), null);
});

test('packet identity is stable without a job id and separates provider collisions', async () => {
  const { getJobPacketIdentity, getLegacyJobPacketDocumentId, legacyJobPacketMatches } = await identityModule;
  const base = {
    jobId: '',
    jobTitle: 'Security Engineer',
    company: 'Verified Systems',
    jobUrl: 'https://boards.greenhouse.io/verified/jobs/123?source=feed',
    canonicalUrl: 'https://boards.greenhouse.io/verified/jobs/123',
    sourceName: 'Greenhouse',
    jobDescription: 'Security role',
  };
  const first = getJobPacketIdentity(base);
  const same = getJobPacketIdentity({ ...base, jobId: 'provider-id-refreshed', jobUrl: `${base.jobUrl}&campaign=summer` });
  const collision = getJobPacketIdentity({
    ...base,
    jobId: '123',
    canonicalUrl: 'https://jobs.lever.co/other-company/123',
  });

  assert.equal(first.documentId, same.documentId);
  assert.equal(first.identityHash, same.identityHash);
  assert.notEqual(first.documentId, collision.documentId);
  assert.equal(getLegacyJobPacketDocumentId('legacy-job-123'), getLegacyJobPacketDocumentId('legacy-job-123'));
  assert.match(getLegacyJobPacketDocumentId('legacy-job-123'), /^apply_pipeline_/);
  assert.equal(legacyJobPacketMatches({
    company_name: 'Verified Systems',
    job_title: 'Security Engineer',
    application_link: 'https://jobs.example.com/roles/123?old=1',
  }, {
    company: 'verified systems',
    jobTitle: 'Security Engineer',
    jobUrl: 'https://jobs.example.com/roles/123?new=1',
  }), true);
  assert.equal(legacyJobPacketMatches({
    company_name: 'Different Company',
    job_title: 'Security Engineer',
    application_link: 'https://jobs.example.com/roles/123',
  }, {
    company: 'Verified Systems',
    jobTitle: 'Security Engineer',
    jobUrl: 'https://jobs.example.com/roles/123',
  }), false);
});

test('retry preserves successful partial assets and only becomes ready with both', async () => {
  const { isJobPacketGenerationLocked, isPersistedJobPacketReady, resolveJobPacketArtifacts } = await stateModule;
  const preservedCoverLetter = resolveJobPacketArtifacts({
    existing: {
      job_title: JOB_TITLE,
      company_name: COMPANY,
      morph_succeeded: false,
      resume_version_id: null,
      cover_letter_succeeded: true,
      cover_letter: COVER_LETTER,
      cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
      cover_letter_source_resume_id: SOURCE_RESUME_ID,
      cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
    },
    currentSourceResumeId: SOURCE_RESUME_ID,
    currentSourceResumeHash: SOURCE_RESUME_HASH,
    currentJobTitle: JOB_TITLE,
    currentCompany: COMPANY,
    morphSucceeded: false,
    coverLetterSucceeded: false,
    coverLetter: '',
    coverLetterReport: null,
  });
  assert.equal(preservedCoverLetter.effectiveCoverLetter, COVER_LETTER);
  assert.equal(preservedCoverLetter.packetPrepared, false);

  const completedRetry = resolveJobPacketArtifacts({
    existing: {
      job_title: JOB_TITLE,
      company_name: COMPANY,
      morph_succeeded: true,
      resume_version_id: 'resume-tailored-1',
      morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
      morph_source_resume_id: SOURCE_RESUME_ID,
      morph_source_resume_hash: SOURCE_RESUME_HASH,
      cover_letter_succeeded: false,
      cover_letter: '',
    },
    existingResumeArtifact: CURRENT_GUARDED_RESUME_ARTIFACT,
    currentSourceResumeId: SOURCE_RESUME_ID,
    currentSourceResumeHash: SOURCE_RESUME_HASH,
    currentJobTitle: JOB_TITLE,
    currentCompany: COMPANY,
    morphSucceeded: false,
    coverLetterSucceeded: true,
    coverLetter: COVER_LETTER,
    coverLetterReport: coverLetterReport(COVER_LETTER),
  });
  assert.equal(completedRetry.priorMorphVersionId, 'resume-tailored-1');
  assert.equal(completedRetry.effectiveCoverLetter, 'New source-backed cover letter.');
  assert.equal(completedRetry.packetPrepared, true);

  const legacyArtifacts = resolveJobPacketArtifacts({
    existing: {
      resume_version_id: 'legacy-tailored-1',
      morph_guardrail_report: { validatorVersion: 'truth-lock-v1' },
      cover_letter: 'Legacy source-backed cover letter.',
    },
    currentSourceResumeId: SOURCE_RESUME_ID,
    currentSourceResumeHash: SOURCE_RESUME_HASH,
    currentJobTitle: JOB_TITLE,
    currentCompany: COMPANY,
    morphSucceeded: false,
    coverLetterSucceeded: false,
    coverLetter: '',
    coverLetterReport: null,
  });
  assert.equal(legacyArtifacts.priorMorphVersionId, null);
  assert.equal(legacyArtifacts.effectiveCoverLetter, '');
  assert.equal(legacyArtifacts.packetPrepared, false);

  const changedSource = resolveJobPacketArtifacts({
    existing: {
      job_title: JOB_TITLE,
      company_name: COMPANY,
      morph_succeeded: true,
      resume_version_id: 'resume-tailored-1',
      morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
      morph_source_resume_id: SOURCE_RESUME_ID,
      morph_source_resume_hash: SOURCE_RESUME_HASH,
      cover_letter_succeeded: true,
      cover_letter: COVER_LETTER,
      cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
      cover_letter_source_resume_id: SOURCE_RESUME_ID,
      cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
    },
    existingResumeArtifact: CURRENT_GUARDED_RESUME_ARTIFACT,
    currentSourceResumeId: 'different-resume',
    currentSourceResumeHash: 'different-hash',
    currentJobTitle: JOB_TITLE,
    currentCompany: COMPANY,
    morphSucceeded: false,
    coverLetterSucceeded: false,
    coverLetter: '',
    coverLetterReport: null,
  });
  assert.equal(changedSource.priorMorphVersionId, null);
  assert.equal(changedSource.effectiveCoverLetter, '');
  assert.equal(changedSource.packetPrepared, false);

  const now = Date.now();
  assert.equal(isJobPacketGenerationLocked({
    packet_generation_state: 'running',
    packet_generation_owner: 'owner-a',
    packet_generation_lease_expires_at: new Date(now + 60_000).toISOString(),
  }, now), true);
  assert.equal(isJobPacketGenerationLocked({
    packet_generation_state: 'running',
    packet_generation_owner: 'owner-a',
    packet_generation_lease_expires_at: new Date(now - 1).toISOString(),
  }, now), false);
  assert.equal(isPersistedJobPacketReady({
    job_title: JOB_TITLE,
    company_name: COMPANY,
    packet_status: 'ready_for_review',
    resume_version_id: 'original-resume-only',
    cover_letter: 'Cover letter',
  }), false);
  assert.equal(isPersistedJobPacketReady({
    job_title: JOB_TITLE,
    company_name: COMPANY,
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    morph_source_resume_id: SOURCE_RESUME_ID,
    morph_source_resume_hash: SOURCE_RESUME_HASH,
    resume_version_id: 'tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: COVER_LETTER,
    cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
    cover_letter_source_resume_id: SOURCE_RESUME_ID,
    cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
    ats_score: 88,
  }, CURRENT_GUARDED_RESUME_ARTIFACT), true);
  assert.equal(isPersistedJobPacketReady({
    job_title: JOB_TITLE,
    company_name: COMPANY,
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    morph_source_resume_id: SOURCE_RESUME_ID,
    morph_source_resume_hash: SOURCE_RESUME_HASH,
    resume_version_id: 'tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: COVER_LETTER,
    cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
    cover_letter_source_resume_id: SOURCE_RESUME_ID,
    cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
  }, CURRENT_GUARDED_RESUME_ARTIFACT), false);
  assert.equal(isPersistedJobPacketReady({
    job_title: JOB_TITLE,
    company_name: COMPANY,
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    morph_source_resume_id: SOURCE_RESUME_ID,
    morph_source_resume_hash: SOURCE_RESUME_HASH,
    resume_version_id: 'tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: `${COVER_LETTER} Fabricated claim.`,
    cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
    cover_letter_source_resume_id: SOURCE_RESUME_ID,
    cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
  }, CURRENT_GUARDED_RESUME_ARTIFACT), false);
  assert.equal(isPersistedJobPacketReady({
    job_title: 'Different Role',
    company_name: COMPANY,
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    morph_source_resume_id: SOURCE_RESUME_ID,
    morph_source_resume_hash: SOURCE_RESUME_HASH,
    resume_version_id: 'tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: COVER_LETTER,
    cover_letter_guardrail_report: coverLetterReport(COVER_LETTER),
    cover_letter_source_resume_id: SOURCE_RESUME_ID,
    cover_letter_source_resume_hash: SOURCE_RESUME_HASH,
  }, CURRENT_GUARDED_RESUME_ARTIFACT), false);
  assert.equal(isPersistedJobPacketReady({
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    resume_version_id: 'deleted-tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: 'Cover letter',
  }, null), false);
  assert.equal(isPersistedJobPacketReady({
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: CURRENT_GUARDRAIL_REPORT,
    resume_version_id: 'different-morph-run',
    cover_letter_succeeded: true,
    cover_letter: 'Cover letter',
  }, {
    ...CURRENT_GUARDED_RESUME_ARTIFACT,
    guardrail_report: {
      ...CURRENT_GUARDRAIL_REPORT,
      effectiveMorphPercentage: 60,
    },
  }), false);
  assert.equal(isPersistedJobPacketReady({
    packet_status: 'ready_for_review',
    morph_succeeded: true,
    morph_guardrail_report: { ...CURRENT_GUARDRAIL_REPORT, validatorVersion: 'stale' },
    resume_version_id: 'tailored-resume',
    cover_letter_succeeded: true,
    cover_letter: 'Cover letter',
  }), false);
});

test('apply pipeline and Job Search preserve partial work as a typed recovery', () => {
  const route = fs.readFileSync(path.join(repoRoot, 'app/api/agent/apply-pipeline/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(route, /currentSourceMatches[\s\S]*isPersistedJobPacketReady\(currentData, linkedResumeArtifact\)/);
  assert.match(route, /isCurrentGuardedResumeArtifact\([\s\S]*linkedResumeArtifact[\s\S]*morph_guardrail_report[\s\S]*sourceResumeId/);
  assert.match(route, /finalPacketRecovery = finalPacketPrepared[\s\S]*packetIncompleteRecovery/);
  assert.match(route, /morph_succeeded: effectiveMorphSucceeded/);
  assert.match(route, /cover_letter_succeeded: effectiveCoverLetterSucceeded/);
  assert.match(route, /packet_identity_hash: packetIdentity\.identityHash/);
  assert.match(route, /getTrustedTalentJobApplyUrl\(\{ url: jobUrl, sourceMeta \}\)/);
  assert.match(route, /application_link: trustedJobUrl/);
  assert.doesNotMatch(route, /application_link: jobUrl \|\| null/);
  assert.match(route, /getLegacyJobPacketDocumentId\(jobId\)/);
  assert.match(route, /legacyData && legacyJobPacketMatches\(legacyData/);
  assert.match(route, /migrated_from_application_id: legacyRef\.id/);
  assert.match(route, /transaction\.delete\(legacyRef\)/);
  assert.match(route, /packet_generation_owner: generationOwner/);
  assert.match(route, /currentData\.packet_generation_owner !== generationOwner/);
  assert.match(route, /packet_status: 'needs_attention'/);
  assert.match(route, /resume_version_id: linkedResumeVersionId[\s\S]*packet_status: persistedReady \? 'ready_for_review' : 'needs_attention'/);
  assert.match(route, /resolveJobPacketArtifacts\(/);
  assert.match(route, /generateGuardedMorphDraft\(/);
  assert.match(route, /buildTruthLockedCoverLetter\([\s\S]*resume: baseResume/);
  assert.match(route, /currentSourceMatches[\s\S]*morph_source_resume_hash === baseResumeHash/);
  assert.doesNotMatch(route, /requestedSourceMatches/);
  assert.match(route, /if \(!selectedResume\.resume \|\| !selectedResume\.id\)[\s\S]*packetResumeRequiredRecovery/);
  assert.doesNotMatch(route, /Create a compelling, professional cover letter|cover letter content as a string/);
  assert.doesNotMatch(route, /morphResult\.matchScore|matchScore = 60|matchScore = morphResult/);
  assert.doesNotMatch(route, /const \{[^}]*fitScore/);
  assert.match(route, /packetMatchScore = recommendationEvidence\?\.cohortEligible[\s\S]*recommendationEvidence\.score[\s\S]*atsResult\?\.overallScore/);
  assert.match(route, /Number\.isFinite\(data\.ats_score\) \? \{ overallScore: Number\(data\.ats_score\) \} : null/);
  assert.match(route, /ats_score: Number\.isFinite\(atsResult\?\.overallScore\) \? atsResult\?\.overallScore : null/);
  assert.match(route, /preservePriorResumeAnalysis && Number\.isFinite\(existingApplicationData\?\.ats_score\)/);
  assert.doesNotMatch(route, /ats_score: atsResult\?\.overallScore \|\| null/);
  assert.match(route, /baseResumeHash = crypto\.createHash\('sha256'\)/);
  assert.match(route, /source_resume_hash: baseResumeHash/);
  assert.match(route, /packetStatus: finalPacketPrepared \? 'ready_for_review' : 'needs_attention'/);
  assert.match(route, /recovery: finalPacketRecovery/);
  assert.match(page, /const responseReady = data\.packetStatus === 'ready_for_review'/);
  assert.match(page, /typeof data\.applicationId === 'string'/);
  assert.match(page, /typeof data\.morphedVersionId === 'string'/);
  assert.match(page, /typeof data\.coverLetter === 'string'/);
  assert.match(page, /Number\.isFinite\(atsScore\)/);
  assert.match(page, /const atsScore = data\.atsResult\?\.overallScore/);
  assert.doesNotMatch(page, /data\.atsResult\?\.overallScore \?\? data\.matchScore/);
  assert.match(page, /Number\.isFinite\(current\.atsScore\) \? `\$\{current\.atsScore\}%` : 'Needs check'/);
  assert.match(page, /const requestUserId = jobCountUserId[\s\S]*updateApplicationStatus[\s\S]*activeJobUserIdRef\.current !== requestUserId/);
  assert.match(page, /if \(!responseReady\)/);
  assert.match(page, /status: data\.applicationId \? 'needs_attention' : 'failed'/);
  assert.match(page, /packet_needs_attention/);
  assert.match(page, /recovery\.nextAction/);
  assert.doesNotMatch(page, /current\.status === 'ready' \|\| current\.status === 'applied' \|\| current\.status === 'saved'/);
  assert.doesNotMatch(page, /throw new Error\(data\.error \|\| 'Packet preparation failed'\)/);
  assert.match(page, /packetRequestGenerationRef\.current \+= 1/);
  assert.match(page, /activeJobUserIdRef\.current === requestUserId/);
  assert.ok(
    page.indexOf('if (!requestIsCurrent()) return;', page.indexOf("await recordLedgerStatus(job, 'queued'"))
      < page.indexOf("authFetch('/api/agent/apply-pipeline'"),
    'account binding must be checked after queue learning and before packet generation',
  );
  assert.ok(
    page.indexOf('if (!requestIsCurrent()) {', page.indexOf('const data = await res.json()'))
      < page.indexOf('const responseReady'),
    'account binding must be checked before applying a packet response',
  );
});
