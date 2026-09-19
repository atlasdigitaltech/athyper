import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const read = (p) => JSON.parse(fs.readFileSync(p));
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const reportPath =
  "governance/policy/reports/business-partner-reset-runtime-catalog.installation.dev.json";
assert.ok(!fs.existsSync(reportPath), "Preserve prior installation");
const proposalPath =
  "governance/policy/reviews/business-partner-reset-runtime-catalog.proposal.dev.json";
const proposal = read(proposalPath),
  { proposalRevision, ...body } = proposal;
assert.equal(hash(JSON.stringify(body)), proposalRevision);
assert.equal(
  proposalRevision,
  "af245aecf93f0b164911ea00f46c61521bd1ebb6f46ab1bb6ce70a8704ad5b59",
);
assert.equal(proposal.definitions.length, 29);
assert.deepEqual(proposal.grantChanges, []);
const approvalPath =
  "governance/policy/reviews/business-partner-reset-runtime-catalog.authorization.dev.json";
const approval = {
  schemaVersion: 1,
  proposalRevision,
  source:
    "conversation user: go ahead and fix 29 missing catalog definitions and invalid enter transition",
  actor: "conversation_user",
  namedAccountImpersonated: false,
  catalogDefinitionsOnly: true,
  grantChangesAuthorized: false,
  activationAuthorized: false,
};
if (!fs.existsSync(approvalPath))
  fs.writeFileSync(approvalPath, JSON.stringify(approval, null, 2) + "\n");
assert.deepEqual(read(approvalPath), approval);
const approvalHash = hash(fs.readFileSync(approvalPath));
const targets = [
  {
    key: "neon",
    container: "athyper-dev-db-1",
    database: "athyper_neon",
    plane: "neon",
    definitions: proposal.definitions,
    revision: proposalRevision,
  },
];
const psql = (t, sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      t.container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      t.database,
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
const snapshot = (t) =>
  JSON.parse(
    psql(
      t,
      `SELECT jsonb_object_agg(name,digest) FROM (${[...tables.map((n) => [n, "authz." + n]), ["activation", "runtime_meta.release_activation_head"]].map(([n, table]) => `SELECT '${n}' name,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) digest FROM ${table} r`).join(" UNION ALL ")}) s`,
    ),
  );
const shared = { container: "athyper-dev-db-1", database: "athyper_neon" };
for (const d of proposal.definitions) {
  assert.equal(d.status, "published");
  assert.equal(d.is_shareable, false);
  assert.equal(d.is_delegable, false);
  assert.equal(d.is_overridable, false);
  assert.ok(d.scopes.length);
  for (const scope of d.scopes) {
    assert.equal(scope.propagation, "exact");
    assert.equal(scope.status, "active");
  }
}
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  approvalPath,
  approvalSha256: approvalHash,
  installations: [],
  sharedNeonBefore: snapshot(shared),
  complete: false,
};
const sqlFor = (t, commit) => `BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL app.database_plane=${quote(t.plane)};
LOCK TABLE ${tables.map((n) => "authz." + n).join(",")},runtime_meta.release_activation_head IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE expected AS SELECT value d FROM jsonb_array_elements(${quote(JSON.stringify(t.definitions))}::jsonb);
DO $guard$ BEGIN
 IF current_database()<>${quote(t.database)} THEN RAISE EXCEPTION 'Wrong destination'; END IF;
 IF EXISTS(SELECT 1 FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code') THEN RAISE EXCEPTION 'Existing permission cannot be overwritten or republished'; END IF;
 IF EXISTS(SELECT 1 FROM expected e WHERE (SELECT count(*) FROM control.module m WHERE m.code=e.d->>'module_code' AND m.status='active')<>1) THEN RAISE EXCEPTION 'Active module unresolved'; END IF;
END $guard$;
INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT d->>'code',(d->>'permission_kind')::authz.permission_kind_d,m.id,(d->>'risk_tier')::authz.risk_tier_d,(d->>'requires_mfa')::boolean,(d->>'requires_sod')::boolean,false,false,false,jsonb_build_object('proposalRevision',${quote(t.revision)},'approvalSha256',${quote(approvalHash)},'purpose','approved_reset_catalog_installation'),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM expected e JOIN control.module m ON m.code=e.d->>'module_code' AND m.status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,created_by)
SELECT p.id,(scope->>'scopeKind')::authz.scope_kind_d,'exact','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code' CROSS JOIN LATERAL jsonb_array_elements(e.d->'scopes') scope;
SELECT json_build_object('definitions',json_agg(json_build_object('id',p.id,'code',p.canonical_code,'scope',s.scope_kind,'propagation',s.propagation_mode,'requiresMfa',p.requires_mfa,'requiresSod',p.requires_sod,'riskTier',p.risk_tier) ORDER BY p.canonical_code)) FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code' JOIN authz.permission_scope_kind s ON s.permission_id=p.id;
${commit ? "COMMIT" : "ROLLBACK"};`;
const save = () =>
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
try {
  // Rehearse both destinations before committing either. Preserve partial results
  // if an independent transaction fails; never automatically undo reviewed state.
  for (const t of targets) {
    t.before = snapshot(t);
    const result = JSON.parse(
      psql(t, sqlFor(t, false))
        .split("\n")
        .find((l) => l.startsWith("{")),
    );
    assert.equal(
      new Set(result.definitions.map((d) => d.code)).size,
      t.definitions.length,
    );
    assert.deepEqual(snapshot(t), t.before);
  }
  for (const t of targets) {
    assert.deepEqual(
      snapshot(t),
      t.before,
      "Destination authority changed after rehearsal",
    );
    const result = JSON.parse(
      psql(t, sqlFor(t, true))
        .split("\n")
        .find((l) => l.startsWith("{")),
    );
    const item = {
      destination: t.key,
      container: t.container,
      database: t.database,
      proposalRevision: t.revision,
      committed: true,
      ...result,
      before: t.before,
    };
    report.installations.push(item);
    save();
    item.after = snapshot(t);
    for (const n of [
      ...tables.filter(
        (n) => !["permission", "permission_scope_kind"].includes(n),
      ),
      "activation",
    ])
      assert.equal(item.after[n], item.before[n], n + " unexpectedly changed");
    item.grantsUnchanged = true;
    item.activationUnchanged = true;
    save();
  }
  report.sharedNeonAfter = snapshot(shared);
  for (const n of [
    ...tables.filter(
      (n) => !["permission", "permission_scope_kind"].includes(n),
    ),
    "activation",
  ])
    assert.equal(report.sharedNeonAfter[n], report.sharedNeonBefore[n]);
  report.sharedNeonGrantsAndActivationUnchanged = true;
  report.complete = true;
  report.grantsChanged = false;
  report.activationChanged = false;
} catch (e) {
  report.failure = String(e.stderr ?? e.message).slice(0, 1500);
  process.exitCode = 1;
}
report.finishedAt = new Date().toISOString();
save();
console.log(JSON.stringify(report, null, 2));
