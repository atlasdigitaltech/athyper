import {describe,it,expect,vi} from 'vitest';
import {createPartnerCompanyProfileViews} from './company-profile-views.js';
import {MasterDataError} from '../../errors.js';
const id='44444444-4444-4444-8444-444444444444';
const input={context:{planeKey:'neon',tenantId:id} as never,recordId:id,capability:'supplier' as const,operatingOrganizationId:id,companyCodeId:id};
function fixture(allowed=true){
 const admitPartner=vi.fn(async()=>{}),authorize=vi.fn(async()=>({allowed}));
 const readProfile=vi.fn(async(scope,tx,authorize)=>{
  if(!await authorize(scope,tx))throw new MasterDataError(403,'PARTNER_PROFILE_FORBIDDEN','Denied');
  return {id,business_partner_id:id,company_code_id:id,status:'draft',capability_enabled:false,partner_status:'active',currency_code:'GBP',payment_term_id:null,default_accounting_profile_id:null,default_dimension_set_id:null};
 });
 const service=createPartnerCompanyProfileViews({admitPartner,authorizer:{authorize} as never,readProfile,transactions:{run:async(_plane,_actor,work)=>work({} as never)}});
 return{service,admitPartner,authorize,readProfile};
}
describe('MetaEntity partner company profile view',()=>{
 it('reads retained draft setup independently of a Supplier row or enabled flag',async()=>{
  const f=fixture(),result=await f.service.read(input);
  expect(result.data.items[0]).toMatchObject({business_partner_id:id,capability_enabled:false,status:'draft'});
  expect(f.admitPartner).toHaveBeenCalledWith(input.context,id);
  expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({resource:expect.objectContaining({businessPartnerId:id,companyCodeId:id,operatingOrganizationId:id,roleLens:'supplier'})}));
 });
 it('requires selected organization/company without guessing coverage',async()=>{
  const f=fixture();await expect(f.service.read({...input,companyCodeId:undefined})).rejects.toMatchObject({code:'BP_360_SCOPE_REQUIRED'});expect(f.readProfile).not.toHaveBeenCalled();
 });
 it('denies company scope independently of parent admission',async()=>{
  await expect(fixture(false).service.read(input)).rejects.toMatchObject({status:403});
 });
 it('does not project current flags as historical state',async()=>{
  const f=fixture();await expect(f.service.read({...input,asOf:'2020-01-01'})).rejects.toMatchObject({code:'PARTNER_PROFILE_HISTORY_UNAVAILABLE'});expect(f.readProfile).not.toHaveBeenCalled();
 });
});
