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
