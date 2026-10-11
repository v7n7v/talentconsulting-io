const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { code } = transformSync(read('lib/workspace-navigation.ts'), { format: 'cjs', loader: 'ts', target: 'node22' });
const loaded = { exports: {} };
new Function('module', 'exports', code)(loaded, loaded.exports);
const { workspaceDestinations, workspaceRoutes, primaryWorkspaceDestinations, workspaceQuickActions, getWorkspaceRoute, isWorkspaceDestinationActive, getGuestWorkspaceHref } = loaded.exports;

function pageRoutes(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return pageRoutes(path.join(directory, entry.name), `${prefix}/${entry.name}`);
    return entry.name === 'page.tsx' ? [prefix] : [];
  });
}

test('the manifest accounts for every suite page without exposing admin or design pages as customer tools', () => {
  const pages = pageRoutes(path.join(root, 'app/suite'), '/suite').sort();
  assert.equal(pages.length, 43);
  assert.deepEqual(workspaceRoutes.map(route => route.path).sort(), pages);
  assert.equal(new Set(workspaceRoutes.map(route => route.path)).size, pages.length);
  assert.equal(new Set(workspaceDestinations.map(item => item.id)).size, workspaceDestinations.length);
  assert.equal(new Set(workspaceDestinations.map(item => item.path)).size, workspaceDestinations.length);
  for (const item of workspaceDestinations) {
    assert.ok(getWorkspaceRoute(item.path), item.path);
    assert.ok(!['admin', 'internal'].includes(item.section));
  }
});

test('five canonical workflow destinations stay independent from explicitly labeled query shortcuts', () => {
  assert.deepEqual(primaryWorkspaceDestinations.map(item => [item.label, item.path]), [
    ['Home', '/suite'], ['Resumes', '/suite/resume'], ['Find roles', '/suite/job-search'],
    ['Applications', '/suite/applications'], ['Interview prep', '/suite/interview-sim'],
  ]);
  assert.equal(workspaceDestinations.find(item => item.id === 'gallery').path, '/suite/gallery');
  assert.equal(workspaceQuickActions.find(item => item.id === 'due-follow-ups').path, '/suite/applications?mobileView=followups');
  assert.equal(workspaceQuickActions.find(item => item.id === 'start-mock-interview').path, '/suite/interview-sim?mode=quick_drill');
  assert.equal(workspaceDestinations.filter(item => item.placement === 'writing').length, 8);
});

test('direct, query and compatibility links have one workflow owner; assistant does not absorb its child tools', () => {
  const cases = [
    ['/suite', 'home'], ['/suite/resume?mobileAction=check', 'experience'], ['/suite/ats-score', 'experience'],
    ['/suite/ats-preview?module=proof-engine', 'experience'], ['/suite/agent/stories#saved', 'experience'],
    ['/suite/market-oracle', 'roles'], ['/suite/agent/queue?packet=123', 'applications'],
    ['/suite/agent/quality', 'applications'], ['/suite/cover-letter', 'applications'], ['/suite/negotiate', 'applications'],
    ['/suite/applications?mobileView=followups', 'applications'], ['/suite/interview-debrief', 'interviews'],
    ['/suite/flashcards', 'interviews'], ['/suite/agent?intent=resume-upload', 'assistant'],
  ];
  for (const [href, owner] of cases) {
    assert.equal(getWorkspaceRoute(href).section, owner, href);
    assert.equal(isWorkspaceDestinationActive(owner, href), true, href);
    const primaryOwners = primaryWorkspaceDestinations.filter(item => isWorkspaceDestinationActive(item.id, href));
    assert.equal(primaryOwners.length, owner === 'assistant' ? 0 : 1, href);
  }
  assert.equal(isWorkspaceDestinationActive('assistant', '/suite/agent/stories'), false);
  assert.equal(isWorkspaceDestinationActive('gallery', '/suite/gallery/taco'), false);
  assert.equal(getWorkspaceRoute('/suite/job-search-malformed'), undefined);
  assert.equal(getWorkspaceRoute('/suite/vault').canonicalPath, '/suite/skill-bridge?view=memory');
});

test('guest entry preserves supported tools and query modes without claiming access to protected workflows', () => {
  assert.equal(getGuestWorkspaceHref('/suite/resume'), '/suite/resume');
  assert.equal(getGuestWorkspaceHref('/suite/resume?mobileAction=check'), '/suite/resume?mobileAction=check');
  assert.equal(getGuestWorkspaceHref('/suite/agent?intent=resume-upload'), '/suite/agent?intent=resume-upload');
  assert.equal(getGuestWorkspaceHref('/suite/ats-analyzer'), '/suite/ats-analyzer?tab=score');
  assert.equal(getGuestWorkspaceHref('/suite/ats-preview'), '/suite/ats-analyzer?tab=score');
  assert.equal(getGuestWorkspaceHref('/suite/gallery?tool=grammar-checker'), '/suite/gallery?tool=grammar-checker');
  assert.equal(getGuestWorkspaceHref('/suite/writing-tools'), '/tools/ai-humanizer');
  for (const href of ['/suite/applications', '/suite/agent/queue', '/suite/settings', '/suite/admin', '/suite/gallery/taco']) {
    assert.equal(getGuestWorkspaceHref(href), undefined, href);
  }
});

test('all navigation surfaces consume the contract and mobile tools retain modal focus behavior', () => {
  for (const file of ['components/SuiteSidebar.tsx', 'components/mobile/MobileWorkbench.tsx']) {
    const source = read(file);
    assert.match(source, /from '@\/lib\/workspace-navigation'/, file);
    assert.match(source, /getGuestWorkspaceHref/, file);
    assert.doesNotMatch(source, /tool\.mobileHref \|\| tool\.path/, file);
  }
  const mobile = read('components/mobile/MobileWorkbench.tsx');
  assert.match(mobile, /primaryWorkspaceDestinations/);
  assert.match(mobile, /workspaceQuickActions/);
  assert.match(mobile, /event\.key === 'Tab'/);
  assert.match(mobile, /event\.key === 'Escape'/);
  assert.match(mobile, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(mobile, /returnTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(mobile, /window\.removeEventListener\('resize', onResize\)/);
});
