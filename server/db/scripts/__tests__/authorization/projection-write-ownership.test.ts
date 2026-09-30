import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "node:test";

const dbRoot = resolve(import.meta.dirname, "../../..");

it("uses dedicated non-login roles for routine ownership and break-glass repair", async () => {
  const roles = await readFile(
    resolve(dbRoot, "ddl/common/_database/01_service_roles.sql"),
    "utf8",
  );
  for (const role of [
    "athyper_projection_owner",
    "athyper_projection_breakglass",
  ]) {
    assert.match(
      roles,
      new RegExp(`CREATE ROLE ${role}[\\s\\S]*?NOLOGIN[\\s\\S]*?NOBYPASSRLS`),
    );
  }
});

it("contains no projection write policy for CURRENT_USER or athyperadmin", async () => {
  const rls = await readFile(
    resolve(dbRoot, "ddl/common/authz/10_rls.sql"),
    "utf8",
  );
  const projectionSection = rls.slice(
    rls.indexOf("-- Projection ownership classes:"),
  );
  assert.doesNotMatch(projectionSection, /FOR ALL TO CURRENT_USER/i);
  assert.doesNotMatch(projectionSection, /FOR ALL TO athyperadmin/i);
  assert.match(
    projectionSection,
    /projection_owner_write[\s\S]*athyper_projection_owner/,
  );
  assert.match(
    projectionSection,
    /projection_breakglass_write[\s\S]*athyper_projection_breakglass/,
  );
});

it("keeps the runtime applier function-only and removes ordinary admin mutation APIs", async () => {
  const grants = await readFile(
    resolve(dbRoot, "ddl/common/authz/11_grants.sql"),
    "utf8",
  );
  const statements = grants
    .split(";")
    .filter((statement) =>
      /TO\s+athyper_projection_applier\b/i.test(statement),
    );
  assert.equal(
    statements.some((statement) =>
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(statement),
    ),
    false,
  );
  assert.match(
    grants,
    /GRANT EXECUTE ON FUNCTION authz\.fn_stage_application_projection[\s\S]*TO athyper_projection_applier/,
  );
  assert.match(
    grants,
    /GRANT USAGE ON SCHEMA master TO athyper_projection_owner/,
  );
  assert.match(
    grants,
    /GRANT SELECT ON master\.tenant,authz\.scope_target TO athyper_projection_owner/,
  );
  assert.match(
    grants,
    /GRANT EXECUTE ON FUNCTION shared\.current_tenant_id_soft\(\) TO athyper_projection_owner/,
  );
  assert.match(
    grants,
    /REVOKE EXECUTE ON FUNCTION authz\.fn_stage_application_projection[\s\S]*FROM PUBLIC,athyperadmin/,
  );
  assert.match(
    grants,
    /REVOKE EXECUTE ON FUNCTION authz\.fn_stage_entity_operation_projection[\s\S]*FROM athyperadmin/,
  );
});

it("stages application projections atomically and transfers every mutation API after definition", async () => {
  const functions = await readFile(
    resolve(dbRoot, "ddl/common/authz/07_functions.sql"),
    "utf8",
  );
  const grants = await readFile(
    resolve(dbRoot, "ddl/common/authz/11_grants.sql"),
    "utf8",
  );
  assert.match(
    functions,
    /fn_stage_application_projection[\s\S]*pg_advisory_xact_lock[\s\S]*INSERT INTO authz\.application_projection[\s\S]*INSERT INTO authz\.projection_provider[\s\S]*INSERT INTO authz\.projection_scope/,
  );
  for (const routine of [
    "fn_stage_application_projection",
    "fn_activate_application_projection",
    "fn_stage_entity_operation_projection",
    "fn_activate_entity_operation_projection",
    "fn_retire_entity_operation_projection",
    "fn_restore_entity_operation_projection",
  ]) {
    assert.match(
      grants,
      new RegExp(
        `ALTER FUNCTION authz\\.${routine}[\\s\\S]{0,160}OWNER TO athyper_projection_owner`,
      ),
    );
  }
  assert.match(
    functions,
    /GRANT athyper_projection_owner TO CURRENT_USER;[\s\S]*REVOKE athyper_projection_owner FROM CURRENT_USER;/,
  );
});

it("probes real applier and admin behavior in the live release gate", async () => {
  const gate = (await Promise.all([
    "authorization-release-gates.ts",
    "authorization-release-live.ts",
  ].map((file) => readFile(resolve(dbRoot, "scripts/checks/seeds", file), "utf8")))).join("\n");
  assert.match(gate, /SET LOCAL ROLE athyper_projection_applier/);
  assert.match(gate, /applier_direct_dml_denied/);
  assert.match(gate, /applier_can_execute_mutation_api/);
  assert.match(gate, /SET LOCAL ROLE athyperadmin/);
  assert.match(gate, /admin_direct_dml_denied/);
  assert.match(gate, /admin_mutation_api_denied/);
});
