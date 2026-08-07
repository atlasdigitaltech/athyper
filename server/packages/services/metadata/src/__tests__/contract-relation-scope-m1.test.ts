import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");

describe("M1 contract projection ownership guard", () => {
  it("validates has_many foreign keys on the target effective version", () => {
    const ddl = source("server/db/ddl/planes/athyper/metadata/07_functions.sql");
    expect(ddl).toContain("IF NEW.relation_kind = 'has_many'");
    expect(ddl).toContain(
      "NEW.resolution_kind IS DISTINCT FROM 'array_fk'",
    );
    expect(ddl).toContain("v_relation_field_version := NEW.entity_version_id");
    expect(ddl).toContain("v_relation_field_version");
    expect(ddl).toContain("target_version.status = 'EFFECTIVE'");
    expect(ddl).toContain("v_relation_field_owner := 'target'");
    expect(ddl).toContain(
      "physical_column.table_schema = physical_entity.table_schema",
    );
    expect(ddl).toContain("COALESCE(NEW.fk_field, NEW.source_field)");
  });

  it("keeps the purchase order lines relation target-owned", () => {
    const seed = source(
      "server/db/seed/platform/003_control/042j_document_create_flow_contract.sql",
    );
    expect(seed).toContain(
      "('lines',                    'has_many', 'commitment_line'",
    );
    expect(seed).toContain("'commitment_id'");
  });

  it("keeps array-backed has-many relations source-owned", () => {
    const seed = source(
      "server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
    );
    expect(seed).toContain(
      "('purchase_requisition', 'suggested_suppliers',   'has_many',   'supplier',                  'array_fk',    'suggested_supplier_ids'",
    );
  });

  it("keeps service-sheet site ownership on its physical line field", () => {
    const seed = source(
      "server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
    );
    expect(seed).not.toContain(
      "('service_sheet', 'site',                  'belongs_to'",
    );
    expect(seed).toContain(
      "('service_sheet_line', 'site',             'belongs_to', 'site',             'fk', 'site_id'",
    );
  });

  it("retrofits the relation natural key for upgraded databases", () => {
    const ddl = source("server/db/ddl/planes/athyper/metadata/05_constraints.sql");
    expect(ddl).toContain("conname = 'er_name_uq'");
    expect(ddl).toContain(
      "ADD CONSTRAINT er_name_uq UNIQUE (entity_version_id, name)",
    );
    expect(ddl).toContain("ADD CONSTRAINT eo_binding_uq");
    expect(ddl).toContain("ADD CONSTRAINT encfg_natural_uq");
  });

  it("targets the legacy partial index for lifecycle-mask seed upserts", () => {
    for (const path of [
      "server/db/seed/platform/003_control/072p_p2p_runtime_contract.sql",
      "server/db/seed/platform/003_control/095_control_three_plane_runtime_contract.sql",
    ]) {
      const seed = source(path);
      expect(seed).toContain(
        "ON CONFLICT (tenant_id, entity_name, record_status)\n    WHERE entity_version_id IS NULL DO UPDATE",
      );
    }
  });

  it("infers the versioned operation partial index instead of naming it as a constraint", () => {
    for (const path of [
      "server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql",
      "server/db/seed/blueprints/modules/ap_non_po/090_entity_operations_delta.sql",
    ]) {
      const seed = source(path);
      expect(seed).not.toContain("ON CONFLICT ON CONSTRAINT eo_v2_binding_uq");
      expect(seed).toContain(
        "ON CONFLICT (tenant_id, entity_version_id, permission_code)",
      );
      expect(seed).toContain("WHERE entity_version_id IS NOT NULL");
    }
  });

  it("seeds the asset component collection with its physical child FK", () => {
    const seed = source(
      "server/db/seed/platform/003_control/043_control_entity_relation_contract.sql",
    );
    expect(seed).toContain(
      "('asset', 'components',              'has_many',   'asset_component',       'parent_asset_id'",
    );
    expect(seed).toContain("source_field = EXCLUDED.fk_field");
  });

  it("guards polymorphic NEW fields behind table-specific branches", () => {
    const ddl = source("server/db/ddl/planes/athyper/metadata/07_functions.sql");
    expect(ddl).toContain(
      "IF TG_TABLE_NAME IN ('entity_surface','entity_policy','entity_numbering_config') THEN",
    );
    expect(ddl).not.toContain(
      "TG_TABLE_NAME IN ('entity_surface','entity_policy','entity_numbering_config')\n       AND NEW.entity_id",
    );
    expect(ddl).toContain("IF TG_TABLE_NAME = 'entity_action_rule' THEN");
  });

  it("allows composite flow fields only through an explicitly owned section", () => {
    const ddl = source("server/db/ddl/planes/athyper/metadata/07_functions.sql");
    const seed = source(
      "server/db/seed/platform/003_control/046_control_entity_flow_contract.sql",
    );

    expect(ddl).toContain("v_section_entity_code");
    expect(ddl).toContain("section.flow_step_id = NEW.flow_step_id");
    expect(ddl).toContain("section.section_key = NEW.section_key");
    expect(ddl).toContain(
      "v_field_entity_code IS DISTINCT FROM v_section_entity_code",
    );
    expect(seed).toContain(
      "'fields', 'business_partner', NULL, NULL",
    );
    expect(seed).toContain(
      "('business_partner', 'identify_core', 'name'",
    );
  });
});

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}
