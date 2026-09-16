-- Explicit user authorization: seven-day Studio grants for the BP label journey.
-- Existing expired/revoked assignments remain unchanged; MFA and SoD remain enforced.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $grant$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 actor uuid; scope_id uuid; new_role uuid; new_group uuid; assignment record;
 grant_code text; started timestamptz := transaction_timestamp();
 ends timestamptz := transaction_timestamp()+interval '7 days';
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required';END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND target_id=t AND scope_kind='tenant' AND status='active';
 FOR assignment IN SELECT * FROM (VALUES
 ('catl.admin','81cd1978-2df5-5c9a-938a-2f8c291aea13'::uuid,ARRAY['metadata.entity.submit','metadata.entity.publish']::text[]),
 ('catl.owner','5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'::uuid,ARRAY['metadata.entity.review']::text[])
 ) AS a(account,principal_id,codes) LOOP
  grant_code := 'dev.bp.label_journey.20260916.'||assignment.account;
  IF NOT EXISTS(SELECT 1 FROM master.principal p JOIN authz.plane_membership pm ON pm.principal_id=p.id AND pm.tenant_id=t WHERE p.tenant_id=t AND p.id=assignment.principal_id AND p.code=assignment.account AND p.status='active' AND pm.status='active' AND pm.effective_from<=started AND (pm.effective_until IS NULL OR pm.effective_until>started)) THEN RAISE EXCEPTION 'Principal admission changed';END IF;
  IF (SELECT count(*) FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code=ANY(assignment.codes) AND p.status='published' AND p.requires_mfa AND (p.canonical_code='metadata.entity.submit' OR p.requires_sod) AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active')<>cardinality(assignment.codes) THEN RAISE EXCEPTION 'Permission catalog changed';END IF;
  IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=grant_code) OR EXISTS(SELECT 1 FROM authz.principal_group WHERE tenant_id=t AND code=grant_code) THEN RAISE EXCEPTION 'Grant exists; inspect before replay';END IF;
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES(t,grant_code,'BP label journey - '||assignment.account,'custom','manual','user-authorized-seven-day-bp-workflow-20260916','draft',actor) RETURNING id INTO new_role;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT t,new_role,p.id,actor FROM authz.permission p WHERE p.canonical_code=ANY(assignment.codes);
  UPDATE authz.role SET status='active',status_changed_at=started,status_changed_by=actor WHERE id=new_role;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(t,grant_code,'BP label journey - '||assignment.account,'custom','manual','user-authorized-seven-day-bp-workflow-20260916','active',actor) RETURNING id INTO new_group;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(t,new_group,assignment.principal_id,'manual','user-authorized-seven-day-bp-workflow-20260916','active',started,ends,actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_from,effective_until,created_by) VALUES(t,new_group,new_role,scope_id,'exact','manual','user-authorized-seven-day-bp-workflow-20260916','active',started,ends,actor);
 END LOOP;
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT jsonb_build_object('account',p.code,'permission',pe.canonical_code,'scope','tenant','effectiveFrom',gr.effective_from,'effectiveUntil',gr.effective_until) FROM authz.principal_group g JOIN authz.group_member gm ON gm.group_id=g.id JOIN master.principal p ON p.id=gm.principal_id JOIN authz.group_role gr ON gr.group_id=g.id JOIN authz.role_permission rp ON rp.role_id=gr.role_id JOIN authz.permission pe ON pe.id=rp.permission_id WHERE g.source_ref='user-authorized-seven-day-bp-workflow-20260916' ORDER BY p.code,pe.canonical_code;
COMMIT;
