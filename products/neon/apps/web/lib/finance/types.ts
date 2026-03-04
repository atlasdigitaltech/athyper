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

export interface JournalEntryDTO {
    id: string;
    jeNumber: string;
    entityCode: string;
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

export type PaymentMethod = "CHECK" | "WIRE" | "ACH" | "CARD" | "CASH" | "NETTING";

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
    fiscalYear: number;
    periodNumber?: number;
    accountId?: string;
    costCenterId?: string;
    accountType?: string;
    reversalMode?: ReversalHandlingMode;
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
// Bank Reconciliation
// ---------------------------------------------------------------------------

export type StatementStatus = "IMPORTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type MatchStatus = "UNMATCHED" | "AUTO_MATCHED" | "MANUAL_MATCHED" | "CONFIRMED" | "EXCLUDED";
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
// Paginated result (mirrors backend PaginatedResult<T>)
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}
