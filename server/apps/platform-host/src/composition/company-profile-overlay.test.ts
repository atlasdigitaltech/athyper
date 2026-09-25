import {describe,it,expect} from 'vitest';
import {companyProfileArtifactKeys,companyProfileOverlay} from '../../scripts/db-verification/provisioning/company-profile-overlay.js';
describe('company-profile read overlay',()=>{
 it('changes only declared profile bindings and BP capability/ownership coordinates',()=>{
  const relations=['supplier','customer'].map(role=>({relationKey:`business_partner.${role}_company_profile`,binding:{owner:'new'}}));
  const sources=companyProfileArtifactKeys.map(artifactKey=>artifactKey==='business_partner/presentation.detail'?{artifactKey,navigation:{tabs:[{key:'roles',sectionKeys:['roles-scope','supplier-company','customer-company']}]}}:artifactKey==='business_partner/core'?{artifactKey,fields:['supplier_enabled','customer_enabled'].map(key=>({key,writePolicy:'system_managed'})),relations}:artifactKey.endsWith('/core')?{artifactKey,storage:{genericWriteEnabled:false},fields:[{key:'business_partner_id',binding:{column:'business_partner_id'}}]}:{artifactKey,fieldBindings:[{fieldKey:'business_partner_id'}],authorization:'must-not-replace'});
  const baseline=sources.map(value=>value.artifactKey==='business_partner/core'?{...value,fields:[{key:'existing'}],relations:relations.map(r=>({...r,binding:{owner:'old'}})),protections:['unchanged']}:{...value,authorization:'keep',navigation:value.navigation??{keep:true}});
  baseline[5].navigation={tabs:[{key:'overview',sectionKeys:['overview']},{key:'roles',sectionKey:'roles-scope'}]};
  const unrelated={artifactKey:'unrelated/core',value:'keep'},result=companyProfileOverlay([...baseline,unrelated],sources);
  expect(result.at(-1)).toEqual(unrelated);expect(result[4].protections).toEqual(['unchanged']);expect(result[4].fields[0]).toEqual({key:'existing'});
  expect(result[2].authorization).toBe('keep');expect(result[2].navigation).toEqual({keep:true});expect(baseline[4].fields).toEqual([{key:'existing'}]);
  expect(result[5].navigation.tabs).toEqual([{key:'overview',sectionKeys:['overview']},{key:'roles',sectionKeys:['roles-scope','supplier-company','customer-company']}]);
  expect(baseline[5].navigation.tabs[1]).toEqual({key:'roles',sectionKey:'roles-scope'});
  expect(()=>companyProfileOverlay(baseline,[...sources,sources[0]])).toThrow('SCOPE_INVALID');
 });
 it('rejects broad or missing source sets',()=>{expect(()=>companyProfileOverlay([],[])).toThrow('SCOPE_INVALID');});
});
