DO $p5e5_mesh_permissions$
DECLARE v_actor uuid:='00000000-0000-0000-0000-000000000000'; v_module uuid;
BEGIN
  SELECT id INTO v_module FROM master.module WHERE lower(code)='int' AND status='active';
  INSERT INTO authz.permission (id,canonical_code,permission_kind,resource_code,operation_code,module_id,risk_tier,
    requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,provenance_ref,metadata,status,created_by)
  SELECT md5('athyper:p5-e5:mesh:'||code)::uuid,'mesh.document_envelope.'||code,'entity_operation',
    'mesh.document_envelope',code,v_module,risk::authz.risk_tier_d,false,false,shareable,delegable,overridable,
    'athyper.operation-scope@p5-e5-v1',jsonb_build_object('seed_owner','athyper.operation-scope','phase','P5-E5'),'draft',v_actor
  FROM (VALUES ('list','low',false,true,false),('shared_read','low',true,false,false),
    ('override_execute','high',false,false,true)) seed(code,risk,shareable,delegable,overridable)
  ON CONFLICT (canonical_code) DO NOTHING;
  INSERT INTO authz.permission_scope_policy(permission_id,scope_kind,propagation_mode,created_by)
  SELECT id,CASE operation_code WHEN 'shared_read' THEN 'resource'::authz.scope_kind_d ELSE 'network_account'::authz.scope_kind_d END,'exact',v_actor
    FROM authz.permission WHERE canonical_code IN ('mesh.document_envelope.list','mesh.document_envelope.shared_read','mesh.document_envelope.override_execute')
      AND status IN ('draft','suspended') ON CONFLICT DO NOTHING;
  UPDATE authz.permission SET status='published',status_changed_at=now(),status_changed_by=v_actor,updated_by=v_actor
   WHERE canonical_code IN ('mesh.document_envelope.list','mesh.document_envelope.shared_read','mesh.document_envelope.override_execute')
     AND status IN ('draft','suspended');
END $p5e5_mesh_permissions$;
