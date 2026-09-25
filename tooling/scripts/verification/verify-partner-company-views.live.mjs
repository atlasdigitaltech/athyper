/** Read-only signed-in checks; never grants permission or creates assurance. */
import assert from 'node:assert/strict';
import {actor} from './partner-classification-session.mjs';

const names=process.argv.slice(2);
if(!names.length) names.push('catl.admin');
const partners=['b4137225-4534-5469-8138-09d15a970271','13792b98-a65a-544f-8212-742ee48e74c6'];
const sections=['supplier-company','customer-company'];
const organization='a478f9c0-8226-5d22-9599-b8fb27a45180';
const company='793b6cb3-3c61-57c0-9562-2cbc288bd4cf';
const absent='00000000-0000-4000-8000-000000000000';
for(const name of names){
 const session=await actor(name);
 try{
  for(const partner of partners){
   const base=`entity-runtime/business_partner/records/${partner}`;
   const bootstrap=await session.call(`${base}/bootstrap?surface=detail`);
   assert.equal(bootstrap.status,200,`${name}: bootstrap`);
   assert.deepEqual(bootstrap.body.plan.navigation.tabs.find(t=>t.key==='roles').sectionKeys,['roles-scope',...sections]);
   for(const section of sections){
    const path=`${base}/sections/${section}?surface=detail`;
    const missing=await session.call(path);
    assert.equal(missing.status,409,`${name}: missing scope must not be legacy-role 404`);
    assert.equal(missing.body.code,'ENTITY_RUNTIME_CONTEXT_REQUIRED');
    const scoped=await session.call(`${path}&operatingOrganizationId=${organization}&companyCodeId=${company}`);
    assert.equal(scoped.status,200,`${name}: scoped ${section}`);
    assert.equal(scoped.body.data.state,'ready');
    assert.equal(scoped.body.data.items.length,1);
    const row=scoped.body.data.items[0];
    assert.equal(row.business_partner_id,partner);
    assert.equal(row.company_code_id,company);
    assert.equal(row.status,'draft');
    assert.equal(row.capability_enabled,false,'Fixture must not enable commercial use');
    assert.equal('supplier_id' in row||'customer_id' in row,false);
    for(const key of ['business_partner_id','company_code_id','currency_code','payment_term_id','status']){
     assert.ok(row[key],`Demo field ${key} is populated`);
     const field=scoped.body.presentation.fields.find(f=>f.key===key);
     const label=field?.options?.find(o=>o.value===row[key])?.label?.defaultText;
     assert.ok(label&&label!==row[key],`MetaEntity display label missing for ${key}`);
    }
    const wrongScope=await session.call(`${path}&operatingOrganizationId=${absent}&companyCodeId=${company}`);
    if(wrongScope.status===200) assert.deepEqual(wrongScope.body.data.items,[],'Invalid membership must expose no profiles');
    else assert.ok([403,404].includes(wrongScope.status),`Unexpected invalid-scope response ${wrongScope.status}`);
    console.log(`PASS ${name}: ${partner} ${section}, published navigation, explicit scope, retained draft, invalid membership`);
   }
  }
 }finally{await session.dispose();}
}
