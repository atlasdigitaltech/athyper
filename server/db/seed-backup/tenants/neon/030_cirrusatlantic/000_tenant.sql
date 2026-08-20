-- ============================================================================
-- CIRRUSATLANTIC — TENANT SETUP
-- ============================================================================
-- seed-pack-version: 2.1.0
-- Dataset:  cirrusatlantic.tenant
-- Version:  2.1.0
-- Plane:    neon
-- Scope:    tenant identity/bootstrap
-- Depends:  common system authority; neon control.subscription_plan seed
-- Natural key: (realm_key, code) = ('athyper', 'cirrusatlantic')
-- Idempotent: convergent ON CONFLICT update; created_* is preserved
-- ============================================================================

DO $catl_tenant$
DECLARE
    v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant  uuid := md5('neon:tenant:athyper:cirrusatlantic')::uuid;
    v_seed_actor constant uuid :=
        md5('neon:principal:athyper:cirrusatlantic:seed-service')::uuid;
    v_plan_id uuid;
    v_metadata constant jsonb := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack', 'cirrusatlantic.tenant',
            'version', '2.1.0',
            'provenance', 'tenant onboarding seed'
        ),
        'setup', jsonb_build_object(
            'industry_pack', 'infocomm',
            'coa_framework', 'coa_ifrs'
        )
    );
BEGIN
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id
      INTO v_plan_id
      FROM control.subscription_plan
     WHERE code = 'erp_enterprise'
       AND status = 'active';

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION
            '[000_tenant] active Neon subscription plan erp_enterprise is required';
    END IF;

    INSERT INTO master.tenant (
        id,
        code,
        name,
        display_name,
        realm_key,
        canonical_party_id,
        subscription_plan_id,
        metadata,
        status,
        created_by
    ) VALUES (
        v_tenant,
        'cirrusatlantic',
        'CirrusAtlantic Ltd',
        'CirrusAtlantic Limited',
        'athyper',
        md5('athyper:canonical-party:cirrusatlantic')::uuid,
        v_plan_id,
        v_metadata,
        'active',
        v_su
    )
    ON CONFLICT (realm_key, code) DO UPDATE SET
        name                 = EXCLUDED.name,
        display_name         = EXCLUDED.display_name,
        canonical_party_id   = EXCLUDED.canonical_party_id,
        subscription_plan_id = EXCLUDED.subscription_plan_id,
        metadata             = master.tenant.metadata || EXCLUDED.metadata,
        status               = EXCLUDED.status,
        updated_at           = now(),
        updated_by           = v_su
    WHERE (
        master.tenant.name,
        master.tenant.display_name,
        master.tenant.canonical_party_id,
        master.tenant.subscription_plan_id,
        master.tenant.metadata,
        master.tenant.status
    ) IS DISTINCT FROM (
        EXCLUDED.name,
        EXCLUDED.display_name,
        EXCLUDED.canonical_party_id,
        EXCLUDED.subscription_plan_id,
        master.tenant.metadata || EXCLUDED.metadata,
        EXCLUDED.status
    );

    SELECT id
      INTO v_tenant
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'cirrusatlantic';

    -- Tenant-local application actor used by onboarding packs. Tenant-owned
    -- audit foreign keys require (tenant_id, principal_id) to share scope.
    INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type, provisioning_source,
        metadata, status, created_by
    ) VALUES (
        v_seed_actor, v_tenant, 'seed-service',
        'CirrusAtlantic Seed Service', 'service_account', 'internal',
        '{"_seed":{"pack":"cirrusatlantic.tenant","version":"2.1.0"}}'::jsonb,
        'active', v_su
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                = EXCLUDED.name,
        principal_type      = EXCLUDED.principal_type,
        provisioning_source = EXCLUDED.provisioning_source,
        metadata            = master.principal.metadata || EXCLUDED.metadata,
        status              = EXCLUDED.status,
        updated_at          = now(),
        updated_by          = v_su
    WHERE (
        master.principal.name,
        master.principal.principal_type,
        master.principal.provisioning_source,
        master.principal.metadata,
        master.principal.status
    ) IS DISTINCT FROM (
        EXCLUDED.name,
        EXCLUDED.principal_type,
        EXCLUDED.provisioning_source,
        master.principal.metadata || EXCLUDED.metadata,
        EXCLUDED.status
    );

    IF NOT EXISTS (
        SELECT 1
          FROM master.tenant tenant_row
          JOIN control.subscription_plan plan
            ON plan.id = tenant_row.subscription_plan_id
         WHERE tenant_row.realm_key = 'athyper'
           AND tenant_row.code = 'cirrusatlantic'
           AND tenant_row.status = 'active'
           AND plan.code = 'erp_enterprise'
           AND plan.status = 'active'
           AND EXISTS (
               SELECT 1 FROM master.principal principal_row
                WHERE principal_row.tenant_id = tenant_row.id
                  AND principal_row.id = v_seed_actor
                  AND principal_row.code = 'seed-service'
                  AND principal_row.status = 'active'
           )
    ) THEN
        RAISE EXCEPTION
            '[000_tenant] tenant identity or subscription assertion failed';
    END IF;

    RAISE NOTICE '[000_tenant] CirrusAtlantic tenant ready (id=%)',
        (SELECT id FROM master.tenant
          WHERE realm_key = 'athyper' AND code = 'cirrusatlantic');
END
$catl_tenant$;
