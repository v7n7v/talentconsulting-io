const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadExportTruth() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-resume-export-truth-'));
  const outfile = path.join(outdir, 'resume-export-truth.cjs');
  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'resume-export-truth.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const { canPersistPreparedResume, prepareResumeForExport } = loadExportTruth();

function sourceResume(institution = 'Rutgers University') {
  return {
    name: 'Amina Smith',
    title: 'Security Engineer',
    email: 'amina@example.com',
    phone: '555-0100',
    location: 'New Jersey',
    summary: 'Security engineer focused on network assurance.',
    experience: [{
      company: 'Northstar Networks',
      role: 'Network Engineer',
      duration: '2021-2025',
      achievements: ['Improved wireless reliability.'],
    }],
    education: [{ degree: 'BS Cybersecurity', institution, year: '2021' }],
    skills: [{ category: 'Security', items: ['NIST', 'LTE'] }],
    certifications: ['Security+'],
  };
}

test('export boundary restores protected education, employment, role, dates, and credentials', () => {
  const original = sourceResume();
  const attempted = {
    ...original,
    experience: [{
      company: 'Invented Defense Corp',
      role: 'Principal Architect',
      duration: '2018-2026',
      achievements: ['Improved wireless reliability.'],
    }],
    education: [{ degree: 'MS Computer Science', institution: 'Invented University', year: '2024' }],
    certifications: ['CISSP'],
  };

  const prepared = prepareResumeForExport({
    mode: 'morph',
    originalResume: original,
    candidateResume: attempted,
    requestedMorphPercentage: 100,
    hasFullConsent: true,
  });

  assert.deepEqual(prepared.resume.experience, original.experience);
  assert.equal(prepared.resume.education[0].degree, original.education[0].degree);
  assert.equal(prepared.resume.education[0].institution, original.education[0].institution);
  assert.equal(prepared.resume.education[0].year, original.education[0].year);
  assert.deepEqual(prepared.resume.certifications, original.certifications);
  assert.ok(prepared.guardrailReport.blockedChangeCount >= 3);
  assert.deepEqual(prepared.missingEducationInstitutionIndexes, []);
});

test('export boundary strips placeholder schools and blocks an invented replacement', () => {
  const original = sourceResume('unidentified');
  const attempted = sourceResume('Invented University');

  const prepared = prepareResumeForExport({
    mode: 'morph',
    originalResume: original,
    candidateResume: attempted,
    requestedMorphPercentage: 80,
  });

  assert.equal(prepared.resume.education[0].institution, '');
  assert.deepEqual(prepared.missingEducationInstitutionIndexes, [0]);
  assert.ok(prepared.guardrailReport.blockedChanges.some(change => change.path.startsWith('education')));
});

test('morph output fails closed when its source resume is unavailable', () => {
  const prepared = prepareResumeForExport({
    mode: 'morph',
    candidateResume: sourceResume('Invented University'),
  });

  assert.equal(prepared.resume, null);
  assert.equal(prepared.blockedReason, 'missing_source');
  assert.equal(prepared.guardrailReport, null);
});

test('an explicit user-confirmed source correction survives export validation', () => {
  const correctedSource = sourceResume('Rutgers University');
  const prepared = prepareResumeForExport({
    mode: 'morph',
    originalResume: correctedSource,
    candidateResume: correctedSource,
  });

  assert.equal(prepared.resume.education[0].institution, 'Rutgers University');
  assert.equal(prepared.guardrailReport.blockedChangeCount, 0);
  assert.deepEqual(prepared.missingEducationInstitutionIndexes, []);
  assert.equal(canPersistPreparedResume(prepared), true);
});

test('automatic persistence stays off until education is complete', () => {
  const incomplete = prepareResumeForExport({
    mode: 'morph',
    originalResume: sourceResume('undefined'),
    candidateResume: sourceResume('undefined'),
  });
  assert.equal(canPersistPreparedResume(incomplete), false);

  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'suite', 'resume', 'page.tsx'), 'utf8');
  assert.match(page, /if \(user && canPersistPreparedResume\(preparedMorph\)\)/);
});

test('create-mode export normalizes placeholders without applying morph locks', () => {
  const created = sourceResume('undefined');
  const prepared = prepareResumeForExport({ mode: 'create', candidateResume: created });

  assert.equal(prepared.guardrailReport, null);
  assert.equal(prepared.resume.education[0].institution, '');
  assert.deepEqual(prepared.missingEducationInstitutionIndexes, [0]);
});

test('PDF and Word download paths consume the same prepared truth-locked resume', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'suite', 'resume', 'page.tsx'), 'utf8');

  assert.match(page, /const getPreparedOutboundResume = \(actionLabel: string\) =>/);
  assert.match(page, /prepareResumeForExport\(\{/);
  assert.match(page, /downloadResumePDF\(prepared\.resume,/);
  assert.match(page, /const resume = prepared\.resume as ResumeData;/);
  assert.match(page, /setOriginalResume\(prev => applyUpdate\(prev\)\);/);
  assert.equal((page.match(/saveResumeVersion\(/g) || []).length, 4);
  assert.equal((page.match(/const prepared = getPreparedOutboundResume\(/g) || []).length, 6);
  assert.match(page, /const preparedMorph = prepareResumeForExport\(\{/);
});
