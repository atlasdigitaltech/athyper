import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ddlRoot = new URL("../../../../../db/ddl/common/runtime_meta/", import.meta.url);
const read = (name: string) => readFile(new URL(name, ddlRoot), "utf8");

describe("target-plane Publication projection DDL", () => {
  it("exposes separate resumable stage, verify, and activate functions", async () => {
    const functions = await read("07_functions.sql");
    expect(functions).toContain("fn_stage_release_projection");
    expect(functions).toContain("fn_verify_release");
    expect(functions).toContain("fn_activate_release");
    expect(functions).toContain("IF v_row.status='verified' THEN RETURN v_row");
    expect(functions).toContain("IF v_candidate.status='active' THEN");
  });

  it("persists verification failures without moving the activation head", async () => {
    const functions = await read("07_functions.sql");
    const verification = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_verify_release"),
      functions.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_stage_entity_projection"),
    );
    for (const failureCode of [
      "ARTIFACT_HASH_MISMATCH", "ARTIFACT_SIGNATURE_INVALID",
      "ARTIFACT_MANIFEST_INVALID", "RUNTIME_INCOMPATIBLE",
      "TARGET_PLANE_MISMATCH", "PROJECTION_HASH_MISMATCH",
      "PROJECTION_SCHEMA_VERSION_MISMATCH",
    ]) expect(verification).toContain(failureCode);
    expect(verification).toContain("status='rejected'");
    expect(verification).not.toContain("release_activation_head");
  });

  it("serializes activation and reads only through the local head", async () => {
    const functions = await read("07_functions.sql");
    const activeRelease = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_active_release"),
      functions.indexOf("COMMENT ON FUNCTION runtime_meta.fn_active_release"),
    );
    const activeEntity = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION runtime_meta.fn_active_entity_descriptor"),
      functions.indexOf("COMMENT ON FUNCTION runtime_meta.fn_active_entity_descriptor"),
    );
    expect(functions).toContain("pg_advisory_xact_lock");
    expect(activeRelease).toContain("runtime_meta.release_activation_head");
    expect(activeEntity).toContain("runtime_meta.release_activation_head");
    expect(activeRelease).not.toMatch(/publication\.|metadata\.|dblink|postgres_fdw/i);
    expect(activeEntity).not.toMatch(/publication\.|metadata\.|dblink|postgres_fdw/i);
  });

  it("grants every target function to the projection applier", async () => {
    const grants = await read("11_grants.sql");
    for (const functionName of [
      "fn_stage_release_projection", "fn_verify_release", "fn_activate_release",
      "fn_rollback_release", "fn_active_release", "fn_active_entity_descriptor",
    ]) expect(grants).toContain(functionName);
  });
});
