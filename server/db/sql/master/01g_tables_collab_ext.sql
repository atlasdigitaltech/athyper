-- ============================================================================
-- master/01g_tables_collab_ext.sql
-- Concept: Collaboration Extensions — per-record bookmarks, filter presets
-- Depends on: 01_tables_identity.sql (master.principal)
--
-- Tables:
--   master.record_bookmark   — per-principal starred records (cross-entity)
--   master.filter_preset     — named filter-only presets per entity per user
--
-- RLS policy (applied in 08_rls/): tenant_id = current_setting('app.tenant_id')
-- FKs → 06_constraints/01g_collab_ext.sql
-- Indexes → below (inline; no heavy join indexes needed for these tables)
-- ============================================================================


-- ============================================================================
-- §1  master.record_bookmark — per-principal starred / bookmarked records
-- ============================================================================
-- Toggle semantics: upsert (INSERT ON CONFLICT DO NOTHING) or DELETE.
-- Handled at the application layer — no soft-delete column needed.
-- Queried in two patterns:
--   1. Batch membership check: is record_id in my bookmarks?  (lookup_idx)
--   2. Virtual filter join:   which records has any user bookmarked? (record_idx)

CREATE TABLE IF NOT EXISTS master.record_bookmark (
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id     uuid        NOT NULL,
    principal_id  uuid        NOT NULL,
    entity_code   text        NOT NULL,
    record_id     uuid        NOT NULL,
    display_name  text,
    record_code   text,
    created_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT record_bookmark_pkey   PRIMARY KEY (id),
    CONSTRAINT record_bookmark_unique UNIQUE (tenant_id, principal_id, entity_code, record_id),
    CONSTRAINT record_bookmark_entity_code_length
        CHECK (char_length(entity_code) BETWEEN 1 AND 120),
    CONSTRAINT record_bookmark_record_id_nonempty
        CHECK (record_id IS NOT NULL)
);

ALTER TABLE master.record_bookmark
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS record_code text;

-- Pattern 1: O(1) membership check — "has principal P bookmarked record R?"
CREATE INDEX IF NOT EXISTS record_bookmark_lookup_idx
    ON master.record_bookmark (tenant_id, principal_id, entity_code, record_id);

-- Pattern 2: batch-fetch all bookmark IDs for a principal+entity page
CREATE INDEX IF NOT EXISTS record_bookmark_principal_entity_idx
    ON master.record_bookmark (tenant_id, principal_id, entity_code);


-- ============================================================================
-- §2  master.filter_preset — named filter-only presets per user per entity
-- ============================================================================
-- Distinct from saved_view: stores ONLY the filter state (EntityListFilters JSON),
-- not view mode, sort, columns, or page. Presets are personal by default;
-- is_shared = true makes them visible to all tenant members for that entity.
--
-- Applying a preset writes ?filter.* URL params only — it does not affect
-- saved_view.query or the rest of EntityListQueryState.

CREATE TABLE IF NOT EXISTS master.filter_preset (
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id     uuid        NOT NULL,
    principal_id  uuid        NOT NULL,
    entity_code   text        NOT NULL,
    name          text        NOT NULL,
    filters       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_shared     boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz,
    created_by    uuid        NOT NULL,
    updated_by    uuid,

    CONSTRAINT filter_preset_pkey        PRIMARY KEY (id),
    CONSTRAINT filter_preset_name_unique UNIQUE (tenant_id, principal_id, entity_code, name),
    CONSTRAINT filter_preset_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT filter_preset_entity_code_length
        CHECK (char_length(entity_code) BETWEEN 1 AND 120)
);

-- Fetch own presets + shared presets for an entity in one query
CREATE INDEX IF NOT EXISTS filter_preset_entity_idx
    ON master.filter_preset (tenant_id, entity_code)
    WHERE is_shared = true;

CREATE INDEX IF NOT EXISTS filter_preset_principal_idx
    ON master.filter_preset (tenant_id, principal_id, entity_code);
