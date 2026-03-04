// framework/runtime/src/services/business/engines/tax-engine/services/tax-posting-splits.ts
//
// Translates tax calculations into posting instructions for the Posting Engine.
// Each TaxPostingSplit tells the caller HOW and WHERE to include tax in the JE.

import type { TaxCalculation } from "../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Account type classification for the tax JE line.
 */
export type TaxAccountType =
  | "TAX_INPUT_CREDIT" // Recoverable tax → Dr asset (balance sheet)
  | "TAX_EXPENSE" // Non-recoverable tax → Dr expense (P&L)
  | "WHT_PAYABLE" // Withholding tax → Cr liability
  | "TAX_PAYABLE"; // Output VAT/GST → Cr liability (for completeness)

/**
 * Explicit side — never inferred from accountType.
 * The caller must use this field, not derive it.
 */
export type PostingSide = "DEBIT" | "CREDIT";

/**
 * How to incorporate this split into the JE:
 * - ADD_TO_BASE_LINE: Add the amount to the document's expense line (no separate JE line).
 *   Used for non-recoverable tax that "grosses up" the expense.
 * - SEPARATE_LINE: Create a distinct JE line for this amount.
 *   Used for recoverable tax (Dr Tax Input Credit) and WHT (Cr WHT Payable).
 */
export type PostingMode = "ADD_TO_BASE_LINE" | "SEPARATE_LINE";

/**
 * A single posting instruction derived from a tax calculation.
 */
export interface TaxPostingSplit {
  /** What kind of tax account */
  accountType: TaxAccountType;
  /** Which side of the JE — EXPLICIT, never infer */
  side: PostingSide;
  /** Whether to merge into the base expense line or create separate */
  mode: PostingMode;
  /** MC-4 compliant string amount */
  amount: string;
  /** Tax code for audit trail */
  taxCode: string;
  /** Jurisdiction for tax reporting */
  jurisdictionId: string;
  /** Links back to the source document line (invoice line / allocation) */
  sourceLineId?: string;
  /** Links to the tax_calculation row for audit */
  taxCalculationId: string;
}

// ---------------------------------------------------------------------------
// Split generation
// ---------------------------------------------------------------------------

/**
 * Generate posting splits from tax calculations.
 *
 * Split routing rules:
 * 1. isInputCreditEligible → TAX_INPUT_CREDIT, DEBIT, SEPARATE_LINE
 *    (always a distinct asset line on the balance sheet)
 * 2. !isInputCreditEligible && !isWht → TAX_EXPENSE, DEBIT, ADD_TO_BASE_LINE
 *    (default: gross up expense; configurable to SEPARATE_LINE via policy)
 * 3. isWht → WHT_PAYABLE, CREDIT, SEPARATE_LINE
 *    (always a distinct liability line — reduces net cash to supplier)
 */
export function generatePostingSplits(
  calculations: TaxCalculation[],
  options?: {
    /** Override: force non-recoverable tax to SEPARATE_LINE instead of ADD_TO_BASE_LINE */
    nonRecoverableSeparateLine?: boolean;
    /** Source line ID mapping: lineItemIndex → sourceDocLineId */
    sourceLineIdMap?: Map<number, string>;
  },
): TaxPostingSplit[] {
  const splits: TaxPostingSplit[] = [];

  for (const calc of calculations) {
    // Skip zero-amount calculations
    if (calc.taxAmount === "0" || calc.taxAmount === "0.0000") {
      continue;
    }

    const sourceLineId =
      calc.lineItemIndex != null
        ? options?.sourceLineIdMap?.get(calc.lineItemIndex)
        : undefined;

    if (calc.isWht) {
      // WHT: always CREDIT, always SEPARATE_LINE
      splits.push({
        accountType: "WHT_PAYABLE",
        side: "CREDIT",
        mode: "SEPARATE_LINE",
        amount: calc.taxAmount,
        taxCode: calc.taxCode,
        jurisdictionId: calc.jurisdictionId,
        sourceLineId,
        taxCalculationId: calc.id,
      });
    } else if (calc.isInputCreditEligible) {
      // Recoverable: always DEBIT, always SEPARATE_LINE
      splits.push({
        accountType: "TAX_INPUT_CREDIT",
        side: "DEBIT",
        mode: "SEPARATE_LINE",
        amount: calc.taxAmount,
        taxCode: calc.taxCode,
        jurisdictionId: calc.jurisdictionId,
        sourceLineId,
        taxCalculationId: calc.id,
      });
    } else {
      // Non-recoverable: DEBIT, default ADD_TO_BASE_LINE (configurable)
      splits.push({
        accountType: "TAX_EXPENSE",
        side: "DEBIT",
        mode: options?.nonRecoverableSeparateLine
          ? "SEPARATE_LINE"
          : "ADD_TO_BASE_LINE",
        amount: calc.taxAmount,
        taxCode: calc.taxCode,
        jurisdictionId: calc.jurisdictionId,
        sourceLineId,
        taxCalculationId: calc.id,
      });
    }
  }

  return splits;
}
