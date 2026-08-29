import type{JobHandler}from"@athyper/server-contract-jobs";
import type{SupplierRegistrationInvitationService}from"@athyper/server-contract-master-data";

export const SUPPLIER_REGISTRATION_MAINTENANCE_QUEUE="neon-supplier-registration-maintenance";
export const EXPIRE_SUPPLIER_REGISTRATION_INVITATIONS_JOB="supplier-registration-invitations-expire";
export interface SupplierRegistrationInvitationExpiryPayload{readonly tenantId:string;readonly actorId:string;readonly limit?:number;readonly now?:string;}
export function createSupplierRegistrationInvitationExpiryHandler(service:SupplierRegistrationInvitationService):JobHandler<typeof EXPIRE_SUPPLIER_REGISTRATION_INVITATIONS_JOB,SupplierRegistrationInvitationExpiryPayload>{return{async handle(job,context){if(context.signal.aborted)return{status:"discarded",reason:"cancelled"};const expired=await service.expireDue(job.data);await context.reportProgress({expired:expired.length});return{status:"completed",output:{expired:expired.length}};}};}
