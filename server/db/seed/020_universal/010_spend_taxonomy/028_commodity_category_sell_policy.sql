-- ============================================================================
-- UNIVERSAL — COMMODITY CATEGORY SELL POLICY
-- ============================================================================
-- File:     028_commodity_category_sell_policy.sql
-- Schema:   control.commodity_category_sell_policy
-- Purpose:  No universal sell policies seeded here.
--           Sell-side policy is domain-specific and owned by industry packs:
--             - Manufactured goods (sell_allowed=true product categories)
--             - Professional services (IT, consulting, engineering)
--             - Contract manufacturing outputs
--           Universal categories have sell_allowed=false on master.commodity_category.
--           Industry packs (e.g. 300_ap_non_po) may set sell_allowed=true and
--           INSERT sell policies for their specific categories.
-- Depends:  023_commodity_category, 021_business_intents
-- Idempotent: Yes — this file makes no changes.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[028_commodity_sell_policy] No universal sell policies — industry packs own sell-side seeding';
END $seed$;
