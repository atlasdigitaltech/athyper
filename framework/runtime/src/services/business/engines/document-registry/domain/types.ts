// framework/runtime/src/services/business/engines/document-registry/domain/types.ts
//
// Financial Document Registry — domain types.
// One row per finance-relevant document. Acts as the unified audit spine,
// lifecycle spine, posting linkage spine, and compliance query surface.

// ---------------------------------------------------------------------------
// Document Type — aligned with event store DocType but uses full names
// for registry clarity and UI display.
// ---------------------------------------------------------------------------

export type FinancialDocType =
  | "PURCHASE_INVOICE"
  | "PAYMENT_ENTRY"
  | "JOURNAL_ENTRY"
  // Future document types (additive extension)
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "ACCRUAL"
  | "REVERSAL"
  | "RECLASS"
  | "TAX_DOC"
  | "ASSET_CAPITALIZATION"
  | "FX_REVALUATION"
  | "IC_ELIMINATION";

// ---------------------------------------------------------------------------
// Canonical Status — cross-document normalized lifecycle.
// Source modules keep their own native statuses; this is the registry view.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Counterparty Type
// ---------------------------------------------------------------------------

export type CounterpartyType =
  | "SUPPLIER"
  | "CUSTOMER"
  | "EMPLOYEE"
  | "INTERCOMPANY"
  | "INTERNAL";

// ---------------------------------------------------------------------------
// Financial Document — the unified registry record
// ---------------------------------------------------------------------------

export interface FinancialDocument {
  id: string;
  tenantId: string;

  // Document identity
  docId: string;
  txnId: string;
  docType: FinancialDocType;
  docNo: string;

  // Ownership / origin
  entityCode: string;
  sourceModule: string;
  sourceTable: string;
  sourceRefId: string;

  // Canonical lifecycle
  status: CanonicalDocStatus;
  sourceStatus: string;

  // Dates
  docDate: Date;
  postingDate: Date | null;

  // Business summary (MC-4: string for monetary values)
  currencyCode: string;
  totalAmount: string;

  // Counterparty
  counterpartyType: CounterpartyType | null;
  counterpartyId: string | null;

  // Posting linkage
  jeId: string | null;
  bookCode: string | null;
  postedAt: Date | null;
  postedBy: string | null;

  // Reversal / cancellation
  reversedDocId: string | null;
  voidReasonCode: string | null;
  reversalReason: string | null;
  reversalAt: Date | null;
  reversalBy: string | null;
  reversingDocId: string | null;

  // Approval evidence (denormalized from source for compliance queries)
  approvalInstanceId: string | null;
  approvalRoute: string | null;
  decisionScore: string | null; // MC-4: decimal as string

  // Event continuity
  lastEventId: string | null;
  lastLifecycleAt: Date | null;
  lastPostingEventAt: Date | null;

  // Audit trail
  createdBy: string | null;
  createdAt: Date;
  updatedBy: string | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Multi-Book Posting — bridge record for one-to-many JE linkage
// ---------------------------------------------------------------------------

export type PostingBridgeStatus = "POSTED" | "REVERSED" | "FAILED";

export interface FinancialDocumentPosting {
  id: string;
  tenantId: string;
  docId: string;
  bookCode: string;
  jeId: string;
  postingRuleId: string | null;
  postingStatus: PostingBridgeStatus;
  postedAt: Date | null;
  postedBy: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Canonical Status Mapping — governed reference record
// ---------------------------------------------------------------------------

export interface CanonicalStatusMappingRecord {
  id: number;
  docType: string;
  sourceStatus: string;
  canonicalStatus: CanonicalDocStatus;
  description: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

// ---------------------------------------------------------------------------
// Approval Route — aligns with Decision Grid output
// ---------------------------------------------------------------------------

export type ApprovalRoute =
  | "ZERO_APPROVAL"
  | "STANDARD"
  | "ENHANCED"
  | "EXECUTIVE"
  | "BLOCKED";

// ---------------------------------------------------------------------------
// Query Filters — for the unified document workbench
// ---------------------------------------------------------------------------

export interface FinancialDocumentFilters {
  entityCode?: string;
  docType?: FinancialDocType | FinancialDocType[];
  status?: CanonicalDocStatus | CanonicalDocStatus[];
  sourceStatus?: string;
  counterpartyType?: CounterpartyType;
  counterpartyId?: string;
  bookCode?: string;
  hasJeId?: boolean;
  approvalRoute?: ApprovalRoute;
  hasApprovalEvidence?: boolean;
  postingDateFrom?: Date;
  postingDateTo?: Date;
  docDateFrom?: Date;
  docDateTo?: Date;
  createdBy?: string;
  txnId?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Canonical Status Mapping — maps source-table-specific statuses
// ---------------------------------------------------------------------------

const INVOICE_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  SUBMITTED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  PARTIALLY_PAID: "PARTIALLY_SETTLED",
  PAID: "SETTLED",
  CANCELLED: "CANCELLED",
};

const PAYMENT_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  SUBMITTED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  RECONCILED: "SETTLED",
  CANCELLED: "CANCELLED",
  VOIDED: "VOIDED",
};

const JE_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  CREATED: "DRAFT",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
};

const CREDIT_NOTE_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  SUBMITTED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  APPLIED: "SETTLED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

const ACCRUAL_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
  CANCELLED: "CANCELLED",
};

const RECLASS_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
};

const DEBIT_NOTE_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  SUBMITTED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

const FX_REVALUATION_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  CALCULATED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
};

const IC_ELIMINATION_STATUS_MAP: Record<string, CanonicalDocStatus> = {
  DRAFT: "DRAFT",
  PREPARED: "IN_REVIEW",
  APPROVED: "APPROVED",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
};

export function mapCanonicalStatus(
  docType: FinancialDocType,
  sourceStatus: string,
): CanonicalDocStatus {
  switch (docType) {
    case "PURCHASE_INVOICE":
      return INVOICE_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "PAYMENT_ENTRY":
      return PAYMENT_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "JOURNAL_ENTRY":
      return JE_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "CREDIT_NOTE":
      return CREDIT_NOTE_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "ACCRUAL":
      return ACCRUAL_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "RECLASS":
      return RECLASS_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "DEBIT_NOTE":
      return DEBIT_NOTE_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "FX_REVALUATION":
      return FX_REVALUATION_STATUS_MAP[sourceStatus] ?? "DRAFT";
    case "IC_ELIMINATION":
      return IC_ELIMINATION_STATUS_MAP[sourceStatus] ?? "DRAFT";
    default:
      return "DRAFT";
  }
}

// ---------------------------------------------------------------------------
// Compliance Query Results
// ---------------------------------------------------------------------------

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

export interface PostingInconsistency {
  document: FinancialDocument;
  inconsistencyType: PostingInconsistencyType;
  detail?: string;
}

export interface RegistryStats {
  totalDocuments: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byApprovalRoute: Record<string, number>;
  unpostedApproved: number;
  postedWithoutJe: number;
  recentlyReversed: number;
  approvedWithoutScoring: number;
}
