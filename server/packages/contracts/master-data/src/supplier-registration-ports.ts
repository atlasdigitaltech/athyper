import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { BusinessPartnerRequest, BusinessPartnerRequestSchemaReference } from "./business-partner-requests.js";
import type { AcceptSupplierRegistrationInvitationResponse, CreateSupplierRegistrationInvitationCommand, SupplierRegistrationInvitation } from "./supplier-registration.js";

export interface SupplierRegistrationInvitationRepository<Transaction=unknown>{
  findByIdempotencyKey(tenantId:string,idempotencyKey:string,transaction:Transaction):Promise<{readonly invitation:SupplierRegistrationInvitation;readonly inviteeEmailHash:string}|null>;
  create(input:{readonly tenantId:string;readonly invitationNo:string;readonly command:Omit<CreateSupplierRegistrationInvitationCommand,"context"|"inviteeEmail">;readonly inviteeEmailHash:string;readonly tokenHash:string;readonly createdBy:string},transaction:Transaction):Promise<SupplierRegistrationInvitation>;
  get(tenantId:string,invitationId:string,transaction:Transaction):Promise<SupplierRegistrationInvitation|null>;
  accept(input:{readonly tenantId:string;readonly tokenHash:string;readonly inviteeEmailHash:string;readonly applicantPrincipalId:string;readonly requestIdempotencyKey:string;readonly requestNo:string;readonly schema:BusinessPartnerRequestSchemaReference;readonly proposedPayload:Readonly<Record<string,unknown>>;readonly expectedRole?:"supplier"|"customer"},transaction:Transaction):Promise<AcceptSupplierRegistrationInvitationResponse|null>;
  cancel(input:{readonly tenantId:string;readonly invitationId:string;readonly expectedVersion:number;readonly cancelledBy:string},transaction:Transaction):Promise<SupplierRegistrationInvitation|null>;
  expireDue(input:{readonly tenantId:string;readonly actorId:string;readonly now:string;readonly limit:number},transaction:Transaction):Promise<readonly SupplierRegistrationInvitation[]>;
  getOwnedRequest(tenantId:string,requestId:string,applicantPrincipalId:string,transaction:Transaction):Promise<BusinessPartnerRequest|null>;
  correctOwnedRequest(input:{readonly tenantId:string;readonly requestId:string;readonly applicantPrincipalId:string;readonly expectedVersion:number;readonly proposedPayload:Readonly<Record<string,unknown>>},transaction:Transaction):Promise<BusinessPartnerRequest|null>;
  attachOwnedEvidence(input:{readonly tenantId:string;readonly requestId:string;readonly applicantPrincipalId:string;readonly evidenceKind:string;readonly attachmentId:string;readonly contentHash:string;readonly classificationCode:string},transaction:Transaction):Promise<string|null>;
  recoverApplicant(input:{readonly tenantId:string;readonly invitationId:string;readonly newApplicantPrincipalId:string;readonly recoveredBy:string;readonly reason:string},transaction:Transaction):Promise<SupplierRegistrationInvitation|null>;
}
export type SupplierRegistrationInvitationTransactionCoordinator<Transaction>=PlaneTransactionCoordinator<Transaction>;
