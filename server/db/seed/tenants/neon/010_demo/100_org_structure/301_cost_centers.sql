-- ============================================================================
-- 301_cost_centers.sql - UNIVERSAL HANDOFF PLACEHOLDER
-- ============================================================================
-- Cost centers are now seeded from the tenant-neutral template:
--   seed/blueprints/universal/060_org_structure/301_cost_centers.sql
--
-- Industry-specific cost-center leaves are added by:
--   seed/blueprints/industry/200_org_structure/000_industry_org_templates.sql
--
-- This tenant-local file is intentionally a no-op so the demo tenant does not
-- carry a forked copy of universal org logic.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[301_cost_centers] no-op; universal cost centers are seeded by blueprints/universal/060_org_structure/301_cost_centers.sql';
END $seed$;
