-- P5-E2 Neon pilot catalog. Definition only; no authority assignment.
DO $p5e2_neon_business_partner_permissions$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_actor::text, true);
    SELECT id INTO v_module_id FROM master.module WHERE lower(code) = 'rel' AND status = 'active';
    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[P5-E2 Neon] active master.module REL is required before consumer permission seeding';
    END IF;

    INSERT INTO authz.permission (
        id, canonical_code, permission_kind, resource_code, operation_code,
        module_id, risk_tier, requires_mfa, requires_sod, is_shareable,
        is_delegable, is_overridable, provenance_ref, metadata, status, created_by
    )
    SELECT md5('athyper:p5-e2:neon:' || seed.operation_code)::uuid,
           'neon.business_partner.' || seed.operation_code,
           'entity_operation', 'neon.business_partner', seed.operation_code,
           v_module_id, seed.risk_tier::authz.risk_tier_d, false, false, false,
           seed.is_delegable, false, 'athyper.operation-scope@p5-e2-v1',
           jsonb_build_object('seed_owner','athyper.operation-scope','phase','P5-E2','plane','neon'),
           'draft', v_actor
      FROM (VALUES
        ('create','medium',true), ('update','medium',true),
        ('activate','high',false), ('deactivate','high',false)
      ) AS seed(operation_code,risk_tier,is_delegable)
    ON CONFLICT (canonical_code) DO NOTHING;

    INSERT INTO authz.permission_scope_policy (permission_id,scope_kind,propagation_mode,created_by)
    SELECT permission.id,'tenant','exact',v_actor
      FROM authz.permission permission
     WHERE permission.canonical_code IN (
        'neon.business_partner.create','neon.business_partner.update',
        'neon.business_partner.activate','neon.business_partner.deactivate'
     ) AND permission.status IN ('draft','suspended')
    ON CONFLICT (permission_id,scope_kind) DO NOTHING;

    UPDATE authz.permission
       SET status='published',status_changed_at=now(),status_changed_by=v_actor,updated_by=v_actor
     WHERE canonical_code IN (
        'neon.business_partner.create','neon.business_partner.update',
        'neon.business_partner.activate','neon.business_partner.deactivate'
     ) AND status IN ('draft','suspended');

    IF (SELECT count(*) FROM authz.permission permission
         JOIN authz.permission_scope_policy policy ON policy.permission_id=permission.id
        WHERE permission.canonical_code LIKE 'neon.business_partner.%'
          AND permission.permission_kind='entity_operation'
          AND permission.status='published' AND policy.scope_kind='tenant') <> 4 THEN
        RAISE EXCEPTION '[P5-E2 Neon] Business Partner canonical permission catalog is incomplete or drifted';
    END IF;
END
$p5e2_neon_business_partner_permissions$;

