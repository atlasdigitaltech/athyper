import { describe, expect, it } from "vitest";
import {
  META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY,
  MetaEntityContractV2Schema,
} from "@athyper/api-contracts/meta-entity-contract-v2";
import {
  projectCompiledEntityResponse,
  readCompiledEntityContract,
} from "../compiled-entity-projection.js";

function contract(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 2,
    catalog: {
      id: "entity-1", tenant_id: null, module_id: "control", entity_code: "sample_entity", slug: "sample-entity",
      entity_class: "MASTER", ownership_model: "system", label_singular: "Sample", label_plural: "Samples",
      plane_eligibility: ["neon"], status: "DRAFT", is_active: true,
    },
    version_contract: {
      id: "contract-1", tenant_id: null, entity_version_id: "version-1", runtime_enabled: false,
      api_exposure: "CATALOG_ONLY", backing_type: "table", table_schema: "control", table_name: "sample_entity",
      primary_key: "id", tenant_column: null, read_capability: "none", write_capability: "none",
      create_mode: "FORM_ONLY", draft_ttl_hours: null, governance_level: "full", security_tier: "config",
      mutability: "controlled", source_kind: "explicit", contract_hash: null,
      identity_config: {
        primary_key_field: "id", business_key_fields: [], natural_key_fields: [],
        display_identity: { title_field: "name", subtitle_field: null }, parent: null, identity_via: null,
        list_entity_code: null, duplicate_check: { enabled: false, fields: [], scope: "tenant" }, replacement: null,
      },
      search_config: { enabled: false, mode: "server", fields: [], minimum_query_length: 2, operator: "contains" },
      data_policy: { classification: "internal", retention: { days: null, legal_hold_eligible: false }, deletion: { anonymize: false }, pii_fields: [] },
      concurrency_config: { strategy: "none", rollout: "observe", row_version_field: null, lock_required: false },
      storage_config: { discriminator: null, partition: null, external_source: null, indexes: [] },
    },
    fields: [
      {
        id: "field-1", tenant_id: null, entity_version_id: "version-1", name: "id", column_name: "id", label: "Id",
        data_type: "uuid", cardinality: "one", origin: "system", is_required: true, is_unique: true, unique_scope: "global",
        is_read_only: true, is_deprecated: false, is_computed: false, is_write_once: false, runtime_enabled: true,
        is_filterable: true, is_sortable: true, is_groupable: false, is_aggregatable: false, semantic_roles: [], type_config: { kind: "scalar" },
      },
      {
        id: "field-2", tenant_id: null, entity_version_id: "version-1", name: "name", column_name: "name", label: "Name",
        data_type: "string", cardinality: "one", origin: "business", is_required: false, is_unique: false, unique_scope: null,
        is_read_only: false, is_deprecated: false, is_computed: false, is_write_once: false, runtime_enabled: true,
        is_filterable: true, is_sortable: true, is_groupable: false, is_aggregatable: false, semantic_roles: [], type_config: { kind: "scalar" },
      },
    ],
    relations: [], surfaces: [], operations: [], lifecycle: null, numbering: null,
    policy: { access_mode: "default_deny", company_scope_mode: "none", audit_mode: "enabled", retention_policy: {}, default_filters: {} },
    flows: [],
    ...overrides,
  };
}

describe("Meta Entity Contract v2", () => {
  it("keeps a unique property registry and rejects legacy catch-all input", () => {
    expect(new Set(META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.map((entry) => entry.path)).size)
      .toBe(META_ENTITY_CONTRACT_V2_PROPERTY_REGISTRY.length);
    expect(MetaEntityContractV2Schema.safeParse({ ...contract(), display_config: {} }).success).toBe(false);
  });

  it("rejects unresolved search and PII ownership references", () => {
    const result = MetaEntityContractV2Schema.safeParse({
      ...contract(),
      version_contract: {
        ...(contract().version_contract as Record<string, unknown>),
        search_config: { enabled: true, mode: "server", fields: [{ field: "missing", weight: 1 }], minimum_query_length: 2, operator: "contains" },
        data_policy: { classification: "internal", retention: { days: null, legal_hold_eligible: false }, deletion: { anonymize: false }, pii_fields: ["missing"] },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message).join(" ")).toContain("must reference a field");
  });

  it("accepts dotted semantic roles and service-owned readonly numbering fields", () => {
    const base = contract();
    const result = MetaEntityContractV2Schema.safeParse({
      ...base,
      fields: (base.fields as Array<Record<string, unknown>>).map((field, index) => index === 0
        ? { ...field, semantic_roles: ["money.primary_amount"] }
        : field),
      numbering: {
        id: "numbering-1", entity_id: "entity-1", number_field: "id", company_code_id: null,
        prefix: "", prefix_configurable: true, separator: "-", segments: [], reset_strategy: "never",
        uniqueness_scope: "global", max_length: null, allowed_chars: "any", metadata: {}, status: "active",
      },
    });
    expect(result.success).toBe(true);
  });

  it("makes the v2 contract the source of the public compiled projection", () => {
    const canonical = MetaEntityContractV2Schema.parse(contract());
    const compiled = {
      entity_id: "legacy-entity-id",
      entity_code: "legacy_entity",
      entity_name: "Legacy",
      numbering_strategy: "none",
      version_hash: "legacy-version-hash",
      fields: [],
      display_config: { legacy: true },
      compiled_hash: "canonical-hash",
      contract_v2: canonical,
    } as unknown as import("../entity-compiler.service.js").CompiledEntity;

    const projected = projectCompiledEntityResponse(compiled);
    expect(readCompiledEntityContract(compiled)).toEqual(canonical);
    expect(projected["entity_code"]).toBe("sample_entity");
    expect(projected["entity_name"]).toBe("Sample");
    expect(projected["version_id"]).toBe("version-1");
    expect(projected["identity_config"]).toMatchObject({
      primary_key_field: "id",
      business_key_fields: [],
      natural_key_fields: [],
    });
    expect(projected["identity_config"]).not.toHaveProperty("identity_via");
    expect(projected["search_config"]).toMatchObject({ fields: [], min_query_length: 2, operator: "contains" });
    expect(projected["mutability"]).toBe("mutable");
    expect(projected["contract_v2"]).toEqual(canonical);
  });

  it("derives legacy list presentation from v2 surface bindings", () => {
    const canonical = MetaEntityContractV2Schema.parse(contract({
      surfaces: [{
        surface: {
          id: "surface-1", tenant_id: null, entity_version_id: "version-1", surface_key: "list",
          mode: "list", kind: "TABLE", renderer_key: "table", label: null, is_enabled: true,
          config: { features: { saved_views: true } },
        },
        fields: [{
          id: "surface-field-1", tenant_id: null, entity_surface_id: "surface-1", entity_field_id: "field-2",
          visible: true, required_override: null, readonly_override: null, sort_order: 0, column_span: null,
          density: null, renderer_config: {},
        }],
      }],
    }));
    const compiled = {
      entity_id: "legacy-entity-id",
      entity_code: "legacy_entity",
      entity_name: "Legacy",
      numbering_strategy: "none",
      version_hash: "legacy-version-hash",
      fields: [],
      display_config: { title_field: "legacy_title", list_columns: ["legacy_column"] },
      compiled_hash: "canonical-hash",
      contract_v2: canonical,
    } as unknown as import("../entity-compiler.service.js").CompiledEntity;

    const projected = projectCompiledEntityResponse(compiled);
    expect(projected["display_config"]).toMatchObject({
      title_field: "name",
      list_columns: ["name"],
    });
  });
});
