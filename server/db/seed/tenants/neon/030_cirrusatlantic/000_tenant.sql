-- ============================================================================
-- CIRRUSATLANTIC — TENANT SETUP
-- ============================================================================
-- File:     000_tenant.sql
-- Schema:   master.tenant
-- Purpose:  Provision the CirrusAtlantic tenant.
-- Depends:  seed/platform/006_system_tenant (system principal must exist)
-- Idempotent: Yes — ON CONFLICT (realm_key, code) DO UPDATE
-- ============================================================================

DO $catl_tenant$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';  -- system principal
    v_replication_role text;
BEGIN

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- Repair older CATL sandbox rows that used status='dev', which is outside
    -- the current tenant lifecycle and cannot transition through the guard.
    IF EXISTS (
        SELECT 1
        FROM master.tenant
        WHERE realm_key = 'athyper'
          AND code = 'cirrusatlantic'
          AND status = 'dev'
    ) THEN
        v_replication_role := current_setting('session_replication_role');
        PERFORM set_config('session_replication_role', 'replica', true);

        UPDATE master.tenant
           SET status = 'active',
               status_changed_at = now(),
               status_changed_by = v_su,
               updated_at = now(),
               updated_by = v_su,
               metadata = metadata || jsonb_build_object(
                   '_seed_repair', jsonb_build_object(
                       'pack', '000_tenant',
                       'from_status', 'dev',
                       'to_status', 'active',
                       'repaired_at', now()::text
                   )
               )
         WHERE realm_key = 'athyper'
           AND code = 'cirrusatlantic'
           AND status = 'dev';

        PERFORM set_config('session_replication_role', v_replication_role, true);
    END IF;

    INSERT INTO master.tenant (
        code, name, display_name, realm_key, tenant_type, region, subscription,
        status, metadata, created_by
    ) VALUES (
        'cirrusatlantic',
        'CirrusAtlantic Ltd',
        'CirrusAtlantic Limited',
        'athyper',
        'customer',
        'UK',
        'enterprise',
        'active',
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack',      '000_tenant',
                'version',   '1.0.1',
                'seeded_at', now()::text
            ),
            'setup', jsonb_build_object(
                'mode',       'development',
                'industry',   'infocomm',
                'country',    'GB',
                'coa',        'coa_ifrs',
                'fy_start',   4
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
                              'pack',      '000_tenant',
                              'version',   '1.0.1',
                              'seeded_at', now()::text
                          )),
        updated_at   = now(),
        updated_by   = v_su
    WHERE (master.tenant.realm_key, master.tenant.tenant_type, master.tenant.name, master.tenant.status)
       IS DISTINCT FROM
          (EXCLUDED.realm_key, EXCLUDED.tenant_type, EXCLUDED.name, EXCLUDED.status);

    RAISE NOTICE '[000_tenant] CirrusAtlantic tenant ready (id=%)',
        (SELECT id FROM master.tenant WHERE code = 'cirrusatlantic' AND realm_key = 'athyper');

END $catl_tenant$;
