/** Read-only checks against the existing DEV and saved CATL admin session. */
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {actor} from './partner-classification-session.mjs';
import {id} from '../../fixtures/business-partner-core/seed-identity.mjs';
const sections=['overview','identity','industries','commodities','contacts','addresses','identifiers-tax','banking','certificates'];
const partners=process.argv.includes('--person')?['person-partner']:['partner','person-partner'];
const admin=await actor('catl.admin');
let checked=0;
const emptyTitles=new Map();
function check(fields,row){
  for(const field of fields){
    const value=row?.[field.key];
    if(value==null)continue;
    if(field.options){assert.ok(field.options.some(option=>option.value===value),`Unresolved ${field.key}: ${value}`);checked++;}
    if(field.itemFields&&Array.isArray(value))for(const child of value)check(field.itemFields,child);
  }
}
try{
  for(const partner of partners)for(const section of sections){
    const r=await admin.call(`entity-runtime/business_partner/records/${id('cirrusatlantic',partner)}/sections/${section}?surface=detail`);
    assert.equal(r.status,200,JSON.stringify({partner,section,...r}));
    const p=r.body.presentation,root=r.body.data,data=root.data??root;
    const populated=root.values||(data.items?.length>0)||Object.values(data.collections??{}).some(rows=>Array.isArray(rows)&&rows.length>0);
    if(!populated&&p.emptyState?.title)emptyTitles.set(`${partner}/${section}`,p.emptyState.title);
    if(root.values)check(p.fields,root.values);
    for(const row of data.items??[])check(p.fields,row);
    for(const group of p.childCollections)for(const row of data.collections?.[group.key]??[])check(group.fields,row);
  }
}finally{await admin.dispose();}
console.log(JSON.stringify({apiLabels:true,partners,sections:sections.length,resolvedEnumValues:checked}));
const browser=await chromium.launch({headless:true});
try{
  for(const partner of partners)for(const section of sections){
    const context=await browser.newContext({storageState:'tests/e2e/.auth/dev/neon/catl.admin.json',ignoreHTTPSErrors:true});
    const page=await context.newPage();
    await page.goto(`https://neon.dev.athyper.test/mdg/business-partner/${id('cirrusatlantic',partner)}?section=${section}&tab=360&panel=closed`);
    await page.getByText('Active',{exact:true}).first().waitFor({timeout:45000});
    const expected=emptyTitles.get(`${partner}/${section}`)??{overview:'Ownership Class',identity:partner==='partner'?'Legal name':'First name',industries:'Business activity',commodities:'Declaration source',contacts:'Business Title',addresses:'Postal address','identifiers-tax':'Identifier Scheme',banking:'Account Holder Name',certificates:'Certificate Number'}[section];
    await page.getByText(expected,{exact:true}).first().waitFor({timeout:45000});
    assert.equal(await page.getByText('Enumeration label unavailable',{exact:true}).count(),0,`${partner}/${section}`);
    if(section==='industries'&&!emptyTitles.has(`${partner}/${section}`)){
      await page.getByText('Declared',{exact:true}).first().waitFor({timeout:15000});
      assert.equal(await page.getByText('isic',{exact:true}).count(),0);
      assert.equal(await page.getByText('declared',{exact:true}).count(),0);
    }
    if(section==='addresses')await page.getByText('Default',{exact:true}).first().waitFor({timeout:15000});
    console.log(JSON.stringify({partner,section,displayLabels:true}));
    await context.close();
  }
}finally{await browser.close();}
console.log(JSON.stringify({resolvedEnumValues:checked,readOnly:true}));
