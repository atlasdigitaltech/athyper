import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const businessPartnerCasePermissions = Object.freeze({
  create: "neon.relationship.entity_case.create",
  read: "neon.relationship.entity_case.read",
  update: "neon.relationship.entity_case.update",
  validate: "neon.relationship.entity_case.validate",
  submit: "neon.relationship.entity_case.submit",
  decide: "neon.relationship.entity_case.decide",
  apply: "neon.relationship.entity_case.materialize",
} as const);

/** @deprecated Use businessPartnerCasePermissions. */
export const businessPartnerRequestPermissions = businessPartnerCasePermissions;

export const businessPartnerPermissions = Object.freeze({
  read: "neon.relationship.business_partner.read",
} as const);

export type BusinessPartnerRequestKind =
  | "new_partner"
  | "amend_partner"
  | "add_supplier"
  | "add_customer"
  | "assign_organization"
  | "configure_company"
  | "change_bank"
  | "activate_supplier"
  | "deactivate"
  | "reactivate"
  | "archive";
export type BusinessPartnerRequestSourceKind =
  "manual" | "portal" | "mesh" | "import" | "api";
export type BusinessPartnerRegistrationMode =
  "direct" | "self_service" | "on_behalf" | "integration";
export type BusinessPartnerRequestedRole = "supplier" | "customer";
export type BusinessPartnerRequestStatus =
  | "draft"
  | "validating"
  | "validation_failed"
  | "pending_approval"
  | "returned"
  | "approved"
  | "rejected"
  | "applying"
  | "applied"
  | "failed"
  | "cancelled"
  | "superseded";
export type BusinessPartnerApplicationResultKind =
  | "partner_role_created"
  | "partner_amended"
  | "organization_assigned"
  | "company_configured"
  | "bank_verification_started"
  | "supplier_activated"
  | "partner_deactivated"
  | "partner_reactivated"
  | "partner_archived";

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
  /** Immutable STUDIO definition release that published this request schema. */
  readonly releaseId?: string;
}

export interface BusinessPartnerRequestExtensionBase {
  readonly clientItemKey: string;
  readonly definitionFieldCode: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly sourceReference?: string;
}

export interface BusinessPartnerRequestAddress extends BusinessPartnerRequestExtensionBase {
  readonly purpose: string;
  readonly addressKind?: "street" | "po_box" | "rural" | "military" | "other";
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly poBox?: string;
  readonly countryCode: string;
  readonly isPrimary?: boolean;
  readonly normalizedHash: string;
  readonly validationEvidenceId?: string;
}

export interface BusinessPartnerRequestContactPerson extends BusinessPartnerRequestExtensionBase {
  readonly contactName: string;
  readonly businessTitle?: string;
  readonly departmentName?: string;
  readonly roleCode?: string;
  readonly isPrimary?: boolean;
}

export interface BusinessPartnerRequestContactChannel extends BusinessPartnerRequestExtensionBase {
  readonly contactClientItemKey: string;
  readonly channelType:
    "email" | "phone" | "fax" | "sms" | "whatsapp" | "website";
  readonly value: string;
  readonly purpose: string;
  readonly isPrimary?: boolean;
}

export interface BusinessPartnerRequestIdentifier extends BusinessPartnerRequestExtensionBase {
  readonly schemeCode: string;
  readonly value?: string;
  readonly protectedValueToken?: string;
  readonly valueHash: string;
  readonly maskedValue: string;
  readonly issuingAuthority?: string;
  readonly issuingCountryCode?: string;
  readonly isPrimary?: boolean;
}

export interface BusinessPartnerRequestTaxRegistration extends BusinessPartnerRequestExtensionBase {
  readonly jurisdictionId: string;
  readonly taxTypeId?: string;
  readonly registrationTypeCode: string;
  readonly protectedValueToken: string;
  readonly valueHash: string;
  readonly maskedValue: string;
  readonly isPrimary?: boolean;
}

export interface BusinessPartnerRequestClassification extends BusinessPartnerRequestExtensionBase {
  readonly classificationKind: "commodity" | "industry";
  readonly referenceId: string;
  readonly domainCode?: string;
  readonly partnerRole?: "supplier" | "customer";
  readonly assignmentKind?: "declared" | "verified" | "inferred" | "imported";
  readonly isPrimary?: boolean;
  readonly confidence?: number;
}

export interface BusinessPartnerRequestCertification extends BusinessPartnerRequestExtensionBase {
  readonly certificationTypeId?: string;
  readonly customName?: string;
  readonly certificateNumberToken?: string;
  readonly maskedCertificateNumber?: string;
  readonly certifiedBy?: string;
  readonly certifiedLocation?: string;
  readonly attachmentId?: string;
  readonly companyCodeId?: string;
}

export interface BusinessPartnerRequestExtensions {
  readonly addresses?: readonly BusinessPartnerRequestAddress[];
  readonly contactPersons?: readonly BusinessPartnerRequestContactPerson[];
  readonly contactChannels?: readonly BusinessPartnerRequestContactChannel[];
  readonly identifiers?: readonly BusinessPartnerRequestIdentifier[];
  readonly taxRegistrations?: readonly BusinessPartnerRequestTaxRegistration[];
  readonly classifications?: readonly BusinessPartnerRequestClassification[];
  readonly certifications?: readonly BusinessPartnerRequestCertification[];
}

export interface BusinessPartnerRequestExtensionSummary {
  readonly mode: "typed_v1" | "legacy_untyped";
  readonly fingerprint?: string;
  readonly counts: Readonly<
    Record<
      | "addresses"
      | "contactPersons"
      | "contactChannels"
      | "identifiers"
      | "taxRegistrations"
      | "classifications"
      | "certifications",
      number
    >
  >;
}

export interface BusinessPartnerRequest {
  readonly id: string;
  /** Canonical governed identity. */
  readonly caseId?: string;
  readonly tenantId: string;
  readonly requestNo: string;
  /** Canonical governed display code. */
  readonly caseNo?: string;
  readonly kind: BusinessPartnerRequestKind;
  readonly source: BusinessPartnerRequestSource;
  readonly registrationMode: BusinessPartnerRegistrationMode;
  readonly invitationId?: string;
  readonly applicantPrincipalId?: string;
  readonly representedPartyName?: string;
  readonly representationEvidenceId?: string;
  readonly targetBusinessPartnerId?: string;
  readonly baseRecordVersion?: number;
  readonly requestedRole?: BusinessPartnerRequestedRole;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  /** Historical persistence only; new Business Partner commands cannot write workforce scope. */
  readonly legalEntityId?: string;
  readonly orgUnitId?: string;
  readonly positionId?: string;
  readonly schema: BusinessPartnerRequestSchemaReference;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly extensionSummary: BusinessPartnerRequestExtensionSummary;
  readonly validationSummary: Readonly<Record<string, unknown>>;
  readonly duplicateSummary: Readonly<Record<string, unknown>>;
  readonly changeImpact: Readonly<Record<string, unknown>>;
  readonly workflowRequestId?: string;
  readonly materializedBusinessPartnerId?: string;
  readonly materializedSupplierId?: string;
  readonly materializedCustomerId?: string;
  /** Historical result coordinates retained for immutable pre-S2 request evidence. */
  readonly materializedPersonId?: string;
  readonly materializedEmployeeId?: string;
  readonly materializedEmploymentId?: string;
  readonly materializedWorkAssignmentId?: string;
  readonly materializedOnboardingCaseId?: string;
  readonly materializedPrincipalId?: string;
  readonly materializedBankVerificationId?: string;
  readonly materializedSupplierCompanyProfileId?: string;
  readonly materializedCustomerCompanyProfileId?: string;
  readonly materializedOperatingOrganizationAssignmentId?: string;
  readonly materializationSnapshotId?: string;
  readonly applicationIdempotencyKey?: string;
  readonly applicationFingerprint?: string;
  readonly applicationResultKind?: BusinessPartnerApplicationResultKind;
  readonly applicationReasonCode?: string;
  readonly decisionFingerprint?: string;
  readonly submittedAt?: string;
  readonly submittedBy?: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly appliedAt?: string;
  readonly appliedBy?: string;
  readonly idempotencyKey: string;
  readonly status: BusinessPartnerRequestStatus;
  /** Native document.entity_case lifecycle status. */
  readonly caseStatus?:
    | "draft"
    | "submitted"
    | "in_review"
    | "approved"
    | "rejected"
    | "materializing"
    | "materialized"
    | "cancelled"
    | "conflicted";
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

/** Stable case-native contracts for new UI and integration clients. */
export type BusinessPartnerCase = BusinessPartnerRequest;
export type CreateBusinessPartnerCaseCommand = CreateBusinessPartnerRequestCommand;
export type PatchBusinessPartnerCaseCommand = Omit<PatchBusinessPartnerRequestCommand,"requestId"> & { readonly caseId:string };
export type ValidateBusinessPartnerCaseCommand = Omit<ValidateBusinessPartnerRequestCommand,"requestId"> & { readonly caseId:string };
export type SubmitBusinessPartnerCaseCommand = Omit<SubmitBusinessPartnerRequestCommand,"requestId"> & { readonly caseId:string };
export type DecideBusinessPartnerCaseCommand = Omit<DecideBusinessPartnerRequestCommand,"requestId"|"workflowRequestId"|"workItemId"|"expectedRequestVersion"|"expectedWorkItemVersion"> & { readonly caseId:string;readonly cycleRunId:string;readonly cycleTaskId:string;readonly expectedVersion:number;readonly expectedTaskVersion:number };
export type MaterializeBusinessPartnerCaseCommand = Omit<ApplyBusinessPartnerRequestCommand,"requestId"> & { readonly caseId:string };

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
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  /** Release coordinates rendered by the client. Creation fails if the active form changed. */
  readonly expectedForm?: BusinessPartnerRequestSchemaReference & {
    readonly releaseId: string;
  };
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly extensions?: BusinessPartnerRequestExtensions;
}

export interface PatchBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly extensions?: BusinessPartnerRequestExtensions;
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string | null;
  readonly requestedRole?: BusinessPartnerRequestedRole | null;
  readonly representationEvidenceId?: string | null;
}

export type BusinessPartnerRequestValidationSeverity =
  "info" | "warning" | "error";
export type BusinessPartnerRequestValidationOutcome =
  "passed" | "failed" | "skipped";

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
  readonly materializationProof?: BusinessPartnerRequestMaterializationProof;
  readonly onboardingCycle?: BusinessPartnerOnboardingCycleView;
  readonly workflow?: Readonly<{
    requestId: string;
    stageId: string;
    workItemId: string;
    workItemVersion: number;
    workItemStatus: string;
    ownerPrincipalId: string;
    definition: BusinessPartnerRequestSchemaReference;
    stages?: readonly BusinessPartnerWorkflowStageView[];
    activeWorkItems?: readonly BusinessPartnerWorkflowWorkItemView[];
  }>;
}

export interface BusinessPartnerOnboardingCycleTaskView {
  readonly id: string;
  readonly code: "INVITATION" | "REGISTRATION" | "DUPLICATE_REVIEW" | "QUALIFICATION" | string;
  readonly name: string;
  readonly status: string;
  readonly completionMode: "manual" | "system" | "hybrid";
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly completionEvidence: Readonly<Record<string, unknown>>;
}

export interface BusinessPartnerOnboardingCycleView {
  readonly runId: string;
  readonly code: string;
  readonly name: string;
  readonly status: string;
  readonly template: BusinessPartnerRequestSchemaReference;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly tasks: readonly BusinessPartnerOnboardingCycleTaskView[];
  readonly subjects: readonly Readonly<{
    role: string;
    primary: boolean;
    entityCaseId?: string;
    externalReference?: string;
  }>[];
}

export interface BusinessPartnerWorkflowWorkItemView {
  readonly id: string;
  readonly status: string;
  readonly rowVersion: number;
  readonly ownerPrincipalId?: string;
  readonly dueAt?: string;
  readonly priority: string;
  readonly decision?: string;
  readonly decidedAt?: string;
  readonly decidedBy?: string;
}

export interface BusinessPartnerWorkflowStageView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly stageNo: number;
  readonly mode: "serial" | "parallel";
  readonly status: string;
  readonly outcome?: string;
  readonly quorum: Readonly<{ kind: "all" | "any" | "count" | "percentage"; value?: number; required: number; eligibleCount: number }>;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly dueAt?: string;
  readonly remindersAt: readonly string[];
  readonly escalateAt?: string;
  readonly workItems: readonly BusinessPartnerWorkflowWorkItemView[];
}

export interface BusinessPartnerRequestMaterializationProof {
  readonly schema: "athyper.business-partner-materialization-proof/1";
  readonly materializationId: string;
  readonly attemptNo: number;
  readonly status: "succeeded";
  readonly resultCode: string;
  readonly sourceSnapshot: BusinessPartnerRequestSnapshotCoordinate;
  readonly resultSnapshot: BusinessPartnerRequestSnapshotCoordinate;
  readonly materializer: Readonly<{ code: string; version: string }>;
  readonly applicationFingerprint: string;
  readonly completedAt: string;
  readonly completedBy: string;
  readonly result: Readonly<{
    businessPartnerId: string;
    partnerRole?: "supplier" | "customer";
    roleId?: string;
    operatingOrganizationAssignmentId?: string;
    bankVerificationId?: string;
  }>;
  /** Bounded to the 25 newest edges and intentionally excludes snapshot payloads. */
  readonly lineage: readonly BusinessPartnerRequestLineageCoordinate[];
}

export interface BusinessPartnerRequestSnapshotCoordinate {
  readonly snapshotId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly payloadHash: string;
  readonly capturedAt: string;
}

export interface BusinessPartnerRequestLineageCoordinate {
  readonly lineageId: string;
  readonly sourceSnapshotId: string;
  readonly targetSnapshotId: string;
  readonly role: string;
  readonly targetAuthorityType?: string;
  readonly targetAuthorityId?: string;
  readonly transformationCode: string;
  readonly transformationVersion: string;
  readonly evidenceHash: string;
  readonly createdAt: string;
}

export interface ValidateBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
}

export interface ValidateBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly case?: BusinessPartnerCase;
  readonly validation: BusinessPartnerRequestValidationResult;
}

export interface BusinessPartnerRequestWorkflowDefinition {
  readonly code: string;
  readonly version: number;
  readonly hash: string;
  readonly stageCode: string;
  readonly stageName: string;
  readonly approverPrincipalIds: readonly string[];
  /** Release 3 pins every configured stage. Legacy fields mirror the first routed stage. */
  readonly stages?: readonly BusinessPartnerRequestWorkflowStageDefinition[];
}

export interface BusinessPartnerRequestWorkflowStageDefinition {
  readonly code: string;
  readonly name: string;
  readonly mode: "serial" | "parallel";
  readonly quorum: Readonly<{ kind: "all" | "any" | "count" | "percentage"; value?: number }>;
  readonly approverPrincipalIds: readonly string[];
  readonly routed: boolean;
  readonly routeEvidence?: Readonly<Record<string, unknown>>;
  readonly slaMinutes?: number;
  readonly remindersAtMinutes?: readonly number[];
  readonly escalateAtMinutes?: number;
  readonly escalationPrincipalIds?: readonly string[];
}

export interface BusinessPartnerRequestWorkflow {
  readonly requestId: string;
  readonly cycleRunId?: string;
  readonly stageId: string;
  readonly workItemId: string;
  readonly cycleTaskId?: string;
  readonly definition: BusinessPartnerRequestSchemaReference;
  readonly decisionFingerprint: string;
  readonly workItemVersion?: number;
  readonly workItemStatus?: string;
  readonly ownerPrincipalId?: string;
}

export interface SubmitBusinessPartnerRequestCommand {
  readonly context: VerifiedRequestContext;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface SubmitBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly case?: BusinessPartnerCase;
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
  readonly case?: BusinessPartnerCase;
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
  readonly resultKind: BusinessPartnerApplicationResultKind;
  readonly partnerRole?: "supplier" | "customer";
  readonly roleId?: string;
  readonly supplierId?: string;
  readonly customerId?: string;
  readonly bankVerificationId?: string;
  readonly activationEvidenceId?: string;
  readonly reasonCode?: string;
  readonly companyProfileId?: string;
  readonly operatingOrganizationAssignmentId?: string;
  readonly snapshotId: string;
  readonly applicationFingerprint: string;
  readonly extensionMaterializationCounts: BusinessPartnerRequestExtensionSummary["counts"];
}

export interface ApplyBusinessPartnerRequestResponse {
  readonly request: BusinessPartnerRequest;
  readonly case?: BusinessPartnerCase;
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
    id: string;
    code: string;
    name: string;
    displayName?: string;
    legalName?: string;
    partnerCategory: string;
    legalForm?: string;
    registrationCountryCode?: string;
    incorporationDate?: string;
    websiteUrl?: string;
    description?: string;
    aliases: readonly string[];
    status: string;
    createdAt: string;
    updatedAt?: string;
  }>;
  readonly suppliers: readonly Readonly<{
    id: string;
    supplierCode: string;
    supplierType: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
  }>[];
  readonly customers: readonly Readonly<{
    id: string;
    customerCode: string;
    customerType: string;
    status: string;
    recordVersion: number;
    designations: readonly Readonly<{
      id: string;
      type: string;
      priorityTier?: number;
      effectiveFrom: string;
      effectiveUntil?: string;
    }>[];
    createdAt: string;
    updatedAt?: string;
  }>[];
  readonly supplierCompanyProfiles: readonly Readonly<{
    id: string;
    supplierId: string;
    companyCodeId: string;
    currencyCode?: string;
    paymentTermId?: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
  }>[];
  readonly customerCompanyProfiles: readonly Readonly<{
    id: string;
    customerId: string;
    companyCodeId: string;
    currencyCode?: string;
    paymentTermId?: string;
    statementCycleCode?: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
  }>[];
  readonly organizationAssignments: readonly Readonly<{
    id: string;
    operatingOrganizationId: string;
    operatingOrganizationCode: string;
    operatingOrganizationName: string;
    partnerRole: string;
    status: string;
    effectiveFrom: string;
    effectiveUntil?: string;
  }>[];
  readonly onboardingRequests: readonly BusinessPartnerRequest[];
}
