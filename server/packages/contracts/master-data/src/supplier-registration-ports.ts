import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { BusinessPartnerRequestSchemaReference } from "./business-partner-requests.js";
import type { AcceptSupplierRegistrationInvitationResponse, CreateSupplierRegistrationInvitationCommand, SupplierRegistrationInvitation } from "./supplier-registration.js";

export interface SupplierRegistrationInvitationRepository<Transaction=unknown>{
  findByIdempotencyKey(tenantId:string,idempotencyKey:string,transaction:Transaction):Promise<{readonly invitation:SupplierRegistrationInvitation;readonly inviteeEmailHash:string}|null>;
  create(input:{readonly tenantId:string;readonly invitationNo:string;readonly command:Omit<CreateSupplierRegistrationInvitationCommand,"context"|"inviteeEmail">;readonly inviteeEmailHash:string;readonly tokenHash:string;readonly createdBy:string},transaction:Transaction):Promise<SupplierRegistrationInvitation>;
  get(tenantId:string,invitationId:string,transaction:Transaction):Promise<SupplierRegistrationInvitation|null>;
  accept(input:{readonly tenantId:string;readonly tokenHash:string;readonly inviteeEmailHash:string;readonly applicantPrincipalId:string;readonly requestIdempotencyKey:string;readonly requestNo:string;readonly schema:BusinessPartnerRequestSchemaReference;readonly proposedPayload:Readonly<Record<string,unknown>>},transaction:Transaction):Promise<AcceptSupplierRegistrationInvitationResponse|null>;
  cancel(input:{readonly tenantId:string;readonly invitationId:string;readonly expectedVersion:number;readonly cancelledBy:string},transaction:Transaction):Promise<SupplierRegistrationInvitation|null>;
  expireDue(input:{readonly tenantId:string;readonly actorId:string;readonly now:string;readonly limit:number},transaction:Transaction):Promise<readonly SupplierRegistrationInvitation[]>;
}
export type SupplierRegistrationInvitationTransactionCoordinator<Transaction>=PlaneTransactionCoordinator<Transaction>;
