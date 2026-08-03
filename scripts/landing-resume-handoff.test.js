const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const JSZip = require('jszip');

const repoRoot = path.join(__dirname, '..');

async function loadHandoff() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-pending-resume-'));
  const outfile = path.join(outdir, 'handoff.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/assistant/pending-resume-handoff.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const handoffModule = loadHandoff();

async function loadParserSafety() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-parser-safety-'));
  const outfile = path.join(outdir, 'safety.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/resume-parser-safety.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const parserSafetyModule = loadParserSafety();

async function loadBinaryWorker() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-parser-worker-'));
  const outfile = path.join(outdir, 'worker.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib/resume-binary-parser-worker.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const binaryWorkerModule = loadBinaryWorker();

function sessionStorage({ failWrites = false } = {}) {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('storage blocked');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    values,
  };
}

function installWindow(storage) {
  global.window = { sessionStorage: storage };
}

test('a valid resume handoff is tab-scoped and consumed exactly once', async () => {
  const { stagePendingSonaResume, readPendingSonaResume, consumePendingSonaResume } = await handoffModule;
  const storage = sessionStorage();
  installWindow(storage);
  const now = 1_700_000_000_000;

  const staged = await stagePendingSonaResume({
    text: 'Senior security engineer with verified NIST and network engineering experience.',
    fileName: 'career-resume.pdf',
    detectedType: 'pdf',
  }, now);
  const retained = readPendingSonaResume(now + 500);

  assert.equal(staged, true);
  assert.equal(retained.fileName, 'career-resume.pdf');
  assert.equal(readPendingSonaResume(now + 750).handoffId, retained.handoffId);
  const consumed = consumePendingSonaResume(now + 1_000);
  assert.equal(consumed.fileName, 'career-resume.pdf');
  assert.match(consumed.handoffId, /^[a-f0-9]{40}$/);
  assert.equal(consumed.sourceType, 'direct');
  assert.equal(consumed.characterCount, consumed.text.length);
  assert.equal(consumePendingSonaResume(now + 2_000), null);
});

test('expired, malformed and unsupported handoffs fail closed and are removed', async () => {
  const { stagePendingSonaResume, consumePendingSonaResume } = await handoffModule;
  const storage = sessionStorage();
  installWindow(storage);
  const now = 1_700_000_000_000;

  assert.equal(await stagePendingSonaResume({ text: 'Too short', fileName: 'resume.pdf', detectedType: 'pdf' }, now), false);
  assert.equal(await stagePendingSonaResume({ text: 'Enough verified resume evidence to parse safely.', fileName: 'resume.exe', detectedType: 'exe' }, now), false);
  assert.equal(await stagePendingSonaResume({ text: 'Enough verified resume evidence to expire safely.', fileName: 'resume.txt', detectedType: 'txt' }, now), true);
  assert.equal(consumePendingSonaResume(now + 31 * 60 * 1_000), null);
  assert.equal(storage.values.size, 0);
});

test('blocked browser storage does not claim the resume is staged', async () => {
  const { stagePendingSonaResume } = await handoffModule;
  installWindow(sessionStorage({ failWrites: true }));

  assert.equal(await stagePendingSonaResume({
    text: 'Enough verified resume evidence for the storage failure path.',
    fileName: 'resume.docx',
    detectedType: 'docx',
  }), false);
});

test('the staged plaintext is deleted when its absolute expiry arrives', async () => {
  const { armPendingSonaResumeExpiry, stagePendingSonaResume } = await handoffModule;
  const storage = sessionStorage();
  installWindow(storage);
  const now = Date.now() - (30 * 60 * 1_000) + 200;

  assert.equal(await stagePendingSonaResume({
    text: 'Enough verified resume evidence for automatic expiry cleanup.',
    fileName: 'resume.txt',
    detectedType: 'txt',
  }, now), true);
  assert.equal(storage.values.size, 1);
  assert.equal(armPendingSonaResumeExpiry(Date.now()), true);
  const deadline = Date.now() + 2_000;
  while (storage.values.size > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(storage.values.size, 0);
});

test('anonymous binary and decompressed document budgets fail closed', async () => {
  const safety = await parserSafetyModule;
  assert.throws(
    () => safety.assertAnonymousBinaryBudget(safety.MAX_ANONYMOUS_BINARY_BYTES + 1, 'pdf'),
    error => error.code === 'AUTH_REQUIRED',
  );
  assert.throws(
    () => safety.assertAnonymousBinaryBudget(100, 'doc'),
    error => error.code === 'AUTH_REQUIRED',
  );
  assert.throws(
    () => safety.assertPdfPageBudget(safety.MAX_PDF_PAGES + 1),
    error => error.code === 'PARSE_FAILED',
  );

  const archive = new JSZip();
  archive.file('word/document.xml', 'x'.repeat(safety.MAX_DOCX_UNCOMPRESSED_BYTES + 1));
  const compressed = await archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(
    safety.assertDocxResourceBudget(compressed),
    error => error.code === 'PARSE_FAILED',
  );

  const worker = await binaryWorkerModule;
  await assert.rejects(
    worker.parseResumeBinaryInWorker({
      buffer: compressed,
      type: 'docx',
      timeoutMs: 2_000,
      maxExtractedChars: 50_000,
    }),
    error => error.code === 'PARSE_FAILED',
  );
});

/* The staging half of this handoff lived in components/dashboard/UnifiedDashboard.tsx,
   which had no importers and was deleted. app/page.tsx renders TalentLanding, which has
   no upload UI, so nothing stages a resume today - the assertions against `landing` were
   covering a component that never rendered. The consuming half below is still live and
   still worth asserting. Restore the staging assertions when the new landing gains an
   upload entry point. */
test('landing and Taco integration preserve the selected resume across authentication', () => {
  const agent = fs.readFileSync(path.join(repoRoot, 'app/suite/agent/page.tsx'), 'utf8');
  const authModal = fs.readFileSync(path.join(repoRoot, 'components/modals/AuthModal.tsx'), 'utf8');
  const parser = fs.readFileSync(path.join(repoRoot, 'app/api/gauntlet/parse-resume/route.ts'), 'utf8');
  const structureParser = fs.readFileSync(path.join(repoRoot, 'app/api/resume/parse/route.ts'), 'utf8');
  const clientProviders = fs.readFileSync(path.join(repoRoot, 'components/ClientProviders.tsx'), 'utf8');
  const firebaseAuth = fs.readFileSync(path.join(repoRoot, 'lib/firebase.ts'), 'utf8');
  const authRedirect = fs.readFileSync(path.join(repoRoot, 'lib/auth-redirect.ts'), 'utf8');
  const database = fs.readFileSync(path.join(repoRoot, 'lib/database-suite.ts'), 'utf8');
  const binaryWorker = fs.readFileSync(path.join(repoRoot, 'lib/resume-binary-parser-worker.ts'), 'utf8');
  const stagingCompose = fs.readFileSync(path.join(repoRoot, 'deploy/staging/docker-compose.yml'), 'utf8');

  assert.match(agent, /readPendingSonaResume\(\)/);
  assert.match(agent, /clearPendingSonaResume\(\)/);
  assert.match(agent, /Retry saved resume/);
  assert.match(agent, /Your resume is still staged in this tab/);
  assert.match(agent, /landing_resume_handoff/);
  assert.match(agent, /processExtractedResume\(pending/);
  assert.match(agent, /params\.delete\('pendingResume'\)/);
  assert.match(authModal, /Resume ready\. Create your account/);
  assert.match(authModal, /Taco will save this resume, then open your target brief/);
  assert.match(authModal, /role="dialog"/);
  assert.match(authModal, /aria-modal="true"/);
  assert.match(authModal, /aria-labelledby=\{titleId\}/);
  assert.match(authModal, /assistantResumeAuthAbandoned/);
  assert.match(authModal, /NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'false'/);
  assert.match(authModal, /\{googleAuthEnabled && \(/);
  assert.match(stagingCompose, /NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false"/);
  assert.match(clientProviders, /completeGoogleRedirectOnce/);
  assert.match(firebaseAuth, /signInWithPopup\(auth, googleProvider\)/);
  assert.match(firebaseAuth, /canUseSameOriginAuthRedirect\(firebaseConfig\.authDomain, hostname\)/);
  assert.match(authRedirect, /export function isSafeLocalPath/);
  assert.match(clientProviders, /armPendingSonaResumeExpiry/);
  assert.match(database, /handoff_\$\{idempotencyKey\}/);
  assert.match(agent, /idempotencyKey: upload\.handoffId/);
  assert.match(parser, /allowAnonymous: true/);
  assert.match(parser, /isAnon && file\.size > MAX_DIRECT_FILE_SIZE/);
  assert.match(parser, /assertAnonymousBinaryBudget/);
  assert.match(parser, /downloadStorageFileWithLimit/);
  assert.match(structureParser, /SERVICE_NOT_CONFIGURED/);
  assert.match(structureParser, /No resume data was saved or changed/);
  assert.match(parser, /req\.headers\.get\('content-length'\)/);
  assert.match(parser, /contentLength > maxRequestBytes/);
  assert.ok(parser.indexOf("req.headers.get('content-length')") < parser.indexOf('await req.formData()'));
  assert.match(parser, /\.getMetadata\(\)/);
  assert.match(parser, /\.createReadStream\(\{ start: 0, end: maxBytes \}\)/);
  assert.doesNotMatch(parser, /storageFile\.download\(/);
  assert.match(parser, /parseResumeBinaryInWorker/);
  assert.doesNotMatch(parser, /await import\('pdf-parse'\)|await import\('mammoth'\)/);
  assert.match(binaryWorker, /resourceLimits/);
  assert.match(binaryWorker, /worker\.terminate\(\)/);
  assert.match(binaryWorker, /maxOldGenerationSizeMb/);
  assert.doesNotMatch(parser, /collection\(|\.add\(|\.set\(/);
});
