-- User-authorized grant: catl.admin, CirrusAtlantic NEON, request update in catl.operations.
-- Execute exclusively against local DEV athyper_neon.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $grant$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 recipient constant uuid := 'cca94907-7519-5871-8e3c-6b11aa545c93';
 actor uuid; permission_id uuid; scope_id uuid; new_role uuid; new_group uuid;
 grant_code constant text := 'dev.bp_request_update.catl_admin';
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON database required'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=t AND id=recipient AND code='catl.admin' AND status='active') THEN RAISE EXCEPTION 'Recipient changed'; END IF;
 SELECT p.id INTO STRICT permission_id FROM authz.permission p
 JOIN authz.permission_scope_kind s ON s.permission_id=p.id
 WHERE p.canonical_code='neon.relationship.entity_case.update' AND p.status='published'
 AND s.scope_kind='operating_organization' AND s.propagation_mode='subtree' AND s.status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND target_id='a478f9c0-8226-5d22-9599-b8fb27a45180'::uuid AND scope_kind='operating_organization' AND status='active';
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=grant_code)
 OR EXISTS(SELECT 1 FROM authz.principal_group WHERE tenant_id=t AND code=grant_code) THEN
  RAISE EXCEPTION 'Dedicated grant already exists; inspect before rerunning';
 END IF;
 INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'Business Partner request update — catl.admin','User-authorized request-update access for catl.operations in local NEON.','custom','manual','save-draft-user-authorized-update-20260913','draft',actor) RETURNING id INTO new_role;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,new_role,permission_id,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=new_role;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'Business Partner request update — catl.admin','custom','manual','save-draft-user-authorized-update-20260913','active',actor) RETURNING id INTO new_group;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
 VALUES(t,new_group,recipient,'manual','save-draft-user-authorized-update-20260913','active',actor);
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
 VALUES(t,new_group,new_role,scope_id,'subtree','manual','save-draft-user-authorized-update-20260913','active',actor);
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
