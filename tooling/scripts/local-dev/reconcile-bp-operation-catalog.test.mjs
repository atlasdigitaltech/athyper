import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const root = new URL("../../../", import.meta.url);
const sql = readFileSync(
  new URL(
    "server/db/ddl/planes/neon/authz/27_partner_governed_operation_permissions.sql",
    root,
  ),
  "utf8",
);
const history = JSON.parse(
  readFileSync(
    new URL(
      "governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json",
      root,
    ),
    "utf8",
  ),
).definitions;
test("restores exactly the four owning-service catalog contracts, not retired read aliases", () => {
  const rows = [
    ...sql.matchAll(
      /'neon\.relationship\.bp_target\.(\w+)','(\w+)','(\w+)',(true|false),ARRAY\[([^\]]+)\]/g,
    ),
  ];
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r[1]).sort(), [
    "configure_company",
    "export",
    "import",
    "qualification_company",
  ]);
  for (const row of rows) {
    const prior = history.find(
      (d) => d.code === `neon.relationship.bp_target.${row[1]}`,
    );
    assert.equal(row[2], prior.module_code);
    assert.equal(row[3], prior.risk_tier);
    assert.equal(row[4] === "true", prior.requires_sod);
    assert.equal(prior.requires_mfa, false);
    assert.deepEqual(
      row[5]
        .split(",")
        .map((x) => x.replaceAll("'", ""))
        .sort(),
      prior.scopes.map((s) => s.scopeKind).sort(),
    );
  }
});
test("does not grant access or overwrite drifted definitions", () => {
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+authz\.(?:role_permission|role_assignment|group_role_assignment|principal_grant)\b/i,
  );
  assert.doesNotMatch(sql, /\bUPDATE\s+authz\./i);
  assert.match(sql, /BP_GOVERNED_OPERATION_CATALOG_DRIFT/);
  assert.match(sql, /propagation_mode<>'exact'/);
  assert.match(sql, /IF NOT FOUND THEN/);
});
