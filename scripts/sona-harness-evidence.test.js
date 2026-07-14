const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadHarnessEvidence() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-sona-harness-evidence-'));
  const outfile = path.join(outdir, 'harness-evidence.cjs');

  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'sona', 'harness-evidence.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });

  return require(outfile);
}

const {
  buildHarnessQueueEvidence,
  buildHarnessQueueRecord,
  buildHarnessQueuedResultItem,
  formatHarnessResultForChat,
} = loadHarnessEvidence();

const goal = {
  targetRole: 'Security Engineer',
  location: 'New Jersey',
  salaryTarget: 120000,
  remotePreference: 'hybrid',
};

const rankedJob = {
  title: 'Security Engineer',
  company: 'Lockheed Martin',
  location: 'Moorestown, NJ',
  url: '',
  description: 'Security engineering role with NIST, incident response, and wireless systems work.',
  employmentType: 'Full-time',
  postedDate: '2026-07-08T00:00:00.000Z',
  sourceMeta: {
    sourceType: 'direct_ats',
    sourceName: 'Greenhouse',
    sourceConfidence: 'high',
  },
  remoteMode: 'unknown',
  salary: { min: null, max: null },
  fitScore: { overall: 92 },
  recommendationReason: 'Direct-source listing with strong resume-skill overlap.',
  fitReasons: [
    'Strong resume-skill overlap at 88%.',
    'Title aligns with Security Engineer.',
  ],
  riskNotes: [
    'Security clearance may be required.',
    'Security clearance may be required.',
  ],
  sourceNotes: [
    'Direct ATS source with high confidence.',
    'Open the original posting to confirm it is still active.',
  ],
};

test('buildHarnessQueueEvidence preserves fit, risk and source evidence', () => {
  const evidence = buildHarnessQueueEvidence({
    job: rankedJob,
    goal,
    canPrepareAssets: false,
    keywordGaps: ['FedRAMP', 'NIST'],
  });

  assert.equal(evidence.score, 92);
  assert.equal(evidence.reason, 'Direct-source listing with strong resume-skill overlap.');
  assert.deepEqual(evidence.sourceNotes, [
    'Direct ATS source with high confidence.',
    'Open the original posting to confirm it is still active.',
  ]);
  assert.equal(evidence.fitSignals[0], 'Strong resume-skill overlap at 88%.');
  assert.equal(evidence.fitSignals.includes('92% fit against Security Engineer.'), true);
  assert.equal(evidence.fitSignals.includes('Salary target: $120k.'), true);
  assert.equal(evidence.riskSignals.filter(signal => signal === 'Security clearance may be required.').length, 1);
  assert.equal(evidence.riskSignals.includes('No direct application URL was available.'), true);
  assert.equal(evidence.riskSignals.includes('Remote mode was not explicit. User asked for hybrid.'), true);
  assert.equal(evidence.riskSignals.includes('Salary was not listed. User target is $120k.'), true);
  assert.equal(evidence.riskSignals.includes('Upgrade to Talent Max to prepare tailored resume and cover letter drafts.'), true);
  assert.equal(evidence.riskSignals.includes('2 ATS keyword gaps remain for review.'), true);
  assert.equal(evidence.nextAction, 'Review role fit');
});

test('buildHarnessQueuedResultItem carries evidence for the chat card and queue handoff', () => {
  const evidence = buildHarnessQueueEvidence({
    job: rankedJob,
    goal,
    canPrepareAssets: true,
    keywordGaps: [],
  });
  const queued = buildHarnessQueuedResultItem({
    queueId: 'queue-123',
    job: rankedJob,
    evidence,
    canPrepareAssets: true,
    resumeVersionId: 'resume-456',
  });

  assert.equal(queued.queueId, 'queue-123');
  assert.equal(queued.matchScore, 92);
  assert.equal(queued.packetStatus, 'prepared');
  assert.equal(queued.resumeVersionId, 'resume-456');
  assert.deepEqual(queued.fitSignals, evidence.fitSignals);
  assert.deepEqual(queued.riskSignals, evidence.riskSignals);
  assert.deepEqual(queued.sourceNotes, evidence.sourceNotes);
  assert.equal(queued.nextAction, 'Review prepared packet');
});

test('buildHarnessQueueRecord preserves the Agent Queue evidence payload', () => {
  const evidence = buildHarnessQueueEvidence({
    job: rankedJob,
    goal,
    canPrepareAssets: true,
    keywordGaps: ['NIST'],
  });
  const record = buildHarnessQueueRecord({
    uid: 'user-123',
    job: rankedJob,
    goal,
    evidence,
    canPrepareAssets: true,
    mode: 'prepare',
    runId: 'run-123',
    batchDate: '2026-07-09',
    createdAt: '2026-07-09T12:00:00.000Z',
    expiresAt: '2026-07-16T12:00:00.000Z',
    morphedResume: { name: 'Candidate' },
    morphEffectivePercentage: 80,
    morphGuardrailReport: { protectedFields: ['education'] },
    coverLetter: 'Draft cover letter',
    resumeVersionId: 'resume-456',
    sourceResumeId: 'resume-source-123',
    sourceResumeType: 'resume_versions',
    sourceResumeHash: 'a'.repeat(64),
    atsScore: 87,
    keywordGaps: ['NIST'],
  });

  assert.equal(record.user_id, 'user-123');
  assert.equal(record.job_title, 'Security Engineer');
  assert.equal(record.match_score, 92);
  assert.equal(record.match_reason, evidence.reason);
  assert.equal(record.packetStatus, 'prepared');
  assert.equal(record.source_resume_id, 'resume-source-123');
  assert.equal(record.source_resume_type, 'resume_versions');
  assert.equal(record.source_resume_hash, 'a'.repeat(64));
  assert.equal(record.nextAction, 'Review Sona’s tailored resume, cover letter, and job link before applying manually.');
  assert.deepEqual(record.fitSignals, evidence.fitSignals);
  assert.deepEqual(record.riskSignals, evidence.riskSignals);
  assert.deepEqual(record.sourceMeta, rankedJob.sourceMeta);
  assert.equal(record.ats_score, 87);
  assert.deepEqual(record.keyword_gaps, ['NIST']);
  assert.equal(record.goal.targetRole, 'Security Engineer');
});

test('formatHarnessResultForChat summarizes evidence and preserves review-first guardrail', () => {
  const evidence = buildHarnessQueueEvidence({
    job: rankedJob,
    goal,
    canPrepareAssets: true,
    keywordGaps: [],
  });
  const queued = buildHarnessQueuedResultItem({
    queueId: 'queue-123',
    job: rankedJob,
    evidence,
    canPrepareAssets: true,
    resumeVersionId: 'resume-456',
  });
  const summary = formatHarnessResultForChat({
    success: true,
    queuedCount: 1,
    goal,
    queued: [queued],
    nextActions: [],
  });

  assert.match(summary, /I queued 1 role for review/);
  assert.match(summary, /Security Engineer at Lockheed Martin — 92% fit\. Strong resume-skill overlap at 88%/);
  assert.match(summary, /Salary target: \$120k/);
  assert.match(summary, /I will not submit, email or text anyone without your approval/);
});

test('formatHarnessResultForChat gives a resume-first recovery path', () => {
  const summary = formatHarnessResultForChat({
    success: false,
    queuedCount: 0,
    needsResume: true,
    goal,
    queued: [],
    nextActions: ['Upload a resume first.'],
  });

  assert.match(summary, /I need a verified resume/);
  assert.match(summary, /Upload or select the resume/);
  assert.doesNotMatch(summary, /Top picks/);
});
