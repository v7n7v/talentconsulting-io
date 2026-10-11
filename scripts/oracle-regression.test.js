const assert = require('node:assert/strict');
const test = require('node:test');
const { build } = require('esbuild');

let oracle;
test.before(async () => {
  await build({ entryPoints: ['lib/oracle-v2.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '/tmp/taco-oracle-regression.cjs', logLevel: 'silent' });
  oracle = require('/tmp/taco-oracle-regression.cjs');
});

test('salary parser requires compensation context and preserves currency and period', () => {
  assert.equal(oracle.extractSalaryRange('Serve 100-200k customers each year.'), null);
  const annual = oracle.extractSalaryRange('Salary: £80k-£100k annually.');
  assert.deepEqual({ min: annual.min, max: annual.max, currency: annual.currency, period: annual.period }, { min: 80000, max: 100000, currency: 'GBP', period: 'year' });
  const hourly = oracle.extractSalaryRange('Pay: $50-$70 per hour.');
  assert.deepEqual({ min: hourly.min, max: hourly.max, currency: hourly.currency, period: hourly.period }, { min: 50, max: 70, currency: 'USD', period: 'hour' });
});

test('skills honor negation and token boundaries', () => {
  const skills = oracle.extractOracleSkills('Maintained restaurant schedules. No Python experience. No AI or REST work.');
  assert.equal(skills.includes('Python'), false);
  assert.equal(skills.includes('AI'), false);
  assert.equal(skills.includes('REST'), false);
});

test('requirements cannot be simultaneously covered and missing', () => {
  const report = oracle.buildOracleV2Report({
    session: { resumeText: 'I build software using Python.', jdText: 'Python required.', role: 'Engineer' },
    legacy: { fitScore: 90, resumeSkills: ['Python'], jdRequirements: ['Python required'], matchedSkills: ['Python'], gapSkills: [] },
    modelDecision: { coveredRequirements: [], missingRequirements: [], proofGaps: [] },
  });
  assert.deepEqual(report.breakdown.coveredRequirements, ['Python required.']);
  assert.deepEqual(report.breakdown.missingRequirements, []);
  assert.equal(report.breakdown.requirementEvidence[0].status, 'supported');
});

test('unsupported hidden signals and unsupported experience heuristics are omitted', () => {
  const report = oracle.buildOracleV2Report({
    session: { resumeText: 'Senior engineer.', jdText: 'Office warranty lasts 5 years.', role: 'Engineer' },
    legacy: { fitScore: 80, hiddenRequirements: [{ stated: 'No such phrase', actual: 'Elite degree' }] },
  });
  assert.equal(report.breakdown.risks.some(risk => risk.title.includes('Experience proof')), false);
  assert.deepEqual(report.breakdown.hiddenScreenSignals, []);
});

test('compound requirements retain the whole posting statement and cannot be covered by one skill', () => {
  const requirement = 'At least 5 years of Python and AWS production leadership required.';
  const report = oracle.buildOracleV2Report({session:{resumeText:'Built Python scripts.',jdText:requirement},legacy:{resumeSkills:['Python','AWS'],matchedSkills:['Python','AWS'],jdRequirements:['Python']},modelDecision:{requirementEvidence:[{requirement:'Python',postingQuote:'Python',resumeQuote:'Built Python scripts.'}],coveredRequirements:['Python'],summary:'All requirements met.',riskScore:0,readinessScore:100,verdict:'apply'}});
  assert.deepEqual(report.breakdown.coveredRequirements,[]);
  assert.equal(report.breakdown.requirementEvidence.length,1);
  const evidence=report.breakdown.requirementEvidence[0];assert.equal(evidence.requirement,requirement);assert.equal(evidence.status,'partial');assert.equal(evidence.sourceSpan.text,requirement);
  assert.deepEqual(report.breakdown.keywordMap.found,['Python']);assert.ok(report.breakdown.keywordMap.missing.includes('AWS'));
  assert.notEqual(report.decision.verdict,'apply');assert.doesNotMatch(report.decision.summary,/All requirements met/);
  assert.equal(report.decision.readinessScore,null);assert.equal(report.breakdown.factorScores.qualifications,null);
});
test('model arrays, fabricated quotes and negative evidence never establish positive coverage',()=>{
 const report=oracle.buildOracleV2Report({session:{resumeText:'No Python experience. Security clearance: none.',jdText:'Python required.'},legacy:{resumeSkills:['Python','Security clearance'],matchedSkills:['Python'],jdRequirements:['Python required.','Current active security clearance']},modelDecision:{requirementEvidence:[{requirement:'Python',postingQuote:'Python required.',resumeQuote:'Python experience.'}],hiddenScreenSignals:[{signal:'Elite degree required',confidence:'high',evidence:'Python required.'}],proofGaps:['Candidate lacks talent'],summary:'Excellent fit'}});
 assert.deepEqual(report.breakdown.keywordMap.found,[]);assert.deepEqual(report.breakdown.coveredRequirements,[]);assert.equal(report.decision.fitScore,0);
 assert.equal(report.breakdown.requirementEvidence.find(r=>r.requirement.includes('clearance')).status,'needs_clarification');
 assert.equal(report.breakdown.requirementEvidence[0].resumeSourceSpan,undefined);assert.deepEqual(report.breakdown.hiddenScreenSignals,[]);
 assert.doesNotMatch(JSON.stringify(report),/Elite degree|lacks talent|Excellent fit/);
});
test('skill matching checks each contextual occurrence and escaped punctuation',()=>{
 assert.ok(oracle.extractOracleSkills('No Python work previously. Built Python services this year.').includes('Python'));
 assert.ok(oracle.extractOracleSkills('Used Node.js and Next.js in production.').includes('Node.js'));
 assert.equal(oracle.extractOracleSkills('Used NodeXjs.').includes('Node.js'),false);
 assert.deepEqual(oracle.extractOracleSkills('Python: none. AWS is not a skill I have. Maintained restaurant schedules.'),[]);
});
test('salary parsing skips unrelated first ranges, preserves original spans and monthly units',()=>{
 const text='Manage 100-200k customers.\n\nSalary:  $800 - $950 per month.';
 const salary=oracle.extractSalaryRange(text);assert.equal(salary.min,800);assert.equal(salary.max,950);assert.equal(salary.period,'month');assert.equal(text.slice(salary.sourceSpan.start,salary.sourceSpan.end),salary.sourceSpan.text);
 assert.equal(oracle.extractSalaryRange('Salary $80,500-$95,500 per year.').min,80500);
 assert.equal(oracle.extractSalaryRange('Salary €100k-€120k per year.').currency,'EUR');
 assert.equal(oracle.extractSalaryRange('Salary $50-$70 without a stated period.'),null);
 assert.equal(oracle.extractSalaryRange('Salary $50-£70 per hour.'),null);
});
test('no posting evidence means unknown scores; exact quotes cannot imply whole qualifications',()=>{
 const report=oracle.buildOracleV2Report({session:{resumeText:'I build Python applications.',role:'Engineer'},legacy:{fitScore:99,jdRequirements:['AWS required'],matchedSkills:['AWS']},modelDecision:{readinessScore:99,riskScore:0,confidence:'high',verdict:'apply'}});
 assert.equal(report.decision.fitScore,null);assert.equal(report.decision.riskScore,null);assert.equal(report.decision.interviewYield.score,null);assert.equal(report.decision.confidence,'low');assert.deepEqual(report.breakdown.coveredRequirements,[]);
});

test('canonical skill labels are proven by the alias the resume actually uses', () => {
  assert.deepEqual(
    oracle.extractOracleSkills('Built backend services in Golang and Postgres on k8s.').sort(),
    ['Go', 'Kubernetes', 'PostgreSQL'],
  );
  assert.deepEqual(
    oracle.extractOracleSkills('Shipped Go services on Kubernetes with PostgreSQL.').sort(),
    ['Go', 'Kubernetes', 'PostgreSQL'],
  );
});

test('a Go requirement is supported by a resume that says Golang, quoting the written text', () => {
  const report = oracle.buildOracleV2Report({
    session: { resumeText: 'I build backend services in Golang.', jdText: 'Go required.', role: 'Engineer' },
    legacy: { fitScore: 80, resumeSkills: ['Go'], jdRequirements: ['Go required'], matchedSkills: ['Go'], gapSkills: [] },
    modelDecision: { coveredRequirements: [], missingRequirements: [], proofGaps: [] },
  });
  assert.deepEqual(report.breakdown.missingRequirements, []);
  assert.equal(report.breakdown.requirementEvidence[0].status, 'supported');
  assert.match(JSON.stringify(report.breakdown.requirementEvidence[0]), /Golang/);
});
