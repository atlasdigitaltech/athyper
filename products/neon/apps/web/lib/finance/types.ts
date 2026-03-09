// lib/finance/types.ts
//
// Frontend DTOs for the Finance module.
// MC-4 compliant: all monetary values are string (never float).

// ---------------------------------------------------------------------------
// Purchase Invoice
// ---------------------------------------------------------------------------

export type InvoiceStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "POSTED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "CANCELLED";

export interface InvoiceLineDTO {
  id: string;
  invoiceId: string;
  lineNo: number;
  description: string;
  itemId: string | null;
  warehouseId: string | null;
  quantity: string;
  uom: string | null;
  unitPrice: string;
  amount: string;
  taxCode: string | null;
  taxRate: string;
  taxAmount: string;
  taxInclusive: boolean;
  accountId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  fpId: string | null;
  assetId: string | null;
  inventoryMovementId: string | null;
}

export interface InvoiceLineDefaults {
  accountId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  fpId: string | null;
  taxCode: string | null;
}

export interface CreateInvoiceLineInput {
  description: string;
  itemId?: string;
  warehouseId?: string;
  quantity: string;
  uom?: string;
  unitPrice: string;
  amount: string;
  taxCode?: string;
  taxRate?: string;
  taxAmount?: string;
  taxInclusive?: boolean;
  accountId?: string;
  costCenterId?: string;
  profitCenterId?: string;
  fpId?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Journal Entry
// ---------------------------------------------------------------------------

export type JEStatus = "CREATED" | "POSTED" | "REVERSED";

export type BookCode = "STAT" | "TAX" | "MGMT" | "IFRS" | "LOCAL" | string;

export interface JournalEntryDTO {
  id: string;
  jeNumber: string;
  entityCode: string;
  bookCode: BookCode;
  docId: string;
  docType: string;
  postingDate: string;
  fiscalYear: number;
  periodNumber: number;
  description: string | null;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  status: JEStatus;
  lines: JournalLineDTO[];
}

export interface JournalLineDTO {
  id: string;
  jeId: string;
  lineNo: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  costCenterId: string | null;
  profitCenterId: string | null;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description: string | null;
  sourceDocLineId: string | null;
  /** Resolved dimension set for this line */
  dimensionSetId: string | null;
  dimensionLabel: string | null;
}

// ---------------------------------------------------------------------------
// Payment Entry
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "POSTED"
  | "RECONCILED"
  | "CANCELLED"
  | "VOIDED";

export type PaymentMethod =
  | "CHECK"
  | "WIRE"
  | "ACH"
  | "CARD"
  | "CASH"
  | "NETTING";

export interface PaymentAllocationDTO {
  id: string;
  paymentId: string;
  invoiceId: string;
  lineNo: number;
  allocatedAmount: string;
  discountAmount: string;
  withholdingAmount: string;
}

export interface UnpaidInvoiceDTO {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  currencyCode: string;
  dueDate: string | null;
}

export interface CreateAllocationInput {
  invoiceId: string;
  allocatedAmount: string;
  discountAmount?: string;
  withholdingAmount?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// GL Report
// ---------------------------------------------------------------------------

export type ReversalHandlingMode = "NETTED" | "SEPARATE" | "EXCLUDED";

export interface GLReportFilters {
  entityCode: string;
  bookCode?: BookCode;
  fiscalYear: number;
  periodNumber?: number;
  accountId?: string;
  costCenterId?: string;
  accountType?: string;
  reversalMode?: ReversalHandlingMode;
  /** Filter by dimension set ID (exact match) */
  dimensionSetId?: string;
  /** Filter by dimension type + value (e.g., COST_CENTER:CC-SALES) */
  dimensionTypeCode?: string;
  dimensionValueCode?: string;
  /** Group summary/trial-balance rows by a dimension type */
  groupByDimension?: string;
}

export interface GLSummaryRowDTO {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
  /** Set when filtering/grouping by dimension */
  dimensionSetId?: string | null;
  dimensionLabel?: string | null;
  /** Set when grouping by specific dimension type */
  dimensionValueCode?: string | null;
  dimensionValueName?: string | null;
}

export interface GLDetailRowDTO {
  jeId: string;
  jeNumber: string;
  postingDate: string;
  docId: string;
  docType: string;
  lineNo: number;
  debitAmount: string;
  creditAmount: string;
  description: string | null;
  sourceDocLineId: string | null;
  costCenterId: string | null;
  /** Resolved dimension set for this line */
  dimensionSetId: string | null;
  dimensionLabel: string | null;
}

export interface TrialBalanceRowDTO {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: string;
  creditBalance: string;
}

// ---------------------------------------------------------------------------
// Decision Score
// ---------------------------------------------------------------------------

export interface DecisionEvaluationDTO {
  compositeScore: number;
  approvalRoute: string;
  pipelineId: string;
  exceptions: Array<{
    policyCode: string;
    severity: string;
    message: string;
  }>;
}

// ---------------------------------------------------------------------------
// List summaries (for ListPageConfig)
// ---------------------------------------------------------------------------

export interface PurchaseInvoiceSummary {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName?: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: string;
  paidAmount: string;
  currencyCode: string;
  status: InvoiceStatus;
  approvalRoute: string | null;
}

export interface PaymentEntrySummary {
  id: string;
  paymentNumber: string;
  supplierId: string;
  supplierName?: string;
  paymentDate: string;
  totalAmount: string;
  currencyCode: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  approvalRoute: string | null;
}

export interface JournalEntrySummary {
  id: string;
  jeNumber: string;
  bookCode: BookCode;
  docType: string;
  postingDate: string;
  fiscalYear: number;
  periodNumber: number;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  status: JEStatus;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Cross-Book Integrity Audit
// ---------------------------------------------------------------------------

export type CrossBookIssueType =
  | "ORPHANED_DERIVATION"
  | "MISSING_DERIVATION"
  | "UNASSIGNED_BOOK"
  | "BALANCE_DRIFT"
  | "CLOSED_BOOK_POSTING"
  | "INACTIVE_BOOK";

export type AuditSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface CrossBookAuditIssueDTO {
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
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Book-Close Audit Log
// ---------------------------------------------------------------------------

export type BookCloseEventType =
  | "OPENED"
  | "SOFT_CLOSED"
  | "HARD_CLOSED"
  | "REOPENED"
  | "INHERITED_FROM_UNIFIED";

export interface BookCloseAuditEntryDTO {
  id: string;
  bookCode: BookCode;
  fiscalYear: number;
  periodNumber: number;
  eventType: BookCloseEventType;
  fromStatus: string;
  toStatus: string;
  performedBy: string | null;
  performedAt: string;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Compare Books (cross-book balance comparison)
// ---------------------------------------------------------------------------

export interface CompareBookRowDTO {
  accountCode: string;
  accountName: string;
  bookCode: BookCode;
  closingDebit: string;
  closingCredit: string;
  netBalance: string;
  variancePct: number | null;
}

// ---------------------------------------------------------------------------
// Reversal Chain (cascade reversal drill-down)
// ---------------------------------------------------------------------------

export interface ReversalChainStepDTO {
  bookCode: BookCode;
  originalJeId: string;
  originalJeNumber: string;
  reversalJeId: string;
  reversalJeNumber: string;
  cascadeOrder: number;
  description: string | null;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  reversedAt: string;
  reasonCode: string | null;
  reasonText: string | null;
}

// ---------------------------------------------------------------------------
// Universal Ledger Dimensions
// ---------------------------------------------------------------------------

export type DimensionCategory = "SYSTEM" | "REGULATORY" | "CUSTOM";
export type DimensionSourceKind = "INTERNAL" | "EXTERNAL_ENTITY" | "DERIVED" | "SYSTEM";
export type DimensionValueStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "ARCHIVED";

export interface DimensionTypeDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: DimensionCategory;
  sourceKind: DimensionSourceKind;
  isHierarchical: boolean;
  isBalanced: boolean;
  sortOrder: number;
  icon: string | null;
  isActive: boolean;
}

export interface DimensionValueDTO {
  id: string;
  dimensionTypeId: string;
  dimensionTypeCode: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  level: number;
  path: string | null;
  status: DimensionValueStatus;
  validFrom: string | null;
  validTo: string | null;
  allowPosting: boolean;
  sortOrder: number;
}

export interface DimensionSetDTO {
  id: string;
  displayLabel: string | null;
  dimensionCount: number;
  items: DimensionSetItemDTO[];
}

export interface DimensionSetItemDTO {
  dimensionTypeCode: string;
  dimensionTypeName: string;
  dimensionValueCode: string;
  dimensionValueName: string;
  ordinal: number;
}

/** How a dimension value was resolved — structural source attribution */
export type DimensionResolutionSource =
  | "USER"
  | "FIXED_POLICY"
  | "DERIVED_POLICY"
  | "OU_DEFAULT"
  | "HEADER_INHERITED"
  | "SYSTEM_INHERITED"
  | "AI_SUGGESTED"
  | "FEDERATION_CONTEXT";

/** Resolution audit trail entry */
export interface DimensionResolutionEntryDTO {
  dimensionTypeCode: string;
  dimensionValueCode: string;
  source: DimensionResolutionSource;
  policyCode: string | null;
  policyVersion: number | null;
  confidence: number;
  warnings: string[];
}

/** Full resolution metadata for a target (journal line, document line, etc.) */
export interface DimensionResolutionMetaDTO {
  id: string;
  targetKind: "journal_line" | "document_line" | "transaction_pipeline";
  targetId: string;
  dimensionSetId: string | null;
  resolutionLog: DimensionResolutionEntryDTO[];
  evaluatedPolicies: Array<{
    policyCode: string;
    policyVersion: number;
    behavior: string;
    matched: boolean;
  }>;
  resolvedAt: string;
}

/** Input for dimension picker — what the user selects per line */
export interface DimensionSelectionDTO {
  typeCode: string;
  typeName: string;
  valueId: string;
  valueCode: string;
  valueName: string;
}

// ---------------------------------------------------------------------------
// Bank Reconciliation
// ---------------------------------------------------------------------------

export type StatementStatus =
  | "IMPORTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";
export type MatchStatus =
  | "UNMATCHED"
  | "AUTO_MATCHED"
  | "MANUAL_MATCHED"
  | "CONFIRMED"
  | "EXCLUDED";
export type ReconciliationSessionStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export interface BankStatementDTO {
  id: string;
  statementNumber: string;
  bankAccountId: string;
  bankName: string | null;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: string;
  closingBalance: string;
  currencyCode: string;
  source: string;
  status: StatementStatus;
  lineCount: number;
}

export interface BankStatementLineDTO {
  id: string;
  statementId: string;
  lineNo: number;
  transactionDate: string;
  amount: string;
  direction: "DEBIT" | "CREDIT";
  reference: string | null;
  description: string | null;
  counterparty: string | null;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  matchedPaymentId: string | null;
}

export interface ReconciliationSessionDTO {
  id: string;
  statementId: string;
  status: ReconciliationSessionStatus;
  totalLines: number;
  autoMatched: number;
  manualMatched: number;
  unmatched: number;
  excluded: number;
  discrepancy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface BankStatementSummary {
  id: string;
  statementNumber: string;
  bankName: string | null;
  statementDate: string;
  openingBalance: string;
  closingBalance: string;
  currencyCode: string;
  status: StatementStatus;
  lineCount: number;
}

// ---------------------------------------------------------------------------
// Financial Statement Engine
// ---------------------------------------------------------------------------

export type StatementEngineType =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "TRIAL_BALANCE"
  | "MANAGEMENT"
  | "COMPARISON"
  | "DIMENSION_PACK";

export type StatementLineType =
  | "SECTION"
  | "ACCOUNT"
  | "SUBTOTAL"
  | "CALCULATION"
  | "MOVEMENT"
  | "SEPARATOR"
  | "NOTE";

export type StatementInstanceStatus =
  | "DRAFT"
  | "REVIEWED"
  | "APPROVED"
  | "FINALIZED"
  | "PUBLISHED"
  | "SUPERSEDED";

export interface StmtEngineDefinitionDTO {
  id: string;
  definitionCode: string;
  name: string;
  description: string | null;
  statementType: StatementEngineType;
  bookCodes: string[] | null;
  reportingStandard: string | null;
  currencyCode: string | null;
  dimensionCodes: string[] | null;
  version: number;
  scope: "SYSTEM" | "TENANT" | "ENTITY";
  isActive: boolean;
}

export interface StmtEngineInstanceDTO {
  id: string;
  definitionId: string;
  definitionCode: string;
  definitionName: string;
  statementType: StatementEngineType;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  dimensionSetId: string | null;
  currencyCode: string;
  status: StatementInstanceStatus;
  generatedAt: string;
  generatedBy: string | null;
  generationDurationMs: number | null;
  totalLineCount: number;
  publishedBy: string | null;
  publishedAt: string | null;
  supersedesId: string | null;
  notes: string | null;
}

export interface StmtEngineInstanceLineDTO {
  lineCode: string;
  label: string;
  lineType: StatementLineType;
  parentLineCode: string | null;
  level: number;
  sortOrder: number;
  currentAmount: string;
  priorAmount: string | null;
  budgetAmount: string | null;
  varianceAmount: string | null;
  variancePct: string | null;
  accountBreakdown: AccountBreakdownDTO[] | null;
  isBold: boolean;
  isUnderlined: boolean;
  indentLevel: number;
  isCalculated: boolean;
}

export interface AccountBreakdownDTO {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
}

export interface GenerateStatementInput {
  definitionId: string;
  entityCode: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode?: string;
  dimensionSetId?: string;
  dimensionFilter?: Record<string, string>;
  dimensionTypeCode?: string;
  dimensionValueCode?: string;
  currencyCode?: string;
  includePriorYear?: boolean;
}

export interface StmtComparisonLineDTO {
  lineCode: string;
  label: string;
  lineType: string;
  baseAmount: string;
  compareAmount: string;
  varianceAmount: string;
  variancePct: string | null;
  sortOrder: number;
  indentLevel: number;
  isBold: boolean;
}

export interface StmtComparisonDTO {
  baseInstance: StmtEngineInstanceDTO;
  compareInstance: StmtEngineInstanceDTO;
  lines: StmtComparisonLineDTO[];
  totalLines: number;
  linesWithVariance: number;
  maxVariancePct: number | null;
  totalVariance: string;
}

// ---------------------------------------------------------------------------
// Paginated result (mirrors backend PaginatedResult<T>)
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Period Close Governance
// ---------------------------------------------------------------------------

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
export type CloseGateTarget = "SOFT_CLOSE" | "HARD_CLOSE";
export type ChecklistTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "WAIVED"
  | "BLOCKED"
  | "FAILED";
export type CloseTaskSeverity = "low" | "medium" | "high" | "critical";
export type WaiverStatus =
  | "not_required"
  | "not_requested"
  | "pending_approval"
  | "approved"
  | "rejected";

/** Evidence classification code emitted by system close handlers */
export type EvidenceCode =
  | "PASSED"
  | "NOT_APPLICABLE"
  | "MISSING_DATA"
  | "MISSING_PREREQUISITE"
  | "MISSING_RUN"
  | "RUN_FAILED"
  | "RUN_INCOMPLETE"
  | "POSTING_INCOMPLETE"
  | "RECONCILIATION_INCOMPLETE"
  | "UNMATCHED_ITEMS"
  | "DISCREPANCY"
  | "CONTEXT_MISSING_ENTITY";

export interface PeriodCloseTaskDTO {
  id: string;
  taskCode: string;
  taskName: string;
  description: string | null;
  category: CloseTaskCategory;
  requiredBefore: CloseGateTarget;
  sortOrder: number;
  isMandatory: boolean;
  isWaivable: boolean;
  completionMode: CloseTaskCompletionMode;
  systemCheckHandler: string | null;
  defaultOwnerRole: string | null;
  slaHours: number | null;
  severity: CloseTaskSeverity | null;
  waiverRequiresApproval: boolean;
}

export interface PeriodCloseChecklistDTO {
  id: string;
  taskId: string;
  taskCode: string;
  taskStatus: ChecklistTaskStatus;
  isMandatory: boolean;
  assignedTo: string | null;
  assignedRole: string | null;
  assignedUserId: string | null;
  dueAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  evidencePayload: Record<string, unknown>;
  failureReason: string | null;
  failedAt: string | null;
  waiverStatus: WaiverStatus | null;
  waiverReason: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  // Handler observability
  lastHandlerRunAt: string | null;
  lastHandlerResult: HandlerResultDTO | null;
  handlerRunCount: number;
  // Task template info (denormalized for UI)
  task: PeriodCloseTaskDTO;
}

export interface HandlerResultDTO {
  passed: boolean;
  message: string;
  evidence: Record<string, unknown>;
  evidenceCode: EvidenceCode | null;
  nextSuggestedAction: string | null;
}

export interface CloseProgressDTO {
  totalTasks: number;
  completedCount: number;
  waivedCount: number;
  failedCount: number;
  blockedCount: number;
  inProgressCount: number;
  pendingCount: number;
  completionPct: number;
}

export interface CloseGateResultDTO {
  gatePassed: boolean;
  pendingCount: number;
  pendingTasks: string[];
}

export interface GateDenialDetailDTO {
  reasonCode: string;
  taskCode: string;
  taskName: string;
  taskStatus: ChecklistTaskStatus;
  category: CloseTaskCategory;
  completionMode: CloseTaskCompletionMode;
  assignedTo: string | null;
  actionHint: string | null;
}

// ---------------------------------------------------------------------------
// Close Orchestration Graph (Phase 5)
// ---------------------------------------------------------------------------

export type TaskReadinessState =
  | "NOT_READY"
  | "READY"
  | "IN_PROGRESS"
  | "SATISFIED"
  | "BLOCKED"
  | "FAILED"
  | "SKIPPED";

export type DependencySatisfactionResult =
  | "SATISFIED"
  | "UNSATISFIED"
  | "FAILED_BLOCKING"
  | "WAIVED_NOT_SUFFICIENT";

export interface CloseTaskNodeDTO {
  checklistId: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  category: CloseTaskCategory;
  requiredBefore: "SOFT_CLOSE" | "HARD_CLOSE";
  completionMode: CloseTaskCompletionMode;
  status: ChecklistTaskStatus;
  readinessState: TaskReadinessState;
  satisfactionState: DependencySatisfactionResult;
  predecessorTaskCodes: string[];
  successorTaskCodes: string[];
  blockedByTaskCodes: string[];
  downstreamImpactCount: number;
  estimatedDurationMinutes: number | null;
  severity: CloseTaskSeverity | null;
  orchestrationGroup: string | null;
  assignedRole: string | null;
  assignedUserId: string | null;
  dueAt: string | null;
  earliestStartAt: string | null;
  predictedFinishAt: string | null;
  activeSignalCount: number;
}

export interface CloseGraphDTO {
  nodes: CloseTaskNodeDTO[];
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

export interface ReadyTaskDTO {
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

export interface BlockerDTO {
  blockedTaskCode: string;
  blockedTaskName: string;
  blockerTaskCode: string;
  blockerTaskName: string;
  blockerStatus: ChecklistTaskStatus;
  blockerSatisfactionState: DependencySatisfactionResult;
  downstreamImpactCount: number;
  targetCloseImpact: "SOFT_CLOSE" | "HARD_CLOSE" | null;
}

export interface CriticalPathDTO {
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE" | null;
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

export interface ClosePredictionDTO {
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE";
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

// ---------------------------------------------------------------------------
// Close Orchestration Snapshot (Phase 6)
// ---------------------------------------------------------------------------

export type SnapshotSource =
  | "manual"
  | "scheduled"
  | "period_transition"
  | "auto_handler"
  | "api_call";

export interface CloseOrchestrationSnapshotDTO {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  snapshotAt: string;
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE";
  totalTasks: number;
  satisfiedCount: number;
  readyCount: number;
  blockedCount: number;
  failedCount: number;
  notReadyCount: number;
  inProgressCount: number;
  criticalPathMinutes: number;
  predictedReadyAt: string | null;
  blockerTaskCodes: string[];
  failedTaskCodes: string[];
  confidence: "low" | "medium" | "high";
  snapshotSource: SnapshotSource;
  computationVersion: string;
  triggeredBy: string;
}

export interface SnapshotTrendPointDTO {
  snapshotAt: string;
  snapshotSource: SnapshotSource;
  satisfiedCount: number;
  totalTasks: number;
  satisfactionPct: number;
  criticalPathMinutes: number;
  predictedReadyAt: string | null;
  confidence: "low" | "medium" | "high";
  blockedCount: number;
  failedCount: number;
  computationVersion: string;
  /** True when this snapshot's computation_version differs from the previous one in the series */
  versionChanged: boolean;
}

// ---------------------------------------------------------------------------
// Close Risk Signals (Phase 6.1)
// ---------------------------------------------------------------------------

export type CloseRiskRuleType =
  | "forecast_slipped"
  | "confidence_dropped"
  | "blocker_stale"
  | "failed_task_unresolved"
  | "ready_queue_aging"
  | "sla_warning"
  | "sla_breach"
  | "close_target_at_risk";

export type RiskSignalState =
  | "fired"
  | "acknowledged"
  | "resolved"
  | "suppressed";

export type SuppressionScope = "instance" | "rule_period" | "until_fingerprint_change";

export interface CloseRiskRuleDTO {
  id: string;
  entityCode: string;
  ruleCode: string;
  ruleName: string;
  description: string | null;
  ruleType: CloseRiskRuleType;
  parameters: Record<string, unknown>;
  severity: CloseTaskSeverity;
  escalationRole: string | null;
  cooldownMinutes: number;
  targetStatus: "SOFT_CLOSE" | "HARD_CLOSE" | null;
  isActive: boolean;
  sortOrder: number;
  autoResolveWhenClear: boolean;
  suppressionScope: SuppressionScope;
  // Phase 6.2: Escalation SLA policy
  acknowledgeSlaMinutes: number;
  resolveSlaMinutes: number;
  escalationEnabled: boolean;
  maxEscalationLevel: number;
  escalationIntervalMinutes: number;
}

export interface CloseRiskSignalDTO {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  ruleCode: string;
  ruleName: string;
  ruleType: CloseRiskRuleType;
  severity: CloseTaskSeverity;
  signalState: RiskSignalState;
  signalFingerprint: string | null;
  suppressionScope: SuppressionScope | null;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  firedAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  escalationRole: string | null;
  /** Hours since signal was fired */
  ageHours: number | null;
  // Phase 6.2: Escalation tracking
  escalationLevel: number;
  lastEscalatedAt: string | null;
}

export interface RiskSignalSummaryDTO {
  activeCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unacknowledgedCount: number;
  resolvedCount: number;
  suppressedCount: number;
  latestSignalAt: string | null;
}

export interface RiskEvaluationResultDTO {
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
    firedAt: string;
  }>;
  autoResolvedSignals: Array<{
    signalId: string;
    ruleCode: string;
    fingerprint: string;
  }>;
}

// ---------------------------------------------------------------------------
// Report Pack Engine
// ---------------------------------------------------------------------------

export type PackType =
  | "EXECUTIVE"
  | "MANAGEMENT"
  | "OPERATIONAL"
  | "COMPLIANCE"
  | "CUSTOM";

export type PackItemType =
  | "STATEMENT"
  | "COMPARISON"
  | "NARRATIVE"
  | "SEPARATOR"
  | "KPI";

export type PeriodMode =
  | "PTD"
  | "QTD"
  | "YTD"
  | "PRIOR_PERIOD"
  | "PRIOR_YEAR"
  | "ROLLING_12M";

export type VarianceSource =
  | "PRIOR_YEAR"
  | "BUDGET"
  | "FORECAST"
  | "PRIOR_PERIOD";

export type PackInstanceStatus =
  | "GENERATING"
  | "DRAFT"
  | "REVIEWED"
  | "APPROVED"
  | "FINALIZED"
  | "PUBLISHED"
  | "SUPERSEDED";

export type PackItemStatus =
  | "PENDING"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type CommentaryType =
  | "NARRATIVE"
  | "HIGHLIGHT"
  | "RISK"
  | "ACTION"
  | "APPROVAL_NOTE";

export interface PackDefinitionDTO {
  id: string;
  packCode: string;
  name: string;
  description: string | null;
  packType: PackType;
  defaultBookCode: string;
  defaultPeriodMode: PeriodMode;
  defaultVarianceSource: VarianceSource | null;
  dimensionCodes: string[] | null;
  version: number;
  scope: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PackItemDTO {
  id: string;
  packDefinitionId: string;
  itemCode: string;
  label: string;
  description: string | null;
  itemType: PackItemType;
  statementDefinitionId: string | null;
  compareBaseBook: string | null;
  compareTargetBook: string | null;
  varianceSource: VarianceSource | null;
  periodMode: PeriodMode | null;
  bookCode: string | null;
  dimensionTypeCode: string | null;
  dimensionValueCode: string | null;
  sortOrder: number;
  pageBreakBefore: boolean;
  showVariance: boolean;
  showPrior: boolean;
  showBudget: boolean;
  narrativeContent: string | null;
  isActive: boolean;
}

export interface PackInstanceDTO {
  id: string;
  packDefinitionId: string;
  packCode: string;
  packName: string;
  packVersion: number;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode: string;
  dimensionSetId: string | null;
  status: PackInstanceStatus;
  generatedAt: string;
  generatedBy: string | null;
  generationDurationMs: number | null;
  totalItems: number;
  itemsCompleted: number;
  varianceSource: VarianceSource | null;
  periodMode: PeriodMode | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  finalizedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  notes: string | null;
}

export interface PackInstanceItemDTO {
  id: string;
  packInstanceId: string;
  packItemId: string;
  itemCode: string;
  label: string;
  itemType: PackItemType;
  statementInstanceId: string | null;
  comparisonId: string | null;
  itemStatus: PackItemStatus;
  errorMessage: string | null;
  resolvedBookCode: string | null;
  resolvedPeriodMode: PeriodMode | null;
  resolvedVarianceSource: VarianceSource | null;
  resolvedPeriodFrom: number | null;
  resolvedPeriodTo: number | null;
  resolvedFiscalYear: number | null;
  sortOrder: number;
  narrativeContent: string | null;
  pageBreakBefore: boolean;
}

export interface ReportCommentaryDTO {
  id: string;
  targetKind: string;
  targetId: string;
  packInstanceItemId: string | null;
  statementLineCode: string | null;
  commentaryType: CommentaryType;
  title: string | null;
  body: string;
  version: number;
  isCurrent: boolean;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratePackInput {
  packDefinitionId: string;
  fiscalYear: number;
  periodFrom: number;
  periodTo: number;
  bookCode?: string;
  varianceSource?: VarianceSource;
  periodMode?: PeriodMode;
  dimensionSetId?: string;
  budgetCode?: string;
}

export interface CreateCommentaryInput {
  targetKind: string;
  targetId: string;
  packInstanceItemId?: string;
  statementLineCode?: string;
  commentaryType: CommentaryType;
  title?: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Pack Governance: Certification, Distribution, Forecast
// ---------------------------------------------------------------------------

export type CertificationStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "REVIEWED"
  | "APPROVED"
  | "CERTIFIED"
  | "REJECTED"
  | "INVALIDATED";

export interface PackCertificationDTO {
  id: string;
  packInstanceId: string;
  preparedBy: string | null;
  preparedByName: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  approvalInstanceId: string | null;
  certifiedBy: string | null;
  certifiedByName: string | null;
  certifiedAt: string | null;
  certificationNotes: string | null;
  certificationStatus: CertificationStatus;
  disclosureNotes: string | null;
}

export type DistributionFormat = "LINK" | "PDF" | "EXCEL" | "ZIP" | "EMAIL_BODY";

export type DistributionStatus =
  | "DRAFT"
  | "SENDING"
  | "SENT"
  | "PARTIAL"
  | "FAILED"
  | "RECALLED";

export type RecipientDeliveryStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "BOUNCED"
  | "FAILED";

export interface PackDistributionDTO {
  id: string;
  packInstanceId: string;
  distributionCode: string;
  name: string;
  description: string | null;
  format: DistributionFormat;
  certificationId: string | null;
  distributedBy: string | null;
  distributedAt: string;
  status: DistributionStatus;
  recalledBy: string | null;
  recalledAt: string | null;
  recallReason: string | null;
  recipientCount: number;
  deliveredCount: number;
  viewedCount: number;
  downloadedCount: number;
  secureLinkToken: string | null;
  linkExpiresAt: string | null;
  notes: string | null;
}

export interface PackDistributionRecipientDTO {
  id: string;
  distributionId: string;
  recipientId: string | null;
  recipientName: string;
  recipientEmail: string | null;
  recipientRole: string | null;
  deliveryStatus: RecipientDeliveryStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  firstDownloadedAt: string | null;
  downloadCount: number;
}

export type PackActivityType =
  | "PACK_GENERATED"
  | "ITEM_GENERATED"
  | "ITEM_FAILED"
  | "ITEM_SKIPPED"
  | "REVIEW_STARTED"
  | "REVIEW_COMPLETED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "CERTIFICATION_GRANTED"
  | "CERTIFICATION_REVOKED"
  | "STATUS_CHANGED"
  | "SUPERSEDED"
  | "DISTRIBUTION_CREATED"
  | "DISTRIBUTION_SENT"
  | "DISTRIBUTION_DOWNLOADED"
  | "DISTRIBUTION_VIEWED"
  | "COMMENTARY_ADDED"
  | "COMMENTARY_UPDATED"
  | "EXPORTED";

export interface PackActivityDTO {
  id: string;
  packInstanceId: string;
  activityType: PackActivityType;
  actorType: string;
  actorId: string | null;
  message: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CreateDistributionInput {
  packInstanceId: string;
  distributionCode: string;
  name: string;
  description?: string;
  format: DistributionFormat;
  recipients: RecipientInput[];
  notes?: string;
  linkExpiresAt?: string;
}

export interface RecipientInput {
  recipientId?: string;
  recipientName: string;
  recipientEmail?: string;
  recipientRole?: string;
}

export interface AdvanceCertificationInput {
  targetStatus: CertificationStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Financial Document Registry (unified document workbench)
// ---------------------------------------------------------------------------

export type FinancialDocType =
  | "PURCHASE_INVOICE"
  | "PAYMENT_ENTRY"
  | "JOURNAL_ENTRY"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "ACCRUAL"
  | "REVERSAL"
  | "RECLASS"
  | "TAX_DOC"
  | "ASSET_CAPITALIZATION"
  | "FX_REVALUATION"
  | "IC_ELIMINATION";

export type CanonicalDocStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "POSTING_PENDING"
  | "POSTED"
  | "PARTIALLY_SETTLED"
  | "SETTLED"
  | "REVERSED"
  | "VOIDED"
  | "CANCELLED"
  | "FAILED";

export type CounterpartyType =
  | "SUPPLIER"
  | "CUSTOMER"
  | "EMPLOYEE"
  | "INTERCOMPANY"
  | "INTERNAL";

export type ApprovalRoute =
  | "ZERO_APPROVAL"
  | "STANDARD"
  | "ENHANCED"
  | "EXECUTIVE"
  | "BLOCKED";

export interface FinancialDocumentDTO {
  id: string;
  docId: string;
  txnId: string;
  docType: FinancialDocType;
  docNo: string;
  entityCode: string;
  sourceModule: string;
  sourceTable: string;
  sourceRefId: string;
  status: CanonicalDocStatus;
  sourceStatus: string;
  docDate: string;
  postingDate: string | null;
  currencyCode: string;
  totalAmount: string;
  counterpartyType: CounterpartyType | null;
  counterpartyId: string | null;
  jeId: string | null;
  bookCode: string | null;
  postedAt: string | null;
  postedBy: string | null;
  reversedDocId: string | null;
  voidReasonCode: string | null;
  reversalReason: string | null;
  reversalAt: string | null;
  reversalBy: string | null;
  reversingDocId: string | null;
  approvalInstanceId: string | null;
  approvalRoute: ApprovalRoute | null;
  decisionScore: string | null;
  lastEventId: string | null;
  lastLifecycleAt: string | null;
  lastPostingEventAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialDocumentSummary {
  id: string;
  docType: FinancialDocType;
  docNo: string;
  entityCode: string;
  status: CanonicalDocStatus;
  sourceStatus: string;
  docDate: string;
  postingDate: string | null;
  currencyCode: string;
  totalAmount: string;
  counterpartyType: CounterpartyType | null;
  counterpartyId: string | null;
  counterpartyName?: string;
  jeId: string | null;
  postedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface FinancialDocumentFilters {
  entityCode?: string;
  docType?: FinancialDocType | FinancialDocType[];
  status?: CanonicalDocStatus | CanonicalDocStatus[];
  counterpartyType?: CounterpartyType;
  counterpartyId?: string;
  bookCode?: string;
  hasJeId?: boolean;
  approvalRoute?: ApprovalRoute;
  hasApprovalEvidence?: boolean;
  postingDateFrom?: string;
  postingDateTo?: string;
  docDateFrom?: string;
  docDateTo?: string;
  createdBy?: string;
  txnId?: string;
  search?: string;
}

export type PostingBridgeStatus = "POSTED" | "REVERSED" | "FAILED";

export interface FinancialDocumentPostingDTO {
  id: string;
  docId: string;
  bookCode: string;
  jeId: string;
  postingRuleId: string | null;
  postingStatus: PostingBridgeStatus;
  postedAt: string | null;
  postedBy: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  createdAt: string;
}

export type PostingInconsistencyType =
  | "POSTED_NO_JE"
  | "JE_EXISTS_BUT_NOT_POSTED"
  | "JE_REVERSED_DOC_NOT"
  | "ENTITY_MISMATCH"
  | "POSTED_IN_CLOSED_PERIOD"
  | "FUTURE_POSTING_DATE"
  | "INCOMPLETE_MULTIBOOK"
  | "ACCRUAL_MISSING_REVERSAL"
  | "RECLASS_MISSING_APPROVAL"
  | "DN_WITHOUT_INVOICE"
  | "FX_ZERO_GAIN_LOSS"
  | "FX_REVAL_AFTER_CLOSE"
  | "IC_ENTITY_MISMATCH"
  | "IC_UNBALANCED";

export interface PostingInconsistencyDTO {
  document: FinancialDocumentSummary;
  inconsistencyType: PostingInconsistencyType;
  detail?: string;
}

export interface RegistryStatsDTO {
  totalDocuments: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byApprovalRoute: Record<string, number>;
  unpostedApproved: number;
  postedWithoutJe: number;
  recentlyReversed: number;
  approvedWithoutScoring: number;
}

// ---------------------------------------------------------------------------
// Forecast Scenarios
// ---------------------------------------------------------------------------

export type ScenarioType =
  | "BASE"
  | "OPTIMISTIC"
  | "PESSIMISTIC"
  | "STRETCH"
  | "CUSTOM";

export type ScenarioStatus = "DRAFT" | "ACTIVE" | "FROZEN" | "ARCHIVED";

export interface ForecastScenarioDTO {
  id: string;
  scenarioCode: string;
  name: string;
  description: string | null;
  scenarioType: ScenarioType;
  baseBudgetCode: string | null;
  version: number;
  assumptions: Record<string, unknown>;
  status: ScenarioStatus;
  isActive: boolean;
}

export interface ForecastLineDTO {
  id: string;
  scenarioId: string;
  forecastCode: string;
  forecastVersion: number;
  accountId: string;
  accountCode: string;
  fiscalYear: number;
  periodNumber: number;
  bookCode: string;
  forecastAmount: string;
  driverType: string | null;
  driverValue: string | null;
  isApproved: boolean;
}

// ---------------------------------------------------------------------------
// Close Command Center — Document-aware close readiness
// ---------------------------------------------------------------------------

export type CloseDocumentReadiness =
  | "READY"
  | "DEFECT_FAILED"
  | "DEFECT_APPROVED_NOT_POSTED"
  | "DEFECT_UNFINALIZED"
  | "DEFECT_POSTING_PENDING"
  | "UNKNOWN";

export type DefectSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface CloseDocumentSummaryDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  totalDocuments: number;
  readyDocuments: number;
  defectDocuments: number;
  readinessPercent: number;
  byDocType: CloseDocTypeBreakdownDTO[];
  highSeverityDefects: number;
  mediumSeverityDefects: number;
  lowSeverityDefects: number;
  defectTotalAmount: string;
  allReady: boolean;
}

export interface CloseDocTypeBreakdownDTO {
  docType: FinancialDocType;
  totalCount: number;
  readyCount: number;
  defectCount: number;
  readinessPercent: number;
  defects: {
    failed: number;
    approvedNotPosted: number;
    unfinalized: number;
    postingPending: number;
  };
}

export interface CloseDocumentDefectDTO {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  sourceStatus: string;
  postingDate: string | null;
  totalAmount: string;
  currencyCode: string;
  defectType: CloseDocumentReadiness;
  defectSeverity: DefectSeverity;
}

export interface AccrualReversalGapDTO {
  accrualId: string;
  docNo: string;
  postingDate: string;
  totalAmount: string;
  currencyCode: string;
  reversalDate: string;
  status: string;
  fiscalYear: number;
  periodNumber: number;
  reversalUrgency: "REVERSAL_DUE_THIS_PERIOD" | "REVERSAL_DUE_FUTURE";
}

export interface PostingGapDTO {
  docRegistryId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  totalAmount: string;
  currencyCode: string;
  approvalRoute: ApprovalRoute | null;
  hoursSinceUpdate: number;
}

// ---------------------------------------------------------------------------
// Phase 8B: Enhanced Close Command Center DTOs
// ---------------------------------------------------------------------------

export type BookReadiness = "READY" | "DEFECT_BOOK_POSTING_FAILED" | "DEFECT_BOOK_MISSING";

export interface BookPostingSummaryDTO {
  bookCode: string;
  docType: FinancialDocType;
  docCount: number;
  readyCount: number;
  failedCount: number;
  missingCount: number;
}

export type ReversalAlignment = "REVERSAL_MISSING" | "REVERSAL_DIFFERENT_PERIOD" | "REVERSAL_SAME_PERIOD";

export interface ReversedStillCountedDTO {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  totalAmount: string;
  currencyCode: string;
  postingDate: string | null;
  reversedDocId: string;
  fiscalYear: number;
  periodNumber: number;
  reversalAlignment: ReversalAlignment;
}

export type ApprovalGapType = "NO_APPROVAL_EVIDENCE" | "NO_DECISION_SCORE" | "PARTIAL";

export interface ApprovalEvidenceGapDTO {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  postingDate: string | null;
  totalAmount: string;
  currencyCode: string;
  approvalRoute: string | null;
  gapType: ApprovalGapType;
}

export type AgingBucket = "CRITICAL" | "OVERDUE" | "AGING" | "RECENT";

export interface DefectAgingDTO {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  canonicalStatus: CanonicalDocStatus;
  defectType: CloseDocumentReadiness;
  defectSeverity: DefectSeverity;
  totalAmount: string;
  currencyCode: string;
  hoursInDefect: number;
  agingBucket: AgingBucket;
  defectSince: string;
}

export interface DocumentReadinessTrendDTO {
  fiscalYear: number;
  periodNumber: number;
  totalDocuments: number;
  readyCount: number;
  defectCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  readinessPct: number;
  defectTotalAmount: string;
}

// ---------------------------------------------------------------------------
// Phase 8C: Health Score, Reconciliation, Remediation DTOs
// ---------------------------------------------------------------------------

export type HealthRating = "GREEN" | "AMBER" | "RED" | "NOT_APPLICABLE";

export interface DocumentHealthScoreDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  totalDocuments: number;
  readyDocuments: number;
  highDefects: number;
  mediumDefects: number;
  lowDefects: number;
  readinessPenalty: number;
  severityPenalty: number;
  agingPenalty: number;
  reconPenalty: number;
  approvalPenalty: number;
  healthScore: number;
  healthRating: HealthRating;
}

export type PostingReconciliationFindingType =
  | "POSTED_NO_JE"
  | "JE_REVERSED_DOC_NOT"
  | "AMOUNT_MISMATCH"
  | "INCOMPLETE_MULTIBOOK";

export interface PostingReconciliationFindingDTO {
  docRegistryId: string;
  docId: string;
  docType: FinancialDocType;
  docNo: string;
  docAmount: string;
  currencyCode: string;
  findingType: PostingReconciliationFindingType;
  findingSeverity: "HIGH" | "MEDIUM" | "LOW";
  findingDetail: string;
  postingDate: string | null;
}

export interface PostingReconciliationSummaryDTO {
  totalFindings: number;
  highFindings: number;
  mediumFindings: number;
  postedNoJeCount: number;
  jeReversedDocNotCount: number;
  amountMismatchCount: number;
  incompleteMultibookCount: number;
}

export type RemediationActionType =
  | "REPOST_DOCUMENT"
  | "GENERATE_REVERSAL_JE"
  | "POST_TO_BOOK"
  | "REQUEST_REAPPROVAL"
  | "FILL_APPROVAL_EVIDENCE"
  | "MARK_VOID"
  | "WAIVE_DEFECT"
  | "MANUAL_CORRECTION";

export type RemediationStatus =
  | "SUGGESTED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type RemediationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface RemediationActionDTO {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  sourceType: string;
  sourceRef: string | null;
  docId: string | null;
  docType: FinancialDocType | null;
  docNo: string | null;
  actionType: RemediationActionType;
  actionDetail: Record<string, unknown>;
  priority: RemediationPriority;
  status: RemediationStatus;
  suggestedBy: string | null;
  suggestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  executedBy: string | null;
  executedAt: string | null;
  rejectionReason: string | null;
  failureReason: string | null;
}

export interface RemediationSummaryDTO {
  totalActions: number;
  suggestedCount: number;
  approvedCount: number;
  executingCount: number;
  completedCount: number;
  rejectedCount: number;
  failedCount: number;
  criticalCount: number;
  highCount: number;
}

// ---------------------------------------------------------------------------
// Phase 8D: Campaigns & Previews
// ---------------------------------------------------------------------------

export type CampaignStatusDTO =
  | "DRAFT"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "CANCELLED";

export type PlaybookRiskLevelDTO = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RemediationActionTypeDTO = RemediationActionType;
export type RemediationPriorityDTO = RemediationPriority;

export interface RemediationCampaignDTO {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  campaignName: string;
  description: string | null;
  actionType: RemediationActionTypeDTO;
  priorityFilter: RemediationPriorityDTO | null;
  status: CampaignStatusDTO;
  totalActions: number;
  completedActions: number;
  failedActions: number;
  riskLevel: PlaybookRiskLevelDTO | null;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  completedAt: string | null;
}

export interface CampaignProgressDTO {
  campaignId: string;
  campaignName: string;
  actionType: RemediationActionTypeDTO;
  campaignStatus: CampaignStatusDTO;
  riskLevel: PlaybookRiskLevelDTO | null;
  totalActions: number;
  completedActions: number;
  failedActions: number;
  liveTotal: number;
  liveCompleted: number;
  liveFailed: number;
  liveExecuting: number;
  livePending: number;
  completionPct: number;
}

export interface PrerequisiteCheckResultDTO {
  checkCode: string;
  description: string;
  passed: boolean;
  detail?: string;
}

export interface PredictedSideEffectDTO {
  description: string;
  affectedEntities: string[];
  severity: "INFO" | "WARNING" | "CAUTION";
  affectedRecordCount?: number;
}

export interface PlaybookStepDTO {
  order: number;
  code: string;
  description: string;
  type: string;
  reversible: boolean;
  rollbackDescription?: string;
}

export interface RemediationPlaybookDTO {
  actionType: RemediationActionTypeDTO;
  displayName: string;
  description: string;
  riskLevel: PlaybookRiskLevelDTO;
  isReversible: boolean;
  requiredApprovalRole: string;
  steps: PlaybookStepDTO[];
  estimatedDurationSeconds: number;
  supportsBatch: boolean;
  maxBatchSize: number | null;
}

export interface RemediationPreviewDTO {
  actionId: string;
  actionType: RemediationActionTypeDTO;
  playbook: RemediationPlaybookDTO;
  docId: string | null;
  docNo: string | null;
  docType: string | null;
  prerequisiteResults: PrerequisiteCheckResultDTO[];
  allPrerequisitesMet: boolean;
  predictedSideEffects: PredictedSideEffectDTO[];
  impactSummary: string;
  canExecute: boolean;
  blockingReasons: string[];
}

// ---------------------------------------------------------------------------
// Phase 9A: Close Control Tower
// ---------------------------------------------------------------------------

export type SlaStatusDTO = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";
export type CloseRunStatusDTO = "OPEN" | "IN_PROGRESS" | "SOFT_CLOSED" | "HARD_CLOSED" | "REOPENED";
export type CloseTypeDTO = "MONTH_END" | "QUARTER_END" | "YEAR_END" | "INTERIM";
export type HealthRatingDTO = "GREEN" | "AMBER" | "RED" | "NOT_APPLICABLE";

export interface CloseExecutiveSummaryDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runId: string;
  runStatus: CloseRunStatusDTO;
  runNumber: number;
  startedAt: string | null;
  softClosedAt: string | null;
  hardClosedAt: string | null;
  // SLA
  closeType: CloseTypeDTO | null;
  closeStartDate: string | null;
  softCloseTarget: string | null;
  hardCloseTarget: string | null;
  softCloseActual: string | null;
  hardCloseActual: string | null;
  slaStatus: SlaStatusDTO | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  targetWorkingDays: number | null;
  actualWorkingDays: number | null;
  // Readiness
  readinessScore: number | null;
  completionPct: number | null;
  totalTasks: number | null;
  completedCount: number | null;
  lastSnapshotAt: string | null;
  // Overrides
  totalOverrides: number;
  pendingOverrides: number;
  approvedOverrides: number;
  overrideImpactTotal: string; // MC-4
  // Exceptions
  totalExceptions: number;
  openExceptions: number;
  criticalExceptions: number;
  resolvedExceptions: number;
  // Document Health
  docHealthScore: number | null;
  docHealthRating: HealthRatingDTO | null;
  // Remediation
  remediationTotal: number;
  remediationPending: number;
  remediationCompleted: number;
  remediationFailed: number;
}

export type OverrideScopeDTO = "TASK" | "CATEGORY" | "GATE";
export type OverrideReasonDTO =
  | "IMMATERIAL"
  | "TIMING"
  | "EXTERNAL_DELAY"
  | "SYSTEM_ISSUE"
  | "PROCESS_GAP"
  | "MANAGEMENT_JUDGEMENT"
  | "REGULATORY"
  | "OTHER";
export type OverrideStatusDTO = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED";

export interface OverridePostureDTO {
  overrideId: string;
  overrideScope: OverrideScopeDTO;
  reasonCode: OverrideReasonDTO;
  reasonDetail: string | null;
  status: OverrideStatusDTO;
  impactAmount: string | null; // MC-4
  impactCurrency: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  taskCode: string | null;
  taskName: string | null;
  taskCategory: string | null;
}

export interface OverridePostureSummaryDTO {
  totalOverrides: number;
  activeOverrides: number;
  taskOverrides: number;
  categoryOverrides: number;
  gateOverrides: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  closedCount: number;
  reasonBreakdown: {
    immaterial: number;
    timing: number;
    externalDelay: number;
    systemIssue: number;
    processGap: number;
    managementJudgement: number;
    regulatory: number;
    other: number;
  };
  activeImpactTotal: string; // MC-4
  approvedImpactTotal: string; // MC-4
}

export interface SlaPerformanceTrendDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  closeType: CloseTypeDTO;
  periodEndDate: string;
  softCloseTarget: string;
  hardCloseTarget: string;
  softCloseActual: string | null;
  hardCloseActual: string | null;
  slaStatus: SlaStatusDTO;
  softCloseDays: number | null;
  softCloseMet: boolean | null;
  hardCloseDays: number | null;
  hardCloseMet: boolean | null;
  targetWorkingDays: number | null;
  actualWorkingDays: number | null;
  finalReadinessScore: number | null;
  runStatus: CloseRunStatusDTO | null;
}

// ---------------------------------------------------------------------------
// Phase 9C: Close Certification Pack
// ---------------------------------------------------------------------------

export type CertificationStatusDTO =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "CERTIFIED"
  | "CFO_ATTESTED"
  | "SUPERSEDED"
  | "REVOKED";

export type CertificationTypeDTO =
  | "STANDARD"
  | "WITH_EXCEPTIONS"
  | "QUALIFIED"
  | "INTERIM";

export interface CloseCertificationDTO {
  id: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runId: string;
  certCode: string;
  certVersion: number;
  status: CertificationStatusDTO;
  certType: CertificationTypeDTO;
  contentHash: string | null;
  assembledAt: string | null;
  // Controller sign-off
  certifiedBy: string | null;
  certifiedAt: string | null;
  controllerNotes: string | null;
  // CFO attestation
  attestedBy: string | null;
  attestedAt: string | null;
  attestationNotes: string | null;
  // Supersession
  supersededBy: string | null;
  supersededAt: string | null;
  supersessionReason: string | null;
  // Revocation
  revokedBy: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  // KPI snapshot
  readinessScore: number | null;
  slaStatus: SlaStatusDTO | null;
  totalTasks: number | null;
  completedTasks: number | null;
  waivedTasks: number | null;
  failedTasks: number | null;
  totalOverrides: number;
  overrideImpact: string; // MC-4
  totalExceptions: number;
  openExceptions: number;
  docHealthScore: number | null;
  remediationTotal: number;
  remediationOpen: number;
  isCleanClose: boolean;
  createdAt: string;
}

export interface CloseTaskEvidenceDTO {
  taskCode: string;
  taskName: string;
  category: CloseTaskCategory;
  requiredBefore: CloseGateTarget;
  completionMode: CloseTaskCompletionMode;
  isMandatory: boolean;
  isWaivable: boolean;
  severity: CloseTaskSeverity | null;
  taskStatus: ChecklistTaskStatus;
  assignedTo: string | null;
  assignedRole: string | null;
  dueAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  evidencePayload: Record<string, unknown>;
  failureReason: string | null;
  failedAt: string | null;
  waiverStatus: WaiverStatus | null;
  waiverReason: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  lastHandlerRunAt: string | null;
  lastHandlerResult: HandlerResultDTO | null;
  handlerRunCount: number;
  hoursToComplete: number | null;
  withinSla: boolean | null;
}

export interface CloseExceptionRegisterDTO {
  exceptionId: string;
  exceptionCode: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  rootCause: string | null;
  impactDescription: string | null;
  impactAmount: string | null; // MC-4
  impactCurrency: string | null;
  raisedBy: string | null;
  raisedAt: string | null;
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

export interface CloseOverrideRegisterDTO extends OverridePostureDTO {
  lastActivity: string | null;
  lastActivityAt: string | null;
  lastActivityBy: string | null;
  lastActivityNotes: string | null;
}

export interface CloseSlaComplianceDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  closeType: CloseTypeDTO;
  periodEndDate: string;
  closeStartDate: string;
  softCloseTarget: string;
  hardCloseTarget: string;
  softCloseActual: string | null;
  hardCloseActual: string | null;
  targetWorkingDays: number | null;
  actualWorkingDays: number | null;
  slaStatus: SlaStatusDTO;
  softCloseMet: boolean | null;
  hardCloseMet: boolean | null;
  daysElapsed: number;
  daysRemaining: number;
}

export interface CloseCertificationPackDTO {
  certification: CloseCertificationDTO;
  taskEvidence: CloseTaskEvidenceDTO[];
  exceptions: CloseExceptionRegisterDTO[];
  overrides: CloseOverrideRegisterDTO[];
  slaCompliance: CloseSlaComplianceDTO | null;
  exportedAt: string;
  exportId: string;
  contentHash: string | null;
}

export interface AssembleCertificationInput {
  certType?: CertificationTypeDTO;
  controllerNotes?: string;
}

export interface CertifyCloseInput {
  certifiedBy: string;
  controllerNotes?: string;
}

export interface AttestCloseInput {
  attestedBy: string;
  attestationNotes?: string;
}

// ---------------------------------------------------------------------------
// Phase 9B: Predictive Close Intelligence
// ---------------------------------------------------------------------------

export type RiskTierDTO = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ForecastStatusDTO = "COMPLETE" | "AT_RISK" | "IN_PROGRESS" | "ON_TRACK";
export type OverridePatternDTO =
  | "GATE_BREACH_CORRELATION"
  | "GATE_OVERRIDE_PRESENT"
  | "HIGH_OVERRIDE_BREACH"
  | "HIGH_OVERRIDE_COUNT"
  | "BREACH_NO_OVERRIDES"
  | "NORMAL";
export type SampleConfidenceDTO = "HIGH" | "MEDIUM" | "LOW";

export interface SlaBreachForecastDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runStatus: CloseRunStatusDTO;
  closeType: CloseTypeDTO;
  softCloseTarget: string;
  hardCloseTarget: string;
  softPredictedAt: string | null;
  softConfidence: string | null;
  hardPredictedAt: string | null;
  hardConfidence: string | null;
  criticalPathMinutes: number | null;
  totalTasks: number | null;
  satisfiedCount: number | null;
  blockedCount: number | null;
  failedCount: number | null;
  completionPct: number;
  hardCloseBufferHours: number | null;
  softCloseBufferHours: number | null;
  hardCloseBreachPct: number;
  softCloseBreachPct: number;
  riskTier: RiskTierDTO;
  lastSnapshotAt: string | null;
  slippageCount: number;
  totalSnapshots: number;
}

export interface CrossEntityRiskDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runStatus: CloseRunStatusDTO;
  closeType: CloseTypeDTO | null;
  slaStatus: SlaStatusDTO | null;
  daysRemaining: number | null;
  readinessScore: number | null;
  completionPct: number | null;
  totalOverrides: number;
  pendingOverrides: number;
  overrideImpactTotal: string; // MC-4
  totalExceptions: number;
  openExceptions: number;
  criticalExceptions: number;
  docHealthScore: number | null;
  docHealthRating: HealthRatingDTO | null;
  remediationTotal: number;
  remediationPending: number;
  activeSignalCount: number;
  criticalSignalCount: number;
  compositeRiskScore: number;
  riskRank: number;
}

export interface DefectDelayCorrelationDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  closeType: CloseTypeDTO | null;
  runStatus: CloseRunStatusDTO | null;
  totalDocs: number;
  unpostedCount: number;
  missingJeCount: number;
  reversedCount: number;
  blockedApprovalCount: number;
  unpostedRate: number;
  missingJeRate: number;
  reversalRate: number;
  blockedApprovalRate: number;
  slaMet: boolean | null;
  actualCloseDays: number | null;
  targetWorkingDays: number | null;
  daysOverTarget: number | null;
  healthScore: number | null;
  healthRating: HealthRatingDTO | null;
}

export interface RemediationCompletionForecastDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  campaignStatus: string;
  totalActions: number;
  completedActions: number;
  executingActions: number;
  approvedActions: number;
  suggestedActions: number;
  failedActions: number;
  rejectedActions: number;
  completionPct: number;
  resolvedPct: number;
  completionProbability: number;
  forecastStatus: ForecastStatusDTO;
}

export interface OverrideFailureCorrelationDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runStatus: CloseRunStatusDTO;
  slaBreached: boolean;
  wasReopened: boolean;
  totalOverrides: number;
  gateOverrides: number;
  categoryOverrides: number;
  taskOverrides: number;
  reasonImmaterial: number;
  reasonTiming: number;
  reasonSystemic: number;
  reasonJudgement: number;
  totalImpact: string; // MC-4
  patternClassification: OverridePatternDTO;
  closeFailed: boolean;
}

export interface ActionEffectivenessDTO {
  entityCode: string;
  triggerType: string;
  actionType: string;
  executionMode: string;
  totalActions: number;
  executedCount: number;
  acceptedCount: number;
  dismissedCount: number;
  effectiveCount: number;
  ineffectiveCount: number;
  pendingOutcomeCount: number;
  effectivenessPct: number | null;
  acceptancePct: number | null;
  avgDecisionHours: number | null;
  sampleConfidence: SampleConfidenceDTO;
}

export interface PredictiveCloseIntelligenceDTO {
  breachForecasts: SlaBreachForecastDTO[];
  entityRiskRanking: CrossEntityRiskDTO[];
  defectCorrelations: DefectDelayCorrelationDTO[];
  remediationForecasts: RemediationCompletionForecastDTO[];
  overridePatterns: OverrideFailureCorrelationDTO[];
  actionEffectiveness: ActionEffectivenessDTO[];
}

// ===========================================================================
// Phase 10 — Autonomous Close Advisor DTOs
// ===========================================================================

export type PostureAssessmentDTO = "ELEVATED" | "WATCH" | "NORMAL";
export type PredictionTrendDTO = "SLIPPING" | "IMPROVING" | "STABLE" | "NO_HISTORY";
export type ConfidenceTrendDTO = "IMPROVING" | "DEGRADING" | "STABLE" | "CHANGED" | "NO_HISTORY";
export type ForecastAssessmentDTO = "WILL_BREACH" | "CRITICAL" | "TIGHT" | "ADEQUATE" | "COMFORTABLE" | "NO_PREDICTION";
export type RiskColorDTO = "RED" | "AMBER" | "GREEN";
export type AlertTypeDTO = "RISK_SIGNAL" | "RECOMMENDATION" | "ANOMALY" | "EXCEPTION" | "CERTIFICATION_GAP";

/** 1. Advisor Remediation Campaign — ranked by urgency */
export interface AdvisorRemediationCampaignDTO {
  campaignId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  campaignName: string;
  actionType: string;
  campaignStatus: string;
  riskLevel: string | null;
  totalActions: number;
  liveCompleted: number;
  liveFailed: number;
  liveExecuting: number;
  livePending: number;
  completionPct: number;
  completionProbability: number;
  forecastStatus: string;
  slaBreachPct: number;
  hardCloseBufferHours: number | null;
  slaRiskTier: RiskTierDTO;
  urgencyScore: number;
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  completedAt: string | null;
}

/** 2. Advisor Defect Queue — auto-prioritized pending actions */
export interface AdvisorDefectQueueItemDTO {
  actionId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  policyCode: string;
  policyName: string;
  triggerType: string;
  actionType: string;
  severity: string;
  priority: number;
  executionMode: string;
  actionParams: Record<string, unknown>;
  triggerContext: Record<string, unknown>;
  proposedAt: string;
  slaBreachPct: number;
  slaRiskTier: RiskTierDTO;
  bottleneckPattern: string | null;
  bottleneckFrequencyPct: number | null;
  status: RemediationStatus;
  hoursPending: number;
  queuePriorityScore: number;
}

/** 3. Advisor Completion Forecast — predicted close date vs targets */
export interface AdvisorCompletionForecastDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runStatus: CloseRunStatusDTO;
  closeType: CloseTypeDTO | null;
  startedAt: string | null;
  softCloseTarget: string | null;
  hardCloseTarget: string | null;
  targetWorkingDays: number | null;
  hardPredictedAt: string | null;
  hardConfidence: string | null;
  criticalPathMinutes: number | null;
  softPredictedAt: string | null;
  softConfidence: string | null;
  totalTasks: number | null;
  satisfiedCount: number | null;
  blockedCount: number | null;
  failedCount: number | null;
  completionPct: number;
  hardBufferHours: number | null;
  softBufferHours: number | null;
  predictionTrend: PredictionTrendDTO;
  trendShiftHours: number | null;
  confidenceTrend: ConfidenceTrendDTO;
  hardBreachPct: number;
  softBreachPct: number;
  riskTier: RiskTierDTO;
  slippageCount: number;
  forecastAssessment: ForecastAssessmentDTO;
  lastSnapshotAt: string | null;
  prevSnapshotAt: string | null;
}

/** 4. Advisor Override Posture — current vs suggested limits */
export interface AdvisorOverridePostureDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  totalOverrides: number;
  pendingOverrides: number;
  approvedOverrides: number;
  gateOverrides: number;
  overrideImpactTotal: string; // MC-4
  avgOverridesHistorical: number;
  p75OverridesHistorical: number;
  p90OverridesHistorical: number;
  avgImpactHistorical: string; // MC-4
  p75ImpactHistorical: string; // MC-4
  historicalPeriodCount: number;
  suggestedOverrideLimit: number;
  suggestedOverrideMax: number;
  suggestedImpactLimit: string; // MC-4
  spikeSeverity: string | null;
  overrideSpikeZ: number | null;
  postureAssessment: PostureAssessmentDTO;
  aboveSuggestedLimit: boolean;
  aboveMaxLimit: boolean;
}

/** 5. Advisor Entity Heatmap — color-tiered cross-entity risk grid */
export interface AdvisorEntityHeatmapDTO {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  runStatus: CloseRunStatusDTO;
  closeType: CloseTypeDTO | null;
  slaStatus: SlaStatusDTO | null;
  daysRemaining: number | null;
  readinessScore: number | null;
  completionPct: number | null;
  compositeRiskScore: number;
  riskRank: number;
  riskColor: RiskColorDTO;
  totalOverrides: number;
  pendingOverrides: number;
  overrideImpactTotal: string; // MC-4
  totalExceptions: number;
  openExceptions: number;
  criticalExceptions: number;
  docHealthScore: number | null;
  docHealthRating: HealthRatingDTO | null;
  activeSignalCount: number;
  criticalSignalCount: number;
  remediationTotal: number;
  remediationPending: number;
  breachProbability: number;
  breachRiskTier: RiskTierDTO;
  hardCloseBufferHours: number | null;
  slippageCount: number | null;
  topBottleneckTask: string | null;
  bottleneckPattern: string | null;
}

/** 6. Advisor Controller Alert — unified alert inbox item */
export interface AdvisorControllerAlertDTO {
  alertId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  alertType: AlertTypeDTO;
  alertSeverity: string;
  alertTitle: string;
  alertDetail: string | null;
  alertAt: string;
  alertState: string;
  escalationLevel: number;
  sortPriority: number;
}

/** Full Autonomous Close Advisor bundle */
export interface AutonomousCloseAdvisorDTO {
  remediationCampaigns: AdvisorRemediationCampaignDTO[];
  defectQueue: AdvisorDefectQueueItemDTO[];
  completionForecast: AdvisorCompletionForecastDTO | null;
  overridePosture: AdvisorOverridePostureDTO | null;
  entityHeatmap: AdvisorEntityHeatmapDTO[];
  controllerAlerts: AdvisorControllerAlertDTO[];
}

// ===========================================================================
// Phase 11B — Role-Aware Conversational Close Copilot DTOs
// ===========================================================================

export type CopilotRoleDTO = "CONTROLLER" | "CFO" | "CLOSE_MANAGER" | "ACCOUNTANT";

export type CopilotQuestionType =
  | "WHY_RED"
  | "TODAY_ACTIONS"
  | "BREACH_RISK"
  | "WHAT_CHANGED"
  | "EXECUTIVE_SUMMARY"
  | "REMEDIATE_GAPS"
  | "BATCH_OVERDUE"
  | "EXPORT_AND_REVIEW"
  | "NARRATIVE_CONTROLLER"
  | "NARRATIVE_CFO"
  | "NARRATIVE_AUDIT"
  | "NARRATIVE_BOARD"
  | "PROPOSE_CAMPAIGNS"
  | "SIMULATE_CLOSE"
  | "ROOT_CAUSE_ANALYSIS"
  | "ORCHESTRATE_CLOSE"
  | "CUSTOM";

/** Action the target component should perform on drill-through */
export type CopilotDrillAction =
  | { type: "highlight_item" }
  | { type: "accept_defect"; actionId: string }
  | { type: "dismiss_defect"; actionId: string }
  | { type: "trigger_export" }
  | { type: "prefill_campaign"; actionIds: string[]; campaignName?: string }
  | { type: "filter_view"; severity?: string; slaRiskTier?: string }
  | { type: "trigger_narrative_export"; audience: NarrativeAudience }
  | { type: "launch_suggested_campaign"; suggestion: CampaignSuggestion };

/** Navigation target for copilot drill-through */
export interface CopilotDrillTarget {
  /** Main tab in CloseControlTower */
  tab: string;
  /** Sub-tab within the target component */
  subTab?: string;
  /** Entity to focus on (if different from current) */
  entityCode?: string;
  /** Specific item to highlight/scroll-to */
  focusId?: string;
  /** Action to perform on arrival */
  action?: CopilotDrillAction;
}

/** A single piece of evidence backing a copilot statement */
export interface CopilotEvidence {
  source: string;        // e.g. "risk_signal", "anomaly", "override", "breach_forecast"
  label: string;         // human-readable label
  severity?: string;     // critical | high | medium | low | info
  value?: string;        // metric value
  referenceId?: string;  // UUID for drill-down
  drillTarget?: CopilotDrillTarget;
}

/** A structured section within a copilot answer */
export interface CopilotAnswerSection {
  heading: string;
  content: string;       // template-generated text
  evidence: CopilotEvidence[];
  severity?: "critical" | "high" | "medium" | "info";
  drillTarget?: CopilotDrillTarget;
  /** Step number for multi-step conversational flows (1-based) */
  stepNumber?: number;
}

/** A recommended action from the copilot */
export interface CopilotAction {
  priority: number;
  title: string;
  rationale: string;
  actionType?: string;   // maps to close_action_log.action_type
  ownerRole: CopilotRoleDTO;
  estimatedImpact?: string;
  drillTarget?: CopilotDrillTarget;
}

/** A single copilot message (question or answer) */
export interface CopilotMessage {
  id: string;
  role: "user" | "copilot";
  questionType?: CopilotQuestionType;
  text: string;
  sections?: CopilotAnswerSection[];
  actions?: CopilotAction[];
  metadata?: {
    entityCode: string;
    fiscalYear: number;
    periodNumber: number;
    generatedAt: string;
    deterministic: boolean;
  };
}

/** Copilot conversation state */
export interface CopilotConversation {
  messages: CopilotMessage[];
  loading: boolean;
  error: string | null;
}

// ===========================================================================
// Phase 12A — Freeform Natural Language Intent Parser DTOs
// ===========================================================================

/** Parsed intent from freeform natural language input */
export interface CopilotParsedIntent {
  /** Resolved question type */
  questionType: CopilotQuestionType;
  /** Confidence score 0–1 (1 = exact keyword match, <0.5 = fallback) */
  confidence: number;
  /** Entity code extracted from input (e.g. "MY" from "Malaysia") */
  entityHint?: string;
  /** Severity filter extracted (e.g. "critical" from "critical gaps") */
  severityHint?: string;
  /** Period hint extracted (e.g. "P3" from "period 3") */
  periodHint?: number;
  /** Fiscal year hint extracted */
  fiscalYearHint?: number;
  /** Original freeform text */
  originalText: string;
  /** Generated display label for the question */
  displayLabel: string;
  /** Debug trace — which rule matched */
  matchRule: string;
}

// ===========================================================================
// Phase 12B — Narrative Pack Generator DTOs
// ===========================================================================

/** Target audience for narrative generation */
export type NarrativeAudience = "CONTROLLER" | "CFO" | "AUDIT_COMMITTEE" | "BOARD";

/** A single narrative section (paragraph with optional evidence) */
export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
  keyMetrics?: { label: string; value: string; trend?: "up" | "down" | "flat" }[];
  severity?: "critical" | "high" | "medium" | "info";
}

/** Complete narrative brief for a specific audience */
export interface NarrativeBrief {
  audience: NarrativeAudience;
  title: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  generatedAt: string;
  deterministic: boolean;
  /** Executive summary paragraph */
  summary: string;
  /** Structured narrative sections */
  sections: NarrativeSection[];
  /** Key takeaways (bullet points) */
  takeaways: string[];
  /** Risk items requiring attention */
  riskItems: { severity: string; title: string; detail: string }[];
}

// ===========================================================================
// Phase 12C — Advisor Auto-Campaign Drafting DTOs
// ===========================================================================

/** A cluster of related defects that can form a campaign */
export interface CampaignSuggestion {
  /** Unique key for this suggestion (actionType + entityCode) */
  key: string;
  /** Action type all items share (campaign constraint) */
  actionType: string;
  /** Entity this suggestion applies to */
  entityCode: string;
  /** Proposed campaign name */
  campaignName: string;
  /** Defect action IDs in this cluster */
  actionIds: string[];
  /** Total items in cluster */
  itemCount: number;
  /** Count of critical severity items */
  criticalCount: number;
  /** Count of high severity items */
  highCount: number;
  /** Average hours pending across items */
  avgHoursPending: number;
  /** Max SLA breach % across items */
  maxSlaBreachPct: number;
  /** Composite urgency score (higher = more urgent) */
  urgencyScore: number;
  /** Trigger types represented in this cluster */
  triggerTypes: string[];
  /** Human-readable rationale for this suggestion */
  rationale: string;
}

// ===========================================================================
// Phase 13 — Close Simulation Engine ("What If") DTOs
// ===========================================================================

/** Scenario adjustment type */
export type SimulationAdjustmentType =
  | "RESOLVE_BLOCKERS"
  | "EXPEDITE_CRITICAL_PATH"
  | "ACCEPT_TOP_DEFECTS"
  | "ADD_OVERRIDES"
  | "WAIVE_TASKS"
  | "EXTEND_DEADLINE"
  | "ADD_RESOURCES";

/** A single scenario adjustment parameter */
export interface SimulationAdjustment {
  type: SimulationAdjustmentType;
  /** Human label for this adjustment */
  label: string;
  /** Numeric value (hours to save, count of defects, etc.) */
  value: number;
  /** Unit for display */
  unit: string;
}

/** Preset scenario template */
export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  adjustments: SimulationAdjustment[];
  /** Icon name (lucide) */
  icon: string;
}

/** Simulation result — delta vs current baseline */
export interface SimulationResult {
  scenarioId: string;
  scenarioName: string;
  /** Baseline (current) metrics */
  baseline: SimulationMetrics;
  /** Projected metrics after adjustments */
  projected: SimulationMetrics;
  /** Per-adjustment impact breakdown */
  impacts: SimulationImpact[];
  /** Overall assessment */
  assessment: "SAFE" | "IMPROVED" | "MARGINAL" | "STILL_AT_RISK";
  /** Narrative summary */
  summary: string;
  /** Recommended follow-up actions */
  recommendations: string[];
}

/** Core metrics for baseline/projected comparison */
export interface SimulationMetrics {
  breachProbability: number;
  bufferHours: number;
  completionPct: number;
  blockedTasks: number;
  criticalPathMinutes: number;
  riskTier: string;
  predictedReadyLabel: string;
}

/** Impact of a single adjustment */
export interface SimulationImpact {
  adjustmentLabel: string;
  breachDelta: number;
  bufferDelta: number;
  completionDelta: number;
  narrative: string;
}

// ===========================================================================
// Phase 14 — AI-Assisted Root Cause Analysis DTOs
// ===========================================================================

/** Category of root cause */
export type RootCauseCategory =
  | "BLOCKER"
  | "DEFECT"
  | "ANOMALY"
  | "OVERRIDE_SPIKE"
  | "DOCUMENT_HEALTH"
  | "SLA_PRESSURE"
  | "TREND_DEGRADATION"
  | "RESOURCE_GAP";

/** A single identified root cause with evidence chain */
export interface RootCause {
  id: string;
  category: RootCauseCategory;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  explanation: string;
  /** Evidence chain: symptom → contributing factor → root cause */
  evidenceChain: RootCauseEvidence[];
  /** Impact on breach probability (estimated %) */
  breachContribution: number;
  /** Suggested remediation action */
  remediation: string;
  /** Drill target for investigation */
  drillTab?: string;
  drillSubTab?: string;
}

/** A link in the evidence chain */
export interface RootCauseEvidence {
  level: "symptom" | "factor" | "contributing_factor" | "root_cause";
  label: string;
  description?: string;
  value?: string;
  source: string;
}

/** Complete root cause analysis result */
export interface RootCauseAnalysis {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Overall health assessment */
  healthStatus: "CRITICAL" | "DEGRADED" | "WATCH" | "HEALTHY";
  /** Ranked root causes (highest impact first) */
  causes: RootCause[];
  /** Summary narrative */
  summary: string;
  /** Total estimated breach contribution from all causes */
  totalBreachContribution: number;
}

// ---------------------------------------------------------------------------
// Phase 15 — Autonomous Close Orchestration
// ---------------------------------------------------------------------------

/** Governance verdict for an autonomous action */
export type OrchestrationVerdict =
  | "AUTO_EXECUTED"
  | "REQUIRES_APPROVAL"
  | "BLOCKED_BY_THRESHOLD"
  | "BLOCKED_BY_RATE_LIMIT"
  | "BLOCKED_BY_COOLDOWN"
  | "BLOCKED_BY_SCHEDULE"
  | "BLOCKED_BY_KILL_SWITCH"
  | "ESCALATED"
  | "SKIPPED_NO_RULE";

/** Gate evaluation result for a single governance gate */
export interface OrchestrationGateResult {
  gate: string;
  passed: boolean;
  reason: string;
  detail?: Record<string, unknown>;
}

/** A single autonomous action proposal with governance verdict */
export interface OrchestrationAction {
  id: string;
  actionType: string;
  policyCode: string;
  policyName: string;
  severity: string;
  verdict: OrchestrationVerdict;
  /** What the action would do */
  title: string;
  rationale: string;
  /** Source defect/action IDs */
  sourceActionIds: string[];
  /** Gate evaluation results */
  gates: OrchestrationGateResult[];
  /** Blocking gate (if verdict is BLOCKED_*) */
  blockingGate?: string;
  /** Estimated impact */
  estimatedImpact?: string;
}

/** Automation rule status for an entity/action_type */
export interface AutomationRuleStatus {
  actionType: string;
  status: "ENABLED" | "DISABLED" | "PAUSED";
  maxAutoSeverity: string;
  maxBreachProbability: number;
  minBufferHours: number;
  maxAutoAcceptsPerPeriod: number;
  maxAutoActionsPerHour: number;
  cooldownMinutes: number;
  periodAutoExecuted: number;
  actionsLastHour: number;
  acceptsRemaining: number;
  hourlyCapacityRemaining: number;
  lastAutoExecutedAt?: string;
  pauseReason?: string;
}

/** Full orchestration plan produced by the engine */
export interface OrchestrationPlan {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  /** Current automation posture */
  automationEnabled: boolean;
  /** Summary of rules evaluated */
  rulesEvaluated: number;
  /** Actions grouped by verdict */
  autoExecutable: OrchestrationAction[];
  requiresApproval: OrchestrationAction[];
  blocked: OrchestrationAction[];
  /** Aggregate stats */
  totalScanned: number;
  totalAutoEligible: number;
  totalBlocked: number;
  totalRequiresApproval: number;
  /** Current risk context */
  breachProbability: number;
  bufferHours: number;
  /** Summary narrative */
  summary: string;
}

// ---------------------------------------------------------------------------
// Related Financial Documents
// ---------------------------------------------------------------------------

export type DocumentRelationship =
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "PAYMENT"
  | "JOURNAL_ENTRY"
  | "PARENT_INVOICE";

export interface RelatedDocumentDTO {
  docId: string;
  txnId: string | null;
  docType: string;
  docNo: string;
  docDate: string | null;
  postingDate: string | null;
  status: string;
  currencyCode: string | null;
  totalAmount: string | null;
  counterpartyType: string | null;
  counterpartyId: string | null;
  entityName: string | null;
  relationship: DocumentRelationship;
  jeId: string | null;
}

// ---------------------------------------------------------------------------
// Accounting Details (JE + Lines + GL Impact)
// ---------------------------------------------------------------------------

export interface AccountingJournalLineDTO {
  jeId: string;
  lineNo: number;
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string | null;
  description: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  profitCenterId: string | null;
  profitCenterName: string | null;
  dimensionSetId: string | null;
  dimensionLabel: string | null;
  sourceDocLineId: string | null;
  subledgerType: string | null;
  subledgerRefId: string | null;
}

export interface AccountingEntryDTO {
  jeId: string;
  jeNumber: string;
  postingDate: string;
  fiscalYear: number;
  periodNumber: number;
  description: string | null;
  totalDebit: string;
  totalCredit: string;
  currencyCode: string;
  status: string;
  bookCode: string;
  docType: string;
  isReversal: boolean;
  reversalOfId: string | null;
  reversedById: string | null;
  postedBy: string | null;
  postedAt: string | null;
  lines: AccountingJournalLineDTO[];
}

export interface GLImpactDTO {
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  totalDebit: string;
  totalCredit: string;
  netAmount: string;
}

export interface AccountingDetailsDTO {
  entries: AccountingEntryDTO[];
  glImpact: GLImpactDTO[];
}
