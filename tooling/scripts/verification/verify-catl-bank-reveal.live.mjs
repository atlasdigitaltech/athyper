// Existing DEV, synthetic fixtures only. Never print account numbers or API bodies.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {id} from '../../fixtures/business-partner-core/seed-identity.mjs';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.owner.json',ignoreHTTPSErrors:true});
 const page=await context.newPage();await page.clock.install();
 await page.goto('https://neon.dev.athyper.test/mdg/business-partner/b4137225-4534-5469-8138-09d15a970271?section=banking&tab=360');
 const buttons=page.getByRole('button',{name:'Reveal',exact:true});await expect(buttons).toHaveCount(2,{timeout:45000});
 for(let index=0;index<2;index++) {
  await buttons.nth(index).click();await page.getByLabel('Reason for access').selectOption('partner_review');
  const responsePromise=page.waitForResponse(r=>r.url().includes('/banking/reveal'));
  await page.getByRole('button',{name:'Reveal value',exact:true}).click();
  const response=await responsePromise;assert.equal(response.status(),200,`Bank reveal HTTP ${response.status()}`);
  const payload=response.request().postDataJSON();assert.equal(typeof payload.bankAccountLinkId,'string');
  const hide=page.getByRole('button',{name:'Hide',exact:true});await expect(hide).toBeVisible();
  if(index===0)await hide.click();else{await page.clock.fastForward(61000);await expect(hide).toHaveCount(0);}
 }
 // Isolate expiry's advanced clock from the next server-issued claim.
 const personContext=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.owner.json',ignoreHTTPSErrors:true});
 const personPage=await personContext.newPage();
 await personPage.goto(`https://neon.dev.athyper.test/mdg/business-partner/${id('cirrusatlantic','person-partner')}?section=banking&tab=360`);
 const personButtons=personPage.getByRole('button',{name:'Reveal',exact:true});
 await expect(personButtons).toHaveCount(1,{timeout:45000});
 await personButtons.click();await personPage.getByLabel('Reason for access').selectOption('partner_review');
 const personResponse=personPage.waitForResponse(r=>r.url().includes('/banking/reveal'));
 await personPage.getByRole('button',{name:'Reveal value',exact:true}).click();
 assert.equal((await personResponse).status(),200,'Person bank reveal');
 await expect(personPage.getByRole('button',{name:'Hide',exact:true})).toBeVisible();
 await personPage.getByRole('button',{name:'Hide',exact:true}).click();
 await expect(personButtons).toHaveCount(1);
 console.log('Organization and person bank accounts: metadata-bound Reveal, link-ID target, Hide; organization expiry passed');
}finally{await browser.close();}
