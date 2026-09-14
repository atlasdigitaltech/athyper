import fs from "node:fs";
import cp from "node:child_process";
import { createHash } from "node:crypto";
const apply = process.argv[2] === "--apply";
if (process.argv.slice(2).some((x) => x !== "--apply"))
  throw Error("Use optional --apply");
const path =
    "governance/policy/reviews/business-partner-release20-isolated-transfer-grants.proposal.dev.json",
  bytes = fs.readFileSync(path),
  p = JSON.parse(bytes),
  a = apply
    ? JSON.parse(
        fs.readFileSync(
          "governance/policy/reviews/business-partner-release20-isolated-transfer-grants.approval.dev.json",
        ),
      )
    : null;
if (
  apply &&
  (a.proposalSha256 !== createHash("sha256").update(bytes).digest("hex") ||
    a.proposalRevision !== p.proposalRevision ||
    !a.isolatedGrantsApproved ||
    a.sharedDevGrantChangesAuthorized !== false ||
    a.activationAuthorized !== false)
)
  throw Error("Exact isolated approval required");

if (
  apply &&
  (Date.now() < Date.parse(p.effectiveFrom) ||
    Date.now() >= Date.parse(p.effectiveUntil))
)
  throw Error("Outside approved window");
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 3000000,
    stdio: ["pipe", "pipe", "pipe"],
  });
const c = JSON.parse(run(["inspect", "athyper-bp-r20-db"]))[0];
if (
  Object.keys(c.NetworkSettings.Networks).join(",") !==
    "athyper-bp-r20-isolated" ||
  Object.values(c.NetworkSettings.Ports ?? {}).some(Boolean)
)
  throw Error("Dedicated successor DB required");
const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const sql = `BEGIN; SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';
DO $test$ DECLARE actor uuid;BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${lit(p.tenantId)}::uuid AND code='seed.three-plane-provisioner' AND status='active';
IF (SELECT count(*) FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.id IN (${p.permissions.map((x) => lit(x.id)).join(",")}) AND p.status='published' AND s.scope_kind='tenant' AND s.status='active')<>2 THEN RAISE EXCEPTION 'Catalog mismatch';END IF;
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES(${lit(p.roleId)},${lit(p.tenantId)},${lit(p.code)},'Isolated successor transfer qualification','custom','manual',${lit(p.proposalRevision)},'draft',actor);
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${lit(p.tenantId)}::uuid,${lit(p.roleId)}::uuid,v.id,actor FROM (VALUES ${p.permissions.map((x) => "(" + lit(x.id) + "::uuid)").join(",")}) v(id);
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=${lit(p.roleId)};
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(${lit(p.groupId)},${lit(p.tenantId)},${lit(p.code)},'Isolated successor transfer qualification','custom','manual',${lit(p.proposalRevision)},'active',actor);
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${lit(p.tenantId)},${lit(p.groupId)},${lit(p.principalId)},'manual',${lit(p.proposalRevision)},'active',${lit(p.effectiveFrom)},${lit(p.effectiveUntil)},actor);
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${lit(p.assignmentId)},${lit(p.tenantId)},${lit(p.groupId)},${lit(p.roleId)},${lit(p.scopeTargetId)},'exact','manual',${lit(p.proposalRevision)},'active',${lit(p.effectiveFrom)},${lit(p.effectiveUntil)},actor);
END $test$; SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('permissions',(SELECT count(*) FROM authz.role_permission WHERE role_id=${lit(p.roleId)}),'members',(SELECT count(*) FROM authz.group_member WHERE group_id=${lit(p.groupId)}));${apply ? "COMMIT" : "ROLLBACK"};`;
const guarded = sql.replace(
  "DO $test$",
  `DO $window$ BEGIN IF ${apply ? "true" : "false"} AND (clock_timestamp()<${lit(p.effectiveFrom)}::timestamptz OR clock_timestamp()>=${lit(p.effectiveUntil)}::timestamptz) THEN RAISE EXCEPTION 'Outside approved window';END IF;END $window$; DO $test$`,
);
const output = cp.execFileSync(
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
  { input: guarded, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
if (!output.trim().endsWith(apply ? "COMMIT" : "ROLLBACK"))
  throw Error("Transaction outcome unconfirmed");
const counts = JSON.parse(output.split("\n").find((l) => l.startsWith("{")));
if (counts.permissions !== 2 || counts.members !== 1)
  throw Error("Unexpected coverage");
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  proposalRevision: p.proposalRevision,
  applied: apply,
  ...counts,
  sharedDevGrantsChanged: false,
  priorInstanceModified: false,
};
fs.writeFileSync(
  "governance/policy/reports/business-partner-release20-isolated-transfer-grants." +
    (apply ? "applied" : "dry-run") +
    ".dev.json",
  JSON.stringify(report, null, 2) + "\n",
  apply ? { flag: "wx" } : {},
);
console.log(JSON.stringify(report));
