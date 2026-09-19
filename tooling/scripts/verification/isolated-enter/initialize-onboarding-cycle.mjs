import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { assertAuthorityUnchanged } from "./dependency-authority-check.mjs";
const source = "server/db/ddl/planes/neon/control/12_reference_seed.sql",
  all = fs.readFileSync(source, "utf8");
const start = all.indexOf("DO $publish$\nDECLARE\n  tenant record;");
const end = all.indexOf("DO $seed_assertions$", start);
assert.ok(start > 0 && end > start);
const seed = all
  .slice(start, end)
  .replaceAll(
    "t.status='active'",
    "t.id='44444444-4444-4444-8444-444444444444' AND t.status='active'",
  );
const run = (input) =>
  cp
    .execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "athyper-bp-enter-db",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    )
    .trim();
const guard = `DO $guard$ BEGIN IF current_database()<>'athyper_neon' OR (SELECT array_agg(id ORDER BY id) FROM master.tenant WHERE id='44444444-4444-4444-8444-444444444444' AND status='active') IS DISTINCT FROM ARRAY['44444444-4444-4444-8444-444444444444'::uuid] THEN RAISE EXCEPTION 'ISOLATED_TENANT_REQUIRED';END IF;IF EXISTS(SELECT 1 FROM control.cycle_type WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND code='BP_SUPPLIER_ONBOARDING') THEN RAISE EXCEPTION 'EXISTING_CYCLE_REVIEW_REQUIRED';END IF;END $guard$;`;
const query =
  "SELECT jsonb_agg(jsonb_build_object('id',r.id,'revision',r.revision_number,'hash',r.template_hash,'publisher',p.code,'publisherKind',p.principal_type)) FROM control.cycle_template_revision r JOIN control.cycle_type t ON t.id=r.cycle_type_id JOIN master.principal p ON p.id=r.published_by WHERE t.tenant_id='44444444-4444-4444-8444-444444444444' AND t.code='BP_SUPPLIER_ONBOARDING';";
const before = assertAuthorityUnchanged();
run("BEGIN;" + guard + seed + query + "ROLLBACK;");
assert.deepEqual(assertAuthorityUnchanged(), before);
const result = JSON.parse(run("BEGIN;" + guard + seed + query + "COMMIT;"));
assert.deepEqual(assertAuthorityUnchanged(), before);
assert.equal(result.length, 2);
assert.ok(result.every((r) => r.publisherKind === "service_account"));
const out =
  "governance/policy/reports/business-partner-onboarding-cycle-bootstrap-20260912.dev.json";
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      source,
      sourceHash: createHash("sha256").update(all).digest("hex"),
      seedHash: createHash("sha256").update(seed).digest("hex"),
      result,
      authorizationAndHeadsUnchanged: true,
      authenticatedReview: false,
      kind: "repository-reference-bootstrap",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ report: out, revisions: result.length });
