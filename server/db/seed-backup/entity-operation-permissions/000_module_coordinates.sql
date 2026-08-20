-- Canonical module coordinates are published by each plane's Wave 2 platform
-- catalog. Consumer permission packs must not create catalog rows.
DO $$
BEGIN
    IF (SELECT count(*) FROM control.module WHERE code IN ('rel','int') AND status='active') <> 2 THEN
        RAISE EXCEPTION '[P5-E2] active control.module REL and INT coordinates are required';
    END IF;
END;
$$;
