-- ============================================================================
-- INDUSTRY PACK - LEGACY SPEND CATEGORY RETIREMENT
-- ============================================================================
-- File:     103_pack_transport.sql
-- Purpose:  Retired compatibility slot. Industry-specific procurement taxonomy
--           now resolves through master.commodity_category and commodity policy
--           tables.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[103_pack_transport] retired legacy procurement taxonomy pack; commodity_category owns taxonomy';
END
$seed$;