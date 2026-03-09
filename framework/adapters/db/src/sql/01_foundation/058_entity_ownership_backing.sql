/* ============================================================================
   Athyper — Entity Ownership, Mutability & Backing Type
   Adds governance controls for who owns an entity definition, what mutations
   are allowed, and what physical object backs the entity.

   ownership_model — who owns the entity definition:
     system    : seeded by platform migrations, replicated to all tenants
     tenant    : created by tenant admin via Schema Manager
     package   : provided by an installable module/package
     overlay   : exists only as an overlay extension of a base entity

   mutability — what changes are allowed to the entity schema:
     locked     : read-only, no modifications (core reference data)
     controlled : extend via overlays only, base schema immutable
     extensible : add fields/relations/indexes freely, base fields protected
     forkable   : can be fully forked into a tenant-owned copy

   backing_type — what kind of physical object backs the entity:
     table             : standard PostgreSQL table (default, vast majority)
     view              : SQL view (read-only or updatable)
     materialized_view : materialized view (refresh-based read model)
     virtual           : no physical backing, computed at runtime
     external          : backed by external system (API federation)
     event_stream      : event log/stream backing (reserved)

   mapping_mode expansion:
     derived : physical store derived from other entities' data (views, mat views)

   PostgreSQL 16+
   Depends on: 040_meta.sql, 050_entity_identity_strengthening.sql
   ============================================================================ */

-- ============================================================================
-- 1. OWNERSHIP MODEL
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS ownership_model text NOT NULL DEFAULT 'system';

COMMENT ON COLUMN meta.entity.ownership_model IS
  'Who owns this entity definition: system (platform-seeded), tenant (admin-created), package (module-provided), overlay (overlay-only extension).';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_ownership_model;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_ownership_model
    CHECK (ownership_model IN ('system', 'tenant', 'package', 'overlay'));

-- ============================================================================
-- 2. MUTABILITY
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS mutability text NOT NULL DEFAULT 'controlled';

COMMENT ON COLUMN meta.entity.mutability IS
  'Schema mutability level: locked (no changes), controlled (overlays only), extensible (add freely, base protected), forkable (can fork to tenant copy).';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_mutability;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_mutability
    CHECK (mutability IN ('locked', 'controlled', 'extensible', 'forkable'));

-- Index for filtering by ownership (admin UI, package management)
CREATE INDEX IF NOT EXISTS idx_entity_ownership
    ON meta.entity (tenant_id, ownership_model);

-- ============================================================================
-- 3. BACKING TYPE
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS backing_type text NOT NULL DEFAULT 'table';

COMMENT ON COLUMN meta.entity.backing_type IS
  'Physical backing object: table (PG table), view (SQL view), materialized_view (mat view), virtual (computed), external (API federation), event_stream (reserved).';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_backing_type;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_backing_type
    CHECK (backing_type IN ('table', 'view', 'materialized_view', 'virtual', 'external', 'event_stream'));

-- ============================================================================
-- 4. EXPAND mapping_mode TO INCLUDE 'derived'
-- ============================================================================
-- 'derived' is for entities whose physical store is derived from other entities'
-- data (views, materialized views that aggregate/transform source tables).

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_entity_mapping_mode') THEN
        ALTER TABLE meta.entity DROP CONSTRAINT chk_entity_mapping_mode;
    END IF;
    ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_mapping_mode
        CHECK (mapping_mode IN ('exclusive', 'shared', 'virtual', 'derived'));
EXCEPTION WHEN others THEN NULL;
END $$;

COMMENT ON COLUMN meta.entity.mapping_mode IS
  'Physical table mapping: exclusive (1:1), shared (multi-entity per table), virtual (no table), derived (store derived from other entities).';

-- ============================================================================
-- 5. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code (immutable), name (display), slug (routing), entity_short (alias). Classification: kind (domain) + entity_class (behavior). Lifecycle: status. Ownership: ownership_model + mutability. Physical: backing_type + mapping_mode. Governance, feature flags, version links.';
