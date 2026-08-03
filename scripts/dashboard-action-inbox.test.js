const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-dashboard-action-inbox-'));
const outfile = path.join(outdir, 'dashboard-action-inbox.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'dashboard-action-inbox.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const { buildDashboardActionInbox } = require(outfile);
const NOW = new Date('2026-07-10T12:00:00.000Z').getTime();

test('the dashboard inbox returns at most three priority-ordered actions', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    queue: [
      {
        id: 'packet-1',
        status: 'pending',
        company: 'Atlas',
        job_title: 'Security Engineer',
        match_score: 91,
        expires_at: '2026-07-11T12:00:00.000Z',
        sourceMeta: { sourceConfidence: 'high' },
      },
    ],
    applications: [
      { id: 'offer-1', status: 'offer', company_name: 'Beacon', job_title: 'Staff Engineer', created_at: '2026-07-01T12:00:00.000Z' },
      { id: 'interview-1', status: 'interview_scheduled', company_name: 'Cedar', job_title: 'Security Lead', interview_date: '2026-07-10T18:00:00.000Z', created_at: '2026-07-01T12:00:00.000Z' },
      { id: 'outcome-1', status: 'applied', company_name: 'Delta', job_title: 'Engineer', applied_at: '2026-07-01T12:00:00.000Z', created_at: '2026-07-01T12:00:00.000Z' },
    ],
  });

  assert.equal(result.total, 4);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map(item => item.kind), ['offer', 'packet', 'interview']);
  assert.equal(result.counts.outcome, 1);
});

test('one application produces only its most urgent action', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    applications: [{
      id: 'applied-1',
      status: 'applied',
      company_name: 'Atlas',
      job_title: 'Engineer',
      applied_at: '2026-06-30T12:00:00.000Z',
      created_at: '2026-06-30T12:00:00.000Z',
    }],
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].kind, 'outcome');
  assert.equal(result.items[0].actionLabel, 'Log outcome');
});

test('an interview tomorrow outranks a packet that expires later', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    queue: [{
      id: 'packet-later',
      status: 'pending',
      company: 'Atlas',
      job_title: 'Engineer',
      expires_at: '2026-07-15T12:00:00.000Z',
    }],
    applications: [{
      id: 'interview-tomorrow',
      status: 'interview_scheduled',
      company_name: 'Beacon',
      job_title: 'Security Lead',
      interview_date: '2026-07-11T12:00:00.000Z',
      created_at: '2026-07-01T12:00:00.000Z',
    }],
  });

  assert.deepEqual(result.items.map(item => item.kind), ['interview', 'packet']);
});

test('packet and application links bind exact bounded identities', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    queue: [{ id: 'packet / one', status: 'pending', company: 'A', job_title: 'Role' }],
    applications: [{
      id: 'app / one',
      status: 'interview_scheduled',
      company_name: 'B',
      job_title: 'Role',
      interview_date: '2026-07-12T12:00:00.000Z',
      created_at: '2026-07-01T12:00:00.000Z',
    }],
  });

  assert.match(result.items.find(item => item.kind === 'packet').href, /packet=packet%20%2F%20one$/);
  assert.match(result.items.find(item => item.kind === 'interview').href, /application=app%20%2F%20one$/);
});

test('terminal, fresh and incomplete records do not create false urgency', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    queue: [{ id: 'approved', status: 'approved' }],
    applications: [
      { id: 'fresh', status: 'applied', applied_at: '2026-07-09T12:00:00.000Z', created_at: '2026-07-09T12:00:00.000Z' },
      { id: 'done', status: 'accepted', created_at: '2026-07-01T12:00:00.000Z' },
      { id: 'ordinary-draft', status: 'not_applied', created_at: '2026-07-01T12:00:00.000Z' },
      { id: 'empty-offer', status: 'screening', offer_details: {}, created_at: '2026-07-01T12:00:00.000Z' },
    ],
  });

  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test('past and completed interviews hand off to a context-bound debrief', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    applications: [
      {
        id: 'past-scheduled',
        status: 'interview_scheduled',
        company_name: 'Atlas',
        job_title: 'Engineer',
        interview_date: '2026-07-09T12:00:00.000Z',
        created_at: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 'interview-outcome',
        status: 'interviewed',
        outcome_response: 'interview',
        company_name: 'Beacon',
        job_title: 'Lead',
        interview_date: '2026-07-08T12:00:00.000Z',
        created_at: '2026-07-01T12:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(result.items.map(item => item.kind), ['debrief', 'debrief']);
  assert.match(result.items[0].href, /^\/suite\/interview-sim\?mode=debrief_review&application=/);
});

test('saved and stale interviews do not create repeated or backwards actions', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    debriefedApplicationIds: ['already-debriefed'],
    applications: [
      {
        id: 'already-debriefed',
        status: 'interviewed',
        interview_date: '2026-07-09T12:00:00.000Z',
        created_at: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 'stale-scheduled',
        status: 'interview_scheduled',
        interview_date: '2026-06-20T12:00:00.000Z',
        created_at: '2026-06-01T12:00:00.000Z',
      },
    ],
  });

  assert.equal(result.total, 0);
});

test('debrief actions fail closed when debrief history is unavailable', () => {
  const result = buildDashboardActionInbox({
    now: NOW,
    allowDebriefActions: false,
    applications: [{
      id: 'already-debriefed-unknown',
      company_name: 'Careful Systems',
      job_title: 'Security Engineer',
      status: 'interviewed',
      interview_date: '2026-07-09T12:00:00.000Z',
    }],
  });

  assert.equal(result.total, 0);
});

test('dashboard UI is mobile-first, named and replaces duplicate queue widgets', () => {
  const component = fs.readFileSync(path.join(repoRoot, 'components/dashboard/DashboardActionInbox.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(repoRoot, 'app/suite/page.tsx'), 'utf8');
  const applications = fs.readFileSync(path.join(repoRoot, 'app/suite/applications/page.tsx'), 'utf8');
  const interview = fs.readFileSync(path.join(repoRoot, 'app/suite/interview-sim/page.tsx'), 'utf8');
  const debriefRoute = fs.readFileSync(path.join(repoRoot, 'app/api/agent/debriefs/route.ts'), 'utf8');

  assert.match(component, /The next decisions across packets, follow-ups, offers, and interviews/);
  assert.match(component, /item\.actionLabel/);
  assert.match(component, /min-h-\[96px\]/);
  assert.match(component, /min-h-11/);
  assert.match(component, /Showing a partial inbox/);
  assert.match(component, /Your workspace is unchanged/);
  assert.match(component, /Today could not be fully checked/);
  assert.match(component, /Applications \(\{inbox\.total - inbox\.counts\.packet\}\)/);
  assert.match(component, /Packet queue \(\{inbox\.counts\.packet\}\)/);
  assert.match(component, /requestId !== requestIdRef\.current/);
  assert.match(dashboard, /<DashboardActionInbox key=\{user\.uid\} \/>/);
  assert.doesNotMatch(dashboard, /<OutcomeCheckWidget \/>/);
  assert.doesNotMatch(dashboard, /<AgentQueueWidget \/>/);
  /* The parallel assertions against components/dashboard/UnifiedDashboard.tsx were dropped
     with that file - it had no importers, so it could not have rendered a duplicate widget. */
  assert.match(applications, /params\.get\('application'\)/);
  assert.match(applications, /params\.get\('action'\)/);
  assert.match(applications, /openDrawer\(targetApp\)/);
  assert.match(applications, /application-action-outcome/);
  assert.match(applications, /application-action-followup/);
  assert.match(applications, /application-action-offer/);
  assert.match(interview, /searchParams\.get\('application'\)/);
  assert.match(interview, /applicationsContextState === 'idle'/);
  assert.match(interview, /applyApplication\(requestedApplicationId\)/);
  assert.match(interview, /Application context needs attention/);
  assert.match(interview, /Retry application/);
  assert.match(interview, /ApplicationDebriefCapture/);
  assert.match(interview, /Save application debrief/);
  assert.match(interview, /applicationId: application\.id/);
  assert.match(debriefRoute, /collection\('applications'\)\.doc\(normalizedApplicationId\)\.get\(\)/);
  assert.match(debriefRoute, /verifiedApplicationId \? \{ applicationId: verifiedApplicationId \}/);
  assert.match(debriefRoute, /company: resolvedCompany, role: resolvedRole/);
  assert.match(debriefRoute, /doc\(`request_\$\{normalizedIdempotencyKey\}`\)/);
  assert.match(component, /allowDebriefActions/);
});
