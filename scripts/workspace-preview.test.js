const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildSync} = require('esbuild');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taco-preview-test-'));
const output = path.join(dir, 'preview.cjs');
// Real fixture router and demo adapters; Next's response is the only substitute.
const code = fs.readFileSync(path.join(root, 'lib/workspace-preview-response.ts'), 'utf8')
  .replace("import {NextResponse, type NextRequest} from 'next/server';", 'const NextResponse = Object.assign(Response, {json: Response.json}); type NextRequest = any;');
buildSync({stdin:{contents:code,loader:'ts',resolveDir:path.join(root,'lib')},outfile:output,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {workspacePreviewResponse} = require(output);
const proxyOutput = path.join(dir, 'proxy.cjs');
const proxyCode = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8')
  .replace("import { NextResponse } from 'next/server';", `const NextResponse = Object.assign(Response, {
    json: Response.json,
    next: () => new Response(null, {headers:{'x-middleware-next':'1'}}),
    rewrite: url => new Response(null, {headers:{'x-middleware-rewrite':url.toString()}}),
    redirect: url => new Response(null, {status:307,headers:{Location:url.toString()}}),
  });`)
  .replace("import type { NextRequest } from 'next/server';", 'type NextRequest = any;');
buildSync({stdin:{contents:proxyCode,loader:'ts',resolveDir:root},outfile:proxyOutput,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {proxy} = require(proxyOutput);
const previous = {...process.env};
test.after(() => {
  for (const key of ['NODE_ENV','NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW','NEXT_PUBLIC_DISABLE_AUTH_GATE']) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  fs.rmSync(dir,{recursive:true,force:true});
});
function enable() {
  process.env.NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW = 'true';
  process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE = 'true';
}
function request(pathname, scenario = 'review', host = '127.0.0.1') {
  return {nextUrl:new URL(`http://${host}:3101${pathname}`),cookies:{get:() => ({value:scenario})}};
}
test('production never enables fixture authentication or responses, even with both flags', () => {
  enable(); process.env.NODE_ENV = 'production';
  assert.equal(workspacePreviewResponse(request('/api/agent/intelligence')),null);
});
test('both explicit development flags are required', () => {
  enable(); delete process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE;
  assert.equal(workspacePreviewResponse(request('/api/agent/intelligence')),null);
  enable(); delete process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW;
  assert.equal(workspacePreviewResponse(request('/api/agent/intelligence')),null);
});
test('a preview cannot be exposed on a non-loopback host', () => {
  enable();
  assert.equal(workspacePreviewResponse(request('/suite','review','example.com')).status,403);
});
test('all unknown APIs and external-effect endpoints fail closed', async () => {
  enable();
  for (const path of ['/api/unknown','/api/billing/checkout','/api/agent/apply-pipeline','/api/contact','/api/agent/harness/run','/api/resume/morph','/api/resume/blueprint']) {
    const response = workspacePreviewResponse(request(path));
    assert.equal(response.status,503,path);
    assert.equal((await response.json()).code,'ISOLATED_PREVIEW');
  }
});
test('mixed failure fixture remains an explicit failure rather than an empty success', async () => {
  enable();
  const failed = workspacePreviewResponse(request('/api/agent/intelligence','partial'));
  assert.equal(failed.status,503);
  const healthy = workspacePreviewResponse(request('/api/jobs/search','partial'));
  assert.equal(healthy.status,200);
  const body = await healthy.json();
  assert.ok(body.jobs.length);
  assert.ok(body.jobs.every(job => job.preparationEligible === false && job.outboundLinkVerified === false));
  assert.equal(healthy.headers.get('X-Taco-Preview'),'fixture');
});
test('new account has no confirmed source or career context', async () => {
  enable();
  const data = await workspacePreviewResponse(request('/api/agent/intelligence','new')).json();
  assert.equal(data.twin,null);
  assert.equal(data.profile,null);
});
test('page routing remains available while the API boundary stays intercepted', () => {
  enable();
  assert.equal(workspacePreviewResponse(request('/suite/resume')),null);
});

function uploadRequest(host = '127.0.0.1', method = 'POST') {
  const nextUrl = new URL(`http://${host}:3101/api/gauntlet/parse-resume`);
  nextUrl.clone = () => new URL(nextUrl);
  return {nextUrl,url:nextUrl.toString(),method,headers:new Headers(),cookies:{get:() => undefined}};
}
test('one upload URL uses local-only extraction in isolated preview and normal routing after a mode switch', () => {
  enable();
  const local = proxy(uploadRequest());
  assert.equal(local.headers.get('x-middleware-rewrite'), 'http://127.0.0.1:3101/api/workspace-preview/resume-import');
  assert.match(local.headers.get('Content-Security-Policy'), /connect-src 'self'/);

  process.env.NEXT_PUBLIC_TACO_WORKSPACE_PREVIEW = 'false';
  process.env.NEXT_PUBLIC_DISABLE_AUTH_GATE = 'false';
  const normal = proxy(uploadRequest());
  assert.equal(normal.headers.get('x-middleware-rewrite'), null);
  assert.equal(normal.headers.get('x-middleware-next'), '1');
});
test('preview upload routing remains unavailable outside loopback, on GET or in production', () => {
  enable();
  assert.equal(proxy(uploadRequest('example.com')).status, 403);
  assert.equal(proxy(uploadRequest('127.0.0.1', 'GET')).status, 503);
  process.env.NODE_ENV = 'production';
  assert.equal(proxy(uploadRequest()).headers.get('x-middleware-rewrite'), null);
});
