import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type NormalizedCoreRow,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson, sha256 } from "./deterministic.js";
import { validateConversionJsonData } from "./normalized-core-codec.js";
export interface LegacyDetailFieldSection {
  readonly key: string;
  readonly label: string;
  readonly localizedLabel?: {
    readonly labelKey: string;
    readonly defaultText: string;
  };
  readonly fields: readonly string[];
}
export interface NativeDetailFieldSections {
  readonly sections: readonly NormalizedLayoutRow<"section">[];
  readonly bindings: readonly NormalizedLayoutRow<"binding">[];
}
export interface NativeDetailSectionsContext {
  readonly surface: NormalizedCoreRow<"surface">;
  readonly maximumMembers: number;
  readonly fields: readonly {
    id: string;
    key: string;
    uuid: boolean;
    representation: "plain" | "masked" | "omitted";
  }[];
  /** Projection supplied by the admitted owned-label reader. */
  label(id: string): {
    readonly label: string;
    readonly localizedLabel?: {
      readonly labelKey: string;
      readonly defaultText: string;
    };
  };
}
const fail = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
function context(c: NativeDetailSectionsContext) {
  validateNormalizedCoreRow("surface", c.surface);
  validateFoundationNode(
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: referenceUuid,
          key: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
          uuid: { type: "boolean" },
          representation: {
            anyOf: [
              { const: "plain" },
              { const: "masked" },
              { const: "omitted" },
            ],
          },
        },
      },
    },
    c.fields,
    "/context/fields",
  );
  if (
    c.surface.surfaceKind !== "detail" ||
    !Number.isSafeInteger(c.maximumMembers) ||
    c.maximumMembers < 1 ||
    new Set(c.fields.map((f) => f.id)).size !== c.fields.length ||
    new Set(c.fields.map((f) => f.key)).size !== c.fields.length
  )
    fail("NATIVE_DETAIL_SECTION_CONTEXT_INVALID", "/context");
}
function source(
  value: unknown,
): asserts value is readonly LegacyDetailFieldSection[] {
  validateConversionJsonData(value, "/sections");
  validateFoundationNode(
    {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          key: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
          label: { type: "string", minLength: 1, maxLength: 160 },
          localizedLabel: {
            type: "object",
            properties: {
              labelKey: { type: "string", minLength: 1, maxLength: 160 },
              defaultText: { type: "string", minLength: 1, maxLength: 160 },
            },
          },
          fields: {
            type: "array",
            minItems: 1,
            items: { type: "string", pattern: "^[a-z][a-z0-9_.-]{0,126}$" },
          },
        },
        required: ["key", "label", "fields"],
      },
    },
    value,
    "/sections",
  );
  const sections = value as readonly LegacyDetailFieldSection[];
  if (
    new Set(sections.map((s) => s.key)).size !== sections.length ||
    sections.some((s) => new Set(s.fields).size !== s.fields.length)
  )
    fail("NATIVE_DETAIL_SECTION_DUPLICATE", "/sections");
}
/** Selected inline field sections only; navigation and full display/geometry
 * compilation are separate typed projections composed by the graph compiler. */
export function compileNativeDetailFieldSections(
  g: NativeDetailFieldSections,
  c: NativeDetailSectionsContext,
  sectionOrder?: readonly string[],
): readonly LegacyDetailFieldSection[] {
  context(c);
  validateConversionJsonData(g, "/sections");
  if (
    !g ||
    Object.keys(g).sort().join() !== "bindings,sections" ||
    !Array.isArray(g.sections) ||
    !Array.isArray(g.bindings)
  )
    fail("NATIVE_DETAIL_SECTION_INVENTORY_INVALID", "/sections");
  if (
    g.sections.length + g.bindings.length > c.maximumMembers ||
    !g.sections.length ||
    new Set([...g.sections, ...g.bindings].map((r) => r.id)).size !==
      g.sections.length + g.bindings.length
  )
    fail("NATIVE_DETAIL_SECTION_INVENTORY_INVALID", "/sections");
  for (const s of g.sections) {
    validateNormalizedLayoutRow("section", s);
    if (
      s.entitySurfaceId !== c.surface.id ||
      s.parentSectionId !== null ||
      s.contentKind !== "fields" ||
      s.sectionKind !== "section" ||
      s.labelId === null
    )
      fail("NATIVE_DETAIL_SECTION_KIND_UNSUPPORTED", "/sections/" + s.id);
  }
  const groups = new Set(g.sections.map((s) => s.navigationGroupId));
  let sections: readonly NormalizedLayoutRow<"section">[];
  if (sectionOrder) {
    if (
      sectionOrder.length !== g.sections.length ||
      new Set(sectionOrder).size !== sectionOrder.length
    )
      fail("NATIVE_DETAIL_SECTION_ORDER_INVALID", "/sections");
    sections = sectionOrder.map(
      (id) =>
        g.sections.find((s) => s.id === id) ??
        fail("NATIVE_DETAIL_SECTION_ORDER_INVALID", "/sections"),
    );
  } else {
    if (groups.size !== 1)
      fail("NATIVE_DETAIL_SECTION_ORDER_REQUIRED", "/sections");
    sections = [...g.sections].sort((a, b) => a.position - b.position);
  }
  for (const group of groups) {
    const rows = g.sections
      .filter((s) => s.navigationGroupId === group)
      .sort((a, b) => a.position - b.position);
    if (rows.some((s, i) => s.position !== i + 1))
      fail("NATIVE_DETAIL_SECTION_ORDER_INVALID", "/sections");
  }
  for (const b of g.bindings) {
    validateNormalizedLayoutRow("binding", b);
    if (
      b.entitySurfaceId !== c.surface.id ||
      b.overlayId !== null ||
      b.bindingKind !== "field" ||
      !g.sections.some((s) => s.id === b.entitySurfaceSectionId)
    )
      fail("NATIVE_DETAIL_SECTION_BINDING_SCOPE_INVALID", "/bindings/" + b.id);
  }
  const out = sections.map((s) => {
    const bindings = g.bindings
      .filter((b) => b.entitySurfaceSectionId === s.id)
      .sort((a, b) => a.position - b.position);
    if (!bindings.length || bindings.some((b, i) => b.position !== i + 1))
      fail("NATIVE_DETAIL_SECTION_ORDER_INVALID", "/bindings/" + s.id);
    const fields = bindings.map((b) => {
      const f = c.fields.find((f) => f.id === b.entityFieldId);
      if (!f || f.uuid || f.representation !== "plain")
        return fail("NATIVE_DETAIL_SECTION_FIELD_DENIED", "/bindings/" + b.id);
      return f.key;
    });
    return { key: s.sectionKey, ...c.label(s.labelId!), fields };
  });
  source(out);
  return out;
}
export function convertLegacyDetailFieldSections(
  value: unknown,
  c: NativeDetailSectionsContext,
  mapping: {
    readonly sourceHash: string;
    readonly sections: Readonly<Record<string, NormalizedLayoutRow<"section">>>;
    readonly bindings: Readonly<
      Record<string, Readonly<Record<string, NormalizedLayoutRow<"binding">>>>
    >;
  },
): NativeDetailFieldSections {
  context(c);
  source(value);
  if (sha256(value) !== mapping.sourceHash)
    fail("NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH", "/sections");
  const inventory = (keys: readonly string[], expected: readonly string[]) => {
    if (canonicalJson([...keys].sort()) !== canonicalJson([...expected].sort()))
      fail("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID", "/mapping");
  };
  inventory(
    Object.keys(mapping.sections),
    value.map((s) => s.key),
  );
  inventory(
    Object.keys(mapping.bindings),
    value.map((s) => s.key),
  );
  const sections: NormalizedLayoutRow<"section">[] = [],
    bindings: NormalizedLayoutRow<"binding">[] = [];
  const next = new Map<string | null, number>();
  for (const s of value) {
    const initialized = mapping.sections[s.key]!;
    validateNormalizedLayoutRow("section", initialized);
    const label = c.label(
      initialized.labelId ??
        fail("NATIVE_DETAIL_SECTION_LABEL_REQUIRED", "/mapping"),
    );
    const expected = {
      label: s.label,
      ...(s.localizedLabel ? { localizedLabel: s.localizedLabel } : {}),
    };
    if (canonicalJson(label) !== canonicalJson(expected))
      fail("NATIVE_DETAIL_SECTION_LABEL_MISMATCH", "/sections/" + s.key);
    if (initialized.sectionKey !== s.key)
      fail("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID", "/mapping");
    const pos = (next.get(initialized.navigationGroupId) ?? 0) + 1;
    next.set(initialized.navigationGroupId, pos);
    const section = { ...structuredClone(initialized), position: pos };
    sections.push(section);
    inventory(Object.keys(mapping.bindings[s.key]!), s.fields);
    for (const [i, key] of s.fields.entries()) {
      const field =
        c.fields.find((f) => f.key === key) ??
        fail(
          "NATIVE_DETAIL_SECTION_FIELD_DENIED",
          "/sections/" + s.key + "/" + key,
        );
      const b = mapping.bindings[s.key]![key]!;
      validateNormalizedLayoutRow("binding", b);
      if (
        b.entityFieldId !== field.id ||
        (b.entitySurfaceSectionId !== null &&
          b.entitySurfaceSectionId !== section.id)
      )
        fail("NATIVE_DETAIL_SECTION_BINDING_SCOPE_INVALID", "/mapping");
      bindings.push({
        ...structuredClone(b),
        entitySurfaceSectionId: section.id,
        position: i + 1,
      });
    }
  }
  const graph = { sections, bindings },
    compiled = compileNativeDetailFieldSections(
      graph,
      c,
      sections.map((s) => s.id),
    );
  if (canonicalJson(compiled) !== canonicalJson(value))
    fail("NATIVE_DETAIL_SECTION_NOT_LOSSLESS", "/sections");
  return graph;
}
