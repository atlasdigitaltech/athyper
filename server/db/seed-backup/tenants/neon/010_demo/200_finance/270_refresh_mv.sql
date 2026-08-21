-- ============================================================================
-- ATHYPER GROUP — REFRESH MATERIALIZED VIEW
-- ============================================================================
-- File:     270_refresh_mv.sql
-- Purpose:  Refresh mv_company_postable_account after all GL seeds complete
-- Depends:  199-250 (all GL layers)
-- Spec ref: §24 COA/GL Execution Order
-- ============================================================================
-- This MUST run after all Layer 1-4 files and company_gl_controls.
-- The MV starts WITH NO DATA — this is the first population.
-- ============================================================================

REFRESH MATERIALIZED VIEW master.mv_company_postable_account;

-- Verify the MV has data
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
