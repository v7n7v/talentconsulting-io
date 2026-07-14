const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  '.next/cache',
  '.next/dev',
  '.next/diagnostics',
  '.firebase/talent-consulting-acf16/functions/.next/cache',
  '.firebase/talent-consulting-acf16/functions/.next/dev',
  '.firebase/talent-consulting-acf16/functions/.next/diagnostics',
];

for (const target of targets) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) continue;
  fs.rmSync(absolute, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}

console.log('Firebase predeploy cache cleanup complete.');

