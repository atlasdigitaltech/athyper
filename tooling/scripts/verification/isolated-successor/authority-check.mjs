import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const p = JSON.parse(
  readFileSync(
    "governance/policy/reviews/business-partner-successor-isolated-transfer-grants.proposal.dev.json",
  ),
);
const tables = [
  "authz.role",
  "authz.role_permission",
  "authz.group_member",
  "authz.group_role",
  "authz.plane_membership",
  "authz.delegation",
  "authz.delegation_grant",
  "authz.permission",
  "authz.permission_scope_kind",
  "authz.deny_rule",
  "authz.record_acl",
  "authz.override",
  "authz.scope_target",
  "authz.principal_group",
];
const run = (container, query) =>
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { encoding: "utf8", maxBuffer: 20000000, stdio: ["pipe", "pipe", "pipe"] },
  );
const excluded = {
  "authz.role": `id='${p.roleId}'`,
  "authz.role_permission": `role_id='${p.roleId}'`,
  "authz.principal_group": `id='${p.groupId}'`,
  "authz.group_member": `group_id='${p.groupId}'`,
  "authz.group_role": `group_id='${p.groupId}'`,
};
const query = (clone) =>
  tables
    .map(
      (t) =>
        `SELECT '${t}',coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${t} t ${clone && excluded[t] ? "WHERE NOT (" + excluded[t] + ")" : ""}`,
    )
    .join(" UNION ALL ");
export function assertAuthorityUnchanged(expectedStatus = "active") {
  if (!["active", "revoked"].includes(expectedStatus))
    throw Error("Invalid expected test grant status");
  if (
    Date.now() < Date.parse(p.effectiveFrom) ||
    Date.now() >= Date.parse(p.effectiveUntil)
  )
    throw Error("QUALIFICATION_WINDOW_CLOSED");
  const check = JSON.parse(
    run(
      "athyper-bp-r19s-db",
      `SELECT json_build_object('roles',(SELECT count(*) FROM authz.role WHERE id='${p.roleId}' AND tenant_id='${p.tenantId}' AND status='active' AND source_ref='${p.proposalRevision}'),'groups',(SELECT count(*) FROM authz.principal_group WHERE id='${p.groupId}' AND tenant_id='${p.tenantId}' AND status='active' AND source_ref='${p.proposalRevision}'),'permissions',(SELECT json_agg(permission_id ORDER BY permission_id) FROM authz.role_permission WHERE role_id='${p.roleId}'),'members',(SELECT count(*) FROM authz.group_member WHERE group_id='${p.groupId}'),'validMembers',(SELECT count(*) FROM authz.group_member WHERE group_id='${p.groupId}' AND tenant_id='${p.tenantId}' AND principal_id='${p.principalId}' AND source_ref='${p.proposalRevision}' AND status='${expectedStatus}' AND effective_from='${p.effectiveFrom}' AND effective_until='${p.effectiveUntil}'),'assignments',(SELECT count(*) FROM authz.group_role WHERE group_id='${p.groupId}'),'validAssignments',(SELECT count(*) FROM authz.group_role WHERE id='${p.assignmentId}' AND group_id='${p.groupId}' AND role_id='${p.roleId}' AND tenant_id='${p.tenantId}' AND scope_target_id='${p.scopeTargetId}' AND propagation_mode='exact' AND source_ref='${p.proposalRevision}' AND status='${expectedStatus}' AND effective_from='${p.effectiveFrom}' AND effective_until='${p.effectiveUntil}'))`,
    ),
  );
  if (
    check.roles !== 1 ||
    check.groups !== 1 ||
    check.members !== 1 ||
    check.validMembers !== 1 ||
    check.assignments !== 1 ||
    check.validAssignments !== 1 ||
    JSON.stringify(check.permissions) !==
      JSON.stringify(p.permissions.map((x) => x.id).sort())
  )
    throw Error("APPROVED_CLONE_DELTA_CHANGED");
  const hash = (s) => createHash("sha256").update(s).digest("hex"),
    source = hash(run("athyper-dev-db-1", query(false))),
    clone = hash(run("athyper-bp-r19s-db", query(true)));
  if (source !== clone) throw Error("UNAPPROVED_SOURCE_CLONE_AUTHORITY_DRIFT");
  return {
    capturedAt: new Date().toISOString(),
    sha256: source,
    sourceCloneMatchExceptApprovedDelta: true,
    approvedDelta: p.proposalRevision,
    testGrantStatus: expectedStatus,
  };
}
