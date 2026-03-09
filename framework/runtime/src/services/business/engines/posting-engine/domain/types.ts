// framework/runtime/src/services/business/engines/posting-engine/domain/types.ts

// --- Chart of Accounts ---

export type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";
export type SubledgerType =
  | "AP"
  | "AR"
  | "ASSET"
  | "INVENTORY"
  | "WIP"
  | "COMMISSION"
  | null;
export type PeriodStatus = "FUTURE" | "OPEN" | "SOFT_CLOSE" | "HARD_CLOSE";
export type JEStatus = "CREATED" | "POSTED" | "REVERSED";

// --- Ledger Book ---

export type BookCode = "STAT" | "TAX" | "MGMT" | "IFRS" | "LOCAL" | string;
export type BookCategory =
  | "STATUTORY"
  | "TAX"
  | "MANAGEMENT"
  | "REGULATORY"
  | "CUSTOM";
export type ReportingStandard =
  | "IFRS"
  | "US_GAAP"
  | "IND_AS"
  | "UK_GAAP"
  | "LOCAL_GAAP"
  | "TAX_LOCAL"
  | "TAX_TRANSFER"
  | "MANAGEMENT"
  | "CUSTOM"
  | null;
export type BookCloseMode = "UNIFIED" | "INDEPENDENT";
export type BookAccountStrategy = "SAME" | "MAP" | "PROFILE";
export type BookAmountStrategy = "MIRROR" | "MULTIPLY" | "FORMULA" | "SUPPRESS";
export type BookRecognitionTiming = "SIMULTANEOUS" | "DEFERRED" | "ON_CLOSE";

export interface ChartOfAccounts {
  id: string;
  tenantId: string;
  entityCode: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  level: number;
  isGroup: boolean;
  isActive: boolean;
  allowDirectPosting: boolean;
  subledgerType: SubledgerType;
  currencyCode: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountInput {
  tenantId: string;
  entityCode: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId?: string;
  level?: number;
  isGroup?: boolean;
  allowDirectPosting?: boolean;
  subledgerType?: SubledgerType;
  currencyCode?: string;
  tags?: string[];
}

// --- Cost Center & Profit Center (legacy, superseded by dimension engine) ---

export interface CostCenter {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ProfitCenter {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
}

// --- Universal Ledger Dimensions ---

export type DimensionCategory = "SYSTEM" | "REGULATORY" | "CUSTOM";
export type DimensionSourceKind = "INTERNAL" | "EXTERNAL_ENTITY" | "DERIVED" | "SYSTEM";
export type DimensionValueStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "ARCHIVED";
export type DimensionPolicyBehavior =
  | "REQUIRED"
  | "OPTIONAL"
  | "FORBIDDEN"
  | "DERIVE_IF_MISSING"
  | "INHERIT_FROM_HEADER"
  | "FIXED_VALUE";

export interface DimensionType {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  description: string | null;
  category: DimensionCategory;
  sourceKind: DimensionSourceKind;
  sourceEntity: string | null;
  sourceCodeCol: string | null;
  sourceNameCol: string | null;
  isHierarchical: boolean;
  maxDepth: number | null;
  isBalanced: boolean;
  allowMulti: boolean;
  sortOrder: number;
  icon: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DimensionValue {
  id: string;
  tenantId: string;
  entityCode: string;
  dimensionTypeId: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  level: number;
  path: string | null;
  status: DimensionValueStatus;
  validFrom: Date | null;
  validTo: Date | null;
  allowPosting: boolean;
  allowBudgeting: boolean;
  allowPlanning: boolean;
  sourceRecordId: string | null;
  sourceEntityCode: string | null;
  tags: unknown[];
  attributes: Record<string, unknown>;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DimensionPolicy {
  id: string;
  tenantId: string;
  entityCode: string;
  dimensionTypeId: string;
  policyCode: string;
  policyVersion: number;
  description: string | null;
  scopeAccountType: AccountType | null;
  scopeAccountCode: string | null;
  scopeAccountRangeLo: string | null;
  scopeAccountRangeHi: string | null;
  scopeSubledgerType: string | null;
  scopeOuId: string | null;
  scopeIntentCode: string | null;
  scopeDocType: string | null;
  scopeDomain: string | null;
  /** Ledger book scope — null = applies to all books */
  scopeBookCode: BookCode | null;
  behavior: DimensionPolicyBehavior;
  fixedValueId: string | null;
  deriveSource: string | null;
  allowedValues: string[] | null;
  dependsOnTypeId: string | null;
  mutuallyExclusiveWith: string | null;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DimensionSet {
  id: string;
  tenantId: string;
  entityCode: string;
  setHash: string;
  signature: string;
  dimensionCount: number;
  displayLabel: string | null;
  createdAt: Date;
}

export interface DimensionSetItem {
  id: string;
  dimensionSetId: string;
  dimensionTypeId: string;
  dimensionValueId: string;
  ordinal: number;
}

/** Input pair for dimension set resolution */
export interface DimensionPair {
  typeId: string;
  valueId: string;
}

/** How a dimension value was resolved — preserved structurally, not just in logs */
export type DimensionResolutionSource =
  | "USER"              // Explicitly entered by user on document line
  | "FIXED_POLICY"      // Forced by a FIXED_VALUE policy
  | "DERIVED_POLICY"    // Derived via DERIVE_IF_MISSING policy
  | "OU_DEFAULT"        // Filled from operating unit default
  | "HEADER_INHERITED"  // Inherited from document header
  | "SYSTEM_INHERITED"  // Inherited from system context (e.g., intercompany partner)
  | "AI_SUGGESTED"      // Suggested by AI/ML engine (future)
  | "FEDERATION_CONTEXT"; // Derived from federation/cross-entity context

/** Result of policy evaluation for a single dimension type */
export interface DimensionResolutionEntry {
  dimensionTypeCode: string;
  dimensionValueCode: string;
  dimensionTypeId: string;
  dimensionValueId: string;
  source: DimensionResolutionSource;
  policyCode: string | null;
  policyVersion: number | null;
  confidence: number;
  warnings: string[];
}

/** Persisted dimension resolution metadata — structural audit trail */
export interface DimensionResolutionMeta {
  id: string;
  tenantId: string;
  entityCode: string;
  /** What the resolution was for: journal_line, document_line, transaction_pipeline */
  targetKind: "journal_line" | "document_line" | "transaction_pipeline";
  targetId: string;
  dimensionSetId: string | null;
  /** Snapshot of all resolution entries */
  resolutionLog: DimensionResolutionEntry[];
  /** SHA-256 hash of resolution log for tamper detection */
  resolutionHash: string;
  /** Snapshot of policy IDs + versions evaluated during resolution */
  evaluatedPolicies: Array<{
    policyId: string;
    policyCode: string;
    policyVersion: number;
    behavior: DimensionPolicyBehavior;
    matched: boolean;
  }>;
  resolvedAt: Date;
  resolvedBy: string | null;
}

/** Input for dimension resolution — what the caller provides per line */
export interface LineDimensionInput {
  /** Explicit dimension values provided by the user/document */
  dimensions?: Array<{ typeCode: string; valueCode: string }>;
  /** Account context for policy evaluation */
  accountCode?: string;
  accountType?: AccountType;
  subledgerType?: SubledgerType | null;
  /** Document context */
  docType?: string;
  intentCode?: string;
  domain?: string;
  /** Operating unit for OU defaults */
  ouId?: string;
  /** Ledger book for book-scoped policy evaluation */
  bookCode?: BookCode;
}

// --- Fiscal Period ---

export interface FiscalPeriod {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  periodName: string;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  openedAt: Date | null;
  softClosedAt: Date | null;
  hardClosedAt: Date | null;
  closedBy: string | null;
  createdAt: Date;
}

// --- Accounting Profile ---

export interface AccountingProfile {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  description: string | null;
  intentFilter: Record<string, unknown> | null;
  categoryFilter: Record<string, unknown> | null;
  postingPattern: PostingPatternEntry[];
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostingPatternEntry {
  side: "DEBIT" | "CREDIT";
  accountResolution: {
    method: "DIRECT" | "INTENT_LOOKUP" | "CATEGORY_LOOKUP" | "SUBLEDGER";
    accountCode?: string;
    lookupField?: string;
  };
  amountSource: "GROSS" | "NET" | "TAX" | "DISCOUNT" | "CUSTOM";
  customAmountField?: string;
  subledgerType?: SubledgerType;
  description?: string;
}

// --- Ledger Book ---

export interface LedgerBook {
  id: string;
  tenantId: string;
  bookCode: BookCode;
  bookName: string;
  description: string | null;
  category: BookCategory;
  reportingStandard: ReportingStandard;
  baseCurrencyCode: string;
  isPrimary: boolean;
  autoPost: boolean;
  requiresApproval: boolean;
  closeMode: BookCloseMode;
  allowManualJe: boolean;
  allowReversal: boolean;
  sortOrder: number;
  colorCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookAssignment {
  id: string;
  tenantId: string;
  entityCode: string;
  bookCode: BookCode;
  alternateCoaPrefix: string | null;
  overrideCurrencyCode: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface BookPostingRule {
  id: string;
  tenantId: string;
  entityCode: string;
  ruleCode: string;
  ruleName: string;
  description: string | null;
  sourceBookCode: BookCode;
  targetBookCode: BookCode;
  scopeDocType: string | null;
  scopeIntentCode: string | null;
  scopeAccountType: AccountType | null;
  scopeSubledgerType: SubledgerType;
  accountStrategy: BookAccountStrategy;
  accountMapping: Record<string, string> | null;
  targetProfileId: string | null;
  amountStrategy: BookAmountStrategy;
  amountMultiplier: string | null;
  amountFormula: Record<string, unknown> | null;
  recognitionTiming: BookRecognitionTiming;
  recognitionLagPeriods: number;
  priority: number;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookPeriodStatus {
  id: string;
  tenantId: string;
  entityCode: string;
  bookCode: BookCode;
  fiscalYear: number;
  periodNumber: number;
  status: PeriodStatus;
  openedAt: Date | null;
  softClosedAt: Date | null;
  hardClosedAt: Date | null;
  closedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Cross-Book Integrity Audit ---

export type CrossBookIssueType =
  | "ORPHANED_DERIVATION"
  | "MISSING_DERIVATION"
  | "UNASSIGNED_BOOK"
  | "BALANCE_DRIFT"
  | "CLOSED_BOOK_POSTING"
  | "INACTIVE_BOOK";

export type AuditSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface CrossBookAuditIssue {
  issueType: CrossBookIssueType;
  severity: AuditSeverity;
  entityCode: string;
  bookCode: BookCode;
  jeId: string;
  jeNumber: string;
  relatedJeId: string | null;
  relatedBook: BookCode | null;
  ruleCode: string | null;
  detail: string;
  detectedAt: Date;
}

// --- Book-Close Audit Log ---

export type BookCloseEventType =
  | "OPENED"
  | "SOFT_CLOSED"
  | "HARD_CLOSED"
  | "REOPENED"
  | "INHERITED_FROM_UNIFIED";

export interface BookCloseAuditEntry {
  id: string;
  tenantId: string;
  entityCode: string;
  bookCode: BookCode;
  fiscalYear: number;
  periodNumber: number;
  eventType: BookCloseEventType;
  fromStatus: PeriodStatus;
  toStatus: PeriodStatus;
  performedBy: string | null;
  performedAt: Date;
  reason: string | null;
  evidence: Record<string, unknown>;
}

// --- Cascade Reversal ---

export interface CascadeReversalInput {
  tenantId: string;
  sourceJeId: string;
  reversalPrefix?: string;
  reversedBy?: string;
  reasonCode?: string;
  reasonText?: string;
  correlationId?: string;
}

export interface CascadeReversalStep {
  bookCode: BookCode;
  originalJeId: string;
  originalJeNumber: string;
  reversalJeId: string;
  reversalJeNumber: string;
  cascadeOrder: number;
}

// --- Book-Close Authorization ---

export interface BookCloseAuthPolicy {
  id: string;
  tenantId: string;
  entityCode: string | null;
  bookCode: BookCode | null;
  transitionFrom: PeriodStatus;
  transitionTo: PeriodStatus;
  requiredRole: string;
  requiresSecondApproval: boolean;
  secondApprovalRole: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloseAuthorizationResult {
  authorized: boolean;
  requiredRole: string | null;
  needsSecond: boolean;
  secondRole: string | null;
}

// --- Audit Snapshot ---

export interface CrossBookAuditSnapshot {
  id: string;
  tenantId: string;
  entityCode: string | null;
  snapshotAt: Date;
  triggeredBy: string;
  correlationId: string | null;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  totalCount: number;
  affectedBooks: string[];
  affectedEntities: string[];
  issues: CrossBookAuditIssue[];
  durationMs: number | null;
  createdAt: Date;
}

// --- Close Authorization Decision Audit ---

export type AuthDecision = "APPROVED" | "DENIED" | "PENDING_SECOND";

export interface BookCloseAuthDecision {
  id: string;
  tenantId: string;
  entityCode: string;
  bookCode: BookCode;
  transitionFrom: PeriodStatus;
  transitionTo: PeriodStatus;
  fiscalYear: number;
  periodNumber: number;
  matchedPolicyId: string | null;
  requiredRole: string | null;
  requestedBy: string;
  requestedAt: Date;
  actorRoles: string[];
  decision: AuthDecision;
  denialReason: string | null;
  secondApprover: string | null;
  secondApprovedAt: Date | null;
  secondDecision: AuthDecision | null;
  correlationId: string | null;
  createdAt: Date;
}

// --- Journal Entry ---

export interface JournalEntry {
  id: string;
  tenantId: string;
  entityCode: string;
  jeNumber: string;
  txnId: string;
  docId: string;
  docType: string;
  bookCode: BookCode;
  accountingProfileId: string | null;
  fiscalYear: number;
  periodNumber: number;
  postingDate: Date;
  description: string | null;
  status: JEStatus;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  isReversal: boolean;
  reversalOfId: string | null;
  reversedById: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  derivedFromJeId: string | null;
  postingRuleId: string | null;
  createdAt: Date;
}

export interface JournalLine {
  id: string;
  tenantId: string;
  jeId: string;
  lineNo: number;
  accountId: string;
  costCenterId: string | null;
  profitCenterId: string | null;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description: string | null;
  subledgerType: SubledgerType;
  subledgerRefId: string | null;
  /** Links JE line back to the source document line that generated it */
  sourceDocLineId: string | null;
  /** Resolved canonical dimension set (hash-normalized) */
  dimensionSetId: string | null;
  tags: string[];
}

export interface CreateJournalEntryInput {
  tenantId: string;
  entityCode: string;
  txnId: string;
  docId: string;
  docType: string;
  bookCode?: BookCode;
  accountingProfileId?: string;
  postingDate: Date;
  description?: string;
  currencyCode: string;
  lines: CreateJournalLineInput[];
  postedBy: string;
  /** Idempotency key — prevents duplicate JE creation from retries */
  idempotencyKey?: string;
}

export interface CreateJournalLineInput {
  accountId: string;
  costCenterId?: string;
  profitCenterId?: string;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description?: string;
  subledgerType?: SubledgerType;
  subledgerRefId?: string;
  /** Links to the source document line (invoice line, payment allocation) */
  sourceDocLineId?: string;
  /** Pre-resolved dimension set ID (if caller already resolved) */
  dimensionSetId?: string;
  /** Raw dimension input for engine-side resolution */
  dimensionInput?: LineDimensionInput;
  tags?: string[];
}

// --- GL Balance ---

export interface GLBalance {
  id: string;
  tenantId: string;
  entityCode: string;
  bookCode: BookCode;
  accountId: string;
  fiscalYear: number;
  periodNumber: number;
  costCenterId: string | null;
  /** Resolved dimension set — new grain axis (replaces costCenterId grain) */
  dimensionSetId: string | null;
  currencyCode: string;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  updatedAt: Date;
}

// --- Period transitions ---

export const PERIOD_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  FUTURE: ["OPEN"],
  OPEN: ["SOFT_CLOSE"],
  SOFT_CLOSE: ["OPEN", "HARD_CLOSE"],
  HARD_CLOSE: [],
};

// --- Period Close Governance ---

export type CloseTaskCategory =
  | "SUBLEDGER"
  | "CONSOLIDATION"
  | "VALIDATION"
  | "TAX"
  | "CASH"
  | "REVENUE"
  | "ADJUSTMENTS"
  | "APPROVAL";

export type CloseTaskCompletionMode = "MANUAL" | "SYSTEM" | "HYBRID";

/** Gate: which period transition this task must be done before */
export type CloseGateTarget = "SOFT_CLOSE" | "HARD_CLOSE";

export type ChecklistTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WAIVED"
  | "BLOCKED"
  | "FAILED";

export const CHECKLIST_TASK_TRANSITIONS: Record<
  ChecklistTaskStatus,
  ChecklistTaskStatus[]
> = {
  PENDING: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["COMPLETED", "WAIVED", "FAILED", "BLOCKED"],
  COMPLETED: [],
  WAIVED: [],
  BLOCKED: ["PENDING", "IN_PROGRESS"],
  FAILED: ["IN_PROGRESS", "PENDING"],
};

export type CloseTaskSeverity = "low" | "medium" | "high" | "critical";

export interface PeriodCloseTask {
  id: string;
  tenantId: string;
  entityCode: string;
  taskCode: string;
  taskName: string;
  description: string | null;
  category: CloseTaskCategory;
  requiredBefore: CloseGateTarget;
  sortOrder: number;
  isMandatory: boolean;
  isWaivable: boolean;
  waiverRequiresApproval: boolean;
  waiverReasonRequired: boolean;
  completionMode: CloseTaskCompletionMode;
  systemCheckHandler: string | null;
  blueprintFilter: string[] | null;
  isActive: boolean;
  // Phase 3: ownership + SLA defaults
  defaultOwnerRole: string | null;
  defaultOwnerUserId: string | null;
  slaHours: number | null;
  severity: CloseTaskSeverity | null;
  reminderLeadHours: number | null;
  // Phase 5: orchestration graph
  estimatedDurationMinutes: number | null;
  orchestrationGroup: string | null;
  autoStartWhenReady: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type WaiverStatus =
  | "not_required"
  | "not_requested"
  | "pending_approval"
  | "approved"
  | "rejected";

export interface PeriodCloseChecklist {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  taskId: string;
  taskCode: string;
  taskStatus: ChecklistTaskStatus;
  isMandatory: boolean;
  assignedTo: string | null;
  completedBy: string | null;
  completedAt: Date | null;
  completionNotes: string | null;
  evidencePayload: Record<string, unknown>;
  waivedBy: string | null;
  waivedAt: Date | null;
  waiverReason: string | null;
  waiverApprovalRef: string | null;
  failureReason: string | null;
  failedAt: Date | null;
  // Phase 3: assignment
  assignedRole: string | null;
  assignedUserId: string | null;
  assignedGroupId: string | null;
  dueAt: Date | null;
  // Phase 3: waiver approval
  waiverStatus: WaiverStatus | null;
  waiverRequestSubmittedAt: Date | null;
  waiverRequestSubmittedBy: string | null;
  waiverDecisionAt: Date | null;
  waiverDecisionBy: string | null;
  approvalInstanceId: string | null;
  // Phase 3: handler observability
  lastHandlerRunAt: Date | null;
  lastHandlerResult: Record<string, unknown> | null;
  handlerRunCount: number;
  // Phase 3: escalation
  escalatedAt: Date | null;
  escalatedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloseGateResult {
  gatePassed: boolean;
  pendingCount: number;
  pendingTasks: string[];
}

export interface CloseProgress {
  totalTasks: number;
  completedCount: number;
  waivedCount: number;
  failedCount: number;
  blockedCount: number;
  inProgressCount: number;
  pendingCount: number;
  completionPct: number;
}

// --- Phase 3: Activity Timeline ---

export type CloseActivityType =
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_BLOCKED"
  | "TASK_UNBLOCKED"
  | "TASK_ASSIGNED"
  | "TASK_REASSIGNED"
  | "WAIVER_REQUESTED"
  | "WAIVER_APPROVED"
  | "WAIVER_REJECTED"
  | "HANDLER_EXECUTED"
  | "HANDLER_FAILED"
  | "REMINDER_SENT"
  | "ESCALATED"
  | "TRANSITION_ATTEMPTED"
  | "TRANSITION_DENIED"
  | "TRANSITION_SUCCEEDED"
  | "CHECKLIST_MATERIALIZED"
  // Phase 6.1: Risk signal lifecycle events
  | "RISK_SIGNAL_FIRED"
  | "RISK_SIGNAL_ACKNOWLEDGED"
  | "RISK_SIGNAL_RESOLVED"
  // Phase 6.2: Risk signal suppression + escalation
  | "RISK_SIGNAL_SUPPRESSED"
  | "RISK_SIGNAL_ESCALATED";

export type CloseActivityActorType =
  | "user"
  | "system"
  | "approval_engine"
  | "scheduler";

export interface PeriodCloseActivity {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  checklistId: string | null;
  taskCode: string | null;
  activityType: CloseActivityType;
  actorType: CloseActivityActorType;
  actorId: string | null;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

// --- Phase 3: Assignment ---

export interface CloseTaskAssignment {
  assignedRole: string | null;
  assignedUserId: string | null;
  assignedGroupId: string | null;
  dueAt: Date | null;
}

// --- Phase 3: Waiver Request ---

export interface WaiverRequestResult {
  checklistId: string;
  waiverStatus: WaiverStatus;
  approvalInstanceId: string | null;
  message: string;
}

export interface WaiverDecisionResult {
  checklistId: string;
  waiverStatus: WaiverStatus;
  taskStatus: ChecklistTaskStatus;
  message: string;
}

// --- Phase 5: Close Orchestration Graph ---

export type DependencySatisfactionMode = "satisfied" | "completed_only";

export interface PeriodCloseTaskDependency {
  id: string;
  tenantId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: "finish_to_start";
  satisfactionMode: DependencySatisfactionMode;
  isHardBlock: boolean;
  createdAt: Date;
  createdBy: string;
}

/** Computed readiness state — projection, not stored.
 *
 * NOT_READY    — predecessors incomplete (soft deps), just wait
 * READY        — all predecessors satisfied, can start
 * IN_PROGRESS  — work underway
 * SATISFIED    — COMPLETED or approved-WAIVED (terminal)
 * BLOCKED      — hard-blocked by predecessor failure or unsatisfied hard dep
 * FAILED       — task itself was executed and did NOT pass; needs retry/intervention
 * SKIPPED      — task not applicable for this run
 */
export type TaskReadinessState =
  | "NOT_READY"
  | "READY"
  | "IN_PROGRESS"
  | "SATISFIED"
  | "BLOCKED"
  | "FAILED"
  | "SKIPPED";

/** Dependency satisfaction result */
export type DependencySatisfactionResult =
  | "SATISFIED"
  | "UNSATISFIED"
  | "FAILED_BLOCKING"
  | "WAIVED_NOT_SUFFICIENT";

/** Computed graph node — rich DTO for API and UI */
export interface PeriodCloseTaskNode {
  checklistId: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  category: CloseTaskCategory;
  requiredBefore: CloseGateTarget;
  completionMode: CloseTaskCompletionMode;

  /** Authoritative checklist status */
  status: ChecklistTaskStatus;
  /** Derived readiness projection */
  readinessState: TaskReadinessState;
  /** Dependency satisfaction outcome */
  satisfactionState: DependencySatisfactionResult;

  predecessorTaskCodes: string[];
  successorTaskCodes: string[];

  /** Task codes that are blocking this node */
  blockedByTaskCodes: string[];
  /** Count of downstream nodes impacted if this node fails */
  downstreamImpactCount: number;

  estimatedDurationMinutes: number | null;
  severity: CloseTaskSeverity | null;
  orchestrationGroup: string | null;

  assignedRole: string | null;
  assignedUserId: string | null;
  dueAt: string | null;

  earliestStartAt: string | null;
  predictedFinishAt: string | null;

  /** Count of active risk signals affecting this task (0 when no signals) */
  activeSignalCount: number;
}

/** Full graph result */
export interface PeriodCloseGraphResult {
  nodes: PeriodCloseTaskNode[];
  edgeCount: number;
  hasCycle: boolean;
  cycleTaskCodes: string[];
  totalTasks: number;
  satisfiedCount: number;
  readyCount: number;
  blockedCount: number;
  failedCount: number;
  notReadyCount: number;
  inProgressCount: number;
}

/** Ready-now task for operator queue */
export interface ReadyTaskResult {
  taskCode: string;
  taskName: string;
  category: CloseTaskCategory;
  completionMode: CloseTaskCompletionMode;
  severity: CloseTaskSeverity | null;
  estimatedDurationMinutes: number | null;
  downstreamImpactCount: number;
  assignedRole: string | null;
  orchestrationGroup: string | null;
  autoStartWhenReady: boolean;
}

/** Blocking task detail */
export interface BlockingTaskResult {
  /** The task that is blocked */
  blockedTaskCode: string;
  blockedTaskName: string;
  /** The task causing the block */
  blockerTaskCode: string;
  blockerTaskName: string;
  blockerStatus: ChecklistTaskStatus;
  blockerSatisfactionState: DependencySatisfactionResult;
  /** How many downstream tasks are affected */
  downstreamImpactCount: number;
  /** Which gate this impacts */
  targetCloseImpact: CloseGateTarget | null;
}

/** Critical path result */
export interface CriticalPathResult {
  targetStatus: CloseGateTarget | null;
  totalEstimatedMinutes: number;
  blockingMinutesRemaining: number;
  path: Array<{
    taskCode: string;
    taskName: string;
    status: ChecklistTaskStatus;
    readinessState: TaskReadinessState;
    estimatedDurationMinutes: number | null;
  }>;
  dominantBlockerTaskCode: string | null;
}

/** Close forecast/prediction */
export interface ClosePredictionResult {
  targetStatus: CloseGateTarget;
  predictedReadyAt: string | null;
  totalRemainingMinutes: number | null;
  criticalPathMinutes: number | null;
  confidence: "low" | "medium" | "high";
  blockerTaskCodes: string[];
  /** Task codes that have no estimated_duration_minutes — forecast treats these as 0 */
  tasksWithoutEstimate: string[];
  failedTaskCodes: string[];
  assumptions: string[];
}

/** Graph validation result */
export interface GraphValidationResult {
  valid: boolean;
  errors: Array<{
    code: string;
    message: string;
    taskCodes?: string[];
  }>;
}

// --- Phase 6: Readiness Snapshot ---

/** How the snapshot capture was triggered — structured source discriminator */
export type SnapshotSource =
  | "manual"              // operator clicked "Capture Snapshot"
  | "scheduled"           // periodic scheduler (daily during close)
  | "period_transition"   // triggered by period status change attempt
  | "auto_handler"        // triggered after system handler execution
  | "api_call";           // generic API invocation (default)

export interface PeriodCloseReadinessSnapshot {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  snapshotAt: Date;
  targetStatus: CloseGateTarget;
  totalTasks: number;
  satisfiedCount: number;
  readyCount: number;
  blockedCount: number;
  failedCount: number;
  notReadyCount: number;
  inProgressCount: number;
  criticalPathMinutes: number;
  predictedReadyAt: Date | null;
  blockerTaskCodes: string[];
  confidence: "low" | "medium" | "high";
  /** Structured capture source — what mechanism triggered this snapshot */
  snapshotSource: SnapshotSource;
  /** Version tag of the graph computation algorithm.
   *  When semantics change, trend comparisons across versions may not be
   *  apples-to-apples.  UI/reporting layer should filter or warn. */
  computationVersion: string;
  triggeredBy: string;
  createdAt: Date;
}

// --- Phase 6.1: Risk Signals & Escalation ---

/** Supported risk rule evaluation types */
export type CloseRiskRuleType =
  | "forecast_slipped"
  | "confidence_dropped"
  | "blocker_stale"
  | "failed_task_unresolved"
  | "ready_queue_aging"
  | "sla_warning"
  | "sla_breach"
  | "close_target_at_risk"
  | "atlas_anomaly"
  | "document_defect_detected";

/** Risk signal lifecycle states */
export type RiskSignalState =
  | "fired"
  | "acknowledged"
  | "resolved"
  | "suppressed";

export const RISK_SIGNAL_TRANSITIONS: Record<RiskSignalState, RiskSignalState[]> = {
  fired: ["acknowledged", "resolved", "suppressed"],
  acknowledged: ["resolved", "suppressed"],
  resolved: [],
  suppressed: [],
};

/** Suppression scope — what "suppress" means operationally */
export type SuppressionScope =
  | "instance"                  // suppress only this signal instance
  | "rule_period"               // suppress this rule for the rest of this period
  | "until_fingerprint_change"; // suppress until the affected task set changes

/** Configurable risk rule definition */
export interface CloseRiskRule {
  id: string;
  tenantId: string;
  entityCode: string;
  ruleCode: string;
  ruleName: string;
  description: string | null;
  ruleType: CloseRiskRuleType;
  parameters: Record<string, unknown>;
  severity: CloseTaskSeverity;
  escalationRole: string | null;
  escalationUserId: string | null;
  cooldownMinutes: number;
  targetStatus: CloseGateTarget | null;
  /** When true, auto-resolve active signals when condition clears */
  autoResolveWhenClear: boolean;
  /** What "suppress" means for this rule */
  suppressionScope: SuppressionScope;
  // Phase 6.2: Escalation SLA policy
  /** Minutes allowed to acknowledge before escalation. 0 disables. */
  acknowledgeSlaMinutes: number;
  /** Minutes allowed to resolve after ack before escalation. 0 disables. */
  resolveSlaMinutes: number;
  /** Whether this rule triggers escalation timers */
  escalationEnabled: boolean;
  /** Max escalation rounds (1 = single, 2+ = chain) */
  maxEscalationLevel: number;
  /** Minutes between successive escalation rounds */
  escalationIntervalMinutes: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Fired risk signal with lifecycle tracking */
export interface CloseRiskSignal {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  ruleId: string;
  ruleCode: string;
  ruleType: CloseRiskRuleType;
  severity: CloseTaskSeverity;
  signalState: RiskSignalState;
  /** Deterministic identity key: rule_code:target_status:sorted_task_codes.
   *  Two signals with the same fingerprint = same semantic risk condition. */
  signalFingerprint: string | null;
  /** Copied from rule at suppression time */
  suppressionScope: SuppressionScope | null;
  triggerSnapshotId: string | null;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  firedAt: Date;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  // Phase 6.2: Escalation tracking
  escalationLevel: number;
  lastEscalatedAt: Date | null;
  createdAt: Date;
}

/** Input for evaluator functions — immutable snapshot of evaluation context */
export interface RiskEvaluationContext {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Current orchestration snapshot (most recent) */
  currentSnapshot: PeriodCloseReadinessSnapshot;
  /** Recent prior snapshots (ordered newest-first, excludes current) */
  priorSnapshots: PeriodCloseReadinessSnapshot[];
  /** Active signals for this period (for cooldown checks) */
  activeSignals: CloseRiskSignal[];
  /** Close calendar targets (if available) */
  closeCalendar: {
    softCloseTarget: Date;
    hardCloseTarget: Date;
  } | null;
  /** Graph nodes for task-level checks (SLA, ready-queue aging) */
  graphNodes: PeriodCloseTaskNode[];
  /** Atlas anomalies for this period (populated when atlas_anomaly rules exist) */
  atlasAnomalies?: Array<{
    id: string;
    anomalyType: string;
    severity: string;
    accountId: string | null;
    title: string;
    zScore: string | null;
    status: string;
  }>;
  /** Document registry defect summary (populated when document_defect_detected rules exist) */
  documentDefects?: {
    totalDocuments: number;
    defectDocuments: number;
    highSeverityDefects: number;
    mediumSeverityDefects: number;
    lowSeverityDefects: number;
    accrualReversalGaps: number;
    postingGaps: number;
    defectsByType: Array<{
      docType: string;
      defectType: string;
      count: number;
    }>;
  };
}

/** Result from a single rule evaluation */
export interface RiskEvaluationResult {
  fired: boolean;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  /** Deterministic fingerprint for deduplication. Null when not fired. */
  fingerprint: string | null;
  /** Task codes affected by this signal (for payload normalization) */
  affectedTaskCodes: string[];
}

/** Batch evaluation output */
export interface RiskEvaluationBatchResult {
  evaluated: number;
  fired: number;
  skippedCooldown: number;
  skippedSuppressed: number;
  autoResolved: number;
  signals: Array<{
    ruleCode: string;
    ruleType: CloseRiskRuleType;
    severity: CloseTaskSeverity;
    title: string;
    message: string;
    evidence: Record<string, unknown>;
    fingerprint: string;
    affectedTaskCodes: string[];
  }>;
  /** Signals auto-resolved because their condition cleared */
  autoResolvedSignals: Array<{
    signalId: string;
    ruleCode: string;
    fingerprint: string;
  }>;
}

/** Normalized activity payload for RISK_SIGNAL_* events.
 *  All risk signal activity entries MUST use this shape. */
export interface RiskSignalActivityPayload {
  signalId: string;
  ruleId: string;
  ruleCode: string;
  ruleType: CloseRiskRuleType;
  signalFingerprint: string | null;
  priorState: RiskSignalState | null;
  newState: RiskSignalState;
  targetStatus: CloseGateTarget | null;
  affectedTaskCodes: string[];
  evaluationAt: string;
}

// --- Phase 6.2: Domain Events & Operations Service ---

/** Stable domain event types for risk signal lifecycle.
 *  Used by EventBus subscribers (notification rules, audit, policy). */
export type RiskSignalEventType =
  | "fin.risk_signal.fired"
  | "fin.risk_signal.acknowledged"
  | "fin.risk_signal.resolved"
  | "fin.risk_signal.suppressed"
  | "fin.risk_signal.escalated";

/** Map from signal state to event type */
export const RISK_SIGNAL_EVENT_MAP: Record<RiskSignalState | "escalated", RiskSignalEventType> = {
  fired: "fin.risk_signal.fired",
  acknowledged: "fin.risk_signal.acknowledged",
  resolved: "fin.risk_signal.resolved",
  suppressed: "fin.risk_signal.suppressed",
  escalated: "fin.risk_signal.escalated",
};

/** Map from signal state to activity type */
export const RISK_SIGNAL_ACTIVITY_MAP: Record<RiskSignalState | "escalated", CloseActivityType> = {
  fired: "RISK_SIGNAL_FIRED",
  acknowledged: "RISK_SIGNAL_ACKNOWLEDGED",
  resolved: "RISK_SIGNAL_RESOLVED",
  suppressed: "RISK_SIGNAL_SUPPRESSED",
  escalated: "RISK_SIGNAL_ESCALATED",
};

/** Domain event payload — travels through EventBus, notification, and audit.
 *  Intentionally close to RiskSignalActivityPayload for consistency. */
export interface RiskSignalEventPayload {
  signalId: string;
  ruleId: string;
  ruleCode: string;
  ruleType: CloseRiskRuleType;
  severity: CloseTaskSeverity;
  signalFingerprint: string | null;
  priorState: RiskSignalState | null;
  newState: RiskSignalState;
  targetStatus: CloseGateTarget | null;
  affectedTaskCodes: string[];
  title: string;
  message: string;
  escalationRole: string | null;
  escalationLevel: number;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
}

/** Result from CloseRiskSignalOperationsService.evaluate() */
export interface RiskSignalOperationsResult {
  evaluated: number;
  fired: number;
  skippedCooldown: number;
  skippedSuppressed: number;
  autoResolved: number;
  escalationsScheduled: number;
  eventsEmitted: number;
  signals: Array<{
    signalId: string;
    ruleCode: string;
    ruleType: CloseRiskRuleType;
    severity: CloseTaskSeverity;
    title: string;
    fingerprint: string;
    affectedTaskCodes: string[];
  }>;
  autoResolvedSignals: Array<{
    signalId: string;
    ruleCode: string;
    fingerprint: string;
  }>;
}

/** Result from a single signal state transition */
export interface RiskSignalTransitionResult {
  signal: CloseRiskSignal;
  eventType: RiskSignalEventType;
}

/** Scheduled evaluation config per entity */
export interface CloseRiskSchedule {
  id: string;
  tenantId: string;
  entityCode: string;
  isEnabled: boolean;
  cadenceMinutes: number;
  activePeriodsOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Phase 9: Prescriptive Close Automation ──────────────────────────────

export type CloseActionTriggerType =
  | "ready_tasks_available"
  | "critical_signal_active"
  | "delay_impact_exceeded"
  | "confidence_below"
  | "blocker_stale"
  | "sla_at_risk"
  | "bottleneck_recurring"
  | "handler_failed"
  | "parallel_opportunity";

export type CloseActionType =
  | "notify_owner"
  | "notify_escalation"
  | "start_ready_tasks"
  | "rerun_handler"
  | "refresh_snapshot"
  | "reevaluate_signals"
  | "escalate_signal"
  | "recommend_parallel"
  | "recommend_reassignment"
  | "recommend_waiver"
  | "publish_readiness"
  | "custom";

export type CloseActionExecutionMode = "recommend" | "auto" | "auto_safe";

export type CloseActionLogStatus =
  | "proposed"
  | "accepted"
  | "executed"
  | "dismissed"
  | "expired"
  | "failed";

/** Safe action types that auto_safe mode is allowed to execute without approval */
export const SAFE_ACTION_TYPES: ReadonlySet<CloseActionType> = new Set([
  "refresh_snapshot",
  "reevaluate_signals",
  "notify_owner",
  "notify_escalation",
  "publish_readiness",
]);

export interface CloseActionPolicy {
  id: string;
  tenantId: string;
  entityCode: string;
  policyCode: string;
  policyName: string;
  description: string | null;
  triggerType: CloseActionTriggerType;
  triggerCondition: Record<string, unknown>;
  actionType: CloseActionType;
  actionParams: Record<string, unknown>;
  executionMode: CloseActionExecutionMode;
  priority: number;
  severity: CloseTaskSeverity;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloseActionLogEntry {
  id: string;
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  policyId: string | null;
  policyCode: string;
  actionType: CloseActionType;
  actionParams: Record<string, unknown>;
  triggerContext: Record<string, unknown>;
  status: CloseActionLogStatus;
  proposedAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
  executedAt: Date | null;
  executionResult: Record<string, unknown> | null;
  outcomeNotes: string | null;
  wasEffective: boolean | null;
  fingerprint: string | null;
  createdAt: Date;
}

export interface CloseBottleneckPattern {
  tenantId: string;
  entityCode: string;
  taskCode: string;
  totalAppearances: number;
  timesLongestTask: number;
  timesTop3: number;
  timesBlocked: number;
  avgDurationMinutes: number;
  maxDurationMinutes: number;
  avgBlockMinutes: number;
  p95DurationMinutes: number;
  totalCloses: number;
  bottleneckFrequencyPct: number;
  patternClassification: "chronic" | "frequent" | "recurring" | "occasional";
  lastPeriodKey: number;
}

/** Result from evaluating action policies against current close state */
export interface CloseRecommendation {
  policyId: string;
  policyCode: string;
  policyName: string;
  triggerType: CloseActionTriggerType;
  actionType: CloseActionType;
  actionParams: Record<string, unknown>;
  executionMode: CloseActionExecutionMode;
  priority: number;
  severity: CloseTaskSeverity;
  triggerContext: Record<string, unknown>;
  fingerprint: string;
  rationale: string;
}
