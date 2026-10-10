const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSsrBuildId, waitForPublishedBuild, buildFrameworksConfig, pinPublishedHostingRevision } = require('../deploy-fix');

const html = id => `<script>self.__next_f.push(${JSON.stringify([1, `0:{"P":null}\n            0:${JSON.stringify({ b: id, c: ['', 'suite', 'resume'] })}\n`])})</script>`;
const response = (status, text) => ({ status, text: async () => text, arrayBuffer: async () => Buffer.from(text) });
const manifest = Buffer.from('self.__BUILD_MANIFEST={};');
function clock() {
  let time = 0;
  return { now: () => time, sleep: async ms => { time += ms; } };
}

test('server identity comes from a complete React Flight root, not page text', () => {
  assert.equal(extractSsrBuildId(html('fresh-build')), 'fresh-build');
  assert.equal(extractSsrBuildId('<p>fresh-build</p><script>{"b":"fresh-build"}</script>'), null);
  assert.equal(extractSsrBuildId('<script>self.__next_f.push([1,"0:{"])</script>'), null);
  assert.equal(extractSsrBuildId(html('../unsafe')), null);
  assert.equal(extractSsrBuildId(html('old') + html('fresh')), null);
});

test('old SSR publication waits even when new static assets are available', async () => {
  const calls = []; let pages = 0;
  const result = await waitForPublishedBuild({ ...clock(), expectedBuildId: 'fresh', manifest, intervalMs: 1, timeoutMs: 10,
    fetchImpl: async url => {
      calls.push(url);
      return url.includes('/_next/') ? response(200, manifest.toString()) : response(200, html(++pages < 3 ? 'old' : 'fresh'));
    },
  });
  assert.equal(result.attempts, 3);
  assert.equal(calls.filter(url => url.includes('_buildManifest')).length, 1);
  assert.ok(calls.every(url => new URL(url).origin === 'https://talentconsulting.io'));
});

test('matching SSR with wrong Hosting bytes cannot pass the release gate', async () => {
  await assert.rejects(waitForPublishedBuild({ ...clock(), expectedBuildId: 'fresh', manifest, intervalMs: 1, timeoutMs: 3,
    fetchImpl: async url => url.includes('/_next/') ? response(200, 'wrong-build-manifest') : response(200, html('fresh')),
  }), /did not publish/);
});

test('failed responses and redirects cannot establish publication', async () => {
  for (const status of [302, 500]) await assert.rejects(waitForPublishedBuild({ ...clock(), expectedBuildId: 'fresh', manifest, intervalMs: 1, timeoutMs: 2,
    fetchImpl: async () => response(status, html('fresh')),
  }), /did not publish/);
});

test('a transient connection failure retries within the bounded deadline', async () => {
  let calls = 0;
  const result = await waitForPublishedBuild({ ...clock(), expectedBuildId: 'fresh', manifest, intervalMs: 1, timeoutMs: 10,
    fetchImpl: async url => {
      if (++calls === 1) throw new Error('connection reset');
      return url.includes('/_next/') ? response(200, manifest.toString()) : response(200, html('fresh'));
    },
  });
  assert.equal(result.attempts, 2);
});

test('production parser resource headroom survives framework configuration', () => {
  const config = require('../firebase.json');
  const result = buildFrameworksConfig(config);
  assert.equal(result.hosting.frameworksBackend.memory, '1GiB');
  assert.equal(result.hosting.frameworksBackend.concurrency, 4);
  assert.deepEqual(result.firestore, config.firestore);
  assert.deepEqual(result.storage, config.storage);
});

const service = 'ssrtalentconsultingacf1';
const freshRevision = `${service}-00177-xib`;
const liveVersion = '71acf7c2644658c8';
const liveTag = `fh-${liveVersion}`;
const rollbackVersion = '1d2de1281f514714';
const projectRoot = 'projects/talent-consulting-acf16/sites/talent-consulting-acf16';
function bindingFixture() {
  const channels = ['live', 'admin-command-grid-rollback'].map((name, index) => ({
    name: `${projectRoot}/channels/${name}`,
    release: { version: { name: `${projectRoot}/versions/${index ? rollbackVersion : liveVersion}`, status: 'FINALIZED',
      config: { rewrites: [{ glob: '**', run: { serviceId: service, region: 'us-east1', tag: index ? `fh-${rollbackVersion}` : liveTag } }] } } },
  }));
  const traffic = [{ percent: 100, revisionName: freshRevision },
    { tag: liveTag, revisionName: `${service}-00173-juk` },
    { tag: `fh-${rollbackVersion}`, revisionName: `${service}-00169-fuy` }];
  const calls = [];
  const fixture = { channels, traffic, calls, corruptAfter: null };
  fixture.dependencies = {
    runFirebase: (args, options) => {
      calls.push({ type: 'firebase', args, options });
      return { status: 0, stdout: JSON.stringify({ result: { channels } }) };
    },
    runGcloud: args => {
      calls.push({ type: 'gcloud', args });
      if (args.includes('update-traffic')) {
        traffic.find(entry => entry.tag === liveTag).revisionName = freshRevision;
        fixture.corruptAfter?.();
        return { status: 0 };
      }
      return { status: 0, stdout: JSON.stringify({ status: { traffic } }) };
    },
  };
  return fixture;
}

test('Hosting binds only the newly published tag to the exact active revision, preserving rollback', () => {
  const fixture = bindingFixture();
  const receipt = pinPublishedHostingRevision(freshRevision, fixture.dependencies);
  assert.equal(receipt.hostingTag, liveTag);
  const mutations = fixture.calls.filter(call => call.args.includes('update-traffic'));
  assert.equal(mutations.length, 1);
  assert.ok(mutations[0].args.includes(`--update-tags=${liveTag}=${freshRevision}`));
  assert.ok(!mutations[0].args.some(arg => /--(?:set-tags|clear-tags|to-latest|to-tags|to-revisions)/.test(arg)));
  assert.equal(fixture.traffic.find(entry => entry.tag === `fh-${rollbackVersion}`).revisionName, `${service}-00169-fuy`);
  assert.equal(fixture.calls[0].options.quiet, true);
});

test('an already correct Hosting tag needs no mutation', () => {
  const fixture = bindingFixture();
  fixture.traffic[1].revisionName = freshRevision;
  pinPublishedHostingRevision(freshRevision, fixture.dependencies);
  assert.equal(fixture.calls.filter(call => call.args.includes('update-traffic')).length, 0);
});

test('the bounded untagged Hosting fallback still requires exact default traffic without retagging', () => {
  const fixture = bindingFixture();
  delete fixture.channels[0].release.version.config.rewrites[0].run.tag;
  const receipt = pinPublishedHostingRevision(freshRevision, fixture.dependencies);
  assert.equal(receipt.hostingTag, null);
  assert.equal(fixture.calls.filter(call => call.args.includes('update-traffic')).length, 0);
  fixture.traffic[0].revisionName = `${service}-00173-juk`;
  assert.throws(() => pinPublishedHostingRevision(freshRevision, fixture.dependencies), /100% traffic/);
});

test('rollback version, foreign service, region or reused tag cannot be retargeted', () => {
  const changes = [
    fixture => { fixture.channels[0].release.version.name = fixture.channels[1].release.version.name; },
    fixture => { fixture.channels[0].release.version.config.rewrites[0].run.serviceId = 'unrelated-service'; },
    fixture => { fixture.channels[0].release.version.config.rewrites[0].run.region = 'us-west1'; },
    fixture => { fixture.channels[0].release.version.config.rewrites[0].run.tag = `fh-${rollbackVersion}`; },
    fixture => { fixture.channels[1].release.version.config.rewrites[0].run.tag = liveTag; },
    fixture => { fixture.channels.pop(); },
    fixture => { fixture.channels.push(fixture.channels[0]); },
    fixture => { fixture.channels[0].release.version.status = 'CREATED'; },
  ];
  for (const change of changes) {
    const fixture = bindingFixture(); change(fixture);
    assert.throws(() => pinPublishedHostingRevision(freshRevision, fixture.dependencies));
    assert.equal(fixture.calls.filter(call => call.args.includes('update-traffic')).length, 0);
  }
});

test('wrong default traffic or missing/ambiguous tag stops before a mutation', () => {
  for (const change of [
    fixture => { fixture.traffic[0].revisionName = `${service}-00173-juk`; },
    fixture => { fixture.traffic[0].percent = 99; },
    fixture => { fixture.traffic.splice(1, 1); },
    fixture => { fixture.traffic.push({ ...fixture.traffic[1] }); },
  ]) {
    const fixture = bindingFixture(); change(fixture);
    assert.throws(() => pinPublishedHostingRevision(freshRevision, fixture.dependencies));
    assert.equal(fixture.calls.filter(call => call.args.includes('update-traffic')).length, 0);
  }
});

test('failed tag mutation and unexpected changes cannot pass verification', () => {
  const failed = bindingFixture();
  const original = failed.dependencies.runGcloud;
  failed.dependencies.runGcloud = args => args.includes('update-traffic') ? { status: 1 } : original(args);
  assert.throws(() => pinPublishedHostingRevision(freshRevision, failed.dependencies), /exact Hosting revision binding/);
  for (const change of [
    fixture => { fixture.traffic[1].revisionName = `${service}-00173-juk`; },
    fixture => { fixture.traffic[2].revisionName = freshRevision; },
    fixture => { fixture.traffic[0].percent = 50; },
    fixture => { fixture.traffic.push({ tag: 'unexpected', revisionName: freshRevision }); },
  ]) {
    const fixture = bindingFixture(); fixture.corruptAfter = () => change(fixture);
    assert.throws(() => pinPublishedHostingRevision(freshRevision, fixture.dependencies));
  }
});

test('invalid deployed revisions and malformed CLI results fail closed', () => {
  const fixture = bindingFixture();
  assert.throws(() => pinPublishedHostingRevision('other-service-00001-abc', fixture.dependencies));
  assert.equal(fixture.calls.length, 0);
  assert.throws(() => pinPublishedHostingRevision(freshRevision, { ...fixture.dependencies,
    runFirebase: () => ({ status: 0, stdout: '{broken' }),
  }), /invalid JSON/);
  assert.throws(() => pinPublishedHostingRevision(freshRevision, { ...fixture.dependencies,
    runGcloud: () => ({ status: 0, stdout: '{broken' }),
  }), /invalid JSON/);
});
