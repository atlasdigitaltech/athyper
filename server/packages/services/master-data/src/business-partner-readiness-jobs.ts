import type{JobHandler}from"@athyper/server-contract-jobs";
import type{BusinessPartnerEligibilityService,SupplierActivationReevaluationScope}from"@athyper/server-contract-master-data";

export const SUPPLIER_READINESS_MAINTENANCE_QUEUE="neon-supplier-readiness-maintenance";
export const EXPIRE_SUPPLIER_QUALIFICATIONS_JOB="supplier-qualifications-expire";
export const REEVALUATE_SUPPLIER_ACTIVATIONS_JOB="supplier-activations-reevaluate";
export interface SupplierQualificationExpiryPayload{readonly tenantId:string;readonly actorId:string;readonly businessDate:string;readonly limit?:number;}
export interface SupplierActivationReevaluationPayload{readonly tenantId:string;readonly actorId:string;readonly businessDate:string;readonly scopes:readonly SupplierActivationReevaluationScope[];}
export function createSupplierQualificationExpiryHandler(service:BusinessPartnerEligibilityService):JobHandler<typeof EXPIRE_SUPPLIER_QUALIFICATIONS_JOB,SupplierQualificationExpiryPayload>{return{async handle(job,context){if(context.signal.aborted)return{status:"discarded",reason:"cancelled"};const expired=await service.expireQualifications(job.data);await context.reportProgress({expired:expired.length});return{status:"completed",output:{expired:expired.length}};}};}
export function createSupplierActivationReevaluationHandler(service:BusinessPartnerEligibilityService):JobHandler<typeof REEVALUATE_SUPPLIER_ACTIVATIONS_JOB,SupplierActivationReevaluationPayload>{return{async handle(job,context){if(context.signal.aborted)return{status:"discarded",reason:"cancelled"};const decisions=await service.reevaluateSupplierActivations(job.data),blocked=decisions.filter(item=>!item.eligible).length;await context.reportProgress({evaluated:decisions.length,blocked});return{status:"completed",output:{evaluated:decisions.length,blocked}};}};}
