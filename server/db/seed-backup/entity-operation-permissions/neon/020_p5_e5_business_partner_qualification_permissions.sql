DO $p5e5_neon_permissions$
DECLARE v_actor uuid:='00000000-0000-0000-0000-000000000000'; v_module uuid;
BEGIN
  SELECT id INTO v_module FROM control.module WHERE lower(code)='rel' AND status='active';
  INSERT INTO authz.permission (id,canonical_code,permission_kind,module_id,risk_tier,
    requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
  SELECT md5('athyper:p5-e5:neon:'||code)::uuid,'neon.business_partner.'||code,'entity_operation',
    v_module,risk::authz.risk_tier_d,false,false,shareable,delegable,overridable,
    jsonb_build_object('seed_owner','athyper.operation-scope','phase','P5-E5'),'draft',v_actor
  FROM (VALUES ('list','low',false,true,false),('shared_read','low',true,false,false),
    ('override_execute','high',false,false,true)) seed(code,risk,shareable,delegable,overridable)
  ON CONFLICT (canonical_code) DO NOTHING;
  UPDATE authz.permission SET status='published',status_changed_at=now(),status_changed_by=v_actor,updated_by=v_actor
   WHERE canonical_code IN ('neon.business_partner.list','neon.business_partner.shared_read','neon.business_partner.override_execute')
     AND status IN ('draft','suspended');
END $p5e5_neon_permissions$;
