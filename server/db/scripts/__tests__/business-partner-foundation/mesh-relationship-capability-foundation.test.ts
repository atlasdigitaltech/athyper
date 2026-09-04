import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "../../..");
test("G3 creates capability episodes instead of relationship metadata flags", async () => {
  const sql = await readFile(
    path.join(
      root,
      "ddl/planes/mesh/mesh/11_grants.sql",
    ),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE mesh\.network_relationship_capability/);
  assert.match(
    sql,
    /EXCLUDE USING gist[\s\S]*capability_code WITH =[\s\S]*daterange/,
  );
  assert.match(sql, /status = 'requested' AND approved_by_tenant_id IS NULL/);
  assert.doesNotMatch(
    sql,
    /ALTER TABLE mesh\.network_relationship\s+ADD COLUMN .*capability/is,
  );
  assert.doesNotMatch(
    sql,
    /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*network_relationship_capability TO athyperapp/i,
  );
});
