import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
assert.equal(
  process.argv.length,
  2,
  "Rollback-only preview accepts no apply option",
);
const path =
    "governance/policy/reviews/business-partner-source-constraints.proposal.dev.json",
  bytes = fs.readFileSync(path),
  proposal = JSON.parse(bytes),
  revision = createHash("sha256").update(bytes).digest("hex");
assert.equal(proposal.status, "review_required");
assert.deepEqual(proposal.grantChanges, []);
assert.deepEqual(proposal.aliases, []);
assert.equal(proposal.activationAuthorized, false);
assert.deepEqual(proposal.definitions.map((d) => d.code).sort(), [
  "collaboration.comment.read",
  "document.attachment.read",
]);
for (const d of proposal.definitions) {
  assert.equal(d.moduleCode, "fnd");
  assert.equal(d.permissionKind, "capability");
  assert.deepEqual(d.scopeKinds, ["resource"]);
  assert.equal(d.propagation, "exact");
  assert.equal(d.riskTier, "low");
  for (const k of [
    "requiresMfa",
    "requiresSod",
    "shareable",
    "delegable",
    "overridable",
  ])
    assert.equal(d[k], false);
}
const before = assertAuthorityUnchanged();
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = `BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL app.database_plane='neon';
SELECT pg_advisory_xact_lock(hashtext('bp-source-constraints-preview'));
CREATE TEMP TABLE expected AS SELECT value->>'code' code FROM jsonb_array_elements(${quote(JSON.stringify(proposal.definitions))}::jsonb);
DO $guard$ BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF EXISTS(SELECT 1 FROM authz.permission p JOIN expected e ON e.code=p.canonical_code) THEN RAISE EXCEPTION 'Source already exists; review conflict before overwrite'; END IF;
 IF (SELECT count(*) FROM control.module WHERE code='fnd' AND status='active')<>1 THEN RAISE EXCEPTION 'Active module unresolved'; END IF;
END $guard$;
INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
 SELECT e.code,'capability',m.id,'low',false,false,false,false,false,jsonb_build_object('proposalRevision',${quote(revision)},'purpose','legacy_read_source_constraints'),'published','00000000-0000-0000-0000-000000000000'::uuid FROM expected e JOIN control.module m ON m.code='fnd' AND m.status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,created_by)
 SELECT p.id,'resource','exact','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission p JOIN expected e ON e.code=p.canonical_code;
SELECT json_build_object('definitions',json_agg(json_build_object('code',p.canonical_code,'kind',p.permission_kind,'scope',s.scope_kind,'propagation',s.propagation_mode,'requiresMfa',p.requires_mfa,'requiresSod',p.requires_sod,'riskTier',p.risk_tier) ORDER BY p.canonical_code)) FROM authz.permission p JOIN expected e ON e.code=p.canonical_code JOIN authz.permission_scope_kind s ON s.permission_id=p.id;
ROLLBACK;`;
const out = cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-r20-db",
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
  ],
  { input: sql, encoding: "utf8" },
);
const result = out
  .split("\n")
  .filter((s) => s.startsWith("{"))
  .map((s) => JSON.parse(s));
assert.equal(result.length, 1);
assert.equal(result[0].definitions.length, 2);
const after = assertAuthorityUnchanged();
assert.equal(after.sha256, before.sha256);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  proposal: path,
  proposalRevision: revision,
  rolledBack: true,
  applied: false,
  authoritySha256: after.sha256,
  grantsChanged: false,
  activationChanged: false,
  ...result[0],
  acceptanceRecorded: false,
  qualification:
    "Catalog SQL preview only; no live access or publication qualification claimed",
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-source-constraints.dry-run.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
