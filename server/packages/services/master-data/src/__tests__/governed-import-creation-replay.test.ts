import {it,expect,vi} from 'vitest';
import {createBusinessPartnerRequestService} from '../business-partner-request-service.js';
import type {BusinessPartnerRequestServiceOptions} from '../business-partner-request-service.js';
const context={planeKey:'neon',tenantId:'11111111-1111-4111-8111-111111111111',principalId:'22222222-2222-4222-8222-222222222222',requestId:'request'};
const command={context,kind:'new_partner',source:{kind:'import'},registrationMode:'integration',requestedRole:'supplier',operatingOrganizationId:'33333333-3333-4333-8333-333333333333',idempotencyKey:'import-replay-test-0001',proposedPayload:{legalName:'Imported supplier',ownershipClass:'internal',supplierType:'intercompany'}};
const schema={code:'neon.business_partner.entity_case',version:1,hash:'a'.repeat(64),releaseId:'44444444-4444-4444-8444-444444444444'};
it('requires immutable creation evidence for governed import replay and never writes on a conflict',async()=>{
 for(const matching of [true,false]){
  const existing={id:'existing',proposedPayload:{...command.proposedPayload,name:'Persisted enrichment'},schema};
  const matchesGovernedImportCreation=vi.fn(async()=>matching),create=vi.fn();
  const options={repository:{findByIdempotencyKey:async()=>existing,matchesGovernedImportCreation,create},authorizer:{authorize:async()=>({allowed:true})},schemas:{resolve:async()=>schema},transactions:{run:async(_plane:unknown,_actor:unknown,work:(tx:unknown)=>unknown)=>work({})}} as unknown as BusinessPartnerRequestServiceOptions<unknown>;
  const service=createBusinessPartnerRequestService(options);
  if(matching)expect(await service.create(command as never)).toMatchObject({replayed:true,request:existing});
  else await expect(service.create(command as never)).rejects.toMatchObject({code:'BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT'});
  expect(matchesGovernedImportCreation).toHaveBeenCalledOnce();expect(create).not.toHaveBeenCalled();
 }
});
