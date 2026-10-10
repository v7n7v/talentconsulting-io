const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');

const repoRoot = path.join(__dirname, '..');

async function loadRoute(entry, mocks, prefix) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const outfile = path.join(outdir, 'route.cjs');
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', plugins: [{
    name: `${prefix}-mocks`, setup(api) {
      for (const [specifier, contents] of Object.entries(mocks)) {
        const key = `${prefix}-${specifier.replace(/[^a-z0-9]/gi, '-')}`;
        const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        api.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({ path: key, namespace: 'mock' }));
        api.onLoad({ filter: new RegExp(`^${key}$`), namespace: 'mock' }, () => ({ contents, loader: 'js' }));
      }
    },
  }] });
  return require(outfile);
}


const mocks = {
 'next/server': `export class NextResponse extends Response { static json(v,i={}) {return new Response(JSON.stringify(v),{...i,headers:{'Content-Type':'application/json'}})} }`,
 '@/lib/api-auth': `export async function guardApiRoute(){return globalThis.__writing.guard}`,
 '@/lib/ai/groq-client': `export async function groqJSONCompletion(){globalThis.__writing.calls++;return globalThis.__writing.selection}`,
};
const cover = loadRoute('app/api/agent/cover-letter/route.ts',mocks,'cover-handler');
const linkedin = loadRoute('app/api/agent/linkedin-optimize/route.ts',mocks,'linkedin-handler');
const request=body=>({json:async()=>body});
const resume={name:'Ada',title:'Engineer',summary:'Built reliable software.',experience:[{company:'Acme',achievements:['Reduced latency by 20%.']}],skills:['TypeScript']};
function reset(){globalThis.__writing={guard:{user:{uid:'alice',tier:'pro'}},calls:0,selection:{headlineIndices:[0],aboutIndices:[1,2]}};}

test('cover loaded handler requires explicit evidence and preserves facts in every supported presentation',async()=>{
 reset(); const route=await cover;
 assert.equal((await route.POST(request({company:'Target',jobTitle:'Lead'}))).status,400);
 assert.equal((await route.POST(request({company:'Target',jobTitle:'Lead',resumeData:{name:'Ada'}}))).status,400);
 for(const tone of ['professional','conversational','confident','storytelling']) for(const template of ['classic','modern','impact']){
  const response=await route.POST(request({company:'Target',jobTitle:'Lead',resumeVersionId:'v1',resumeData:resume,tone,template}));
  assert.equal(response.status,200); const body=await response.json();
  assert.ok(body.coverLetter.includes('Reduced latency by 20%.'));
  assert.ok(body.coverLetter.includes('Built reliable software.'));
  assert.equal(body.sourceReport.sourceResumeId,'v1');
  assert.equal(body.toneScore,null);
  assert.equal(/Google|50%|certified/.test(body.coverLetter),false);
 }
 assert.equal(globalThis.__writing.calls,0);
});

test('LinkedIn loaded handler constructs exact source selections and rejects injected claims, invalid indices, lengths and absent sources',async()=>{
 reset(); const route=await linkedin;
 let response=await route.POST(request({resumeData:resume,targetRole:'Google CTO with 50% sales growth'}));
 assert.equal(response.status,200);let body=await response.json();
 assert.equal(body.headline.optimized,'Engineer');
 assert.equal(body.about.optimized,'Built reliable software.\n\nReduced latency by 20%.');
 assert.equal(body.overallScore,null);
 for(const selection of [{headlineIndices:['Google CTO'],aboutIndices:[1]},{headlineIndices:[99],aboutIndices:[1]},{headlineIndices:[0],aboutIndices:[-1]}]){
  globalThis.__writing.selection=selection;
  response=await route.POST(request({resumeData:resume}));assert.equal(response.status,502);
 }
 globalThis.__writing.selection={headlineIndices:[0],aboutIndices:[1]};
 response=await route.POST(request({headline:'x'.repeat(221),about:'Valid evidence'}));assert.equal(response.status,400);
 response=await route.POST(request({targetRole:'Engineer'}));assert.equal(response.status,400);
});

test('writing routes honor authentication and tier before drafting',async()=>{
 reset();globalThis.__writing.guard={error:new Response('Unauthorized',{status:401})};
 for(const route of [await cover,await linkedin])assert.equal((await route.POST(request({}))).status,401);
 globalThis.__writing.guard={user:{uid:'alice',tier:'free'}};
 for(const route of [await cover,await linkedin])assert.equal((await route.POST(request({}))).status,403);
 assert.equal(globalThis.__writing.calls,0);
});
