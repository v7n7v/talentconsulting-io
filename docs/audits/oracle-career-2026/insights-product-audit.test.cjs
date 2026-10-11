// Review reproduction: controlled local dependencies; no provider or account calls.
const test=require('node:test');const assert=require('node:assert/strict');
const {loadBodies,runtime}=require(require('node:path').resolve(__dirname,'../../../scripts/test-ui-hooks.cjs'));
const loaded=loadBodies('app/suite/analytics/AnalyticsContent.tsx');
function setup(Page){const ui=runtime(Page);ui.user={uid:'alice',accessToken:'mock-token'};globalThis.useRouter=()=>({push(){}});return ui;}
test('AUDIT Analytics failure displays no pipeline data instead of error',async()=>{const {AnalyticsContent}=await loaded;const ui=setup(AnalyticsContent);globalThis.fetch=async()=>({ok:false,status:404,json:async()=>{throw Error('not JSON')}});ui.flush();await ui.settle();assert.match(ui.text(),/No Pipeline Data Yet/);assert.doesNotMatch(ui.text(),/could not|Retry|failed to load/i)});
test('AUDIT Analytics counts current applied status denominator producing over100 rate',async()=>{const {AnalyticsContent}=await loaded;const ui=setup(AnalyticsContent);globalThis.fetch=async()=>({ok:true,json:async()=>({applications:[{id:'a',status:'applied',company:'A',role:'Role'},{id:'b',status:'interviewing',company:'B',role:'Role'},{id:'c',status:'interviewing',company:'C',role:'Role'}]})});ui.flush();await ui.settle();assert.match(ui.text(),/200%/)});
