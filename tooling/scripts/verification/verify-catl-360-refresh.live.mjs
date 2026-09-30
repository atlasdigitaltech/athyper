/** Read-only checks; never log protected values or session material. */
import assert from 'node:assert/strict';
import {actor} from './partner-classification-session.mjs';
import {id} from '../../fixtures/business-partner-core/seed-identity.mjs';
const sections=['overview','identity','industries','commodities','contacts','addresses','identifiers-tax','banking','certificates'];
for(const who of ['catl.admin','catl.owner']){
 const client=await actor(who);
 try{
  for(const key of ['partner','person-partner']){
   const results={};
   for(const section of sections){
    const response=await client.call(`entity-runtime/business_partner/records/${id('cirrusatlantic',key)}/sections/${section}?surface=detail`);
    assert.equal(response.status,200,`${who} ${key} ${section}`);
    const envelope=response.body.data;
    results[section]=envelope.data??envelope;
    assert.equal(envelope.state,'ready',`${key} ${section} state`);
    assert.ok(!JSON.stringify(envelope).includes('protectedValueToken'));
   }
   assert.ok(results.commodities.collections.commodity_classifications.some(x=>x.commodity_code==='41101502'));
   assert.ok(results.industries.collections.industries.length>=2);
   assert.ok(results.contacts.items[0].roles.length>=3);
   assert.ok(results.addresses.items.length>=2);
   assert.equal(results['identifiers-tax'].collections.tax_registrations[0].taxTypeCode,'DEMO_RESEARCH_TAX');
   assert.ok(results.certificates.collections.certifications.some(x=>x.custom_name==='Research quality certificate (Demo)'));
   const banks=results.banking.collections.bank_accounts;
   assert.equal(banks.length,key==='partner'?2:1);
   assert.ok(banks.every(b=>b.status==='inactive'));
   if(who==='catl.admin')assert.ok(banks.every(b=>b.revealable===false));
   else assert.ok(banks.every(b=>b.revealable===true||b.revealVerificationRequired===true));
   assert.ok(!JSON.stringify(results.banking).includes('DEMOCIRRUSATLANTIC'));
   console.log(`${who}: ${key}: all nine sections, populated references and masked banking passed`);
  }
 }finally{await client.dispose();}
}
