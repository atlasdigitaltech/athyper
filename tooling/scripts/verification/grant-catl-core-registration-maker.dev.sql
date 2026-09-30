-- Explicit approval: CATL admin maker and CATL owner review read; core registration only. Run in installer transaction.
DO $grants$
DECLARE item record; t uuid; actor uuid; subject uuid; r uuid; g uuid; target uuid; role_code text;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dev-partner-classification-grants-v1',0));
 FOR item IN SELECT * FROM(VALUES
  ('cirrusatlantic','catl.admin','maker',ARRAY['create','read','validate','submit','materialize']),
  ('cirrusatlantic','catl.owner','reviewer',ARRAY['read'])
 ) x(tenant_code,principal_code,kind,actions) LOOP
  SELECT id INTO STRICT t FROM master.tenant WHERE code=item.tenant_code AND status='active';
  SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
  SELECT id INTO STRICT subject FROM master.principal WHERE tenant_id=t AND code=item.principal_code AND status='active';
  SELECT id INTO STRICT target FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND target_id=t AND status='active';
  PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',actor::text,true),set_config('app.current_actor_type','user',true);
  role_code:='dev.partner-registration.'||item.kind;
  IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=role_code) THEN RAISE EXCEPTION 'Registration grant exists; inspect rather than widening or replaying'; END IF;
  INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
   VALUES(t,role_code,'DEV core registration '||item.kind,'custom','manual','user-approved-core-registration-20260923','draft',actor) RETURNING id INTO r;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
   SELECT t,r,id,actor FROM authz.permission WHERE canonical_code=ANY(ARRAY(SELECT 'neon.business_partner_registration.'||a FROM unnest(item.actions) a)) AND status='published';
  IF (SELECT count(*) FROM authz.role_permission WHERE tenant_id=t AND role_id=r)<>cardinality(item.actions) THEN RAISE EXCEPTION 'Registration permission catalog incomplete'; END IF;
  UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE tenant_id=t AND id=r;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
   VALUES(t,role_code,'DEV core registration '||item.kind,'custom','manual','user-approved-core-registration-20260923','active',actor) RETURNING id INTO g;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
   VALUES(t,g,subject,'manual','user-approved-core-registration-20260923','active',actor);
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
   VALUES(t,g,r,target,'exact','manual','user-approved-core-registration-20260923','active',actor);
 END LOOP;
END $grants$;
