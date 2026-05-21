-- ============================================================================
-- INDUSTRY PACK - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     104_pack_trading.sql
-- Purpose:  Retired compatibility slot. Industry-specific procurement taxonomy
--           now resolves through master.commodity_category and commodity policy
--           tables.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[104_pack_trading] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;