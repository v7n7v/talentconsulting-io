const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildSync} = require('esbuild');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'taco-tier-'));
const output = path.join(directory,'tier.cjs');
buildSync({entryPoints:[path.resolve(__dirname,'../lib/user-tier-response.ts')],outfile:output,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {readUserTierResponse} = require(output);
test.after(() => fs.rmSync(directory,{recursive:true,force:true}));
for (const status of [401,403,429,500]) test(`plan lookup ${status} cannot masquerade as Free`, async () => {
  await assert.rejects(readUserTierResponse(Response.json({tier:'free'},{status})),/could not be checked/);
});
test('missing and invalid plan data remain unknown', async () => {
  for (const tier of [undefined,'enterprise',null]) await assert.rejects(readUserTierResponse(Response.json({tier})),/could not be checked/);
});
test('each supported server plan is retained without upgrading capabilities', async () => {
  for (const tier of ['free','pro','studio','god']) assert.equal((await readUserTierResponse(Response.json({tier}))).tier,tier);
});
