import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export const workforcePermissions = Object.freeze({
  read: "neon.workforce.read",
  review: "neon.workforce.review",
  checklist: "neon.workforce.onboarding.execute",
  offboard: "neon.workforce.offboarding.execute",
  piiRead: "neon.workforce.pii.read",
  iamRetry: "neon.workforce.iam.retry",
  import: "neon.workforce.integration.import",
} as const);

export type WorkforceReadinessReason =
  | "BUSINESS_PARTNER_INACTIVE" | "EMPLOYEE_INACTIVE" | "EMPLOYMENT_NOT_EFFECTIVE"
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
  readonly businessPartnerId: string;
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
export interface WorkforceSourceInput { readonly externalId: string; readonly idempotencyKey: string; readonly payload: Readonly<Record<string, unknown>>; readonly legalEntityId: string; readonly companyCodeId: string; readonly orgUnitId: string; readonly positionId?: string; }
export interface WorkforceSourceAdapterCommand { readonly context: VerifiedRequestContext; readonly source: "import" | "api"; readonly systemCode: string; readonly records: readonly WorkforceSourceInput[]; }
