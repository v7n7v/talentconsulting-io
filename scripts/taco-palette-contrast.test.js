const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { accentContrastFailures } = require('./design-audit');
const root = path.resolve(__dirname, '..');

function fixture(t, transform) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-contrast-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of ['app/globals.css', 'components/taco-theme.css']) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    fs.writeFileSync(path.join(dir, file), transform ? transform(source, file) : source);
  }
  return dir;
}

test('current accent and primary actions pass in both themes across every surface', () => {
  assert.deepEqual(accentContrastFailures(root), []);
});
test('a low-contrast dark hover surface cannot silently pass through aliases', t => {
  const dir = fixture(t, (css, file) => file.endsWith('taco-theme.css')
    ? css.replace('--taco-surface-hover: #34302c;', '--taco-surface-hover: #ff9a83;') : css);
  assert.ok(accentContrastFailures(dir).some(f => f.startsWith('dark --bg-hover')));
});
test('a low-contrast light accent fails independently of dark mode', t => {
  const dir = fixture(t, (css, file) => file.endsWith('taco-theme.css')
    ? css.replace('--taco-coral-ink: #a82c18;', '--taco-coral-ink: #fffaf5;') : css);
  const failures = accentContrastFailures(dir);
  assert.ok(failures.some(f => f.startsWith('light --bg-deep')));
  assert.ok(!failures.some(f => f.startsWith('dark')));
});
test('cyclic aliases fail closed instead of reporting zero contrast failures', t => {
  const dir = fixture(t, (css, file) => file.endsWith('taco-theme.css')
    ? css.replace('--taco-accent-text: #ff9a83;', '--taco-accent-text: var(--accent);') : css);
  assert.ok(accentContrastFailures(dir).includes('dark accent is unresolved'));
});
test('filled action colors must be both resolved and readable', t => {
  const dir = fixture(t, (css, file) => file.endsWith('taco-theme.css')
    ? css.replace('--taco-action-ink: var(--taco-ink);', '--taco-action-ink: var(--missing-ink);') : css);
  assert.ok(accentContrastFailures(dir).includes('light action colors are unresolved'));
});
