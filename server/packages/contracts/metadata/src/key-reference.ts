/** Published field-key mapping. Storage names and executable queries are never accepted. */
export interface EntityKeyReference {
  readonly targetEntity: string;
  readonly labelField: string;
  readonly fields: readonly {
    readonly source: string;
    readonly target: string;
  }[];
}
export function parseEntityKeyReference(
  value: unknown,
  fieldKey?: string,
): EntityKeyReference {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("ENTITY_KEY_REFERENCE_INVALID");
    return v as Record<string, unknown>;
  };
  const key = (v: unknown) => {
    if (typeof v !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(v))
      throw Error("ENTITY_KEY_REFERENCE_INVALID");
    return v;
  };
  const row = object(value);
  if (
    Object.keys(row).some(
      (k) => !["targetEntity", "labelField", "fields"].includes(k),
    ) ||
    !Array.isArray(row.fields) ||
    !row.fields.length ||
    row.fields.length > 8
  )
    throw Error("ENTITY_KEY_REFERENCE_INVALID");
  const fields = row.fields.map((v) => {
    const m = object(v);
    if (Object.keys(m).sort().join() !== "source,target")
      throw Error("ENTITY_KEY_REFERENCE_INVALID");
    return { source: key(m.source), target: key(m.target) };
  });
  if (
    new Set(fields.map((m) => m.source)).size !== fields.length ||
    new Set(fields.map((m) => m.target)).size !== fields.length ||
    (fieldKey && !fields.some((m) => m.source === fieldKey))
  )
    throw Error("ENTITY_KEY_REFERENCE_INVALID");
  return {
    targetEntity: key(row.targetEntity),
    labelField: key(row.labelField),
    fields,
  };
}
