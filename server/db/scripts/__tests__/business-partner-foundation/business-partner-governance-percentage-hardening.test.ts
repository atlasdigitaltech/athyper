import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const databaseRoot = path.resolve(import.meta.dirname, "../../..");
const read = (relative: string) =>
  readFile(path.join(databaseRoot, relative), "utf8");

test("G2 enforces aggregate Business Partner governance percentages", async () => {
  const [functions, triggers, migration, manifest] = await Promise.all([
    read("ddl/planes/neon/master/07_functions.sql"),
    read("ddl/planes/neon/master/08_triggers.sql"),
    read(
      "migrations/20260903_neon_business_partner_governance_percentage_hardening.sql",
    ),
    read("migrations/manifests/neon.txt"),
  ]);

  for (const source of [functions, migration]) {
    assert.match(source, /sum\(ownership_pct\)/);
    assert.match(source, /sum\(voting_pct\)/);
    assert.match(source, /sum\(beneficial_ownership_pct\)/);
    assert.match(
      source,
      /v_ownership > 100 OR v_voting > 100 OR v_beneficial > 100/,
    );
  }
  assert.match(
    triggers,
    /CREATE CONSTRAINT TRIGGER trg_business_partner_governance_totals[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    migration,
    /IF EXISTS \([\s\S]*GROUP BY tenant_id, business_partner_id[\s\S]*remediate historical rows before migration/,
  );
  assert.match(
    manifest,
    /20260903_neon_business_partner_governance_percentage_hardening\.sql/,
  );
});
