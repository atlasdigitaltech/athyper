/** Explicit detail field display selection; never inferred from a list binding. */
export function parseDetailFieldRenderer(
  value: unknown,
  kind: unknown,
): "text" {
  // The shared detail renderer receives localized display content, including
  // option labels and the existing semantic <time> element. Technical IDs and
  // structured/numeric types remain outside this bounded capability.
  if (
    value !== "text" ||
    !["string", "reference", "boolean", "enum", "date", "datetime"].includes(
      kind as string,
    )
  )
    throw new TypeError("DETAIL_FIELD_RENDERER_UNSUPPORTED");
  return value;
}
