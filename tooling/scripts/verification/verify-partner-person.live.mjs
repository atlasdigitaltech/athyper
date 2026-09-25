/** Existing DEV, saved CATL session, read-only API/browser acceptance. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {actor} from './partner-classification-session.mjs';
import {id} from '../../fixtures/business-partner-core/seed-identity.mjs';
const admin=await actor('catl.admin');
try {
 for(const key of ['partner','person-partner']) {
  for(const section of ['overview','identity','contacts','addresses','identifiers-tax','banking','certificates','industries','commodities']) {
   const r=await admin.call(`entity-runtime/business_partner/records/${id('cirrusatlantic',key)}/sections/${section}?surface=detail`);
   assert.equal(r.status,200,JSON.stringify({key,section,...r}));
   if(section==='overview') {
    const field=r.body.presentation.fields.find(f=>f.key==='ownership_class');
    assert.equal(field.options.find(o=>o.value===r.body.data.values.ownership_class).label.defaultText,'External');
   }
   if(section==='contacts') {
    const items=r.body.data.data.items;assert.equal(items.length,1);
    assert.equal(new Set(items[0].roles.map(role=>role.addressLinkId)).size,2);
   }
   if(section==='addresses') {
    const items=r.body.data.data.items;assert.equal(items.length,2);
    assert.ok(items.every(item=>item.assignedContacts.some(contact=>contact.name==='Alex Example'&&contact.role==='billing')));
   }
   if(section==='identity') {
    const values=r.body.data.values,fields=r.body.presentation.fields.map(f=>f.key);
    assert.equal(values.partner_category,key==='partner'?'organization':'person');
    if(key==='partner') {assert.ok(values.legal_form_label);assert.ok(!fields.includes('person_first_name'));assert.ok(!Object.hasOwn(values,'person_first_name'));}
    else {assert.equal(values.person_first_name,'Maya');assert.ok(!fields.includes('legal_name'));assert.ok(!fields.includes('incorporation_date'));}
    for(const sensitive of ['date_of_birth','national_id','passport_number','person_id'])assert.ok(!Object.hasOwn(values,sensitive));
   }
  }
  const denied=await admin.call(`entity-runtime/business_partner/records/${id('athyper',key)}/sections/identity?surface=detail`);
  assert.ok([403,404].includes(denied.status));
  console.log(JSON.stringify({key,nineSections:true,crossTenantDenied:true}));
 }
} finally {await admin.dispose();}
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.admin.json',ignoreHTTPSErrors:true});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const key of ['partner','person-partner']) {
  await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/${id('cirrusatlantic',key)}?section=identity&tab=360&panel=closed`);
  const shown=key==='partner'?'Legal name':'First name',hidden=key==='partner'?'First name':'Legal name';
  await page.getByText(shown,{exact:true}).first().waitFor({timeout:45000});
  assert.equal(await page.getByText(hidden,{exact:true}).count(),0);
  console.log(JSON.stringify({key,signedInBrowser:true,categorySafeIdentity:true}));
  await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/${id('cirrusatlantic',key)}?section=overview&tab=360&panel=closed`);
  await page.getByText('External',{exact:true}).first().waitFor({timeout:45000});
  assert.equal(await page.getByText('external',{exact:true}).count(),0);
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
