const test = require('node:test');
const assert = require('node:assert/strict');
const { approvedOrigin, runResumeProductionSmoke } = require('./resume-production-smoke');

function headers(values = {}) {
  return { get(name) { return values[String(name).toLowerCase()] || null; } };
}

function response(status, body, contentType = 'application/json') {
  return { status, headers: headers({ 'content-type': contentType }), json: async () => body };
}

function fixtures() {
  return [
    { fileName: 'resume-smoke.txt', contentType: 'text/plain', bytes: Buffer.from('Amina Noor\nSenior Platform Engineer\nNorthstar Systems\nResume smoke source marker.'), marker: 'Amina Noor\nSenior Platform Engineer\nNorthstar Systems\nResume smoke source marker.' },
    { fileName: 'resume-smoke.docx', contentType: 'application/octet-stream', bytes: Buffer.from('docx'), marker: 'DOCX resume smoke source marker.' },
    { fileName: 'resume-smoke.pdf', contentType: 'application/pdf', bytes: Buffer.from('%PDF-'), marker: 'PDF resume smoke source marker.' },
  ];
}

test('origin policy permits only explicit localhost smoke targets', () => {
  assert.equal(approvedOrigin('https://talentconsulting.io'), 'https://talentconsulting.io');
  assert.equal(approvedOrigin('http://127.0.0.1:3102', { local: true }), 'http://127.0.0.1:3102');
  assert.throws(() => approvedOrigin('http://127.0.0.1:3102'), /approved HTTPS/);
  assert.throws(() => approvedOrigin('https://evil.example'), /approved HTTPS/);
});

test('resume smoke exercises all formats, source claims, page, and disabled preview', async () => {
  const calls = [];
  const result = await runResumeProductionSmoke({ origin: 'https://talentconsulting.io', fixtures: fixtures(), fetchImpl: async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/api/gauntlet/parse-resume')) {
      const file = init.body.get('file');
      const marker = file.name.endsWith('.txt') ? 'Amina Noor\nSenior Platform Engineer\nNorthstar Systems\nResume smoke source marker.' : file.name.endsWith('.docx') ? 'DOCX resume smoke source marker.' : 'PDF resume smoke source marker.';
      return response(200, { rawText: marker, text: marker });
    }
    if (url.endsWith('/api/resume/parse')) return response(422, { rawText: JSON.parse(init.body).text, requiresReview: true, resume: { name: 'Amina Noor' } });
    if (url.endsWith('/suite/resume')) return response(200, '<html></html>', 'text/html; charset=utf-8');
    if (url.endsWith('/api/workspace-preview/resume-import')) return response(404, { error: 'Not found' });
    throw new Error(`unexpected ${url}`);
  } });
  assert.equal(result.status, 'passed');
  assert.equal(calls.filter(call => call.url.endsWith('/api/gauntlet/parse-resume')).length, 3);
  assert.equal(calls.filter(call => call.url.endsWith('/api/resume/parse')).length, 1);
});

test('resume smoke fails closed on an upload error without exposing source', async () => {
  await assert.rejects(() => runResumeProductionSmoke({ origin: 'https://talentconsulting.io', fixtures: fixtures(), fetchImpl: async url => {
    if (url.endsWith('/api/gauntlet/parse-resume')) return response(422, { code: 'PARSE_FAILED', rawText: 'SECRET_SOURCE_MUST_NOT_PRINT' });
    throw new Error('should stop after first failure');
  } }), /resume-smoke\.txt upload failed: HTTP 422 \(PARSE_FAILED\)/);
});

test('resume smoke fails closed on a text parse server error', async () => {
  await assert.rejects(() => runResumeProductionSmoke({ origin: 'https://talentconsulting.io', fixtures: fixtures(), fetchImpl: async (url, init = {}) => {
    if (url.endsWith('/api/gauntlet/parse-resume')) {
      const fileName = init.body.get('file').name;
      return response(200, { rawText: fileName.endsWith('.txt') ? 'Amina Noor\nSenior Platform Engineer\nNorthstar Systems\nResume smoke source marker.' : fileName.endsWith('.docx') ? 'DOCX resume smoke source marker.' : 'PDF resume smoke source marker.' });
    }
    return response(503, { code: 'SERVICE_UNAVAILABLE', rawText: 'SECRET_SOURCE_MUST_NOT_PRINT' });
  } }), /Text parse failed: HTTP 503 \(SERVICE_UNAVAILABLE\)/);
});
