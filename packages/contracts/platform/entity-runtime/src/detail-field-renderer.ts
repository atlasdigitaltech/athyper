/** Explicit detail field display selection; never inferred from a list binding. */
export function parseDetailFieldRenderer(
  value: unknown,
  kind: unknown,
): "text" {
  if (value !== "text" || (kind !== "string" && kind !== "reference"))
    throw new TypeError("DETAIL_FIELD_RENDERER_UNSUPPORTED");
  return value;
}
