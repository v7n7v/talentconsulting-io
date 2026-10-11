const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const installedCopies = (name) => Object.entries(lock.packages).filter(([p]) =>
  p === `node_modules/${name}` || p.endsWith(`/node_modules/${name}`));

test('installed minimatch consumers retain compatible brace APIs and matching behavior', () => {
  const copies = installedCopies('minimatch');
  assert.ok(copies.length > 0, 'No minimatch requester was exercised');
  const covered = new Set();
  for (const [location, metadata] of copies) {
    const consumer = createRequire(path.join(root, location, 'package.json'));
    const matcher = consumer(path.join(root, location));
    const match = typeof matcher === 'function' ? matcher : matcher.minimatch;
    const expansion = consumer('brace-expansion');
    const dependency = JSON.parse(fs.readFileSync(consumer.resolve('brace-expansion/package.json'), 'utf8'));
    const consumerMajor = Number(metadata.version.split('.')[0]);
    const expansionMajor = Number(dependency.version.split('.')[0]);
    if (consumerMajor === 3) {
      assert.equal(expansionMajor, 1, `${location} requires the v1 branch`);
      assert.equal(typeof expansion, 'function');
    } else if (consumerMajor === 10) {
      assert.equal(expansionMajor, 5, `${location} requires the v5 branch`);
      assert.equal(typeof expansion.expand, 'function');
    } else {
      assert.fail(`Review new minimatch consumer major ${consumerMajor} before accepting coverage`);
    }
    assert.equal(match('src/example.ts', '**/*.{js,ts}'), true, location);
    assert.equal(match('src/example.css', '**/*.{js,ts}'), false, location);
    assert.equal(match('alpha', '{alpha,beta}'), true, location);
    assert.ok(matcher.makeRe('a{b,c}').test('ab'), location);
    covered.add(consumerMajor);
  }
  assert.deepEqual([...covered].sort((a, b) => a - b), [3, 10]);
});

test('glob consumers discover the same bounded file set through brace patterns', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-glob-compat-'));
  try {
    fs.mkdirSync(path.join(directory, 'src'));
    for (const file of ['first.js', 'second.ts', 'style.css']) {
      fs.writeFileSync(path.join(directory, 'src', file), 'synthetic fixture\n');
    }
    const glob = require('glob');
    const fastGlob = require('fast-glob');
    const expected = ['src/first.js', 'src/second.ts'];
    assert.deepEqual((await glob.glob('src/*.{js,ts}', { cwd: directory })).sort(), expected);
    assert.deepEqual((await fastGlob('src/*.{js,ts}', { cwd: directory })).sort(), expected);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Chokidar observes local add, change and unlink after the graph update', { timeout: 20000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-watch-compat-'));
  const watcher = require('chokidar').watch(directory, {
    ignoreInitial: true, usePolling: true, interval: 25, atomic: false,
  });
  try {
    await once(watcher, 'ready', { signal: AbortSignal.timeout(5000) });
    const file = path.join(directory, 'fixture.ts');
    let event = once(watcher, 'add', { signal: AbortSignal.timeout(5000) });
    fs.writeFileSync(file, 'synthetic first version');
    assert.equal((await event)[0], file);
    event = once(watcher, 'change', { signal: AbortSignal.timeout(5000) });
    fs.appendFileSync(file, '\nsynthetic changed version');
    assert.equal((await event)[0], file);
    event = once(watcher, 'unlink', { signal: AbortSignal.timeout(5000) });
    fs.unlinkSync(file);
    assert.equal((await event)[0], file);
  } finally {
    await watcher.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('gRPC transports a synthetic unary response through a loopback channel', { timeout: 10000 }, async () => {
  const grpc = require('@grpc/grpc-js');
  const encode = value => Buffer.from(JSON.stringify(value));
  const decode = value => JSON.parse(value.toString('utf8'));
  const server = new grpc.Server();
  let client;
  try {
    server.addService({ echo: {
      path: '/taco.compatibility/Echo', requestStream: false, responseStream: false,
      requestSerialize: encode, requestDeserialize: decode,
      responseSerialize: encode, responseDeserialize: decode,
    } }, { echo: (call, callback) => callback(null, { received: call.request.value }) });
    const port = await new Promise((resolve, reject) => server.bindAsync(
      '127.0.0.1:0', grpc.ServerCredentials.createInsecure(),
      (error, bound) => error ? reject(error) : resolve(bound)));
    client = new grpc.Client(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
    const response = await new Promise((resolve, reject) => client.makeUnaryRequest(
      '/taco.compatibility/Echo', encode, decode, { value: 'synthetic fixture' },
      { deadline: Date.now() + 5000 }, (error, value) => error ? reject(error) : resolve(value)));
    assert.deepEqual(response, { received: 'synthetic fixture' });
  } finally {
    client?.close();
    server.forceShutdown();
  }
});

for (const name of ['firebase-admin', 'firebase-admin-a14c8a5423a75469']) {
  test(`${name} validates generated credentials without Forge or network I/O`, () => {
    const sdk = require(name);
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    for (const type of ['pkcs1', 'pkcs8']) {
      const credential = sdk.credential.cert({
        projectId: 'demo-taco-dependency-compatibility',
        clientEmail: 'fixture@example.invalid',
        privateKey: privateKey.export({ type, format: 'pem' }),
      });
      assert.equal(typeof credential.getAccessToken, 'function');
      // Do not call getAccessToken: this test exercises local parsing only.
    }
    assert.throws(() => sdk.credential.cert({
      projectId: 'demo-taco-dependency-compatibility',
      clientEmail: 'fixture@example.invalid',
      privateKey: 'synthetic invalid key',
    }));
    assert.equal(installedCopies('node-forge').length, 0, 'Forge remains in the candidate graph');
  });
}

test('DOCX and Mammoth preserve Unicode and long document text', async () => {
  const { Document, Packer, Paragraph } = require('docx');
  const mammoth = require('mammoth');
  const text = 'Synthetic résumé: C++, C#, Node.js — São Paulo. '.repeat(100);
  const buffer = await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph(text), new Paragraph('Evidence unavailable.')] }],
  }));
  const extracted = await mammoth.extractRawText({ buffer });
  assert.ok(extracted.value.includes(text));
  assert.ok(extracted.value.includes('Evidence unavailable.'));
});

test('Sharp decodes and resizes PNG, JPEG, WebP and AVIF; malformed bytes reject', async () => {
  const sharp = require('sharp');
  for (const format of ['png', 'jpeg', 'webp', 'avif']) {
    const image = await sharp({ create: {
      width: 32, height: 24, channels: 3, background: { r: 20, g: 90, b: 150 },
    } }).toFormat(format).toBuffer();
    const resized = await sharp(image, { limitInputPixels: 10000 }).resize(16, 12).png().toBuffer();
    const metadata = await sharp(resized).metadata();
    assert.equal(metadata.width, 16);
    assert.equal(metadata.height, 12);
  }
  await assert.rejects(sharp(Buffer.from('synthetic malformed bytes'), { limitInputPixels: 10000 }).metadata());
});
