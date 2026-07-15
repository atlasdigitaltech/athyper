-- Phase 1 P2P canonical reset
--
-- This prototype fixture targeted the pre-reset commitment_procurement model and
-- legacy header number/location/cache columns. It is intentionally disabled for
-- full-reset builds until the demo data is regenerated from the canonical P2P
-- document shape.

DO $$
BEGIN
    RAISE NOTICE 'Skipping 002_asac_p2p_visibility_fixture.sql: disabled by Phase 1 P2P canonical reset.';
END $$;