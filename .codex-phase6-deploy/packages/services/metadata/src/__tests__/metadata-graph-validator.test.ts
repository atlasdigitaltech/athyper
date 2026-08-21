import { describe, expect, it } from "vitest";

import { validateMetadataGraph, type MetadataGraphQuery } from "../metadata-graph-validator.js";

function queryFixture(overrides: { duplicateFields?: boolean } = {}): MetadataGraphQuery {
  const entity = {
    entity_id: "entity-1",
    entity_code: "supplier",
    name: "supplier",
    slug: "supplier",
    entity_class: "MASTER",
    table_schema: "master",
    table_name: "supplier",
    backing_type: "table",
    runtime_enabled: true,
    status: "ACTIVE",
    is_active: true,
    primary_key: "id",
    tenant_column: "tenant_id",
    read_capability: "generic",
    write_capability: "none",
    feature_flags: {},
    mutability: "locked",
    effective_version_count: 1,
    effective_version_id: "version-1",
  };
  const fields = [
    { entity_version_id: "version-1", name: "id", column_name: "id", projection_alias_of: null, is_computed: false, reference_config: null, validation: null },
    { entity_version_id: "version-1", name: "tenant_id", column_name: "tenant_id", projection_alias_of: null, is_computed: false, reference_config: null, validation: null },
    { entity_version_id: "version-1", name: "name", column_name: "name", projection_alias_of: null, is_computed: false, reference_config: null, validation: null },
    ...(overrides.duplicateFields
      ? [{ entity_version_id: "version-1", name: "name", column_name: "name", projection_alias_of: null, is_computed: false, reference_config: null, validation: null }]
      : []),
  ];
  return {
    async query<T extends object>(text: string): Promise<{ rows: T[] }> {
      if (text.includes("COUNT(ev.id) FILTER")) return { rows: [entity as T] };
      if (text.includes("FROM control.entity_field ef")) return { rows: fields as T[] };
      if (text.includes("FROM control.entity_relation er")) return { rows: [] as T[] };
      if (text.includes("FROM control.entity_operation")) return { rows: [] as T[] };
      if (text.includes("FROM pg_class")) return { rows: [{ relation_kind: "table" } as T] };
      if (text.includes("information_schema.columns")) {
        return { rows: ["id", "tenant_id", "name"].map((column_name) => ({ column_name }) as T) };
      }
      if (text.includes("information_schema.table_constraints")) return { rows: [{ column_name: "id", ordinal_position: 1 } as T] };
      throw new Error(`Unhandled graph query: ${text}`);
    },
  };
}

describe("metadata graph validator", () => {
  it("accepts a valid tenant-scoped runtime contract", async () => {
    const result = await validateMetadataGraph(queryFixture());
    expect(result.passed).toBe(true);
    expect(result.eligibleEntityCodes).toEqual(["supplier"]);
  });

  it("reports duplicate logical and physical fields before compilation", async () => {
    const result = await validateMetadataGraph(queryFixture({ duplicateFields: true }));
    expect(result.passed).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_LOGICAL_FIELD",
      "DUPLICATE_PHYSICAL_COLUMN",
    ]));
  });
});
