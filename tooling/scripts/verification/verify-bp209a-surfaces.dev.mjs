/** Read-only BP2-09A DEV acceptance with normal saved CATL sessions. */
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
const origin='https://neon.dev.athyper.test',bp='01a0cc2b-a958-7703-bade-306f61834dea';
const groups=['bank_accounts','bank_account_links','bank_provisional_references'];
const browser=await chromium.launch();
try {
 for(const actor of ['catl.admin','catl.owner']){
  const context=await browser.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/neon/${actor}.json`});
  try{
   const session=await(await context.request.get('/api/auth/session')).json();assert.equal(session.state,'authenticated');
   const response=await context.request.get(`/api/relay/entity-runtime/business_partner/records/${bp}/sections/banking?surface=detail`);assert.equal(response.status(),200);
   const body=await response.json();assert.deepEqual(body.presentation.childCollections.map(g=>g.key),groups);
   for(const group of groups)assert.ok(Array.isArray(body.data.data.collections[group]));
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`/mdg/business-partner/${bp}`,{waitUntil:'domcontentloaded'});
   await page.getByText('360 View',{exact:true}).click();
   await page.getByText('Banking',{exact:true}).first().click();
   for(const name of ['Bank Accounts','Bank Account Links','Bank Provisional References'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
   await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);assert.deepEqual(errors,[]);
   console.log(JSON.stringify({actor,status:response.status(),releaseHash:body.releaseHash,groups,companyContextRequired:false,browser:'pass',populated:body.data.data.collections.bank_accounts.length>0}));
  }finally{await context.close();}
 }
}finally{await browser.close();}
