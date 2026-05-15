-- ============================================================================
-- 302_profit_centers.sql - UNIVERSAL HANDOFF PLACEHOLDER
-- ============================================================================
-- Profit centers are now seeded from the tenant-neutral template:
--   seed/020_universal/060_org_structure/302_profit_centers.sql
--
-- Industry-specific profit-center leaves are added by:
--   seed/030_industry/200_org_structure/000_industry_org_templates.sql
--
-- This tenant-local file is intentionally a no-op so the demo tenant does not
-- carry hard-coded company/industry mappings inside a file named "universal".
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[302_profit_centers] no-op; universal profit centers are seeded by 020_universal/060_org_structure/302_profit_centers.sql';
END $seed$;
