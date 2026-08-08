-- P5-E2 Neon pilot catalog. Definition only; no authority assignment.
DO $p5e2_neon_business_partner_permissions$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_actor::text, true);
    SELECT id INTO v_module_id FROM control.module WHERE lower(code) = 'rel' AND status = 'active';
    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[P5-E2 Neon] active control.module REL is required before consumer permission seeding';
    END IF;

    INSERT INTO authz.permission (
        id, canonical_code, permission_kind,
        module_id, risk_tier, requires_mfa, requires_sod, is_shareable,
        is_delegable, is_overridable, metadata, status, created_by
    )
    SELECT md5('athyper:p5-e2:neon:' || seed.operation_code)::uuid,
           'neon.business_partner.' || seed.operation_code,
           'entity_operation',
           v_module_id, seed.risk_tier::authz.risk_tier_d, false, false, false,
           seed.is_delegable, false,
           jsonb_build_object('seed_owner','athyper.operation-scope','phase','P5-E2','plane','neon'),
           'draft', v_actor
      FROM (VALUES
        ('create','medium',true), ('update','medium',true),
        ('activate','high',false), ('deactivate','high',false)
      ) AS seed(operation_code,risk_tier,is_delegable)
    ON CONFLICT (canonical_code) DO NOTHING;

    UPDATE authz.permission
       SET status='published',status_changed_at=now(),status_changed_by=v_actor,updated_by=v_actor
     WHERE canonical_code IN (
        'neon.business_partner.create','neon.business_partner.update',
        'neon.business_partner.activate','neon.business_partner.deactivate'
     ) AND status IN ('draft','suspended');

    IF (SELECT count(*) FROM authz.permission
        WHERE canonical_code LIKE 'neon.business_partner.%'
          AND permission_kind='entity_operation'
          AND status='published') <> 4 THEN
        RAISE EXCEPTION '[P5-E2 Neon] Business Partner canonical permission catalog is incomplete or drifted';
    END IF;
END
$p5e2_neon_business_partner_permissions$;
