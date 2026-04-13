-- 10_views/003b_master_ui_principal.sql
-- Depends on: 04_tables/003e_master_ui_principal.sql (principal_ui_profile),
--             04_tables/003_master.sql (principal, tenant_profile),
--             04_tables/003a_master_identity.sql (principal_profile)

-- ════════════════════════════════════════════════════════════════════════════
-- master.v_effective_principal_ui
-- ════════════════════════════════════════════════════════════════════════════
-- Applies the UI settings resolution cascade:
--   platform default → master.tenant_profile → master.principal_ui_profile
--
-- Used by API endpoints and reporting. Callers read this view instead of
-- manually joining the three source tables.
--
-- Security: SECURITY INVOKER (default). RLS on principal_ui_profile and
-- principal_profile applies to the calling session. Admin sessions see all.

DROP VIEW IF EXISTS master.v_effective_principal_ui;
CREATE OR REPLACE VIEW master.v_effective_principal_ui AS
SELECT
    p.id                    AS principal_id,
    p.tenant_id,

    -- Locale chain: principal_ui_profile → tenant_profile → platform default
    COALESCE(pui.locale_code,   tp.locale_code,   'en')       AS locale_code,
    COALESCE(pui.language_code, tp.language_code,  'en')       AS language_code,
    COALESCE(pui.timezone_code, tp.timezone_code,  'UTC')      AS timezone_code,
    COALESCE(pui.date_format,   tp.date_format,   '%Y-%m-%d') AS date_format,
    COALESCE(pui.number_format, tp.number_format)              AS number_format,
    COALESCE(pui.week_start,    tp.week_start,    1)           AS week_start,

    -- Appearance (principal-level only — no tenant defaults for these columns)
    COALESCE(pui.appearance_mode, 'system')                    AS appearance_mode,
    COALESCE(pui.density_code,    'comfortable')               AS density_code,

    -- Navigation defaults
    pui.home_workspace_code,
    pui.home_module_code,

    -- Working-context defaults: UI-level overrides → principal_profile HR/operational fallback
    COALESCE(pui.default_company_code_id, pp.default_company_code_id) AS default_company_code_id,
    pui.default_book_id,
    pui.default_dashboard_id

FROM master.principal p
LEFT JOIN master.principal_profile    pp  ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
LEFT JOIN master.principal_ui_profile pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
LEFT JOIN master.tenant_profile       tp  ON tp.tenant_id = p.tenant_id
WHERE p.status = 'active';

COMMENT ON VIEW master.v_effective_principal_ui IS
    'Effective UI settings for active principals. Applies resolution cascade: '
    'platform default → tenant_profile → principal_ui_profile. '
    'Appearance (appearance_mode, density_code) defaults are system/comfortable '
    '— no tenant-level column for these. '
    'Working-context defaults fall back to principal_profile (HR/operational defaults). '
    'SECURITY INVOKER — RLS on base tables applies to the calling session.';
