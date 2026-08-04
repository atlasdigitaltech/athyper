import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

const tableDdl = source("../../../../../db/ddl/control/01zz_meta_entity_contract_m1.sql");
const constraintDdl = source("../../../../../db/ddl/control/03zz_meta_entity_contract_m1.sql");
const indexDdl = source("../../../../../db/ddl/control/04zz_meta_entity_contract_m1.sql");
const functionDdl = source("../../../../../db/ddl/control/05zz_meta_entity_contract_m1.sql");
const triggerDdl = source("../../../../../db/ddl/control/06zz_meta_entity_contract_m1.sql");
const rlsDdl = source("../../../../../db/ddl/control/08zz_meta_entity_contract_m1.sql");
const finalSeed = source("../../../../../db/seed/platform/003_control/101_control_meta_entity_contract_v2.sql");
const permissionSeed = source("../../../../../db/ddl/planes/athyper/authz/12_compiled_permission_reference_seed.sql");
const contractRoute = source("../../routes/studio-contract-v2.route.ts");
const versionRoute = source("../../routes/studio-version.route.ts");

describe("Meta Entity Contract M1 foundation", () => {
  it("owns canonical workflow storage outside generic behaviors", () => {
    for (const column of [
      "contract_schema_version",
      "contract_document",
      "contract_hash",
      "validation_status",
      "validation_diagnostics",
      "base_version_id",
      "lock_version",
    ]) {
      expect(tableDdl).toContain(column);
    }
    expect(contractRoute).toContain("contract_document = ${json(parsed.data)}::jsonb");
    expect(contractRoute).not.toContain("jsonb_set(");
  });

  it("moves structural promotion out of seed 101", () => {
    expect(finalSeed).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(finalSeed).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
    expect(indexDdl).toContain("es_v2_binding_uq_idx");
    expect(indexDdl).toContain("eo_v2_binding_uq_idx");
  });

  it("enforces a single work version, immutable review documents, and pointer integrity", () => {
    expect(indexDdl).toContain("ev_one_open_work_version_uq");
    expect(indexDdl).toContain("status IN ('DRAFT','IN_REVIEW')");
    expect(functionDdl).toContain("OLD.status IN ('IN_REVIEW','EFFECTIVE','SUPERSEDED')");
    expect(functionDdl).toContain("trg_fn_validate_entity_publish_state");
    expect(triggerDdl).toContain("trg_ev_maintain_publish_state");
    expect(constraintDdl).toContain("ev_base_version_fk");
  });

  it("forces RLS on every M1 tenant-sensitive table", () => {
    for (const table of [
      "entity_flow",
      "entity_flow_step",
      "entity_flow_section",
      "entity_flow_field",
      "entity_lifecycle_state_mask",
      "entity_numbering_config",
      "entity_numbering_counter",
      "entity_action_rule",
    ]) {
      expect(rlsDdl).toContain(`control.${table}`);
    }
    expect(rlsDdl).toContain("FORCE ROW LEVEL SECURITY");
    expect(rlsDdl).toContain("shared.current_tenant_id()");
  });

  it("defines and consumes the complete Admin-plane workflow permission set", () => {
    for (const permission of [
      "metadata.contract.view",
      "metadata.contract.draft.create",
      "metadata.contract.edit",
      "metadata.contract.submit",
      "metadata.contract.review",
      "metadata.contract.publish",
      "metadata.contract.rollback",
      "metadata.contract.import",
      "metadata.contract.export",
      "metadata.overlay.edit",
      "metadata.contract.break_glass",
    ]) {
      expect(permissionSeed).toContain(permission);
    }
    expect(contractRoute).toContain('permissionContext?.planeKey === "admin"');
    expect(versionRoute).toContain("METADATA_SEPARATION_OF_DUTIES");
    expect(versionRoute).toContain("approval_break_glass_ticket");
  });
});
