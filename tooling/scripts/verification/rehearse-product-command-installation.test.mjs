import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  rollbackInstallationSql,
  migrationName,
  rehearse,
} from "./rehearse-product-command-installation.dev.mjs";
import { migrationSourcePath } from "./migration-source.mjs";
const source = readFileSync(migrationSourcePath(migrationName), "utf8");
const digest = createHash("sha256").update(source).digest("hex");
test("the real package rehearsal always rolls back with bounded waits", () => {
  const sql = rollbackInstallationSql(source, digest);
  assert.match(sql, /^BEGIN;\nSET LOCAL statement_timeout='30s';/);
  assert.match(sql, /SET LOCAL lock_timeout='5s';/);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.doesNotMatch(sql, /^COMMIT;/m);
});
test("modified packages and malformed hashes reject before database access", () => {
  assert.throws(() => rollbackInstallationSql(source + "\n", digest));
  assert.throws(() => rollbackInstallationSql(source, "untrusted"));
});
test("the executable has no installation or activation switch", () => {
  assert.throws(() => rehearse(["--apply", "DEV"]));
  assert.throws(() => rehearse(["--output", "/tmp/unused", "--apply"]));
});
