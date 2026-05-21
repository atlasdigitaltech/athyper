-- ============================================================================
-- INDUSTRY PACK - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     100_pack_utilities.sql
-- Purpose:  Retired compatibility slot. Industry-specific procurement taxonomy
--           now resolves through master.commodity_category and commodity policy
--           tables.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[100_pack_utilities] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;