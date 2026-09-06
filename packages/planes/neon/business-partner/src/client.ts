import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";
import {
  parseGovernedCaseView,
  type GovernedCaseViewV1,
} from "@athyper/contract-platform-entity-runtime";
import { parsePublishedRequestForm, type RequestFormDefinition } from "./request-form-descriptor";
import type { RequestRelationshipExtensions } from "./request-relationships";

export type RequestStatus =
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
export interface PartnerRequest {
  readonly id: string;
  readonly requestNo: string;
  readonly kind: string;
  readonly source: Readonly<{ kind: string }>;
  readonly targetBusinessPartnerId?: string;
  readonly requestedRole?: "supplier" | "customer";
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
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
  readonly submittedAt?: string;
  readonly submittedBy?: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly appliedAt?: string;
  readonly appliedBy?: string;
  readonly status: RequestStatus;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}
export interface ValidationFinding {
  readonly ruleCode: string;
  readonly severity: "info" | "warning" | "error";
  readonly fieldPath: string;
  readonly outcome: "passed" | "failed" | "skipped";
  readonly messageCode: string;
  readonly evidenceReference: Readonly<Record<string, unknown>>;
}
export interface MaterializationProof {
  readonly schema: "athyper.business-partner-materialization-proof/1";
  readonly materializationId: string;
  readonly attemptNo: number;
  readonly status: "succeeded";
  readonly resultCode: string;
  readonly sourceSnapshot: SnapshotCoordinate;
  readonly resultSnapshot: SnapshotCoordinate;
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
  readonly lineage: readonly LineageCoordinate[];
}
export interface SnapshotCoordinate {
  readonly snapshotId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly payloadHash: string;
  readonly capturedAt: string;
}
export interface LineageCoordinate {
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
export interface RequestView {
  readonly case: GovernedCaseViewV1;
  readonly request: PartnerRequest;
  readonly validationFindings: readonly ValidationFinding[];
  readonly materializationProof?: MaterializationProof;
  readonly onboardingCycle?: Readonly<{
    runId:string;code:string;name:string;status:string;startedAt?:string;completedAt?:string;
    template:Readonly<{code:string;version:number;hash:string;releaseId?:string}>;
    tasks:readonly Readonly<{id:string;code:string;name:string;status:string;completionMode:"manual"|"system"|"hybrid";startedAt?:string;completedAt?:string;completionEvidence:Readonly<Record<string,unknown>>}>[];
    subjects:readonly Readonly<{role:string;primary:boolean;entityCaseId?:string;externalReference?:string}>[];
  }>;
  readonly workflow?: Readonly<{
    requestId: string;
    stageId: string;
    workItemId: string;
    workItemVersion: number;
    workItemStatus: string;
    ownerPrincipalId: string;
    definition: Readonly<{ code: string; version: number; hash: string }>;
    stages: readonly Readonly<{
      id:string;code:string;name:string;stageNo:number;mode:"serial"|"parallel";status:string;outcome?:string;
      quorum:Readonly<{kind:"all"|"any"|"count"|"percentage";value?:number;required:number;eligibleCount:number}>;
      startedAt?:string;completedAt?:string;dueAt?:string;remindersAt:readonly string[];escalateAt?:string;
      workItems:readonly Readonly<{id:string;status:string;rowVersion:number;ownerPrincipalId?:string;dueAt?:string;priority:string;decision?:string;decidedAt?:string;decidedBy?:string}>[];
    }>[];
  }>;
}
export interface PartnerAggregate {
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
  readonly onboardingRequests: readonly PartnerRequest[];
}
export interface PartnerEligibility {
  readonly businessPartnerId: string;
  readonly role: "supplier" | "customer";
  readonly operatingOrganizationId: string;
  readonly operationCode: string;
  readonly businessDate: string;
  readonly eligible: boolean;
  readonly reasons: readonly Readonly<{
    code: string;
    severity: "blocking" | "warning";
    recordId?: string;
    detail?: string;
  }>[];
  readonly qualifications: readonly Readonly<{
    id: string;
    qualificationTypeCode: string;
    decision: string;
    operatingOrganizationId?: string;
    companyCodeId?: string;
    effectiveFrom?: string;
    effectiveUntil?: string;
    nextReviewAt?: string;
    rowVersion: number;
  }>[];
  readonly riskAssessment?: Readonly<{
    id: string;
    status: string;
    riskBand: string;
    overallScore?: number;
    nextReviewAt?: string;
    version: number;
  }>;
  readonly activeBlockIds: readonly string[];
  readonly preferredSupplier: boolean;
  readonly effectivePreferenceIds: readonly string[];
  readonly decisionFingerprint: string;
}
export interface CustomerCreditReview {
  readonly id: string;
  readonly businessPartnerId: string;
  readonly customerId: string;
  readonly operatingOrganizationId: string;
  readonly companyCodeId: string;
  readonly reviewTypeCode: string;
  readonly requestedCreditLimit?: number;
  readonly requestedCurrencyCode?: string;
  readonly approvedCreditLimit?: number;
  readonly approvedCurrencyCode?: string;
  readonly riskClassCode?: string;
  readonly decision: string;
  readonly decisionReason?: string;
  readonly conditions: readonly Readonly<Record<string, unknown>>[];
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}
export interface CustomerDesignation {
  readonly id: string;
  readonly businessPartnerId: string;
  readonly customerId: string;
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly countryCode?: string;
  readonly channelCode?: string;
  readonly designationType: "key_account" | "strategic" | "priority_service";
  readonly priorityTier?: number;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly rationale: string;
  readonly status: "pending" | "approved" | "rejected" | "revoked";
  readonly decisionReason?: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
  readonly revocationReason?: string;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}
export interface SupplierQualification {
  readonly id: string;
  readonly businessPartnerId: string;
  readonly partnerRole: "supplier" | "customer";
  readonly operatingOrganizationId?: string;
  readonly companyCodeId?: string;
  readonly qualificationTypeCode: string;
  readonly decision:
    | "pending"
    | "approved"
    | "conditional"
    | "rejected"
    | "suspended"
    | "expired";
  readonly decisionReason?: string;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly nextReviewAt?: string;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
}
export interface SupplierPreference {
  readonly id: string;
  readonly businessPartnerId: string;
  readonly supplierId: string;
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly commodityCategoryId?: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly rationale: string;
  readonly status: "pending" | "approved" | "rejected" | "revoked";
  readonly temporalStatus: string;
  readonly decisionReason?: string;
  readonly rowVersion: number;
  readonly createdAt: string;
  readonly createdBy: string;
}
export interface PartnerRequestDraft {
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly expectedForm?: RequestFormDefinition;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
  readonly extensions?: RequestRelationshipExtensions;
}
export interface PartnerRoleExtensionDraft {
  readonly businessPartnerId: string;
  readonly role: "supplier" | "customer";
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
}
export interface PartnerScopeConfigurationDraft {
  readonly businessPartnerId: string;
  readonly kind: "assign_organization" | "configure_company";
  readonly role: "supplier" | "customer";
  readonly operatingOrganizationId: string;
  readonly companyCodeId?: string;
  readonly proposedPayload: Readonly<Record<string, unknown>>;
}

const createRequest = createOperation<
  {
    readonly case: GovernedCaseViewV1;
    readonly request: PartnerRequest;
    readonly replayed: boolean;
  },
  Readonly<{
    idempotencyKey: string;
    kind:
      | "new_partner"
      | "add_supplier"
      | "add_customer"
      | "assign_organization"
      | "configure_company"
      | "change_bank"
      | "activate_supplier"
      | "deactivate"
      | "reactivate"
      | "archive";
    source: Readonly<{ kind: "manual" }>;
    targetBusinessPartnerId?: string;
    requestedRole?: "supplier" | "customer";
    operatingOrganizationId?: string;
    companyCodeId?: string;
    expectedForm?: RequestFormDefinition;
    proposedPayload: Readonly<Record<string, unknown>>;
    extensions?: RequestRelationshipExtensions;
  }>
>({
  method: "POST",
  path: "/api/neon/business-partner-cases",
  idempotency: "required",
  parse: parseMutation,
});
const readRequestForm = createOperation({
  method: "GET",
  path: "/api/neon/business-partner-definitions/active-request-form",
  parse: parsePublishedRequestForm,
});
const listRequests = createOperation<readonly PartnerRequest[]>({
  method: "GET",
  path: "/api/neon/business-partner-cases",
  parse: parseList,
});
const readView = createOperation<RequestView>({
  method: "GET",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}/view`,
  parse: parseView,
});
const patchRequest = createOperation<
  { readonly case: GovernedCaseViewV1; readonly request: PartnerRequest },
  Readonly<{
    expectedVersion: number;
    proposedPayload: Readonly<Record<string, unknown>>;
    operatingOrganizationId?: string;
    companyCodeId?: string | null;
  }>
>({
  method: "PATCH",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}`,
  idempotency: "required",
  parse: parseCaseMutation,
});
const validateRequest = createOperation<
  Readonly<{
    case: GovernedCaseViewV1;
    request: PartnerRequest;
    validation: Readonly<{
      valid: boolean;
      findings: readonly ValidationFinding[];
    }>;
  }>,
  Readonly<{ expectedVersion: number }>
>({
  method: "POST",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}/validate`,
  idempotency: "required",
  parse: parseCaseMutation,
});
const submitRequest = createOperation<
  Readonly<{
    case: GovernedCaseViewV1;
    request: PartnerRequest;
    workflow: Readonly<{
      requestId: string;
      stageId: string;
      workItemId: string;
    }>;
    replayed: boolean;
  }>,
  Readonly<{ expectedVersion: number; idempotencyKey: string }>
>({
  method: "POST",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}/submit`,
  idempotency: "required",
  parse: parseCaseMutation,
});
const decideRequest = createOperation<
  Readonly<{
    case: GovernedCaseViewV1;
    request: PartnerRequest;
    replayed: boolean;
  }>,
  Readonly<{
    cycleRunId: string;
    cycleTaskId: string;
    expectedVersion: number;
    expectedTaskVersion: number;
    decision: "return" | "reject" | "approve";
    reason: string;
    idempotencyKey: string;
  }>
>({
  method: "POST",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}/decisions`,
  idempotency: "required",
  parse: parseCaseMutation,
});
const applyRequest = createOperation<
  Readonly<{
    case: GovernedCaseViewV1;
    request: PartnerRequest;
    materialization: Readonly<{
      businessPartnerId: string;
      partnerRole: "supplier" | "customer";
      roleId: string;
      supplierId?: string;
      customerId?: string;
      companyProfileId?: string;
      operatingOrganizationAssignmentId?: string;
    bankVerificationId?: string;
      snapshotId: string;
    }>;
    replayed: boolean;
  }>,
  Readonly<{ expectedVersion: number; idempotencyKey: string }>
>({
  method: "POST",
  path: ({ caseId }) =>
    `/api/neon/business-partner-cases/${encodePathSegment(caseId)}/materialize`,
  idempotency: "required",
  parse: parseCaseMutation,
});
const readAggregate = createOperation<PartnerAggregate>({
  method: "GET",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}`,
  parse: parseAggregate,
});
const readEligibility = createOperation<PartnerEligibility>({
  method: "GET",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/eligibility`,
  parse: parseEligibility,
});
const listCustomerCredit = createOperation<readonly CustomerCreditReview[]>({
  method: "GET",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/customer-credit-reviews`,
  parse: (value) => {
    if (!Array.isArray(value))
      throw new TypeError("Customer credit response must be an array");
    return value as unknown as readonly CustomerCreditReview[];
  },
});
const createCustomerCredit = createOperation<
  Readonly<{ review: CustomerCreditReview; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/customer-credit-reviews`,
  idempotency: "required",
});
const decideCustomerCredit = createOperation<
  Readonly<{ review: CustomerCreditReview; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ reviewId }) =>
    `/api/neon/customer-credit-reviews/${encodePathSegment(reviewId)}/decisions`,
  idempotency: "required",
});
const listCustomerDesignations = createOperation<
  readonly CustomerDesignation[]
>({
  method: "GET",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/customer-designations`,
  parse: (value) => {
    if (!Array.isArray(value))
      throw new TypeError("Customer designation response must be an array");
    return value as unknown as readonly CustomerDesignation[];
  },
});
const createCustomerDesignation = createOperation<
  Readonly<{ designation: CustomerDesignation; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/customer-designations`,
  idempotency: "required",
});
const decideCustomerDesignation = createOperation<
  Readonly<{ designation: CustomerDesignation; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ designationId }) =>
    `/api/neon/customer-designations/${encodePathSegment(designationId)}/decisions`,
  idempotency: "required",
});
const customerLifecycle = createOperation<
  Readonly<{
    customerId: string;
    status: string;
    eventId: string;
    replayed: boolean;
    readiness?: PartnerEligibility;
  }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/customer-lifecycle`,
  idempotency: "required",
});
const createQualification = createOperation<
  Readonly<{ qualification: SupplierQualification; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/qualifications`,
  idempotency: "required",
});
const decideQualification = createOperation<
  Readonly<{ qualification: SupplierQualification; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ qualificationId }) =>
    `/api/neon/business-partner-qualifications/${encodePathSegment(qualificationId)}/decisions`,
  idempotency: "required",
});
const listPreferences = createOperation<readonly SupplierPreference[]>({
  method: "GET",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/preferences`,
  parse: (value) => {
    if (!Array.isArray(value))
      throw new TypeError("Supplier preference response must be an array");
    return value as unknown as readonly SupplierPreference[];
  },
});
const createPreference = createOperation<
  Readonly<{ preference: SupplierPreference; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/preferences`,
  idempotency: "required",
});
const decidePreference = createOperation<
  Readonly<{ preference: SupplierPreference; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ preferenceId }) =>
    `/api/neon/business-partner-preferences/${encodePathSegment(preferenceId)}/decisions`,
  idempotency: "required",
});
const revokePreference = createOperation<
  Readonly<{ preference: SupplierPreference; replayed: boolean }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ preferenceId }) =>
    `/api/neon/business-partner-preferences/${encodePathSegment(preferenceId)}/revocations`,
  idempotency: "required",
});
const activateSupplier = createOperation<
  Readonly<{
    activation: Readonly<Record<string, unknown>>;
    replayed: boolean;
  }>,
  Readonly<Record<string, unknown>>
>({
  method: "POST",
  path: ({ businessPartnerId }) =>
    `/api/neon/business-partners/${encodePathSegment(businessPartnerId)}/supplier-activation`,
  idempotency: "required",
});

export function createBusinessPartnerClient(http: HttpClient) {
  return Object.freeze({
    requestForm: (signal?: AbortSignal) => http.request(readRequestForm, { signal }),
    create: (draft: PartnerRequestDraft, key = commandKey("create")) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind: "new_partner",
          source: { kind: "manual" },
          requestedRole: "supplier",
          ...draft,
        },
        idempotencyKey: key,
      }),
    onboardCustomer: (
      draft: PartnerRequestDraft,
      key = commandKey("create-customer"),
    ) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind: "new_partner",
          source: { kind: "manual" },
          requestedRole: "customer",
          ...draft,
        },
        idempotencyKey: key,
      }),
    extend: (
      draft: PartnerRoleExtensionDraft,
      key = commandKey(`add-${draft.role}`),
    ) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind: draft.role === "supplier" ? "add_supplier" : "add_customer",
          source: { kind: "manual" },
          targetBusinessPartnerId: draft.businessPartnerId,
          requestedRole: draft.role,
          operatingOrganizationId: draft.operatingOrganizationId,
          ...(draft.companyCodeId
            ? { companyCodeId: draft.companyCodeId }
            : {}),
          proposedPayload: draft.proposedPayload,
        },
        idempotencyKey: key,
      }),
    configureScope: (
      draft: PartnerScopeConfigurationDraft,
      key = commandKey(draft.kind),
    ) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind: draft.kind,
          source: { kind: "manual" },
          targetBusinessPartnerId: draft.businessPartnerId,
          requestedRole: draft.role,
          operatingOrganizationId: draft.operatingOrganizationId,
          ...(draft.companyCodeId
            ? { companyCodeId: draft.companyCodeId }
            : {}),
          proposedPayload: draft.proposedPayload,
        },
        idempotencyKey: key,
      }),
    list: (
      operatingOrganizationId: string,
      status?: RequestStatus,
      signal?: AbortSignal,
    ) =>
      http.request(listRequests, {
        query: { operatingOrganizationId, status, limit: 100 },
        signal,
      }),
    view: (requestId: string, signal?: AbortSignal) =>
      http.request(readView, { params: { caseId: requestId }, signal }),
    patch: (
      requestId: string,
      body: Parameters<typeof patch>[0],
      key = commandKey("save"),
    ) =>
      http.request(patchRequest, {
        params: { caseId: requestId },
        body,
        idempotencyKey: key,
      }),
    validate: (
      requestId: string,
      expectedVersion: number,
      key = commandKey("validate"),
    ) =>
      http.request(validateRequest, {
        params: { caseId: requestId },
        body: { expectedVersion },
        idempotencyKey: key,
      }),
    submit: (
      requestId: string,
      expectedVersion: number,
      key = commandKey("submit"),
    ) =>
      http.request(submitRequest, {
        params: { caseId: requestId },
        body: { expectedVersion, idempotencyKey: key },
        idempotencyKey: key,
      }),
    decide: (
      requestId: string,
      input: Omit<Parameters<typeof decide>[0], "idempotencyKey">,
      key = commandKey(input.decision),
    ) =>
      http.request(decideRequest, {
        params: { caseId: requestId },
        body: {
          cycleRunId: input.workflowRequestId,
          cycleTaskId: input.workItemId,
          expectedVersion: input.expectedRequestVersion,
          expectedTaskVersion: input.expectedWorkItemVersion,
          decision: input.decision,
          reason: input.reason,
          idempotencyKey: key,
        },
        idempotencyKey: key,
      }),
    apply: (
      requestId: string,
      expectedVersion: number,
      key = commandKey("apply"),
    ) =>
      http.request(applyRequest, {
        params: { caseId: requestId },
        body: { expectedVersion, idempotencyKey: key },
        idempotencyKey: key,
      }),
    aggregate: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      signal?: AbortSignal,
    ) =>
      http.request(readAggregate, {
        params: { businessPartnerId },
        query: { operatingOrganizationId },
        signal,
      }),
    eligibility: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      operationCode = "purchasing",
      businessDate = new Date().toISOString().slice(0, 10),
      signal?: AbortSignal,
      companyCodeId?: string,
      role: "supplier" | "customer" = "supplier",
    ) =>
      http.request(readEligibility, {
        params: { businessPartnerId },
        query: {
          role,
          operatingOrganizationId,
          ...(companyCodeId ? { companyCodeId } : {}),
          operationCode,
          businessDate,
        },
        signal,
      }),
    customerCreditReviews: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      companyCodeId: string,
      signal?: AbortSignal,
    ) =>
      http.request(listCustomerCredit, {
        params: { businessPartnerId },
        query: { operatingOrganizationId, companyCodeId },
        signal,
      }),
    customerDesignations: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      companyCodeId?: string,
      signal?: AbortSignal,
    ) =>
      http.request(listCustomerDesignations, {
        params: { businessPartnerId },
        query: {
          operatingOrganizationId,
          ...(companyCodeId ? { companyCodeId } : {}),
        },
        signal,
      }),
    createCustomerDesignation: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("customer-designation"),
    ) =>
      http.request(createCustomerDesignation, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    decideCustomerDesignation: (
      designationId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("customer-designation-decision"),
    ) =>
      http.request(decideCustomerDesignation, {
        params: { designationId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    createCustomerCredit: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("customer-credit"),
    ) =>
      http.request(createCustomerCredit, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    decideCustomerCredit: (
      reviewId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("customer-credit-decision"),
    ) =>
      http.request(decideCustomerCredit, {
        params: { reviewId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    transitionCustomer: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("customer-lifecycle"),
    ) =>
      http.request(customerLifecycle, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    createQualification: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("qualification"),
    ) =>
      http.request(createQualification, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    decideQualification: (
      qualificationId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("qualification-decision"),
    ) =>
      http.request(decideQualification, {
        params: { qualificationId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    preferences: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      businessDate: string,
      signal?: AbortSignal,
      companyCodeId?: string,
      commodityCategoryId?: string,
    ) =>
      http.request(listPreferences, {
        params: { businessPartnerId },
        query: {
          operatingOrganizationId,
          businessDate,
          ...(companyCodeId ? { companyCodeId } : {}),
          ...(commodityCategoryId ? { commodityCategoryId } : {}),
        },
        signal,
      }),
    createPreference: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("preference"),
    ) =>
      http.request(createPreference, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    decidePreference: (
      preferenceId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("preference-decision"),
    ) =>
      http.request(decidePreference, {
        params: { preferenceId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    revokePreference: (
      preferenceId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("preference-revocation"),
    ) =>
      http.request(revokePreference, {
        params: { preferenceId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    activateSupplier: (
      businessPartnerId: string,
      body: Readonly<Record<string, unknown>>,
      key = commandKey("supplier-activation"),
    ) =>
      http.request(activateSupplier, {
        params: { businessPartnerId },
        body: { ...body, idempotencyKey: key },
        idempotencyKey: key,
      }),
    proposeBankChange: (
      businessPartnerId: string,
      operatingOrganizationId: string,
      companyCodeId: string,
      proposedPayload: Readonly<Record<string, unknown>>,
      key = commandKey("supplier-bank-change"),
    ) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind: "change_bank",
          source: { kind: "manual" },
          targetBusinessPartnerId: businessPartnerId,
          requestedRole: "supplier",
          operatingOrganizationId,
          companyCodeId,
          proposedPayload,
        },
        idempotencyKey: key,
      }),
    proposeSupplierActivation: (
      businessPartnerId:string,
      operatingOrganizationId:string,
      companyCodeId:string|undefined,
      readiness:PartnerEligibility,
      key=commandKey("supplier-activation-case"),
    )=>http.request(createRequest,{body:{idempotencyKey:key,kind:"activate_supplier",source:{kind:"manual"},targetBusinessPartnerId:businessPartnerId,requestedRole:"supplier",operatingOrganizationId,...(companyCodeId?{companyCodeId}:{}),proposedPayload:{activation:{businessDate:readiness.businessDate,readinessFingerprint:readiness.decisionFingerprint,readinessEvidence:readiness}}},idempotencyKey:key}),
    proposeLifecycle: (
      businessPartnerId: string,
      kind: "deactivate" | "reactivate" | "archive",
      proposedPayload: Readonly<Record<string, unknown>>,
      key = commandKey(`supplier-${kind}`),
    ) =>
      http.request(createRequest, {
        body: {
          idempotencyKey: key,
          kind,
          source: { kind: "manual" },
          targetBusinessPartnerId: businessPartnerId,
          proposedPayload,
        },
        idempotencyKey: key,
      }),
  });
}
type PatchBody = {
  expectedVersion: number;
  proposedPayload: Readonly<Record<string, unknown>>;
  operatingOrganizationId?: string;
  companyCodeId?: string | null;
};
type DecisionBody = {
  workflowRequestId: string;
  workItemId: string;
  expectedRequestVersion: number;
  expectedWorkItemVersion: number;
  decision: "return" | "reject" | "approve";
  reason: string;
  idempotencyKey: string;
};
function patch(value: PatchBody): PatchBody {
  return value;
}
function decide(value: DecisionBody): DecisionBody {
  return value;
}
export function commandKey(action: string): string {
  return `bp-ui-${action}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function parseMutation(value: unknown) {
  const body = parseCaseMutation(value);
  return Object.freeze({
    case: body.case,
    request: body.request,
    replayed: Boolean(body.replayed),
  });
}
function parseList(value: unknown): readonly PartnerRequest[] {
  if (!Array.isArray(value))
    throw new TypeError("Business Partner case list must be an array");
  return Object.freeze(value.map((item) => parseCaseMutation(item).request));
}
function parseView(value: unknown): RequestView {
  const body = record(value),
    workflow = body.workflow === undefined ? undefined : record(body.workflow),
    onboardingCycle = body.onboardingCycle === undefined ? undefined : parseOnboardingCycle(body.onboardingCycle),
    proof =
      body.materializationProof === undefined
        ? undefined
        : parseProof(body.materializationProof);
  return Object.freeze({
    case: parseGovernedCaseView(body.case),
    request: parseRequest(body.request),
    validationFindings: Array.isArray(body.validationFindings)
      ? Object.freeze(body.validationFindings.map(parseFinding))
      : [],
    ...(proof ? { materializationProof: proof } : {}),
    ...(onboardingCycle ? { onboardingCycle } : {}),
    ...(workflow
      ? {
          workflow: {
            requestId: text(workflow.requestId),
            stageId: text(workflow.stageId),
            workItemId: text(workflow.workItemId),
            workItemVersion: positive(workflow.workItemVersion),
            workItemStatus: text(workflow.workItemStatus),
            ownerPrincipalId: text(workflow.ownerPrincipalId),
            definition: record(
              workflow.definition,
            ) as unknown as RequestView["workflow"] extends infer W
              ? W extends { definition: infer D }
                ? D
                : never
              : never,
            stages: Array.isArray(workflow.stages)?Object.freeze(workflow.stages.map(parseWorkflowStage)):[],
          },
        }
      : {}),
  });
}
function parseOnboardingCycle(value:unknown):NonNullable<RequestView["onboardingCycle"]>{const cycle=record(value),template=record(cycle.template);if(!Array.isArray(cycle.tasks)||!Array.isArray(cycle.subjects))throw new TypeError("Onboarding cycle contract is invalid");return Object.freeze({runId:text(cycle.runId),code:text(cycle.code),name:text(cycle.name),status:text(cycle.status),...(typeof cycle.startedAt==="string"?{startedAt:cycle.startedAt}:{}),...(typeof cycle.completedAt==="string"?{completedAt:cycle.completedAt}:{}),template:Object.freeze({code:text(template.code),version:positive(template.version),hash:text(template.hash),...(typeof template.releaseId==="string"?{releaseId:template.releaseId}:{})}),tasks:Object.freeze(cycle.tasks.map(raw=>{const task=record(raw);return Object.freeze({id:text(task.id),code:text(task.code),name:text(task.name),status:text(task.status),completionMode:["manual","system","hybrid"].includes(String(task.completionMode))?task.completionMode as "manual"|"system"|"hybrid":"manual",...(typeof task.startedAt==="string"?{startedAt:task.startedAt}:{}),...(typeof task.completedAt==="string"?{completedAt:task.completedAt}:{}),completionEvidence:record(task.completionEvidence)});})),subjects:Object.freeze(cycle.subjects.map(raw=>{const subject=record(raw);return Object.freeze({role:text(subject.role),primary:Boolean(subject.primary),...(typeof subject.entityCaseId==="string"?{entityCaseId:subject.entityCaseId}:{}),...(typeof subject.externalReference==="string"?{externalReference:subject.externalReference}:{})});}))});}
function parseWorkflowStage(value:unknown){const stage=record(value),quorum=record(stage.quorum);return Object.freeze({id:text(stage.id),code:text(stage.code),name:text(stage.name),stageNo:positive(stage.stageNo),mode:stage.mode==="serial"?"serial" as const:"parallel" as const,status:text(stage.status),...(typeof stage.outcome==="string"?{outcome:stage.outcome}:{}),quorum:Object.freeze({kind:["all","any","count","percentage"].includes(String(quorum.kind))?quorum.kind as "all"|"any"|"count"|"percentage":"any" as const,...(quorum.value!==undefined?{value:Number(quorum.value)}:{}),required:positive(quorum.required),eligibleCount:Number(quorum.eligibleCount??0)}),...(typeof stage.startedAt==="string"?{startedAt:stage.startedAt}:{}),...(typeof stage.completedAt==="string"?{completedAt:stage.completedAt}:{}),...(typeof stage.dueAt==="string"?{dueAt:stage.dueAt}:{}),remindersAt:Array.isArray(stage.remindersAt)?Object.freeze(stage.remindersAt.filter((item):item is string=>typeof item==="string")):[],...(typeof stage.escalateAt==="string"?{escalateAt:stage.escalateAt}:{}),workItems:Array.isArray(stage.workItems)?Object.freeze(stage.workItems.map(item=>{const row=record(item);return Object.freeze({id:text(row.id),status:text(row.status),rowVersion:positive(row.rowVersion),...(typeof row.ownerPrincipalId==="string"?{ownerPrincipalId:row.ownerPrincipalId}:{}),...(typeof row.dueAt==="string"?{dueAt:row.dueAt}:{}),priority:text(row.priority),...(typeof row.decision==="string"?{decision:row.decision}:{}),...(typeof row.decidedAt==="string"?{decidedAt:row.decidedAt}:{}),...(typeof row.decidedBy==="string"?{decidedBy:row.decidedBy}:{})});})):[]});}
function parseProof(value: unknown): MaterializationProof {
  const body = record(value),
    materializer = record(body.materializer),
    result = record(body.result),
    lineage = Array.isArray(body.lineage)
      ? body.lineage
      : fail("Materialization lineage must be an array");
  if (
    body.schema !== "athyper.business-partner-materialization-proof/1" ||
    body.status !== "succeeded" ||
    lineage.length > 25
  )
    throw new TypeError("Materialization proof contract is invalid");
  return Object.freeze({
    schema: body.schema,
    materializationId: text(body.materializationId),
    attemptNo: positive(body.attemptNo),
    status: body.status,
    resultCode: text(body.resultCode),
    sourceSnapshot: parseSnapshot(body.sourceSnapshot),
    resultSnapshot: parseSnapshot(body.resultSnapshot),
    materializer: Object.freeze({
      code: text(materializer.code),
      version: text(materializer.version),
    }),
    applicationFingerprint: hash(body.applicationFingerprint),
    completedAt: text(body.completedAt),
    completedBy: text(body.completedBy),
    result: Object.freeze({
      businessPartnerId: text(result.businessPartnerId),
      ...(result.partnerRole === "supplier" || result.partnerRole === "customer"
        ? { partnerRole: result.partnerRole }
        : {}),
      ...(result.roleId === undefined ? {} : { roleId: text(result.roleId) }),
      ...(result.bankVerificationId === undefined ? {} : {bankVerificationId:text(result.bankVerificationId)}),
      ...(result.operatingOrganizationAssignmentId === undefined
        ? {}
        : {
            operatingOrganizationAssignmentId: text(
              result.operatingOrganizationAssignmentId,
            ),
          }),
    }),
    lineage: Object.freeze(lineage.map(parseLineage)),
  });
}
function parseSnapshot(value: unknown): SnapshotCoordinate {
  const body = record(value);
  return Object.freeze({
    snapshotId: text(body.snapshotId),
    entityType: text(body.entityType),
    entityId: text(body.entityId),
    version: positive(body.version),
    payloadHash: hash(body.payloadHash),
    capturedAt: text(body.capturedAt),
  });
}
function parseLineage(value: unknown): LineageCoordinate {
  const body = record(value);
  return Object.freeze({
    lineageId: text(body.lineageId),
    sourceSnapshotId: text(body.sourceSnapshotId),
    targetSnapshotId: text(body.targetSnapshotId),
    role: text(body.role),
    ...(body.targetAuthorityType === undefined
      ? {}
      : { targetAuthorityType: text(body.targetAuthorityType) }),
    ...(body.targetAuthorityId === undefined
      ? {}
      : { targetAuthorityId: text(body.targetAuthorityId) }),
    transformationCode: text(body.transformationCode),
    transformationVersion: text(body.transformationVersion),
    evidenceHash: hash(body.evidenceHash),
    createdAt: text(body.createdAt),
  });
}
function parseCaseMutation<T extends Readonly<Record<string, unknown>>>(
  value: unknown,
): T & Readonly<{ case: GovernedCaseViewV1; request: PartnerRequest }> {
  const body = record(value);
  return Object.freeze({
    ...body,
    case: parseGovernedCaseView(body.case),
    request: parseRequest(body.request),
  }) as T & Readonly<{ case: GovernedCaseViewV1; request: PartnerRequest }>;
}
function parseRequest(value: unknown): PartnerRequest {
  const body = record(value);
  return body as unknown as PartnerRequest;
}
function parseFinding(value: unknown): ValidationFinding {
  return record(value) as unknown as ValidationFinding;
}
function parseAggregate(value: unknown): PartnerAggregate {
  return record(value) as unknown as PartnerAggregate;
}
function parseEligibility(value: unknown): PartnerEligibility {
  return record(value) as unknown as PartnerEligibility;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("API response must be an object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("API response string is required");
  return value;
}
function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new TypeError("API response version is invalid");
  return Number(value);
}
function hash(value: unknown): string {
  const result = text(value);
  if (!/^[a-f0-9]{64}$/.test(result))
    throw new TypeError("API response hash is invalid");
  return result;
}
function fail(message: string): never {
  throw new TypeError(message);
}
