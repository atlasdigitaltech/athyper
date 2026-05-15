-- ============================================================================
-- CIRRUSATLANTIC - OPERATING UNITS
-- ============================================================================
-- Universal org units are seeded by:
--   seed/020_universal/060_org_structure/300_org_units.sql
--
-- Keep this file as an idempotent compatibility placeholder so tenant folders
-- can share the same numbered onboarding layout without carrying bespoke rows.
-- ============================================================================

DO $catl_ou$
BEGIN
    RAISE NOTICE '[300_operating_units] no-op; universal org units are seeded by 020_universal/060_org_structure/300_org_units.sql';
END $catl_ou$;
