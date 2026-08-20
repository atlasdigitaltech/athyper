-- ============================================================================
-- CIRRUSATLANTIC — GL PRE-SEED (shared DDL guard)
-- ============================================================================
-- The gl_account unique index and mv_company_postable_account view are shared
-- platform objects created by the demo tenant seed (010_demo/100_org_structure/
-- 199_gl_preseed.sql). This file ensures idempotent re-creation of only the
-- index if it is missing (safe for a fresh DB without the demo tenant).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS gl_account_tenant_code_uq
    ON master.gl_account (tenant_id, code);

DO $catl_gl$
BEGIN
    RAISE NOTICE '[199_gl_preseed] GL account index ensured for CirrusAtlantic';
END $catl_gl$;
