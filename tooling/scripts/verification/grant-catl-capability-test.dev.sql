-- Explicit user approval: CATL admin only, two BP capability permissions, seven days.
DO $$ DECLARE t uuid; actor uuid; subject uuid; module uuid; scope uuid; r uuid; g uuid; permission uuid; capacity text;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('catl-capability-test-v1',0));
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 SELECT id INTO STRICT subject FROM master.principal WHERE tenant_id=t AND code='catl.admin' AND status='active';
 SELECT module_id INTO STRICT module FROM authz.permission WHERE canonical_code='neon.relationship.business_partner.read' AND status='published';
 SELECT id INTO STRICT scope FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND target_id=t AND status='active';
 PERFORM set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',actor::text,true);
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code='dev.partner-capability-test.v1') THEN RAISE EXCEPTION 'Test role exists; inspect, do not widen or extend expiry'; END IF;
 INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
 VALUES(t,'dev.partner-capability-test.v1','DEV partner capability tester','custom','manual','user-approved-catl-capability-test-20260925','draft',actor) RETURNING id INTO r;
 FOREACH capacity IN ARRAY ARRAY['supplier','customer'] LOOP
  IF EXISTS(SELECT 1 FROM authz.permission WHERE canonical_code='neon.relationship.business_partner.capability_'||capacity||'_manage') THEN RAISE EXCEPTION 'Capability catalog exists; inspect rather than overwrite'; END IF;
  INSERT INTO authz.permission(canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,metadata,status,created_by)
  VALUES('neon.relationship.business_partner.capability_'||capacity||'_manage','capability',module,'medium',false,false,'{"owner":"master-data","authority":"BP capability only; not transaction approval","devTest":"catl-capability-v1"}','published',actor) RETURNING id INTO permission;
  INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) VALUES(permission,'tenant','exact','active',actor);
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,r,permission,actor);
 END LOOP;
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=r;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,'dev.partner-capability-test.v1','DEV partner capability tester','custom','manual','user-approved-catl-capability-test-20260925','active',actor) RETURNING id INTO g;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by)
 VALUES(t,g,subject,'manual','user-approved-catl-capability-test-20260925','active',now()+interval '7 days',actor);
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by)
 VALUES(t,g,r,scope,'exact','manual','user-approved-catl-capability-test-20260925','active',now()+interval '7 days',actor);
END $$;
REVOKE ALL ON FUNCTION control.command_business_partner_capability(uuid,uuid,text,boolean,bigint,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control.command_business_partner_capability(uuid,uuid,text,boolean,bigint,text,text,uuid) TO athyperapp,athyperadmin;
