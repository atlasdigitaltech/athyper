-- ============================================================================
-- shared/01z_three_plane_extensions.sql
-- Concept: Plane-eligibility tag on the permission catalog.
-- Depends on: shared/01_tables.sql (shared.permission)
-- Scope:
--   Every permission declares which of the three product planes (neon, admin,
--   mesh) is allowed to consume it. The resolver filters its candidate set
--   through this column before role/persona/plan evaluation, preventing
--   cross-plane permission leak (e.g. mesh user cannot see JE.POST even if a
--   misconfigured grant exists).
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D8
-- ============================================================================

ALTER TABLE shared.permission
    ADD COLUMN IF NOT EXISTS plane_eligibility text[] NOT NULL DEFAULT ARRAY['neon'];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'permission_plane_eligibility_chk'
          AND conrelid = 'shared.permission'::regclass
    ) THEN
        ALTER TABLE shared.permission
            ADD CONSTRAINT permission_plane_eligibility_chk
            CHECK (cardinality(plane_eligibility) > 0
                   AND plane_eligibility <@ ARRAY['neon','admin','mesh']);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS permission_plane_eligibility_gin
    ON shared.permission USING GIN (plane_eligibility)
    WHERE is_active = true;

COMMENT ON COLUMN shared.permission.plane_eligibility IS
    'Three-plane permission stack: which planes (neon|admin|mesh) may resolve this permission. '
    'Default ARRAY[''neon''] matches historical scope. Resolver filters candidates through this column. '
    'See docs/local/architecture/three-plane-permission-stack.md';
