// lib/finance/index.ts — barrel export

export * from "./types";
export { FinanceHttpError } from "./errors";
export { finGet, finPost, finPatch } from "./fetcher";

// Hooks
export { useInvoiceLines } from "./use-invoice-lines";
export type { UseInvoiceLinesResult } from "./use-invoice-lines";

export { useJournalEntry } from "./use-journal-entry";
export type { UseJournalEntryResult } from "./use-journal-entry";

export { usePaymentAllocations } from "./use-payment-allocations";
export type { UsePaymentAllocationsResult } from "./use-payment-allocations";

export { useGLReport } from "./use-gl-report";
export type { UseGLReportResult, GLReportTab } from "./use-gl-report";

export { useDecisionScore } from "./use-decision-score";
export type { UseDecisionScoreResult } from "./use-decision-score";

export {
  usePurchaseInvoiceList,
  usePaymentEntryList,
  useJournalEntryList,
} from "./use-finance-list";
export type {
  ListFilterOptions,
  UseFinanceListResult,
} from "./use-finance-list";
