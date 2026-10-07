import {
  FoundationContractError,
  validateFoundationNode,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
import { nativeColumnPredicate } from "./native-row-guards.js";
const choice = <const V extends readonly string[]>(...values: V) =>
  ({ anyOf: values.map((value) => ({ const: value })) }) as {
    readonly anyOf: readonly { readonly const: V[number] }[];
  };
const text = { type: "string", minLength: 1, maxLength: 127 } as const;
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const optional = <const N extends ContractNode>(node: N) =>
  ({ anyOf: [node, { type: "null" }] }) as const;
const column = <const N extends ContractNode>(
  name: string,
  node: N,
  sqlType: string,
  nullable = false,
) => ({ name, node, sqlType, nullable });
const set = <const N extends ContractNode>(node: N) =>
  ({ type: "array", items: node }) as const;
/** Immutable resource projection. No entity_id/change_set_id or author-editable JSON. */
export const uiComponentColumns = {
  id: column("id", referenceUuid, "uuid"),
  tenantId: column("tenant_id", optional(referenceUuid), "uuid", true),
  componentKey: column("component_key", text, "text"),
  componentVersion: column(
    "component_version",
    { type: "integer", minimum: 1, maximum: 2147483647 },
    "integer",
  ),
  componentLevel: column(
    "component_level",
    choice(
      "surface",
      "section",
      "field_display",
      "field_input",
      "field_filter",
      "field_format",
    ),
    "text",
  ),
  componentTier: column(
    "component_tier",
    choice("standard", "shared_composite", "domain_registered"),
    "text",
  ),
  manifestHash: column("manifest_hash", hash, "text"),
  resourceOwner: column("resource_owner", text, "text"),
  resourceNamespace: column("resource_namespace", text, "text"),
  publicationResourceKey: column("publication_resource_key", text, "text"),
  publicationReleaseHash: column("publication_release_hash", hash, "text"),
  supportedDataTypes: column(
    "supported_data_types",
    set(
      choice(
        "string",
        "text",
        "integer",
        "bigint",
        "decimal",
        "boolean",
        "uuid",
        "date",
        "datetime",
        "json",
        "enum",
        "money",
      ),
    ),
    "text[]",
  ),
  supportedPlanes: column(
    "supported_planes",
    set(choice("studio", "neon", "mesh")),
    "text[]",
  ),
  supportedSurfaceKinds: column(
    "supported_surface_kinds",
    set(choice("list", "detail", "form", "embedded", "lookup")),
    "text[]",
  ),
  supportedModes: column("supported_modes", set(text), "text[]"),
  cardinalities: column("cardinalities", set(choice("one", "many")), "text[]"),
  optionKeys: column(
    "option_keys",
    set(
      choice(
        "text_wrap",
        "fraction_digits",
        "date_style",
        "empty_text_label_id",
      ),
    ),
    "text[]",
  ),
  filterOperators: column("filter_operators", set(text), "text[]"),
  compatibleDisplayIds: column(
    "compatible_display_ids",
    set(referenceUuid),
    "uuid[]",
  ),
  maskedRepresentationSafe: column(
    "masked_representation_safe",
    { type: "boolean" },
    "boolean",
  ),
  status: column("status", choice("active", "deprecated"), "text"),
} as const;
export const uiComponentNode = {
  type: "object",
  properties: Object.fromEntries(
    Object.entries(uiComponentColumns).map(([key, c]) => [key, c.node]),
  ),
} as const;
export type UiComponentContract = {
  readonly [K in keyof typeof uiComponentColumns]: ContractValue<
    (typeof uiComponentColumns)[K]["node"]
  >;
};
export function parseUiComponentContract(value: unknown): UiComponentContract {
  validateFoundationNode(uiComponentNode, value, "/component");
  const row = value as UiComponentContract;
  for (const [key, v] of Object.entries(row))
    if (Array.isArray(v) && new Set(v).size !== v.length)
      throw new FoundationContractError(
        "UI_COMPONENT_SET_INVALID",
        "/component/" + key,
      );
  if (!row.supportedPlanes.length || !row.supportedSurfaceKinds.length)
    throw new FoundationContractError(
      "UI_COMPONENT_APPLICABILITY_REQUIRED",
      "/component",
    );
  return row;
}
export function uiComponentCatalogueDdl(): string {
  return `-- GENERATED immutable component resource projection; no installation or publication approval implied.
CREATE FUNCTION metadata.fn_ui_component_set_valid(values_ text[]) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT cardinality(values_)=(SELECT count(DISTINCT v) FROM unnest(values_) v) $$;
${Object.values(uiComponentColumns)
  .filter((c) => c.sqlType.endsWith("[]"))
  .map(
    (c) =>
      `CREATE FUNCTION metadata.fn_ui_component_${c.name}(values_ ${c.sqlType}) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT ${nativeColumnPredicate(c.node, "values_", c.sqlType)} $$;`,
  )
  .join("\n")}
CREATE TABLE metadata.ui_component_contract (
${Object.values(uiComponentColumns)
  .map(
    (c) =>
      ` ${c.name} ${c.sqlType}${c.nullable ? "" : " NOT NULL"} CHECK((${c.sqlType.endsWith("[]") ? `metadata.fn_ui_component_${c.name}(${c.name})` : nativeColumnPredicate(c.node, c.name, c.sqlType)}) IS TRUE)${c.sqlType.endsWith("[]") ? ` CHECK(metadata.fn_ui_component_set_valid(${c.name}::text[]))` : ""}`,
  )
  .join(",\n")},
 PRIMARY KEY(id),
 UNIQUE NULLS NOT DISTINCT(tenant_id,resource_owner,resource_namespace,component_key,component_version,component_level),
 CHECK(cardinality(supported_planes)>0 AND cardinality(supported_surface_kinds)>0)
);
ALTER TABLE metadata.ui_component_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata.ui_component_contract FORCE ROW LEVEL SECURITY;
-- Publication-owned installation must supply its independently governed write authority.
-- No application role, session flag or resource registration grants that authority here.
CREATE FUNCTION metadata.guard_ui_component_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'UI_COMPONENT_IMMUTABLE_RESOURCE' USING ERRCODE='23514'; END $$;
CREATE TRIGGER ui_component_immutable BEFORE UPDATE OR DELETE ON metadata.ui_component_contract FOR EACH ROW EXECUTE FUNCTION metadata.guard_ui_component_immutable();
`;
}
