-- ============================================================================
-- INDUSTRY PACK - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     105_pack_hospitality.sql
-- Purpose:  Retired compatibility slot. Industry-specific procurement taxonomy
--           now resolves through master.commodity_category and commodity policy
--           tables.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[105_pack_hospitality] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;