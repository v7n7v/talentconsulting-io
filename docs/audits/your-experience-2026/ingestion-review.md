# Your Experience: ingestion and source review audit

Date: 2026-09-28. Scope: `/suite/resume`, upload/paste → extraction → AI structuring → review → shared context/library. Read-only application audit; changes are limited to review artifacts and synthetic reproductions. No external provider, account, upload bucket, or paid call was used. The requested future product must give **career profile/experience and resume editing equal entry points**, sharing confirmed facts rather than subordinating either workflow.

## Current implementation and strengths

The active page mounts `components/FileUploadDropzone.tsx` at `app/suite/resume/page.tsx:2814` and `:3205`. Its compatibility wrapper (`lib/resume-upload.ts`) calls `startResumeUpload(file).promise`. The transport uses direct upload up to 4 MB and authenticated Firebase resumable upload above that, up to 10 MB. `/api/gauntlet/parse-resume` extracts text; `/api/resume/parse` separately asks Groq to structure it; the page normalizes that JSON and shows `ResumeIntakeReview`.

Useful protections already exist and should survive an upgrade:

- Extraction validates file signatures, bounds request/decoded/storage sizes, checks authenticated storage ownership, and uses bounded streaming downloads (`app/api/gauntlet/parse-resume/route.ts:26–109,174–210,300–368`). Anonymous binary processing has tighter budgets (`lib/resume-parser-safety.ts`).
- Binary parsing runs in a disposable worker, with 4-second anonymous/8-second authenticated deadlines, PDF page limits, DOCX archive limits, and worker memory limits (`app/api/gauntlet/parse-resume/route.ts:380–384`; `lib/resume-binary-parser-worker.ts:26–73,85–134`). These are binary-worker deadlines, not full intake deadlines.
- Ordinary storage parse success/failure cleans up the temporary object; transport cancellation, failed parsing, and unload also attempt authenticated cleanup. Cleanup failure is not falsely recorded as success (`app/api/gauntlet/parse-resume/route.ts:149–174`; `lib/upload/upload-transport.ts:424–547,690–754`).
- Review calls parser output a draft and permits editing basic identity, experience, education, and skills (`components/resume-intake/ResumeIntakeReview.tsx:40–43,55–188`). Account/request/mount checks protect successful AI parse commits (`app/suite/resume/page.tsx:1186–1220`).
- UI discloses that resume text goes to AI services and that account-library save is separate (`app/suite/resume/page.tsx:2922`). The server fails closed when its structuring provider is unconfigured (`app/api/resume/parse/route.ts:18–25`).
- Server source classification rejects generated/morphed/optimized records and exposes strict explicit-source lookup as well as legacy-compatible lookup (`lib/server-resume.ts:47–88,235–319`). This existing distinction should be reused consistently.

## Findings, ordered by impact

### IN-01 — P1: structurally invalid or invented model output is accepted as parsed source

Evidence: `app/api/resume/parse/route.ts:34–60` describes a JSON shape only in its prompt. The sole output check is `parsed.isResume === false`. `lib/ai/groq-client.ts:128–146` requests JSON and parses JSON but validates neither schema nor completion finish reason. `lib/resume-normalizer.ts:177–198` converts absent fields into an apparently usable empty canonical object. Input schema also accepts an empty trimmed string (`lib/schemas.ts:14,48–50`).

Executed reproduction: the real route body, with provider/auth/response/input-validation boundaries mocked, returned HTTP 200 for (1) `{}`, (2) `{isResume:'false',name:'Invented Person'}`, and (3) a fabricated CEO role and “Saved $9 million” achievement for input containing only Amina, Linux, and an Engineer role at Northstar. This proves missing output acceptance checks, not a measured rate of live model hallucination. The portable [reproduction](ingestion-repro.cjs) and [synthetic results](ingestion-repro-results.jsonl) are retained with this audit. Run `node docs/audits/your-experience-2026/ingestion-repro.cjs` from the repository root.

Proposal: require runtime output schema, explicit boolean document classification, meaningful minimum input/output, bounded collections, and supported source evidence for extracted claims. Preserve uncertain/missing facts as unknown rather than completing them. Treat incomplete model completion as recoverable failure, not a complete resume. Prompt should extract all supported achievements, not preferentially encourage quantified ones. Acceptance: malformed/empty output fails safely; invented employer, date, metric, certification and changed negation cannot silently become confirmed facts. Include multilingual and sparse career-history examples without requiring a conventional corporate CV shape.

### IN-02 — P1: review is not the shared-fact commit boundary

Evidence: successful parse immediately writes the **unreviewed** normalized snapshot into Application Kit (`app/suite/resume/page.tsx:1196–1204`). Review edits only update local `originalResume`; confirmation only hides review and changes workflow step (`:2679–2694` and `:3106–3119`). Replace clears local state without undoing the shared write. Later morph explicitly overwrites the shared snapshot with generated output (`:1347–1353`).

Consequences: a user who corrects or rejects extraction can leave a different, unconfirmed shared snapshot available to other consumers. This is a source/draft identity defect; it is not proof that a particular downstream server accepts that snapshot as verified.

Proposal: maintain separate extracted draft, confirmed experience revision, and tailored resume revision. Confirmation must atomically publish the exact reviewed revision and its source receipt. Replace/cancel must never publish the rejected draft. Career-profile and resume entry points should read the same confirmed fact revision, with resume wording/style tracked separately. Acceptance: edit a parsed company, confirm, and open another consumer; it sees the correction. Replace or leave review without confirming; no new confirmed facts propagate. Generating a tailored resume must not replace the source fact record.

### IN-03 — P1: saved generated resumes can become new “original” inputs in this page

Evidence: `loadVersionToMorph` directly normalizes **any** selected version content into `originalResume` (`app/suite/resume/page.tsx:1742–1748`), labels it library, skips review and proceeds to target entry (`:1767–1775`). It does not call the available source classifier, preserve an explicit selected-source ID in this handler, or reset existing `morphedResume` here. The page fetches general versions (`:1121–1125`), not confirmed-only sources.

Verification: static handler and source-classifier tracing; generated-library selection and stale displayed candidate were not exercised in browser here. Root owns browser coverage. Server classifier protections remain valuable but do not protect this local reclassification.

Proposal: clearly separate “Use confirmed experience” from “Edit saved resume.” A generated resume should reopen as a document draft linked to its original confirmed source, not establish new factual evidence. Replace source must clear/rebind the old tailored candidate and review decisions. Acceptance: reopen a generated version, then select another source; source ID, displayed document and review ledger remain coherent, and no generated claim is promoted by re-importing it.

### IN-04 — P1: active upload lacks the tested end-to-end cancellation/replacement contract

Evidence: `components/FileUploadDropzone.tsx:109–138` awaits a bare promise and calls the parent without an operation ID, mount guard or abort handle. `:151–157` permits another drop without checking the current uploading state. The parent increments its request ID only **after extraction completes** (`app/suite/resume/page.tsx:1186–1188`). Thus if upload A is slow and upload B finishes first, A's later extraction starts a newer AI request and can win. A reset followed by a late extraction has the same missing initial-operation boundary. Successful parse owner checks do protect cross-account success, but stale error handling remains outside those checks (`:1206–1213`).

The stronger `lib/upload/useFileUpload.ts` infrastructure already guards supersession/unmount and exposes cancellation, but this active component does not use it. Passing its tests is not evidence that this page inherits those protections.

Proposal: one intake operation identity from file selection/paste through extraction, AI structuring, review staging and final confirmation, bound to owner and cancelled on replacement/reset/unmount. Reuse the stronger upload controller, with explicit transfer/extraction/structuring phases. Acceptance: deferred A/B extraction in reverse order; reset during extraction; owner switch during extraction and structuring; stale rejection after success. Only the intended operation may update UI or shared state, and cancelled work must not save.

### IN-05 — P1: source loss is silent and cannot be reviewed against the input

Evidence: extraction truncates at 50,000 characters without original length or truncation flag (`app/api/gauntlet/parse-resume/route.ts:26–27,371–386`; worker `:65,73`). The structuring endpoint permits 100,000 characters but only 4,096 output tokens (`app/api/resume/parse/route.ts:28,51–54`). Its prompt omits projects, publications, awards, volunteering, languages and links as distinct fields. Normalization retains only a fixed field set (`lib/resume-normalizer.ts:185–198`). The intake review receives only parsed resume and filename, not raw extracted text (`components/resume-intake/ResumeIntakeReview.tsx:7–15`). Certifications and links are not editable in this review component, despite certifications being part of the parser contract.

Executed source-alteration reproduction: `sanitizeForAI('Operating system: Linux')` returns `Operating [FILTERED]Linux`; the real route sends that altered text to its mocked provider (`lib/sanitize.ts:10,30–37`; route `:28,51`). This is ordinary career content, not a malicious instruction.

Proposal: retain immutable extracted text plus source hash, parser version, page/section boundaries, extraction warnings and exact spans supporting each structured field. Do not use destructive prompt filtering as source storage or evidence; delimit untrusted data and validate extracted claims against original text. Explicitly report truncation and incomplete extraction; reject oversize work or chunk with section reconciliation. Review should compare original extraction and structured facts, expose unsupported sections and let users preserve them. Acceptance: final-page certification/portfolio link survives; mixed-column ordering is flagged; long CV truncation is explicit; “Operating system:” stays intact. The experience model must support facts beyond a one-page resume.

### IN-06 — P2: advertised format and OCR recovery exceed actual capability

Evidence: `.doc` is accepted by signature and advertised alongside DOCX (`app/api/gauntlet/parse-resume/route.ts:14,38–40,61–63`; `components/FileUploadDropzone.tsx:25–30`). The worker sends both types to `mammoth.extractRawText`; only DOCX gets archive inspection (`lib/resume-binary-parser-worker.ts:68–73`). Installed Mammoth explicitly documents DOCX conversion (`node_modules/mammoth/README.md:1–3`), not legacy OLE DOC. No supported DOC conversion stage exists in this path. This is code/package evidence, not a test with a valid historical DOC fixture.

Scanned PDFs are rejected based on fewer than 20 extracted characters (`app/api/gauntlet/parse-resume/route.ts:387–390`); OCR is absent. Mixed scanned/text pages can exceed that threshold yet lose most content. The component says OCR is “coming soon” without an implemented delivery path (`components/FileUploadDropzone.tsx:132`). Anonymous binaries above 2 MB and legacy DOC require auth even though general direct-upload threshold is 4 MB (`lib/resume-parser-safety.ts`).

Proposal: immediately make supported-format and limit messages exact, with paste/DOCX conversion remedies. Either implement an isolated DOC converter with fixtures and budgets, or remove DOC from acceptance. OCR should be a deliberate, disclosed fallback with page coverage, confidence, language support, timeout/cost limits, and mandatory review; no invented schedule. Acceptance: scanned-only, mixed scanned/text, rotated, password-protected, malformed, multi-column and legacy DOC fixture matrix. OCR is an upgrade proposal, not an existing feature.

### IN-07 — P2: timeout, retry and failure UX does not cover the whole intake

Evidence: binary workers are bounded; AI structuring has no request-specific AbortSignal, overall deadline or retry policy (`app/suite/resume/page.tsx:1129–1141`; `lib/ai/groq-client.ts:119–146`). The installed Groq client defaults to 60-second request timeout and two retries (`node_modules/groq-sdk/src/index.ts:121,152`; `core.ts:198`). Parent displays `err.error`, ignoring the route's useful human-readable `message` and retryable field (`page.tsx:1135–1138`), so configuration/transient failure may surface machine codes. Upload errors also flatten structured recovery into a toast (`FileUploadDropzone.tsx:129–137`).

Proposal: bound each stage and overall intake; distinguish safe retry from replacement; keep selected file/extracted text recoverable; expose actionable failure copy and request receipt; ensure cancel aborts supported upstream work and always prevents local commits. Preserve legitimate server rate-limit/sign-in remedies. Acceptance: extraction succeeds then structuring times out; user retries without re-uploading or losing corrections; missing provider is readable; Retry-After honored; no endless “parsing” or duplicate successful commit. Do not promise a full eight-second turnaround from the binary-worker budget.

### IN-08 — P1 operational / P2 product: temporary-file deletion has no verified lifecycle backstop

Evidence: cleanup is best effort and comments explicitly identify an uncompleted owner action (`app/api/gauntlet/parse-resume/route.ts:138–140,150–159`). `docs/storage-retention-runbook.md:1–38` documents crash/offline/delete-error orphans and missing lifecycle configuration. Code alone cannot establish deployed bucket retention. Large files may reach storage before parsing; smaller direct files and all extracted resume text follow different paths.

Proposal: verify/configure lifecycle independently with the owner, then test forced crash and deletion failure against synthetic staging files. Show accurate distinctions between temporary upload bytes, AI processing, tab/device recovery, and durable account source/document saves. Avoid absolute deletion claims until operational evidence exists. Provide user-visible recovery/deletion status where material. Acceptance: recorded deployed lifecycle evidence and observed expiration; owner-scoped deletion; privacy copy matches actual persisted data and provider policy. No live configuration was inspected or changed in this audit.

## Provenance and persistence contract to design

Current saved provenance is `{verified:true,origin,recordedAt}` (`lib/resume-provenance.ts:1–24`). Resume Studio infers direct-source eligibility from mode/file metadata and absence of morphed data (`app/suite/resume/page.tsx:1052–1074`); it does not bind provenance to a reviewed hash or a confirmation timestamp. `saveResumeVersion` normalizes that metadata (`lib/database-suite.ts:86–123`). Legacy active records can be accepted by compatibility lookup (`lib/server-resume.ts:85–86`); explicit-source lookup is stricter.

Proposed shared contract: `sourceId`, immutable source revision/hash, owner, origin, extraction/parser version, raw-text availability, warnings, confirmed revision/hash/time, per-field evidence spans or explicit user-authored origin, and derived-document source linkage. Confirmation means **user-confirmed accuracy**, not independently verified credentials. An imported saved resume should never gain stronger provenance merely by being opened or saved again. Both career experience editing and resume editing should expose revision conflicts and support intentional fact corrections, without one flow silently overwriting the other.

## Verification performed and limits

Executed `node --test scripts/resume-intake.test.js scripts/resume-source-classification.test.js scripts/file-upload-state.test.js`: **101 passed, 0 failed**. Log: `/tmp/experience-ingestion-tests.log`. Coverage includes real transport/controller behavior under mocks, helper ownership rules, source classification, and some static source assertions. It does not cover the actual legacy Dropzone → Resume page intake race or live PDF fidelity. The route reproduction used the actual transpiled route with mocked provider/auth/response/schema boundaries; schema acceptance observations additionally come from direct source reading, not that mock.

No live AI quality, OCR accuracy, cloud rules deployment, provider retention, real DOC fixture, browser screen-reader/keyboard interaction, or rendered PDF extraction fidelity was measured here. Existing binary-worker safety is not proof of semantic completeness. Root's browser and broader editor/template audit should supply complementary evidence.

## Prioritized upgrade sequence and acceptance gates

1. **Protect confirmed facts first:** runtime model contract and evidence checks (IN-01); exact confirmation publication and source/draft separation (IN-02); saved-source classification and identity (IN-03). Add loaded-handler regressions with deliberately malformed/fabricated output and edited/rejected intake.
2. **Make intake deterministic:** one cancellable owner-bound operation (IN-04), honest phase/status/error/retry behavior (IN-07), and truthful formats/limits (IN-06). Integrate the existing strong upload controller rather than building a second one.
3. **Preserve the full career record:** extraction receipt, raw comparison, source spans, explicit truncation, complete section review, non-destructive prompt handling (IN-05). Support equal “Manage experience” and “Edit a resume” entrances with shared confirmed facts and separate document composition.
4. **Operational release gate:** lifecycle/retention verification (IN-08), deployed worker compatibility, actual authentication/storage rules, synthetic crash/retry/delete cases. Keep these separate from claims established by local tests.
5. **Add OCR only as a bounded capability:** fixture-led quality baseline, mixed-page detection, disclosure and user review. Establish extraction quality metrics by field and section before advertising broad import reliability.

A useful release benchmark is a fixed consent-free synthetic fixture corpus covering DOCX, text PDF, pasted text, Unicode names, non-English records, long academic CVs, columns/tables, sparse first-job profiles, broken files, scanned/mixed pages, and source replacements. Measure omitted and invented facts separately, maintain exact source-to-field traceability, and require explicit unknown/error states instead of treating every HTTP 200 as successful import.
