import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { describe, it } from "vitest";
import { meshExchangeRequirementsQuery, MESH_EXCHANGE_FUNCTIONS } from "../mesh-exchange-readiness.js";

// Explicit opt-in: every schema/data/grant change is inside a rolled-back transaction.
const container = process.env["MESH_READINESS_TEST_DOCKER"];
describe.skipIf(!container)("MESH readiness PostgreSQL regression", () => {
  it("rehearses repair and validates exact requirements as athyper_runtime", () => {
    const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: {} as never }) });
    const query = meshExchangeRequirementsQuery().compile(db).sql;
    const migration = readFileSync(new URL("../../../../../db/migrations/20260906_mesh_exchange_readiness.sql", import.meta.url), "utf8").replace(/COMMIT;\s*$/, "");
    const assert = (predicate: string, expected: number) => `SET LOCAL ROLE athyper_runtime;
      DO $test$ BEGIN IF (SELECT count(*) FROM (${query}) inspected WHERE ${predicate}) <> ${expected} THEN RAISE EXCEPTION 'MESH requirement assertion failed: expected ${expected}' USING DETAIL=$predicate$${predicate}$predicate$; END IF; END $test$;
      RESET ROLE;`;
    const commands = `${migration}
      ${assert("state='ready'", 5)}
      SAVEPOINT extra_permission;
      INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,metadata,status,created_by)
      SELECT md5('mesh-readiness-extra-regression')::uuid,'mesh.business_partner_exchange.extra_regression',permission_kind,module_id,risk_tier,'{}'::jsonb,'published',created_by
      FROM authz.permission WHERE canonical_code='mesh.business_partner_exchange.read';
      INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
      VALUES(md5('mesh-readiness-extra-regression')::uuid,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid);
      SET CONSTRAINTS ALL IMMEDIATE;
      ${assert("state='ready'", 5)}
      ROLLBACK TO extra_permission;
      SAVEPOINT unpublished_permission;
      SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',true);
      UPDATE authz.permission SET status='suspended' WHERE canonical_code='mesh.business_partner_exchange.read';
      ${assert("state<>'ready' AND requirement='mesh.business_partner_exchange.read'", 1)}
      ROLLBACK TO unpublished_permission;
      SAVEPOINT denied;
      REVOKE EXECUTE ON FUNCTION ${MESH_EXCHANGE_FUNCTIONS[1]} FROM athyperapp;
      ${assert("state='execute_denied'", 1)}
      ROLLBACK TO denied;
      SAVEPOINT missing_function;
      ALTER FUNCTION ${MESH_EXCHANGE_FUNCTIONS[1]} RENAME TO command_issue_registration_exchange_regression;
      ${assert("state='missing'", 1)}
      ROLLBACK TO missing_function;
      ${assert("state='ready'", 5)}
      ROLLBACK;`;
    execFileSync("docker", ["exec", "-i", container!, "sh", "-c", 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d athyper_mesh'], { input: commands, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  });
});
