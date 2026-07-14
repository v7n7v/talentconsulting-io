const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

test('Job Search presents a top-three-first mobile review without reducing desktop results', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(page, /const topThreeJobs = jobs\.slice\(0, 3\)/);
  assert.match(page, /const remainingJobs = jobs\.slice\(3\)/);
  assert.match(page, /Reviewing the strongest three first\./);
  assert.match(page, /className=\{`\$\{mobileReviewExpanded \? 'mt-3 grid' : 'hidden'\} gap-3 lg:mt-3 lg:grid`\}/);
  assert.match(page, /aria-expanded=\{mobileReviewExpanded\}/);
  assert.match(page, /aria-controls="remaining-ranked-roles"/);
  assert.match(page, /Show all \$\{jobs\.length\} roles/);
  assert.match(page, /Show top 3 only/);
  assert.match(page, /Pick \{rank\}/);
  assert.match(page, /lg:hidden/);
});

test('mobile review controls remain named, touchable and recover selection when collapsed', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(page, /if \(!nextExpanded && !topThreeJobs\.some\(job => getJobResultIdentity\(job\) === selectedId\)\) onSelect\(topThreeJobs\[0\]\)/);
  assert.match(page, /Review details/);
  assert.match(page, /aria-label="Close role details"/);
  assert.match(page, /aria-pressed=\{selected\}/);
  assert.match(page, /aria-controls="opportunity-intelligence-panel"/);
  assert.match(page, /min-h-11 flex-1/);
  assert.match(page, /min-h-11 items-center justify-center whitespace-nowrap/);
  assert.match(page, /className=\{`min-h-11 rounded-\[9px\]/);
  assert.match(page, /min-h-11 min-w-0 rounded-\[11px\]/);
});

test('packet preparation fails closed when recommendation evidence is not ready', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const widget = fs.readFileSync(path.join(repoRoot, 'components/JobFeedWidget.tsx'), 'utf8');

  assert.match(page, /preparationEligible: job\.preparationEligible === true/);
  assert.match(page, /sourceConfidence: job\.sourceMeta\?\.sourceConfidence \|\| 'low'/);
  assert.match(page, /if \(!job\.preparationEligible\) \{/);
  assert.match(page, /Review required before packet work/);
  assert.match(page, /Save for review/);
  assert.match(page, /canPrepare \? 'Prepare' : job\.nextAction/);
  assert.match(page, /packet\?\.recovery\?\.nextAction \|\| 'Review packet'/);
  assert.match(page, /packet\?\.recovery\?\.action === 'retry_packet'/);
  assert.match(page, /if \(canRetryPacket \|\| \(canPrepare && !packetNeedsRecovery\)\) onPrepare\(\)/);
  assert.ok(
    page.indexOf('if (!job.preparationEligible) {') < page.indexOf("recordLedgerStatus(job, 'queued', ['packet_requested'])"),
    'eligibility must be checked before queue learning or packet work',
  );
  assert.match(widget, /if \(job\.preparationEligible !== true\) \{/);
  assert.match(widget, /job\.sourceMeta\?\.sourceConfidence \|\| 'low'/);
  assert.match(widget, /job\.riskNotes\?\.\[0\]/);
  assert.match(widget, /job\.preparationEligible === true \? 'Morph' : job\.nextAction \|\| 'Review evidence'/);
  assert.match(widget, /Open posting/);
  assert.doesNotMatch(widget, />\s*Apply\s*</);
  assert.match(page, /outboundLinkVerified: job\.outboundLinkVerified === true/);
  assert.match(page, /job\.outboundLinkVerified && job\.url/);
  assert.doesNotMatch(page, /\{job\.url && job\.url !== '#' && \(/);
});

test('a changed ranked set collapses back to the top-three review', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(page, /const mobileReviewKey = `\$\{topThreeJobs\.map\(getJobResultIdentity\)\.join\('\|'\)\}:\$\{jobs\.length\}`/);
  assert.match(page, /setMobileReviewExpanded\(false\)/);
  assert.match(page, /\[mobileReviewKey\]/);
  assert.match(page, /window\.matchMedia\('\(max-width: 1023px\)'\)/);
  assert.match(page, /!topThreeJobs\.some\(job => getJobResultIdentity\(job\) === selectedId\)/);
});

test('selection and packet state use stable identity and cannot expose a filtered-out role', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(page, /filteredJobs\.find\(job => getJobResultIdentity\(job\) === selectedJobKey\)/);
  assert.match(page, /setSelectedJobKey\(getJobResultIdentity\(job\)\)/);
  assert.match(page, /packet=\{packets\[getJobResultIdentity\(job\)\]\}/);
  assert.match(page, /const packetKey = getJobResultIdentity\(job\)/);
  assert.doesNotMatch(page, /packets\[job\.id\]/);
});

test('feedback state is scoped to stable role identity across async selection changes', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');

  assert.match(page, /const jobIdentity = job \? getJobResultIdentity\(job\) : null/);
  assert.match(page, /\}, \[jobIdentity\]\)/);
  assert.match(page, /const feedbackJobIdentity = getJobResultIdentity\(job\)/);
  assert.match(page, /activeJobIdentityRef\.current !== feedbackJobIdentity/);
  assert.doesNotMatch(page, /\}, \[job\?\.id\]\)/);
});

test('the disclosure precedes hidden cards so forward keyboard navigation reaches them', () => {
  const page = fs.readFileSync(path.join(repoRoot, 'app/suite/job-search/page.tsx'), 'utf8');
  const disclosureIndex = page.indexOf('aria-controls="remaining-ranked-roles"');
  const regionIndex = page.indexOf('id="remaining-ranked-roles"');

  assert.ok(disclosureIndex > 0);
  assert.ok(regionIndex > disclosureIndex);
});
