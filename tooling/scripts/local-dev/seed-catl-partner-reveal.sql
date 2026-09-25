-- Explicit DEV-only CATL owner reveal test access. No other tenant/principal grants.
BEGIN;
DO $$
DECLARE tid uuid; actor uuid; owner_id uuid; target uuid; rid uuid; gid uuid;
 codes text[] := ARRAY['neon.relationship.business_partner_identifier.reveal',
 'neon.relationship.business_partner_tax.reveal','neon.relationship.bp_target.identifier_reveal',
 'neon.relationship.bp_target.tax_reveal'];
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON DEV target required'; END IF;
 SELECT id INTO STRICT tid FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=tid AND code='seed.three-plane-provisioner';
 SELECT id INTO STRICT owner_id FROM master.principal WHERE tenant_id=tid AND code='catl.owner' AND status='active';
 PERFORM set_config('app.current_tenant_id',tid::text,true),set_config('app.current_principal_id',actor::text,true);
 SELECT id INTO STRICT target FROM authz.scope_target WHERE tenant_id=tid AND scope_kind='tenant' AND target_id=tid AND status='active';
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code=ANY(codes) AND status='published' AND requires_mfa)<>4 THEN RAISE EXCEPTION 'Reveal catalog incomplete'; END IF;
 SELECT id INTO rid FROM authz.role WHERE tenant_id=tid AND code='dev.bp.reveal.catl.owner';
 IF rid IS NULL THEN
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
  VALUES(tid,'dev.bp.reveal.catl.owner','CATL owner protected partner reveal test','custom','manual','approved-catl-reveal-test','draft',actor) RETURNING id INTO rid;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) SELECT tid,rid,id,actor FROM authz.permission WHERE canonical_code=ANY(codes);
  UPDATE authz.role SET status='active',updated_by=actor WHERE id=rid AND tenant_id=tid;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
  VALUES(tid,'dev.bp.reveal.catl.owner','CATL owner reveal test','custom','manual','approved-catl-reveal-test','active',actor) RETURNING id INTO gid;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by)
  VALUES(tid,gid,owner_id,'manual','approved-catl-reveal-test','active',now()+interval '24 hours',actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by)
  VALUES(tid,gid,rid,target,'exact','manual','approved-catl-reveal-test','active',now()+interval '24 hours',actor);
 END IF;
 IF (SELECT count(*) FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id WHERE rp.tenant_id=tid AND rp.role_id=rid AND p.canonical_code=ANY(codes))<>4 THEN RAISE EXCEPTION 'Missing identifier/tax reveal role permissions'; END IF;
END $$;
COMMIT;
