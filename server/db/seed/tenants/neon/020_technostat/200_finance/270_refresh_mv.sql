-- ============================================================================
-- TECHNOSTAT — REFRESH MATERIALIZED VIEW
-- ============================================================================
-- File:     270_refresh_mv.sql
-- Purpose:  Refresh mv_company_postable_account after all GL seeds complete
-- Depends:  201_company_chart_assignments.sql (all GL layers)
-- ============================================================================
-- Must run before 271_bank_house_config.sql which queries this MV.
-- ============================================================================

REFRESH MATERIALIZED VIEW master.mv_company_postable_account;

DO $check$
DECLARE
    v_count bigint;
BEGIN
    SELECT count(*) INTO v_count FROM master.mv_company_postable_account;
    IF v_count = 0 THEN
        RAISE WARNING '[270_refresh_mv] MV has 0 rows — check chart assignments and GL account status';
    ELSE
        RAISE NOTICE '[270_refresh_mv] MV refreshed: % postable account rows', v_count;
    END IF;
END $check$;
