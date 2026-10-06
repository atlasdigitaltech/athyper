import {
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
  validateNormalizedCoreRow,
  validateNormalizedLayoutRow,
  type MetaEntityGraph,
  type NormalizedCoreRow,
  type NormalizedLayoutRow,
} from "@athyper/server-contract-meta-entity-authoring";
import type {
  NativeConversionResource,
  NativeNestedConversionAdapter,
  NativeSectionDerivation,
  NativeBindingRetirement,
} from "./native-graph-conversion.js";
import { validateNativeBindingRetirements } from "./native-graph-conversion.js";
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

/** Graph enrollment for explicit inline field sections. Every existing detail
 * binding must have one declared membership: inert/technical legacy bindings
 * require a separate explicit retirement conversion, never implicit deletion. */
export function createLegacyNativeDetailSectionsAdapter(input: {
  readonly source: MetaEntityGraph;
  readonly sourceHash: string;
  readonly resource: NativeConversionResource;
  readonly dependencies: readonly NativeConversionResource[];
  readonly positionConvention: "zero-based" | "one-based";
  readonly bindingRetirements?: readonly NativeBindingRetirement[];
  readonly mappings: Readonly<
    Record<
      string,
      {
        readonly context: NativeDetailSectionsContext;
        readonly sections: Readonly<
          Record<string, NormalizedLayoutRow<"section">>
        >;
        readonly bindings: Readonly<
          Record<
            string,
            Readonly<Record<string, NormalizedLayoutRow<"binding">>>
          >
        >;
      }
    >
  >;
}): NativeNestedConversionAdapter {
  validateConversionJsonData(input.source, "/source");
  const sourceHash = input.sourceHash;
  const historicalBindings = structuredClone(
    input.source.surfaceFieldBindings ?? [],
  );
  const retirements = structuredClone(input.bindingRetirements ?? []);
  validateNativeBindingRetirements(input.source, retirements);
  if (sha256(input.source) !== sourceHash)
    fail("NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH", "/source");
  if (!["zero-based", "one-based"].includes(input.positionConvention))
    fail(
      "NATIVE_DETAIL_SECTION_POSITION_SOURCE_REQUIRED",
      "/positionConvention",
    );
  const shift = input.positionConvention === "zero-based" ? 1 : 0;
  const enrolled = (input.source.surfaces ?? []).filter(
    (s) =>
      s.layoutConfig?.recordPresentation &&
      Object.hasOwn(s.layoutConfig.recordPresentation as object, "sections"),
  );
  if (
    !enrolled.length ||
    new Set(enrolled.map((s) => s.id)).size !== enrolled.length ||
    Object.keys(input.mappings).sort().join() !==
      enrolled
        .map((s) => s.id)
        .sort()
        .join()
  )
    fail("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID", "/mappings");
  if (!Array.isArray(input.source.surfaceSections))
    fail("NATIVE_DETAIL_SECTION_ROW_INVENTORY_REQUIRED", "/surfaceSections");
  const mappings = Object.fromEntries(
    Object.entries(input.mappings).map(([id, m]) => [
      id,
      {
        context: {
          ...m.context,
          surface: structuredClone(m.context.surface),
          fields: structuredClone(m.context.fields),
        },
        sections: structuredClone(m.sections),
        bindings: structuredClone(m.bindings),
      },
    ]),
  );
  const sectionDerivations: NativeSectionDerivation[] = [];
  const positions = new Map<
    string,
    {
      position: number;
      sectionPresent: boolean;
      sectionId: string | null | undefined;
      visible: boolean;
    }
  >();
  const selectedSections = new Map<string, string[]>();
  const selectedBindings = new Map<string, string[]>();
  const forward = (graph: MetaEntityGraph): MetaEntityGraph => {
    validateConversionJsonData(graph, "/source");
    if (sha256(graph) !== sourceHash)
      fail("NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH", "/source");
    const result = structuredClone(graph);
    (result as { surfaceFieldBindings: unknown }).surfaceFieldBindings =
      result.surfaceFieldBindings?.filter(
        (b) => !retirements.some((r) => r.id === b.id),
      );
    sectionDerivations.length = 0;
    const additions: NonNullable<MetaEntityGraph["surfaceSections"]>[number][] =
      [];
    for (const surface of result.surfaces ?? []) {
      const m = mappings[surface.id ?? ""];
      if (!m) continue;
      if (
        surface.surfaceKind !== "detail" ||
        m.context.surface.id !== surface.id ||
        result.surfaceSections!.some((s) => s.entitySurfaceId === surface.id)
      )
        fail(
          "NATIVE_DETAIL_SECTION_CORRELATED_SOURCE_CONFLICT",
          "/surfaceSections",
        );
      const record = surface.layoutConfig!.recordPresentation as Record<
        string,
        unknown
      >;
      const sections = record.sections;
      for (const field of m.context.fields) {
        const matches = graph.fields.filter((f) => f.id === field.id);
        if (
          matches.length !== 1 ||
          matches[0]!.fieldKey !== field.key ||
          (matches[0]!.dataType === "uuid") !== field.uuid
        )
          fail(
            "NATIVE_DETAIL_SECTION_FIELD_CONTEXT_MISMATCH",
            "/context/fields",
          );
      }
      const converted = convertLegacyDetailFieldSections(sections, m.context, {
        sourceHash: sha256(sections),
        sections: m.sections,
        bindings: m.bindings,
      });
      const bindings = (result.surfaceFieldBindings ?? []).filter(
        (b) => b.entitySurfaceId === surface.id,
      );
      if (
        bindings.length !== converted.bindings.length ||
        new Set(bindings.map((b) => b.id)).size !== bindings.length ||
        converted.bindings.some(
          (n) =>
            bindings.filter(
              (b) => b.id === n.id && b.entityFieldId === n.entityFieldId,
            ).length !== 1,
        )
      )
        fail(
          "NATIVE_DETAIL_SECTION_UNASSIGNED_BINDING",
          "/surfaceFieldBindings",
        );
      selectedBindings.set(
        surface.id!,
        bindings.map((b) => b.id!),
      );
      selectedSections.set(
        surface.id!,
        converted.sections.map((s) => s.id),
      );
      for (const [i, s] of converted.sections.entries()) {
        sectionDerivations.push({
          id: s.id,
          surfaceId: surface.id!,
          sourceIndex: i,
          sourceHash: sha256((sections as readonly unknown[])[i]),
        });
        additions.push({
          id: s.id,
          entitySurfaceId: s.entitySurfaceId,
          sectionKey: s.sectionKey,
          title: m.context.label(s.labelId!).label,
          sectionKind: "section",
          position: s.position - shift,
          columnCount: s.columnCount,
          collapsible: s.collapsible,
          collapsedByDefault: s.collapsedByDefault,
        });
      }
      for (const b of bindings) {
        const n = converted.bindings.find((n) => n.id === b.id)!;
        if (
          !Number.isSafeInteger(b.position) ||
          b.position < (shift ? 0 : 1) ||
          b.entitySurfaceSectionId != null
        )
          fail(
            "NATIVE_DETAIL_SECTION_CORRELATED_SOURCE_CONFLICT",
            "/surfaceFieldBindings",
          );
        const visible = Object.hasOwn(b.displayConfig ?? {}, "defaultVisible");
        if (visible && b.displayConfig!.defaultVisible !== true)
          fail(
            "NATIVE_DETAIL_SECTION_CORRELATED_SOURCE_CONFLICT",
            "/surfaceFieldBindings/displayConfig/defaultVisible",
          );
        positions.set(b.id!, {
          position: b.position,
          sectionPresent: Object.hasOwn(b, "entitySurfaceSectionId"),
          sectionId: b.entitySurfaceSectionId,
          visible,
        });
        Object.assign(b, {
          entitySurfaceSectionId: n.entitySurfaceSectionId,
          position: n.position - shift,
        });
        if (visible) {
          const rest = { ...b.displayConfig };
          delete rest.defaultVisible;
          (b as { displayConfig?: object }).displayConfig = rest;
          if (!Object.keys(rest).length)
            delete (b as { displayConfig?: object }).displayConfig;
        }
      }
      const rest = { ...record };
      delete rest.sections;
      const config = { ...surface.layoutConfig, recordPresentation: rest };
      if (!Object.keys(rest).length)
        delete (config as { recordPresentation?: object }).recordPresentation;
      (surface as { layoutConfig?: object }).layoutConfig = config;
      if (!Object.keys(config).length)
        delete (surface as { layoutConfig?: object }).layoutConfig;
    }
    (result as { surfaceSections: unknown }).surfaceSections = [
      ...result.surfaceSections!,
      ...additions,
    ];
    if (
      new Set(additions.map((s) => s.id)).size !== additions.length ||
      additions.some((s) => graph.surfaceSections!.some((n) => n.id === s.id))
    )
      fail("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID", "/mappings");
    return result;
  };
  const preparedHash = sha256(forward(input.source));
  const derivations = structuredClone(sectionDerivations);
  return {
    resource: structuredClone(input.resource),
    dependencies: structuredClone(input.dependencies),
    sectionDerivations: derivations,
    ...(retirements.length
      ? { bindingRetirements: structuredClone(retirements) }
      : {}),
    forward,
    reverse(prepared, target) {
      if (
        target.surfaceFieldBindings.some((b) =>
          retirements.some((r) => r.id === b.id),
        )
      )
        fail(
          "NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID",
          "/target/bindings",
        );
      if (sha256(prepared) !== preparedHash)
        fail("NATIVE_DETAIL_SECTION_SOURCE_HASH_MISMATCH", "/prepared");
      const result = structuredClone(prepared);
      for (const [surfaceId, m] of Object.entries(mappings)) {
        const sectionIds = selectedSections.get(surfaceId)!;
        const sections = target.surfaceSections.filter(
          (s) => s.entitySurfaceId === surfaceId,
        );
        // A later badge adapter may add independently accounted memberships on
        // the same surface. Inline sections own only the exact field roster.
        const bindings = target.surfaceFieldBindings.filter(
          (b) => b.entitySurfaceId === surfaceId && b.bindingKind === "field",
        );
        if (
          sections.length !== sectionIds.length ||
          sections.some((s) => !sectionIds.includes(s.id)) ||
          canonicalJson(bindings.map((b) => b.id).sort()) !==
            canonicalJson([...selectedBindings.get(surfaceId)!].sort())
        )
          fail("NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID", "/target");
        // The legacy inline shape cannot carry new geometry/control properties.
        // Preserve independently admitted initialization rather than lose edits.
        const represented = new Set([
          "id",
          "sectionKey",
          "labelId",
          "position",
          "navigationGroupId",
        ]);
        for (const section of sections) {
          const initialized = Object.values(m.sections).find(
            (s) => s.id === section.id,
          )!;
          for (const key of Object.keys(initialized))
            if (
              !represented.has(key) &&
              canonicalJson(Reflect.get(section, key)) !==
                canonicalJson(Reflect.get(initialized, key))
            )
              fail(
                "NATIVE_DETAIL_SECTION_REVERSE_NOT_REPRESENTABLE",
                "/target/sections/" + key,
              );
        }
        const compiled = compileNativeDetailFieldSections(
          { sections, bindings },
          m.context,
          sectionIds,
        );
        const surface = result.surfaces!.find((s) => s.id === surfaceId)!;
        (surface as { layoutConfig?: object }).layoutConfig = {
          ...surface.layoutConfig,
          recordPresentation: {
            ...(surface.layoutConfig?.recordPresentation as object),
            sections: compiled,
          },
        };
        for (const b of result.surfaceFieldBindings ?? []) {
          if (b.entitySurfaceId !== surfaceId) continue;
          const shape = positions.get(b.id ?? "");
          if (
            !shape ||
            bindings.filter(
              (n) => n.id === b.id && n.entityFieldId === b.entityFieldId,
            ).length !== 1
          )
            fail(
              "NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID",
              "/target/bindings",
            );
          Object.assign(b, { position: shape!.position });
          if (shape!.sectionPresent)
            Object.assign(b, { entitySurfaceSectionId: shape!.sectionId });
          else
            delete (b as { entitySurfaceSectionId?: string | null })
              .entitySurfaceSectionId;
          if (shape!.visible)
            (b as { displayConfig?: object }).displayConfig = {
              ...b.displayConfig,
              defaultVisible: true,
            };
        }
      }
      (result as { surfaceSections: unknown }).surfaceSections =
        result.surfaceSections!.filter(
          (s) => !derivations.some((d) => d.id === s.id),
        );
      if (retirements.length) {
        // Reconstruct historical compatibility only from the exact immutable
        // source pinned by this adapter. No backup blob enters target authoring.
        const retired = historicalBindings.filter((b) =>
          retirements.some((r) => r.id === b.id),
        );
        const rows = [
          ...result.surfaceFieldBindings!,
          ...structuredClone(retired),
        ];
        (result as { surfaceFieldBindings: unknown }).surfaceFieldBindings =
          historicalBindings.map((original) => {
            const matches = rows.filter((b) => b.id === original.id);
            if (matches.length !== 1)
              fail(
                "NATIVE_DETAIL_SECTION_MAPPING_INVENTORY_INVALID",
                "/target/bindings",
              );
            return matches[0]!;
          });
      }
      return result;
    },
  };
}
