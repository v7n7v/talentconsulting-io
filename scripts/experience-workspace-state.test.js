const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync, buildSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../app/suite/resume/page.tsx'), 'utf8');
const recoveryBundle = buildSync({ entryPoints: [path.join(__dirname, '../lib/resume-tracking-recovery.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const recoveryModule = { exports: {} };
new Function('module', 'exports', recoveryBundle.outputFiles[0].text)(recoveryModule, recoveryModule.exports);
const { resumeTrackingDraftKey, stableResumeTrackingKey, readResumeTrackingRecovery } = recoveryModule.exports;
const ledgerBundle = buildSync({ entryPoints: [path.join(__dirname, '../lib/resume-review-ledger.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const ledgerModule = { exports: {} };
new Function('module', 'exports', ledgerBundle.outputFiles[0].text)(ledgerModule, ledgerModule.exports);
const { deriveResumeReviewLedger } = ledgerModule.exports;
const workflowBundle = buildSync({ entryPoints: [path.join(__dirname, '../lib/resume-workflow.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const workflowModule = { exports: {} };
new Function('module', 'exports', workflowBundle.outputFiles[0].text)(workflowModule, workflowModule.exports);
const { generationNeedsRegeneration, retainPreviousGeneration, restoreResumeGeneration, resumeGenerationKey } = workflowModule.exports;
function appliedGeneration(id, name, jobDescription) {
  const source = { name, title: `${name} role`, email: `${name.toLowerCase()}@example.com`, phone: '555-0100', location: 'Boston', summary: `${name} source`, experience: [], education: [], skills: [], certifications: [] };
  return { schemaVersion: 2, id, createdAt: '2026-10-07T00:00:00Z', inputs: { source, jobDescription, role: `${name} role`, company: `${name} Co`, postingUrl: `${name.toLowerCase()}.url`, percentage: 62, targetPageCount: 1, unlocked100: false }, effectivePercentage: 62, candidate: { ...source, summary: `${name} candidate` }, review: { version: 1, decisions: { [`${id}-change`]: 'accepted' }, selectedId: `${id}-change`, view: 'focused', documentTab: 'source' }, score: 84, proof: { score: 84 }, guardrailReport: { effectiveMorphPercentage: 62 }, presentation: { templateId: 'plain', paletteId: 'ink', pageSize: 'LETTER' } };
}
function extract(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing handler ${startMarker}`);
  let cursor = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (quote) { if (char === quote && source[cursor - 1] !== '\\') quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) { cursor++; break; }
  }
  return source.slice(start, cursor).replace(/^\s*const \w+ = (async )?\(/, (_match, asyncPrefix = '') => `return ${asyncPrefix}(`);
}
function setter(state, key) { const target = key.startsWith('set') ? key.slice(3, 4).toLowerCase() + key.slice(4) : key; return value => { state[target] = value; }; }

test('opening saved A then B and reopening A restores each applied generation independently', () => {
  const handler = extract("  const loadVersionToMorph = (version: ResumeVersion, goal: 'edit' | 'tailor' = 'edit') => {", '\n  const generateAchievements');
  const roleSearchInvalidations = [];
  const state = {
    tierLoading: false, isPro: true, canUseTemplatePalettes: true, searchParams: { get: () => null },
    sourceAbortRef: { current: null }, sourceUploadOperationRef: { current: null }, sourceParseRequestRef: { current: 0 }, morphRequestRef: { current: 0 }, morphAbortRef: { current: null }, activeGeneration: null, selectedAppliedVersionId: null, previousGenerations: [],
    readWorkspaceVersion: version => version.id === 'A' ? { candidate: { name: 'A', title: 'A role' }, name: 'A document', origin: 'tailored', target: { role: 'A role', company: 'A Co', jobDescription: 'A JD', url: 'a.url' }, sourceSnapshot: { content: { name: 'A' } }, presentation: {} } : { candidate: { name: 'B', title: 'B role' }, name: 'B document', origin: 'user_authored', target: { role: 'B role', company: 'B Co', jobDescription: '', url: '' }, sourceSnapshot: { content: { name: 'B' } }, presentation: {} },
    recoverAppliedGeneration: metadata => metadata?.activeGeneration || null, invalidateRoleSearchSource: () => roleSearchInvalidations.push('invalidated'), maxMorphPercentage: 100, setDesignConfig: setter(this, 'designConfig'), getPersistedResumeDesign: () => ({ spacing: 'compact' }),
    normalizeResume: value => value, maxMorphPercentage: 100, showToast() {}, setPdfExportMode: setter(this, 'pdfExportMode'), setMorphPercentage: setter(this, 'morphPercentage'), setActiveGeneration: setter(this, 'activeGeneration'), setSelectedAppliedVersionId: setter(this, 'selectedAppliedVersionId'), setPreviousGenerations: setter(this, 'previousGenerations'), setBuildResume: setter(this, 'buildResume'), setMorphedResume: setter(this, 'morphedResume'), setOriginalResume: setter(this, 'originalResume'), setWorkspaceSource: setter(this, 'workspaceSource'), setDocumentVersionId: setter(this, 'documentVersionId'), setDocumentName: setter(this, 'documentName'), setDocumentOrigin: setter(this, 'documentOrigin'), setDocumentManualEdits: setter(this, 'documentManualEdits'), setJobDescription: setter(this, 'jobDescription'), setPostingUrl: setter(this, 'postingUrl'), setApplicationData: setter(this, 'applicationData'), setSaveCompanyName: setter(this, 'saveCompanyName'), setSaveVersionName: setter(this, 'saveVersionName'), setTargetPageCount: setter(this, 'targetPageCount'), sanitizeResumeReviewState: value => value, setResumeReview: setter(this, 'resumeReview'), setMatchScore: setter(this, 'matchScore'), setProofData: setter(this, 'proofData'), setGuardrailReport: setter(this, 'guardrailReport'), setResumeCheckResult: setter(this, 'resumeCheckResult'), setBlueprintContent: setter(this, 'blueprintContent'), setShowBlueprintModal: setter(this, 'showBlueprintModal'), setIsBlueprintLoading: setter(this, 'isBlueprintLoading'), setIsLoading: setter(this, 'isLoading'), setProcessingStage: setter(this, 'processingStage'), setShowSourceConfirmation: setter(this, 'showSourceConfirmation'), setIntakeError: setter(this, 'intakeError'), setShowApplicationModal: setter(this, 'showApplicationModal'), setShowSaveModal: setter(this, 'showSaveModal'), setSaveInlineStatus: setter(this, 'saveInlineStatus'), setTrackingError: setter(this, 'trackingError'), setRawSourceText: setter(this, 'rawSourceText'), setIntakeWarnings: setter(this, 'intakeWarnings'), setSourceResumeMeta: setter(this, 'sourceResumeMeta'), setWorkspaceDestination: setter(this, 'workspaceDestination'), setMode: setter(this, 'mode'), setStep: setter(this, 'step'), setResumeReturn: setter(this, 'resumeReturn'), setEditorEpoch: fn => { state.editorEpoch = (state.editorEpoch || 0) + 1; }, getPersistedResumeTemplateId: () => 'plain', resolveReplacementTemplate: id => ({ id }), resolveEntitledReplacementTemplate: id => ({ id }), setRequestedLockedTemplateId: setter(this, 'requestedLockedTemplateId'), setTemplateFilter: setter(this, 'templateFilter'), getTemplatePalette: () => ({ id: 'ink' }), getPersistedResumePaletteId: () => 'ink', getDefaultPaletteId: () => 'ink', setSelectedTemplate: setter(this, 'selectedTemplate'), setSelectedPaletteId: setter(this, 'selectedPaletteId'), setTemplatePaletteSelections: setter(this, 'templatePaletteSelections'),
  };
  state.setPageSize = setter(state, 'setPageSize');
  state.resolveSelectableTemplateDeepLinkId = id => id;
  state.deriveResumeReviewLedger = deriveResumeReviewLedger;
  for (const key of Object.keys(state)) if (key.startsWith('set')) state[key] = setter(state, key);
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${handler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  const fn = new Function('state', body)(state);
  assert.equal(typeof fn, 'function');
  const generationA = appliedGeneration('Agen', 'A', 'A JD');
  fn({ id: 'A', metadata: { resumeReview: generationA.review, activeGeneration: generationA } });
  assert.equal(roleSearchInvalidations.length, 1, 'opening a saved document invalidates any pending role-source handoff');
  assert.equal(state.activeGeneration.id, 'Agen');
  assert.equal(state.selectedAppliedVersionId, 'Agen');
  assert.equal(state.morphedResume.summary, 'A candidate');
  assert.equal(state.jobDescription, 'A JD');
  assert.equal(state.morphPercentage, 62);
  fn({ id: 'B', metadata: { resumeReview: { decisions: {} } } });
  assert.equal(roleSearchInvalidations.length, 2, 'switching to another document invalidates the previous handoff');
  assert.equal(state.documentVersionId, 'B');
  assert.equal(state.selectedAppliedVersionId, null, 'opening B clears A’s explicit selection');
  assert.equal(state.documentName, 'B document');
  assert.equal(state.jobDescription, '');
  assert.equal(state.postingUrl, '');
  assert.equal(state.proofData, null);
  assert.equal(state.guardrailReport, null);
  assert.deepEqual(state.originalResume, { name: 'B' });
  assert.deepEqual(state.workspaceSource, { content: { name: 'B' } });
  assert.equal(state.mode, 'create');
  assert.equal(state.step, 'content');
  fn({ id: 'A', metadata: { resumeReview: generationA.review, activeGeneration: generationA } });
  assert.equal(roleSearchInvalidations.length, 3, 'reopening a prior document invalidates the current handoff');
  assert.equal(state.activeGeneration.id, 'Agen', 'reopening A restores A’s applied generation snapshot');
  assert.equal(state.selectedAppliedVersionId, 'Agen');
  assert.equal(state.morphedResume.summary, 'A candidate');
  assert.equal(state.jobDescription, 'A JD');
  assert.equal(state.mode, 'morph');
  assert.equal(state.step, 'enhance');
});

test('source staging is kept local until explicit confirmation and document saves carry origin metadata', () => {
  assert.match(source, /Staging is local\. Only confirmation publishes this exact corrected source/);
  assert.match(source, /savedFrom: 'experience_confirmed'/);
  assert.match(source, /Existing resumes are unchanged/);
  assert.match(source, /documentOrigin === 'tailored' \? 'resume_studio_tailored' : 'resume_studio_document'/);
});

test('handleFileExtracted stages a parsed source without replacing the active document', async () => {
  const handler = extract('  const handleFileExtracted = async (text: string) => {');
  assert.match(handler, /parseResumeWithAI/);
  assert.ok(handler.length > 1000, String(handler.length));
  const calls = [];
  const state = {
    user: { uid: 'alice' }, sourceAbortRef: { current: null }, sourceParseRequestRef: { current: 0 }, sourceParseMountedRef: { current: true },
    originalResume: { name: 'Existing' }, morphedResume: { name: 'Tailored' },
    useStore: { getState: () => ({ user: { uid: 'alice' } }) },
    isCurrentSourceParse: () => true,
    parseResumeWithAI: async (text, signal) => { calls.push(['parse', text, signal.aborted]); return { resume: { name: 'Imported' }, warnings: ['review'] }; },
    setIsLoading: value => calls.push(['loading', value]), setInvalidDocumentError: value => calls.push(['invalid', value]), setIntakeError: value => { state.intakeError = value; }, setRawSourceText: value => calls.push(['raw', value]), setIntakeWarnings: value => calls.push(['warnings', value]), setIntakeAcknowledged: value => calls.push(['ack', value]), setProcessingStage: value => calls.push(['stage', value]), setIntakeResume: value => calls.push(['intake', value]), setIntakeRoleSearchOrigin: value => calls.push(['origin', value]), setShowSourceConfirmation: value => calls.push(['confirm', value]), setStep: value => calls.push(['step', value]), setShowImport: value => calls.push(['import', value]), showToast: () => {},
  };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${handler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  const fn = new Function('state', body)(state);
  assert.equal(typeof fn, 'function');
  await fn('Imported source');
  assert.ok(calls.length > 0, `no handler calls: ${JSON.stringify(calls)}`);
  assert.equal(state.intakeError, '');
  assert.deepEqual(calls.find(call => call[0] === 'intake'), ['intake', { name: 'Imported' }]);
  assert.deepEqual(calls.find(call => call[0] === 'origin'), ['origin', 'user_upload']);
  assert.equal(calls.some(call => call[0] === 'confirm' && call[1] === true), true);
  assert.deepEqual(state.originalResume, { name: 'Existing' });
  assert.deepEqual(state.morphedResume, { name: 'Tailored' });
});

test('experience confirmation retries reuse the same receipt and idempotency key', async () => {
  const handler = extract('  const saveExperienceRevision = async (value: CanonicalResume, origin:');
  const calls = []; let saveAttempts = 0; const session = new Map();
  const state = {
    experienceSaveBusy: { current: false }, experienceSaving: false, experienceStatus: '', experienceConfirmationRef: { current: null },
    sourceParseRequestRef: { current: 0 }, sourceParseMountedRef: { current: true }, user: { uid: 'alice' }, experienceVersionId: 'old', useStore: { getState: () => ({ user: { uid: 'alice' } }) }, isCurrentSourceParse: () => true,
    normalizeResume: value => value, hasResumeData: value => Boolean(value.name), stableWorkspaceContentHash: async () => 'hash', stableResumeTrackingKey: () => 'tracking-input', resumeTrackingIdempotencyKey: async () => 'stable-key',
    saveResumeVersion: async (...args) => { calls.push(args); saveAttempts += 1; return saveAttempts === 1 ? { success: false, error: 'temporary' } : { success: true, data: { id: 'new' } }; },
    createWorkspaceMetadata: value => value, mergeApplicationKitContext: () => {}, resumeSnapshotToText: () => '', loadVersions: () => {}, sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value) },
    setExperienceSaving: value => { state.experienceSaving = value; }, setExperienceStatus: value => { state.experienceStatus = value; }, setExperienceVersionId: value => { state.experienceVersionId = value; }, setExperienceDraft: value => { state.experienceDraft = value; }, setExperienceDirty: value => { state.experienceDirty = value; },
  };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${handler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  const fn = new Function('state', body)(state); const value = { name: 'Amina', title: 'Engineer', additionalSections: [] };
  const first = await fn(value, 'user_upload'); const firstReceipt = state.experienceConfirmationRef.current;
  assert.equal(first, null, state.experienceStatus); assert.equal(saveAttempts, 1); assert.equal(calls.length, 1);
  const second = await fn(value, 'user_upload');
  assert.equal(saveAttempts, 2, state.experienceStatus); assert.equal(calls.length, 2);
  assert.equal(calls[0][5].idempotencyKey, calls[1][5].idempotencyKey);
  assert.equal(calls[0][4].workspace.sourceConfirmedAt, firstReceipt.confirmedAt); assert.equal(calls[1][4].workspace.sourceConfirmedAt, firstReceipt.confirmedAt);
});

test('general resume design path does not require a job description', () => {
  const handler = extract('  const designDocument = () => {', '\n  const tailorDocument');
  const state = { buildResume: { name: 'Amina', title: 'Engineer', experience: [{ company: 'Northstar', role: 'Engineer' }], additionalSections: [] }, hasResumeData: value => Boolean(value.name), normalizeResume: value => value, setMorphedResume: value => { state.morphedResume = value; }, setMode: value => { state.mode = value; }, setStep: value => { state.step = value; }, documentManualEdits: true, documentOrigin: 'user_authored', DEFAULT_RESUME_REVIEW_STATE: { decisions: {} }, setOriginalResume: value => { state.originalResume = value; }, setDocumentOrigin: value => { state.documentOrigin = value; }, setResumeReview: value => { state.resumeReview = value; }, setMatchScore: () => {}, setProofData: () => {}, setGuardrailReport: () => {}, showToast() {} };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`, { loader: 'ts', target: 'es2022' }).code;
  new Function('state', body)(state)();
  assert.equal(state.mode, 'morph');
  assert.equal(state.step, 'template');
  assert.deepEqual(state.originalResume, state.buildResume, 'manual edits stay the source when returning to Tailor');
});

test('late morph completion clears loading for the owning request without committing stale data', () => {
  assert.match(source, /finally \{\s*clearTimeout\(timeout\);\s*if \(ownsRequest\(\)\) setIsLoading\(false\);\s*\}/);
  assert.match(source, /if \(!isCurrent\(\)\) return;/);
});

test('morph transport sends pinned target context and maps its response', async () => {
  const start = source.indexOf('const morphResumeToJD = async ');
  const arrow = source.indexOf('=> {', start);
  assert.ok(start >= 0 && arrow > start, 'morph transport helper is present');
  const open = arrow + 3;
  let depth = 0; let cursor = open; let quote = null;
  for (; cursor < source.length; cursor++) {
    const char = source[cursor];
    if (quote) { if (char === quote && source[cursor - 1] !== '\\') quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) { cursor++; break; }
  }
  const handlerBody = source.slice(open + 1, cursor - 1);
  const calls = [];
  const state = {
    authFetch: async (...args) => { calls.push(args); return { ok: true, json: async () => ({ morphedResume: { name: 'Rae' }, matchScore: 91, proof: { score: 91 }, guardrailReport: { locked: true }, effectiveMorphPercentage: 83 }) }; },
    setShowDownloadAuth() {},
  };
  const executable = transformSync(`const {authFetch,setShowDownloadAuth}=state; return async (resume,jd,percentage,pageCount,signal,target)=>{${handlerBody}};`, { loader: 'ts', target: 'es2022' }).code;
  const request = new Function('state', executable)(state);
  const resume = { name: 'Rae', summary: 'Source facts' };
  const controller = new AbortController();
  const result = await request(resume, 'Pinned job description', 83, 2, controller.signal, { role: 'Pinned role', company: 'Pinned company' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/resume/morph');
  assert.equal(calls[0][1].signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[0][1].body), { resume, jobDescription: 'Pinned job description', morphPercentage: 83, targetPageCount: 2, targetRole: 'Pinned role', targetCompany: 'Pinned company' });
  assert.deepEqual(result, { morphed: { name: 'Rae' }, score: 91, proof: { score: 91 }, guardrailReport: { locked: true }, effectiveMorphPercentage: 83 });
});

test('new tracking identity fields prevent reuse across document presentation or provenance changes', () => {
  const base = { originalResume: { name: 'Amina' }, buildResume: { name: 'Amina' }, selectedTemplateId: 'plain', selectedPaletteId: 'ink', mode: 'create', resumeReview: {} };
  const first = resumeTrackingDraftKey({ ...base, pageSize: 'A4', targetPageCount: 'auto', workspaceSource: { contentHash: 'a' }, documentVersionId: 'doc-a', documentName: 'A', documentOrigin: 'user_authored', documentManualEdits: false, proofData: null, guardrailReport: null });
  const changed = resumeTrackingDraftKey({ ...base, pageSize: 'Letter', targetPageCount: 'auto', workspaceSource: { contentHash: 'a' }, documentVersionId: 'doc-a', documentName: 'A', documentOrigin: 'user_authored', documentManualEdits: false, proofData: null, guardrailReport: null });
  assert.notEqual(first, changed);
  assert.match(source, /trackingKey = stableResumeTrackingKey\(\[resume, versionName, saveCompanyName, jobDescription, postingUrl, selectedTemplate\.id, activePaletteId, resumeReview, pageSize, targetPageCount, documentVersionId, workspaceSource, buildResumeVersionMetadata\(\)\]\)/);
});

test('old v1 recovery receipts remain readable when they have no extended identity fields', () => {
  const ownerId = 'alice';
  const draft = { originalResume: { name: 'Amina' }, buildResume: { name: 'Amina' }, selectedTemplateId: 'plain', selectedPaletteId: 'ink', mode: 'create', resumeReview: {} };
  const key = stableResumeTrackingKey(['originalResume', 'morphedResume', 'buildResume', 'jobDescription', 'postingUrl', 'morphPercentage', 'selectedTemplateId', 'selectedPaletteId', 'mode', 'resumeReview'].map(name => draft[name] ?? null));
  const receipt = { schemaVersion: 1, ownerId, inputKey: 'input', draftKey: key, idempotencyKey: 'a'.repeat(40), company: 'Target', versionName: 'A', draft, version: null };
  const storage = { getItem: () => JSON.stringify(receipt) };
  assert.ok(readResumeTrackingRecovery(storage, ownerId));
});

test('reviewed import continues directly to design with corrected content, retained source and no career publication', async () => {
  const handler = extract("  const confirmImportedSource = async (nextStep:");
  const calls = [];
  const corrected = { name: 'Amina', title: 'Engineer', additionalSections: [{ id: 'projects', title: 'Projects', items: ['Built a source-preserving editor.'] }] };
  const state = {
    intakeResume: corrected, intakeWarnings: ['Compare extracted details'], intakeAcknowledged: true, originalResume: null, rawSourceText: 'source text',
    workspaceDestination: 'resumes', alsoSaveExperience: false, user: { uid: 'alice' },
    sourceParseRequestRef: { current: 2 }, sourceParseMountedRef: { current: true },
    useStore: { getState: () => ({ user: { uid: 'alice' } }) },
    normalizeResume: value => value, stableWorkspaceContentHash: async value => { assert.equal(value, corrected); return 'corrected-hash'; },
    hasResumeData: value => Boolean(value?.name), invalidateTailoredResult() {},
    isCurrentSourceParse: (request, current, owner, currentOwner, mounted) => request === current && owner === currentOwner && mounted,
    saveExperienceRevision: async () => { throw new Error('Career publication was not chosen'); },
    startDocument: (value, source) => calls.push(['start', value, source]),
    beginJobTailoring: (value, name) => calls.push(['tailor', value, name]),
    setDocumentOrigin: value => calls.push(['origin', value]), setMorphedResume: value => calls.push(['candidate', value]), setOriginalResume: value => calls.push(['source', value]), setBuildResume: value => calls.push(['build', value]), setWorkspaceSource: value => calls.push(['workspace', value]),
    setMode: value => calls.push(['mode', value]), setStep: value => calls.push(['step', value]),
    setExperienceSaving: value => calls.push(['busy', value]), setExperienceStatus: value => calls.push(['error', value]),
    setShowSourceConfirmation() {}, setShowImport() {}, setWorkspaceDestination() {},
  };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`, { loader: 'ts', target: 'es2022' }).code;
  const fn = new Function('state', body)(state);
  await fn('design');
  const start = calls.find(call => call[0] === 'start');
  assert.equal(start[1], corrected);
  assert.equal(start[2].content, corrected);
  assert.equal(start[2].contentHash, 'corrected-hash');
  assert.equal(start[2].sourceVersionId, null);
  assert.ok(calls.some(call => call[0] === 'step' && call[1] === 'template'));
  assert.ok(calls.some(call => call[0] === 'candidate' && call[1] === corrected));

  calls.length = 0;
  await fn('job');
  assert.deepEqual(calls.find(call => call[0] === 'tailor'), ['tailor', corrected, 'Amina — general resume']);
  calls.length = 0;
  state.intakeAcknowledged = false;
  await new Function('state', body)(state)('job');
  assert.equal(calls.length, 0, 'unacknowledged extraction warnings block confirmation');

  state.intakeAcknowledged = true;
  state.useStore = { getState: () => ({ user: { uid: 'bob' } }) };
  await new Function('state', body)(state)('design');
  assert.equal(calls.some(call => call[0] === 'start'), false, 'late confirmation cannot cross accounts');
});


test('job tailoring starts a separate copy and clears the previous job target', () => {
  const handler = extract('  const beginJobTailoring = (resume: ResumeData, name: string) => {');
  const original = { name: 'Ada', title: 'Engineer', summary: 'Reviewed facts' };
  const state = {
    sourceAbortRef: { current: null }, morphRequestRef: { current: 3 }, morphAbortRef: { current: null }, setActiveGeneration: setter(this, 'activeGeneration'), setSelectedAppliedVersionId: setter(this, 'selectedAppliedVersionId'), setPreviousGenerations: setter(this, 'previousGenerations'), normalizeResume: value => ({ ...value }),
    DEFAULT_RESUME_REVIEW_STATE: { decisions: {} }, documentVersionId: 'saved-original', jobDescription: 'Old job', postingUrl: 'old.url',
    applicationData: { companyName: 'Old company', jobTitle: 'Old role', notes: '' }, documentName: 'General resume', editorEpoch: 2,
  };
  const keys = ['isLoading', 'processingStage', 'activeGeneration', 'previousGenerations', 'originalResume', 'buildResume', 'morphedResume', 'documentName', 'documentVersionId', 'documentOrigin', 'jobDescription', 'postingUrl', 'applicationData', 'saveCompanyName', 'resumeReview', 'matchScore', 'proofData', 'guardrailReport', 'resumeCheckResult', 'saveInlineStatus', 'showDocumentChecks', 'documentManualEdits', 'workspaceDestination', 'templateBrowsing', 'showImport', 'mode', 'step', 'resumeReturn'];
  for (const key of keys) state['set' + key[0].toUpperCase() + key.slice(1)] = setter(state, key);
  state.setEditorEpoch = update => { state.editorEpoch = update(state.editorEpoch); };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${handler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  new Function('state', body)(state)(original, 'General resume');
  assert.deepEqual(state.originalResume, original);
  assert.deepEqual(original, { name: 'Ada', title: 'Engineer', summary: 'Reviewed facts' });
  assert.equal(state.documentVersionId, null);
  assert.equal(state.documentName, 'General resume — copy');
  assert.equal(state.jobDescription, '');
  assert.equal(state.postingUrl, '');
  assert.equal(state.applicationData.companyName, '');
  assert.equal(state.mode, 'morph');
  assert.equal(state.step, 'jd');
  assert.equal(state.editorEpoch, 3);
});

test('tailoring a current draft respects the reviewed outbound boundary', () => {
  const handler = extract('  const tailorDocument = (candidate?: ResumeData) => {');
  const calls = [];
  const state = { documentName: 'General resume', getPreparedOutboundResume: () => null, beginJobTailoring: (...args) => calls.push(args) };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${handler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  new Function('state', body)(state)({ name: 'Unreviewed' });
  assert.equal(calls.length, 0);
  state.getPreparedOutboundResume = () => ({ resume: { name: 'Reviewed' } });
  new Function('state', body)(state)({ name: 'Unreviewed' });
  assert.deepEqual(calls, [[{ name: 'Reviewed' }, 'General resume']]);
});

function runGuidedHandler(marker, state) {
  const handler = extract(marker);
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`, { loader: 'ts', target: 'es2022' }).code;
  return new Function('state', body)(state)(...Array.prototype.slice.call(arguments, 2));
}
function guidedState() {
  const state = {
    step: 'jd', mode: 'morph', originalResume: { name: 'Amina', summary: 'Source facts' }, workspaceSource: null, rawSourceText: '', sourceResumeMeta: {},
    buildResume: { name: 'Amina' }, morphedResume: { name: 'Amina', summary: 'Proposed rewrite' },
    jobDescription: 'Fictional target job', selectedTemplate: { id: 'plain' },
    resumeReview: { decisions: { change: 'accepted' } }, documentOrigin: 'tailored', showSourceConfirmation: false,
    activeGeneration: null, selectedAppliedVersionId: 'older-version', previousGenerations: [], morphRequestRef: { current: 7 }, morphAbortRef: { current: null }, editorEpoch: 4, isLoading: true,
    retainPreviousGeneration, currentGenerationSnapshot: () => null,
    DEFAULT_RESUME_REVIEW_STATE: { decisions: {} }, normalizeResume: value => ({ ...value }), hasResumeData: value => Boolean(value?.name), setWorkspaceDestination: value => { state.workspaceDestination = value; }, setTemplateBrowsing: value => { state.templateBrowsing = value; },
    hasResumeData: value => Boolean(value?.name), tailorDocument: () => { throw new Error('Back must not start a new session'); },
  };
  for (const key of ['tailoringError','mode','step','buildResume','morphedResume','originalResume','activeGeneration','selectedAppliedVersionId','previousGenerations','matchScore','proofData','guardrailReport','resumeCheckResult','resumeReview','documentOrigin','documentManualEdits','saveInlineStatus','isLoading','showDocumentChecks','showSourceConfirmation','editorEpoch']) {
    state[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  return state;
}
test('guided Back and Continue preserve source, job, AI result, decisions and template', () => {
  const state = guidedState();
  runGuidedHandler('  const navigateSection = (section: ResumeSection) => {', state, 'source');
  assert.equal(state.mode, 'create'); assert.equal(state.step, 'upload');
  assert.deepEqual(state.buildResume, state.originalResume);
  assert.equal(state.jobDescription, 'Fictional target job');
  assert.equal(state.morphedResume.summary, 'Proposed rewrite');
  assert.equal(state.resumeReview.decisions.change, 'accepted');
  assert.equal(state.selectedTemplate.id, 'plain');
  assert.equal(state.morphRequestRef.current, 7);
  runGuidedHandler('  const navigateSection = (section: ResumeSection) => {', state, 'target');
  assert.equal(state.mode, 'morph'); assert.equal(state.step, 'jd');
  assert.equal(state.jobDescription, 'Fictional target job');
  assert.equal(state.morphedResume.summary, 'Proposed rewrite');
  assert.equal(state.resumeReview.decisions.change, 'accepted');
});
test('input edits mark prior AI output outdated while preserving candidate, review and history', () => {
  const state = guidedState();
  state.matchScore = 88; state.proofData = { score: 88 }; state.guardrailReport = { protected: true };
  runGuidedHandler('  const invalidateTailoredResult = () => {', state);
  assert.deepEqual(state.morphedResume, { name: 'Amina', summary: 'Proposed rewrite' });
  assert.equal(state.matchScore, 88); assert.deepEqual(state.proofData, { score: 88 });
  assert.deepEqual(state.guardrailReport, { protected: true });
  assert.deepEqual(state.resumeReview.decisions, { change: 'accepted' });
  assert.equal(state.jobDescription, 'Fictional target job');
  assert.equal(state.originalResume.summary, 'Source facts');
  assert.equal(state.selectedTemplate.id, 'plain');
  assert.equal(state.documentOrigin, 'tailored');
  assert.equal(state.selectedAppliedVersionId, null, 'an input edit clears permission to export an explicitly selected old result');
  assert.equal(state.isLoading, false); assert.equal(state.morphRequestRef.current, 8);
});
test('skipping AI uses source facts and clears generated scores before choosing a template', () => {
  const state = guidedState();
  runGuidedHandler('  const skipTailoring = () => {', state);
  assert.equal(state.step, 'template'); assert.equal(state.mode, 'morph');
  assert.equal(state.morphedResume.summary, 'Source facts');
  assert.equal(state.documentOrigin, 'user_authored');
  assert.equal(state.matchScore, null); assert.equal(state.proofData, null);
  assert.deepEqual(state.resumeReview.decisions, {});
});
test('failed tailoring retains inputs, shows the service error and permits retry', async () => {
  const state = guidedState();
  const oldCandidate = { name: 'Amina', summary: 'Previous reviewed result' };
  const oldGeneration = { id: 'prior', inputs: { percentage: 60 }, candidate: oldCandidate, review: state.resumeReview };
  state.morphedResume = oldCandidate; state.activeGeneration = oldGeneration; state.matchScore = 71;
  state.currentGenerationSnapshot = () => oldGeneration;
  Object.assign(state, {
    user: { uid: 'alice' }, isolatedPreview: false,
    morphInputsRef: { current: 'same-source-and-job' }, sourceParseMountedRef: { current: true },
    useStore: { getState: () => ({ user: { uid: 'alice' } }) },
    morphPercentage: 75, targetPageCount: 'auto', showSourceConfirmation: false,
    requestedGenerationInputs: { source: state.originalResume, jobDescription: state.jobDescription, role: '', company: '', postingUrl: '', percentage: 75, targetPageCount: 'auto', unlocked100: false },
    morphAbortRef: { current: null }, morphRequestRef: { current: 7 },
    normalizeResume: value => value, prepareResumeForExport: () => ({ resume: null }),
    morphConsent: { unlocked100: false }, selectedTemplate: { id: 'plain' }, activePaletteId: 'ink', pageSize: 'A4',
    setTailoringError: value => { state.tailoringError = value; }, setIsLoading: value => { state.isLoading = value; },
    setPreviousGenerations: update => { state.previousGenerations = typeof update === 'function' ? update(state.previousGenerations) : update; },
    morphResumeToJD: async () => { throw new Error('Service temporarily unavailable. Please retry.'); },
    showToast() {}, router: { push() { throw new Error('No navigation expected'); } },
  });
  await runGuidedHandler('  const handleMorph = async () => {', state);
  assert.equal(state.tailoringError, 'Service temporarily unavailable. Please retry.');
  assert.equal(state.isLoading, false);
  assert.equal(state.jobDescription, 'Fictional target job');
  assert.equal(state.originalResume.summary, 'Source facts');
  assert.equal(state.morphedResume.summary, 'Previous reviewed result');
  assert.equal(state.activeGeneration, oldGeneration);
  assert.equal(state.selectedAppliedVersionId, 'older-version');
  assert.equal(state.resumeReview.decisions.change, 'accepted');
  assert.equal(state.previousGenerations.length, 0);
  assert.equal(state.step, 'jd');
});

function generationHandlerState(morphResumeToJD, previous = appliedGeneration('prior', 'Amina', 'Fictional target job')) {
  const originalResume = previous.inputs.source;
  const oldCandidate = { ...previous.candidate };
  const state = {
    originalResume, workspaceSource: { provenance: 'source-A' }, rawSourceText: 'Original source A text', sourceResumeMeta: { fileName: 'A.txt' }, morphedResume: oldCandidate, activeGeneration: previous, selectedAppliedVersionId: previous.id, previousGenerations: [],
    resumeReview: previous.review, matchScore: previous.score, proofData: previous.proof, guardrailReport: previous.guardrailReport,
    jobDescription: previous.inputs.jobDescription, applicationData: { jobTitle: previous.inputs.role, companyName: previous.inputs.company },
    showSourceConfirmation: false, isolatedPreview: false, user: { uid: 'alice' }, morphRequestRef: { current: 4 }, morphAbortRef: { current: null },
    morphInputsRef: { current: 'inputs-key' }, sourceParseMountedRef: { current: true }, workflowSectionRef: { current: 'shape' },
    requestedGenerationInputs: { ...previous.inputs, percentage: 75 }, morphPercentage: 75, targetPageCount: 'auto', morphConsent: { unlocked100: false },
    selectedTemplate: { id: 'plain' }, activePaletteId: 'ink', pageSize: 'A4', currentDesign: null, pdfExportMode: 'application', DEFAULT_RESUME_REVIEW_STATE: { version: 1, decisions: {}, selectedId: null, view: 'comparison', documentTab: 'tailored' },
    normalizeResume: value => value, hasResumeData: value => Boolean(value?.name), currentGenerationSnapshot: () => previous, retainPreviousGeneration,
    useStore: { getState: () => ({ user: { uid: 'alice' } }) }, morphResumeToJD, prepareResumeForExport: ({ candidateResume }) => ({ resume: candidateResume }),
    showToast() {}, router: { push() { throw new Error('No navigation expected'); } }, analytics: { toolUse() {} },
    setPreviousGenerations: update => { state.previousGenerations = typeof update === 'function' ? update(state.previousGenerations) : update; }, setSelectedAppliedVersionId: value => { state.selectedAppliedVersionId = value; }, setStep: value => { state.step = value; },
  };
  for (const key of ['activeGeneration','selectedAppliedVersionId','morphedResume','documentOrigin','documentManualEdits','matchScore','proofData','guardrailReport','resumeCheckResult','resumeReview','draftSaveState','tailoringError','isLoading']) {
    state[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  return state;
}

test('successful regeneration archives the reviewed snapshot and starts fresh review decisions', async () => {
  const old = appliedGeneration('prior', 'Amina', 'Fictional target job');
  let generated;
  const state = generationHandlerState(async (...request) => {
    assert.equal(request[1], old.inputs.jobDescription);
    assert.equal(request[2], 75);
    assert.deepEqual(request[5], { role: old.inputs.role, company: old.inputs.company }, 'the handler forwards pinned target fields, not changed live controls');
    return { morphed: { ...old.candidate, summary: 'Fresh candidate' }, score: 91, proof: { score: 91 }, guardrailReport: { effectiveMorphPercentage: 75 }, effectiveMorphPercentage: 75 };
  }, old);
  state.applicationData = { jobTitle: 'Changed live role', companyName: 'Changed live company' };
  state.setDetectedNewSkills = () => {}; state.setLastMatchScore = () => {}; state.setShowSkillGapModal = () => {};
  state.setTailoringError = value => { state.tailoringError = value; };
  await runGuidedHandler('  const handleMorph = async () => {', state);
  generated = state.activeGeneration;
  assert.equal(state.tailoringError, '', `generation error: ${state.tailoringError}`);
  assert.ok(generated.id);
  assert.notEqual(generated.id, old.id);
  assert.equal(state.selectedAppliedVersionId, null);
  assert.equal(state.morphedResume.summary, 'Fresh candidate');
  assert.equal(generated.presentation.pdfExportMode, 'application');
  assert.equal(generated.inputs.jobDescription, 'Fictional target job');
  assert.deepEqual(generated.review.decisions, {});
  assert.deepEqual(state.resumeReview.decisions, {});
  assert.equal(state.previousGenerations.length, 1);
  assert.equal(state.previousGenerations[0].id, 'prior');
  assert.equal(state.previousGenerations[0].review.decisions['prior-change'], 'accepted');
  assert.equal(state.previousGenerations[0].candidate.summary, 'Amina candidate');
});

test('cancel and stale morph completion preserve the prior candidate and its review decisions', async () => {
  const old = appliedGeneration('prior', 'Amina', 'Fictional target job');
  let resolveMorph;
  const state = generationHandlerState(() => new Promise(resolve => { resolveMorph = resolve; }), old);
  state.setTailoringError = value => { state.tailoringError = value; };
  state.setIsLoading = value => { state.isLoading = value; };
  state.setResumeCheckResult = () => {}; state.setSaveInlineStatus = () => {};
  const cancelHandler = extract('  const cancelMorph = () => {');
  const cancelBody = transformSync(`const {${Object.keys(state).join(',')}}=state; const extracted = ${cancelHandler.replace(/^\s*return\s+/, '')}; return extracted;`, { loader: 'ts', target: 'es2022' }).code;
  const cancel = new Function('state', cancelBody)(state);
  const pending = runGuidedHandler('  const handleMorph = async () => {', state);
  await Promise.resolve();
  cancel();
  const cancelledRevision = state.morphRequestRef.current;
  assert.equal(state.morphedResume.summary, 'Amina candidate');
  assert.equal(state.resumeReview.decisions['prior-change'], 'accepted');
  assert.equal(state.isLoading, false);
  assert.ok(cancelledRevision > 4, 'cancel invalidates the in-flight generation request');
  resolveMorph({ morphed: { ...old.candidate, summary: 'Stale completion' }, score: 99, proof: null, guardrailReport: null, effectiveMorphPercentage: 75 });
  await pending;
  assert.equal(state.morphedResume.summary, 'Amina candidate');
  assert.equal(state.activeGeneration.id, 'prior');
  assert.equal(state.selectedAppliedVersionId, 'prior');
  assert.equal(state.resumeReview.decisions['prior-change'], 'accepted');
});
test('only explicit successful guest sign-in can hand off a real studio draft', () => {
  const calls = [];
  const state = {
    user: null, isReviewDemo: false, isSourceConfirmDemo: false,
    originalResume: { name: 'Fictional guest' }, intakeResume: null, buildResume: {}, rawSourceText: '',
    useStore: { getState: () => ({ user: { uid: 'alice' } }) },
    hasResumeData: value => Boolean(value?.name), sessionStorage: {},
    createRecoveryDraft: () => ({ originalResume: { name: 'Fictional guest' }, step: 'preview' }),
    handoffGuestResumeDraft: (_store, uid, draft) => calls.push({ uid, draft }), showToast() {},
  };
  runGuidedHandler('  const retainGuestDraftAfterSignIn = () => {', state);
  assert.equal(calls.length, 1); assert.equal(calls[0].uid, 'alice');
  assert.equal(calls[0].draft.step, 'preview');
  state.user = { uid: 'bob' };
  runGuidedHandler('  const retainGuestDraftAfterSignIn = () => {', state);
  state.user = null; state.isSourceConfirmDemo = true;
  runGuidedHandler('  const retainGuestDraftAfterSignIn = () => {', state);
  assert.equal(calls.length, 1, 'account switches and fixtures must never transfer a draft');
});

test('restoring an older AI generation restores its own source provenance and clears legacy unknown provenance', () => {
  const handler = extract('  const restoreGeneration = (generation: ResumeGeneration) => {');
  const sourceA = { name: 'Ada', summary: 'Original imported A' };
  const sourceB = { name: 'Ada', summary: 'New imported B' };
  const generationA = appliedGeneration('A', 'Ada', 'Target JD');
  generationA.inputs.source = sourceA; generationA.sourceContext = { workspaceSource: { id: 'source-A' }, rawText: 'Raw source A', metadata: { fileName: 'A.pdf' } };
  const state = {
    maxMorphPercentage: 80, isPro: true, currentGenerationSnapshot: () => null,
    beginSourceUpload() {}, invalidateTailoredResult() {}, retainPreviousGeneration,
    resolveEntitledReplacementTemplate: id => ({ id }), getTemplatePalette: (_template, id) => ({ id }),
    readResumeDesign: design => design,
  };
  for (const key of ['activeGeneration','selectedAppliedVersionId','originalResume','workspaceSource','rawSourceText','sourceResumeMeta','intakeResume','intakeWarnings','buildResume','morphedResume','jobDescription','postingUrl','applicationData','morphPercentage','targetPageCount','resumeReview','matchScore','proofData','guardrailReport','documentOrigin','documentManualEdits','selectedTemplate','selectedPaletteId','pageSize','designConfig','pdfExportMode','mode','step']) state[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = value; };
  state.getTemplatePalette = (_template, palette) => ({ id: palette });
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`, { loader: 'ts', target: 'es2022' }).code;
  const restore = new Function('state', body)(state);
  state.originalResume = sourceB; state.workspaceSource = { id: 'source-B' }; state.rawSourceText = 'Raw source B'; state.sourceResumeMeta = { fileName: 'B.pdf' };
  restore(generationA);
  assert.equal(state.originalResume.summary, 'Original imported A');
  assert.deepEqual(state.workspaceSource, { id: 'source-A' });
  assert.equal(state.rawSourceText, 'Raw source A');
  assert.deepEqual(state.sourceResumeMeta, { fileName: 'A.pdf' });
  const legacy = appliedGeneration('legacy', 'Ada', 'Target JD'); legacy.inputs.source = sourceB;
  restore(legacy);
  assert.equal(state.workspaceSource, null);
  assert.equal(state.rawSourceText, '');
  assert.deepEqual(state.sourceResumeMeta, {});
});


test('new source card loading false cancels and clears the parent-owned upload operation', () => {
  const handler = extract('  const handleSourceUploadLoading = (loading: boolean) => {', '\n\n  const handlePastedResumeText');
  let cancelled = 0;
  const state = {
    sourceUploadOperationRef: { current: { id: 'upload-1', cancel: () => { cancelled += 1; } } },
    setIsLoading: value => { state.isLoading = value; },
    setProcessingStage: value => { state.processingStage = value; },
  };
  const body = transformSync(`const {${Object.keys(state).join(',')}}=state; ${handler}`, { loader: 'ts', target: 'es2022' }).code;
  const handleLoading = new Function('state', body)(state);
  handleLoading(true);
  assert.equal(state.isLoading, true);
  assert.equal(cancelled, 0);
  handleLoading(false);
  assert.equal(state.isLoading, false);
  assert.equal(cancelled, 1);
  assert.equal(state.sourceUploadOperationRef.current, null);
  assert.equal(state.processingStage, null);
});
