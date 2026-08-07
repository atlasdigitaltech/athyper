export type NumberingTransformKind = "upper" | "lower" | "none";

/**
 * Apply a transform to a resolved field value before passing it as scopeKey
 * or inside contextFields. Kept here so transform intent is declared once,
 * not scattered across every allocation call site.
 */
export function applyTransform(value: string, transform: NumberingTransformKind): string {
  if (transform === "upper") return value.toUpperCase();
  if (transform === "lower") return value.toLowerCase();
  return value;
}
