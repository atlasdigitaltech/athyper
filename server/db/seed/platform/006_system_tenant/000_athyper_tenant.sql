-- Blueprint owner tenant — MUST exist before any Tier-2/3 tenant seed runs.
-- Depends on 000_bootstrap.sql (system principal).

DO $tenant$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';   -- system principal
BEGIN
    -- shared.trg_set_updated_at() reads app.current_principal_id to populate updated_by
    -- on the ON CONFLICT UPDATE branch; without this the trigger fails.
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    INSERT INTO master.tenant (
        code, name, display_name, realm_key, tenant_type, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'athyper',
        'Athyper Group',
        'Athyper Group Holdings',
        'athyper',
        'platform_owner',
        'GCC',
        'enterprise',
        'active',
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack',      '006_system_tenant',
                'version',   '1.0.0',
                'seeded_at', now()::text
            ),
            'group', jsonb_build_object(
                'subsidiary_count', 16,
                'industries', ARRAY[
                    'utilities', 'construction', 'real_estate', 'transport',
                    'trading', 'hospitality', 'infocomm', 'financial',
                    'mfg_textile', 'mfg_food_bev', 'mfg_pharma', 'mfg_electronics',
                    'mining_petroleum', 'agriculture', 'education', 'healthcare'
                ]
            )
        ),
        v_su
    )
    ON CONFLICT (realm_key, code) DO UPDATE SET
        name         = EXCLUDED.name,
        display_name = EXCLUDED.display_name,
        tenant_type  = EXCLUDED.tenant_type,
        region       = EXCLUDED.region,
        subscription = EXCLUDED.subscription,
        status       = EXCLUDED.status,
        metadata     = master.tenant.metadata
                       || jsonb_build_object('_seed', jsonb_build_object(
                              'pack',      '006_system_tenant',
                              'version',   '1.0.0',
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.tenant.realm_key, master.tenant.tenant_type, master.tenant.name, master.tenant.display_name,
           master.tenant.region, master.tenant.subscription,
           master.tenant.status)
       IS DISTINCT FROM
          (EXCLUDED.realm_key, EXCLUDED.tenant_type, EXCLUDED.name, EXCLUDED.display_name,
           EXCLUDED.region, EXCLUDED.subscription,
           EXCLUDED.status);

    RAISE NOTICE '[006_system_tenant] Blueprint tenant ready (id=%)',
        (SELECT id FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper');

END $tenant$;
