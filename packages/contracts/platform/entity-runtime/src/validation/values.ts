/** Shape predicates only. Callers retain their own error codes and domain rules. */
export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Length is checked before trimming, matching the existing label contracts. */
export function isBoundedNonBlankText(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximum &&
    value.trim().length > 0
  );
}
