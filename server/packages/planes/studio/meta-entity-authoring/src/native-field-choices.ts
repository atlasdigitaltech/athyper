import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateReferenceMember,
  validateNormalizedCoreRow,
  type MetaEntityGraph,
  type NormalizedCoreRow,
  type ReferenceMember,
} from "@athyper/server-contract-meta-entity-authoring";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
} from "./native-graph-conversion.js";
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

export interface LegacyNativeFieldChoicesAdapterInput {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly mappings: Readonly<
    Record<
      string,
      {
        readonly context: NativeFieldChoiceContext;
        readonly choices: Readonly<
          Record<string, { readonly id: string; readonly labelId: string }>
        >;
      }
    >
  >;
}
/** Correlate repeated binding declarations with one field-owned choice inventory.
 * Unaccounted display properties remain visible to subsequent adapters. */
export function createLegacyNativeFieldChoicesAdapter(
  input: LegacyNativeFieldChoicesAdapterInput,
): NativeNestedConversionAdapter {
  validateConversionJsonData(input.source, "/source");
  if (sha256(input.source) !== input.sourceHash)
    fail("NATIVE_CHOICES_SOURCE_HASH_MISMATCH", "/source");
  const sourceHash = input.sourceHash;
  const mappings = Object.fromEntries(
    Object.entries(input.mappings).map(([id, m]) => [
      id,
      {
        context: {
          ...m.context,
          field: structuredClone(m.context.field),
          domainValues:
            m.context.domainValues === null
              ? null
              : [...m.context.domainValues],
        },
        choices: structuredClone(m.choices),
      },
    ]),
  );
  const declarations = (input.source.surfaceFieldBindings ?? []).filter(
    (b) =>
      b.displayConfig &&
      (Object.hasOwn(b.displayConfig, "lookup") ||
        Object.hasOwn(b.displayConfig, "statusTones")),
  );
  const fieldIds = [...new Set(declarations.map((b) => b.entityFieldId))];
  if (
    !fieldIds.length ||
    fieldIds.some((id) => typeof id !== "string") ||
    Object.keys(mappings).sort().join() !== fieldIds.sort().join()
  )
    fail("NATIVE_CHOICES_INVENTORY_INVALID", "/mappings");
  const members = structuredClone(input.source.referenceMembers);
  if (!members)
    return fail("NATIVE_CHOICES_REFERENCE_MEMBERS_REQUIRED", "/source");
  const addedIds = Object.values(mappings).flatMap((m) =>
    Object.values(m.choices).map((c) => c.id),
  );
  if (
    new Set(addedIds).size !== addedIds.length ||
    Object.values(members.members).some((rows) =>
      rows.some((r) => addedIds.includes(r.id)),
    ) ||
    members.members.fieldChoice.some((c) =>
      Object.hasOwn(mappings, c.entityFieldId),
    )
  )
    fail(
      "NATIVE_CHOICES_CORRELATED_SOURCE_CONFLICT",
      "/source/referenceMembers",
    );
  const shapes = new Map<string, { fieldId: string; tones: boolean }>();
  const forward = (graph: MetaEntityGraph): MetaEntityGraph => {
    if (sha256(graph) !== sourceHash)
      fail("NATIVE_CHOICES_SOURCE_HASH_MISMATCH", "/source");
    const result = structuredClone(graph);
    const selected = new Map<string, LegacyFieldChoices>();
    const seenBindings = new Set<string>();
    for (const b of result.surfaceFieldBindings ?? []) {
      if (!declarations.some((d) => d.id === b.id)) continue;
      if (!b.id || seenBindings.has(b.id) || !b.entityFieldId)
        fail("NATIVE_CHOICES_BINDING_SCOPE_INVALID", "/bindings");
      seenBindings.add(b.id!);
      const m = mappings[b.entityFieldId!];
      if (
        !m ||
        m.context.field.id !== b.entityFieldId ||
        (graph.fields ?? []).filter((f) => f.id === b.entityFieldId).length !==
          1 ||
        (graph.surfaces ?? []).filter((s) => s.id === b.entitySurfaceId)
          .length !== 1
      )
        fail("NATIVE_CHOICES_BINDING_SCOPE_INVALID", "/bindings");
      const display = b.displayConfig!;
      const lookup = display.lookup as Record<string, unknown> | undefined;
      if (
        !lookup ||
        typeof lookup !== "object" ||
        Array.isArray(lookup) ||
        Object.keys(lookup).join() !== "options"
      )
        fail(
          "NATIVE_CHOICES_LOOKUP_UNSUPPORTED",
          "/bindings/displayConfig/lookup",
        );
      const value = {
        options: lookup!.options,
        tones: Object.hasOwn(display, "statusTones") ? display.statusTones : {},
      } as LegacyFieldChoices;
      const previous = selected.get(b.entityFieldId!);
      if (previous && canonicalJson(previous) !== canonicalJson(value))
        fail(
          "NATIVE_CHOICES_CORRELATED_SOURCE_CONFLICT",
          "/bindings/displayConfig",
        );
      selected.set(b.entityFieldId!, value);
      shapes.set(b.id!, {
        fieldId: b.entityFieldId!,
        tones: Object.hasOwn(display, "statusTones"),
      });
      const rest = { ...display };
      delete rest.lookup;
      delete rest.statusTones;
      (b as { displayConfig?: object }).displayConfig = rest;
      if (!Object.keys(rest).length)
        delete (b as { displayConfig?: object }).displayConfig;
    }
    const additions = [...selected].flatMap(([fieldId, source]) => {
      const m = mappings[fieldId]!;
      return convertLegacyFieldChoices(source, m.context, {
        sourceHash: sha256(source),
        choices: m.choices,
      });
    });
    (result.referenceMembers!.members as { fieldChoice: unknown }).fieldChoice =
      [...members.members.fieldChoice, ...additions];
    return result;
  };
  const preparedHash = sha256(forward(input.source));
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone(input.dependencies),
    forward,
    reverse(prepared, target) {
      if (sha256(prepared) !== preparedHash)
        fail("NATIVE_CHOICES_SOURCE_HASH_MISMATCH", "/prepared");
      if (!target.referenceMembers)
        return fail("NATIVE_CHOICES_REFERENCE_MEMBERS_REQUIRED", "/target");
      const projections = new Map<string, LegacyFieldChoices>();
      for (const [fieldId, m] of Object.entries(mappings)) {
        const fields = target.fields.filter((f) => f.id === fieldId);
        const rows = target.referenceMembers.members.fieldChoice.filter(
          (r) => r.entityFieldId === fieldId,
        );
        const expected = Object.values(m.choices)
          .map((c) => c.id)
          .sort();
        if (
          fields.length !== 1 ||
          canonicalJson(rows.map((r) => r.id).sort()) !==
            canonicalJson(expected)
        )
          fail("NATIVE_CHOICES_INVENTORY_INVALID", "/target");
        projections.set(
          fieldId,
          compileNativeFieldChoices(rows, { ...m.context, field: fields[0]! }),
        );
      }
      const result = structuredClone(prepared);
      for (const b of result.surfaceFieldBindings ?? []) {
        const shape = shapes.get(b.id ?? "");
        if (!shape) continue;
        const bindings = target.surfaceFieldBindings.filter(
          (n) =>
            n.id === b.id &&
            n.entityFieldId === shape.fieldId &&
            n.entitySurfaceId === b.entitySurfaceId,
        );
        if (bindings.length !== 1)
          fail("NATIVE_CHOICES_BINDING_SCOPE_INVALID", "/target/bindings");
        const value = projections.get(shape.fieldId)!;
        if (!shape.tones && Object.keys(value.tones).length)
          fail("NATIVE_CHOICES_REVERSE_NOT_REPRESENTABLE", "/target/tones");
        (b as { displayConfig?: object }).displayConfig = {
          ...b.displayConfig,
          lookup: { options: value.options },
          ...(shape.tones ? { statusTones: value.tones } : {}),
        };
      }
      (
        result.referenceMembers!.members as { fieldChoice: unknown }
      ).fieldChoice = result.referenceMembers!.members.fieldChoice.filter(
        (r) => !addedIds.includes(r.id),
      );
      return result;
    },
  };
}
