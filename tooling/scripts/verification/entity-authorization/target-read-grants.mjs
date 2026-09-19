import { createHash } from "node:crypto";
export function assertTargetReadApproval({
  proposal: p,
  proposalBytes,
  approval: a,
  rehearsal: r,
  now,
}) {
  const { proposalRevision, ...body } = p,
    hash = (x) => createHash("sha256").update(x).digest("hex");
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (
    hash(JSON.stringify(body)) !== proposalRevision ||
    hash(proposalBytes) !== a.proposalSha256 ||
    a.proposalRevision !== proposalRevision ||
    a.kind !== "explicit_user_target_read_grant_approval" ||
    a.actor?.type !== "conversation_user" ||
    a.actor.namedAccountImpersonated !== false ||
    a.source?.exactMessage !== "go ahead" ||
    a.source.respondingTo !== "Do you approve these three proposals?" ||
    !Array.isArray(a.source.approvedProposalRevisions) ||
    !a.source.approvedProposalRevisions.includes(proposalRevision) ||
    a.grantChangesAuthorized !== true ||
    a.activationAuthorized !== false ||
    a.tenantReadExpansionApproved !== true
  )
    throw Error("Exact grant approval required");
  if (
    p.kind !== "bp_release_19_named_tenant_read_grant_proposal" ||
    p.environment !== "dev" ||
    p.plane !== "neon" ||
    p.assignment.scopeKind !== "tenant" ||
    p.assignment.propagationMode !== "exact" ||
    p.role.permissions.length !== 17 ||
    p.group.members.length !== 2 ||
    !equal(a.approvedAssignmentIds, [p.assignment.id]) ||
    !equal(
      a.approvedPermissionIds,
      p.role.permissions.map((x) => x.id),
    ) ||
    !equal(
      a.approvedPrincipalIds,
      p.group.members.map((x) => x.principalId),
    ) ||
    a.releaseId !== p.releaseId ||
    a.artifactHash !== p.artifactHash ||
    a.tenantId !== p.tenantId ||
    a.effectiveFrom !== p.effectiveFrom ||
    a.effectiveUntil !== p.effectiveUntil
  )
    throw Error("Approved grant coordinates changed");
  if (
    r.proposalRevision !== proposalRevision ||
    !r.rollbackConfirmed ||
    r.grantsChanged !== false ||
    r.members !== 2 ||
    r.rolePermissions !== 17
  )
    throw Error("Exact rehearsal required");
  const at = Date.parse(now),
    start = Date.parse(p.effectiveFrom),
    end = Date.parse(p.effectiveUntil);
  if (
    !Number.isFinite(at) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    at < start ||
    at >= end
  )
    throw Error("Outside approved grant window");
}

export function buildTargetReadGrantSql(p, { commit = false } = {}) {
  const proposalRevision = p.proposalRevision;
  const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'",
    tenant = lit(p.tenantId),
    role = lit(p.role.id),
    group = lit(p.group.id),
    scope = lit(p.assignment.scopeTargetId),
    revision = lit(proposalRevision),
    from = lit(p.effectiveFrom),
    until = lit(p.effectiveUntil);
  const values = p.role.permissions
    .map((x) => `(${lit(x.id)}::uuid,${lit(x.code)})`)
    .join(",");
  const members = p.group.members
    .map((x) => `(${lit(x.principalId)}::uuid,${lit(x.account)})`)
    .join(",");
  const sql = `BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
SELECT set_config('app.current_tenant_id',${tenant},true);
SELECT pg_advisory_xact_lock(hashtextextended('bp-target-read:'||${tenant},0));
${commit ? `DO $window$ BEGIN IF clock_timestamp()<${from}::timestamptz OR clock_timestamp()>=${until}::timestamptz THEN RAISE EXCEPTION 'Outside approved grant window';END IF;END $window$;` : ""}
CREATE TEMP TABLE prior_authority(table_name text,id uuid,row_data jsonb) ON COMMIT DROP;
DO $capture$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['plane_membership','role','permission','role_permission','principal_group','group_member','group_role','scope_target','deny_rule','delegation','delegation_grant','override','record_acl'] LOOP EXECUTE format('INSERT INTO prior_authority SELECT %L,id,to_jsonb(r) FROM authz.%I r',t,t);END LOOP;END $capture$;
DO $rehearse$ DECLARE actor uuid; n integer; BEGIN
SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant} AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
IF NOT EXISTS(SELECT 1 FROM authz.scope_target WHERE id=${scope}::uuid AND tenant_id=${tenant} AND target_id=${tenant}::uuid AND scope_kind='tenant' AND status='active') THEN RAISE EXCEPTION 'Scope changed'; END IF;
SELECT count(*) INTO n FROM (VALUES ${values}) v(id,code) JOIN authz.permission p ON p.id=v.id AND p.canonical_code=v.code AND p.status='published' WHERE EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.status='active');
IF n<>17 THEN RAISE EXCEPTION 'Permission catalog changed';END IF;
SELECT count(*) INTO n FROM (VALUES ${members}) v(id,code) JOIN master.principal p ON p.id=v.id AND p.code=v.code AND p.tenant_id=${tenant} AND p.status='active' WHERE EXISTS(SELECT 1 FROM authz.plane_membership pm WHERE pm.principal_id=p.id AND pm.tenant_id=p.tenant_id AND pm.status='active' AND pm.effective_from<=now() AND (pm.effective_until IS NULL OR pm.effective_until>now()));
IF n<>2 THEN RAISE EXCEPTION 'Principal admission changed';END IF;
INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by) VALUES(${role},${tenant},${lit(p.role.code)},'BP target named readers','custom','manual',${revision},jsonb_build_object('proposalRevision',${revision}),'draft',actor);
INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${tenant}::uuid,${role}::uuid,v.id,actor FROM (VALUES ${values}) v(id,code);
UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=${role};
INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(${group},${tenant},${lit(p.group.code)},'BP target named readers','custom','manual',${revision},jsonb_build_object('proposalRevision',${revision}),'active',actor);
INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) SELECT ${tenant}::uuid,${group}::uuid,v.id,'manual',${revision},'active',${from}::timestamptz,${until}::timestamptz,actor FROM (VALUES ${members}) v(id,code);
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${lit(p.assignment.id)},${tenant},${group},${role},${scope},'exact','manual',${revision},'active',${from}::timestamptz,${until}::timestamptz,actor);
END $rehearse$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $preserve$ DECLARE r record; current_row jsonb;BEGIN FOR r IN SELECT * FROM prior_authority LOOP EXECUTE format('SELECT to_jsonb(x) FROM authz.%I x WHERE id=$1',r.table_name) INTO current_row USING r.id;IF current_row IS DISTINCT FROM r.row_data THEN RAISE EXCEPTION 'Existing authority changed';END IF;END LOOP;END $preserve$;
SELECT jsonb_build_object('proposalRevision',${revision},'rolePermissions',(SELECT count(*) FROM authz.role_permission WHERE role_id=${role}), 'members',(SELECT count(*) FROM authz.group_member WHERE group_id=${group}));
${commit ? `DO $window$ BEGIN IF clock_timestamp()>=${until}::timestamptz THEN RAISE EXCEPTION 'Approved grant window expired';END IF;END $window$; COMMIT;` : "ROLLBACK;"}
`;
  return sql;
}

/** Revoke only newly introduced bindings; never restore a grant snapshot. Caller owns transaction. */
export function buildTargetReadRevokeSql(p) {
  const lit = (x) => "'" + String(x).replaceAll("'", "''") + "'";
  const tenant = lit(p.tenantId),
    group = lit(p.group.id),
    role = lit(p.role.id),
    revision = lit(p.proposalRevision),
    assignment = lit(p.assignment.id),
    scope = lit(p.assignment.scopeTargetId);
  const principals = p.group.members
    .map((x) => lit(x.principalId) + "::uuid")
    .join(",");
  return `DO $revoke$ DECLARE actor uuid; BEGIN
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM authz.principal_group WHERE id=${group}::uuid AND tenant_id=${tenant}::uuid AND source_ref=${revision}) OR NOT EXISTS(SELECT 1 FROM authz.role WHERE id=${role}::uuid AND tenant_id=${tenant}::uuid AND source_ref=${revision}) THEN RAISE EXCEPTION 'Rollback ownership mismatch';END IF;
 IF EXISTS(SELECT 1 FROM authz.group_member WHERE group_id=${group}::uuid AND (tenant_id<>${tenant}::uuid OR source_ref IS DISTINCT FROM ${revision} OR principal_id NOT IN (${principals}))) OR EXISTS(SELECT 1 FROM authz.group_role WHERE group_id=${group}::uuid AND (tenant_id<>${tenant}::uuid OR source_ref IS DISTINCT FROM ${revision} OR id<>${assignment}::uuid OR role_id<>${role}::uuid OR scope_target_id<>${scope}::uuid OR propagation_mode<>'exact')) THEN RAISE EXCEPTION 'Unexpected rollback bindings';END IF;
 UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${tenant}::uuid AND group_id=${group}::uuid AND source_ref=${revision} AND principal_id IN (${principals}) AND status<>'revoked';
 UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${tenant}::uuid AND id=${assignment}::uuid AND group_id=${group}::uuid AND source_ref=${revision} AND status<>'revoked';
 END $revoke$;
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT jsonb_build_object('membershipsRevoked',(SELECT count(*) FROM authz.group_member WHERE group_id=${group}::uuid AND status='revoked'),'assignmentsRevoked',(SELECT count(*) FROM authz.group_role WHERE id=${assignment}::uuid AND status='revoked'));
 `;
}
