import {describe,it,expect,vi} from 'vitest';
import type {VerifiedRequestContext} from '@athyper/server-contract-auth';
import {createPartnerCapabilityOperations} from '../entities/partner-capability-operations.js';
const context={planeKey:'neon',tenantId:'44444444-4444-4444-8444-444444444444',principalId:'11111111-1111-4111-8111-111111111111'} as VerifiedRequestContext;
const command={context,entityCode:'business_partner',recordId:'22222222-2222-4222-8222-222222222222',operationKey:'capability_supplier_manage',expectedVersion:1,idempotencyKey:'capability-test-key',input:{enabled:true,reason:'Synthetic test'}};
function setup(allowed=true){
 const change=vi.fn(async()=>({businessPartnerId:command.recordId,capability:'supplier' as const,enabled:true,recordVersion:'2',evidenceId:'evidence',replayed:false}));
 const authorize=vi.fn(async()=>({allowed,reason:'test'}));
 const admitPartner=vi.fn(async()=>{});
 const registry=createPartnerCapabilityOperations({authorizer:{authorize},admitPartner,repository:{change},transactions:{async run(_plane,_context,work){return work({} as never);}}});
 return {registry,change,authorize,admitPartner,execute:registry.get('neon.bp.capability.supplier.v1')!.execute};
}
describe('capability operation registration',()=>{
 it('binds exact permission and verified tenant/record before the command',async()=>{
  const s=setup();const result=await s.execute(command);
  expect(s.authorize).toHaveBeenCalledWith(expect.objectContaining({permissionCode:'neon.relationship.business_partner.capability_supplier_manage',resource:expect.objectContaining({tenantId:context.tenantId,businessPartnerId:command.recordId})}));
  expect(result.changedResources).toEqual([expect.objectContaining({recordId:command.recordId})]);
  expect(s.change).toHaveBeenCalledOnce();
 });
 it('does not mutate when scoped authorization denies',async()=>{const s=setup(false);await expect(s.execute(command)).rejects.toMatchObject({status:403});expect(s.change).not.toHaveBeenCalled();});
 it('rejects caller-owned target/capability fields',async()=>{const s=setup();await expect(s.execute({...command,input:{...command.input,businessPartnerId:'other'}})).rejects.toMatchObject({status:400});expect(s.change).not.toHaveBeenCalled();});
 it('rejects mismatched entity, plane or operation and unknown handlers',async()=>{
  const s=setup();expect(s.registry.get('neon.bp.capability.arbitrary.v1')).toBeUndefined();
  for(const value of [{...command,entityCode:'supplier'},{...command,operationKey:'capability_customer_manage'},{...command,context:{...context,planeKey:'mesh' as const}}])await expect(s.execute(value)).rejects.toMatchObject({status:403});
  expect(s.change).not.toHaveBeenCalled();
 });
 it('requires optimistic version and idempotency through the service',async()=>{const s=setup();await expect(s.execute({...command,expectedVersion:undefined})).rejects.toMatchObject({status:400});expect(s.change).not.toHaveBeenCalled();});
});
