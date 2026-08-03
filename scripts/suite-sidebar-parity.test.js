const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('esbuild');

const repoRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function loadTypeScriptModule(relativePath) {
  const source = read(relativePath);
  const { code } = transformSync(source, { format: 'cjs', loader: 'ts', target: 'node22' });
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, require);
  return loaded.exports;
}

test('main navigation and account settings share the same reference row', () => {
  const sidebar = read('components/SuiteSidebar.tsx');
  const settings = read('app/suite/settings/page.tsx');
  const row = read('components/navigation/NavigationRailRow.tsx');

  assert.match(sidebar, /import \{ NavigationRailRow \}/);
  assert.match(settings, /import \{ NavigationRailRow \}/);
  assert.match(sidebar, /<NavigationRailRow[\s\S]*label="Dashboard"/);
  assert.match(settings, /<NavigationRailRow[\s\S]*markerLayoutId="activeTab"/);

  assert.match(row, /min-h-\[62px\]/);
  assert.match(row, /rounded-xl px-4 py-3/);
  assert.match(row, /items-center gap-3/);
  assert.match(row, /h-6 w-6/);
  assert.match(row, /text-sm font-medium leading-5/);
  assert.match(row, /text-xs leading-4 text-\[var\(--text-secondary\)\]/);
  // The active marker is one shape and one token across both surfaces. It used
  // to be pinned to bg-emerald-500, which CLAUDE.md §6 names as "the stray
  // emerald" on its way out; --accent is what references/tokens.md reserves for
  // active navigation, and it follows whichever accent family lands.
  assert.match(row, /h-8 w-1\.5[\s\S]*bg-\[color:var\(--accent\)\]/);
  assert.doesNotMatch(row, /bg-emerald-500/);
});

test('sidebar is one continuous settings-style sheet without nested navigation cards', () => {
  const sidebar = read('components/SuiteSidebar.tsx');

  assert.match(sidebar, /width: shellWidth/);
  assert.match(sidebar, /getSidebarPresentation\(isMobile, isCollapsed, suppressDynamicBadges\)/);
  assert.match(sidebar, /rounded-2xl border border-\[var\(--theme-border\)\] bg-\[var\(--theme-bg-card\)\]/);
  assert.match(sidebar, /className="scrollbar-hide min-h-0 flex-1 space-y-1\.5 overflow-y-auto overflow-x-hidden p-2"/);
  assert.match(sidebar, /<\/nav>\s*<SidebarUtilityRows/);
  assert.match(sidebar, /className="shrink-0 space-y-1\.5 px-2 pb-2"/);
  assert.doesNotMatch(sidebar, /SidebarDensity|sidebarItemClass|iconShell|SidebarUpgradeCTA|SidebarCommandDock|AccountCapsule/);
  assert.doesNotMatch(sidebar, /layoutId="sidebarActiveIndicator"|bg-cyan-500\/15|rounded-\[16px\][^"]*bg-\[var\(--card-bg\)\]/);
});

test('route ownership and active state remain unambiguous', () => {
  const sidebar = read('components/SuiteSidebar.tsx');
  const { getSidebarUpgradeRouteOwner } = loadTypeScriptModule('lib/sidebar-navigation.ts');

  assert.match(sidebar, /pathname === '\/suite\/agent\/quality'/);
  assert.match(sidebar, /ROOT_TOOL_BY_ITEM_ID/);
  assert.match(sidebar, /!hasMappedRootTool/);
  assert.match(sidebar, /'\/suite\/agent\/queue'/);
  assert.match(sidebar, /'\/suite\/agent\/stories'/);
  assert.match(sidebar, /\['\/suite\/gallery', '\/suite\/cover-letter', '\/suite\/linkedin', '\/suite\/writing-tools'\]/);
  assert.equal(getSidebarUpgradeRouteOwner('free', '/suite/upgrade'), 'upgrade');
  assert.equal(getSidebarUpgradeRouteOwner('free', '/suite/upgrade?plan=studio'), 'upgrade');
  assert.equal(getSidebarUpgradeRouteOwner('pro', '/suite/upgrade'), 'explore-max');
  assert.equal(getSidebarUpgradeRouteOwner('pro', '/suite/upgrade?plan=studio'), 'explore-max');
  assert.equal(getSidebarUpgradeRouteOwner('studio', '/suite/upgrade?plan=studio'), null);
  assert.equal(getSidebarUpgradeRouteOwner('god', '/suite/upgrade'), null);
  assert.equal(getSidebarUpgradeRouteOwner('pro', '/suite/settings'), null);
});

test('mobile and collapsed menu behavior keeps the reference affordances accessible', () => {
  const sidebar = read('components/SuiteSidebar.tsx');
  const row = read('components/navigation/NavigationRailRow.tsx');
  const navigation = read('lib/sidebar-navigation.ts');
  const { getSidebarPresentation } = loadTypeScriptModule('lib/sidebar-navigation.ts');

  assert.match(navigation, /min\(320px, calc\(100vw - 20px\)\)/);
  assert.match(sidebar, /aria-controls="suite-sidebar"/);
  assert.match(sidebar, /\{isMobile && !isMobileOpen && \(/);
  assert.match(sidebar, /data-suite-menu-toggle="true"/);
  assert.match(sidebar, /role=\{isMobile && isMobileOpen \? 'dialog' : undefined\}/);
  assert.match(sidebar, /aria-hidden=\{isMobile && !isMobileOpen/);
  assert.match(sidebar, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(sidebar, /event\.key === 'Escape'/);
  assert.match(sidebar, /mobileToggleRef\.current\?\.focus\(\)/);
  assert.match(sidebar, /event\.key !== 'Tab'/);
  assert.match(sidebar, /event\.preventDefault\(\)/);
  assert.match(sidebar, /asideRef\.current\?\.querySelectorAll/);
  assert.match(sidebar, /returnFocusSelector=\{isMobile \? '\[data-suite-menu-toggle="true"\]'/);
  assert.doesNotMatch(sidebar, /const focusable = \[\s*mobileToggleRef\.current/);
  assert.match(sidebar, /aria-label="Close main menu"[\s\S]*close/);
  const authModal = read('components/modals/AuthModal.tsx');
  assert.match(authModal, /returnFocusSelector\?: string/);
  assert.match(authModal, /const explicitReturnTarget = returnFocusSelector/);
  assert.match(authModal, /const returnTarget = explicitReturnTarget/);
  assert.match(row, /aria-label=\{ariaLabel \|\| \(compact \? label : undefined\)\}/);
  assert.match(row, /title=\{title\}/);
  assert.match(row, /compact && active/);

  assert.deepEqual(getSidebarPresentation(false, true), {
    compact: true,
    width: 62,
    contentOffset: '86px',
  });
  assert.deepEqual(getSidebarPresentation(true, true), {
    compact: false,
    width: 'min(320px, calc(100vw - 20px))',
    contentOffset: '276px',
  });
  assert.deepEqual(getSidebarPresentation(false, false, true), {
    compact: false,
    width: 208,
    contentOffset: '228px',
  });
});

test('admin, guest, billing, plan, and Taco contracts survive the visual rewrite', () => {
  const sidebar = read('components/SuiteSidebar.tsx');

  assert.match(sidebar, /authFetch\('\/api\/admin\/session', \{ cache: 'no-store' \}\)/);
  assert.match(sidebar, /GUEST_PREVIEW_BY_SUITE_PATH/);
  assert.match(sidebar, /postAuthRedirect/);
  assert.match(sidebar, /authFetch\('\/api\/stripe\/portal', \{ method: 'POST' \}\)/);
  assert.match(sidebar, /\/suite\/settings\?tab=subscription/);
  assert.match(sidebar, /UPGRADE_COPY\.sidebarPlanChoice/);
  assert.match(sidebar, /label="Explore Max"/);
  assert.match(sidebar, /label="Free usage"/);
  assert.match(sidebar, /\{usageUsed\}\/\{usageCap\}/);
  assert.match(sidebar, /usageExhausted \? \(\) => onUpgrade\(\)/);
  assert.match(sidebar, /<AssistantMark/);
  assert.match(sidebar, /jobCountKey\(uid\)/);
});

test('workspace offset preserves the standard rail while allowing the bounded Admin rail', () => {
  const sidebar = read('components/SuiteSidebar.tsx');
  const navigation = read('lib/sidebar-navigation.ts');
  const frame = read('components/workspace/WorkspaceFrame.tsx');

  assert.match(sidebar, /sidebarPresentation\.contentOffset/);
  assert.match(navigation, /contentOffset: compact \? '86px' : adminCompact \? '228px' : '276px'/);
  assert.match(frame, /suite-sidebar-content-offset,276px/);
});
