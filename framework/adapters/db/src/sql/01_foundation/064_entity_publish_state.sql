/* ============================================================================
   Athyper — Entity Publish State (satellite table)

   Extracts operational/deployment metadata from meta.entity into a dedicated
   satellite table. These columns are system-written on every publish/compile
   and have a different write cadence from admin-edited registry columns.

   Separating them eliminates row-level contention between the publish pipeline
   and admin edits on meta.entity.

   Columns moved:
     published_version_id  → entity_publish_state.published_version_id
     last_compiled_at      → entity_publish_state.last_compiled_at
     last_compiled_hash    → entity_publish_state.last_compiled_hash
     last_schema_change_at → entity_publish_state.last_schema_change_at
     provenance            → entity_publish_state.provenance

   The original columns on meta.entity are NOT dropped (backward compat).
   The trigger is retargeted to write to entity_publish_state instead.
   Reads should prefer entity_publish_state; the old columns become stale
   and will be dropped in a future migration.

   PostgreSQL 16+
   Depends on: 040_meta.sql, 063_operational_display_datapolicy.sql
   ============================================================================ */

-- ============================================================================
-- 1. CREATE SATELLITE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.entity_publish_state (
    entity_id               uuid        NOT NULL,
    tenant_id               uuid        NOT NULL,
    published_version_id    uuid,
    last_compiled_at        timestamptz,
    last_compiled_hash      text,
    last_schema_change_at   timestamptz,
    provenance              jsonb,
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_entity_publish_state PRIMARY KEY (entity_id),
    CONSTRAINT fk_eps_entity FOREIGN KEY (entity_id)
        REFERENCES meta.entity(id) ON DELETE CASCADE,
    CONSTRAINT fk_eps_tenant FOREIGN KEY (tenant_id)
        REFERENCES core.tenant(id) ON DELETE CASCADE,
    CONSTRAINT fk_eps_published_version FOREIGN KEY (published_version_id)
        REFERENCES meta.entity_version(id) ON DELETE SET NULL
);

COMMENT ON TABLE meta.entity_publish_state IS
  'Operational/deployment metadata for entities. System-written by publish/compile pipeline. Separated from meta.entity to eliminate write contention with admin edits.';

COMMENT ON COLUMN meta.entity_publish_state.published_version_id IS
  'Fast pointer to the current published entity_version. NULL = no published version.';
COMMENT ON COLUMN meta.entity_publish_state.last_compiled_at IS
  'Timestamp of the most recent successful compilation.';
COMMENT ON COLUMN meta.entity_publish_state.last_compiled_hash IS
  'Hash of the most recent compiled snapshot. Enables staleness checks without loading compiled_json.';
COMMENT ON COLUMN meta.entity_publish_state.last_schema_change_at IS
  'Timestamp of the most recent field/relation/index change.';
COMMENT ON COLUMN meta.entity_publish_state.provenance IS
  'Deployment/package provenance: { source_package, source_version, introduced_in_release, deprecated_in_release }.';

-- Index for reverse lookup (find entity by published version)
CREATE INDEX IF NOT EXISTS idx_eps_published_version
    ON meta.entity_publish_state (published_version_id)
    WHERE published_version_id IS NOT NULL;

-- Index for tenant scoping
CREATE INDEX IF NOT EXISTS idx_eps_tenant
    ON meta.entity_publish_state (tenant_id);

-- Provenance validation (mirrors 063 constraint)
ALTER TABLE meta.entity_publish_state DROP CONSTRAINT IF EXISTS chk_eps_provenance_structure;
ALTER TABLE meta.entity_publish_state ADD CONSTRAINT chk_eps_provenance_structure CHECK (
    provenance IS NULL
    OR (
        jsonb_typeof(provenance) = 'object'
        AND (NOT provenance ? 'source_package' OR jsonb_typeof(provenance -> 'source_package') = 'string')
        AND (NOT provenance ? 'source_version' OR jsonb_typeof(provenance -> 'source_version') = 'string')
        AND (NOT provenance ? 'introduced_in_release' OR jsonb_typeof(provenance -> 'introduced_in_release') = 'string')
        AND (NOT provenance ? 'deprecated_in_release' OR jsonb_typeof(provenance -> 'deprecated_in_release') = 'string')
    )
);

-- ============================================================================
-- 2. BACKFILL FROM meta.entity
-- ============================================================================

INSERT INTO meta.entity_publish_state (
    entity_id, tenant_id,
    published_version_id, last_compiled_at, last_compiled_hash,
    last_schema_change_at, provenance, updated_at
)
SELECT
    id, tenant_id,
    published_version_id, last_compiled_at, last_compiled_hash,
    last_schema_change_at, provenance, COALESCE(updated_at, now())
FROM meta.entity
ON CONFLICT (entity_id) DO UPDATE SET
    published_version_id  = EXCLUDED.published_version_id,
    last_compiled_at      = EXCLUDED.last_compiled_at,
    last_compiled_hash    = EXCLUDED.last_compiled_hash,
    last_schema_change_at = EXCLUDED.last_schema_change_at,
    provenance            = EXCLUDED.provenance,
    updated_at            = now();

-- ============================================================================
-- 3. ENSURE ROW EXISTS TRIGGER (auto-create on entity insert)
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_ensure_entity_publish_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO meta.entity_publish_state (entity_id, tenant_id, updated_at)
    VALUES (NEW.id, NEW.tenant_id, now())
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_entity_publish_state ON meta.entity;

CREATE TRIGGER ensure_entity_publish_state
    AFTER INSERT ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_ensure_entity_publish_state();

COMMENT ON TRIGGER ensure_entity_publish_state ON meta.entity IS
  'Auto-creates a meta.entity_publish_state row when a new entity is registered.';

-- ============================================================================
-- 4. RETARGET published_version_id TRIGGER
-- ============================================================================
-- The original trigger (from 063) writes to meta.entity.published_version_id.
-- We replace it to write to meta.entity_publish_state instead.
-- The old column on meta.entity is left as-is for backward compat (stale read).

CREATE OR REPLACE FUNCTION meta.trg_sync_published_version_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Version just became published → set pointer
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'published') THEN
        -- Write to satellite table (authoritative)
        INSERT INTO meta.entity_publish_state (entity_id, tenant_id, published_version_id, updated_at)
        VALUES (NEW.entity_id, NEW.tenant_id, NEW.id, now())
        ON CONFLICT (entity_id) DO UPDATE SET
            published_version_id = EXCLUDED.published_version_id,
            updated_at = now();

        -- Keep legacy column in sync (will be dropped in future migration)
        UPDATE meta.entity
        SET published_version_id = NEW.id,
            updated_at = now()
        WHERE id = NEW.entity_id;
        RETURN NEW;
    END IF;

    -- Version just left published state → clear pointer if it was this version
    IF OLD IS NOT NULL AND OLD.status = 'published' AND NEW.status IS DISTINCT FROM 'published' THEN
        UPDATE meta.entity_publish_state
        SET published_version_id = NULL,
            updated_at = now()
        WHERE entity_id = NEW.entity_id
          AND published_version_id = OLD.id;

        -- Keep legacy column in sync
        UPDATE meta.entity
        SET published_version_id = NULL,
            updated_at = now()
        WHERE id = NEW.entity_id
          AND published_version_id = OLD.id;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger already exists from 063; function replacement takes effect automatically.

-- ============================================================================
-- 5. VIEW: Unified entity + publish state (convenience for admin queries)
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_with_publish_state AS
SELECT
    e.*,
    eps.published_version_id  AS eps_published_version_id,
    eps.last_compiled_at      AS eps_last_compiled_at,
    eps.last_compiled_hash    AS eps_last_compiled_hash,
    eps.last_schema_change_at AS eps_last_schema_change_at,
    eps.provenance            AS eps_provenance
FROM meta.entity e
LEFT JOIN meta.entity_publish_state eps ON eps.entity_id = e.id;

COMMENT ON VIEW meta.entity_with_publish_state IS
  'Convenience view joining meta.entity with meta.entity_publish_state for admin queries.';
