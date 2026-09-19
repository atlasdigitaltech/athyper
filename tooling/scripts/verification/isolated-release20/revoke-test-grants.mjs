import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import { assertAuthorityUnchanged } from "./authority-check.mjs";
const apply = process.argv[2] === "--revoke";
if (process.argv.slice(2).some((x) => x !== "--revoke"))
  throw Error("Optional --revoke only");
const bytes = fs.readFileSync(
    "governance/policy/reviews/business-partner-release20-isolated-transfer-grants.proposal.dev.json",
  ),
  p = JSON.parse(bytes),
  a = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-release20-isolated-transfer-grants.approval.dev.json",
    ),
  );
if (
  a.proposalSha256 !== createHash("sha256").update(bytes).digest("hex") ||
  a.proposalRevision !== p.proposalRevision ||
  !a.isolatedGrantsApproved ||
  a.sharedDevGrantChangesAuthorized !== false ||
  a.activationAuthorized !== false
)
  throw Error("Exact cleanup approval required");
const before = assertAuthorityUnchanged();
const db = JSON.parse(
  cp.execFileSync("docker", ["inspect", "athyper-bp-r20-db"], {
    encoding: "utf8",
  }),
)[0];
if (
  Object.keys(db.NetworkSettings.Networks).join(",") !==
    "athyper-bp-r20-isolated" ||
  Object.values(db.NetworkSettings.Ports ?? {}).some(Boolean)
)
  throw Error("Isolated database required");
const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const query = `BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='10s';
DO $cleanup$ DECLARE actor uuid;members integer;assignments integer;BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${lit(p.tenantId)}::uuid AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${lit(p.tenantId)}::uuid AND group_id=${lit(p.groupId)}::uuid AND principal_id=${lit(p.principalId)}::uuid AND source_ref=${lit(p.proposalRevision)} AND status='active';GET DIAGNOSTICS members=ROW_COUNT;
UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${lit(p.tenantId)}::uuid AND id=${lit(p.assignmentId)}::uuid AND group_id=${lit(p.groupId)}::uuid AND role_id=${lit(p.roleId)}::uuid AND scope_target_id=${lit(p.scopeTargetId)}::uuid AND propagation_mode='exact' AND source_ref=${lit(p.proposalRevision)} AND status='active';GET DIAGNOSTICS assignments=ROW_COUNT;
IF members<>1 OR assignments<>1 THEN RAISE EXCEPTION 'Exact cleanup coverage mismatch'; END IF;
END $cleanup$;SET CONSTRAINTS ALL IMMEDIATE;${apply ? "COMMIT" : "ROLLBACK"};`;
const out = cp.execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-r20-db",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
if (!out.trim().endsWith(apply ? "COMMIT" : "ROLLBACK"))
  throw Error("Cleanup outcome unconfirmed");
const after = assertAuthorityUnchanged(apply ? "revoked" : "active");
if (
  before.snapshots["athyper-dev-db-1"] !== after.snapshots["athyper-dev-db-1"]
)
  throw Error("Shared authority changed");
const parse = (v) =>
  Object.fromEntries(
    v
      .trim()
      .split("\n")
      .map((l) => l.split("|")),
  );
const b = parse(before.snapshots["athyper-bp-r20-db"]),
  e = parse(after.snapshots["athyper-bp-r20-db"]);
for (const t of Object.keys(b))
  if (!["group_member", "group_role"].includes(t) && b[t] !== e[t])
    throw Error("Unexpected clone authority change: " + t);
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  membershipsRevoked: 1,
  assignmentsRevoked: 1,
  applied: apply,
  sharedDevGrantsChanged: false,
  oldGrantsRestored: false,
  before,
  after,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-release20-test-grants-cleanup." +
    (apply ? "applied" : "rehearsal") +
    ".dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(JSON.stringify(report));
