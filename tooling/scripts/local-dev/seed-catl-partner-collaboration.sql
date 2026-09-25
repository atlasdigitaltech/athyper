-- Explicitly approved CATL admin read/create comments and read/upload/download files.
-- No archive, deletion, moderation, or other principal access.
BEGIN;
DO $$
DECLARE tid uuid; actor uuid; admin_id uuid; target uuid; rid uuid; gid uuid;
 codes text[]:=ARRAY['neon.collaboration.comment.read','neon.collaboration.comment.create',
 'neon.collaboration.attachment.read','neon.collaboration.attachment.create',
 'neon.collaboration.attachment.finalize','neon.collaboration.attachment.download'];
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON DEV target required'; END IF;
 SELECT id INTO STRICT tid FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=tid AND code='seed.three-plane-provisioner';
 SELECT id INTO STRICT admin_id FROM master.principal WHERE tenant_id=tid AND code='catl.admin' AND status='active';
 PERFORM set_config('app.current_tenant_id',tid::text,true),set_config('app.current_principal_id',actor::text,true);
 SELECT id INTO STRICT target FROM authz.scope_target WHERE tenant_id=tid AND scope_kind='tenant' AND target_id=tid AND status='active';
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code=ANY(codes) AND status='published')<>6 THEN RAISE EXCEPTION 'Catalog incomplete'; END IF;
 INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
 SELECT p.id,'tenant','exact','active',actor FROM authz.permission p WHERE p.canonical_code=ANY(codes)
 AND NOT EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id AND s.scope_kind='tenant' AND s.propagation_mode='exact');
 SELECT id INTO rid FROM authz.role WHERE tenant_id=tid AND code='dev.bp.collaboration.catl.admin';
 IF rid IS NULL THEN
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
  VALUES(tid,'dev.bp.collaboration.catl.admin','Approved CATL partner collaboration','custom','manual','approved-catl-bp-collaboration-20260924','draft',actor) RETURNING id INTO rid;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT tid,rid,id,actor FROM authz.permission WHERE canonical_code=ANY(codes);
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=rid AND tenant_id=tid;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
  VALUES(tid,'dev.bp.collaboration.catl.admin','Approved CATL partner collaboration','custom','manual','approved-catl-bp-collaboration-20260924','active',actor) RETURNING id INTO gid;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
  VALUES(tid,gid,admin_id,'manual','approved-catl-bp-collaboration-20260924','active',actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
  VALUES(tid,gid,rid,target,'exact','manual','approved-catl-bp-collaboration-20260924','active',actor);
 END IF;
 IF (SELECT count(*) FROM authz.role_permission WHERE tenant_id=tid AND role_id=rid)<>6 OR EXISTS(
 SELECT 1 FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.tenant_id=tid AND rp.role_id=rid AND NOT(p.canonical_code=ANY(codes))) THEN RAISE EXCEPTION 'Role contract mismatch'; END IF;
END $$;
COMMIT;
