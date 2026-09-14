import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

assert.equal(
  process.argv.length,
  2,
  "Rollback-only rehearsal has no apply option",
);
const path =
  "governance/policy/reviews/business-partner-reset-studio-catalog.proposal.dev.json";
const proposal = JSON.parse(fs.readFileSync(path));
const { proposalRevision, ...body } = proposal;
assert.equal(
  createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  proposalRevision,
);
assert.equal(proposal.status, "review_required");
assert.deepEqual(proposal.grantChanges, []);
assert.deepEqual(proposal.aliases, []);
assert.equal(proposal.activationAuthorized, false);
assert.deepEqual(
  proposal.definitions.map((d) => d.code),
  ["author", "validate", "test", "submit", "review", "publish"].map(
    (o) => "metadata.entity." + o,
  ),
);
for (const d of proposal.definitions) {
  assert.equal(d.moduleCode, "meta");
  assert.equal(d.permissionKind, "capability");
  assert.deepEqual(d.scopeKinds, ["tenant"]);
  assert.equal(d.propagation, "exact");
  assert.equal(d.requiresMfa, true);
  assert.equal(
    d.requiresSod,
    ["metadata.entity.review", "metadata.entity.publish"].includes(d.code),
  );
  assert.equal(
    d.riskTier,
    d.code.endsWith(".publish")
      ? "critical"
      : d.code.endsWith(".review")
        ? "high"
        : "medium",
  );
  for (const k of ["shareable", "delegable", "overridable"])
    assert.equal(d[k], false);
}
const psql = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "athyper-dev-db-1",
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_studio",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
const tables = [
  "role",
  "role_permission",
  "group_member",
  "group_role",
  "plane_membership",
  "delegation",
  "delegation_grant",
  "permission",
  "permission_scope_kind",
  "deny_rule",
  "record_acl",
  "override",
  "scope_target",
  "principal_group",
];
const fingerprint = () =>
  createHash("sha256")
    .update(
      psql(
        tables
          .map(
            (t) =>
              `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
          )
          .join(" UNION ALL "),
      ),
    )
    .digest("hex");
const baseline = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-intentional-reset-baseline.dev.json",
  ),
);
assert.equal(proposal.baselineSha256, baseline.baselineSha256);
const before = fingerprint();
assert.equal(
  before,
  baseline.studioAuthoritySha256,
  "Studio changed; prepare a successor proposal",
);
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = `BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL app.database_plane='studio';
SELECT pg_advisory_xact_lock(hashtext('bp-reset-studio-catalog'));
CREATE TEMP TABLE expected AS SELECT value d FROM jsonb_array_elements(${quote(JSON.stringify(proposal.definitions))}::jsonb);
DO $guard$ BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Wrong database';END IF;
 IF EXISTS(SELECT 1 FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code') THEN RAISE EXCEPTION 'Existing definition must not be overwritten or republished';END IF;
 IF (SELECT count(*) FROM control.module WHERE code='meta' AND status='active')<>1 THEN RAISE EXCEPTION 'Active META module required';END IF;
END $guard$;
INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT d->>'code','capability',m.id,(d->>'riskTier')::authz.risk_tier_d,true,(d->>'requiresSod')::boolean,false,false,false,jsonb_build_object('proposalRevision',${quote(proposalRevision)}),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM expected JOIN control.module m ON m.code='meta' AND m.status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,created_by)
SELECT p.id,'tenant','exact','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code';
SELECT json_build_object('definitions',count(*),'allMfa',bool_and(p.requires_mfa),'exactTenant',bool_and(s.scope_kind='tenant' AND s.propagation_mode='exact'),'noAssignments',NOT EXISTS(SELECT 1 FROM authz.role_permission rp WHERE rp.permission_id IN(SELECT p2.id FROM authz.permission p2 JOIN expected e2 ON p2.canonical_code=e2.d->>'code'))) FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code' JOIN authz.permission_scope_kind s ON s.permission_id=p.id;
ROLLBACK;`;
const output = psql(sql);
const result = JSON.parse(output.split("\n").find((l) => l.startsWith("{")));
assert.equal(result.definitions, 6);
assert.equal(result.allMfa, true);
assert.equal(result.exactTenant, true);
assert.equal(result.noAssignments, true);
assert.equal(fingerprint(), before, "Rehearsal changed authority");
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  proposal: path,
  proposalRevision,
  baselineSha256: baseline.baselineSha256,
  studioAuthoritySha256: before,
  ...result,
  rolledBack: true,
  applied: false,
  grantsChanged: false,
  activationChanged: false,
  acceptanceRecorded: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-reset-studio-catalog.dry-run.dev.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
