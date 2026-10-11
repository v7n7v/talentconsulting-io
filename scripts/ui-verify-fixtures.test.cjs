'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {classifyRequest,responseScenario,validateJobsResponse,problemsFor,JOBS,TOKEN,validateShellResponse}=require('./ui-verify-fixtures.cjs');
const origin='http://127.0.0.1:4317';const assets=new Set(['/suite/job-search','/__ui_verify__/fixture.js']);
const get=(pathname)=>({url:origin+pathname,method:'GET',resourceType:'fetch',headers:{authorization:'Bearer '+TOKEN},postData:null});
test('exact sample search method/path/query/auth schema permits only named reads',()=>{
 assert.equal(classifyRequest(get('/api/jobs/search?query=Sample+role&location=&country=us&page=1&sortBy=salary&limit=24'),origin,assets).kind,'api');
 for(const req of [get('/api/unknown'),{...get('/api/jobs/preferences'),method:'POST',postData:'{}'},get('/api/jobs/preferences?new=1'),get('/api/jobs/search?query=Sample+role&country=us&page=1&sortBy=date&limit=24&write=true'),{...get('/api/jobs/preferences'),headers:{}},{...get('/api/jobs/preferences'),url:'https://firestore.googleapis.com/v1/projects/sample'}])assert.throws(()=>classifyRequest(req,origin,assets));
});
test('static resource provenance is an exact same-origin path list; blanket GET passthrough fails',()=>{
 assert.equal(classifyRequest({...get('/__ui_verify__/fixture.js'),resourceType:'script'},origin,assets).kind,'asset');
 for(const path of ['/unknown.js','/__ui_verify__/fixture.js?other=1','/api/unlisted'])assert.throws(()=>classifyRequest(get(path),origin,assets));
});
test('named synthetic scenarios validate honest salary/date/fit and cannot become generic success',()=>{
 for(const name of ['populated','partial-initial','partial-next','empty','setup'])validateJobsResponse(responseScenario(name).body);
 assert.ok(responseScenario('interrupted').abort);assert.throws(()=>responseScenario('generic-success'));
 assert.throws(()=>validateJobsResponse({success:true}));assert.throws(()=>validateJobsResponse({success:true,jobs:[{...JOBS[0],company:'Real employer'}]}));
 assert.equal(JOBS[2].matchScore,null);assert.equal(JOBS[2].salary.min,null);assert.equal(JOBS[2].postedDate,'');
});
test('768 target/input defects fail while the desktop mobile gate stays unchanged',()=>{
 const probe={overflow:null,clipped:[],smallTargets:[{w:24,h:24}],smallInputs:[{fontSize:14}]};const clean={errors:[],unexpected:[],failed:[]};
 assert.deepEqual(problemsFor(probe,768,clean).map(p=>p.kind),['touch-target','input-size']);assert.deepEqual(problemsFor(probe,1024,clean),[]);
});
test('overflow, JS exceptions, unexpected requests and ordinary failed requests each fail independently',()=>{
 const probe={overflow:{by:10},offenders:[],clipped:[],smallTargets:[],smallInputs:[]};assert.deepEqual(problemsFor(probe,1440,{errors:['error'],unexpected:['POST'],failed:['404']}).map(p=>p.kind),['overflow','console','unexpected-request','request']);
});

test('malformed fit schema is allowed only in its explicitly named defensive scenario',()=>{
 for(let i=0;i<7;i++){const scenario=responseScenario('defensive-fit-'+i,'/api/jobs/suggestions');validateJobsResponse(scenario.body,scenario.name)}
 assert.throws(()=>validateJobsResponse(responseScenario('defensive-fit-4','/api/jobs/suggestions').body));
 assert.throws(()=>responseScenario('defensive-fit-4','/api/jobs/search'));
});
test('shell reads have explicit response schema and cannot fabricate intelligence',()=>{
 validateShellResponse('/api/agent/intelligence',{success:true,twin:null});assert.throws(()=>validateShellResponse('/api/agent/intelligence',{success:true,twin:{score:0}}));assert.throws(()=>validateShellResponse('/api/jobs/preferences',{success:true}));
});

test('supplemental pointer profile rejects production and alternate origins before browser launch',()=>{
 const {validateOrigin}=require('./ui-verify-background-negative.cjs');assert.equal(validateOrigin(origin),origin);
 for(const url of ['https://talentconsulting.io','http://127.0.0.1:4318','http://127.0.0.1:4317/path','https://127.0.0.1:4317','http://localhost:4317'])assert.throws(()=>validateOrigin(url));
});
