const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const React = require('react');
const { pdf } = require('@react-pdf/renderer');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
const JSZip = require('jszip');
const { MockPacketFirestore } = require('./helpers/mock-packet-firestore');

const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
const bundleDir = fs.mkdtempSync(path.join(root, 'tmp', '.agentic-journey-'));
const artifactDir = path.join(root, 'test-results', 'agentic-p0');
pdfjs.GlobalWorkerOptions.workerSrc = path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');

const syntheticResume = {
  name: 'Amina Rivera',
  title: 'Product Designer',
  email: 'amina.rivera@example.invalid',
  phone: '555-0142',
  location: 'Boston, MA',
  summary: 'Product designer who uses customer research to improve onboarding experiences.',
  experience: [{
    company: 'Northstar Systems',
    role: 'Product Designer',
    duration: '2021–Present',
    achievements: ['Improved an onboarding form after customer interviews.'],
  }],
  education: [{ degree: 'BA Design', institution: 'Rutgers University', year: '2021' }],
  skills: [{ category: 'Methods', items: ['User research', 'Prototyping'] }],
  certifications: [],
};
const job = {
  jobTitle: 'Product Designer',
  company: 'Acme Studio',
  jobDescription: 'Use customer research to improve onboarding experiences.',
  jobId: 'agentic-p0-product-designer',
  jobUrl: 'https://example.invalid/jobs/product-designer',
  sourceMeta: { canonicalUrl: 'https://example.invalid/jobs/product-designer', sourceName: 'synthetic-fixture' },
};
const uid = 'agentic-p0-candidate';
const sourceId = 'confirmed-resume';
const sourcePath = `users/${uid}/resume_versions/${sourceId}`;

function makeOracleLegacy() {
  return {
    resumeSkills: ['customer research'],
    jdRequirements: [job.jobDescription],
    matchedSkills: ['customer research'],
    gapSkills: [],
    requirementEvidence: [{
      requirement: job.jobDescription,
      postingQuote: job.jobDescription,
      resumeQuote: syntheticResume.summary,
    }],
    fitScoreEstimate: 0,
    redFlags: [],
    hiddenRequirements: [],
    keywordsToAdd: [],
    roleLevel: 'Product Designer',
    bridgeSkills: [],
  };
}

function aliasPlugin(mocks) {
  return {
    name: 'agentic-journey-local-mocks',
    setup(builder) {
      for (const [specifier, contents] of Object.entries(mocks)) {
        const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        builder.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: specifier, namespace: 'agentic-mock' }));
        builder.onLoad({ filter: new RegExp(`^${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), namespace: 'agentic-mock' }, () => ({ contents, loader: 'js' }));
      }
    },
  };
}

async function bundleRoute(name, entry, mocks) {
  const outfile = path.join(bundleDir, `${name}.cjs`);
  await build({
    entryPoints: [path.join(root, entry)], outfile, bundle: true, platform: 'node', format: 'cjs',
    target: 'node20', jsx: 'automatic', alias: { '@': root }, logLevel: 'silent', plugins: [aliasPlugin(mocks)],
  });
  return require(outfile);
}

const oraclePromise = bundleRoute('oracle', 'app/api/oracle/analyze/route.ts', {
  'next/server': `export const NextResponse = { json: (value, init) => Response.json(value, init) };`,
  '@/lib/api-auth': `export async function guardApiRoute(){ return { user: { uid: '${uid}', tier: 'studio' } }; }`,
  '@/lib/firebase-admin': `export function getAdminDb(){ return globalThis.__agenticJourney.db; }`,
  '@/lib/ai/groq-client': `export async function groqJSONCompletion(){ globalThis.__agenticJourney.oracleCalls++; return globalThis.__agenticJourney.oracleLegacy; }`,
  '@/lib/ai/openrouter-client': `export const WRITING_MODELS={premiumFallback:'synthetic-fixture'}; export async function openRouterJSONCompletion(){ globalThis.__agenticJourney.validationCalls++; return {requirementEvidence:globalThis.__agenticJourney.oracleLegacy.requirementEvidence}; }`,
  '@/lib/career-twin': `export async function invalidateTwin(){};`,
  '@/lib/monitor': `export const monitor={critical(){}};`,
});

const packetPromise = bundleRoute('packet', 'app/api/agent/apply-pipeline/route.ts', {
  'next/server': `export const NextResponse={json:(value,init)=>Response.json(value,init)};`,
  '@/lib/api-auth': `export async function guardApiRoute(){ return {user:{uid:'${uid}',tier:'studio'}}; }`,
  '@/lib/firebase-admin': `export function getAdminDb(){return globalThis.__agenticJourney.db;}`,
  '@/lib/usage-tracker': `export async function checkUsageAllowed(){return {allowed:true,cap:15};} export async function incrementUsage(){globalThis.__agenticJourney.usage++;}`,
  '@/lib/ai/groq-client': `export async function groqJSONCompletion(){globalThis.__agenticJourney.morphCalls++;return {morphedResume:globalThis.__agenticJourney.db.records.get('${sourcePath}').content};}`,
  '@/lib/monitor': `export const monitor={critical(){}};`,
  '@/lib/career-twin': `export async function invalidateTwin(){};`,
  '@/lib/job-recommendation-platform': `export function getTrustedTalentJobApplyUrl(input){return input.url;} export async function loadRecommendationCalibrationEvidenceFromImpression(){return null;}`,
});

const reviewPromise = bundleRoute('review', 'app/api/agent/packet-review/route.ts', {
  'next/server': `export const NextResponse={json:(value,init)=>Response.json(value,init)};`,
  '@/lib/api-auth': `export async function guardApiRoute(){return {user:{uid:'${uid}',tier:'studio'}};}`,
  '@/lib/firebase-admin': `export function getAdminDb(){return globalThis.__agenticJourney.db;}`,
});

const exportPromise = (async () => {
  const outdir = path.join(bundleDir, 'exports');
  await fs.promises.mkdir(outdir, { recursive: true });
  await build({
    entryPoints: {
      pdf: path.join(root, 'lib/resume-design/pdf.tsx'),
      docx: path.join(root, 'lib/resume-design/docx.ts'),
      design: path.join(root, 'lib/resume-design/index.ts'),
      truth: path.join(root, 'lib/resume-export-truth.ts'),
      packetReview: path.join(root, 'lib/job-packet-review.ts'),
    },
    outdir, outbase: path.join(root, 'lib'), bundle: true, format: 'cjs', platform: 'node', target: 'node20',
    jsx: 'automatic', external: ['@react-pdf/renderer', 'react', 'react/jsx-runtime', 'docx'],
    alias: { '@': root }, logLevel: 'silent',
  });
  return {
    ...require(path.join(outdir, 'pdf.js')),
    ...require(path.join(outdir, 'docx.js')),
    ...require(path.join(outdir, 'design.js')),
    ...require(path.join(outdir, 'truth.js')),
    ...require(path.join(outdir, 'packetReview.js')),
  };
})();

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));

function prepareState() {
  const db = new MockPacketFirestore();
  db.put(sourcePath, {
    content: structuredClone(syntheticResume),
    provenance: { verified: true, origin: 'user_upload', recordedAt: '2026-10-09T12:00:00.000Z' },
    created_at: '2026-10-09T12:00:00.000Z',
  });
  globalThis.__agenticJourney = {
    db,
    oracleLegacy: makeOracleLegacy(),
    oracleCalls: 0,
    validationCalls: 0,
    morphCalls: 0,
    usage: 0,
  };
  return globalThis.__agenticJourney;
}

function request(body) { return { json: async () => body }; }

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function runGetReview(route, applicationId) {
  const response = await route.GET({ nextUrl: new URL(`http://localhost/api/agent/packet-review?kind=application&id=${applicationId}`) });
  return { response, body: await response.json() };
}

async function runApprove(route, applicationId, revision) {
  const response = await route.POST({ json: async () => ({ kind: 'application', id: applicationId, action: 'approve', revision }) });
  return { response, body: await response.json() };
}

test('analysis and packet reject generated, ambiguous, malformed, and foreign source records before model work', async () => {
  const [oracle, packet] = await Promise.all([oraclePromise, packetPromise]);
  for (const change of [
    { source: 'apply_pipeline' },
    { provenance: { verified: true, origin: 'generated' } },
    { metadata: { workspace: { schemaVersion: 1, kind: 'experience' } } },
    { foreignOwner: true },
  ]) {
    const state = prepareState();
    if (change.foreignOwner) {
      state.db.put('users/other-candidate/resume_versions/confirmed-resume', state.db.records.get(sourcePath));
      state.db.records.delete(sourcePath);
    } else {
      state.db.put(sourcePath, { ...state.db.records.get(sourcePath), ...change });
    }
    const recordsBefore = structuredClone([...state.db.records]);
    const analysis = await oracle.POST(request({ resumeVersionId: sourceId, resumeText: '', jdText: job.jobDescription, targetRole: job.jobTitle }));
    const preparation = await packet.POST(request({ ...job, resumeVersionId: sourceId }));
    assert.equal(analysis.status, 409, JSON.stringify(change));
    assert.equal(preparation.status, 409, JSON.stringify(change));
    assert.equal(state.oracleCalls + state.validationCalls + state.morphCalls + state.usage, 0);
    assert.deepEqual([...state.db.records], recordsBefore, 'rejected sources cause no saved work');
  }
});

test('one confirmed source and supplied posting survive Oracle, packet, approval, real exports, and reopen', async () => {
  const state = prepareState();
  const [oracle, packet, review, exports] = await Promise.all([oraclePromise, packetPromise, reviewPromise, exportPromise]);

  const analyzedResponse = await oracle.POST(request({
    resumeVersionId: sourceId,
    resumeText: '',
    jdText: job.jobDescription,
    targetRole: job.jobTitle,
    company: job.company,
    jobUrl: job.jobUrl,
  }));
  assert.equal(analyzedResponse.status, 200);
  const analyzed = await analyzedResponse.json();
  assert.equal(analyzed.sourceBinding.resumeVersionId, sourceId);
  assert.equal(analyzed.sourceBinding.sourceHash, crypto.createHash('sha256').update(JSON.stringify(syntheticResume)).digest('hex'));
  assert.equal(analyzed.inputBinding.postingHash, crypto.createHash('sha256').update(job.jobDescription).digest('hex'));
  assert.equal(state.oracleCalls, 1);
  assert.equal(state.validationCalls, 1);
  const fitPath = `users/${uid}/fit_analyses/${analyzed.analysisId}`;
  assert.ok(state.db.records.has(fitPath), 'Oracle persisted the source-bound analysis');

  const generatedResponse = await packet.POST(request({
    ...job,
    resumeVersionId: sourceId,
  }));
  assert.equal(generatedResponse.status, 200);
  const generated = await generatedResponse.json();
  assert.equal(generated.packetStatus, 'ready_for_review');
  assert.equal(state.morphCalls, 1);
  assert.equal(state.usage, 1);
  const applicationPath = `users/${uid}/applications/${generated.applicationId}`;
  const firstPacket = state.db.records.get(applicationPath);
  assert.ok(firstPacket);
  const generatedArtifactId = generated.morphedVersionId;
  const artifactPath = `users/${uid}/resume_versions/${generatedArtifactId}`;
  const generatedArtifact = state.db.records.get(artifactPath);
  assert.ok(generatedArtifact);
  assert.equal(firstPacket.morph_source_resume_id, sourceId);
  assert.equal(firstPacket.morph_source_resume_hash, analyzed.sourceBinding.sourceHash);
  const packetPostingHash = exports.packetJobDescriptionHash(job.jobDescription);
  assert.equal(firstPacket.packet_job_description_hash, packetPostingHash);
  assert.notEqual(packetPostingHash, analyzed.inputBinding.postingHash, 'Oracle and packet currently use different posting hash encodings');
  assert.equal(generatedArtifact.source_resume_id, sourceId);
  assert.equal(generatedArtifact.source_resume_hash, analyzed.sourceBinding.sourceHash);

  // Compatibility seam: generated application records currently have no analysisId field.
  // Source hashes match directly; Oracle and packet posting hashes use different encodings,
  // so compare each to its production function and verify the exact reopened JD text.
  assert.equal(firstPacket.analysis_id, undefined);
  assert.equal(firstPacket.analysisId, undefined);

  const appCountBeforeRetry = [...state.db.records.keys()].filter(key => key.startsWith(`users/${uid}/applications/`)).length;
  const resumeCountBeforeRetry = [...state.db.records.keys()].filter(key => key.startsWith(`users/${uid}/resume_versions/`)).length;
  const retryResponse = await packet.POST(request({ ...job, resumeVersionId: sourceId }));
  const retried = await retryResponse.json();
  assert.equal(retryResponse.status, 200);
  assert.equal(retried.idempotent, true);
  assert.equal(retried.applicationId, generated.applicationId);
  assert.equal(state.morphCalls, 1);
  assert.equal(state.usage, 1);
  assert.equal([...state.db.records.keys()].filter(key => key.startsWith(`users/${uid}/applications/`)).length, appCountBeforeRetry);
  assert.equal([...state.db.records.keys()].filter(key => key.startsWith(`users/${uid}/resume_versions/`)).length, resumeCountBeforeRetry);

  const preApproval = await runGetReview(review, generated.applicationId);
  assert.equal(preApproval.response.status, 200);
  const view = preApproval.body.data[0];
  assert.equal(view.review_ready, true);
  assert.equal(view.review_status, 'needs_review');
  assert.deepEqual(view.review_source, syntheticResume);
  assert.equal(view.review_binding.source.id, sourceId);
  assert.equal(view.review_binding.source.hash, analyzed.sourceBinding.sourceHash);
  assert.equal(view.review_binding.job.descriptionHash, packetPostingHash);
  assert.equal(view.job_description, job.jobDescription);
  assert.equal(view.review_binding.artifact.resumeVersionId, generatedArtifactId);
  assert.equal(view.review_binding.artifact.resumeHash, exports.packetContentHash(generatedArtifact.content));

  const approvalResults = await Promise.all([
    runApprove(review, generated.applicationId, view.review_revision),
    runApprove(review, generated.applicationId, view.review_revision),
  ]);
  assert.ok(approvalResults.every(item => item.response.status === 200));
  assert.equal(approvalResults.filter(item => item.body.idempotent).length, 1);
  const approvedPacket = state.db.records.get(applicationPath);
  assert.equal(approvedPacket.human_review.decision, 'approved');
  assert.equal(approvedPacket.human_review.revision, view.review_revision);
  assert.deepEqual(approvedPacket.human_review.binding, view.review_binding);

  const reopen = await runGetReview(review, generated.applicationId);
  assert.equal(reopen.response.status, 200);
  const reopened = reopen.body.data[0];
  assert.equal(reopened.review_status, 'approved');
  assert.equal(reopened.review_revision, view.review_revision);
  assert.deepEqual(reopened.review_binding, view.review_binding);
  assert.deepEqual(reopened.review_resume, generatedArtifact.content);
  assert.equal(reopened.job_description, job.jobDescription);

  const prepared = exports.prepareResumeForExport({
    mode: 'morph', originalResume: state.db.records.get(sourcePath).content, candidateResume: reopened.review_resume,
  });
  assert.equal(exports.canPersistPreparedResume(prepared), true);
  assert.equal(prepared.guardrailReport.blockedChangeCount, 0);
  const design = exports.getApplicationResumeDesign(exports.createResumeDesign('technical-signal', prepared.resume, undefined, 'A4'));
  const pdfBytes = await toBuffer(await pdf(React.createElement(exports.ResumeDesignPDFPage, { resume: prepared.resume, design, mode: 'application' })).toBuffer());
  const docxBytes = await exports.buildResumeDesignDocxBuffer(prepared.resume, design);
  assert.ok(Buffer.isBuffer(pdfBytes) && pdfBytes.subarray(0, 5).toString() === '%PDF-', 'real production PDF renderer returned PDF bytes');
  assert.ok(Buffer.isBuffer(docxBytes) && docxBytes.length > 500, 'real production DOCX builder returned an Office package');

  const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  assert.ok(pdfDocument.numPages >= 1);
  const pdfText = (await Promise.all(Array.from({ length: pdfDocument.numPages }, async (_, index) => {
    const page = await pdfDocument.getPage(index + 1);
    const content = await page.getTextContent();
    return content.items.map(item => item.str || '').join(' ');
  }))).join(' ');
  assert.match(pdfText, /Amina\s+Rivera/);
  assert.match(pdfText, /Northstar Systems/);
  assert.doesNotMatch(pdfText, /Invented|Acme Studio/);
  await pdfDocument.destroy();

  const archive = await JSZip.loadAsync(docxBytes);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.match(documentXml, /Amina\s+Rivera/);
  assert.match(documentXml, /Northstar Systems/);
  assert.doesNotMatch(documentXml, /Invented|Acme Studio/);
  await fs.promises.mkdir(artifactDir, { recursive: true });
  await fs.promises.writeFile(path.join(artifactDir, 'synthetic-resume.pdf'), pdfBytes);
  await fs.promises.writeFile(path.join(artifactDir, 'synthetic-resume.docx'), docxBytes);

  const sourceBeforeEdit = state.db.records.get(sourcePath);
  state.db.put(sourcePath, { ...sourceBeforeEdit, content: { ...sourceBeforeEdit.content, summary: 'Edited confirmed source after review.' } });
  const stale = await runGetReview(review, generated.applicationId);
  assert.equal(stale.response.status, 200);
  assert.equal(stale.body.data[0].review_status, 'stale');
  assert.equal(stale.body.data[0].status, 'not_applied');
  const staleApproval = await runApprove(review, generated.applicationId, view.review_revision);
  assert.equal(staleApproval.response.status, 409);
  assert.equal(staleApproval.body.code, 'review_stale');

  await fs.promises.writeFile(path.join(artifactDir, 'bindings.json'), JSON.stringify({
    synthetic: true,
    analysisId: analyzed.analysisId,
    applicationId: generated.applicationId,
    sourceResumeId: sourceId,
    sourceHash: analyzed.sourceBinding.sourceHash,
    oraclePostingHash: analyzed.inputBinding.postingHash,
    packetPostingHash,
    postingText: job.jobDescription,
    generatedArtifactId,
    approvedReviewRevision: view.review_revision,
    pdfBytes: pdfBytes.length,
    docxBytes: docxBytes.length,
    limitation: 'The packet has no direct analysisId field. Source hash matches directly; Oracle raw-JD and packet normalized-content hashes use different encodings, so their values differ despite identical posting text.',
  }, null, 2));
});
