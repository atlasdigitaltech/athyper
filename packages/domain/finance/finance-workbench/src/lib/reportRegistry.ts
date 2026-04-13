/**
 * Report registry — single source of truth for every financial report.
 *
 * Each entry declares the canonical report code, display metadata, and
 * behavioural flags that the FinancialReportsWorkbench compositor reads to
 * determine: which view to render, how to label the period, which export
 * formats are supported, and whether to offer prior-year comparison.
 *
 * Adding a new report: add an entry here and add its view to REPORT_VIEWS
 * in FinancialReportsWorkbench.tsx. The compositor handles the rest.
 */

export type ReportCode =
  | "profit-loss"
  | "balance-sheet"
  | "trial-balance"
  | "cash-flow"
  | "ap-aging"
  | "ar-aging";

/**
 * How to label the period dimension for this report type.
 *   "for-period"  — covers a date range (P&L: "For March 2026")
 *   "as-of"       — point-in-time snapshot (Balance Sheet: "As at 31 March 2026")
 */
export type PeriodMode = "for-period" | "as-of";

export interface ReportMeta {
  code:            ReportCode;
  label:           string;
  description:     string;
  periodMode:      PeriodMode;
  supportsCompare: boolean;
  supportsExport:  ReadonlyArray<"csv" | "xlsx" | "pdf">;
  displayType:     "statement" | "grid" | "chart+grid";
  /**
   * "live"        — view component exists; renders real data
   * "placeholder" — view not yet built; compositor renders a coming-soon tile
   */
  status:          "live" | "placeholder";
}

export const REPORT_REGISTRY: Record<ReportCode, ReportMeta> = {
  "profit-loss": {
    code:            "profit-loss",
    label:           "Profit & Loss",
    description:     "Revenue, costs, and net profit for the period",
    periodMode:      "for-period",
    supportsCompare: true,
    supportsExport:  ["csv", "xlsx", "pdf"],
    displayType:     "statement",
    status:          "live",
  },
  "balance-sheet": {
    code:            "balance-sheet",
    label:           "Balance Sheet",
    description:     "Assets, liabilities, and equity at period end",
    periodMode:      "as-of",
    supportsCompare: true,
    supportsExport:  ["csv", "xlsx", "pdf"],
    displayType:     "statement",
    status:          "live",
  },
  "trial-balance": {
    code:            "trial-balance",
    label:           "Trial Balance",
    description:     "Debit and credit balances for all accounts",
    periodMode:      "as-of",
    supportsCompare: false,
    supportsExport:  ["csv", "xlsx"],
    displayType:     "grid",
    status:          "live",
  },
  "cash-flow": {
    code:            "cash-flow",
    label:           "Cash Flow",
    description:     "Operating, investing, and financing cash movements",
    periodMode:      "for-period",
    supportsCompare: true,
    supportsExport:  ["csv", "xlsx", "pdf"],
    displayType:     "statement",
    status:          "live",
  },
  "ap-aging": {
    code:            "ap-aging",
    label:           "AP Aging",
    description:     "Outstanding payables by aging bucket per vendor",
    periodMode:      "as-of",
    supportsCompare: false,
    supportsExport:  ["csv", "xlsx"],
    displayType:     "grid",
    status:          "live",
  },
  "ar-aging": {
    code:            "ar-aging",
    label:           "AR Aging",
    description:     "Outstanding receivables by aging bucket per customer",
    periodMode:      "as-of",
    supportsCompare: false,
    supportsExport:  ["csv", "xlsx"],
    displayType:     "grid",
    status:          "live",
  },
};

export const REPORT_CODES = Object.keys(REPORT_REGISTRY) as ReportCode[];
export const DEFAULT_REPORT: ReportCode = "profit-loss";

/**
 * Safely parse a raw query param value into a ReportCode.
 * Falls back to DEFAULT_REPORT for unknown or missing values.
 */
export function parseReportCode(raw: string | string[] | undefined): ReportCode {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && (s in REPORT_REGISTRY) ? (s as ReportCode) : DEFAULT_REPORT;
}
