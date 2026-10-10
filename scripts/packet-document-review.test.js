const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-packet-document-'));
const output = path.join(directory, 'document.cjs');
buildSync({
  entryPoints: [path.join(root, 'components/workspace/PacketResumeDocument.tsx')],
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent',
});
const PacketResumeDocument = require(output).default;
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('the approval document exposes every saved resume section and all long lists', () => {
  const resume = {
    name: 'Taylor Example',
    summary: 'Summary visible',
    experience: [{ role: 'Engineer', company: 'Acme', duration: '2021–2026', achievements: Array.from({ length: 9 }, (_, index) => `Achievement number ${index + 1}`) }],
    skills: [{ category: 'Engineering', items: Array.from({ length: 30 }, (_, index) => `Skill number ${index + 1}`) }],
    education: [{ degree: 'Degree visible', institution: 'University visible', graduationYear: 2021 }],
    projects: [{ name: 'Project visible', highlights: ['Project detail visible'] }],
    certifications: ['Certification visible'],
    customSection: { fieldName: 'Additional saved fact visible' },
  };
  const markup = renderToStaticMarkup(React.createElement(PacketResumeDocument, { resume }));
  const leaves = value => Array.isArray(value) ? value.flatMap(leaves) : value && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [String(value)];
  for (const value of leaves(resume)) assert.ok(markup.includes(value), `Missing review content: ${value}`);
  assert.match(markup, /Graduation Year/);
  assert.match(markup, /Custom Section/);
  assert.match(markup, /Field Name/);
});

test('saved text is rendered as text, including embedded markup and line breaks', () => {
  const markup = renderToStaticMarkup(React.createElement(PacketResumeDocument, { resume: { summary: '<script>alert(1)</script>\nSecond line', confirmed: false, count: 0 } }));
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /Second line/);
  assert.match(markup, />No</);
  assert.match(markup, />0</);
});

test('queue approval is offered only inside the drawer with server-resolved documents', () => {
  const source = fs.readFileSync(path.join(root, 'app/suite/agent/queue/QueueContent.tsx'), 'utf8');
  const cards = source.slice(source.indexOf('function QueueCard('), source.indexOf('function PacketReadinessCockpit('));
  assert.doesNotMatch(cards, /onApprove|Approve packet/);
  assert.match(cards, /Review packet/);
  assert.match(cards, /onClick=\{onSelect\}/);
  const drawer = source.slice(source.indexOf('function PacketDrawer('), source.indexOf('function QueueErrorState('));
  assert.match(drawer, /<PacketResumeDocument resume=\{item.review_source\}/);
  assert.match(drawer, /<PacketResumeDocument resume=\{item.review_resume\}/);
  assert.match(drawer, /Job description/);
  assert.match(drawer, /item.cover_letter/);
  assert.equal((drawer.match(/onClick=\{onApprove\}/g) || []).length, 1);
  assert.ok(drawer.indexOf('Complete prepared resume') < drawer.indexOf('onClick={onApprove}'));
});
