/** Existing DEV only. Reveals synthetic fixtures; never prints protected values. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {actor} from './partner-classification-session.mjs';
const bp='b4137225-4534-5469-8138-09d15a970271', other='13792b98-a65a-544f-8212-742ee48e74c6';
const fixtures=[['identifierId','identifiers','694b99ac-eb46-5b68-80e5-7c7006aa7f43'],['taxRegistrationId','identifiers-tax','1e0fa820-27ab-521c-8c57-f5d0a8877046']];
const a=await actor('catl.owner');
try {
 for(const[key,section,id]of fixtures){
  const path=record=>`neon/business-partners/${record}/360/${section}/reveal`;
  const command=()=>({[key]:id,purpose:'partner_reveal_acceptance',revealId:randomUUID(),purposeExpiresAt:new Date(Date.now()+30000).toISOString()});
  const request=command(), result=await a.call(path(bp),request);
  assert.equal(result.status,200,`${section}: ${result.body?.code}`);assert.equal(typeof result.body.value,'string');
  assert.ok(Date.parse(result.body.expiresAt)>Date.now());
  const normal=await a.call(`entity-runtime/business_partner/records/${bp}/sections/identifiers-tax?surface=detail`);
  assert.equal(normal.status,200);assert.ok(!JSON.stringify(normal.body).includes(result.body.value),'Plaintext leaked into normal section');
  const replay=await a.call(path(bp),request);assert.equal(replay.status,409);assert.equal(replay.body.code,'BP_360_REVEAL_REPLAYED');
  const wrongParent=await a.call(path(other),command());assert.ok([403,404].includes(wrongParent.status));assert.equal(wrongParent.body.value,undefined);
  const expired=await a.call(path(bp),{...command(),purposeExpiresAt:new Date(Date.now()-1000).toISOString()});assert.equal(expired.status,403);assert.equal(expired.body.code,'BP_360_REVEAL_PURPOSE_EXPIRED');
  console.log(`${section}: reveal, masked normal read, replay, wrong-parent and expired-claim checks passed`);
 }
}finally{await a.dispose();}
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.owner.json',ignoreHTTPSErrors:true});
 const page=await context.newPage();await page.clock.install();
 await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/${bp}?section=identifiers-tax&tab=360&panel=closed`);
 const reveal=page.getByRole('button',{name:'Reveal',exact:true});await reveal.first().waitFor({timeout:45000});assert.equal(await reveal.count(),2);
 for(let index=0;index<2;index++){
  await reveal.nth(index).click();await page.getByLabel('Reason for access').selectOption('partner_review');
  await page.getByRole('button',{name:'Reveal value',exact:true}).click();
  const hide=page.getByRole('button',{name:'Hide',exact:true});await hide.waitFor({timeout:15000});
  if(index===0)await hide.click();else{await page.clock.fastForward(61000);await hide.waitFor({state:'hidden',timeout:5000});}
 }
 assert.equal(await reveal.count(),2);console.log('Signed-in UI: identifier Reveal/Hide and tax Reveal/automatic expiry passed');
}finally{await browser.close();}
