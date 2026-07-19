import {
  MetaEntityContractV2Schema,
  type MetaEntityContractV2,
  type MetaEntityFieldTypeConfig,
} from "@athyper/api-contracts/meta-entity-contract-v2";
import { PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY } from "@athyper/api-contracts/entity-cache-policy";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value: unknown, fallback: string): string {
  const candidate = text(value)?.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^([^a-z_])/, "_$1");
  return candidate && /^[a-z_][a-z0-9_]*$/.test(candidate) ? candidate : fallback;
}

function domainCode(value: unknown, fallback: string): string {
  const candidate = text(value)?.toLowerCase();
  return candidate && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(candidate) ? candidate : fallback;
}

function semanticRole(value: unknown): string | null {
  const candidate = text(value)?.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
  return candidate && /^[a-z_][a-z0-9_]*(?:[.-][a-z0-9_]+)*$/.test(candidate) ? candidate : null;
}

function fieldTypeConfig(
  field: Record<string, unknown>,
  relationBySourceField: ReadonlyMap<string, string>,
  declaredRelationCodes: ReadonlySet<string>,
): MetaEntityFieldTypeConfig {
  const existing = object(field["type_config"]);
  const kind = text(existing["kind"]);
  const dataType = text(field["data_type"])?.toLowerCase();
  const reference = object(field["reference_config"]);
  const money = object(field["money_config"]);
  const temporalKind = text(field["temporal_kind"]);
  const enumDomain = text(field["enum_domain_code"]) ?? text(object(field["enum_config"])["domain_code"]);
  const existingReference = kind === "reference" ? existing : {};
  const existingDisplay = object(existingReference["display"]);
  const configuredRelation = text(reference["relation"]) ?? text(existingReference["relation"]);
  const sourceField = text(field["name"]);
  const relation = relationBySourceField.get(sourceField ?? "")
    ?? (configuredRelation && declaredRelationCodes.has(identifier(configuredRelation, "reference")
      ? identifier(configuredRelation, "reference")
      : "") ? identifier(configuredRelation, "reference") : null)
    ?? identifier(configuredRelation ?? field["name"], "reference");
  if (kind === "reference" || reference["target_entity"] || dataType === "reference") {
    return {
      kind: "reference",
      relation,
      display: {
        label_field: identifier(reference["display_field"] ?? reference["label_field"] ?? existingDisplay["label_field"], "name"),
        ...(text(reference["code_field"] ?? existingDisplay["code_field"]) ? { code_field: identifier(reference["code_field"] ?? existingDisplay["code_field"], "code") } : {}),
        ...(text(reference["description_field"] ?? existingDisplay["description_field"]) ? { description_field: identifier(reference["description_field"] ?? existingDisplay["description_field"], "description") } : {}),
        format: ["label", "label_code", "code_label", "label_description"].includes(String(existingDisplay["format"]))
          ? existingDisplay["format"] as "label" | "label_code" | "code_label" | "label_description"
          : "label",
      },
    };
  }
  if (kind === "money") return existing as MetaEntityFieldTypeConfig;
  if (kind === "enum") return { kind: "enum", domain_code: domainCode(existing["domain_code"] ?? enumDomain, "unknown") };
  if (kind === "temporal" || kind === "json") return existing as MetaEntityFieldTypeConfig;
  if (money["currency_field"] || dataType === "money") {
    return {
      kind: "money",
      currency: {
        source: "field",
        field: identifier(money["currency_field"] ?? money["currency_code"], "currency_code"),
      },
      minor_units: Number(money["minor_units"] ?? 2),
    };
  }
  if (dataType === "enum" || enumDomain) {
    return { kind: "enum", domain_code: domainCode(enumDomain, "unknown") };
  }
  if (temporalKind || ["date", "datetime", "timestamp", "timestamptz"].includes(dataType ?? "")) {
    return {
      kind: "temporal",
      temporal_kind: (temporalKind === "businessDate" || temporalKind === "zonedDateTime") ? temporalKind : "instant",
      display_mode: text(field["display_mode"]) === "date" ? "date" : "dateTime",
      affects_posting_period: field["affects_posting_period"] === true,
    };
  }
  if (["json", "jsonb"].includes(dataType ?? "")) {
    return { kind: "json", schema_key: identifier(object(field["json_config"])["schema_key"] ?? field["name"], "document_metadata") };
  }
  return {
    kind: "scalar",
    ...(text(field["format"]) ? { format: text(field["format"]) } : {}),
    ...(text(field["unit"]) ? { unit: text(field["unit"]) } : {}),
  };
}

function semanticRoles(field: Record<string, unknown>): string[] {
  const configured = Array.isArray(field["semantic_roles"])
    ? field["semantic_roles"].map((value) => semanticRole(value)).filter((value): value is string => value !== null)
    : [];
  const roles = new Set(configured);
  if (field["is_primary_amount"] === true) roles.add("money.primary_amount");
  if (field["is_primary_currency"] === true) roles.add("money.currency");
  const uiHint = object(field["ui_hint"]);
  const role = semanticRole(uiHint["semantic_role"]);
  if (role) roles.add(role);
  return [...roles].sort();
}

export interface MetaEntityContractV2BuildInput {
  catalog: MetaEntityContractV2["catalog"];
  version_contract: MetaEntityContractV2["version_contract"];
  fields: ReadonlyArray<Record<string, unknown>>;
  relations?: ReadonlyArray<Record<string, unknown>>;
  surfaces?: MetaEntityContractV2["surfaces"];
  operations?: MetaEntityContractV2["operations"];
  lifecycle?: MetaEntityContractV2["lifecycle"];
  numbering?: MetaEntityContractV2["numbering"];
  policy?: MetaEntityContractV2["policy"];
  flows?: MetaEntityContractV2["flows"];
}

/**
 * Build and strictly validate the canonical graph at the compiler boundary.
 * Legacy columns may be used to fill this object during the reset window, but
 * every consumer after this function sees only v2 ownership.
 */
export function buildMetaEntityContractV2(input: MetaEntityContractV2BuildInput): MetaEntityContractV2 {
  const versionId = input.version_contract.entity_version_id;
  const relations = (input.relations ?? []).map((relation) => ({
    id: String(relation["id"]),
    tenant_id: relation["tenant_id"] == null ? null : String(relation["tenant_id"]),
    entity_version_id: String(relation["entity_version_id"] ?? versionId),
    relation_code: identifier(relation["relation_code"] ?? relation["name"], "relation"),
    relation_kind: relation["relation_kind"] === "has_many" || relation["relation_kind"] === "m2m" ? relation["relation_kind"] : "belongs_to",
    target_entity_code: identifier(relation["target_entity_code"] ?? relation["target_entity"], "target_entity"),
    resolution_kind: relation["resolution_kind"] === "polymorphic" || relation["resolution_kind"] === "join" || relation["resolution_kind"] === "array_fk" ? relation["resolution_kind"] : "fk",
    source_field: relation["source_field"] == null && relation["fk_field"] == null ? null : identifier(relation["source_field"] ?? relation["fk_field"], "source_field"),
    target_field: identifier(relation["target_field"] ?? relation["target_key"], "id"),
    polymorphic_type_field: relation["polymorphic_type_field"] == null && relation["source_type_field"] == null ? null : identifier(relation["polymorphic_type_field"] ?? relation["source_type_field"], "type"),
    polymorphic_type_value: text(relation["polymorphic_type_value"] ?? relation["source_type_value"]),
    polymorphic_id_field: relation["polymorphic_id_field"] == null && relation["source_id_field"] == null ? null : identifier(relation["polymorphic_id_field"] ?? relation["source_id_field"], "id"),
    source_line_field: relation["source_line_field"] == null ? null : identifier(relation["source_line_field"], "line_id"),
    runtime_role: relation["runtime_role"] == null ? null : identifier(relation["runtime_role"], "reference"),
    on_delete: ["cascade", "set_null", "set_default", "no_action"].includes(String(relation["on_delete"])) ? relation["on_delete"] : "restrict",
    record_filter: object(relation["record_filter"]),
    mutation_owner: ["generic", "workspace", "handler"].includes(String(relation["mutation_owner"])) ? relation["mutation_owner"] : "read_only",
    mutation_permissions: Array.isArray(relation["mutation_permissions"])
      ? relation["mutation_permissions"].filter((value): value is string => typeof value === "string").map((value) => identifier(value, "permission"))
      : [],
  }));
  const relationCodes = new Set(relations.map((relation) => relation.relation_code));
  const relationBySourceField = new Map<string, string>();
  for (const relation of relations) {
    if (relation.source_field) relationBySourceField.set(relation.source_field, relation.relation_code);
  }
  for (const field of input.fields) {
    const reference = object(field["reference_config"]);
    const existingTypeConfig = object(field["type_config"]);
    const dataType = text(field["data_type"])?.toLowerCase();
    const inferredTarget = dataType === "reference" || text(existingTypeConfig["kind"]) === "reference"
      ? text(field["name"])?.replace(/_id$/, "")
      : null;
    const targetEntity = text(
      reference["target_entity"]
        ?? reference["target_entity_code"]
        ?? reference["ref_entity"]
        ?? reference["entity"],
    ) ?? inferredTarget;
    if (!targetEntity || !text(field["name"]) || relationBySourceField.has(text(field["name"])!)) continue;
    const configured = text(reference["relation"]);
    const configuredCode = configured ? identifier(configured, "reference") : null;
    if (configuredCode && relationCodes.has(configuredCode)) continue;
    const sourceField = identifier(field["name"], "source_field");
    const relationCode = identifier(configured ?? field["name"], "reference");
    if (relationCodes.has(relationCode)) continue;
    relations.push({
      id: `derived:${versionId}:${String(field["id"])}`,
      tenant_id: null,
      entity_version_id: versionId,
      relation_code: relationCode,
      relation_kind: "belongs_to",
      target_entity_code: identifier(targetEntity, "target_entity"),
      resolution_kind: "fk",
      source_field: sourceField,
      target_field: identifier(reference["target_field"] ?? reference["target_key"], "id"),
      polymorphic_type_field: null,
      polymorphic_type_value: null,
      polymorphic_id_field: null,
      source_line_field: null,
      runtime_role: "reference",
      on_delete: "restrict",
      record_filter: {},
      mutation_owner: "read_only",
      mutation_permissions: [],
    });
    relationCodes.add(relationCode);
    relationBySourceField.set(sourceField, relationCode);
  }

  return MetaEntityContractV2Schema.parse({
    contract_version: 2,
    catalog: input.catalog,
    version_contract: input.version_contract,
    fields: input.fields.map((field) => ({
      id: String(field["id"]),
      tenant_id: field["tenant_id"] == null ? null : String(field["tenant_id"]),
      entity_version_id: String(field["entity_version_id"] ?? versionId),
      name: identifier(field["name"], "field"),
      column_name: identifier(field["column_name"], identifier(field["name"], "field")),
      projection_alias_of: text(field["projection_alias_of"]),
      label: text(field["label"]) ?? identifier(field["name"], "Field").replace(/_/g, " "),
      description: text(field["description"]),
      data_type: text(field["data_type"]) ?? "string",
      cardinality: field["cardinality"] === "many" || field["cardinality"] === "zero_or_one" ? field["cardinality"] : "one",
      origin: field["origin"] === "system" || field["origin"] === "standard" ? field["origin"] : "business",
      is_required: field["is_required"] === true,
      is_unique: field["is_unique"] === true,
      unique_scope: text(field["unique_scope"]),
      is_read_only: field["is_read_only"] === true || field["is_readonly"] === true,
      is_deprecated: field["is_deprecated"] === true,
      is_computed: field["is_computed"] === true,
      is_write_once: field["is_write_once"] === true,
      runtime_enabled: field["runtime_enabled"] !== false,
      compute_mode: text(field["compute_mode"]),
      compute_expr: Object.keys(object(field["compute_expr"])).length > 0 ? object(field["compute_expr"]) : null,
      ...(field["default_value"] !== undefined ? { default_value: field["default_value"] } : {}),
      defaults: Object.keys(object(field["defaults"])).length > 0 ? object(field["defaults"]) : null,
      is_filterable: field["is_filterable"] === true,
      is_sortable: field["is_sortable"] === true,
      is_groupable: field["is_groupable"] === true,
      is_aggregatable: field["is_aggregatable"] === true,
      semantic_roles: semanticRoles(field),
      type_config: fieldTypeConfig(field, relationBySourceField, relationCodes),
    })),
    relations,
    surfaces: input.surfaces ?? [],
    operations: input.operations ?? [],
    lifecycle: input.lifecycle ?? null,
    numbering: input.numbering ?? null,
    policy: input.policy ?? {
      access_mode: "default_deny",
      company_scope_mode: "none",
      audit_mode: "enabled",
      retention_policy: {},
      default_filters: {},
      cache_flags: {},
      cache_policy: {
        ...PLATFORM_DEFAULT_ENTITY_LIST_CACHE_POLICY,
        source: "platform",
      },
    },
    flows: input.flows ?? [],
  });
}

export function searchFieldSet(contract: MetaEntityContractV2): ReadonlySet<string> {
  return new Set(contract.version_contract.search_config.fields.map((field) => field.field));
}

export function piiFieldSet(contract: MetaEntityContractV2): ReadonlySet<string> {
  return new Set(contract.version_contract.data_policy.pii_fields);
}
