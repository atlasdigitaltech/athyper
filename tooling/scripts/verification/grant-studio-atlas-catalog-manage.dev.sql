-- User-authorized grant: catl.admin, CirrusAtlantic Studio, Atlas catalog management.
-- Execute exclusively against local DEV athyper_studio.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $grant$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 recipient constant uuid := '81cd1978-2df5-5c9a-938a-2f8c291aea13';
 actor uuid; permission_id uuid; scope_id uuid; new_role uuid; new_group uuid;
 grant_code constant text := 'dev.atlas_catalog_manage.catl_admin';
BEGIN
 IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=t AND id=recipient AND code='catl.admin' AND status='active') THEN RAISE EXCEPTION 'Recipient changed'; END IF;
 SELECT p.id INTO STRICT permission_id FROM authz.permission p
 JOIN authz.permission_scope_kind s ON s.permission_id=p.id
 WHERE p.canonical_code='studio.platform.catalog.manage' AND p.status='published'
 AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active';
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND target_id=t AND scope_kind='tenant' AND status='active';
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=grant_code)
 OR EXISTS(SELECT 1 FROM authz.principal_group WHERE tenant_id=t AND code=grant_code) THEN
  RAISE EXCEPTION 'Dedicated grant already exists; inspect before rerunning';
 END IF;
 INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'Atlas catalog management — catl.admin','User-authorized Atlas experience management for catl.admin in CirrusAtlantic DEV Studio.','custom','manual','user-authorized-atlas-catalog-manage-20260916','draft',actor) RETURNING id INTO new_role;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,new_role,permission_id,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=new_role;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'Atlas catalog management — catl.admin','custom','manual','user-authorized-atlas-catalog-manage-20260916','active',actor) RETURNING id INTO new_group;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
 VALUES(t,new_group,recipient,'manual','user-authorized-atlas-catalog-manage-20260916','active',actor);
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
 VALUES(t,new_group,new_role,scope_id,'exact','manual','user-authorized-atlas-catalog-manage-20260916','active',actor);
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;
