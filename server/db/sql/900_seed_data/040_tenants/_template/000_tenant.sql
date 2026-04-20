-- ============================================================================
-- TENANT ONBOARDING — Step 1: Tenant Record
-- ============================================================================
-- Replace all occurrences of:
--   __CLIENT_CODE__      → short lowercase identifier, e.g. acme
--   __CLIENT_NAME__      → display name, e.g. Acme Corporation
--   __CLIENT_UUID__      → new UUID v7 (SELECT shared.uuidv7())
--   __COUNTRY_CODE__     → ISO 3166-1 alpha-2, e.g. MY
--   __CURRENCY_CODE__    → ISO 4217, e.g. MYR
--   __TIMEZONE__         → IANA zone, e.g. Asia/Kuala_Lumpur
--   __LOCALE__           → BCP-47 locale, e.g. ms-MY
-- ============================================================================

BEGIN;

INSERT INTO master.tenant (
    id, code, name,
    country_code, default_currency_code, default_timezone, default_locale,
    status, created_by
)
VALUES (
    '__CLIENT_UUID__',
    '__CLIENT_CODE__',
    '__CLIENT_NAME__',
    '__COUNTRY_CODE__', '__CURRENCY_CODE__', '__TIMEZONE__', '__LOCALE__',
    'active', '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (code) DO UPDATE SET
    name                  = EXCLUDED.name,
    country_code          = EXCLUDED.country_code,
    default_currency_code = EXCLUDED.default_currency_code,
    default_timezone      = EXCLUDED.default_timezone,
    default_locale        = EXCLUDED.default_locale;

COMMIT;
