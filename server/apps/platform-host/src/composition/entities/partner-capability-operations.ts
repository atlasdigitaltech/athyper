import type {Authorizer,VerifiedRequestContext} from '@athyper/server-contract-auth';
import type {Transaction} from 'kysely';
import {EntityRuntimeOperationError,type EntityRuntimeOperationHandlerRegistry} from '@athyper/server-platform-experience';
import {PartnerCapabilityService,KyselyPartnerCapabilityRepository,MasterDataError,type PartnerCapabilityRepository} from '@athyper/server-service-master-data';
type Tx=Transaction<Record<string,never>>;
export function createPartnerCapabilityOperations(options:{
 authorizer:Authorizer;
 admitPartner(context:VerifiedRequestContext,recordId:string):Promise<void>;
 transactions:{run<T>(plane:'neon',context:VerifiedRequestContext,work:(tx:Tx)=>Promise<T>):Promise<T>};
 repository?:PartnerCapabilityRepository<Tx>;
}):EntityRuntimeOperationHandlerRegistry{
 return {get(key){
  const capability=key==='neon.bp.capability.supplier.v1'?'supplier':key==='neon.bp.capability.customer.v1'?'customer':undefined;
  if(!capability)return undefined;
  return {async execute(command){
   if(command.context.planeKey!=='neon'||command.entityCode!=='business_partner'||command.operationKey!==`capability_${capability}_manage`)
    throw new EntityRuntimeOperationError(403,'PARTNER_CAPABILITY_TARGET_INVALID');
   if(Object.keys(command.input).some(key=>!['enabled','reason'].includes(key)))throw new EntityRuntimeOperationError(400,'PARTNER_CAPABILITY_INPUT_INVALID');
   await options.admitPartner(command.context,command.recordId);
   const service=new PartnerCapabilityService(options.repository??new KyselyPartnerCapabilityRepository(),async request=>
    (await options.authorizer.authorize({context:command.context,permissionCode:`neon.relationship.business_partner.capability_${capability}_manage`,resource:{tenantId:request.tenantId,resourceCode:'business_partner',recordId:request.recordId,businessPartnerId:request.recordId,authorizationTarget:'existing'}})).allowed);
   try{return await options.transactions.run('neon',command.context,async tx=>{
    const result=await service.change({businessPartnerId:command.recordId,capability,enabled:command.input.enabled as boolean,reason:command.input.reason as string,expectedVersion:command.expectedVersion!,idempotencyKey:command.idempotencyKey!},{tenantId:command.context.tenantId,principalId:command.context.principalId},tx);
    return {...result,changedResources:[{entityCode:'business_partner',recordId:command.recordId,revision:result.recordVersion,kinds:['header','summary','section','action_summary'],sectionKeys:['roles-scope','supplier-company','customer-company']}]};
   });}catch(error){
    if(error instanceof MasterDataError&&[400,403,404,409].includes(error.status))throw new EntityRuntimeOperationError(error.status as 400|403|404|409,error.code);
    const code=(error as {code?:string})?.code;
    if(code==='40001'||code==='23514'||code==='23505')throw new EntityRuntimeOperationError(409,'PARTNER_CAPABILITY_CONFLICT');
    if(code==='42501')throw new EntityRuntimeOperationError(403,'PARTNER_CAPABILITY_FORBIDDEN');
    throw error;
   }
  }};
 }};
}
