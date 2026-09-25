/** Normal-session browser replay of the existing synthetic registration; no new bank account. */
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const bp='01a0cc2b-a958-7703-bade-306f61834dea',link='bed9956c-b66e-49ad-8454-8195a9d2fc1b';
const key='bp209a-partner-independent-20260923';
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/dev/neon/catl.admin.json'});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.__bpRefresh=[];window.addEventListener('athyper:entity-runtime-record-invalidated',event=>window.__bpRefresh.push(event.detail));});
 // Pin both idempotency coordinates to the already-completed synthetic receipt.
 await page.route(`**/business-partners/${bp}/protected-bank-registrations`,async route=>{
  const request=route.request();assert.equal(request.method(),'POST');
  await route.continue({headers:{...request.headers(),'idempotency-key':key},postData:JSON.stringify({...request.postDataJSON(),idempotencyKey:key})});
 });
 await page.goto(`/mdg/business-partner/${bp}/banking`,{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('heading',{name:'Register a bank account',exact:true})).toBeVisible();
 for(const [name,value] of Object.entries({accountHolderName:'BP2-09A synthetic acceptance - not for payment',accountIdentifier:'DE89370400440532013000',currencyCode:'EUR',bankName:'BP2-09A synthetic provisional bank',bankCountryCode:'DE'}))await page.locator(`[name="${name}"]`).fill(value);
 const command=page.waitForResponse(r=>r.url().endsWith(`/business-partners/${bp}/protected-bank-registrations`)&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Register protected bank account',exact:true}).click();
 const response=await command;assert.equal(response.status(),200);const receipt=await response.json();assert.equal(receipt.replayed,true);assert.equal(receipt.registration.bank_account_link_id,link);
 await expect(page.getByText(`Protected registration ${link}: active; account ending 3000.`,{exact:true})).toBeVisible();
 await expect(page.getByText('Loading banking…',{exact:true})).toHaveCount(0);
 const events=await page.evaluate(()=>window.__bpRefresh);assert.equal(events.length,1);assert.equal(events[0].recordId,bp);assert.equal(events[0].entityCode,'business_partner');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,commandStatus:response.status(),replayed:true,newAccountCreated:false,bankingRefreshed:true,receiptPreserved:true,scopedSummaryInvalidationDispatched:true}));
 await context.close();
}finally{await browser.close();}
