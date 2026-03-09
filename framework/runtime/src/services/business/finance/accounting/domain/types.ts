// framework/runtime/src/services/business/finance/accounting/domain/types.ts
//
// Domain types for Purchase Invoice + Manual Journal Entry + GL Inquiry.
// MC-4 compliant: all monetary fields are string (DECIMAL in DB).

import type { ApprovalRoute } from "../../shared/decision-grid-evaluator.js";

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

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "DRAFT", "CANCELLED"], // DRAFT = rejection re-opens
  APPROVED: ["POSTED", "CANCELLED"],
  POSTED: ["PARTIALLY_PAID", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "CANCELLED"],
  PAID: [], // Terminal
  CANCELLED: [], // Terminal
};

export interface PurchaseInvoice {
  id: string;
  tenantId: string;
  entityCode: string;
  txnId: string;
  invoiceNumber: string;
  invoiceType: "PO_BASED" | "NON_PO";
  supplierId: string;
  supplierInvoiceRef: string | null;
  description: string | null;

  // OU + Intent context
  ouId: string;
  intentId: string | null;
  spendCategoryId: string | null;
  fpId: string | null;
  accountingProfileId: string | null;

  // Dates
  invoiceDate: Date;
  receivedDate: Date | null;
  dueDate: Date | null;
  postingDate: Date | null;

  // Amounts (MC-4: string)
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  currencyCode: string;

  // FX
  functionalCurrencyCode: string | null;
  exchangeRate: string | null;
  functionalAmount: string | null;

  // Status + workflow
  status: InvoiceStatus;
  decisionScore: number | null;
  approvalRoute: ApprovalRoute | null;
  approvalInstanceId: string | null;

  // Posting
  jeId: string | null;
  postedAt: Date | null;
  postedBy: string | null;

  // Federation
  icTransactionId: string | null;

  // Idempotency + versioning
  idempotencyKey: string | null;
  version: number;

  // Audit
  submittedAt: Date | null;
  submittedBy: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseInvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  lineNo: number;
  description: string;
  itemId: string | null;
  warehouseId: string | null;
  spendCategoryId: string | null;

  // Quantity + pricing (MC-4: string)
  quantity: string;
  uom: string | null;
  unitPrice: string;
  amount: string;

  // Tax
  taxCode: string | null;
  taxRate: string;
  taxAmount: string;
  taxInclusive: boolean;

  // Accounting
  accountId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  fpId: string | null;

  // Commitment link
  commitmentId: string | null;
  commitmentScheduleId: string | null;

  // Post-posting links
  assetId: string | null;
  inventoryMovementId: string | null;

  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreatePurchaseInvoiceInput {
  tenantId: string;
  entityCode: string;
  supplierId: string;
  supplierInvoiceRef?: string;
  description?: string;
  ouId: string;
  intentId?: string;
  spendCategoryId?: string;
  fpId?: string;
  accountingProfileId?: string;
  invoiceDate: Date;
  receivedDate?: Date;
  dueDate?: Date;
  currencyCode: string;
  functionalCurrencyCode?: string;
  exchangeRate?: string;
  idempotencyKey?: string;
}

export interface UpdatePurchaseInvoiceInput {
  supplierInvoiceRef?: string;
  description?: string;
  intentId?: string;
  spendCategoryId?: string;
  fpId?: string;
  accountingProfileId?: string;
  dueDate?: Date;
  exchangeRate?: string;
  version: number;
}

export interface CreateInvoiceLineInput {
  description: string;
  itemId?: string;
  warehouseId?: string;
  spendCategoryId?: string;
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
  commitmentId?: string;
  commitmentScheduleId?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// GL Inquiry types
// ---------------------------------------------------------------------------

export type ReversalHandlingMode = "NETTED" | "SEPARATE" | "EXCLUDED";

export interface GLSummaryFilters {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber?: number;
  accountId?: string;
  costCenterId?: string;
  accountType?: string;
}

export interface GLDetailFilters {
  tenantId: string;
  entityCode: string;
  accountId: string;
  fiscalYear: number;
  periodNumber?: number;
  reversalMode?: ReversalHandlingMode;
}

export interface TrialBalanceFilters {
  tenantId: string;
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  reversalMode?: ReversalHandlingMode;
}

export interface GLSummaryRow {
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

export interface GLDetailRow {
  jeId: string;
  jeNumber: string;
  postingDate: Date;
  docId: string;
  docType: string;
  lineNo: number;
  debitAmount: string;
  creditAmount: string;
  description: string | null;
  sourceDocLineId: string | null;
  costCenterId: string | null;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: string;
  creditBalance: string;
}
