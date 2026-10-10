const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'next.config.js');
const dockerfile = fs.readFileSync(path.join(root, 'deploy/staging/Dockerfile.cloudrun'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');

async function configuredHeaders(stagingHostname) {
  const previous = process.env.STAGING_HOSTNAME;
  if (stagingHostname === undefined) delete process.env.STAGING_HOSTNAME;
  else process.env.STAGING_HOSTNAME = stagingHostname;

  delete require.cache[configPath];
  try {
    const config = require(configPath);
    const rules = await config.headers();
    return rules.flatMap((rule) => rule.headers);
  } finally {
    if (previous === undefined) delete process.env.STAGING_HOSTNAME;
    else process.env.STAGING_HOSTNAME = previous;
    delete require.cache[configPath];
  }
}

test('staging hostname adds the noindex response header', async () => {
  const headers = await configuredHeaders('talent-staging.example.test');
  assert.ok(headers.some(({ key, value }) => key === 'X-Robots-Tag' && value === 'noindex, nofollow, noarchive'));
});

test('without a staging hostname, production response headers have no staging directive', async () => {
  for (const hostname of [undefined, '']) {
    const headers = await configuredHeaders(hostname);
    assert.equal(headers.some(({ key }) => key.toLowerCase() === 'x-robots-tag'), false);
    assert.ok(headers.some(({ key }) => key === 'Content-Security-Policy'));
  }
});

test('Cloud Run staging image uses Node 22 and reproducible lockfile installation', () => {
  assert.match(dockerfile, /FROM node:22-alpine AS deps/);
  assert.match(dockerfile, /COPY package\.json package-lock\.json \.\//);
  assert.match(dockerfile, /npm ci --legacy-peer-deps/);
  assert.doesNotMatch(dockerfile, /npm install/);
});

test('staging image carries public Firebase config, app URL, and stage marker with Stripe keys empty', () => {
  for (const name of [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    'NEXT_PUBLIC_APP_URL',
  ]) assert.match(dockerfile, new RegExp(`ARG ${name}(?:=|\\n)`));

  assert.match(dockerfile, /ARG STAGING_HOSTNAME/);
  assert.match(dockerfile, /STAGING_HOSTNAME=\$STAGING_HOSTNAME/);
  assert.match(dockerfile, /^\s*NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\s*(?:\\)?$/m);
  assert.match(dockerfile, /^\s*STRIPE_BUILD_PUBLISHABLE_KEY=\s*$/m);
  assert.doesNotMatch(dockerfile, /ARG (?:FIREBASE_ADMIN|GOOGLE_APPLICATION_CREDENTIALS|STRIPE_SECRET_KEY|RESEND_API_KEY)/);
});

test('Docker context excludes local outputs, tooling state, env files, and private credentials', () => {
  for (const pattern of [
    '.codex',
    '.project-map',
    '.ui-verify',
    'test-results',
    'outputs',
    'tmp',
    'temp',
    '.env.*',
    '*.pem',
    '*.key',
    '*private-key*',
    '*service-account*.json',
    '*firebase-adminsdk*.json',
  ]) assert.ok(dockerignore.split(/\r?\n/).includes(pattern), `missing .dockerignore pattern ${pattern}`);

  assert.equal(dockerignore.split(/\r?\n/).includes('public'), false);
  assert.equal(dockerignore.split(/\r?\n/).includes('app'), false);
});
