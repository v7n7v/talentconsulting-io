const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSync } = require('esbuild');

const repoRoot = path.join(__dirname, '..');
const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-rate-reservation-'));
const outfile = path.join(outdir, 'rate-limit.cjs');
buildSync({
  entryPoints: [path.join(repoRoot, 'lib', 'rate-limit.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const {
  checkRateLimit,
  commitRateLimitReservation,
  releaseRateLimitReservation,
  reserveRateLimit,
} = require(outfile);

test('missing Redis configuration uses a bounded local window instead of failing open', async () => {
  const key = `local-fallback:${Date.now()}`;
  const first = await checkRateLimit(key, 2, 60_000);
  const second = await checkRateLimit(key, 2, 60_000);
  const blocked = await checkRateLimit(key, 2, 60_000);

  assert.deepEqual({ allowed: first.allowed, remaining: first.remaining }, { allowed: true, remaining: 1 });
  assert.deepEqual({ allowed: second.allowed, remaining: second.remaining }, { allowed: true, remaining: 0 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetIn > 0 && blocked.resetIn <= 60_000);
});

class ReservationRedis {
  constructor() {
    this.usage = new Map();
    this.reservations = new Map();
  }

  async eval(script, keys, args) {
    if (script.includes('reserve-monthly-slot')) {
      const count = this.usage.get(keys[0]) || 0;
      if (count >= Number(args[0])) return [0, count];
      if (this.reservations.has(keys[1])) return [-1, count];
      this.reservations.set(keys[1], String(args[1]));
      return [1, count];
    }
    if (script.includes('commit-monthly-slot')) {
      if (this.reservations.get(keys[1]) !== String(args[0])) return 0;
      this.usage.set(keys[0], (this.usage.get(keys[0]) || 0) + 1);
      this.reservations.delete(keys[1]);
      return 1;
    }
    if (script.includes('release-monthly-slot')) {
      if (this.reservations.get(keys[0]) !== String(args[0])) return 0;
      this.reservations.delete(keys[0]);
      return 1;
    }
    throw new Error('Unknown reservation script');
  }
}

test('monthly trial reservation is atomic and commits only after success', async () => {
  const redis = new ReservationRedis();
  const first = await reserveRateLimit('anon:resume', 1, 120_000, redis);
  const concurrent = await reserveRateLimit('anon:resume', 1, 120_000, redis);

  assert.equal(first.allowed, true);
  assert.equal(concurrent.allowed, false);
  assert.equal(concurrent.reason, 'busy');
  assert.equal(redis.usage.size, 0);

  await releaseRateLimitReservation('anon:resume', first.token, redis);
  assert.equal(redis.usage.size, 0);

  const retry = await reserveRateLimit('anon:resume', 1, 120_000, redis);
  assert.equal(retry.allowed, true);
  assert.equal(await commitRateLimitReservation('anon:resume', retry.token, 30 * 24 * 60 * 60 * 1000, redis), true);
  assert.equal(redis.usage.get('rl:anon:resume'), 1);

  const exhausted = await reserveRateLimit('anon:resume', 1, 120_000, redis);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, 'limit');
});

test('wrong reservation token cannot commit or release another request', async () => {
  const redis = new ReservationRedis();
  const reservation = await reserveRateLimit('anon:resume', 1, 120_000, redis);

  assert.equal(await commitRateLimitReservation('anon:resume', 'wrong-token', 1000, redis), false);
  await releaseRateLimitReservation('anon:resume', 'wrong-token', redis);
  assert.equal(redis.usage.size, 0);
  assert.equal(redis.reservations.size, 1);

  await releaseRateLimitReservation('anon:resume', reservation.token, redis);
  assert.equal(redis.reservations.size, 0);
});
