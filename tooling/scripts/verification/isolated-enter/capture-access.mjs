import fs from "node:fs";
import cp from "node:child_process";
const output = process.argv[2];
if (!output || process.argv.length !== 3 || fs.existsSync(output))
  throw Error(
    "Provide a new evidence output path; existing captures are immutable",
  );
const tenant = "44444444-4444-4444-8444-444444444444";
const query = (container, plane) => {
  const sql = `BEGIN READ ONLY;
SELECT jsonb_build_object('databaseTime',clock_timestamp(),'principals',(SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT id,code,status,auth_epoch FROM master.principal WHERE tenant_id='${tenant}' AND code IN ('catl.admin','catl.owner'))p),
'planeMemberships',(SELECT coalesce(jsonb_agg(to_jsonb(m)),'[]') FROM authz.plane_membership m JOIN master.principal p ON p.id=m.principal_id WHERE p.tenant_id='${tenant}' AND p.code IN ('catl.admin','catl.owner')),
'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM (SELECT p.code account,gm.id membership_id,gm.status membership_status,gm.effective_from membership_from,gm.effective_until membership_until,g.status group_status,r.code role_code,r.status role_status,gr.id assignment_id,gr.status assignment_status,gr.effective_from assignment_from,gr.effective_until assignment_until,gr.propagation_mode,st.id scope_target_id,st.scope_kind,st.target_id,st.status scope_status,perm.canonical_code permission_code,perm.status permission_status,perm.requires_mfa,perm.requires_sod,perm.risk_tier FROM master.principal p JOIN authz.group_member gm ON gm.principal_id=p.id AND gm.tenant_id=p.tenant_id JOIN authz.principal_group g ON g.id=gm.group_id JOIN authz.group_role gr ON gr.group_id=g.id JOIN authz.role r ON r.id=gr.role_id JOIN authz.role_permission rp ON rp.role_id=r.id JOIN authz.permission perm ON perm.id=rp.permission_id JOIN authz.scope_target st ON st.id=gr.scope_target_id WHERE p.tenant_id='${tenant}' AND p.code IN ('catl.admin','catl.owner'))a),
'authorityCounts',(SELECT jsonb_build_object('roles',(SELECT count(*) FROM authz.role),'delegations',(SELECT count(*) FROM authz.delegation),'denials',(SELECT count(*) FROM authz.deny_rule),'overrides',(SELECT count(*) FROM authz.override),'recordAcls',(SELECT count(*) FROM authz.record_acl))),
'scopeTargets',(SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT id,scope_kind,scope_key,target_id,status FROM authz.scope_target WHERE tenant_id='${tenant}')s),
'catalog',(SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT p.id,p.canonical_code code,p.permission_kind kind,p.status,p.requires_mfa,p.requires_sod,p.risk_tier,(SELECT jsonb_agg(jsonb_build_object('scopeKind',s.scope_kind,'propagation',s.propagation_mode,'status',s.status)) FROM authz.permission_scope_kind s WHERE s.permission_id=p.id) scopes FROM authz.permission p)c));ROLLBACK;`;
  return JSON.parse(
    cp.execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "athyper_" + plane,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", maxBuffer: 5000000 },
    ),
  );
};
const captures = [];
for (const container of ["athyper-dev-db-1", "athyper-bp-enter-db"])
  for (const plane of ["studio", "neon"]) {
    const c = query(container, plane),
      now = Date.parse(c.databaseTime);
    for (const a of c.assignments) {
      a.withinAssignmentWindow =
        Date.parse(a.assignment_from) <= now &&
        (!a.assignment_until || now < Date.parse(a.assignment_until));
      a.withinMembershipWindow =
        Date.parse(a.membership_from) <= now &&
        (!a.membership_until || now < Date.parse(a.membership_until));
      a.activePath =
        [
          "membership_status",
          "group_status",
          "role_status",
          "assignment_status",
          "scope_status",
        ].every((k) => a[k] === "active") &&
        a.permission_status === "published" &&
        a.withinMembershipWindow &&
        a.withinAssignmentWindow;
    }
    captures.push({ container, plane, ...c });
  }
const report = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  releaseId: "c2cc6900-26c1-47ca-8dfc-1d488000950c",
  captures,
  readOnly: true,
  grantsChanged: false,
  revokedGrantsRestored: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  captures.map((c) => ({
    container: c.container,
    plane: c.plane,
    principals: c.principals.length,
    activeAssignmentPermissions: c.assignments.filter((a) => a.activePath)
      .length,
    authorityCounts: c.authorityCounts,
  })),
);
