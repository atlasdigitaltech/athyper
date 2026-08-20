-- ============================================================================
-- CIRRUSATLANTIC — TENANT PROFILE
-- ============================================================================
-- seed-pack-version: 2.0.0
-- Dataset:  cirrusatlantic.tenant-profile
-- Version:  2.0.0
-- Plane:    neon
-- Purpose:  Tenant presentation defaults for GB, Europe/London and en-GB.
-- Note:     Currency and fiscal authority are company/accounting-policy owned.
-- Depends:  000_tenant.sql
-- Natural key: tenant_id
-- Idempotent: convergent ON CONFLICT update; created_* is preserved
-- ============================================================================

DO $catl_profile$
DECLARE
    v_su        constant uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_metadata  constant jsonb :=
        '{"_seed":{"pack":"cirrusatlantic.tenant-profile","version":"2.0.0"}}'::jsonb;
BEGIN
    SELECT id
      INTO v_tenant_id
      FROM master.tenant
     WHERE realm_key = 'athyper'
       AND code = 'cirrusatlantic';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION
            '[001_tenant_profile] CirrusAtlantic tenant not found; run 000_tenant.sql first';
    END IF;

    INSERT INTO master.tenant_profile (
        id,
        tenant_id,
        country_code,
        locale_code,
        timezone_code,
        language_code,
        date_format,
        number_format,
        week_start,
        weekend_days,
        metadata,
        created_by
    ) VALUES (
        md5('neon:tenant-profile:athyper:cirrusatlantic')::uuid,
        v_tenant_id,
        'GB',
        'en-GB',
        'Europe/London',
        'en',
        '%d %b %Y',
        '#,##0.00',
        1,
        ARRAY[0, 6]::smallint[],
        v_metadata,
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        country_code  = EXCLUDED.country_code,
        locale_code   = EXCLUDED.locale_code,
        timezone_code = EXCLUDED.timezone_code,
        language_code = EXCLUDED.language_code,
        date_format   = EXCLUDED.date_format,
        number_format = EXCLUDED.number_format,
        week_start    = EXCLUDED.week_start,
        weekend_days  = EXCLUDED.weekend_days,
        metadata      = master.tenant_profile.metadata || EXCLUDED.metadata,
        updated_at    = now(),
        updated_by    = v_su
    WHERE (
        master.tenant_profile.country_code,
        master.tenant_profile.locale_code,
        master.tenant_profile.timezone_code,
        master.tenant_profile.language_code,
        master.tenant_profile.date_format,
        master.tenant_profile.number_format,
        master.tenant_profile.week_start,
        master.tenant_profile.weekend_days,
        master.tenant_profile.metadata
    ) IS DISTINCT FROM (
        EXCLUDED.country_code,
        EXCLUDED.locale_code,
        EXCLUDED.timezone_code,
        EXCLUDED.language_code,
        EXCLUDED.date_format,
        EXCLUDED.number_format,
        EXCLUDED.week_start,
        EXCLUDED.weekend_days,
        master.tenant_profile.metadata || EXCLUDED.metadata
    );

    IF NOT EXISTS (
        SELECT 1
          FROM master.tenant_profile
         WHERE tenant_id = v_tenant_id
           AND country_code = 'GB'
           AND locale_code = 'en-GB'
           AND timezone_code = 'Europe/London'
           AND language_code = 'en'
           AND week_start = 1
           AND weekend_days = ARRAY[0, 6]::smallint[]
    ) THEN
        RAISE EXCEPTION '[001_tenant_profile] profile assertion failed';
    END IF;

    RAISE NOTICE '[001_tenant_profile] CirrusAtlantic tenant profile seeded (tenant_id=%)',
        v_tenant_id;
END
$catl_profile$;
