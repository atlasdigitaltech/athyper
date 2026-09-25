/** Read-only browser acceptance of published MetaEntity company-profile fields. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.admin.json',ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});
 const page=await context.newPage();
 for(const section of ['supplier-company','customer-company']){
  const response=page.waitForResponse(r=>r.url().includes(`/sections/${section}`));
  await page.goto(`https://neon.dev.athyper.test/app/entity/business_partner/b4137225-4534-5469-8138-09d15a970271?tab=roles&section=${section}&operatingOrganizationId=a478f9c0-8226-5d22-9599-b8fb27a45180&companyCodeId=793b6cb3-3c61-57c0-9562-2cbc288bd4cf`);
  assert.equal((await response).status(),200);
  for(const label of ['CirrusAtlantic UK','Pound Sterling','Demo net 30 days','Draft']){
   await page.locator('main').getByText(label,{exact:true}).first().waitFor({state:'visible'});
  }
  assert.equal((await page.locator('main').innerText()).includes('793b6cb3-3c61-57c0-9562-2cbc288bd4cf'),false);
  console.log(`PASS browser: ${section} resolves company, currency, payment terms and status from metadata`);
 }
}finally{await browser.close();}
