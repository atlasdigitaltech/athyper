-- User-authorized Studio activation observation for catl.admin and catl.owner.
-- Dedicated role/group; existing grants and published releases are untouched.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $grant$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 actor uuid; scope_id uuid; permission_id uuid; role_id uuid; group_id uuid;
 grant_code constant text := 'dev.bp.deployment_observers';
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 SELECT p.id INTO STRICT permission_id FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id WHERE p.canonical_code='publication.deployment.view' AND p.status='published' AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND target_id=t AND scope_kind='tenant' AND status='active';
 IF (SELECT count(*) FROM master.principal WHERE tenant_id=t AND status='active' AND ((code='catl.admin' AND id='81cd1978-2df5-5c9a-938a-2f8c291aea13') OR (code='catl.owner' AND id='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d')))<>2 THEN RAISE EXCEPTION 'Recipient identities changed';END IF;
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=grant_code) OR EXISTS(SELECT 1 FROM authz.principal_group WHERE tenant_id=t AND code=grant_code) THEN RAISE EXCEPTION 'Grant exists; inspect before replay';END IF;
 INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by) VALUES(t,grant_code,'Business Partner deployment observers','custom','manual','user-authorized-bp-publication-proof-20260916','draft',actor) RETURNING id INTO role_id;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,role_id,permission_id,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=role_id;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(t,grant_code,'Business Partner deployment observers','custom','manual','user-authorized-bp-publication-proof-20260916','active',actor) RETURNING id INTO group_id;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by) SELECT t,group_id,p.id,'manual','user-authorized-bp-publication-proof-20260916','active',actor FROM master.principal p WHERE p.tenant_id=t AND p.id IN ('81cd1978-2df5-5c9a-938a-2f8c291aea13','5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d');
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) VALUES(t,group_id,role_id,scope_id,'exact','manual','user-authorized-bp-publication-proof-20260916','active',actor);
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
