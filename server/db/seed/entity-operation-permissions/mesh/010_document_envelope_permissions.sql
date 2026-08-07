-- P5-E2 Mesh-native pilot catalog. Definition only; no authority assignment.
DO $p5e2_mesh_document_envelope_permissions$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_actor::text, true);
    SELECT id INTO v_module_id FROM control.module WHERE lower(code) = 'int' AND status = 'active';
    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[P5-E2 Mesh] active control.module INT is required before consumer permission seeding';
    END IF;

    INSERT INTO authz.permission (
        id, canonical_code, permission_kind, resource_code, operation_code,
        module_id, risk_tier, requires_mfa, requires_sod, is_shareable,
        is_delegable, is_overridable, provenance_ref, metadata, status, created_by
    )
    SELECT md5('athyper:p5-e2:mesh:' || seed.operation_code)::uuid,
           'mesh.document_envelope.' || seed.operation_code,
           'entity_operation', 'mesh.document_envelope', seed.operation_code,
           v_module_id, seed.risk_tier::authz.risk_tier_d,
           seed.requires_mfa, seed.requires_sod, false, seed.is_delegable, false,
           'athyper.operation-scope@p5-e2-v1',
           jsonb_build_object('seed_owner','athyper.operation-scope','phase','P5-E2','plane','mesh'),
           'draft', v_actor
      FROM (VALUES
        ('read','low',false,false,true),
        ('publish','high',true,true,false),
        ('acknowledge','medium',false,false,true),
        ('replay','medium',false,false,true)
      ) AS seed(operation_code,risk_tier,requires_mfa,requires_sod,is_delegable)
    ON CONFLICT (canonical_code) DO NOTHING;

    INSERT INTO authz.permission_scope_policy (permission_id,scope_kind,propagation_mode,created_by)
    SELECT permission.id,'network_account','exact',v_actor
      FROM authz.permission permission
     WHERE permission.canonical_code IN (
        'mesh.document_envelope.read','mesh.document_envelope.publish',
        'mesh.document_envelope.acknowledge','mesh.document_envelope.replay'
     ) AND permission.status IN ('draft','suspended')
    ON CONFLICT (permission_id,scope_kind) DO NOTHING;

    UPDATE authz.permission
       SET status='published',status_changed_at=now(),status_changed_by=v_actor,updated_by=v_actor
     WHERE canonical_code IN (
        'mesh.document_envelope.read','mesh.document_envelope.publish',
        'mesh.document_envelope.acknowledge','mesh.document_envelope.replay'
     ) AND status IN ('draft','suspended');

    IF (SELECT count(*) FROM authz.permission permission
         JOIN authz.permission_scope_policy policy ON policy.permission_id=permission.id
        WHERE permission.canonical_code LIKE 'mesh.document_envelope.%'
          AND permission.permission_kind='entity_operation'
          AND permission.status='published' AND policy.scope_kind='network_account') <> 4 THEN
        RAISE EXCEPTION '[P5-E2 Mesh] Document Envelope canonical permission catalog is incomplete or drifted';
    END IF;
END
$p5e2_mesh_document_envelope_permissions$;
