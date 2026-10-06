import { validateFoundationNode } from "./foundation-contract.js";
import {
  parseNormalizedCoreGraph,
  type NormalizedCoreContext,
} from "./normalized-core-validation.js";
import {
  normalizedCoreFailure as fail,
  type NormalizedCoreGraph,
} from "./normalized-core-contract.js";
import {
  normalizedLayoutRowNode,
  type NormalizedLayoutGraph,
  type NormalizedLayoutRow,
} from "./normalized-layout-contract.js";
/** Independently resolved resource projections. These are component validation
 * inputs, never user-authored grants, deployment receipts or activation proof. */
export interface NormalizedLayoutContext {
  readonly core: NormalizedCoreGraph;
  readonly coreContext: NormalizedCoreContext;
  readonly maxMembers: number;
  readonly navigationGroups: readonly {
    readonly id: string;
    readonly entitySurfaceId: string;
    readonly position: number;
  }[];
  readonly overlays: readonly {
    readonly id: string;
    readonly tenantId: string;
    readonly columnCount: number;
    readonly surfaceKind: "form" | "list" | "detail";
    readonly permittedFieldIds: readonly string[];
  }[];
  readonly components: readonly {
    readonly id: string;
    readonly level:
      | "section"
      | "field_display"
      | "field_input"
      | "field_filter"
      | "field_format";
    readonly surfaceKinds: readonly string[];
    readonly dataTypes: readonly string[];
    readonly cardinalities: readonly string[];
    readonly options: readonly (
      "textWrap" | "fractionDigits" | "dateStyle" | "emptyTextLabelId"
    )[];
    readonly filterOperators: readonly string[];
    readonly compatibleDisplayIds: readonly string[];
    readonly maskedRepresentationSafe: boolean;
  }[];
  readonly capabilityLayouts: readonly {
    readonly capabilityId: string;
    readonly bindingId: string;
    readonly surfaceKinds: readonly string[];
  }[];
  readonly relatedTargets: readonly {
    readonly id: string;
    readonly cardinalities: readonly string[];
    readonly surfaces: readonly {
      readonly key: string;
      readonly kind: "embedded";
      readonly mode: "collection" | "sectioned";
      readonly viewKeys: readonly string[];
    }[];
    readonly readOperationKeys: readonly string[];
    readonly createOperationKeys: readonly string[];
  }[];
  readonly fieldPresentation: readonly {
    readonly fieldId: string;
    readonly display: "plain" | "masked" | "omitted";
    readonly queryUses: readonly string[];
    readonly filterOperators: readonly string[];
    readonly inputSurfaceIds: readonly string[];
    readonly referenceSurfaceKeys: readonly string[];
    readonly referenceLoadModes: readonly ("eager" | "lazy")[];
  }[];
}
const foreign = (id: string | null, ids: readonly string[], path: string) => {
  if (id !== null && !ids.includes(id))
    fail("NORMALIZED_LAYOUT_FOREIGN_REFERENCE", path);
};
function dense(groups: Map<string, number[]>, path: string) {
  for (const positions of groups.values()) {
    const ordered = [...positions].sort((a, b) => a - b);
    if (ordered.some((p, i) => p !== i + 1))
      fail("NORMALIZED_LAYOUT_ORDER_INVALID", path);
  }
}
function add(
  groups: Map<string, number[]>,
  key: readonly unknown[],
  position: number,
) {
  const k = JSON.stringify(key),
    values = groups.get(k) ?? [];
  values.push(position);
  groups.set(k, values);
}
export function parseNormalizedLayoutGraph(
  input: unknown,
  context: NormalizedLayoutContext,
): NormalizedLayoutGraph {
  validateFoundationNode(
    {
      type: "object",
      properties: {
        section: { type: "array", items: normalizedLayoutRowNode("section") },
        binding: { type: "array", items: normalizedLayoutRowNode("binding") },
      },
    },
    input,
    "",
  );
  const core = parseNormalizedCoreGraph(context.core, context.coreContext);
  const graph = input as NormalizedLayoutGraph;
  if (
    !Number.isSafeInteger(context.maxMembers) ||
    context.maxMembers < 1 ||
    graph.section.length + graph.binding.length > context.maxMembers
  )
    fail("NORMALIZED_LAYOUT_LIMIT", "");
  const complete = context.coreContext.phase === "qualification";
  const require = (v: unknown, path: string) => {
    if (complete && (v === null || v === undefined))
      fail("NORMALIZED_LAYOUT_INCOMPLETE", path);
  };
  const ids = new Set(core.field.concat([]).map((f) => f.id));
  for (const r of [
    ...core.runtime,
    ...core.surface,
    ...graph.section,
    ...graph.binding,
  ]) {
    if (ids.has(r.id)) fail("NORMALIZED_LAYOUT_IDENTITY_CONFLICT", "");
    ids.add(r.id);
  }
  const labels = context.coreContext.labels;
  const sectionKeys = new Set<string>(),
    bindingKeys = new Set<string>(),
    tokens = new Set<string>();
  const sectionOrder = new Map<string, number[]>(),
    bindingOrder = new Map<string, number[]>();
  const relatedProperties = [
    "relationTargetId",
    "targetSurfaceKey",
    "targetViewKey",
    "readOperationKey",
    "presentationCardinality",
    "emptyTitleLabelId",
    "emptyDescriptionLabelId",
    "emptyCreationMode",
    "setupLabelId",
    "createOperationKey",
    "editLabelId",
  ] as const;
  const unavailable = (value: unknown, path: string) => {
    if (value !== null) fail("NORMALIZED_LAYOUT_VARIANT_INVALID", path);
  };
  for (const s of graph.section) {
    const path = `/section/${s.id}`,
      surface = core.surface.find((v) => v.id === s.entitySurfaceId);
    if (!surface)
      return fail(
        "NORMALIZED_LAYOUT_FOREIGN_REFERENCE",
        path + "/entitySurfaceId",
      );
    if (
      !["detail", "form"].includes(surface.surfaceKind) &&
      !(
        surface.surfaceKind === "embedded" &&
        surface.embeddedMode === "sectioned"
      )
    )
      fail("NORMALIZED_LAYOUT_SECTION_SURFACE_INVALID", path);
    const key = JSON.stringify([s.entitySurfaceId, s.sectionKey]);
    if (sectionKeys.has(key)) fail("NORMALIZED_LAYOUT_KEY_CONFLICT", path);
    sectionKeys.add(key);
    add(
      sectionOrder,
      [s.entitySurfaceId, s.navigationGroupId, s.parentSectionId],
      s.position,
    );
    for (const id of [
      s.labelId,
      s.emptyTitleLabelId,
      s.emptyDescriptionLabelId,
      s.setupLabelId,
      s.editLabelId,
    ])
      foreign(id, labels, path + "/label");
    require(s.labelId, path + "/labelId");
    if (surface.surfaceKind === "detail") {
      require(s.navigationGroupId, path + "/navigationGroupId");
      if (
        s.navigationGroupId !== null &&
        context.navigationGroups.filter(
          (g) =>
            g.id === s.navigationGroupId && g.entitySurfaceId === surface.id,
        ).length !== 1
      )
        fail("NORMALIZED_LAYOUT_NAVIGATION_INVALID", path);
    } else unavailable(s.navigationGroupId, path + "/navigationGroupId");
    if (s.parentSectionId !== null) {
      const parent = graph.section.find((p) => p.id === s.parentSectionId);
      if (
        !parent ||
        parent.entitySurfaceId !== s.entitySurfaceId ||
        parent.navigationGroupId !== s.navigationGroupId ||
        parent.contentKind !== "fields"
      )
        fail("NORMALIZED_LAYOUT_PARENT_INVALID", path);
    }
    const seen = new Set<string>();
    let current: NormalizedLayoutRow<"section"> | undefined = s;
    while (current) {
      if (seen.has(current.id)) fail("NORMALIZED_LAYOUT_PARENT_CYCLE", path);
      seen.add(current.id);
      current = graph.section.find((p) => p.id === current!.parentSectionId);
    }
    if (s.collapsedByDefault && !s.collapsible)
      fail("NORMALIZED_LAYOUT_COLLAPSE_INVALID", path);
    if (s.contentKind !== "related_list")
      for (const p of relatedProperties) unavailable(s[p], path + "/" + p);
    if (s.contentKind !== "component")
      unavailable(s.componentContractId, path + "/componentContractId");
    if (s.contentKind !== "capability") {
      unavailable(s.entityCapabilityId, path + "/entityCapabilityId");
      unavailable(
        s.capabilityLayoutBindingId,
        path + "/capabilityLayoutBindingId",
      );
    }
    if (s.contentKind !== "fields")
      unavailable(s.extensionPointKey, path + "/extensionPointKey");
    if (s.contentKind === "component") {
      require(s.componentContractId, path + "/componentContractId");
      if (
        s.componentContractId !== null &&
        context.components.filter(
          (c) =>
            c.id === s.componentContractId &&
            c.level === "section" &&
            c.surfaceKinds.includes(surface.surfaceKind),
        ).length !== 1
      )
        fail("NORMALIZED_LAYOUT_COMPONENT_UNAVAILABLE", path);
    }
    if (s.contentKind === "capability") {
      require(s.entityCapabilityId, path + "/entityCapabilityId");
      require(s.capabilityLayoutBindingId, path + "/capabilityLayoutBindingId");
      if (
        (s.entityCapabilityId === null) !==
        (s.capabilityLayoutBindingId === null)
      )
        fail("NORMALIZED_LAYOUT_PAIR_INVALID", path);
      if (
        s.entityCapabilityId !== null &&
        context.capabilityLayouts.filter(
          (c) =>
            c.capabilityId === s.entityCapabilityId &&
            c.bindingId === s.capabilityLayoutBindingId &&
            c.surfaceKinds.includes(surface.surfaceKind),
        ).length !== 1
      )
        fail("NORMALIZED_LAYOUT_CAPABILITY_UNAVAILABLE", path);
    }
    if (s.contentKind === "related_list") {
      for (const p of [
        "relationTargetId",
        "targetSurfaceKey",
        "readOperationKey",
        "presentationCardinality",
        "emptyCreationMode",
      ] as const)
        require(s[p], path + "/" + p);
      const targets = context.relatedTargets.filter(
        (t) => t.id === s.relationTargetId,
      );
      if (s.relationTargetId !== null && targets.length !== 1)
        fail("NORMALIZED_LAYOUT_RELATED_TARGET_UNAVAILABLE", path);
      const target = targets[0];
      if (target) {
        const surfaces = target.surfaces.filter(
          (t) => t.key === s.targetSurfaceKey,
        );
        if (s.targetSurfaceKey !== null && surfaces.length !== 1)
          fail("NORMALIZED_LAYOUT_RELATED_SURFACE_UNAVAILABLE", path);
        const embedded = surfaces[0];
        if (embedded?.mode === "collection") {
          require(s.targetViewKey, path + "/targetViewKey");
          if (
            s.targetViewKey !== null &&
            !embedded.viewKeys.includes(s.targetViewKey)
          )
            fail("NORMALIZED_LAYOUT_RELATED_VIEW_UNAVAILABLE", path);
        } else if (embedded?.mode === "sectioned")
          unavailable(s.targetViewKey, path + "/targetViewKey");
        if (
          s.readOperationKey !== null &&
          !target.readOperationKeys.includes(s.readOperationKey)
        )
          fail("NORMALIZED_LAYOUT_RELATED_OPERATION_UNAVAILABLE", path);
        if (
          s.presentationCardinality !== null &&
          !target.cardinalities.includes(s.presentationCardinality)
        )
          fail("NORMALIZED_LAYOUT_RELATED_CARDINALITY_INVALID", path);
        if (
          s.createOperationKey !== null &&
          !target.createOperationKeys.includes(s.createOperationKey)
        )
          fail("NORMALIZED_LAYOUT_RELATED_OPERATION_UNAVAILABLE", path);
      }
      if (s.emptyCreationMode === "setup_operation") {
        require(s.setupLabelId, path + "/setupLabelId");
        require(s.createOperationKey, path + "/createOperationKey");
      } else {
        unavailable(s.setupLabelId, path + "/setupLabelId");
        unavailable(s.createOperationKey, path + "/createOperationKey");
      }
    }
  }
  for (const s of graph.section)
    if (
      graph.section.some((child) => child.parentSectionId === s.id) &&
      graph.binding.some((binding) => binding.entitySurfaceSectionId === s.id)
    )
      fail("NORMALIZED_LAYOUT_MIXED_CHILDREN", `/section/${s.id}`);
  for (const binding of graph.binding) {
    const path = `/binding/${binding.id}`;
    if ((binding.entitySurfaceId === null) === (binding.overlayId === null))
      fail("NORMALIZED_LAYOUT_OWNER_XOR_INVALID", path);
    const surface = core.surface.find((s) => s.id === binding.entitySurfaceId);
    const overlay = context.overlays.filter((o) => o.id === binding.overlayId);
    if (binding.entitySurfaceId !== null && !surface)
      fail("NORMALIZED_LAYOUT_FOREIGN_REFERENCE", path + "/entitySurfaceId");
    if (
      binding.overlayId !== null &&
      (overlay.length !== 1 ||
        context.coreContext.tenantId === null ||
        overlay[0]!.tenantId !== context.coreContext.tenantId ||
        !overlay[0]!.permittedFieldIds.includes(binding.entityFieldId))
    )
      fail("NORMALIZED_LAYOUT_OVERLAY_UNAVAILABLE", path);
    if (binding.overlayId !== null)
      unavailable(
        binding.entitySurfaceSectionId,
        path + "/entitySurfaceSectionId",
      );
    const surfaceKind = surface?.surfaceKind ?? overlay[0]!.surfaceKind;
    const field = core.field.find((f) => f.id === binding.entityFieldId);
    if (!field)
      return fail(
        "NORMALIZED_LAYOUT_FOREIGN_REFERENCE",
        path + "/entityFieldId",
      );
    const section = graph.section.find(
      (s) => s.id === binding.entitySurfaceSectionId,
    );
    if (
      binding.entitySurfaceSectionId !== null &&
      (!section ||
        section.entitySurfaceId !== binding.entitySurfaceId ||
        !["fields", "component"].includes(section.contentKind))
    )
      fail("NORMALIZED_LAYOUT_BINDING_SECTION_INVALID", path);
    if (section?.contentKind === "component")
      fail("NORMALIZED_LAYOUT_COMPONENT_SLOTS_UNAVAILABLE", path);
    if (
      binding.bindingKind === "field" &&
      surface &&
      (["detail", "form"].includes(surfaceKind) ||
        (surfaceKind === "embedded" && surface.embeddedMode === "sectioned"))
    )
      require(binding.entitySurfaceSectionId, path + "/entitySurfaceSectionId");
    const key = JSON.stringify([
      binding.entitySurfaceId,
      binding.overlayId,
      binding.bindingKey,
    ]);
    if (bindingKeys.has(key)) fail("NORMALIZED_LAYOUT_KEY_CONFLICT", path);
    bindingKeys.add(key);
    add(
      bindingOrder,
      [
        binding.entitySurfaceId,
        binding.overlayId,
        binding.entitySurfaceSectionId,
        binding.bindingKind,
      ],
      binding.position,
    );
    for (const label of [
      binding.labelOverrideId,
      binding.helpLabelId,
      binding.placeholderLabelId,
      binding.emptyTextLabelId,
    ])
      foreign(label, labels, path + "/label");
    if (
      binding.labelOverrideId !== null &&
      binding.labelOverrideId === field.labelId
    )
      fail("NORMALIZED_LAYOUT_REDUNDANT_LABEL_OVERRIDE", path);
    const width =
      section?.columnCount ?? surface?.columnCount ?? overlay[0]?.columnCount;
    if (width !== undefined && width !== null && binding.columnSpan > width)
      fail("NORMALIZED_LAYOUT_GRID_SPAN_INVALID", path);
    if (binding.bindingKind === "reference_token") {
      if (surfaceKind !== "lookup")
        fail("NORMALIZED_LAYOUT_TOKEN_SURFACE_INVALID", path);
      require(binding.tokenKey, path + "/tokenKey");
      if (binding.tokenKey !== null) {
        const key = JSON.stringify([binding.entitySurfaceId, binding.tokenKey]);
        if (tokens.has(key)) fail("NORMALIZED_LAYOUT_TOKEN_CONFLICT", path);
        tokens.add(key);
      }
    } else unavailable(binding.tokenKey, path + "/tokenKey");
    const accesses = context.fieldPresentation.filter(
        (p) => p.fieldId === field.id,
      ),
      access = accesses[0];
    if (complete && (accesses.length !== 1 || access?.display === "omitted"))
      fail("NORMALIZED_LAYOUT_FIELD_PRESENTATION_UNAVAILABLE", path);
    const component = (
      id: string | null,
      level: NormalizedLayoutContext["components"][number]["level"],
    ) => {
      if (id === null) return undefined;
      const matches = context.components.filter(
        (c) =>
          c.id === id &&
          c.level === level &&
          c.surfaceKinds.includes(surfaceKind) &&
          c.dataTypes.includes(field.dataType) &&
          c.cardinalities.includes(field.cardinality),
      );
      if (matches.length !== 1)
        fail("NORMALIZED_LAYOUT_COMPONENT_UNAVAILABLE", path + "/" + level);
      return matches[0]!;
    };
    const display = component(binding.componentDisplayId, "field_display"),
      input = component(binding.componentInputId, "field_input"),
      filter = component(binding.componentFilterId, "field_filter"),
      format = component(binding.componentFormatId, "field_format");
    require(binding.componentDisplayId, path + "/componentDisplayId");
    if (binding.componentDisplayId !== null && field.dataType === "uuid")
      fail("NORMALIZED_LAYOUT_UUID_PRESENTATION_FORBIDDEN", path);
    if (
      input &&
      (surfaceKind !== "form" ||
        field.writeMode === "read_only" ||
        field.valueOrigin !== "stored" ||
        !access?.inputSurfaceIds.includes(binding.entitySurfaceId!))
    )
      fail("NORMALIZED_LAYOUT_INPUT_UNAVAILABLE", path);
    if (binding.meaningfulForForm && surfaceKind !== "form")
      fail("NORMALIZED_LAYOUT_FORM_APPLICABILITY_INVALID", path);
    if (binding.placeholderLabelId !== null && !input)
      fail("NORMALIZED_LAYOUT_INPUT_UNAVAILABLE", path);
    if (
      access?.display === "masked" &&
      ((display && !display.maskedRepresentationSafe) ||
        (format && !format.maskedRepresentationSafe))
    )
      fail("NORMALIZED_LAYOUT_MASKED_PRESENTATION_UNAVAILABLE", path);
    if (
      format &&
      (!display || !format.compatibleDisplayIds.includes(display.id))
    )
      fail("NORMALIZED_LAYOUT_FORMAT_UNAVAILABLE", path);
    if (filter) {
      if (
        !access?.queryUses.includes("filter") ||
        binding.filterOperators === null ||
        binding.filterOperators.length === 0 ||
        new Set(binding.filterOperators).size !==
          binding.filterOperators.length ||
        binding.filterOperators.some(
          (op) =>
            !filter.filterOperators.includes(op) ||
            !access.filterOperators.includes(op),
        )
      )
        fail("NORMALIZED_LAYOUT_FILTER_UNAVAILABLE", path);
      if (
        binding.defaultFilterOperator !== null &&
        !binding.filterOperators!.includes(binding.defaultFilterOperator)
      )
        fail("NORMALIZED_LAYOUT_FILTER_OPERATOR_INVALID", path);
    } else {
      unavailable(binding.filterOperators, path + "/filterOperators");
      unavailable(
        binding.defaultFilterOperator,
        path + "/defaultFilterOperator",
      );
    }
    for (const option of ["textWrap", "emptyTextLabelId"] as const)
      if (binding[option] !== null && !display?.options.includes(option))
        fail("NORMALIZED_LAYOUT_OPTION_UNAVAILABLE", path + "/" + option);
    if (
      binding.fractionDigits !== null &&
      (!format?.options.includes("fractionDigits") ||
        !["decimal", "money"].includes(field.dataType) ||
        field.scale === null ||
        binding.fractionDigits > field.scale)
    )
      fail("NORMALIZED_LAYOUT_OPTION_UNAVAILABLE", path + "/fractionDigits");
    if (
      binding.dateStyle !== null &&
      (!format?.options.includes("dateStyle") ||
        !["date", "datetime"].includes(field.dataType))
    )
      fail("NORMALIZED_LAYOUT_OPTION_UNAVAILABLE", path + "/dateStyle");
    if (
      binding.referenceSurfaceKey !== null &&
      !access?.referenceSurfaceKeys.includes(binding.referenceSurfaceKey)
    )
      fail("NORMALIZED_LAYOUT_REFERENCE_UNAVAILABLE", path);
    if (
      binding.referenceLoadMode !== null &&
      !access?.referenceLoadModes.includes(binding.referenceLoadMode)
    )
      fail("NORMALIZED_LAYOUT_REFERENCE_UNAVAILABLE", path);
    if (
      (binding.referenceSurfaceKey !== null ||
        binding.referenceLoadMode !== null) &&
      field.relationId === null
    )
      fail("NORMALIZED_LAYOUT_REFERENCE_UNAVAILABLE", path);
  }
  dense(sectionOrder, "/section/position");
  dense(bindingOrder, "/binding/position");
  return structuredClone(graph);
}
