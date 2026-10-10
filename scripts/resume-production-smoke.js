const { approvedOrigin: approvedProductionOrigin } = require('./admin-public-production-smoke');

const DEFAULT_ORIGIN = 'https://talentconsulting.io';
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:3102', 'http://localhost:3102']);
const SOURCE_TEXT = ['Amina Noor', 'Senior Platform Engineer', 'amina@example.test', 'SUMMARY', 'Platform engineer building reliable services and developer tools.', 'EXPERIENCE', 'Northstar Systems', 'Senior Platform Engineer | 2020–2026', 'Built an internal deployment dashboard used by three teams.', 'EDUCATION', 'BSc Computer Science | Example University | 2019', 'SKILLS', 'TypeScript, Python, PostgreSQL'].join('\n');

function approvedOrigin(value, { local = false } = {}) {
  const raw = String(value || DEFAULT_ORIGIN);
  if (local && LOCAL_ORIGINS.has(raw)) return raw;
  return approvedProductionOrigin(raw);
}

function boundedError(response, body) {
  const status = Number(response?.status || 0);
  const code = body && typeof body === 'object' && typeof body.code === 'string' ? body.code : 'unknown';
  return `HTTP ${status} (${code})`;
}

function timeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
}

async function request(url, init = {}, timeoutMs = 20_000) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    redirect: 'manual',
    signal: init.signal || timeoutSignal(timeoutMs),
  });
  return response;
}

async function responseJson(response) {
  try { return await response.json(); } catch { return null; }
}

function assertSourcePayload(payload, source, label) {
  const rawText = payload && typeof payload.rawText === 'string' ? payload.rawText : '';
  const text = payload && typeof payload.text === 'string' ? payload.text : '';
  if (!rawText.includes(source) && !text.includes(source)) {
    throw new Error(`${label} did not return the uploaded source text.`);
  }
}

async function makeDocx() {
  const { Document, Packer, Paragraph } = require('docx');
  return Packer.toBuffer(new Document({ sections: [{ children: [
    new Paragraph('Amina Noor'),
    new Paragraph('Senior Platform Engineer'),
    new Paragraph('Northstar Systems'),
    new Paragraph('DOCX resume smoke source marker.'),
  ] }] }));
}

async function makePdf() {
  const PDFDocument = require('@react-pdf/pdfkit').default;
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: true });
    const chunks = [];
    document.on('data', chunk => chunks.push(Buffer.from(chunk)));
    document.once('error', reject);
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(12).text('Amina Noor\nSenior Platform Engineer\nNorthstar Systems\nPDF resume smoke source marker.');
    document.end();
  });
}

async function createSyntheticResumeFixtures() {
  return [
    { fileName: 'resume-smoke.txt', contentType: 'text/plain', bytes: Buffer.from(SOURCE_TEXT, 'utf8'), marker: SOURCE_TEXT },
    { fileName: 'resume-smoke.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: await makeDocx(), marker: 'DOCX resume smoke source marker.' },
    { fileName: 'resume-smoke.pdf', contentType: 'application/pdf', bytes: await makePdf(), marker: 'PDF resume smoke source marker.' },
  ];
}

async function runResumeProductionSmoke(options = {}) {
  const origin = approvedOrigin(options.origin || process.env.ADMIN_PRODUCTION_ORIGIN, { local: options.local === true });
  const fetchImpl = options.fetchImpl || request;
  const fixtures = options.fixtures || await createSyntheticResumeFixtures();
  if (!Array.isArray(fixtures) || fixtures.length !== 3) throw new Error('Resume smoke requires exactly three synthetic fixtures.');

  for (const fixture of fixtures) {
    const form = new FormData();
    form.append('file', new Blob([fixture.bytes], { type: fixture.contentType }), fixture.fileName);
    const response = await fetchImpl(`${origin}/api/gauntlet/parse-resume`, { method: 'POST', body: form });
    const payload = await responseJson(response);
    if (response.status !== 200) throw new Error(`${fixture.fileName} upload failed: ${boundedError(response, payload)}.`);
    assertSourcePayload(payload, fixture.marker, fixture.fileName);
  }

  const parseResponse = await fetchImpl(`${origin}/api/resume/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text: SOURCE_TEXT }),
  }, 40_000);
  const parsePayload = await responseJson(parseResponse);
  if (![200, 422].includes(parseResponse.status)) throw new Error(`Text parse failed: ${boundedError(parseResponse, parsePayload)}.`);
  assertSourcePayload(parsePayload, SOURCE_TEXT, 'Text parse');
  if (parsePayload?.resume?.name !== 'Amina Noor') throw new Error('Text parse did not preserve the supplied resume identity.');
  if (parseResponse.status === 422 && parsePayload.requiresReview !== true) throw new Error('Text parse returned 422 without requiresReview.');

  const page = await fetchImpl(`${origin}/suite/resume`, { headers: { Accept: 'text/html' } });
  if (page.status !== 200 || !/text\/html/i.test(String(page.headers?.get?.('content-type') || ''))) {
    throw new Error(`/suite/resume failed: HTTP ${page.status}.`);
  }
  const preview = await fetchImpl(`${origin}/api/workspace-preview/resume-import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text: SOURCE_TEXT }),
  });
  if (preview.status !== 404) throw new Error(`Production preview endpoint returned HTTP ${preview.status}; expected 404.`);
  return { origin, status: 'passed', uploadedFormats: fixtures.map(fixture => fixture.fileName), parseStatus: parseResponse.status };
}

function parseArgs(argv) {
  const result = { origin: undefined, local: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--local') result.local = true;
    if (argv[index] === '--origin') result.origin = argv[++index];
  }
  return result;
}

async function main() {
  const result = await runResumeProductionSmoke(parseArgs(process.argv.slice(2)));
  process.stdout.write(`Resume production smoke passed for ${result.origin} (${result.uploadedFormats.join(', ')}; text parse HTTP ${result.parseStatus}).\n`);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Resume production smoke failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { approvedOrigin, createSyntheticResumeFixtures, runResumeProductionSmoke };
