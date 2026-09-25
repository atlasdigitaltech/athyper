/** Temporary local access explicitly approved by the user for Phase 1 verification.
 * Separate from the policy fixture: it never writes policy/publication data. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const mode = process.argv[2];
if (
  !["--apply", "--revoke", "--dry-run"].includes(mode) ||
  process.argv.length !== 3
)
  throw Error("Expected --apply, --dry-run or --revoke");
const path =
    "governance/policy/reviews/activity-collections-phase1-local-verification-access.dev.json",
  bytes = readFileSync(path),
  p = JSON.parse(bytes);
const expected = [
  [
    "catl.admin",
    "81cd1978-2df5-5c9a-938a-2f8c291aea13",
    [
      "metadata.entity.author",
      "metadata.entity.validate",
      "metadata.entity.test",
      "metadata.entity.submit",
      "metadata.entity.publish",
    ],
  ],
  [
    "catl.owner",
    "5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d",
    ["metadata.entity.review"],
  ],
];
if (
  p.tenantId !== "44444444-4444-4444-8444-444444444444" ||
  p.durationMinutes !== 120 ||
  p.scopeTargetId !== "1d2550e6-6e20-5f74-81d9-388d1e75d20f" ||
  JSON.stringify(
    p.assignments.map((a) => [a.account, a.principalId, a.permissions]),
  ) !== JSON.stringify(expected)
)
  throw Error("Approved scope changed");
const lit = (v) => "'" + String(v).replaceAll("'", "''") + "'",
  ref = "collections.phase1.local.verification.20260923";
let sql = `BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'; SELECT set_config('app.current_tenant_id',${lit(p.tenantId)},true); SELECT set_config('app.database_plane','studio',true); DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Local Studio required'; END IF; END $$; SELECT pg_advisory_xact_lock(hashtextextended(${lit(ref)},0));\n`;
if (mode === "--revoke") {
  sql += `UPDATE authz.group_role SET status='revoked', effective_until=LEAST(effective_until,clock_timestamp()),updated_at=now(),updated_by=created_by,status_changed_at=now(),status_changed_by=created_by WHERE tenant_id=${lit(p.tenantId)}::uuid AND source_ref=${lit(ref)} AND effective_until>now();
UPDATE authz.group_member SET status='revoked', effective_until=LEAST(effective_until,clock_timestamp()),updated_at=now(),updated_by=created_by,status_changed_at=now(),status_changed_by=created_by WHERE tenant_id=${lit(p.tenantId)}::uuid AND source_ref=${lit(ref)} AND effective_until>now();\n`;
} else
  for (const a of p.assignments) {
    sql += `DO $grant$ DECLARE actor uuid; role_id uuid; group_id uuid; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${lit(p.tenantId)}::uuid AND code='seed.three-plane-provisioner' AND status='active';
IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership m ON m.tenant_id=p.tenant_id AND m.principal_id=p.id WHERE p.id=${lit(a.principalId)}::uuid AND p.tenant_id=${lit(p.tenantId)}::uuid AND p.code=${lit(a.account)} AND p.status='active' AND m.status='active') THEN RAISE EXCEPTION 'Principal admission changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM authz.scope_target WHERE id=${lit(p.scopeTargetId)}::uuid AND tenant_id=${lit(p.tenantId)}::uuid AND scope_kind='tenant' AND target_id=${lit(p.tenantId)}::uuid AND status='active') THEN RAISE EXCEPTION 'Scope changed'; END IF;
IF (SELECT count(*) FROM authz.permission p WHERE p.canonical_code IN (${a.permissions.map(lit).join(",")}) AND p.status='published' AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active'))<>${a.permissions.length} THEN RAISE EXCEPTION 'Permission catalog changed'; END IF;
IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=${lit(p.tenantId)}::uuid AND code=${lit(ref + "." + a.account)}) THEN RAISE EXCEPTION 'Verification grant already exists; inspect before retrying'; END IF;
INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by) VALUES(${lit(p.tenantId)}::uuid,${lit(ref + "." + a.account)},'Temporary collection verification','custom','manual',${lit(ref)},'{"userApproved":true,"durationMinutes":120}'::jsonb,'draft',actor) RETURNING id INTO role_id;
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${lit(p.tenantId)}::uuid,role_id,id,actor FROM authz.permission WHERE canonical_code IN (${a.permissions.map(lit).join(",")});
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=role_id;
INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(${lit(p.tenantId)}::uuid,${lit(ref + "." + a.account)},'Temporary collection verification','custom','manual',${lit(ref)},'active',actor) RETURNING id INTO group_id;
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${lit(p.tenantId)}::uuid,group_id,${lit(a.principalId)}::uuid,'manual',${lit(ref)},'active',now(),now()+interval '120 minutes',actor);
INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${lit(p.tenantId)}::uuid,group_id,role_id,${lit(p.scopeTargetId)}::uuid,'exact','manual',${lit(ref)},'active',now(),now()+interval '120 minutes',actor);
END $grant$;\n`;
  }
sql += `SET CONSTRAINTS ALL IMMEDIATE; SELECT jsonb_build_object('activeEdges',count(*)) FROM authz.current_group_role r JOIN authz.role_permission rp ON rp.role_id=r.role_id AND rp.tenant_id=r.tenant_id WHERE r.source_ref=${lit(ref)}; ${mode === "--dry-run" ? "ROLLBACK" : "COMMIT"};`;
const output = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-X",
    "-U",
    "postgres",
    "-d",
    "athyper_studio",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, encoding: "utf8" },
);
const receipt = {
  mode,
  recordedAt: new Date().toISOString(),
  proposalSha256: createHash("sha256").update(bytes).digest("hex"),
  approval: "User: go ahead and apply",
  ...JSON.parse(output.split("\n").find((l) => l.startsWith("{"))),
};
writeFileSync(
  `/tmp/activity-collections-phase1-access.${mode.slice(2)}.json`,
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(receipt);
