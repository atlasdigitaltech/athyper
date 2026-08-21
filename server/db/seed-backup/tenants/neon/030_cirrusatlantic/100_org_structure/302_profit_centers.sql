-- ============================================================================
-- CIRRUSATLANTIC - PROFIT CENTERS
-- ============================================================================
-- Universal profit centers are seeded by:
--   seed/blueprints/universal/060_org_structure/302_profit_centers.sql
--
-- Keep this file as an idempotent compatibility placeholder so tenant folders
-- can share the same numbered onboarding layout without carrying bespoke rows.
-- ============================================================================

DO $catl_pc$
BEGIN
    RAISE NOTICE '[302_profit_centers] no-op; universal profit centers are seeded by blueprints/universal/060_org_structure/302_profit_centers.sql';
END $catl_pc$;
