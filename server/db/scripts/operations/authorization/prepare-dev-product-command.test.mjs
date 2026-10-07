import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  installationSql,
  migrationName,
  prepare,
} from "./prepare-dev-product-command.mjs";
import { migrationSourcePath } from "../../../../../tooling/scripts/verification/migration-source.mjs";
const source = readFileSync(migrationSourcePath(migrationName), "utf8");
const digest = createHash("sha256").update(source).digest("hex");
const passwords = { issuer: "a".repeat(54), application: "b".repeat(54) };
test("default rehearsal rolls back package and provisioning together, with bounded locks", () => {
  const result = installationSql(source, digest, passwords, false);
  assert.match(result, /ROLLBACK;\n$/);
  assert.doesNotMatch(result, /^COMMIT;/m);
  assert.match(result, /pg_advisory_xact_lock/);
  assert.match(result, /lock_timeout='5s'/);
  assert.doesNotMatch(result, /INSERT INTO public.athyper_schema_migration_v1/);
});
test("installation records the original immutable digest in the same transaction", () => {
  const result = installationSql(source, digest, passwords, true);
  assert.match(result, /COMMIT;\n$/);
  assert.ok(result.includes(`'${digest}','applied'`));
  assert.match(result, /INSTALLATION_LEDGER_CHANGED/);
  assert.match(result, /UNMANAGED_COMMAND_LOGIN/);
  assert.doesNotMatch(
    result,
    /GRANT .*athyperadmin|INSERT INTO metadata|UPDATE metadata|INSERT INTO authz/,
  );
  assert.match(result, /GRANT EXECUTE ON FUNCTION audit.append_event/);
});
test("tampering, ambiguous execution and SQL-bearing credentials fail before execution", () => {
  assert.throws(() => installationSql(source + "\n", digest, passwords, true));
  assert.throws(() =>
    installationSql(source, digest, { ...passwords, issuer: "bad'" }, true),
  );
  assert.throws(() => installationSql(source, digest, passwords, "yes"));
  assert.throws(() => prepare(["--apply", "--output", "/tmp/no-write"]));
});
