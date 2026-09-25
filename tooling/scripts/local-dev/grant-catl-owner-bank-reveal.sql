-- Existing DEV CATL owner role only; preserve its current expiry and all other grants.
BEGIN;
DO $$
DECLARE t uuid; a uuid; r uuid;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon required'; END IF;
 SELECT id INTO STRICT t FROM master.tenant WHERE code='cirrusatlantic' AND status='active';
 SELECT id INTO STRICT a FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner';
 SELECT id INTO STRICT r FROM authz.role WHERE tenant_id=t AND code='dev.bp.reveal.catl.owner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM authz.group_role gr JOIN authz.group_member gm ON gm.tenant_id=gr.tenant_id AND gm.group_id=gr.group_id JOIN master.principal p ON p.tenant_id=gm.tenant_id AND p.id=gm.principal_id WHERE gr.tenant_id=t AND gr.role_id=r AND gr.status='active' AND gm.status='active' AND gr.effective_until>now() AND gm.effective_until>now() AND p.code='catl.owner') THEN RAISE EXCEPTION 'Unexpired owner test assignment required'; END IF;
 PERFORM set_config('app.current_tenant_id',t::text,true),set_config('app.current_principal_id',a::text,true);
 INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
 SELECT 'dfc7f302-e044-44f0-b7b8-21cf842098bc','neon.relationship.bp_target.bank_reveal','entity_operation',id,'high',true,false,false,false,false,'{}','published',a FROM control.module WHERE code='fnd' AND status='active'
 ON CONFLICT(canonical_code) DO NOTHING;
 INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
 SELECT id,'tenant','exact','active',a FROM authz.permission WHERE canonical_code IN ('neon.relationship.bp_target.bank_reveal','neon.relationship.business_partner_bank.reveal')
 ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
 IF (SELECT count(*) FROM authz.permission WHERE canonical_code IN ('neon.relationship.bp_target.bank_reveal','neon.relationship.business_partner_bank.reveal') AND status='published' AND requires_mfa)<>2 THEN RAISE EXCEPTION 'MFA-protected catalog required'; END IF;
 UPDATE authz.role SET status='suspended',updated_by=a WHERE id=r AND tenant_id=t;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
 SELECT t,r,id,a FROM authz.permission WHERE canonical_code IN ('neon.relationship.bp_target.bank_reveal','neon.relationship.business_partner_bank.reveal')
 ON CONFLICT DO NOTHING;
 UPDATE authz.role SET status='active',updated_by=a WHERE id=r AND tenant_id=t;
END $$;
COMMIT;
