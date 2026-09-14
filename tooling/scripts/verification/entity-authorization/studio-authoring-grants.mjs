import { createHash } from "node:crypto";
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export const grantHash = (v) =>
  createHash("sha256")
    .update(JSON.stringify(stable(v)))
    .digest("hex");
const lit = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const uuid = (value) => {
  const h = grantHash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export function buildStudioAuthoringGrantSql(
  p,
  acceptance,
  { commit = false, revoke = false } = {},
) {
  const { proposalRevision, ...body } = p;
  const approved =
    acceptance?.proposalRevision === proposalRevision &&
    acceptance.scope === "exact_temporary_studio_assignments_only" &&
    acceptance.enforcementAuthorized === false;
  // An unapproved proposal may be rehearsed transactionally, never committed.
  // Supplied but mismatched approval evidence must still fail in preview.
  if (
    grantHash(body) !== proposalRevision ||
    ((commit || acceptance != null) && !approved) ||
    p.planeKey !== "studio" ||
    p.tenantId !== "44444444-4444-4444-8444-444444444444" ||
    p.scopeKind !== "tenant" ||
    p.scopeTargetId !== p.tenantId ||
    p.propagation !== "exact" ||
    p.assignments.length !== 2
  )
    throw Error("Exact approved Studio proposal required");
  if (
    !Number.isFinite(Date.parse(p.effectiveFrom)) ||
    !Number.isFinite(Date.parse(p.effectiveUntil)) ||
    Date.parse(p.effectiveUntil) <= Date.parse(p.effectiveFrom)
  )
    throw Error("Valid bounded assignment window required");
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
    p.assignments.some(
      (a, i) =>
        a.account !== expected[i][0] ||
        a.principalId !== expected[i][1] ||
        JSON.stringify(a.permissions) !== JSON.stringify(expected[i][2]),
    )
  )
    throw Error("Unreviewed capability assignment");
  const tenant = lit(p.tenantId),
    revision = lit(proposalRevision),
    from = lit(p.effectiveFrom),
    until = lit(p.effectiveUntil);
  const capture = `CREATE TEMP TABLE prior_authority(table_name text,id uuid,row_data jsonb) ON COMMIT DROP;
 DO $capture$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['plane_membership','role','permission','role_permission','principal_group','group_member','group_role','scope_target','deny_rule','delegation','delegation_grant','override','record_acl'] LOOP EXECUTE format('INSERT INTO prior_authority SELECT %L,id,to_jsonb(r) FROM authz.%I r',t,t);END LOOP;END $capture$;`;
  const groups = p.assignments.map((a) => {
    const role = lit(uuid([proposalRevision, a.account, "role"])),
      group = lit(uuid([proposalRevision, a.account, "group"])),
      assignment = lit(uuid([proposalRevision, a.account, "assignment"])),
      principal = lit(a.principalId),
      codes = a.permissions.map(lit).join(",");
    if (revoke)
      return `DO $revoke$ DECLARE actor uuid;BEGIN SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant} AND code='seed.three-plane-provisioner' AND status='active';
   IF NOT EXISTS(SELECT 1 FROM authz.group_role WHERE id=${assignment} AND group_id=${group} AND role_id=${role} AND tenant_id=${tenant} AND source_ref=${revision} AND propagation_mode='exact') THEN RAISE EXCEPTION 'Temporary assignment identity changed';END IF;
   UPDATE authz.group_member SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE tenant_id=${tenant} AND group_id=${group} AND principal_id=${principal} AND source_ref=${revision} AND status<>'revoked';
   UPDATE authz.group_role SET status='revoked',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor WHERE id=${assignment} AND tenant_id=${tenant} AND source_ref=${revision} AND status<>'revoked';END $revoke$;`;
    return `DO $assign$ DECLARE actor uuid;scope uuid;n integer;BEGIN
   SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=${tenant} AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active';
   SELECT id INTO STRICT scope FROM authz.scope_target WHERE tenant_id=${tenant} AND target_id=${tenant} AND scope_kind='tenant' AND status='active';
   IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership pm ON pm.tenant_id=p.tenant_id AND pm.principal_id=p.id WHERE p.tenant_id=${tenant} AND p.id=${principal} AND p.code=${lit(a.account)} AND p.status='active' AND pm.status='active' AND pm.effective_from<=now() AND (pm.effective_until IS NULL OR pm.effective_until>now())) THEN RAISE EXCEPTION 'Principal admission changed';END IF;
   SELECT count(*) INTO n FROM authz.permission p WHERE p.canonical_code IN (${codes}) AND p.status='published' AND p.requires_mfa AND (p.canonical_code NOT IN ('metadata.entity.review','metadata.entity.publish') OR p.requires_sod) AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.status='active');
   IF n<>${a.permissions.length} THEN RAISE EXCEPTION 'Permission catalog changed';END IF;
   INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by) VALUES(${role},${tenant},${lit("bp.v2.studio." + a.account)},'Temporary BP v2 native authoring','custom','manual',${revision},jsonb_build_object('proposalRevision',${revision}),'draft',actor);
   INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT ${tenant},${role},id,actor FROM authz.permission WHERE canonical_code IN (${codes}) AND status='published';
   UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=${role};
   INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,metadata,status,created_by) VALUES(${group},${tenant},${lit("bp.v2.studio." + a.account)},'Temporary BP v2 native authoring','custom','manual',${revision},jsonb_build_object('proposalRevision',${revision}),'active',actor);
   INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${tenant},${group},${principal},'manual',${revision},'active',${from},${until},actor);
   INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(${assignment},${tenant},${group},${role},scope,'exact','manual',${revision},'active',${from},${until},actor);
  END $assign$;`;
  });
  return `BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
 SELECT set_config('app.current_tenant_id',${tenant},true);SELECT pg_advisory_xact_lock(hashtextextended('bp-v2-studio:'||${tenant},0));
 ${commit && !revoke ? `DO $window$ BEGIN IF clock_timestamp()<${from}::timestamptz OR clock_timestamp()>=${until}::timestamptz THEN RAISE EXCEPTION 'Outside approved grant window';END IF;END $window$;` : ""}
 ${revoke ? "" : capture}
 ${groups.join("\n")}
 SET CONSTRAINTS ALL IMMEDIATE;
 ${revoke ? "" : `DO $preserve$ DECLARE r record;current_row jsonb;BEGIN FOR r IN SELECT * FROM prior_authority LOOP EXECUTE format('SELECT to_jsonb(x) FROM authz.%I x WHERE id=$1',r.table_name) INTO current_row USING r.id;IF current_row IS DISTINCT FROM r.row_data THEN RAISE EXCEPTION 'Existing authority changed';END IF;END LOOP;END $preserve$;`}
 SELECT jsonb_build_object('proposalRevision',${revision},'assignments',(SELECT count(*) FROM authz.group_role WHERE source_ref=${revision}),'memberships',(SELECT count(*) FROM authz.group_member WHERE source_ref=${revision}),'rolePermissions',(SELECT count(*) FROM authz.role_permission rp JOIN authz.role r ON r.id=rp.role_id WHERE r.source_ref=${revision}));
 ${commit ? "COMMIT;" : "ROLLBACK;"}
 `;
}
