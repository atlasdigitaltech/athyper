import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const workforcePermissions = Object.freeze({
  read: "neon.workforce.read",
  requestCreate: "neon.workforce.request.create",
  requestRead: "neon.workforce.request.read",
  requestValidate: "neon.workforce.request.validate",
  requestSubmit: "neon.workforce.request.submit",
  requestDecide: "neon.workforce.request.decide",
  requestApply: "neon.workforce.request.apply",
  review: "neon.workforce.review",
  checklist: "neon.workforce.onboarding.execute",
  offboard: "neon.workforce.offboarding.execute",
  piiRead: "neon.workforce.pii.read",
  iamRetry: "neon.workforce.iam.retry",
  import: "neon.workforce.integration.import",
} as const);

export const workforceRequestSchema = Object.freeze({
  code: "workforce.request.v1",
  version: 1,
  hash: "a18f1d6a87bb72495e254a24f89ed1f98251f89df686da1091492866e090460d",
} as const);

export type WorkforceRequestKind = "onboard_person" | "add_employment" | "change_employment" | "offboard_employment";
export type WorkforceRequestSourceKind = "manual" | "portal" | "import" | "api";
export type WorkforceRequestStatus = "draft" | "validating" | "validation_failed" | "pending_approval" | "returned" | "approved" | "rejected" | "applying" | "applied" | "failed" | "cancelled" | "superseded";

export interface WorkforceRequestSchemaReference { readonly code: string; readonly version: number; readonly hash: string; }
export interface WorkforceRequest {
  readonly id: string; readonly tenantId: string; readonly requestNo: string;
  readonly kind: WorkforceRequestKind; readonly sourceKind: WorkforceRequestSourceKind;
  readonly targetPersonId?: string; readonly targetEmployeeId?: string; readonly targetEmploymentId?: string;
  readonly legalEntityId: string; readonly companyCodeId?: string; readonly orgUnitId?: string; readonly positionId?: string;
  readonly protectedProfileContentItemId?: string; readonly schema: WorkforceRequestSchemaReference;
  readonly requestedChanges: Readonly<Record<string, unknown>>; readonly workflowRequestId?: string;
  readonly workflow?: WorkforceRequestWorkflow;
  readonly materializedPersonId?: string; readonly materializedEmployeeId?: string; readonly materializedEmploymentId?: string;
  readonly materializedWorkAssignmentId?: string; readonly materializedPrincipalId?: string; readonly materializedOnboardingCaseId?: string;
  readonly materializationSnapshotId?: string; readonly decisionFingerprint?: string; readonly applicationFingerprint?: string;
  readonly idempotencyKey: string; readonly status: WorkforceRequestStatus; readonly rowVersion: number;
  readonly submittedAt?: string; readonly submittedBy?: string; readonly approvedAt?: string; readonly approvedBy?: string;
  readonly appliedAt?: string; readonly appliedBy?: string; readonly failureCode?: string; readonly supportReference?: string;
  readonly createdAt: string; readonly createdBy: string; readonly updatedAt?: string; readonly updatedBy?: string;
}
export interface CreateWorkforceRequestCommand {
  readonly context: VerifiedRequestContext; readonly idempotencyKey: string; readonly kind: WorkforceRequestKind;
  readonly sourceKind: WorkforceRequestSourceKind; readonly targetPersonId?: string; readonly targetEmployeeId?: string;
  readonly targetEmploymentId?: string; readonly legalEntityId: string; readonly companyCodeId?: string;
  readonly orgUnitId?: string; readonly positionId?: string; readonly protectedProfileContentItemId?: string;
  readonly schema?: WorkforceRequestSchemaReference; readonly requestedChanges: Readonly<Record<string, unknown>>;
}
export interface WorkforceRequestQuery { readonly context: VerifiedRequestContext; readonly requestId: string; }
export interface WorkforceRequestListQuery { readonly context: VerifiedRequestContext; readonly status?: WorkforceRequestStatus; readonly companyCodeId?: string; readonly limit?: number; }
export type WorkforceRequestValidationSeverity = "info" | "warning" | "error";
export interface WorkforceRequestValidationFinding { readonly ruleCode:string; readonly severity:WorkforceRequestValidationSeverity; readonly fieldPath:string; readonly outcome:"passed"|"failed"|"skipped"; readonly messageCode:string; readonly evidenceReference:Readonly<Record<string,unknown>>; }
export interface WorkforceRequestValidationResult { readonly evaluationId:string; readonly evaluatedAt:string; readonly ruleset:WorkforceRequestSchemaReference; readonly valid:boolean; readonly findings:readonly WorkforceRequestValidationFinding[]; }
export interface ValidateWorkforceRequestCommand { readonly context:VerifiedRequestContext; readonly requestId:string; readonly expectedVersion:number; }
export interface ValidateWorkforceRequestResponse { readonly request:WorkforceRequest; readonly validation:WorkforceRequestValidationResult; }
export interface WorkforceRequestWorkflowDefinition extends WorkforceRequestSchemaReference { readonly stageCode:string; readonly stageName:string; readonly approverPrincipalIds:readonly string[]; }
export interface WorkforceRequestWorkflow { readonly requestId:string; readonly stageId:string; readonly workItemId:string; readonly workItemVersion:number; readonly definition:WorkforceRequestSchemaReference; readonly decisionFingerprint:string; }
export interface SubmitWorkforceRequestCommand { readonly context:VerifiedRequestContext; readonly requestId:string; readonly expectedVersion:number; readonly idempotencyKey:string; }
export interface SubmitWorkforceRequestResponse { readonly request:WorkforceRequest; readonly workflow:WorkforceRequestWorkflow; readonly replayed:boolean; }
export type WorkforceRequestDecision="return"|"reject"|"approve";
export interface DecideWorkforceRequestCommand { readonly context:VerifiedRequestContext; readonly requestId:string; readonly workflowRequestId:string; readonly workItemId:string; readonly expectedRequestVersion:number; readonly expectedWorkItemVersion:number; readonly decision:WorkforceRequestDecision; readonly reason:string; readonly idempotencyKey:string; }
export interface DecideWorkforceRequestResponse { readonly request:WorkforceRequest; readonly workflow:WorkforceRequestWorkflow; readonly decision:WorkforceRequestDecision; readonly decisionFingerprint:string; readonly replayed:boolean; }
export interface ApplyWorkforceRequestCommand { readonly context:VerifiedRequestContext; readonly requestId:string; readonly expectedVersion:number; readonly idempotencyKey:string; }
export interface WorkforceRequestMaterialization { readonly personId:string; readonly employeeId?:string; readonly employmentId?:string; readonly workAssignmentId?:string; readonly onboardingCaseId?:string; readonly snapshotId:string; readonly applicationFingerprint:string; }
export interface ApplyWorkforceRequestResponse { readonly request:WorkforceRequest; readonly materialization:WorkforceRequestMaterialization; readonly replayed:boolean; }

export type WorkforceReadinessReason =
  | "PERSON_INACTIVE" | "EMPLOYEE_INACTIVE" | "EMPLOYMENT_NOT_EFFECTIVE"
  | "PRIMARY_ASSIGNMENT_NOT_EFFECTIVE" | "ONBOARDING_INCOMPLETE";

export interface WorkforceChecklistItem {
  readonly code: string;
  readonly label: string;
  readonly category: "payroll" | "benefits" | "equipment" | "policy" | "training" | "application_access";
  readonly required: boolean;
  readonly status: "pending" | "completed" | "waived";
  readonly completedAt?: string;
  readonly completedBy?: string;
}

export interface WorkforceSummary {
  readonly personId: string;
  readonly employeeId: string;
  readonly employeeNumber: string;
  readonly displayName: string;
  readonly companyCodeId?: string;
  readonly employmentStatus?: string;
  readonly hireDate?: string;
  readonly terminationDate?: string;
  readonly onboardingStatus?: string;
}

export interface WorkforceDetail extends WorkforceSummary {
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly principalId?: string;
  readonly employment?: Readonly<Record<string, unknown>>;
  readonly assignment?: Readonly<Record<string, unknown>>;
  readonly onboarding?: { readonly id: string; readonly requestId: string; readonly status: string; readonly checklist: readonly WorkforceChecklistItem[] };
  readonly offboarding?: { readonly id: string; readonly status: string; readonly targetExitDate: string; readonly checklist: readonly WorkforceChecklistItem[]; readonly employmentTerminationRecorded: boolean; readonly resourceChecklistCompleted: boolean; readonly accessDeprovisionStatus: string; readonly rowVersion: number };
  readonly returnedRequest?: Readonly<Record<string, unknown>>;
  readonly readiness: { readonly eligible: boolean; readonly reasons: readonly WorkforceReadinessReason[]; readonly evidenceVersion: number };
}

export interface WorkforceListQuery { readonly context: VerifiedRequestContext; readonly companyCodeId?: string; readonly status?: string; readonly limit?: number; }
export interface WorkforceQuery { readonly context: VerifiedRequestContext; readonly employeeId: string; }
export interface CompleteWorkforceChecklistItemCommand extends WorkforceQuery { readonly itemCode: string; readonly expectedVersion: number; }
export interface OffboardWorkforceCommand extends WorkforceQuery { readonly exitDate: string; readonly reasonCode: string; readonly resourceChecklist: readonly WorkforceChecklistItem[]; readonly idempotencyKey: string; }
export interface CompleteOffboardingResourceCommand extends WorkforceQuery { readonly caseId: string; readonly itemCode: string; readonly expectedVersion: number; }
export interface RetryWorkforceIamCommand extends WorkforceQuery { readonly employerOrganizationId: string; readonly createPrincipal: boolean; readonly idempotencyKey: string; }
export interface ReadPersonEvidenceQuery { readonly context: VerifiedRequestContext; readonly personId: string; readonly purpose: "employment" | "payroll" | "benefits" | "compliance"; readonly fields: readonly string[]; }
export interface PersonEvidenceView { readonly personId: string; readonly purpose: string; readonly expiresAt: string; readonly fields: Readonly<Record<string, unknown>>; readonly redactedFields: readonly string[]; }
export interface WorkforceSourceInput { readonly externalId: string; readonly idempotencyKey: string; readonly protectedProfileContentItemId: string; readonly payload: Readonly<Record<string, unknown>>; readonly legalEntityId: string; readonly companyCodeId: string; readonly orgUnitId: string; readonly positionId?: string; }
export interface WorkforceSourceAdapterCommand { readonly context: VerifiedRequestContext; readonly source: "import" | "api"; readonly systemCode: string; readonly records: readonly WorkforceSourceInput[]; }
