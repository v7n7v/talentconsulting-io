'use strict';
// Supplemental real-pointer negative. Uses an already-running isolated fixture server.
// Only this context's DOM is corrupted; source/server/bundle bytes stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { attachContainment } = require('./ui-verify-fixtures.cjs');
const root = path.resolve(__dirname, '..');
function validateOrigin(origin) {
  assert.equal(origin, 'http://127.0.0.1:4317', 'Supplemental pointer profile only permits the selected explicit loopback origin');
  return origin;
}
async function main() {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const modulePath = opt('playwright-module', '') || require.resolve('playwright', {paths:[root]});
  const outDir = path.resolve(root, opt('out', '.ui-verify/remediation/r4-final'));
  const manifestFile = path.join(outDir, 'test-bundle/static-assets.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const assets = new Set([...manifest.assets.map(item => item.url), ...manifest.routes]);
  const origin = validateOrigin(opt('origin', 'http://127.0.0.1:4317'));
  const playwright = require(modulePath);
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport:{width:320,height:900}, serviceWorkers:'block' });
  const observations = await attachContainment(context,origin,assets,{search:['populated'],suggestions:['populated'],calls:{},delay:0});
  const page = await context.newPage();
  const report = { boundary:'Supplemental real modal and real main-menu pointer behavior; context-only DOM negative, no source/server mutation', origin, manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'), ok:false };
  try {
    await page.goto(origin+'/suite/cover-letter');await page.waitForTimeout(500);
    const help=page.getByRole('button',{name:'How to use Cover Letter Studio',exact:true}).filter({visible:true});
    const menu=page.getByRole('button',{name:'Open main menu',exact:true});
    const bounds=await menu.boundingBox();
    // Left edge of the real trigger lies outside the panel's 16px padding.
    const point={x:bounds.x+2,y:bounds.y+bounds.height/2};report.point=point;
    const dialog=page.getByRole('dialog',{name:'How to Use Cover Letter Studio',exact:true});
    await help.focus();await page.keyboard.press('Enter');await page.waitForTimeout(400);assert.ok(await dialog.isVisible());
    assert.equal(await page.locator('#fixture-root').evaluate(el=>el.inert),true);
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(400);
    assert.equal(await page.getByRole('dialog',{name:'Main menu',exact:true}).count(),0,'Backdrop click reached the real background menu');
    assert.equal(await dialog.count(),0,'Backdrop did not consume click and close help');report.baseline='PASS: pointer consumed by help backdrop, background menu stayed closed';
    await help.focus();await page.keyboard.press('Enter');await page.waitForTimeout(400);assert.ok(await dialog.isVisible());
    await dialog.evaluate(el=>{
      const overlay=el.parentElement;overlay.style.pointerEvents='none';
      overlay.querySelector(':scope > div[aria-hidden="true"]').style.pointerEvents='none';
      for(const child of document.body.children)if(child!==overlay)child.removeAttribute('inert');
    });
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(400);
    const opened=await page.getByRole('dialog',{name:'Main menu',exact:true}).count();report.corruptedBackgroundMenuCount=opened;
    assert.ok(opened>0,'Background-isolation corruption escaped real pointer assertion');
    report.negative='PASS: the same closed-background-menu assertion becomes red when inert and pointer shielding are corrupted';
    assert.equal(observations.unexpected.length,0);assert.equal(observations.failed.length,0);assert.equal(observations.errors.length,0);
    report.screenshot=path.join(outDir,'supplemental-background-interaction-negative.png');await page.screenshot({path:report.screenshot,fullPage:true});report.ok=true;
  }catch(error){report.error=error.message;process.exitCode=1}
  finally {await context.close();await browser.close();fs.writeFileSync(path.join(outDir,'background-interaction-negative.json'),JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={main,validateOrigin};
