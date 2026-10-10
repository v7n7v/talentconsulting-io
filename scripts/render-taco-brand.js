const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { renderTacoWordmark } = require('./render-taco-wordmark');

const repoRoot = path.join(__dirname, '..');
const publicDirectory = path.join(repoRoot, 'public');
const brandDirectory = path.join(publicDirectory, 'brand');
const canonicalMark = path.join(brandDirectory, 'talentconsulting-mark-512.png');
const canonicalWordmark = path.join(brandDirectory, 'talentconsulting-logo.png');

function encodeDataUrl(mimeType, buffer) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function recolor(buffer, color) {
  return sharp(buffer).ensureAlpha().tint(color).png().toBuffer();
}

async function extractMarkForeground(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const distanceFromWhite = 255 - Math.min(data[offset], data[offset + 1], data[offset + 2]);
    data[offset + 3] = Math.min(255, Math.max(0, Math.round((distanceFromWhite - 5) * 1.8)));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function markSvg(mark, { title, description }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title description"><title id="title">${title}</title><desc id="description">${description}</desc><image href="${encodeDataUrl('image/png', mark)}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

async function darkSurfaceWordmark() {
  const { data, info } = await sharp(canonicalWordmark).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    // Preserve every intentional blue accent from the canonical wordmark: the
    // A, the cut-in on the n, and the .io dot. The old x-bound kept only the A.
    const isBlueBrandAccent = alpha > 24
      && blue > 135
      && blue > red * 1.35
      && blue > green * 1.2;
    if (!isBlueBrandAccent) {
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
    }
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(path.join(brandDirectory, 'talentconsulting-logo-dark-surface.png'));
}

async function render() {
  const brandMark = await extractMarkForeground(await fs.promises.readFile(canonicalMark));
  const whiteMark = await recolor(brandMark, '#ffffff');
  const monochromeMark = await recolor(brandMark, '#102746');
  const description = 'The canonical blue A from the TalentConsulting company mark, used as Taco’s assistant icon.';
  const brandIcon = markSvg(brandMark, { title: 'Taco assistant mark', description });
  const whiteIcon = markSvg(whiteMark, { title: 'Taco assistant mark in white', description });
  const monochromeIcon = markSvg(monochromeMark, { title: 'Taco assistant monochrome mark', description });

  fs.writeFileSync(path.join(brandDirectory, 'taco-mark.svg'), brandIcon);
  fs.writeFileSync(path.join(brandDirectory, 'taco-mark-white.svg'), whiteIcon);
  fs.writeFileSync(path.join(brandDirectory, 'taco-mark-monochrome.svg'), monochromeIcon);
  await renderTacoWordmark(brandMark);

  for (const size of [16, 24, 32, 48, 64, 192, 512, 1024]) {
    await sharp(brandMark).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(brandDirectory, `taco-mark-${size}.png`));
  }

  await Promise.all([
    sharp(brandMark).resize(256, 256).png({ compressionLevel: 9 }).toFile(path.join(publicDirectory, 'taco-icon.png')),
    sharp(brandMark).resize(192, 192).png({ compressionLevel: 9 }).toFile(path.join(publicDirectory, 'taco-icon-192.png')),
    sharp(brandMark).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(publicDirectory, 'taco-icon-512.png')),
    sharp(brandMark).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(path.join(publicDirectory, 'taco-icon-1024.png')),
    sharp(brandMark).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(publicDirectory, 'taco-avatar.png')),
    darkSurfaceWordmark(),
  ]);

  console.log('Rendered Taco assets from the canonical TalentConsulting blue A mark.');
}

render().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
