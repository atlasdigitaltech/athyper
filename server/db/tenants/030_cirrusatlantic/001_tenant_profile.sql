-- ============================================================================
-- CIRRUSATLANTIC — TENANT PROFILE
-- ============================================================================
-- File:     001_tenant_profile.sql
-- Schema:   master.tenant_profile
-- Purpose:  Locale, fiscal, and formatting defaults — GB, GBP, Europe/London,
--           en-GB, April fiscal year start.
-- Depends:  000_tenant.sql
-- Idempotent: Yes — ON CONFLICT (tenant_id) DO UPDATE
-- ============================================================================

DO $catl_profile$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
BEGIN

    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[001_tenant_profile] CirrusAtlantic tenant not found — run 000_tenant.sql first';
    END IF;

    INSERT INTO master.tenant_profile (
        tenant_id,
        country_code,
        currency_code,
        reporting_currency_code,
        locale_code,
        timezone_code,
        language_code,
        fiscal_year_start_month,
        date_format,
        number_format,
        week_start,
        weekend_days,
        created_by
    ) VALUES (
        v_tenant_id,
        'GB',                       -- United Kingdom
        'GBP',                      -- Pound Sterling
        'GBP',                      -- Report in GBP
        'en-GB',
        'Europe/London',
        'en',
        4,                          -- Fiscal year starts April
        '%d/%m/%Y',                 -- DD/MM/YYYY
        '#,##0.00',
        1,                          -- Week starts Monday (ISO standard)
        ARRAY[0, 6]::smallint[],   -- Sun(0) + Sat(6) weekend (UK standard, 0=Sun…6=Sat)
        v_su
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        country_code            = EXCLUDED.country_code,
        currency_code           = EXCLUDED.currency_code,
        reporting_currency_code = EXCLUDED.reporting_currency_code,
        locale_code             = EXCLUDED.locale_code,
        timezone_code           = EXCLUDED.timezone_code,
        language_code           = EXCLUDED.language_code,
        fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
        date_format             = EXCLUDED.date_format,
        number_format           = EXCLUDED.number_format,
        week_start              = EXCLUDED.week_start,
        weekend_days            = EXCLUDED.weekend_days,
        updated_at              = now(),
        updated_by              = v_su
    WHERE (
        master.tenant_profile.country_code,
        master.tenant_profile.currency_code,
        master.tenant_profile.locale_code,
        master.tenant_profile.timezone_code,
        master.tenant_profile.fiscal_year_start_month
    ) IS DISTINCT FROM (
        EXCLUDED.country_code,
        EXCLUDED.currency_code,
        EXCLUDED.locale_code,
        EXCLUDED.timezone_code,
        EXCLUDED.fiscal_year_start_month
    );

    RAISE NOTICE '[001_tenant_profile] CirrusAtlantic tenant_profile seeded (id=%)', v_tenant_id;

END $catl_profile$;
