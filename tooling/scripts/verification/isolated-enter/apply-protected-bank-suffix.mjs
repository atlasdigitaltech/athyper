import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  sql,
  quote,
  fingerprint,
  docker,
  amendment,
} from "./protected-reveal-client.mjs";
const previewPath =
    "governance/policy/reports/business-partner-protected-bank-suffix-preview-20260912.dev.json",
  preview = JSON.parse(fs.readFileSync(previewPath));
assert(preview.passed && preview.rolledBack);
assert.equal(
  createHash("sha256")
    .update(fs.readFileSync(preview.migration.path))
    .digest("hex"),
  preview.migration.sha256,
);
assert(Date.now() < Date.parse(amendment.effectiveUntil));
for (const mode of ["api", "worker"])
  assert.equal(
    JSON.parse(docker(["inspect", "athyper-bp-enter-" + mode]))[0].Image,
    amendment.runtimeImage,
  );
const before = fingerprint(),
  output =
    "governance/policy/reports/business-partner-protected-bank-suffix-application-20260912.dev.json";
assert(!fs.existsSync(output));
const oldDefinition = sql(
  "SELECT pg_get_functiondef('master.trg_normalize_bank_account()'::regprocedure);",
);
const fixtureBefore = JSON.parse(
  sql(
    "SELECT to_jsonb(a) FROM master.bank_account a WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531';",
  ),
);
assert.equal(fixtureBefore.account_last4, "A248");
assert.equal(
  fixtureBefore.metadata.protectedValueToken,
  "qualification.bp.finance-reveal.01d4baa18931c720.bank",
);
sql(
  "BEGIN;SELECT set_config('app.current_principal_id',(SELECT id::text FROM master.principal WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='seed.three-plane-provisioner'),true);" +
    fs.readFileSync(preview.migration.path, "utf8") +
    `DO $window$ BEGIN IF clock_timestamp()>=${quote(amendment.effectiveUntil)}::timestamptz THEN RAISE EXCEPTION 'Approved execution window closed';END IF;END $window$;UPDATE master.bank_account SET account_last4='5432' WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531' AND tenant_id='44444444-4444-4444-8444-444444444444' AND account_last4='A248';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
);
const fixtureAfter = JSON.parse(
  sql(
    "SELECT to_jsonb(a) FROM master.bank_account a WHERE id='b19c9b40-398c-4b73-a5c4-e2d13f541531';",
  ),
);
assert.equal(fixtureAfter.account_last4, "5432");
for (const key of Object.keys(fixtureBefore).filter(
  (k) => !["account_last4", "updated_at", "updated_by"].includes(k),
))
  assert.deepEqual(fixtureAfter[key], fixtureBefore[key], key);
assert.deepEqual(fingerprint(), before);
const report = {
  createdAt: new Date().toISOString(),
  complete: true,
  executionBasis:
    "User authorization to complete field engineering in the isolated local environment; routine database correction, not a new runtime-image approval or access grant.",
  runtimeImage: amendment.runtimeImage,
  releaseSetHash: amendment.releaseSetHash,
  migration: preview.migration,
  preview: previewPath,
  previousFunctionSha256: createHash("sha256")
    .update(oldDefinition)
    .digest("hex"),
  functionSha256: createHash("sha256")
    .update(
      sql(
        "SELECT pg_get_functiondef('master.trg_normalize_bank_account()'::regprocedure);",
      ),
    )
    .digest("hex"),
  fixture: {
    id: fixtureAfter.id,
    previousSuffix: "A248",
    correctedSuffix: "5432",
    identityAndVerificationUnchanged: true,
  },
  authorityAndActivationUnchanged: true,
  grantsChanged: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log(report);
