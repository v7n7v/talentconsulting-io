/**
 * Reproduces two CURRENT DEFECTS in current route code using local fixtures.
 * Run from the repository root:
 *   node docs/audits/interview-prep-2026/feedback-probe.cjs
 *
 * These assertions intentionally describe incorrect current behavior. Once the
 * defects are fixed, this probe should fail and be replaced by regression tests
 * asserting the corrected contract. No AI provider or database is contacted.
 * esbuild bundles are compiled in memory; this script creates no output files.
 */
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { build } = require('esbuild');

const repoRoot = path.resolve(__dirname, '../../..');

async function loadRoute(entry, mocks) {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [path.join(repoRoot, entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'feedback-audit-local-fixtures',
      setup(builder) {
        for (const id of Object.keys(mocks)) {
          const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          builder.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: id, namespace: 'feedback-audit' }));
        }
        builder.onLoad({ filter: /.*/, namespace: 'feedback-audit' }, ({ path: id }) => ({ contents: mocks[id], loader: 'js' }));
      },
    }],
  });

  const filename = path.join(repoRoot, '__feedback_audit_virtual.cjs');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled._compile(result.outputFiles[0].text, filename);
  return compiled.exports;
}

async function main() {
  const baseMocks = {
    'next/server': 'export class NextResponse extends Response { static json(body, options) { return new Response(JSON.stringify(body), options); } }',
    '@/lib/api-auth': 'export async function guardApiRoute() { return { user: { uid: "feedback-audit-user", tier: "pro" } }; }',
    '@/lib/firebase-admin': 'export function getAdminDb() { return globalThis.__feedbackAuditDB; }',
    '@/lib/monitor': 'export const monitor = { warn() {}, critical() {} };',
  };

  let written;
  const databaseFixture = {
    collection() { return this; },
    doc() { return this; },
    async create(value) { written = value; },
    async set(value) { written = { ...written, ...value }; },
  };
  globalThis.__feedbackAuditDB = databaseFixture;

  const reflectionRoute = await loadRoute('app/api/agent/debriefs/route.ts', {
    ...baseMocks,
    '@/lib/career-twin': 'export async function invalidateTwin() {}',
    '@/lib/story-bank': 'export async function createStoryBankStory() { throw new Error("This probe must never promote reflection into a story"); }',
  });

  for (const overallFeeling of [1, 5]) {
    const response = await reflectionRoute.POST({
      json: async () => ({
        company: 'Fixture Co',
        role: 'Engineer',
        overallFeeling,
        questions: [
          { text: 'Explain a database index', category: 'Interview' },
          { text: 'Tell me about a conflict', category: 'Interview' },
        ],
        idempotencyKey: `feedback-audit-debrief-${overallFeeling}`,
      }),
    });

    assert.equal(response.status, 200, 'Fixture setup: the real reflection route accepted the unrated questions');
    const storedConfidence = written.questions.map(question => question.confidence);
    assert.deepEqual(storedConfidence, [overallFeeling * 20, overallFeeling * 20],
      'CURRENT DEFECT FB-03: overall feeling becomes confidence for every unrated question');
    console.log(JSON.stringify({
      defect: 'FB-03',
      description: 'Mood imputed into unrated answer confidence',
      status: response.status,
      overallFeeling,
      storedConfidence,
    }));
  }

  globalThis.__feedbackAuditGrade = {
    score: 99,
    summary: 'Excellent',
    strengths: [],
    improvements: [],
    answerFeedback: [{ questionIndex: 999, score: 100, feedback: 'Great answer', rewriteTip: 'None' }],
    rubric: [{ label: 'Arbitrary invented dimension', score: 1, note: 'Unanchored' }],
    recommendations: [],
    nextDrills: [],
    storyCandidates: [],
    weakCategories: [],
  };

  const gradeRoute = await loadRoute('app/api/interview/session-grade/route.ts', {
    ...baseMocks,
    '@/lib/practice-session-server': `
      export async function requirePractice() {
        return {
          session: { set: async () => {} },
          data: {
            mode: 'quick_drill',
            evidenceSnapshot: { resume: null, stories: [] },
            rubric: [{ text: 'One actual question' }],
          },
        };
      }
      export async function resolvePracticeEvidence() { return { resume: null, stories: [] }; }
      export function practiceError(error) { return { status: 503, code: error.message }; }
    `,
    '@/lib/ai/groq-client': 'export async function groqJSONCompletion() { return globalThis.__feedbackAuditGrade; }',
  });

  written = undefined;
  const response = await gradeRoute.POST({
    json: async () => ({
      sessionId: 'feedback-audit-session',
      transcript: [
        { role: 'ai', text: 'One actual question' },
        { role: 'user', text: 'One actual answer' },
      ],
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200, 'CURRENT DEFECT FB-02: semantic grading mismatch is accepted');
  assert.equal(payload.success, true, 'CURRENT DEFECT FB-02: semantic mismatch reports success');
  assert.equal(payload.persisted, true, 'CURRENT DEFECT FB-02: semantic mismatch reports persistence');
  assert.equal(payload.grade.answerFeedback[0].questionIndex, 999,
    'CURRENT DEFECT FB-02: feedback references nonexistent Answer 999 in a one-answer session');
  assert.equal(payload.grade.rubric[0].label, 'Arbitrary invented dimension',
    'CURRENT DEFECT FB-02: rubric dimension is not governed by a fixed contract');
  assert.equal(payload.grade.score, 99, 'CURRENT DEFECT FB-02: model total is accepted unchanged');
  assert.equal(payload.grade.rubric[0].score, 1, 'CURRENT DEFECT FB-02: sole rubric score can contradict the accepted total');
  assert.equal(written.scores.answerFeedback[0].questionIndex, 999,
    'CURRENT DEFECT FB-02: semantically invalid feedback reaches the persistence write');
  console.log(JSON.stringify({
    defect: 'FB-02',
    description: 'Invalid question identity and arbitrary inconsistent rubric accepted',
    status: response.status,
    response: payload,
  }));
  console.log('Both current-defect probes reproduced using local fixtures only.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  delete globalThis.__feedbackAuditDB;
  delete globalThis.__feedbackAuditGrade;
});
