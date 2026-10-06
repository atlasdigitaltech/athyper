import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateReferenceMember,
  validateNormalizedCoreRow,
  type NormalizedCoreRow,
  type ReferenceMember,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export interface LegacyFieldChoices {
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly tones: Readonly<
    Record<string, "neutral" | "success" | "warning" | "danger">
  >;
}
export interface NativeFieldChoiceContext {
  readonly field: NormalizedCoreRow<"field">;
  readonly maximumChoices: number;
  /** Exact admitted domain membership, or null for field-owned choices. */
  readonly domainValues: readonly string[] | null;
  /** Admitted owned-label resolver, not text cached from the legacy source. */
  labelText(id: string): string;
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function context(c: NativeFieldChoiceContext) {
  validateNormalizedCoreRow("field", c.field);
  if (
    c.field.dataType !== "enum" ||
    !Number.isSafeInteger(c.maximumChoices) ||
    c.maximumChoices < 1
  )
    fail("NATIVE_CHOICES_CONTEXT_INVALID", "/context");
  if (
    (c.field.domainCode === null) !== (c.domainValues === null) ||
    (c.domainValues !== null &&
      (!Array.isArray(c.domainValues) ||
        c.domainValues.some((v) => typeof v !== "string") ||
        new Set(c.domainValues).size !== c.domainValues.length))
  )
    fail("NATIVE_CHOICES_DOMAIN_EVIDENCE_REQUIRED", "/context/domainValues");
}
/** One release-compiler projection, not an enum/domain authority or release. */
export function compileNativeFieldChoices(
  rows: readonly ReferenceMember<"fieldChoice">[],
  c: NativeFieldChoiceContext,
): LegacyFieldChoices {
  validateConversionJsonData(rows, "/choices");
  if (!Array.isArray(rows))
    return fail("NATIVE_CHOICES_SOURCE_INVALID", "/choices");
  if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)))
    return fail("NATIVE_CHOICES_SOURCE_INVALID", "/choices");
  context(c);
  if (rows.length > c.maximumChoices) fail("NATIVE_CHOICES_LIMIT", "/choices");
  const sorted = [...rows].sort((a, b) => a.position - b.position),
    ids = new Set<string>(),
    values = new Set<string>();
  const options: { value: string; label: string }[] = [],
    tones: Record<string, "neutral" | "success" | "warning" | "danger"> = {};
  for (const [i, row] of sorted.entries()) {
    validateConversionJsonData(row, "/choice");
    validateFoundationNode(referenceUuid, row.id, "/choice/id");
    const { id: _, ...properties } = row;
    validateReferenceMember("fieldChoice", properties);
    if (
      row.entityFieldId !== c.field.id ||
      ids.has(row.id) ||
      values.has(row.valueText) ||
      row.position !== i + 1
    )
      fail("NATIVE_CHOICES_SCOPE_ORDER_INVALID", "/choice");
    ids.add(row.id);
    values.add(row.valueText);
    if (c.domainValues !== null && !c.domainValues.includes(row.valueText))
      fail("NATIVE_CHOICES_DOMAIN_VALUE_INVALID", "/choice/valueText");
    const label = c.labelText(row.labelId);
    if (typeof label !== "string" || !label.trim())
      fail("NATIVE_CHOICES_LABEL_EVIDENCE_REQUIRED", "/choice/labelId");
    options.push({ value: row.valueText, label });
    if (row.tone !== null)
      Object.defineProperty(tones, row.valueText, {
        value: row.tone,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return { options, tones };
}
/** Selected lookup options and tones only. Unknown surrounding displayConfig
 * declarations still require separate accounted mappings. */
export function convertLegacyFieldChoices(
  source: LegacyFieldChoices,
  c: NativeFieldChoiceContext,
  mapping: {
    readonly sourceHash: string;
    readonly choices: Readonly<
      Record<string, { readonly id: string; readonly labelId: string }>
    >;
  },
): readonly ReferenceMember<"fieldChoice">[] {
  context(c);
  validateConversionJsonData(source, "/source");
  validateConversionJsonData(mapping, "/mapping");
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    Object.keys(source).sort().join() !== "options,tones" ||
    !Array.isArray(source.options) ||
    !source.tones ||
    typeof source.tones !== "object" ||
    Array.isArray(source.tones)
  )
    fail("NATIVE_CHOICES_SOURCE_INVALID", "/source");
  if (source.options.length > c.maximumChoices)
    fail("NATIVE_CHOICES_LIMIT", "/options");
  if (sha256(source) !== mapping.sourceHash)
    fail("NATIVE_CHOICES_SOURCE_HASH_MISMATCH", "/source");
  for (const option of source.options)
    validateFoundationNode(
      {
        type: "object",
        properties: {
          value: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
        },
      },
      option,
      "/option",
    );
  const keys = source.options.map((o) => o.value);
  if (
    new Set(keys).size !== keys.length ||
    Object.keys(mapping.choices).sort().join() !== [...keys].sort().join() ||
    Object.keys(source.tones).some((key) => !keys.includes(key))
  )
    fail("NATIVE_CHOICES_INVENTORY_INVALID", "/choices");
  const result = source.options.map(
    (option, i): ReferenceMember<"fieldChoice"> => {
      validateFoundationNode(
        {
          type: "object",
          properties: {
            value: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
          },
        },
        option,
        "/option",
      );
      const entry = mapping.choices[option.value];
      if (!entry) return fail("NATIVE_CHOICES_INVENTORY_INVALID", "/choices");
      return {
        id: entry.id,
        entityFieldId: c.field.id,
        valueText: option.value,
        labelId: entry.labelId,
        tone: Object.hasOwn(source.tones, option.value)
          ? source.tones[option.value]!
          : null,
        position: i + 1,
      };
    },
  );
  if (
    canonicalJson(compileNativeFieldChoices(result, c)) !==
    canonicalJson(source)
  )
    fail("NATIVE_CHOICES_LABEL_SOURCE_MISMATCH", "/source");
  return result;
}
