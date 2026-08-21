import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ddlRoot = new URL("../../../../../db/ddl/planes/studio/publication/", import.meta.url);
const read = (name: string) => readFile(new URL(name, ddlRoot), "utf8");
const readStudio = (name: string) => readFile(new URL(`../../../../../db/ddl/planes/studio/${name}`, import.meta.url), "utf8");

describe("Studio Publication authority DDL", () => {
  it("seeds governed Publication route permissions on the pub module", async () => {
    const seed = await readStudio("authz/14_publication_permission_reference_seed.sql");
    const manifest = await readStudio("_manifest.txt");
    for (const permission of ["publication.release.view", "publication.deployment.view", "publication.release.publish", "publication.deployment.retry", "publication.release.rollback"]) expect(seed).toContain(permission);
    expect(seed).toContain("module.code='pub'");
    expect(seed).toContain("'critical',true");
    expect(seed).toContain("'tenant'::authz.scope_kind_d");
    expect(seed).toContain("'exact'::authz.propagation_mode_d");
    expect(manifest).toContain("planes/studio/authz/14_publication_permission_reference_seed.sql");
  });
  it("uses canonical planes and immutable command coordinates", async () => {
    const tables = await read("03_tables.sql");
    expect(tables).toContain("plane_code IN ('studio','neon','mesh')");
    expect(tables).toContain("target_plane IN ('studio','neon','mesh')");
    expect(tables).toContain("publication_deployment_command_uq UNIQUE (command_id)");
  });

  it("persists immutable unsigned compilation evidence before signing",async()=>{
    const tables=await read("03_tables.sql");const triggers=await read("08_triggers.sql");const grants=await read("11_grants.sql");
    expect(tables).toContain("CREATE TABLE publication.artifact_compilation");
    expect(tables).toContain("unsigned_document jsonb NOT NULL");
    expect(tables).toContain("NOT unsigned_document ? 'signature'");
    expect(triggers).toContain("publication_artifact_compilation_immutable");
    expect(grants).toContain("publication.artifact_compilation");
  });

  it("enforces release and artifact lifecycle functions", async () => {
    const functions = await read("07_functions.sql");
    expect(functions).toContain("fn_transition_release");
    expect(functions).toContain("SIGNED_ARTIFACT_REQUIRED");
    expect(functions).toContain("fn_transition_artifact");
    expect(functions).toContain("ARTIFACT_SIGNATURE_REQUIRED");
    expect(functions).toContain("v_row.status='validated' AND p_to_status='signed'");
  });

  it("uses immutable acknowledgement insertion with conflict detection", async () => {
    const functions = await read("07_functions.sql");
    const acknowledgement = functions.slice(functions.indexOf("fn_acknowledge_activation"));
    expect(acknowledgement).toContain("ACKNOWLEDGEMENT_CONFLICT");
    expect(acknowledgement).not.toContain("DO UPDATE SET");
    const triggers = await read("08_triggers.sql");
    expect(triggers).toContain("publication_deployment_ack_immutable");
  });

  it("writes required outbox events in authority transactions", async () => {
    const functions = await read("07_functions.sql");
    for (const topic of ["publication.release.published", "publication.deployment.requested", "publication.deployment.failed", "publication.deployment.acknowledged"]) {
      expect(functions).toContain(topic);
    }
    const transition = functions.slice(
      functions.indexOf("CREATE OR REPLACE FUNCTION publication.fn_transition_deployment"),
      functions.indexOf("CREATE OR REPLACE FUNCTION publication.fn_acknowledge_activation"),
    );
    for (const status of ["dispatched", "received", "staged", "verified", "activated", "failed", "rolled_back"]) {
      expect(transition).toContain(`publication.deployment.${status}`);
    }
    expect(transition).toContain("format('%s:%s',v_row.id,p_to_status)");
    expect(transition.indexOf("UPDATE publication.deployment")).toBeLessThan(
      transition.indexOf("publication.fn_emit_outbox"),
    );
  });

  it("restricts mutation to the dedicated authority functions", async () => {
    const grants = await read("11_grants.sql");
    expect(grants).toContain("GRANT SELECT ON publication.deployment,publication.deployment_event,publication.deployment_acknowledgement");
    expect(grants).not.toContain("GRANT SELECT,INSERT ON publication.deployment_event,publication.deployment_acknowledgement");
    expect(grants).toContain("fn_transition_release");
    expect(grants).toContain("fn_create_deployment");
  });
});
