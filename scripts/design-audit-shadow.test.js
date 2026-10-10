const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const scannerPath = path.join(__dirname, 'design-audit.js');
const auditProgram = "const result = require(process.argv[1]).audit(); process.stdout.write(JSON.stringify(result));";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-design-shadow-'));
  fs.mkdirSync(path.join(directory, 'app'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const probe = path.join(directory, 'app', 'probe.css');
  const measure = value => {
    fs.writeFileSync(probe, `.probe { box-shadow: ${value}; }\n`);
    return JSON.parse(execFileSync(process.execPath, ['-e', auditProgram, scannerPath], { cwd: directory, encoding: 'utf8' }));
  };
  return { directory, probe, measure };
}

test('design audit permits none with whitespace and important', t => {
  const { measure } = fixture(t);
  for (const value of ['none', '  none', 'none !important', '   none   !important  ']) {
    assert.equal(measure(value).metrics.prohibitedTotal, 0, `unexpected violation for ${value}`);
  }
});

test('design audit permits elevation tokens', t => {
  const { measure } = fixture(t);
  assert.equal(measure('var(--elevation-card)').metrics.prohibitedTotal, 0);
});

test('design audit still rejects raw decorative shadows and accent inset shadows', t => {
  const { measure } = fixture(t);
  for (const value of ['5px 5px 0 #151515', '0 2px 8px rgba(0,0,0,.16)', 'inset 0 -2px var(--accent)']) {
    const result = measure(value);
    assert.equal(result.metrics.prohibitedTotal, 1, `raw shadow escaped for ${value}`);
    assert.deepEqual(result.detail.prohibitedBreakdown, [['css-shadow', 1]]);
  }
});

test('none prefix does not hide another raw shadow', t => {
  const { measure } = fixture(t);
  assert.equal(measure('none, 0 2px 8px #151515').metrics.prohibitedTotal, 1);
});

test('mutating a permitted none shadow to a raw shadow fails the CI ratchet', t => {
  const { directory, probe, measure } = fixture(t);
  const baseline = measure('none');
  fs.writeFileSync(path.join(directory, '.design-audit-baseline.json'), JSON.stringify({ metrics: baseline.metrics }));
  fs.writeFileSync(probe, '.probe { box-shadow: 5px 5px 0 rgba(0,0,0,.16); }\n');
  const result = spawnSync(process.execPath, [scannerPath, '--ci'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /Prohibited class occurrences\s+1\s+WORSE \+1/);
  assert.match(result.stdout, /FAIL -/);
});
