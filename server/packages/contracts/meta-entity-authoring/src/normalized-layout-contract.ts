import {
  contractJsonSchema,
  validateFoundationNode,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
import { normalizedContractBuilders as b } from "./normalized-core-contract.js";
/** Target normalized layout columns, not a declaration of installed DDL. */
export const normalizedLayoutMembers = {
  section: b.define("entity_surface_section", {
    entitySurfaceId: b.ref("entity_surface_id", "entity_surface", true),
    navigationGroupId: b.ref(
      "navigation_group_id",
      "entity_surface_navigation_group",
    ),
    parentSectionId: b.ref("parent_section_id", "entity_surface_section"),
    sectionKey: b.str("section_key", true),
    labelId: b.ref("label_id", "entity_label"),
    sectionKind: b.choice(
      "section_kind",
      ["section", "subsection", "fieldset", "columns"],
      true,
    ),
    contentKind: b.choice(
      "content_kind",
      ["fields", "related_list", "component", "capability"],
      true,
    ),
    position: b.int("position", 1, 32767, true),
    columnCount: b.int("column_count", 1, 12, true),
    collapsible: b.boolean("collapsible", true),
    collapsedByDefault: b.boolean("collapsed_by_default", true),
    placement: b.choice("placement", ["direct", "overflow"], true),
    iconKey: b.str("icon_key"),
    relationTargetId: b.ref("relation_target_id", "entity_relation_target"),
    targetSurfaceKey: b.str("target_surface_key"),
    targetViewKey: b.str("target_view_key"),
    readOperationKey: b.str("read_operation_key"),
    presentationCardinality: b.choice("presentation_cardinality", [
      "one",
      "zero_or_one",
      "many",
    ]),
    emptyTitleLabelId: b.ref("empty_title_label_id", "entity_label"),
    emptyDescriptionLabelId: b.ref(
      "empty_description_label_id",
      "entity_label",
    ),
    emptyCreationMode: b.choice("empty_creation_mode", [
      "unavailable",
      "setup_operation",
    ]),
    setupLabelId: b.ref("setup_label_id", "entity_label"),
    createOperationKey: b.str("create_operation_key"),
    editLabelId: b.ref("edit_label_id", "entity_label"),
    componentContractId: b.ref(
      "component_contract_id",
      "ui_component_contract",
    ),
    entityCapabilityId: b.ref("entity_capability_id", "entity_capability"),
    capabilityLayoutBindingId: b.ref(
      "capability_layout_binding_id",
      "entity_capability_binding",
    ),
    extensionPointKey: b.str("extension_point_key"),
  }),
  binding: b.define("entity_surface_field_binding", {
    entitySurfaceId: b.ref("entity_surface_id", "entity_surface"),
    entitySurfaceSectionId: b.ref(
      "entity_surface_section_id",
      "entity_surface_section",
    ),
    overlayId: b.ref("overlay_id", "entity_surface_overlay", false, true),
    entityFieldId: b.ref("entity_field_id", "entity_field", true),
    bindingKey: b.str("binding_key", true),
    bindingKind: b.choice(
      "binding_kind",
      ["field", "badge", "summary", "header_context", "reference_token"],
      true,
    ),
    position: b.int("position", 1, 32767, true),
    labelOverrideId: b.ref("label_override_id", "entity_label"),
    helpLabelId: b.ref("help_label_id", "entity_label"),
    placeholderLabelId: b.ref("placeholder_label_id", "entity_label"),
    componentDisplayId: b.ref("component_display_id", "ui_component_contract"),
    componentInputId: b.ref("component_input_id", "ui_component_contract"),
    componentFilterId: b.ref("component_filter_id", "ui_component_contract"),
    componentFormatId: b.ref("component_format_id", "ui_component_contract"),
    columnSpan: b.int("column_span", 1, 12, true),
    width: b.int("width", 1, 10000),
    alignment: b.choice("alignment", ["start", "center", "end"]),
    filterOperators: b.array(
      "filter_operators",
      b.str("operator", true).node,
      "text[]",
    ),
    defaultFilterOperator: b.str("default_filter_operator"),
    meaningfulForForm: b.boolean("meaningful_for_form", true),
    referenceSurfaceKey: b.str("reference_surface_key"),
    referenceLoadMode: b.choice("reference_load_mode", ["eager", "lazy"]),
    tokenKey: b.str("token_key"),
    textWrap: b.boolean("text_wrap"),
    fractionDigits: b.int("fraction_digits", 0, 1000),
    dateStyle: b.choice("date_style", ["short", "medium", "long"]),
    emptyTextLabelId: b.ref("empty_text_label_id", "entity_label"),
  }),
} as const;
export type NormalizedLayoutKind = keyof typeof normalizedLayoutMembers;
type Row<C extends Readonly<Record<string, { readonly node: ContractNode }>>> =
  { readonly id: string } & {
    readonly [K in keyof C]: ContractValue<C[K]["node"]>;
  };
export interface NormalizedLayoutRows {
  readonly section: Row<typeof normalizedLayoutMembers.section.columns>;
  readonly binding: Row<typeof normalizedLayoutMembers.binding.columns>;
}
export type NormalizedLayoutRow<K extends NormalizedLayoutKind> =
  NormalizedLayoutRows[K];
export type NormalizedLayoutGraph = {
  readonly [K in NormalizedLayoutKind]: readonly NormalizedLayoutRow<K>[];
};
export function normalizedLayoutRowNode(
  kind: NormalizedLayoutKind,
  patch = false,
  client = false,
): ContractNode {
  return {
    type: "object",
    properties: {
      ...(patch ? {} : { id: referenceUuid }),
      ...Object.fromEntries(
        Object.entries(normalizedLayoutMembers[kind].columns)
          .filter(([, c]) => !client || !c.serviceOwned)
          .map(([p, c]) => [p, c.node]),
      ),
    },
    ...(patch ? { required: [] } : {}),
  };
}
export function normalizedLayoutSchema(): object {
  return contractJsonSchema({
    type: "object",
    properties: {
      section: { type: "array", items: normalizedLayoutRowNode("section") },
      binding: { type: "array", items: normalizedLayoutRowNode("binding") },
    },
  });
}
export function validateNormalizedLayoutRow(
  kind: NormalizedLayoutKind,
  value: unknown,
  patch = false,
  client = false,
): void {
  validateFoundationNode(
    normalizedLayoutRowNode(kind, patch, client),
    value,
    `/${kind}`,
  );
}
