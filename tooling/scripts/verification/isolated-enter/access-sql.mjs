const q = (x) => "'" + String(x).replaceAll("'", "''") + "'";
export function accessInsertionSql(p) {
  const { proposalRevision } = p;
  let sql = `BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id WHERE h.artifact_hash=${q(p.artifactHash)} AND r.artifact_hash=h.artifact_hash AND r.source_release_id=${q(p.releaseId)}) THEN RAISE EXCEPTION 'Qualification artifact changed';END IF;END $guard$;\n`;
  for (const b of p.batches) {
    sql += `DO $batch$ DECLARE actor uuid;BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${q(p.tenantId)}::uuid AND code='seed.three-plane-provisioner' AND status='active';
IF NOT EXISTS(SELECT 1 FROM master.principal WHERE id=${q(b.principalId)}::uuid AND tenant_id=${q(p.tenantId)}::uuid AND status='active') THEN RAISE EXCEPTION 'Principal changed';END IF;
IF NOT EXISTS(SELECT 1 FROM authz.scope_target WHERE id=${q(b.scope.id)}::uuid AND target_id=${q(b.scope.target_id)}::uuid AND scope_kind=${q(b.scope.scope_kind)} AND status='active') THEN RAISE EXCEPTION 'Scope changed';END IF;
${b.permissions.map((perm) => `IF NOT EXISTS(SELECT 1 FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.id=${q(perm.id)}::uuid AND p.canonical_code=${q(perm.code)} AND p.status='published' AND p.requires_mfa=${perm.requires_mfa} AND p.requires_sod=${perm.requires_sod} AND p.risk_tier=${q(perm.risk_tier)} AND s.status='active' AND s.scope_kind=${q(b.scope.scope_kind)} AND s.propagation_mode=${q(b.propagation)}) THEN RAISE EXCEPTION 'Catalog changed';END IF;`).join("\n")}
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES(${q(b.roleId)},${q(p.tenantId)},${q(b.code)},'Isolated BP qualification','custom','manual',${q(proposalRevision)},'draft',actor);
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${q(p.tenantId)}::uuid,${q(b.roleId)}::uuid,id,actor FROM (VALUES ${b.permissions.map((x) => "(" + q(x.id) + "::uuid)").join(",")}) v(id);
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=${q(b.roleId)};
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(${q(b.groupId)},${q(p.tenantId)},${q(b.code)},'Isolated BP qualification','custom','manual',${q(proposalRevision)},'active',actor);
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${q(p.tenantId)},${q(b.groupId)},${q(b.principalId)},'manual',${q(proposalRevision)},'active',${q(p.effectiveFrom)},${q(p.effectiveUntil)},actor);
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${q(b.assignmentId)},${q(p.tenantId)},${q(b.groupId)},${q(b.roleId)},${q(b.scope.id)},${q(b.propagation)},'manual',${q(proposalRevision)},'active',${q(p.effectiveFrom)},${q(p.effectiveUntil)},actor);END $batch$;\n`;
  }
  sql += "SET CONSTRAINTS ALL IMMEDIATE;";
  sql += `SELECT json_build_object('permissionAssignments',(SELECT count(*) FROM authz.role_permission WHERE role_id IN (${p.batches.map((b) => q(b.roleId)).join(",")})),'newMemberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${q(proposalRevision)}),'newAssignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${q(proposalRevision)}));`;
  return sql;
}
