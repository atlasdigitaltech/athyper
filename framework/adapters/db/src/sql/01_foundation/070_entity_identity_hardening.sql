/* ============================================================================
   Athyper — Entity Identity Hardening

   Addresses Architecture Recommendation Matrix P0 items:

   1. Lifecycle binding uses entity_name (text) → add meta_entity_id (UUID FK)
      to meta.entity_lifecycle, core.entity_lifecycle_instance,
      core.entity_lifecycle_event, and wf.* tables for stable identity.

   2. Operational metadata duplication → make entity_publish_state authoritative,
      drop legacy dual-write triggers.

   3. Version status standardization → remove 'published' from CHECK constraint,
      add compatibility mapping view.

   4. Numbering sequence → add meta_entity_id FK alongside entity_name.

   PostgreSQL 16+
   Depends on: 068_governed_versioning.sql, 069_lifecycle_hardening.sql
   ============================================================================ */

-- ============================================================================
-- 1. ADD meta_entity_id FK TO LIFECYCLE & RUNTIME TABLES
-- ============================================================================

-- 1a. meta.entity_lifecycle (definition-time: which lifecycle applies to which entity)
ALTER TABLE meta.entity_lifecycle
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_el_meta_entity') THEN
        ALTER TABLE meta.entity_lifecycle
            ADD CONSTRAINT fk_el_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_el_meta_entity_id
    ON meta.entity_lifecycle (meta_entity_id)
    WHERE meta_entity_id IS NOT NULL;

COMMENT ON COLUMN meta.entity_lifecycle.meta_entity_id IS
  'FK to meta.entity(id). Stable identity for lifecycle binding — immune to entity renames. Backfilled from entity_name.';

-- 1b. meta.entity_lifecycle_route_compiled
ALTER TABLE meta.entity_lifecycle_route_compiled
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_elrc_meta_entity') THEN
        ALTER TABLE meta.entity_lifecycle_route_compiled
            ADD CONSTRAINT fk_elrc_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 1c. core.entity_lifecycle_instance (runtime: current state per record)
ALTER TABLE core.entity_lifecycle_instance
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eli_meta_entity') THEN
        ALTER TABLE core.entity_lifecycle_instance
            ADD CONSTRAINT fk_eli_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eli_meta_entity_id
    ON core.entity_lifecycle_instance (tenant_id, meta_entity_id, entity_id)
    WHERE meta_entity_id IS NOT NULL;

COMMENT ON COLUMN core.entity_lifecycle_instance.meta_entity_id IS
  'FK to meta.entity(id). Stable entity type identity — immune to entity renames.';

-- 1d. core.entity_lifecycle_event (audit trail)
ALTER TABLE core.entity_lifecycle_event
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ele_meta_entity') THEN
        ALTER TABLE core.entity_lifecycle_event
            ADD CONSTRAINT fk_ele_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMENT ON COLUMN core.entity_lifecycle_event.meta_entity_id IS
  'FK to meta.entity(id). Stable identity for historical lifecycle events. SET NULL on entity delete to preserve audit trail.';

-- 1e. wf.approval_instance
ALTER TABLE wf.approval_instance
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ai_meta_entity') THEN
        ALTER TABLE wf.approval_instance
            ADD CONSTRAINT fk_ai_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 1f. wf.lifecycle_timer_schedule
ALTER TABLE wf.lifecycle_timer_schedule
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lts_meta_entity') THEN
        ALTER TABLE wf.lifecycle_timer_schedule
            ADD CONSTRAINT fk_lts_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 1g. meta.numbering_sequence (conditional — table may not exist yet)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'meta' AND table_name = 'numbering_sequence') THEN
        ALTER TABLE meta.numbering_sequence ADD COLUMN IF NOT EXISTS meta_entity_id uuid;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ns_meta_entity') THEN
            ALTER TABLE meta.numbering_sequence
                ADD CONSTRAINT fk_ns_meta_entity
                FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- 1h. audit.permission_decision_log
ALTER TABLE audit.permission_decision_log
    ADD COLUMN IF NOT EXISTS meta_entity_id uuid;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pdl_meta_entity') THEN
        ALTER TABLE audit.permission_decision_log
            ADD CONSTRAINT fk_pdl_meta_entity
            FOREIGN KEY (meta_entity_id) REFERENCES meta.entity(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================================
-- 2. BACKFILL meta_entity_id FROM entity_name
-- ============================================================================

-- Backfill meta_entity_id from entity_name (conditional — column may not exist on all tables)
DO $$ BEGIN
    -- meta.entity_lifecycle
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='meta' AND table_name='entity_lifecycle' AND column_name='entity_name') THEN
        UPDATE meta.entity_lifecycle el SET meta_entity_id = e.id
        FROM meta.entity e WHERE el.entity_name = e.name AND el.tenant_id = e.tenant_id AND el.meta_entity_id IS NULL;
    END IF;

    -- core.entity_lifecycle_instance
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='entity_lifecycle_instance' AND column_name='entity_name') THEN
        UPDATE core.entity_lifecycle_instance eli SET meta_entity_id = e.id
        FROM meta.entity e WHERE eli.entity_name = e.name AND eli.tenant_id = e.tenant_id AND eli.meta_entity_id IS NULL;
    END IF;

    -- core.entity_lifecycle_event
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='entity_lifecycle_event' AND column_name='entity_name') THEN
        UPDATE core.entity_lifecycle_event ele SET meta_entity_id = e.id
        FROM meta.entity e WHERE ele.entity_name = e.name AND ele.tenant_id = e.tenant_id AND ele.meta_entity_id IS NULL;
    END IF;

    -- wf.approval_instance (uses entity_type column with entity_code values)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='wf' AND table_name='approval_instance' AND column_name='entity_type') THEN
        UPDATE wf.approval_instance ai SET meta_entity_id = e.id
        FROM meta.entity e WHERE ai.entity_type = e.entity_code AND ai.tenant_id = e.tenant_id AND ai.meta_entity_id IS NULL;
    END IF;

    -- wf.lifecycle_timer_schedule
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='wf' AND table_name='lifecycle_timer_schedule' AND column_name='entity_name') THEN
        UPDATE wf.lifecycle_timer_schedule lts SET meta_entity_id = e.id
        FROM meta.entity e WHERE lts.entity_name = e.name AND lts.tenant_id = e.tenant_id AND lts.meta_entity_id IS NULL;
    END IF;
END $$;

-- Backfill meta.numbering_sequence (conditional)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'meta' AND table_name = 'numbering_sequence') THEN
        UPDATE meta.numbering_sequence ns
        SET meta_entity_id = e.id
        FROM meta.entity e
        WHERE ns.entity_name = e.name
          AND ns.tenant_id = e.tenant_id
          AND ns.meta_entity_id IS NULL;
    END IF;
END $$;

-- ============================================================================
-- 3. AUTO-POPULATE meta_entity_id ON INSERT (trigger)
-- ============================================================================
-- Resolves meta_entity_id from entity_name when not explicitly provided.

CREATE OR REPLACE FUNCTION meta.trg_resolve_meta_entity_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.meta_entity_id IS NULL AND NEW.entity_name IS NOT NULL THEN
        SELECT id INTO NEW.meta_entity_id
        FROM meta.entity
        WHERE name = NEW.entity_name
          AND tenant_id = NEW.tenant_id
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

-- Apply to lifecycle binding table
DROP TRIGGER IF EXISTS resolve_el_meta_entity_id ON meta.entity_lifecycle;
CREATE TRIGGER resolve_el_meta_entity_id
    BEFORE INSERT OR UPDATE ON meta.entity_lifecycle
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_resolve_meta_entity_id();

-- Apply to runtime instance table
DROP TRIGGER IF EXISTS resolve_eli_meta_entity_id ON core.entity_lifecycle_instance;
CREATE TRIGGER resolve_eli_meta_entity_id
    BEFORE INSERT OR UPDATE ON core.entity_lifecycle_instance
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_resolve_meta_entity_id();

-- Apply to runtime event table
DROP TRIGGER IF EXISTS resolve_ele_meta_entity_id ON core.entity_lifecycle_event;
CREATE TRIGGER resolve_ele_meta_entity_id
    BEFORE INSERT OR UPDATE ON core.entity_lifecycle_event
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_resolve_meta_entity_id();

-- ============================================================================
-- 4. MAKE entity_publish_state AUTHORITATIVE — drop dual-write to legacy columns
-- ============================================================================
-- The trigger trg_sync_published_version_id (from 064) currently writes to both
-- entity_publish_state AND meta.entity.published_version_id.
-- Replace it to only write to entity_publish_state (satellite is now authoritative).

CREATE OR REPLACE FUNCTION meta.trg_sync_published_version_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Version just became published/effective → set pointer
    IF NEW.status IN ('published', 'effective')
       AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status)
    THEN
        INSERT INTO meta.entity_publish_state (entity_id, tenant_id, published_version_id, updated_at)
        VALUES (NEW.entity_id, NEW.tenant_id, NEW.id, now())
        ON CONFLICT (entity_id) DO UPDATE SET
            published_version_id = EXCLUDED.published_version_id,
            updated_at = now();
        RETURN NEW;
    END IF;

    -- Version left published/effective state → clear pointer if it was this version
    IF OLD IS NOT NULL
       AND OLD.status IN ('published', 'effective')
       AND NEW.status NOT IN ('published', 'effective')
    THEN
        UPDATE meta.entity_publish_state
        SET published_version_id = NULL,
            updated_at = now()
        WHERE entity_id = NEW.entity_id
          AND published_version_id = OLD.id;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- NOTE: Legacy columns (meta.entity.published_version_id, last_compiled_at, etc.)
-- are no longer maintained by triggers. They will be dropped in a future migration.
-- All reads should use meta.entity_publish_state or meta.entity_with_publish_state view.

-- ============================================================================
-- 5. VERSION STATUS: Remove 'published' from CHECK (with compat window)
-- ============================================================================
-- 068 already migrated published → effective and kept 'published' in CHECK.
-- Now tighten: new inserts cannot use 'published' status.

-- Drop and recreate the insert guard
CREATE OR REPLACE FUNCTION meta.trg_forbid_published_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'published' THEN
        RAISE EXCEPTION 'Status ''published'' is deprecated. Use ''effective'' for live versions.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forbid_published_status ON meta.entity_version;
CREATE TRIGGER forbid_published_status
    BEFORE INSERT ON meta.entity_version
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_forbid_published_status();

COMMENT ON TRIGGER forbid_published_status ON meta.entity_version IS
  'Prevents new versions from using deprecated ''published'' status. Existing rows are grandfathered until full migration.';

-- ============================================================================
-- 6. CONVENIENCE VIEW: version status compatibility mapping
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_version_effective AS
SELECT
    ev.*,
    CASE ev.status
        WHEN 'published' THEN 'effective'  -- backward compat mapping
        ELSE ev.status
    END AS normalized_status
FROM meta.entity_version ev;

COMMENT ON VIEW meta.entity_version_effective IS
  'Maps legacy ''published'' status to ''effective'' for uniform querying. Use this view during migration period.';
