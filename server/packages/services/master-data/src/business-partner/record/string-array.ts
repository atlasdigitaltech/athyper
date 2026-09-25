/** Normalize native JSON arrays and JSON-encoded driver values identically. */
export function stringArray(value: unknown): readonly string[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
