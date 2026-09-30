import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { sql, fingerprint } from "./protected-reveal-client.mjs";
const path = "server/db/scripts/tests/integration/fixtures/legacy-upgrades/20260912_protected_bank_display_suffix.sql",
  before = fingerprint();
const state = () =>
  sql(
    "SELECT md5(pg_get_functiondef('master.trg_normalize_bank_account()'::regprocedure)),(SELECT account_last4 FROM master.bank_account WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531');",
  );
const initial = state();
const setup =
  "BEGIN;SELECT set_config('app.current_principal_id',(SELECT id::text FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner'),true);";
sql(
  setup +
    fs.readFileSync(path, "utf8") +
    `DO $test$ BEGIN
UPDATE master.bank_account SET account_last4='5432' WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531';
IF (SELECT account_last4 FROM master.bank_account WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531')<>'5432' THEN RAISE EXCEPTION 'Protected suffix not preserved'; END IF;
UPDATE master.bank_account SET account_last4='xxxx' WHERE id='85363c6b-2735-4071-8dc7-c6c19a2d2e42';
IF (SELECT account_last4 FROM master.bank_account WHERE id='85363c6b-2735-4071-8dc7-c6c19a2d2e42')<>'5432' THEN RAISE EXCEPTION 'Legacy suffix no longer derived'; END IF;
BEGIN UPDATE master.bank_account SET account_last4='bad' WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531'; RAISE EXCEPTION 'Invalid suffix accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
BEGIN UPDATE master.bank_account SET account_id_value=repeat('A',64) WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531'; RAISE EXCEPTION 'Linked identity changed'; EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
END $test$;SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`,
);
assert.equal(state(), initial);
assert.deepEqual(fingerprint(), before);
const report = {
  createdAt: new Date().toISOString(),
  passed: true,
  checks: [
    "protected display suffix preserved",
    "legacy suffix derived from raw identifier",
    "invalid protected suffix rejected",
    "linked bank identity remains immutable",
  ],
  rolledBack: true,
  activeFunctionAndFixtureUnchanged: true,
  grantsChanged: false,
  migration: {
    path,
    sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
  },
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-protected-bank-suffix-preview-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(report);
