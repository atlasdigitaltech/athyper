-- ============================================================================
-- CIRRUSATLANTIC - COST CENTERS
-- ============================================================================
-- Universal cost centers are seeded by:
--   seed/blueprints/universal/060_org_structure/301_cost_centers.sql
--
-- Keep this file as an idempotent compatibility placeholder so tenant folders
-- can share the same numbered onboarding layout without carrying bespoke rows.
-- ============================================================================

DO $catl_cc$
BEGIN
    RAISE NOTICE '[301_cost_centers] no-op; universal cost centers are seeded by blueprints/universal/060_org_structure/301_cost_centers.sql';
END $catl_cc$;
