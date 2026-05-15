-- ============================================================================
-- 300_operating_units.sql - RETIRED PLACEHOLDER
-- ============================================================================
-- master.operating_unit has been dropped. Simple org-unit structure is now
-- seeded for every tenant by:
--   seed/020_universal/060_org_structure/300_org_units.sql
--
-- This tenant-local placeholder is retained only for legacy execution-order
-- compatibility. Do not add tenant data here.
-- ============================================================================

DO $seed$
BEGIN
    RAISE NOTICE '[300_operating_units] retired; universal org units are seeded by 020_universal/060_org_structure/300_org_units.sql';
END $seed$;
