import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequest } from "./business-partner-requests.js";

export const businessPartnerInvitationPermissions = Object.freeze({
  supplierCreate: "neon.supplier_registration.invitation.create",
  supplierRead: "neon.supplier_registration.invitation.read",
  supplierCancel: "neon.supplier_registration.invitation.cancel",
  supplierRespond: "neon.supplier_registration.external.respond",
  customerCreate: "neon.customer_registration.invitation.create",
  customerRead: "neon.customer_registration.invitation.read",
  customerCancel: "neon.customer_registration.invitation.cancel",
  customerRespond: "neon.customer_registration.external.respond",
  candidateCreate: "neon.workforce.invitation.create",
  candidateRead: "neon.workforce.invitation.read",
  candidateCancel: "neon.workforce.invitation.cancel",
  candidateRespond: "neon.workforce.invitation.external.respond",
  recover: "neon.business_partner_invitation.recovery.request",
} as const);

export type BusinessPartnerInvitationJourney =
  "supplier" | "customer" | "candidate";
export type BusinessPartnerInvitationRole =
  "supplier" | "customer" | "workforce";
export type BusinessPartnerInvitationStatus =
  "pending" | "accepted" | "cancelled" | "expired" | "superseded";
export type BusinessPartnerInvitationRegistrationMode =
  "self_service" | "on_behalf" | "integration";

export type BusinessPartnerInvitationScope =
  | {
      readonly kind: "commercial";
      readonly operatingOrganizationId: string;
      readonly companyCodeId?: string;
    }
  | {
      readonly kind: "workforce";
      readonly legalEntityId: string;
      readonly companyCodeId: string;
      readonly orgUnitId: string;
      readonly positionId?: string;
    };

export interface BusinessPartnerInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly invitationNo: string;
  readonly journeyKind: BusinessPartnerInvitationJourney;
  readonly registrationMode: BusinessPartnerInvitationRegistrationMode;
  readonly requestedRole: BusinessPartnerInvitationRole;
  readonly scope: BusinessPartnerInvitationScope;
  readonly intendedPartyName: string;
  readonly status: BusinessPartnerInvitationStatus;
  readonly expiresAt: string;
  readonly applicantPrincipalId?: string;
  /** @deprecated Use entityCaseId. Never persisted after G6. */
  readonly businessPartnerRequestId?: string;
  /** Governed case coordinate for accepted invitations. */
  readonly entityCaseId?: string;
  readonly acceptedAt?: string;
  readonly cancelledAt?: string;
  readonly supersededAt?: string;
  readonly idempotencyKey: string;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

export interface CreateBusinessPartnerInvitationCommand {
  readonly context: VerifiedRequestContext;
  readonly idempotencyKey: string;
  readonly journeyKind: BusinessPartnerInvitationJourney;
  readonly registrationMode?: BusinessPartnerInvitationRegistrationMode;
  readonly scope: BusinessPartnerInvitationScope;
  readonly intendedPartyName: string;
  readonly inviteeEmail: string;
  readonly expiresAt: string;
}

export interface AcceptBusinessPartnerInvitationCommand {
  readonly context: VerifiedRequestContext;
  readonly journeyKind: BusinessPartnerInvitationJourney;
  readonly token: string;
  readonly inviteeEmail: string;
  readonly requestIdempotencyKey: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerInvitationIssueResponse {
  readonly invitation: BusinessPartnerInvitation;
  readonly token?: string;
  readonly replayed: boolean;
}
export interface BusinessPartnerInvitationAcceptResponse {
  readonly invitation: Readonly<{id:string;invitationNo:string;status:BusinessPartnerInvitationStatus}>;
  readonly request: BusinessPartnerExternalApplication;
  readonly case?: BusinessPartnerExternalApplication;
  readonly replayed: boolean;
}
export interface BusinessPartnerExternalApplication {readonly id:string;readonly requestId:string;readonly requestNo:string;readonly status:string;readonly rowVersion:number;readonly validationSummary:Readonly<Record<string,unknown>>;readonly editablePayload:Readonly<Record<string,unknown>>;readonly updatedAt?:string;}
export interface BusinessPartnerInvitationTemplate {
  readonly journeyKind: BusinessPartnerInvitationJourney;
  readonly requestedRole: BusinessPartnerInvitationRole;
  readonly approvedFields: readonly string[];
  readonly approvedActions: readonly (
    "accept" | "status" | "correct" | "evidence" | "submit"
  )[];
}

export interface BusinessPartnerInvitationService {
  create(
    command: CreateBusinessPartnerInvitationCommand,
  ): Promise<BusinessPartnerInvitationIssueResponse>;
  get(input: {
    readonly context: VerifiedRequestContext;
    readonly invitationId: string;
  }): Promise<BusinessPartnerInvitation>;
  resend(input: {
    readonly context: VerifiedRequestContext;
    readonly invitationId: string;
    readonly expectedVersion: number;
    readonly expiresAt: string;
  }): Promise<BusinessPartnerInvitationIssueResponse>;
  cancel(input: {
    readonly context: VerifiedRequestContext;
    readonly invitationId: string;
    readonly expectedVersion: number;
  }): Promise<BusinessPartnerInvitation>;
  accept(
    command: AcceptBusinessPartnerInvitationCommand,
  ): Promise<BusinessPartnerInvitationAcceptResponse>;
  expireDue(input: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly now?: string;
    readonly limit?: number;
  }): Promise<readonly BusinessPartnerInvitation[]>;
  recover(input: {
    readonly context: VerifiedRequestContext;
    readonly invitationId: string;
    readonly newApplicantPrincipalId: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<BusinessPartnerInvitation>;
  externalStatus(input: {
    readonly context: VerifiedRequestContext;
    readonly journeyKind: BusinessPartnerInvitationJourney;
    readonly requestId: string;
  }): Promise<
    Readonly<{
      requestId: string;
      requestNo: string;
      status: string;
      rowVersion: number;
      validationSummary: Readonly<Record<string, unknown>>;
      editablePayload: Readonly<Record<string, unknown>>;
      updatedAt?: string;
    }>
  >;
  correctReturned(input: {
    readonly context: VerifiedRequestContext;
    readonly journeyKind: BusinessPartnerInvitationJourney;
    readonly requestId: string;
    readonly expectedVersion: number;
    readonly proposedPayload: Readonly<Record<string, unknown>>;
  }): Promise<BusinessPartnerRequest>;
  attachEvidence(input: {
    readonly context: VerifiedRequestContext;
    readonly journeyKind: BusinessPartnerInvitationJourney;
    readonly requestId: string;
    readonly evidenceKind: string;
    readonly attachmentId: string;
    readonly contentHash: string;
    readonly classificationCode: "internal" | "confidential" | "restricted";
  }): Promise<Readonly<{ evidenceId: string }>>;
  stageEvidence(input:{readonly context:VerifiedRequestContext;readonly journeyKind:BusinessPartnerInvitationJourney;readonly requestId:string;readonly attachmentId:string;readonly fileName:string;readonly contentType:string;readonly sizeBytes:number}):Promise<Readonly<{attachmentId:string;uploadUrl:string;expiresAt:string}>>;
  completeEvidence(input:{readonly context:VerifiedRequestContext;readonly journeyKind:BusinessPartnerInvitationJourney;readonly requestId:string;readonly attachmentId:string;readonly evidenceKind:string;readonly contentType:string;readonly classificationCode:"internal"|"confidential"|"restricted"}):Promise<Readonly<{evidenceId:string;attachmentId:string;status:string}>>;
  submitOwned(input: {
    readonly context: VerifiedRequestContext;
    readonly journeyKind: BusinessPartnerInvitationJourney;
    readonly requestId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  }): Promise<
    Readonly<{
      requestId: string;
      requestNo: string;
      status: string;
      rowVersion: number;
      validationSummary: Readonly<Record<string, unknown>>;
      editablePayload: Readonly<Record<string, unknown>>;
      updatedAt?: string;
    }>
  >;
  template(
    journeyKind: BusinessPartnerInvitationJourney,
  ): BusinessPartnerInvitationTemplate;
}
