export interface EntityReferencePageV1 {
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    readonly recordId: string;
    readonly entityCode: string;
  }[];
  readonly nextCursor?: string;
}
export function parseEntityReferencePage(
  value: unknown,
): EntityReferencePageV1 {
  const obj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("Invalid reference page");
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max: number) => {
    if (typeof v !== "string" || !v || v.length > max)
      throw Error("Invalid reference page");
    return v;
  };
  const row = obj(value);
  if (!Array.isArray(row.options) || row.options.length > 25)
    throw Error("Invalid reference options");
  return {
    options: row.options.map((v) => {
      const option = obj(v);
      return {
        value: text(option.value, 256),
        label: text(option.label, 500),
        recordId: text(option.recordId, 128),
        entityCode: text(option.entityCode, 128),
      };
    }),
    ...(row.nextCursor === undefined
      ? {}
      : { nextCursor: text(row.nextCursor, 4096) }),
  };
}
import { entityRecordHref } from "./entity-record-href";

export interface ResolvedEntityReferenceV1 {
  readonly entityCode: string;
  readonly recordId: string;
  readonly label: string;
  readonly value: string;
}

/** Only coordinates for fields included in the authorized record projection. */
export function parseResolvedEntityReferences(
  input: unknown,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, ResolvedEntityReferenceV1>> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Invalid resolved references");
  const output: Record<string, ResolvedEntityReferenceV1> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.hasOwn(values, key)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new TypeError("Invalid resolved reference");
    const ref = raw as Record<string, unknown>;
    if (
      typeof ref.entityCode !== "string" ||
      typeof ref.recordId !== "string" ||
      typeof ref.label !== "string" ||
      !ref.label.trim() ||
      ref.label.length > 500 ||
      typeof ref.value !== "string" ||
      ref.value !== values[key]
    )
      throw new TypeError("Invalid resolved reference");
    entityRecordHref(ref.entityCode, ref.recordId);
    output[key] = Object.freeze({
      entityCode: ref.entityCode,
      recordId: ref.recordId,
      label: ref.label,
      value: ref.value,
    });
  }
  return Object.freeze(output);
}
