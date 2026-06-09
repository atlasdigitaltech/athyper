-- ============================================================================
-- UNIVERSAL - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     023b_spend_category.sql
-- Purpose:  Retired compatibility slot. master.commodity_category is seeded by
--           023_commodity_category.sql and now owns procurement taxonomy.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[023b_spend_category] retired; commodity_category seed owns taxonomy';
END
$seed$;
