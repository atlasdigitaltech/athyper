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
