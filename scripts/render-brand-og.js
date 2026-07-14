#!/usr/bin/env node

const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const brandDir = path.join(root, 'public', 'brand');
const input = path.join(brandDir, 'career-command-center-v1.png');
const output = path.join(brandDir, 'brand-og-v2.png');

const fontCandidates = [
  '/System/Library/Fonts/HelveticaNeue.ttc',
  '/System/Library/Fonts/SFNS.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

const font = fontCandidates.find(existsSync) || 'Helvetica';

if (!existsSync(input)) {
  console.error(`Missing source image: ${input}`);
  process.exit(1);
}

const args = [
  input,
  '-resize', '1200x630^',
  '-gravity', 'center',
  '-extent', '1200x630',
  '(', '-size', '1200x630', 'xc:rgba(7,18,15,0.52)', ')',
  '-compose', 'over',
  '-composite',
  '(', '-size', '1200x630', 'gradient:rgba(7,18,15,0.72)-rgba(7,18,15,0.08)', '-rotate', '90', '-resize', '1200x630!', ')',
  '-compose', 'over',
  '-composite',
  '(', '-size', '1200x630', 'gradient:rgba(7,18,15,0.00)-rgba(7,18,15,0.42)', ')',
  '-compose', 'over',
  '-composite',
  '-gravity', 'NorthWest',
  '-font', font,
  '-fill', '#34d399',
  '-draw', 'circle 96,104 110,104',
  '-fill', '#ecfdf5',
  '-draw', 'circle 96,104 102,104',
  '-fill', '#f8fffb',
  '-pointsize', '42',
  '-weight', '700',
  '-annotate', '+120+82', 'TalentConsulting',
  '-fill', '#f8fffb',
  '-pointsize', '76',
  '-weight', '800',
  '-annotate', '+94+394', 'Career intelligence',
  '-fill', '#d7f7ed',
  '-pointsize', '31',
  '-weight', '500',
  '-annotate', '+98+498', 'Proved, prepared, and ready for the next move.',
  output,
];

const result = spawnSync('magick', args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
