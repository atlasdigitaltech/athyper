/** Converts bytes to a human-readable size string (e.g. 1.4 KB, 2.3 MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO date string as "02 Jan 2026". Returns "—" for falsy input. */
export function fmtDate(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

/** Format an ISO date string as "02 Jan 2026 · 14:30". Returns undefined for falsy input. */
export function fmtDateTime(iso: unknown): string | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return String(iso);
  }
}

/** Format an unknown value as a 2-decimal number string. Returns undefined for non-numeric. */
export function fmtAmountMaybe(val: unknown): string | undefined {
  const n = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(n)) return undefined;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

/** Convert a snake_case or UPPER_CASE code to Title Case (e.g. "purchase_order" → "Purchase Order"). */
export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve the display symbol for a currency code ("USD" → "$", "EUR" → "€").
 *  Returns empty string when Intl falls back to the code itself. */
export function getCurrencySymbol(code: string): string {
  if (!code) return "";
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value ?? code;
    return sym === code ? "" : sym;
  } catch {
    return "";
  }
}

/** Format a numeric amount with two decimal places.
 *  Optionally appends the currency code with a leading space. */
export function fmtAmount(v: number, currencyCode?: string): string {
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

/** Format a numeric value with configurable decimal places.
 *  Returns "—" for non-numeric input (safe for table cells). */
export function fmtNum(v: unknown, dec = 2): string {
  const n = Number(v);
  return Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });
}

/** Split a formatted number string at the decimal point for xl hero display.
 *  Returns [whole, ".decimal"] — decimal is empty string when no point present. */
export function splitDecimal(s: string): [string, string] {
  const i = s.lastIndexOf(".");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i)];
}
