/** Reads a percentage for progress displays (cards, tables, Gantt bars). A
 * number is used as is; text only when it is non-empty after trimming and
 * parses to a finite number. Anything else, including blank text, is no
 * value. The result is clamped to 0–100 and rounded. */
export function progressPercent(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : undefined;
}
