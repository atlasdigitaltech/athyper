import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFile(resolve(root, path), "utf8");
function definition(sql: string, name: string) {
  const escaped = name.replaceAll(".", "\\.");
  const match = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${escaped}\\([\\s\\S]*?END\\s*\\$\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0].replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION");
}
test("review upgrade functions match fresh-install definitions", async () => {
  for (const [ddlPath, migrationPath, functions] of [
    ["ddl/planes/mesh/mesh/11_grants.sql", "migrations/20260910_mesh_command_hardening.sql", [
      "mesh.command_relationship_capability_lifecycle",
      "mesh.command_registration_exchange_lifecycle", "mesh.command_retrieve_bank_protected_token",
    ]],
    ["ddl/planes/mesh/mesh/11_grants.sql", "migrations/20260910_mesh_discovery_current_status.sql", ["mesh.command_discover_network_relationship"]],
    ["ddl/planes/studio/trustiam/12_identity_replay_approval.sql", "migrations/20260910_identity_replay_context_hardening.sql", [
      "trustiam.trg_guard_identity_replay_approval", "trustiam.trg_require_identity_replay_approval",
    ]],
  ] as const) {
    const [ddl, migration] = await Promise.all([read(ddlPath), read(migrationPath)]);
    for (const name of functions) assert.equal(definition(migration, name), definition(ddl, name), name);
  }
});
test("discovery receipt and approval constraint match their upgrade definitions", async () => {
  const [ddl, migration] = await Promise.all([read("ddl/planes/mesh/mesh/11_grants.sql"), read("migrations/20260910_mesh_command_hardening.sql")]);
  const receipt = ddl.slice(ddl.indexOf("CREATE TABLE mesh.network_discovery_receipt"), ddl.indexOf("CREATE OR REPLACE FUNCTION mesh.command_discover_network_relationship")).trim();
  assert.ok(migration.includes(receipt));
  const constraint = ddl.match(/CONSTRAINT network_relationship_capability_approval_chk CHECK \([\s\S]*?\n    \)/)?.[0];
  assert.ok(constraint);
  assert.ok(migration.includes(constraint));
  assert.ok((await read("migrations/20260910_mesh_capability_constraint_preflight.sql")).includes(constraint));
});
