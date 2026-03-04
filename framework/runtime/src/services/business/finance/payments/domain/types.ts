// framework/runtime/src/services/business/finance/payments/domain/types.ts
//
// Domain types for Payment Entry with gross settlement semantics.
// MC-4 compliant: all monetary fields are string (DECIMAL in DB).

import type { ApprovalRoute } from "../../shared/decision-grid-evaluator.js";

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

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: ["APPROVED", "DRAFT", "CANCELLED"],
    APPROVED: ["POSTED", "CANCELLED"],
    POSTED: ["RECONCILED", "VOIDED"],
    RECONCILED: [],                                     // Terminal
    CANCELLED: [],                                      // Terminal
    VOIDED: [],                                         // Terminal
};

export interface PaymentEntry {
    id: string;
    tenantId: string;
    entityCode: string;
    txnId: string;
    paymentNumber: string;
    supplierId: string;
    description: string | null;

    // OU context
    ouId: string | null;

    // Payment method
    paymentMethod: PaymentMethod;
    bankAccountId: string | null;
    clearingAccountId: string | null;
    bankReference: string | null;

    // Dates
    paymentDate: Date;
    valueDate: Date | null;

    // Amounts (MC-4: string)
    totalAmount: string;
    currencyCode: string;

    // FX
    functionalCurrencyCode: string | null;
    exchangeRate: string | null;
    functionalAmount: string | null;

    // Status + workflow
    status: PaymentStatus;
    decisionScore: number | null;
    approvalRoute: ApprovalRoute | null;
    approvalInstanceId: string | null;

    // Posting
    jeId: string | null;
    postedAt: Date | null;
    postedBy: string | null;

    // Reconciliation
    reconciledAt: Date | null;
    reconciledBy: string | null;

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

/**
 * Payment Allocation — GROSS SETTLEMENT semantics.
 *
 * `allocatedAmount` = total AP reduction for this invoice.
 * Net cash paid = allocatedAmount - withholdingAmount - discountAmount.
 *
 * JE proof:
 *   Dr AP Control    = SUM(allocatedAmount)
 *   Cr WHT Payable   = SUM(withholdingAmount)
 *   Cr Discount Income = SUM(discountAmount)
 *   Cr Bank Account  = SUM(allocatedAmount) - SUM(withholdingAmount) - SUM(discountAmount)
 *   ────────────────────────────────────────────────────────────
 *   Dr total = Cr total  ✓ BALANCED
 */
export interface PaymentAllocation {
    id: string;
    tenantId: string;
    paymentId: string;
    invoiceId: string;
    lineNo: number;

    /** Gross settlement = total AP reduction for this invoice */
    allocatedAmount: string;
    /** Early payment discount (reduces net cash, not AP) */
    discountAmount: string;
    /** WHT deducted at source (reduces net cash, not AP) */
    withholdingAmount: string;

    // Audit links
    whtTaxCalcId: string | null;
    commissionCalcIds: string[];
    commitmentId: string | null;

    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreatePaymentEntryInput {
    tenantId: string;
    entityCode: string;
    supplierId: string;
    description?: string;
    ouId?: string;
    paymentMethod: PaymentMethod;
    bankAccountId?: string;
    clearingAccountId?: string;
    bankReference?: string;
    paymentDate: Date;
    valueDate?: Date;
    totalAmount: string;
    currencyCode: string;
    functionalCurrencyCode?: string;
    exchangeRate?: string;
    idempotencyKey?: string;
}

export interface UpdatePaymentEntryInput {
    description?: string;
    paymentMethod?: PaymentMethod;
    bankAccountId?: string;
    bankReference?: string;
    paymentDate?: Date;
    valueDate?: Date;
    totalAmount?: string;
    exchangeRate?: string;
    version: number;
}

export interface CreateAllocationInput {
    invoiceId: string;
    allocatedAmount: string;
    discountAmount?: string;
    withholdingAmount?: string;
    commitmentId?: string;
    description?: string;
}
