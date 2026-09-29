/** Internal immutable collection envelope. Providers must derive this declaration
 * from a pinned, qualified metadata binding, never request-supplied coordinates. */
export interface CollectionCaptureDefinition {
  readonly key: string;
  readonly sourceEntity: string;
  readonly sourceContract: string;
  /** Stable semantic scope pin, including capture filters and ownership rules. */
  readonly scope: string;
  readonly identityField: string;
  readonly targetField?: string;
  readonly fields: readonly {
    readonly key: string;
    readonly comparison: "json" | "decimal";
  }[];
}
export interface CollectionCapture {
  readonly schema: "athyper.collection-capture/1";
  readonly subject: {
    readonly tenantId: string;
    readonly plane: string;
    readonly entityCode: string;
    readonly recordId: string;
  };
  readonly definition: CollectionCaptureDefinition;
  readonly coverage: "complete" | "partial" | "unknown" | "not_captured";
  readonly consistency: "root_transaction" | "consistent_read" | "independent";
  /** Root-transaction captures inherit the persisted parent snapshot time.
   * Independent/consistent-read sources must supply their observation time. */
  readonly capturedAt?: string;
  readonly records: readonly Readonly<Record<string, unknown>>[];
}
const key = /^[a-zA-Z][a-zA-Z0-9_.-]{0,126}$/;
const own = (value: object, property: string) => Object.hasOwn(value, property);
function invalid(): never {
  throw Error("COLLECTION_CAPTURE_INVALID");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    invalid();
  return value;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k))) invalid();
}
/** IDs are opaque, stable strings. Row order and labels are never fallback IDs. */
export function collectionRecordId(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string {
  if (!own(record, field)) invalid();
  return text(record[field]);
}

/** Strictly validate stored or newly built envelopes, including provider limits.
 * No legacy array receives a fabricated completeness or identity declaration. */
export function parseCollectionCapture(
  value: unknown,
  maximumRecords = 1000,
): CollectionCapture {
  if (
    !Number.isSafeInteger(maximumRecords) ||
    maximumRecords < 1 ||
    maximumRecords > 10000
  )
    invalid();
  const envelope = object(value);
  exact(envelope, [
    "schema",
    "subject",
    "definition",
    "coverage",
    "consistency",
    "capturedAt",
    "records",
  ]);
  if (envelope.schema !== "athyper.collection-capture/1") invalid();
  const subject = object(envelope.subject);
  exact(subject, ["tenantId", "plane", "entityCode", "recordId"]);
  for (const field of ["tenantId", "plane", "entityCode", "recordId"])
    text(subject[field]);
  const definition = object(envelope.definition);
  exact(definition, [
    "key",
    "sourceEntity",
    "sourceContract",
    "scope",
    "identityField",
    "targetField",
    "fields",
  ]);
  for (const field of [
    "key",
    "sourceEntity",
    "sourceContract",
    "scope",
    "identityField",
  ])
    text(definition[field]);
  if (definition.targetField !== undefined) text(definition.targetField);
  if (
    !Array.isArray(definition.fields) ||
    !definition.fields.length ||
    definition.fields.length > 256
  )
    invalid();
  const fields = new Set<string>();
  for (const raw of definition.fields) {
    const field = object(raw);
    exact(field, ["key", "comparison"]);
    const name = text(field.key);
    if (
      !key.test(name) ||
      ["__proto__", "constructor", "prototype"].includes(name) ||
      fields.has(name) ||
      !["json", "decimal"].includes(String(field.comparison))
    )
      invalid();
    fields.add(name);
  }
  if (
    !fields.has(String(definition.identityField)) ||
    (definition.targetField !== undefined &&
      !fields.has(String(definition.targetField)))
  )
    invalid();
  if (
    !["complete", "partial", "unknown", "not_captured"].includes(
      String(envelope.coverage),
    ) ||
    !["root_transaction", "consistent_read", "independent"].includes(
      String(envelope.consistency),
    )
  )
    invalid();
  if (
    envelope.capturedAt !== undefined ||
    envelope.consistency !== "root_transaction"
  ) {
    if (!Number.isFinite(Date.parse(text(envelope.capturedAt)))) invalid();
  }
  if (
    !Array.isArray(envelope.records) ||
    envelope.records.length > maximumRecords ||
    (envelope.coverage === "not_captured" && envelope.records.length)
  )
    invalid();
  const identities = new Set<string>();
  for (const raw of envelope.records) {
    const record = object(raw);
    if (Object.keys(record).some((k) => !fields.has(k))) invalid();
    const id = collectionRecordId(record, String(definition.identityField));
    if (identities.has(id))
      throw Error("COLLECTION_CAPTURE_DUPLICATE_IDENTITY");
    identities.add(id);
    if (definition.targetField !== undefined)
      collectionRecordId(record, String(definition.targetField));
    // Ensure payload is JSON data; reject undefined/non-finite values rather than
    // silently dropping them and confusing empty with not captured.
    for (const [name, v] of Object.entries(record)) {
      canonicalJson(v);
      if (
        definition.fields.some(
          (raw) =>
            object(raw).key === name && object(raw).comparison === "decimal",
        ) &&
        v !== null
      )
        canonicalDecimal(v);
    }
  }
  return value as CollectionCapture;
}
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 32) invalid();
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k], depth + 1)}`,
      )
      .join(",")}}`;
  return invalid();
}
/** Exact decimal comparison, avoiding conversion of precise decimal strings to floats. */
export function canonicalDecimal(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") invalid();
  if (typeof value === "number" && !Number.isSafeInteger(value)) invalid();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(
    String(value),
  );
  if (!match) invalid();
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) invalid();
  let digits = (match[2]! + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let scale = (match[3]?.length ?? 0) - exponent;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    scale--;
  }
  return `${match[1] === "-" ? "-" : ""}${digits}e${-scale}`;
}
