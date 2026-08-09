const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

function loadSuperTonic() {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-supertonic-tts-'));
  const outfile = path.join(outdir, 'supertonic-tts.cjs');
  buildSync({
    entryPoints: [path.join(__dirname, '..', 'lib', 'ai', 'supertonic-tts.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  return require(outfile);
}

const {
  synthesize,
  getSuperTonicConfig,
  isSuperTonicConfigured,
  SuperTonicError,
} = loadSuperTonic();

const ENV_KEYS = ['TTS_BASE_URL', 'TTS_API_KEY'];

function withEnv(values, fn) {
  const previous = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
}

const CONFIG = { baseUrl: 'https://tts.example.com', apiKey: 'secret-token' };

function mp3Response(bytes = [0x49, 0x44, 0x33]) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' },
  });
}

// ── config validation (SSRF surface) ──

test('getSuperTonicConfig returns null when TTS_BASE_URL is unset', () => {
  withEnv({}, () => {
    assert.equal(getSuperTonicConfig(), null);
    assert.equal(isSuperTonicConfigured(), false);
  });
});

test('getSuperTonicConfig accepts https and loopback http, strips trailing slash', () => {
  withEnv({ TTS_BASE_URL: 'https://tts.example.com/', TTS_API_KEY: 'k' }, () => {
    assert.deepEqual(getSuperTonicConfig(), { baseUrl: 'https://tts.example.com', apiKey: 'k' });
  });
  withEnv({ TTS_BASE_URL: 'http://localhost:9010', TTS_API_KEY: '' }, () => {
    assert.deepEqual(getSuperTonicConfig(), { baseUrl: 'http://localhost:9010', apiKey: '' });
    assert.equal(isSuperTonicConfigured(), true);
  });
});

test('getSuperTonicConfig rejects non-loopback http, embedded creds, and garbage', () => {
  withEnv({ TTS_BASE_URL: 'http://10.0.0.5:8080' }, () => assert.equal(getSuperTonicConfig(), null));
  withEnv({ TTS_BASE_URL: 'https://user:pass@tts.example.com' }, () => assert.equal(getSuperTonicConfig(), null));
  withEnv({ TTS_BASE_URL: 'not a url' }, () => assert.equal(getSuperTonicConfig(), null));
  withEnv({ TTS_BASE_URL: 'ftp://tts.example.com' }, () => assert.equal(getSuperTonicConfig(), null));
});

// ── synthesize: happy path ──

test('synthesize posts to /speak with token header and returns audio buffer', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return mp3Response([1, 2, 3, 4]);
  };

  const result = await synthesize({
    text: 'Hello there',
    voiceSid: 4,
    fetchImpl,
    config: CONFIG,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tts.example.com/speak');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-TTS-Token'], 'secret-token');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, { text: 'Hello there', sid: 4, speed: 1.0, format: 'mp3' });

  assert.ok(Buffer.isBuffer(result.audio));
  assert.deepEqual([...result.audio], [1, 2, 3, 4]);
  assert.equal(result.headers['content-type'], 'audio/mpeg');
});

test('synthesize reads env config when no explicit config is passed', async () => {
  await withEnv({ TTS_BASE_URL: 'https://tts.example.com', TTS_API_KEY: 'env-token' }, async () => {
    let seenToken;
    const fetchImpl = async (url, init) => {
      seenToken = init.headers['X-TTS-Token'];
      return mp3Response();
    };
    const result = await synthesize({ text: 'hi', voiceSid: 0, fetchImpl });
    assert.equal(seenToken, 'env-token');
    assert.ok(result.audio.length > 0);
  });
});

// ── synthesize: typed error mapping ──

test('synthesize throws not-configured when no config is available', async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      () => synthesize({ text: 'hi', voiceSid: 0, fetchImpl: async () => mp3Response() }),
      (err) => err instanceof SuperTonicError && err.kind === 'not-configured',
    );
  });
});

test('synthesize maps a network failure to kind "unreachable"', async () => {
  await assert.rejects(
    () => synthesize({
      text: 'hi',
      voiceSid: 0,
      config: CONFIG,
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    }),
    (err) => err instanceof SuperTonicError && err.kind === 'unreachable',
  );
});

test('synthesize maps an aborted request past the deadline to kind "timeout"', async () => {
  const fetchImpl = (url, init) => new Promise((_resolve, reject) => {
    // Never resolve; reject only when the internal timeout aborts.
    init.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });

  await assert.rejects(
    () => synthesize({ text: 'hi', voiceSid: 0, config: CONFIG, fetchImpl, timeoutMs: 20 }),
    (err) => err instanceof SuperTonicError && err.kind === 'timeout',
  );
});

test('synthesize maps a non-200 to kind "non-200" and carries the status', async () => {
  await assert.rejects(
    () => synthesize({
      text: 'hi',
      voiceSid: 0,
      config: CONFIG,
      fetchImpl: async () => new Response('upstream boom', { status: 503 }),
    }),
    (err) => err instanceof SuperTonicError && err.kind === 'non-200' && err.status === 503,
  );
});

test('synthesize maps an empty 200 body to kind "empty-audio"', async () => {
  await assert.rejects(
    () => synthesize({
      text: 'hi',
      voiceSid: 0,
      config: CONFIG,
      fetchImpl: async () => new Response(new Uint8Array([]), { status: 200 }),
    }),
    (err) => err instanceof SuperTonicError && err.kind === 'empty-audio',
  );
});
