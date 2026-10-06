import {
  FoundationContractError,
  validateFoundationNode,
  contractJsonSchema,
  type ContractNode,
  type ContractValue,
} from "./foundation-contract.js";
import { referenceUuid } from "./reference-member-contract.js";
const nil = { type: "null" } as const;
const nullable = <const N extends ContractNode>(node: N) =>
  ({ anyOf: [node, nil] }) as const;
const enumeration = <const V extends readonly string[]>(...values: V) =>
  ({ anyOf: values.map((value) => ({ const: value })) }) as {
    readonly anyOf: readonly { readonly const: V[number] }[];
  };
const text = { type: "string", maxLength: 4000 } as const;
const key = { type: "string", pattern: "^[a-z][a-z0-9_.:-]{0,126}$" } as const;
const hash = { type: "string", pattern: "^[0-9a-f]{64}$" } as const;
const numeric = {
  type: "string",
  maxLength: 4096,
  pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$",
} as const;
const date = {
  type: "string",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
} as const;
const instant = {
  type: "string",
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?Z$",
} as const;
const integer = (min = 1, max = 2147483647) =>
  ({ type: "integer", minimum: min, maximum: max }) as const;
const c = <const N extends ContractNode, const S extends boolean = false>(
  column: string,
  node: N,
  sqlType: string,
  reference?: string,
  serviceOwned: S = false as S,
) => ({
  column,
  node,
  sqlType,
  ...(reference ? { reference } : {}),
  serviceOwned,
});
type Selected<N extends ContractNode, R extends boolean> = R extends true
  ? N
  : { readonly anyOf: readonly [N, typeof nil] };
const selected = <const N extends ContractNode, const R extends boolean>(
  node: N,
  required: R,
): Selected<N, R> => (required ? node : nullable(node)) as Selected<N, R>;
const ref = <const R extends boolean = false, const S extends boolean = false>(
  name: string,
  table: string,
  required: R = false as R,
  serviceOwned: S = false as S,
) => ({ ...c(name, selected(referenceUuid, required), "uuid", table, serviceOwned), reference: table });
const str = <const R extends boolean = false>(
  name: string,
  required: R = false as R,
) => c(name, selected(key, required), "text");
const choice = <
  const V extends readonly string[],
  const R extends boolean = false,
>(
  name: string,
  values: V,
  required: R = false as R,
) => c(name, selected(enumeration(...values), required), "text");
const int = <const R extends boolean = false>(
  name: string,
  min = 1,
  max = 2147483647,
  required: R = false as R,
) => c(name, selected(integer(min, max), required), "integer");
const boolean = <const R extends boolean = false>(
  name: string,
  required: R = false as R,
) => c(name, selected({ type: "boolean" } as const, required), "boolean");
const array = <const N extends ContractNode>(
  name: string,
  items: N,
  sqlType: string,
) => c(name, nullable({ type: "array", items }), sqlType);
const define = <
  const C extends Readonly<
    Record<
      string,
      {
        column: string;
        node: ContractNode;
        sqlType: string;
        reference?: string;
        serviceOwned: boolean;
      }
    >
  >,
>(
  table: string,
  columns: C,
) => ({ table, columns });
/** Shared typed-column vocabulary for normalized authoring families. */
export const normalizedContractBuilders = {
  nullable,
  enumeration,
  c,
  ref,
  str,
  choice,
  int,
  boolean,
  array,
  define,
  text,
  integer,
};
/** Target normalized columns. No type/layout/default/policy JSON copy-through.
 * Describing a proposed column does not attest its deployment or resource owner. */
export const normalizedCoreMembers = {
  field: define("entity_field", {
    fieldIdentityId: ref(
      "field_identity_id",
      "entity_field_identity",
      true,
      true,
    ),
    parentFieldId: ref("parent_field_id", "entity_field", false, true),
    labelId: ref("label_id", "entity_label"),
    description: c(
      "description",
      nullable({ ...text, maxLength: 2000 }),
      "text",
    ),
    dataType: choice(
      "data_type",
      [
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
      ],
      true,
    ),
    storageType: c("storage_type", nullable(text), "text", undefined, true),
    cardinality: choice("cardinality", ["one", "many"], true),
    valueOrigin: choice(
      "value_origin",
      ["stored", "computed", "projected", "runtime"],
      true,
    ),
    storageKind: choice("storage_kind", ["column", "extension"]),
    storagePath: c(
      "storage_path",
      nullable({ type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_.]{0,126}$" }),
      "text",
    ),
    nullable: boolean("nullable", true),
    required: boolean("required", true),
    writeMode: choice(
      "write_mode",
      ["read_only", "mutable", "write_once"],
      true,
    ),
    dataClassification: str("data_classification", true),
    retentionPolicyCode: str("retention_policy_code"),
    semanticRole: str("semantic_role"),
    minLength: int("min_length", 0),
    maxLength: int("max_length", 0),
    minimum: c("minimum", nullable(numeric), "numeric"),
    maximum: c("maximum", nullable(numeric), "numeric"),
    pattern: c("pattern", nullable(text), "text"),
    precision: int("precision", 1, 1000),
    scale: int("scale", 0, 1000),
    domainCode: str("domain_code"),
    defaultKind: choice(
      "default_kind",
      ["none", "literal_null", "literal", "context", "database"],
      true,
    ),
    defaultText: c("default_text", nullable(text), "text"),
    defaultNumeric: c("default_numeric", nullable(numeric), "numeric"),
    defaultBoolean: boolean("default_boolean"),
    defaultContextKey: str("default_context_key"),
    defaultContextVersion: int("default_context_version"),
    keyGeneration: choice(
      "key_generation",
      ["none", "database_uuidv7", "provided"],
      true,
    ),
    relationId: ref("relation_id", "entity_relation"),
    computedContractKey: str("computed_contract_key"),
    computedContractVersion: int("computed_contract_version"),
    validationContractKey: str("validation_contract_key"),
    validationContractVersion: int("validation_contract_version"),
    jsonSchemaKey: str("json_schema_key"),
    jsonSchemaHash: c("json_schema_hash", nullable(hash), "text"),
    replacementFieldId: ref("replacement_field_id", "entity_field"),
    minimumDate: c("minimum_date", nullable(date), "date"),
    maximumDate: c("maximum_date", nullable(date), "date"),
    minimumDatetime: c("minimum_datetime", nullable(instant), "timestamptz"),
    maximumDatetime: c("maximum_datetime", nullable(instant), "timestamptz"),
    temporalKind: choice("temporal_kind", ["date", "instant"]),
    currencyFieldId: ref("currency_field_id", "entity_field"),
    currencyCode: c(
      "currency_code",
      nullable({ type: "string", minLength: 1, maxLength: 64, pattern: "\\S" }),
      "text",
    ),
    defaultDate: c("default_date", nullable(date), "date"),
    defaultDatetime: c("default_datetime", nullable(instant), "timestamptz"),
    defaultUuid: c("default_uuid", nullable(referenceUuid), "uuid"),
  }),
  runtime: define("entity_runtime_profile", {
    profileKey: c("profile_key", { const: "default" }, "text"),
    backingKind: choice(
      "backing_kind",
      ["table", "view", "materialized_view", "external", "virtual"],
      true,
    ),
    storagePlane: choice("storage_plane", ["studio", "neon", "mesh"]),
    storageSchema: str("storage_schema"),
    storageObject: str("storage_object"),
    storageCatalogueHash: c("storage_catalogue_hash", nullable(hash), "text"),
    readMode: choice(
      "read_mode",
      ["none", "generic", "facade", "projection"],
      true,
    ),
    writeMode: choice(
      "write_mode",
      ["none", "generic", "facade", "append_only"],
      true,
    ),
    apiExposure: choice("api_exposure", ["none", "catalog_only", "api"], true),
    createMode: choice(
      "create_mode",
      ["form_only", "early_draft", "direct", "source_document"],
      true,
    ),
    draftTtlHours: int("draft_ttl_hours", 1, 8760),
    concurrencyMode: choice(
      "concurrency_mode",
      ["none", "optimistic", "append_only"],
      true,
    ),
    idFieldId: ref("id_field_id", "entity_field", true),
    tenantFieldId: ref("tenant_field_id", "entity_field"),
    recordVersionFieldId: ref("record_version_field_id", "entity_field"),
    softDeleteFieldId: ref("soft_delete_field_id", "entity_field"),
    readHandlerKey: str("read_handler_key"),
    readHandlerVersion: int("read_handler_version"),
    writeHandlerKey: str("write_handler_key"),
    writeHandlerVersion: int("write_handler_version"),
    referenceCapabilityKey: str("reference_capability_key"),
    referenceCapabilityVersion: int("reference_capability_version"),
  }),
  surface: define("entity_surface", {
    surfaceKey: str("surface_key", true),
    surfaceKind: choice(
      "surface_kind",
      ["list", "detail", "form", "embedded", "lookup"],
      true,
    ),
    embeddedMode: choice("embedded_mode", ["sectioned", "collection"]),
    labelId: ref("label_id", "entity_label"),
    descriptionLabelId: ref("description_label_id", "entity_label"),
    layoutKind: choice("layout_kind", ["flow", "grid", "stack"], true),
    isDefault: boolean("is_default", true),
    iconKey: str("icon_key"),
    identityFieldId: ref("identity_field_id", "entity_field"),
    titleFieldId: ref("title_field_id", "entity_field"),
    codeFieldId: ref("code_field_id", "entity_field"),
    columnCount: int("column_count", 1, 12),
    searchProfileId: ref("search_profile_id", "entity_search_profile"),
    supportedModes: array(
      "supported_modes",
      enumeration("table", "compact"),
      "text[]",
    ),
    defaultPageSize: int("default_page_size"),
    allowedPageSizes: array("allowed_page_sizes", integer(), "integer[]"),
    maxSortLevels: int("max_sort_levels", 1, 32),
    countMode: choice("count_mode", ["exact", "estimated", "none"]),
    maxFilters: int("max_filters", 1, 1000),
    maxFilterDepth: int("max_filter_depth", 1, 32),
    maxPageSize: int("max_page_size"),
    emptyTitleLabelId: ref("empty_title_label_id", "entity_label"),
    emptyDescriptionLabelId: ref("empty_description_label_id", "entity_label"),
    componentContractId: ref("component_contract_id", "ui_component_contract"),
    showGroupBand: boolean("show_group_band"),
    referenceKeyId: ref("reference_key_id", "entity_key"),
    referenceFormat: c("reference_format", nullable(text), "text"),
    extensionPointKey: str("extension_point_key"),
  }),
} as const;
export type NormalizedCoreKind = keyof typeof normalizedCoreMembers;
type CoreRow<
  C extends Readonly<Record<string, { readonly node: ContractNode }>>,
> = {
  readonly id: string;
} & { readonly [P in keyof C]: ContractValue<C[P]["node"]> };
export interface NormalizedCoreRows {
  readonly field: CoreRow<typeof normalizedCoreMembers.field.columns>;
  readonly runtime: CoreRow<typeof normalizedCoreMembers.runtime.columns>;
  readonly surface: CoreRow<typeof normalizedCoreMembers.surface.columns>;
}
export type NormalizedCoreRow<K extends NormalizedCoreKind> =
  NormalizedCoreRows[K];
export type NormalizedCoreGraph = {
  readonly [K in NormalizedCoreKind]: readonly NormalizedCoreRow<K>[];
};
export function normalizedCoreRowNode(
  kind: NormalizedCoreKind,
  patch = false,
  client = false,
): ContractNode {
  return {
    type: "object",
    properties: {
      ...(patch ? {} : { id: referenceUuid }),
      ...Object.fromEntries(
        Object.entries(normalizedCoreMembers[kind].columns)
          .filter(([, c]) => !client || !c.serviceOwned)
          .map(([p, c]) => [p, c.node]),
      ),
    },
    ...(patch ? { required: [] } : {}),
  };
}
export function normalizedCoreSchema(): object {
  return contractJsonSchema({
    type: "object",
    properties: Object.fromEntries(
      Object.keys(normalizedCoreMembers).map((k) => [
        k,
        {
          type: "array",
          items: normalizedCoreRowNode(k as NormalizedCoreKind),
        },
      ]),
    ),
  });
}
export const normalizedCoreFailure = (code: string, path: string): never => {
  throw new FoundationContractError(code, path);
};
export function validateNormalizedCoreRow<K extends NormalizedCoreKind>(
  kind: K,
  value: unknown,
  patch = false,
  client = false,
): void {
  validateFoundationNode(
    normalizedCoreRowNode(kind, patch, client),
    value,
    `/${kind}`,
  );
}
