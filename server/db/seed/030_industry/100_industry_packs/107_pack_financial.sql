-- ============================================================================
-- INDUSTRY PACK - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     107_pack_financial.sql
-- Purpose:  Retired compatibility slot. Industry-specific procurement taxonomy
--           now resolves through master.commodity_category and commodity policy
--           tables.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[107_pack_financial] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;