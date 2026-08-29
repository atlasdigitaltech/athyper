import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequest } from "./business-partner-requests.js";

export const supplierRegistrationPermissions=Object.freeze({
  invitationCreate:"neon.supplier_registration.invitation.create",
  invitationRead:"neon.supplier_registration.invitation.read",
  invitationCancel:"neon.supplier_registration.invitation.cancel",
  externalRespond:"neon.supplier_registration.external.respond",
  customerInvitationCreate:"neon.customer_registration.invitation.create",
  customerInvitationRead:"neon.customer_registration.invitation.read",
  customerInvitationCancel:"neon.customer_registration.invitation.cancel",
  customerExternalRespond:"neon.customer_registration.external.respond",
} as const);

export type SupplierRegistrationInvitationStatus="pending"|"accepted"|"cancelled"|"expired";

export interface SupplierRegistrationInvitation {
  readonly id:string; readonly tenantId:string; readonly invitationNo:string;
  readonly requestedOperatingOrganizationId:string; readonly optionalCompanyCodeId?:string;
  readonly intendedSupplierName:string; readonly expiresAt:string;
  readonly requestedRole:"supplier"|"customer";
  readonly status:SupplierRegistrationInvitationStatus;
  readonly applicantPrincipalId?:string; readonly businessPartnerRequestId?:string;
  readonly acceptedAt?:string; readonly cancelledAt?:string;
  readonly idempotencyKey:string; readonly rowVersion:number;
  readonly createdAt:string; readonly createdBy:string; readonly updatedAt?:string; readonly updatedBy?:string;
}

export interface CreateSupplierRegistrationInvitationCommand {
  readonly context:VerifiedRequestContext; readonly idempotencyKey:string;
  readonly operatingOrganizationId:string; readonly companyCodeId?:string;
  readonly intendedSupplierName:string; readonly inviteeEmail:string; readonly expiresAt:string;
  readonly requestedRole?:"supplier"|"customer";
}
export interface CreateSupplierRegistrationInvitationResponse {readonly invitation:SupplierRegistrationInvitation;readonly token?:string;readonly replayed:boolean;}

export interface AcceptSupplierRegistrationInvitationCommand {
  readonly context:VerifiedRequestContext; readonly token:string; readonly inviteeEmail:string;
  readonly requestIdempotencyKey:string; readonly proposedPayload:Readonly<Record<string,unknown>>;
  readonly expectedRole?:"supplier"|"customer";
}
export interface AcceptSupplierRegistrationInvitationResponse {readonly invitation:SupplierRegistrationInvitation;readonly request:BusinessPartnerRequest;readonly replayed:boolean;}

export interface CancelSupplierRegistrationInvitationCommand {readonly context:VerifiedRequestContext;readonly invitationId:string;readonly expectedVersion:number;}
export interface SupplierRegistrationInvitationQuery {readonly context:VerifiedRequestContext;readonly invitationId:string;}

export interface SupplierRegistrationInvitationService {
  create(command:CreateSupplierRegistrationInvitationCommand):Promise<CreateSupplierRegistrationInvitationResponse>;
  get(query:SupplierRegistrationInvitationQuery):Promise<SupplierRegistrationInvitation>;
  accept(command:AcceptSupplierRegistrationInvitationCommand):Promise<AcceptSupplierRegistrationInvitationResponse>;
  cancel(command:CancelSupplierRegistrationInvitationCommand):Promise<SupplierRegistrationInvitation>;
  expireDue(input:{readonly tenantId:string;readonly actorId:string;readonly now?:string;readonly limit?:number}):Promise<readonly SupplierRegistrationInvitation[]>;
  externalStatus(input:{readonly context:VerifiedRequestContext;readonly requestId:string;readonly expectedRole?:"supplier"|"customer"}):Promise<Readonly<{requestId:string;requestNo:string;status:string;rowVersion:number;validationSummary:Readonly<Record<string,unknown>>;updatedAt?:string}>>;
  correctReturned(input:{readonly context:VerifiedRequestContext;readonly requestId:string;readonly expectedVersion:number;readonly proposedPayload:Readonly<Record<string,unknown>>;readonly expectedRole?:"supplier"|"customer"}):Promise<BusinessPartnerRequest>;
  attachEvidence(input:{readonly context:VerifiedRequestContext;readonly requestId:string;readonly evidenceKind:string;readonly attachmentId:string;readonly contentHash:string;readonly classificationCode:"internal"|"confidential"|"restricted";readonly expectedRole?:"supplier"|"customer"}):Promise<Readonly<{evidenceId:string}>>;
  recoverApplicant(input:{readonly context:VerifiedRequestContext;readonly invitationId:string;readonly newApplicantPrincipalId:string;readonly reason:string}):Promise<SupplierRegistrationInvitation>;
}
