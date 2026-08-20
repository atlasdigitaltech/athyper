-- ============================================================================
-- TECHNOSTAT — TENANT PROFILE
-- ============================================================================
-- File:     003a_tenant_profile.sql
-- Schema:   master.tenant_profile
-- Purpose:  Locale, fiscal, and formatting defaults — SA, SAR, Asia/Riyadh,
--           en, January fiscal year start (TKSA/SSK calendar FY).
--           TEGY/SDTX Jul-Jun variant is handled at company-code level.
-- Depends:  003_technostat_production_seed.sql (P01 — tenant row)
-- Idempotent: Yes — ON CONFLICT (tenant_id) DO UPDATE
-- ============================================================================

DO $tstat_profile$
DECLARE
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_tid  uuid;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[001_tenant_profile] Technostat tenant not found — run 003_technostat_production_seed.sql first';
    END IF;

    INSERT INTO master.tenant_profile (
        tenant_id,
        country_code,
        locale_code,
        timezone_code,
        language_code,
        date_format,
        number_format,
        week_start,
        weekend_days,
        created_by
    ) VALUES (
        v_tid,
        'SA',                       -- Saudi Arabia (group domicile)
        'en',
        'Asia/Riyadh',
        'en',
        '%d %b %Y',                 -- DD Mon YYYY
        '#,##0.00',
        6,                          -- Week starts Saturday (GCC Arabic calendar display)
        ARRAY[5, 6]::smallint[],   -- Fri(5) + Sat(6) weekend (KSA standard)
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        country_code            = EXCLUDED.country_code,
        locale_code             = EXCLUDED.locale_code,
        timezone_code           = EXCLUDED.timezone_code,
        language_code           = EXCLUDED.language_code,
        date_format             = EXCLUDED.date_format,
        number_format           = EXCLUDED.number_format,
        week_start              = EXCLUDED.week_start,
        weekend_days            = EXCLUDED.weekend_days,
        updated_at              = now(),
        updated_by              = v_su
    WHERE (
        master.tenant_profile.country_code,
        master.tenant_profile.locale_code,
        master.tenant_profile.timezone_code,
        master.tenant_profile.language_code,
        master.tenant_profile.date_format,
        master.tenant_profile.number_format,
        master.tenant_profile.week_start,
        master.tenant_profile.weekend_days
    ) IS DISTINCT FROM (
        EXCLUDED.country_code,
        EXCLUDED.locale_code,
        EXCLUDED.timezone_code,
        EXCLUDED.language_code,
        EXCLUDED.date_format,
        EXCLUDED.number_format,
        EXCLUDED.week_start,
        EXCLUDED.weekend_days
    );

    RAISE NOTICE '[001_tenant_profile] Technostat tenant_profile seeded (id=%)', v_tid;

END $tstat_profile$;
