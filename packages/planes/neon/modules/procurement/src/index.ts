export type ProcurementContextDecision=
  | Readonly<{state:"company_required"}>
  | Readonly<{state:"organization_required"}>
  | Readonly<{state:"organization_incompatible"}>
  | Readonly<{state:"profile_required"}>
  | Readonly<{state:"ready";scope:ProcurementCommandScope}>;

export interface ProcurementCommandScope { readonly companyCodeId:string;readonly operatingOrganizationId:string;readonly businessDate:string; }
export interface ProcurementContextInput {
  readonly company?:Readonly<{companyCodeId:string}>;
  readonly organization?:Readonly<{id:string;procurementProfileConfigured:boolean;companyAssignments:readonly Readonly<{companyCodeId:string}>[]}>;
  readonly businessDate:string;
}

/** Client-side route guard only. Domain services must repeat all validation transactionally. */
export function resolveProcurementContext(input:ProcurementContextInput):ProcurementContextDecision{
  if(!input.company)return Object.freeze({state:"company_required"});
  if(!input.organization)return Object.freeze({state:"organization_required"});
  if(!input.organization.companyAssignments.some((assignment)=>assignment.companyCodeId===input.company!.companyCodeId))return Object.freeze({state:"organization_incompatible"});
  if(!input.organization.procurementProfileConfigured)return Object.freeze({state:"profile_required"});
  return Object.freeze({state:"ready",scope:Object.freeze({companyCodeId:input.company.companyCodeId,operatingOrganizationId:input.organization.id,businessDate:isoDate(input.businessDate)})});
}

function isoDate(value:string):string{if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`)))throw new TypeError("businessDate must be an ISO date");return value;}
