import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const businessPartnerRequestPermissions = Object.freeze({
  create: "neon.relationship.business_partner_request.create",
  read: "neon.relationship.business_partner_request.read",
  update: "neon.relationship.business_partner_request.update",
  validate: "neon.relationship.business_partner_request.validate",
  submit: "neon.relationship.business_partner_request.submit",
  decide: "neon.relationship.business_partner_request.decide",
  apply: "neon.relationship.business_partner_request.apply",
} as const);

export const businessPartnerPermissions = Object.freeze({ read: "neon.relationship.business_partner.read" } as const);

export type BusinessPartnerRequestKind =
  | "new_partner" | "amend_partner" | "add_supplier" | "add_customer"
  | "assign_organization" | "configure_company" | "change_bank"
  | "deactivate" | "reactivate" | "archive";
export type BusinessPartnerRequestSourceKind = "manual" | "portal" | "mesh" | "import" | "api";
export type BusinessPartnerRegistrationMode = "direct" | "self_service" | "on_behalf" | "integration";
export type BusinessPartnerRequestedRole = "supplier" | "customer" | "carrier" | "service_provider" | "other";
export type BusinessPartnerRequestStatus =
  | "draft" | "validating" | "validation_failed" | "pending_approval"
  | "returned" | "approved" | "rejected" | "applying" | "applied"
  | "failed" | "cancelled" | "superseded";

export interface BusinessPartnerRequestSource {
  readonly kind: BusinessPartnerRequestSourceKind;
  readonly systemCode?: string;
  readonly entityCode?: string;
  readonly entityId?: string;
  readonly entityCodeValue?: string;
  readonly projectionId?: string;
  readonly version?: number;
  readonly payloadHash?: string;
}

export interface BusinessPartnerRequestSchemaReference {
  readonly code: string;
  readonly version: number;
  readonly hash: string;
}

export interface BusinessPartnerRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly requestNo: string;
  readonly kind: BusinessPartnerRequestKind;
  readonly source: BusinessPartnerRequestSource;
  readonly registrationMode: BusinessPartnerRegistrationMode;
  readonly invitationId?: string;
  readonly applicantPrincipalId?: string;
  readonly representedPartyName?: string;
  readonly representationEvidenceId?: string;
  readonly targetBusinessPartnerId?: string;
  readonly requestedRole?: BusinessPartnerRequestedRole;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly schema: BusinessPartnerRequestSchemaReference;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly validationSummary: Readonly<Record<string, unknown>>;
  readonly duplicateSummary: Readonly<Record<string, unknown>>;
  readonly changeImpact: Readonly<Record<string, unknown>>;
  readonly workflowRequestId?: string;
  readonly materializedBusinessPartnerId?: string;
  readonly materializedSupplierId?: string;
  readonly materializedCustomerId?: string;
  readonly materializedSupplierCompanyProfileId?: string;
  readonly materializedCustomerCompanyProfileId?: string;
  readonly materializedOperatingOrganizationAssignmentId?: string;
  readonly materializationSnapshotId?: string;
  readonly applicationIdempotencyKey?: string;
  readonly applicationFingerprint?: string;
  readonly decisionFingerprint?: string;
  readonly submittedAt?: string;
  readonly submittedBy?: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly appliedAt?: string;
  readonly appliedBy?: string;
  readonly idempotencyKey: string;
  readonly status: BusinessPartnerRequestStatus;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

export interface CreateBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly idempotencyKey: string;
  readonly kind: BusinessPartnerRequestKind;
  readonly source: BusinessPartnerRequestSource;
  readonly registrationMode?: BusinessPartnerRegistrationMode;
  readonly invitationId?: string;
  readonly applicantPrincipalId?: string;
  readonly representedPartyName?: string;
  readonly representationEvidenceId?: string;
  readonly targetBusinessPartnerId?: string;
  readonly requestedRole?: BusinessPartnerRequestedRole;
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
}

export interface PatchBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string | null;
  readonly requestedRole?: BusinessPartnerRequestedRole | null;
  readonly representationEvidenceId?: string | null;
}

export type BusinessPartnerRequestValidationSeverity = "info" | "warning" | "error";
export type BusinessPartnerRequestValidationOutcome = "passed" | "failed" | "skipped";

export interface BusinessPartnerRequestValidationFinding {
  readonly ruleCode: string;
  readonly severity: BusinessPartnerRequestValidationSeverity;
  readonly fieldPath: string;
  readonly outcome: BusinessPartnerRequestValidationOutcome;
  readonly messageCode: string;
  readonly evidenceReference: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerRequestValidationResult {
  readonly evaluationId: string;
  readonly evaluatedAt: string;
  readonly ruleset: BusinessPartnerRequestSchemaReference;
  readonly valid: boolean;
  readonly findings: readonly BusinessPartnerRequestValidationFinding[];
  readonly validationSummary: Readonly<Record<string, unknown>>;
  readonly duplicateSummary: Readonly<Record<string, unknown>>;
  readonly changeImpact: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerRequestView {
  readonly request: BusinessPartnerRequest;
  readonly validationFindings: readonly BusinessPartnerRequestValidationFinding[];
  readonly workflow?: Readonly<{
    requestId: string; stageId: string; workItemId: string; workItemVersion: number;
    workItemStatus: string; definition: BusinessPartnerRequestSchemaReference;
  }>;
}

export interface ValidateBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
}

export interface ValidateBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly validation: BusinessPartnerRequestValidationResult;
}

export interface BusinessPartnerRequestWorkflowDefinition {
  readonly code: string;
  readonly version: number;
  readonly hash: string;
  readonly stageCode: string;
  readonly stageName: string;
  readonly approverPrincipalIds: readonly string[];
}

export interface BusinessPartnerRequestWorkflow {
  readonly requestId: string;
  readonly stageId: string;
  readonly workItemId: string;
  readonly definition: BusinessPartnerRequestSchemaReference;
  readonly decisionFingerprint: string;
}

export interface SubmitBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface SubmitBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly workflow: BusinessPartnerRequestWorkflow;
  readonly replayed: boolean;
}

export type BusinessPartnerRequestDecision = "return" | "reject" | "approve";

export interface DecideBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly workflowRequestId: string;
  readonly workItemId: string;
  readonly expectedRequestVersion: number;
  readonly expectedWorkItemVersion: number;
  readonly decision: BusinessPartnerRequestDecision;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface DecideBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly workflow: BusinessPartnerRequestWorkflow;
  readonly decision: BusinessPartnerRequestDecision;
  readonly decisionFingerprint: string;
  readonly replayed: boolean;
}

export interface ApplyBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface BusinessPartnerRequestMaterialization {
  readonly businessPartnerId: string;
  readonly partnerRole: "supplier" | "customer";
  readonly roleId: string;
  readonly supplierId?: string;
  readonly customerId?: string;
  readonly companyProfileId?: string;
  readonly operatingOrganizationAssignmentId: string;
  readonly snapshotId: string;
  readonly applicationFingerprint: string;
}

export interface ApplyBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly materialization: BusinessPartnerRequestMaterialization;
  readonly replayed: boolean;
}

export interface BusinessPartnerRequestQuery {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
}

export interface BusinessPartnerRequestListQuery {
  readonly context: VerifiedRequestContext;
  readonly operatingOrganizationId: string;
  readonly status?: BusinessPartnerRequestStatus;
  readonly limit?: number;
  readonly beforeCreatedAt?: string;
}

export interface BusinessPartnerAggregateQuery {
  readonly context: VerifiedRequestContext;
  readonly businessPartnerId: string;
  readonly operatingOrganizationId: string;
}

export interface BusinessPartnerAggregate {
  readonly businessPartner: Readonly<{
    id: string; code: string; name: string; displayName?: string; legalName?: string;
    partnerCategory: string; legalForm?: string; registrationCountryCode?: string;
    incorporationDate?: string; websiteUrl?: string; description?: string;
    aliases: readonly string[]; status: string;
    createdAt: string; updatedAt?: string;
  }>;
  readonly suppliers: readonly Readonly<{
    id: string; supplierCode: string; supplierType: string; status: string;
    createdAt: string; updatedAt?: string;
  }>[];
  readonly customers: readonly Readonly<{
    id: string; customerCode: string; customerType: string; isKeyAccount: boolean; status: string;
    createdAt: string; updatedAt?: string;
  }>[];
  readonly supplierCompanyProfiles: readonly Readonly<{id:string;supplierId:string;companyCodeId:string;currencyCode?:string;paymentTermId?:string;status:string;createdAt:string;updatedAt?:string}>[];
  readonly customerCompanyProfiles: readonly Readonly<{id:string;customerId:string;companyCodeId:string;currencyCode?:string;creditLimit?:number;creditLimitCurrencyCode?:string;paymentTermId?:string;statementCycleCode?:string;status:string;createdAt:string;updatedAt?:string}>[];
  readonly organizationAssignments: readonly Readonly<{
    id: string; operatingOrganizationId: string; operatingOrganizationCode: string;
    operatingOrganizationName: string; partnerRole: string; status: string;
    effectiveFrom: string; effectiveUntil?: string;
  }>[];
  readonly onboardingRequests: readonly BusinessPartnerRequest[];
}
