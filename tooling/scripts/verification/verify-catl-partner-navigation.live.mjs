/** Read-only navigation regression on the existing DEV, with a normal saved session. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.owner.json',ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});
 await context.addInitScript(()=>localStorage.setItem('athyper.record-view.business-partner.v1',JSON.stringify({section:true,summary:true})));
 const page=await context.newPage();
 await page.goto('https://neon.dev.athyper.test/mdg/business-partner/b4137225-4534-5469-8138-09d15a970271?section=identity&tab=360&panel=closed');
 const outline=page.locator('aside[aria-label="360 sections"]');await outline.waitFor({timeout:45000});
 await outline.evaluate(node=>{node.dataset.navigationProbe='preserved';});
 for(const[label,key]of [['Addresses','addresses'],['Industries','industries'],['Identifiers Tax','identifiers-tax'],['Banking','banking'],['Contacts','contacts'],['Overview','overview']]){
  await outline.getByRole('button',{name:label,exact:true}).click();
  // Allow smooth scroll and viewport observations to settle; an immediate URL assertion misses the regression.
  await page.waitForTimeout(1800);
  assert.equal(new URL(page.url()).searchParams.get('section'),key);
  assert.equal(await outline.getAttribute('data-navigation-probe'),'preserved','Workspace remounted on navigation');
  console.log(`Stable section navigation: ${key}`);
 }
} finally {await browser.close();}
