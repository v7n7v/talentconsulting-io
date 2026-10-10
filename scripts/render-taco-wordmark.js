const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const brandDirectory = path.join(__dirname, '..', 'public', 'brand');

// Keep the real assistant A, including its fold, rather than generating or
// redrawing a lookalike. SVG composes the existing mark with geometric lettering.
function foldedMark(mark) {
  const source = `data:image/png;base64,${mark.toString('base64')}`;
  // The original blue gradient is the identity on every surface. Never tint it.
  return `<svg width="342" height="256" viewBox="84 132 345 259"><image href="${source}" width="512" height="512"/></svg>`;
}

function wordmarkSvg(mark, { light = false } = {}) {
  const ink = light ? '#fffaf5' : '#151515';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1188 288" role="img" aria-labelledby="title description"><title id="title">Taco</title><desc id="description">TACO with the canonical folded A as its second letter.</desc><g transform="translate(16 16)" fill="${ink}"><path d="M18 0H230L248 24L230 48H154V256H94V48H18L0 24Z"/><g transform="translate(218 0)">${foldedMark(mark)}</g><path transform="translate(596 0)" d="M254 38L215 74C197 57 174 48 145 48C91 48 56 80 56 128C56 176 91 208 145 208C174 208 199 199 218 182L255 218C226 246 190 260 145 260C57 260 0 207 0 128C0 49 59-4 145-4C189-4 225 10 254 38Z"/><path transform="translate(884 -4)" fill-rule="evenodd" d="M88 0H184Q272 0 272 88V176Q272 264 184 264H88Q0 264 0 176V88Q0 0 88 0ZM92 52Q56 52 56 92V172Q56 212 92 212H180Q216 212 216 172V92Q216 52 180 52Z"/></g></svg>`;
}

async function renderTacoWordmark(mark) {
  const source = mark || await fs.readFile(path.join(brandDirectory, '..', 'taco-icon-512.png'));
  const directory = path.join(brandDirectory, 'taco');
  await fs.mkdir(directory, { recursive: true });
  const ink = wordmarkSvg(source);
  const light = wordmarkSvg(source, { light: true });
  const symbol = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 374 288" role="img" aria-label="Taco"><g transform="translate(16 16)">${foldedMark(source)}</g></svg>`;
  await Promise.all([
    fs.writeFile(path.join(directory, 'taco-folded-ink.svg'), ink),
    fs.writeFile(path.join(directory, 'taco-folded-light.svg'), light),
    fs.writeFile(path.join(directory, 'taco-folded-symbol-light.svg'), symbol),
    fs.writeFile(path.join(directory, 'taco-symbol.svg'), symbol),
    fs.writeFile(path.join(brandDirectory, '..', 'favicon.svg'), symbol),
    sharp(source).resize(180, 180).png().toFile(path.join(brandDirectory, '..', 'taco-icon-180.png')),
    // Historical export URLs now resolve to the same identity.
    fs.writeFile(path.join(brandDirectory, 'taco-wordmark.svg'), ink),
    fs.writeFile(path.join(brandDirectory, 'taco-wordmark-white.svg'), light),
    sharp(Buffer.from(ink)).png().toFile(path.join(directory, 'taco-folded-ink.png')),
  ]);
  const faviconPng = await sharp(source).resize(32, 32).png().toBuffer();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico[6] = 32; ico[7] = 32;
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(faviconPng.length, 14); ico.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(brandDirectory, '..', 'favicon.ico'), Buffer.concat([ico, faviconPng]));
}


module.exports = { renderTacoWordmark };

if (require.main === module) {
  renderTacoWordmark().then(() => {
    console.log('Rendered folded-A Taco wordmarks from the existing assistant mark.');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
