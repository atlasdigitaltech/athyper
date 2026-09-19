import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const read = (p) => JSON.parse(fs.readFileSync(p));
const quote = (s) => "'" + s.replaceAll("'", "''") + "'";
const reportPath =
  "governance/policy/reports/business-partner-reset-catalog.installation.dev.json";
assert.equal(process.argv.length, 2);
assert.ok(
  !fs.existsSync(reportPath),
  "Inspect previous installation; never replay it",
);
const approvalPath =
  "governance/policy/reviews/business-partner-reset-catalog.acceptance.dev.json";
const approval = read(approvalPath),
  approvalHash = hash(fs.readFileSync(approvalPath));
assert.equal(approval.kind, "explicit_user_catalog_installation_approval");
assert.equal(approval.source.exactMessage, "approved");
assert.equal(approval.source.channel, "user");
assert.equal(approval.actor.type, "conversation_user");
assert.equal(approval.actor.namedAccountImpersonated, false);
for (const key of [
  "grantChangesAuthorized",
  "activationAuthorized",
  "policyDifferenceAcceptance",
])
  assert.equal(approval[key], false);
const studio = read(
  "governance/policy/reviews/business-partner-reset-studio-catalog.proposal.dev.json",
);
const { proposalRevision, ...body } = studio;
assert.equal(hash(JSON.stringify(body)), proposalRevision);
assert.equal(proposalRevision, approval.studioProposalRevision);
assert.equal(
  proposalRevision,
  "4660931d7ff9567c4c729712a30c1b97e40250382b1b8ef92d42228eadc9eb5f",
);
const sourceBytes = fs.readFileSync(
  "governance/policy/reviews/business-partner-source-constraints.proposal.dev.json",
);
assert.equal(hash(sourceBytes), approval.sourceProposalSha256);
assert.equal(
  hash(sourceBytes),
  "35fe66a6512c0feab21ce488c4bd9f38e8999088da17a825d4df97a484aebaf8",
);
const source = JSON.parse(sourceBytes);
const targets = [
  {
    key: "studio",
    container: "athyper-dev-db-1",
    database: "athyper_studio",
    plane: "studio",
    definitions: studio.definitions,
    revision: proposalRevision,
  },
  {
    key: "source",
    container: "athyper-bp-r20-db",
    database: "athyper_neon",
    plane: "neon",
    definitions: source.definitions,
    revision: hash(sourceBytes),
  },
];
for (const t of targets)
  assert.deepEqual(approval.destinations[t.key], {
    container: t.container,
    database: t.database,
  });
const clone = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-bp-r20-db"], {
    encoding: "utf8",
  }),
)[0];
assert.deepEqual(Object.keys(clone.NetworkSettings.Networks), [
  "athyper-bp-r20-isolated",
]);
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
 IF EXISTS(SELECT 1 FROM expected e WHERE (SELECT count(*) FROM control.module m WHERE m.code=e.d->>'moduleCode' AND m.status='active')<>1) THEN RAISE EXCEPTION 'Active module unresolved'; END IF;
END $guard$;
INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT d->>'code','capability',m.id,(d->>'riskTier')::authz.risk_tier_d,(d->>'requiresMfa')::boolean,(d->>'requiresSod')::boolean,false,false,false,jsonb_build_object('proposalRevision',${quote(t.revision)},'approvalSha256',${quote(approvalHash)},'purpose','approved_reset_catalog_installation'),'published','00000000-0000-0000-0000-000000000000'::uuid
FROM expected e JOIN control.module m ON m.code=e.d->>'moduleCode' AND m.status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,created_by)
SELECT p.id,(e.d->'scopeKinds'->>0)::authz.scope_kind_d,'exact','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission p JOIN expected e ON p.canonical_code=e.d->>'code';
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
    assert.equal(result.definitions.length, t.definitions.length);
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
  assert.deepEqual(report.sharedNeonAfter, report.sharedNeonBefore);
  report.sharedNeonUnchanged = true;
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
