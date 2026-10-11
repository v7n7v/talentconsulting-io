const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const path = require('node:path');
const result = buildSync({entryPoints:[path.join(__dirname,'../lib/tool-story-adapters.ts')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'});
const moduleFixture = {exports:{}};
new Function('module','exports',result.outputFiles[0].text)(moduleFixture,moduleFixture.exports);
const {applicationsJourneyGuidance} = moduleFixture.exports;
const observe = overrides => applicationsJourneyGuidance({ownerId:'synthetic-alice',viewMode:'command',pending:false,failed:false,record:null,...overrides});
const steps = guide => guide.chapters.find(chapter=>chapter.id==='result').steps;
test('prepared guidance follows source, comparison, revision approval, export and actual submission in order',()=>{
  const guide = observe({record:{id:'app',status:'not_applied',source:'apply_pipeline'},review:{revision:'revision-a',status:'needs_review'}});
  assert.deepEqual(steps(guide).map(step=>step.id),['record','source','compare','approve','export','manual']);
  assert.match(steps(guide).at(-1).description,/only after/);
  assert.ok(steps(guide).every(step=>Object.keys(step).every(key=>!['onClick','action','execute'].includes(key))));
  assert.notEqual(guide.contextKey,observe({record:{id:'app',status:'not_applied',source:'apply_pipeline'},review:{revision:'revision-b',status:'approved'}}).contextKey);
});
test('manual and queue records retain their separate actual authority and result waits for a real record',()=>{
  assert.equal(observe().chapters.find(chapter=>chapter.id==='result').availability,'waiting');
  assert.deepEqual(steps(observe({record:{id:'app',status:'applied',source:'manual'}})).map(step=>step.id),['record','manual']);
  assert.deepEqual(steps(observe({record:{id:'app',status:'not_applied',source:'agent_queue',queueId:'queue'}})).map(step=>step.id),['record','queue','manual']);
  assert.equal(observe({failed:true}).preferredChapterId,'recovery');
});
