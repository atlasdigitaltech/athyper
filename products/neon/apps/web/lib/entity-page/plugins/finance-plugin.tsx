/**
 * Finance Plugins for Entity Pages
 *
 * Adds four finance-specific tabs:
 *   - invoice-lines:        Editable line grid for Purchase Invoices
 *   - journal-lines:        Debit/credit JE lines with balance indicator
 *   - payment-allocations:  Gross settlement allocation picker
 *   - decision-score:       Decision Grid evaluation audit panel
 *
 * Each tab is wired to its corresponding data-fetching hook from
 * lib/finance/. DTOs are mapped to the component's internal domain types.
 */

"use client";

import type { TabPlugin, TabPluginProps } from "../plugin-registry";
import type {
  InvoiceLineDTO,
  JournalLineDTO,
  PaymentAllocationDTO,
  UnpaidInvoiceDTO,
  DecisionEvaluationDTO,
} from "@/lib/finance/types";

import { DecisionScorePanel } from "@/components/finance/DecisionScorePanel";
import { InvoiceLineGrid } from "@/components/finance/InvoiceLineGrid";
import { JournalLineGrid } from "@/components/finance/JournalLineGrid";
import { PaymentAllocationPicker } from "@/components/finance/PaymentAllocationPicker";
import { useDecisionScore } from "@/lib/finance/use-decision-score";
import { useInvoiceLines } from "@/lib/finance/use-invoice-lines";
import { useJournalEntry } from "@/lib/finance/use-journal-entry";
import { usePaymentAllocations } from "@/lib/finance/use-payment-allocations";

// ── Shared UI helpers ─────────────────────────────────────────────────

function LoadingIndicator() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
      {message}
    </div>
  );
}

// ── DTO → Component Mappers ───────────────────────────────────────────

/**
 * Map InvoiceLineDTO to the PurchaseInvoiceLine shape expected by
 * InvoiceLineGrid. The DTO uses `lineNo` / `amount` / `accountId`
 * while the component expects `lineNumber` / `lineAmount` / `glAccountId`.
 */
function mapInvoiceLine(dto: InvoiceLineDTO) {
  return {
    id: dto.id,
    invoiceId: dto.invoiceId,
    lineNumber: dto.lineNo,
    description: dto.description,
    quantity: dto.quantity,
    unitPrice: dto.unitPrice,
    lineAmount: dto.amount,
    taxCode: dto.taxCode,
    taxAmount: dto.taxAmount,
    glAccountId: dto.accountId ?? "",
    costCenterId: dto.costCenterId,
    profitCenterId: dto.profitCenterId,
    fundingProfileId: dto.fpId,
    assetFlag: dto.assetId != null,
    inventoryFlag: dto.inventoryMovementId != null,
    sourceDocLineId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Map JournalLineDTO to the JournalLine shape expected by JournalLineGrid.
 */
function mapJournalLine(dto: JournalLineDTO) {
  return {
    id: dto.id,
    journalEntryId: dto.jeId,
    lineNumber: dto.lineNo,
    accountId: dto.accountCode
      ? `${dto.accountCode} - ${dto.accountName ?? ""}`
      : dto.accountId,
    debitAmount: dto.debitAmount,
    creditAmount: dto.creditAmount,
    currencyCode: dto.currencyCode,
    description: dto.description,
    subledgerType: dto.costCenterId ? "CC" : null,
    subledgerRefId: dto.costCenterId,
    sourceDocLineId: dto.sourceDocLineId,
  };
}

/**
 * Map UnpaidInvoiceDTO to AvailableInvoice shape expected by
 * PaymentAllocationPicker.
 */
function mapUnpaidInvoice(dto: UnpaidInvoiceDTO) {
  return {
    id: dto.id,
    invoiceNumber: dto.invoiceNumber,
    invoiceDate: dto.dueDate ?? "",
    totalAmount: dto.totalAmount,
    paidAmount: dto.paidAmount,
    remainingAmount: dto.remainingAmount,
    status: "POSTED",
  };
}

/**
 * Map PaymentAllocationDTO to AllocationRow shape expected by
 * PaymentAllocationPicker. The net cash is derived from:
 *   allocated - discount - withholding.
 */
function mapAllocationRow(
  dto: PaymentAllocationDTO,
  unpaidMap: Map<string, UnpaidInvoiceDTO>,
) {
  const invoice = unpaidMap.get(dto.invoiceId);
  const allocated = parseFloat(dto.allocatedAmount) || 0;
  const discount = parseFloat(dto.discountAmount) || 0;
  const withholding = parseFloat(dto.withholdingAmount) || 0;
  const netCash = allocated - discount - withholding;

  return {
    invoiceId: dto.invoiceId,
    invoiceNumber: invoice?.invoiceNumber ?? dto.invoiceId,
    remainingAmount: invoice?.remainingAmount ?? "0",
    allocatedAmount: dto.allocatedAmount,
    discountAmount: dto.discountAmount,
    withholdingAmount: dto.withholdingAmount,
    netCashAmount: netCash.toFixed(2),
  };
}

/**
 * Map DecisionEvaluationDTO to DecisionEvaluationResult expected by
 * DecisionScorePanel. The DTO does not include moduleScores or
 * evaluatedAt — we synthesize them.
 */
function mapDecisionResult(dto: DecisionEvaluationDTO) {
  return {
    pipelineId: dto.pipelineId,
    compositeScore: dto.compositeScore,
    approvalRoute: dto.approvalRoute as
      | "ZERO_APPROVAL"
      | "STANDARD"
      | "ENHANCED"
      | "EXECUTIVE"
      | "BLOCKED",
    moduleScores: {} as Record<string, number>,
    exceptions: dto.exceptions.map(
      (ex) => `[${ex.severity}] ${ex.policyCode}: ${ex.message}`,
    ),
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Monetary helpers (string-based, MC-4 compliant) ───────────────────

function sumStringAmounts(values: string[]): string {
  let total = 0;
  for (const v of values) {
    const n = parseFloat(v);
    if (!isNaN(n)) total += n;
  }
  return total.toFixed(2);
}

function subtractStrings(a: string, b: string): string {
  const diff = (parseFloat(a) || 0) - (parseFloat(b) || 0);
  return diff.toFixed(2);
}

// ── Invoice Lines ────────────────────────────────────────────────────

function InvoiceLinesTab({ entityId }: TabPluginProps) {
  const { lines, loading, error } = useInvoiceLines(entityId);

  if (loading)
    return (
      <div className="p-6">
        <LoadingIndicator />
      </div>
    );
  if (error)
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
      </div>
    );

  const mappedLines = lines.map(mapInvoiceLine);
  const totalLineAmount = sumStringAmounts(lines.map((l) => l.amount));
  const totalTaxAmount = sumStringAmounts(lines.map((l) => l.taxAmount));
  const currencyCode = "USD"; // Default; real currency comes from parent invoice

  return (
    <div className="p-6">
      <InvoiceLineGrid
        lines={mappedLines}
        mode="view"
        totalLineAmount={totalLineAmount}
        totalTaxAmount={totalTaxAmount}
        currencyCode={currencyCode}
      />
    </div>
  );
}

export const invoiceLinesPlugin: TabPlugin = {
  code: "invoice-lines",
  component: InvoiceLinesTab,
};

// ── Journal Lines ────────────────────────────────────────────────────

function JournalLinesTab({ entityId }: TabPluginProps) {
  const { entry, loading, error } = useJournalEntry(entityId);

  if (loading)
    return (
      <div className="p-6">
        <LoadingIndicator />
      </div>
    );
  if (error)
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
      </div>
    );

  const jeLines = entry?.lines ?? [];
  const mappedLines = jeLines.map(mapJournalLine);

  const totalDebits =
    entry?.totalDebit ?? sumStringAmounts(jeLines.map((l) => l.debitAmount));
  const totalCredits =
    entry?.totalCredit ?? sumStringAmounts(jeLines.map((l) => l.creditAmount));
  const balanceDifference = subtractStrings(totalDebits, totalCredits);
  const isBalanced =
    balanceDifference === "0.00" || balanceDifference === "-0.00";

  return (
    <div className="p-6">
      <JournalLineGrid
        lines={mappedLines}
        mode="view"
        totalDebits={totalDebits}
        totalCredits={totalCredits}
        balanceDifference={balanceDifference}
        isBalanced={isBalanced}
      />
    </div>
  );
}

export const journalLinesPlugin: TabPlugin = {
  code: "journal-lines",
  component: JournalLinesTab,
};

// ── Payment Allocations ──────────────────────────────────────────────

function PaymentAllocationsTab({ entityId }: TabPluginProps) {
  const {
    allocations,
    unpaidInvoices,
    paymentTotal,
    currencyCode,
    loading,
    error,
  } = usePaymentAllocations(entityId);

  if (loading)
    return (
      <div className="p-6">
        <LoadingIndicator />
      </div>
    );
  if (error)
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
      </div>
    );

  // Build a lookup for unpaid invoices so allocation rows can resolve names
  const unpaidMap = new Map<string, UnpaidInvoiceDTO>();
  for (const inv of unpaidInvoices) {
    unpaidMap.set(inv.id, inv);
  }

  const mappedAvailable = unpaidInvoices.map(mapUnpaidInvoice);
  const mappedAllocations = allocations.map((a) =>
    mapAllocationRow(a, unpaidMap),
  );

  const totalAllocated = sumStringAmounts(
    allocations.map((a) => a.allocatedAmount),
  );
  const unallocatedAmount = subtractStrings(paymentTotal, totalAllocated);
  const isFullyAllocated =
    unallocatedAmount === "0.00" || unallocatedAmount === "-0.00";

  return (
    <div className="p-6">
      <PaymentAllocationPicker
        availableInvoices={mappedAvailable}
        allocations={mappedAllocations}
        paymentTotal={paymentTotal}
        totalAllocated={totalAllocated}
        unallocatedAmount={unallocatedAmount}
        isFullyAllocated={isFullyAllocated}
        currencyCode={currencyCode}
        readOnly
      />
    </div>
  );
}

export const paymentAllocationsPlugin: TabPlugin = {
  code: "payment-allocations",
  component: PaymentAllocationsTab,
};

// ── Decision Score ───────────────────────────────────────────────────

function DecisionScoreTab({ entityName, entityId }: TabPluginProps) {
  const { evaluation, loading, error } = useDecisionScore(entityName, entityId);

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message={error} />
      </div>
    );
  }

  const result = evaluation ? mapDecisionResult(evaluation) : null;

  return (
    <div className="p-6">
      <DecisionScorePanel result={result} loading={loading} />
    </div>
  );
}

export const decisionScorePlugin: TabPlugin = {
  code: "decision-score",
  component: DecisionScoreTab,
};
