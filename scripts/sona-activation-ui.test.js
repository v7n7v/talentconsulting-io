const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(repoRoot, 'app', 'suite', 'agent', 'page.tsx'), 'utf8');
const panel = fs.readFileSync(path.join(repoRoot, 'components', 'sona', 'SonaActivationProofPanel.tsx'), 'utf8');
const tools = fs.readFileSync(path.join(repoRoot, 'lib', 'assistant', 'tools.ts'), 'utf8');
const chatRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'chat', 'route.ts'), 'utf8');
const harnessRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'harness', 'route.ts'), 'utf8');
const preflightRoute = fs.readFileSync(path.join(repoRoot, 'app', 'api', 'agent', 'harness', 'preflight', 'route.ts'), 'utf8');

async function loadMobileActivationState() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-mobile-activation-'));
  const outfile = path.join(outdir, 'mobile-activation.cjs');
  await build({
    entryPoints: [path.join(repoRoot, 'lib', 'assistant', 'mobile-activation-state.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const mobileActivationState = loadMobileActivationState();

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test('target submission runs read-only preflight instead of the mutating harness', () => {
  const submit = section(page, 'const submitTargetBrief', 'const useExampleTarget');
  assert.match(submit, /runActivationPreflight\(/);
  assert.match(submit, /source:\s*["']target_brief["']/);
  assert.doesNotMatch(submit, /sendMessage\(/);
  assert.match(page, /authFetch\(\s*["']\/api\/agent\/harness\/preflight["']/);
});

test('confirmed uploads run read-only preflight before the scout launch', () => {
  const sharedUpload = section(page, 'const processExtractedResume', 'const confirmResumeIntake');
  const confirmedUpload = section(page, 'const confirmResumeIntake', 'const handleResumeUpload');
  const uploadEntrypoints = section(page, 'const handleResumeUpload', 'const pConfig');
  assert.match(sharedUpload, /setPendingResumeIntake\(/);
  assert.match(sharedUpload, /setResumeUploadStage\(\s*["']review["']\s*\)/);
  assert.doesNotMatch(sharedUpload, /saveResumeVersion\(|runActivationPreflight\(/);
  assert.doesNotMatch(sharedUpload, /sendMessage\(/);
  assert.match(confirmedUpload, /runActivationPreflight\(/);
  assert.match(confirmedUpload, /source:\s*["']resume_upload["']/);
  assert.match(confirmedUpload, /resumeVersionId:\s*saved\.data\.id/);
  assert.doesNotMatch(confirmedUpload, /sendMessage\(/);
  const saveAt = confirmedUpload.indexOf('saveResumeVersion(');
  const preflightAt = confirmedUpload.indexOf('runActivationPreflight(');
  assert.ok(saveAt >= 0 && preflightAt > saveAt, 'bind preflight to the confirmed, saved resume');
  assert.match(panel, /No scout quota is used/);
  assert.match(uploadEntrypoints, /processExtractedResume\(\s*upload,\s*["']sona_agent_upload["'],\s*requestId,?\s*\)/);
  assert.match(uploadEntrypoints, /processExtractedResume\(\s*pending,\s*["']landing_resume_handoff["'],\s*requestId,?\s*\)/);
});

test('resume source prompt mode is stable across intent, selection and desktop boundaries', async () => {
  const { resolveResumeSourcePromptMode } = await mobileActivationState;
  assert.equal(resolveResumeSourcePromptMode({ intentRequested: true, activeResumeId: null, uploadReady: false }), 'all');
  assert.equal(resolveResumeSourcePromptMode({ intentRequested: false, activeResumeId: null, uploadReady: false }), 'mobile');
  assert.equal(resolveResumeSourcePromptMode({ intentRequested: true, activeResumeId: 'resume-1', uploadReady: false }), 'none');
  assert.equal(resolveResumeSourcePromptMode({ intentRequested: true, activeResumeId: null, uploadReady: true }), 'none');
  assert.match(page, /const searchParams = useSearchParams\(\)/);
  assert.match(page, /\{shouldShowResumeSourcePrompt && \(/);
  assert.ok(page.indexOf('{shouldShowResumeSourcePrompt && (') < page.indexOf('id="sona-target-brief"'));
  assert.match(page, /resumeSourcePromptMode\s*===\s*["']mobile["']\s*\?\s*["']lg:hidden["']/);
  assert.match(page, /showResumeUploadIntent\s*\?\s*suggestedPrompts\.filter\(\(prompt\)\s*=>\s*prompt\.action\s*!==\s*["']resumeUpload["']\)/);
  assert.match(page, /p\.action\s*===\s*["']resumeUpload["']\s*&&\s*resumeSourcePromptMode\s*===\s*["']mobile["']\s*\?\s*["']hidden lg:flex["']/);
  assert.match(page, /resumeSourcePromptMode\s*===\s*["']mobile["']\s*\?\s*["']hidden lg:inline-flex["']/);
});

test('only the named launch action starts the harness and degraded proof stays scout-only', () => {
  const launch = section(page, 'const launchActivationProof', 'const editActivationTarget');
  assert.match(launch, /activationProofState\.result\.canScout/);
  assert.match(launch, /mode:\s*["']scout["']/);
  assert.match(launch, /notify:\s*false/);
  assert.match(launch, /resumeVersionId:\s*proof\.resume\.id/);
  assert.match(launch, /targetRole:\s*proof\.target\.role/);
  assert.match(launch, /proof\.resume\.id !== intent\.resumeVersionId/);
  assert.match(launch, /sendMessage\(/);
  assert.match(launch, /analytics\.assistantPacketPromptStarted/);
});

test('free-form model tools cannot bypass the visible preflight confirmation', () => {
  const harnessTool = section(tools, "case 'run_career_goal_harness'", "case 'scan_company_portal'");
  assert.match(harnessTool, /context\.activationConfirmed !== true/);
  assert.match(harnessTool, /PREFLIGHT_REQUIRED/);
  assert.match(harnessTool, /No scout quota, queue item, packet, notification, or external application was created/);
});

test('a failed signed launch respects typed pre-consumption recovery and otherwise requires a fresh preview', () => {
  assert.match(page, /options\?\.harnessRequest\?\.activationReceipt/);
  assert.match(page, /activationPreviewConsumedRecovery\(\)/);
  assert.match(page, /err\?\.recovery\s*\|\|\s*\(\s*options\?\.harnessRequest\?\.activationReceipt/);
  assert.match(page, /error\.requiresFreshPreflight = data\.requiresFreshPreflight/);
  assert.match(page, /recovery\.action\s*===\s*["']retry["']/);
  assert.match(chatRoute, /const recovery = activationPreviewConsumedRecovery\(\)/);
});

test('mutating chat and harness routes verify and consume the signed receipt', () => {
  for (const route of [chatRoute, harnessRoute]) {
    assert.match(route, /verifySonaActivationReceipt/);
    assert.match(route, /consumeSonaActivationReceipt/);
    assert.match(route, /buildReceiptBoundHarnessInput/);
    assert.ok(route.indexOf('verifySonaActivationReceipt') < route.lastIndexOf('runSonaAgentHarness'));
    assert.ok(route.indexOf('consumeSonaActivationReceipt') < route.lastIndexOf('runSonaAgentHarness'));
    const handler = route.slice(route.indexOf('export async function POST'));
    assert.match(handler, /if \(!isGroqConfigured\(\)\)/);
    assert.match(handler, /requiresFreshPreflight:\s*false/);
    assert.ok(handler.indexOf('if (!isGroqConfigured())') < handler.indexOf('consumeSonaActivationReceipt'));
  }
  assert.match(preflightRoute, /createSonaActivationReceipt/);
  assert.match(preflightRoute, /result\.generation\.preparationReady/);
  assert.match(page, /activationReceipt:\s*receiptToken/);
});

test('proof UI exposes top-three evidence and the no-side-effect receipt on mobile', () => {
  assert.match(panel, /result\.topPicks\.slice\(0, 3\)/);
  assert.match(panel, /Why it ranks/);
  assert.match(panel, /Source and risk/);
  assert.match(panel, /No quota used, packet created, notification sent, or application submitted/);
  assert.match(panel, /Start Taco scout/);
  assert.match(panel, /Packet generation configured/);
  assert.match(panel, /Scout only · packet AI offline/);
  assert.match(panel, /(?:Taco|<TacoName\s*\/>)\s+launch unavailable/);
  assert.match(panel, /launchBlockedByGeneration = generationUnavailable && result\.topPicks\.length > 0/);
  assert.match(panel, /launchBlockedByGeneration \? onEditTarget : onRetry/);
  assert.match(panel, /launchBlockedByGeneration \? 'Edit target' : 'Retry preview'/);
  assert.match(panel, /sm:grid-cols-2 lg:grid-cols-4/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /min-h-11/);
});

test('editing the target or selected resume invalidates stale proof', () => {
  assert.match(page, /onSelect=\{\(rv: ResumeVersion\) => \{\s*invalidateActivationProof\(\)/);
  assert.match(page, /onChange=\{\(event\) => \{\s*invalidateActivationProof\(\);\s*setTargetRole/);
  assert.match(page, /onClick=\{\(\) => \{\s*invalidateActivationProof\(\);\s*setTargetWorkMode/);
  assert.match(page, /const loadConversation[\s\S]*?invalidateActivationProof\(\)/);
  assert.match(page, /activationProofAbortRef\.current\?\.abort\(\)/);
  const upload = section(page, 'const handleResumeUpload', 'const pConfig');
  const invalidateAt = upload.indexOf('invalidateActivationProof();');
  const extractionAt = upload.search(/setResumeUploadStage\(\s*["']extracting["']\s*\)/);
  assert.ok(invalidateAt >= 0 && extractionAt > invalidateAt, 'invalidate the proof before resume extraction begins');
  assert.match(page, /launching=\{loading \|\| isResumeUploadBusy\}/);
});
