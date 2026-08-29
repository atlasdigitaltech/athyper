import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { BusinessPartnerRequest, BusinessPartnerRequestSchemaReference } from "./business-partner-requests.js";
import type { BusinessPartnerInvitation, BusinessPartnerInvitationAcceptResponse, BusinessPartnerInvitationJourney, BusinessPartnerInvitationRegistrationMode, BusinessPartnerInvitationScope } from "./business-partner-invitations.js";

export interface BusinessPartnerInvitationRepository<Transaction = unknown> {
  findByIdempotencyKey(tenantId: string, idempotencyKey: string, transaction: Transaction): Promise<{ readonly invitation: BusinessPartnerInvitation; readonly inviteeEmailHash: string } | null>;
  create(input: { readonly tenantId: string; readonly invitationNo: string; readonly journeyKind: BusinessPartnerInvitationJourney; readonly registrationMode: BusinessPartnerInvitationRegistrationMode; readonly scope: BusinessPartnerInvitationScope; readonly intendedPartyName: string; readonly inviteeEmailHash: string; readonly tokenHash: string; readonly expiresAt: string; readonly idempotencyKey: string; readonly createdBy: string }, transaction: Transaction): Promise<BusinessPartnerInvitation>;
  get(tenantId: string, invitationId: string, transaction: Transaction): Promise<BusinessPartnerInvitation | null>;
  resend(input: { readonly tenantId: string; readonly invitationId: string; readonly expectedVersion: number; readonly tokenHash: string; readonly expiresAt: string; readonly actorId: string }, transaction: Transaction): Promise<BusinessPartnerInvitation | null>;
  cancel(input: { readonly tenantId: string; readonly invitationId: string; readonly expectedVersion: number; readonly actorId: string }, transaction: Transaction): Promise<BusinessPartnerInvitation | null>;
  accept(input: { readonly tenantId: string; readonly journeyKind: BusinessPartnerInvitationJourney; readonly tokenHash: string; readonly inviteeEmailHash: string; readonly applicantPrincipalId: string; readonly requestIdempotencyKey: string; readonly requestNo: string; readonly schema: BusinessPartnerRequestSchemaReference; readonly proposedPayload: Readonly<Record<string, unknown>> }, transaction: Transaction): Promise<BusinessPartnerInvitationAcceptResponse | null>;
  expireDue(input: { readonly tenantId: string; readonly actorId: string; readonly now: string; readonly limit: number }, transaction: Transaction): Promise<readonly BusinessPartnerInvitation[]>;
  recover(input: { readonly tenantId: string; readonly invitationId: string; readonly newApplicantPrincipalId: string; readonly recoveredBy: string; readonly reason: string; readonly idempotencyKey: string }, transaction: Transaction): Promise<BusinessPartnerInvitation | null>;
  getOwnedRequest(tenantId: string, requestId: string, applicantPrincipalId: string, journeyKind: BusinessPartnerInvitationJourney, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  correctOwnedRequest(input: { readonly tenantId: string; readonly requestId: string; readonly applicantPrincipalId: string; readonly journeyKind: BusinessPartnerInvitationJourney; readonly expectedVersion: number; readonly proposedPayload: Readonly<Record<string,unknown>> }, transaction: Transaction): Promise<BusinessPartnerRequest | null>;
  attachOwnedEvidence(input: { readonly tenantId: string; readonly requestId: string; readonly applicantPrincipalId: string; readonly journeyKind: BusinessPartnerInvitationJourney; readonly evidenceKind: string; readonly attachmentId: string; readonly contentHash: string; readonly classificationCode: string }, transaction: Transaction): Promise<string | null>;
}

export type BusinessPartnerInvitationTransactionCoordinator<Transaction> = PlaneTransactionCoordinator<Transaction>;
