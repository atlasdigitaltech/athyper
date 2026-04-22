/** Format a number into compact display (2.45M, 15.0K, etc.) */
export function fmtCompact(value: number): string {
  if (!value) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

/** Format a number with 2 decimal places */
export function fmtFull(value: number): string {
  if (!value) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number as a decimal amount (2 dp).
 * When `currency` is provided, renders the full currency symbol (e.g. "$1,000.00").
 */
export function fmtCurrency(value: number, currency?: string): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: currency ? "currency" : "decimal",
    currency,
  }).format(value);
}

/** Format an ISO date string as "21 Apr 2026". Returns "—" for null/undefined. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format an ISO datetime string as "21 Apr 2026 14:22". Returns "—" for null/undefined. */
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
