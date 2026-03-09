/* ============================================================================
   Athyper — Operational Metadata, Display Metadata & Data Policy
   Adds three categories of enterprise-grade metadata to meta.entity:

   A. Operational / Deployment metadata:
      published_version_id  — fast pointer to current published version (avoids joins)
      last_compiled_at      — cache invalidation, admin diagnostics
      last_compiled_hash    — staleness checks without loading compiled_json
      last_schema_change_at — drift analysis, cache busting
      provenance            — deployment tracking (source_package, source_version,
                              introduced_in_release, deprecated_in_release)

   B. Display metadata (canonical presentation layer):
      label_singular — "Purchase Invoice" (not derived from PascalCase)
      label_plural   — "Purchase Invoices"
      description    — admin/tooltip/low-code descriptor
      icon_key       — icon library key for nav/command palette
      color_token    — design-system color token for badges/charts

   C. Data policy flags:
      data_policy jsonb — soft_delete, append_only, temporal, immutable_after_state

   PostgreSQL 16+
   Depends on: 040_meta.sql, 050_entity_identity_strengthening.sql
   ============================================================================ */

-- ============================================================================
-- A0. DATA CLEANUP: Migrate stale keys from feature_flags → display_config
-- ============================================================================
-- Prior to display_config split, some entities had "ui", "treeView", and
-- "entity_class" keys in feature_flags. Temporarily disable the JSONB key
-- allowlist trigger to allow the cleanup UPDATE to proceed.

-- Disable the trigger during cleanup
ALTER TABLE meta.entity DISABLE TRIGGER entity_jsonb_key_allowlist;

-- Migrate treeView from feature_flags to display_config (single pass)
UPDATE meta.entity
SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object('treeView', feature_flags -> 'treeView'),
    feature_flags = feature_flags - 'treeView' - 'ui' - 'entity_class'
WHERE feature_flags IS NOT NULL
  AND feature_flags ? 'treeView'
  AND (display_config IS NULL OR NOT display_config ? 'treeView');

-- Remove remaining stale keys from rows without treeView
UPDATE meta.entity
SET feature_flags = feature_flags - 'ui' - 'entity_class' - 'treeView'
WHERE feature_flags IS NOT NULL
  AND (feature_flags ? 'ui' OR feature_flags ? 'entity_class' OR feature_flags ? 'treeView');

-- Clean up empty feature_flags objects
UPDATE meta.entity
SET feature_flags = NULL
WHERE feature_flags = '{}'::jsonb;

-- Re-enable the trigger
ALTER TABLE meta.entity ENABLE TRIGGER entity_jsonb_key_allowlist;

-- ============================================================================
-- A1. PUBLISHED VERSION FAST POINTER
-- ============================================================================
-- Avoids the repeated join: entity_version WHERE entity_id = ? AND status = 'published'
-- Maintained by a trigger on meta.entity_version (see section A5 below).

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS published_version_id uuid;

-- FK to entity_version (nullable — NULL means no published version yet)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_entity_published_version'
    ) THEN
        ALTER TABLE meta.entity
            ADD CONSTRAINT fk_entity_published_version
            FOREIGN KEY (published_version_id)
            REFERENCES meta.entity_version(id)
            ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'fk_entity_published_version: %', SQLERRM;
END $$;

COMMENT ON COLUMN meta.entity.published_version_id IS
  'Fast pointer to the current published entity_version. NULL = no published version. Maintained by trigger on entity_version status changes.';

-- Index for reverse lookup (find entity by published version)
CREATE INDEX IF NOT EXISTS idx_entity_published_version
    ON meta.entity (published_version_id) WHERE published_version_id IS NOT NULL;

-- ============================================================================
-- A2. COMPILATION TRACKING
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS last_compiled_at timestamptz;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS last_compiled_hash text;

COMMENT ON COLUMN meta.entity.last_compiled_at IS
  'Timestamp of the most recent successful compilation. Used for cache invalidation and admin diagnostics.';
COMMENT ON COLUMN meta.entity.last_compiled_hash IS
  'Hash of the most recent compiled snapshot. Enables staleness checks without loading compiled_json.';

-- ============================================================================
-- A3. SCHEMA CHANGE TRACKING
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS last_schema_change_at timestamptz;

COMMENT ON COLUMN meta.entity.last_schema_change_at IS
  'Timestamp of the most recent field/relation/index change. Used for drift analysis and cache busting.';

-- ============================================================================
-- A4. PROVENANCE (DEPLOYMENT METADATA)
-- ============================================================================
-- Only relevant for system/package entities. Tenant-created entities will have NULL.

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS provenance jsonb;

COMMENT ON COLUMN meta.entity.provenance IS
  'Deployment/package provenance: { source_package, source_version, introduced_in_release, deprecated_in_release }. NULL for tenant-created entities.';

-- Structural validation (type checks only — key allowlist enforced by trigger)
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_provenance_structure;
ALTER TABLE meta.entity ADD CONSTRAINT chk_provenance_structure CHECK (
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
-- A5. TRIGGER: Maintain published_version_id on entity_version status changes
-- ============================================================================
-- When a version transitions to 'published', update the parent entity's pointer.
-- When a version transitions away from 'published' (archived), clear the pointer
-- if it was pointing to that version.

CREATE OR REPLACE FUNCTION meta.trg_sync_published_version_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Version just became published → set pointer on parent entity
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'published') THEN
        UPDATE meta.entity
        SET published_version_id = NEW.id,
            updated_at = now()
        WHERE id = NEW.entity_id;
        RETURN NEW;
    END IF;

    -- Version just left published state → clear pointer if it was this version
    IF OLD IS NOT NULL AND OLD.status = 'published' AND NEW.status IS DISTINCT FROM 'published' THEN
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

DROP TRIGGER IF EXISTS sync_published_version_id ON meta.entity_version;

CREATE TRIGGER sync_published_version_id
    AFTER INSERT OR UPDATE OF status ON meta.entity_version
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_sync_published_version_id();

COMMENT ON TRIGGER sync_published_version_id ON meta.entity_version IS
  'Maintains meta.entity.published_version_id as a denormalized pointer to the current published version.';

-- Backfill existing published versions
UPDATE meta.entity e
SET published_version_id = (
    SELECT ev.id FROM meta.entity_version ev
    WHERE ev.entity_id = e.id AND ev.status = 'published'
    LIMIT 1
)
WHERE e.published_version_id IS NULL
  AND EXISTS (
    SELECT 1 FROM meta.entity_version ev
    WHERE ev.entity_id = e.id AND ev.status = 'published'
);

-- ============================================================================
-- B1. DISPLAY METADATA — CANONICAL PRESENTATION LAYER
-- ============================================================================
-- First-class columns because they're used in list APIs, nav rendering,
-- command palette, breadcrumbs — all hot paths.

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS label_singular text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS label_plural text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS icon_key text;
ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS color_token text;

COMMENT ON COLUMN meta.entity.label_singular IS
  'Human-readable singular label for page titles, breadcrumbs, command palette. E.g. "Purchase Invoice". Falls back to name if NULL.';
COMMENT ON COLUMN meta.entity.label_plural IS
  'Human-readable plural label for list pages, menus, count badges. E.g. "Purchase Invoices". Falls back to label_singular + "s" heuristic if NULL.';
COMMENT ON COLUMN meta.entity.description IS
  'Brief entity description for admin tooltips, import/export bundles, low-code descriptors, AI-assisted exploration.';
COMMENT ON COLUMN meta.entity.icon_key IS
  'Icon library key for nav menus, command palette, entity cards. E.g. "file-text", "users", "dollar-sign".';
COMMENT ON COLUMN meta.entity.color_token IS
  'Design-system color token for entity badges, charts, dashboards. E.g. "blue-500", "emerald-600".';

-- icon_key format: lowercase alphanumeric + hyphens (icon library convention)
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_icon_key_format;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_icon_key_format
    CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$');

-- color_token format: lowercase alphanumeric + hyphens (design token convention)
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_color_token_format;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_color_token_format
    CHECK (color_token IS NULL OR color_token ~ '^[a-z][a-z0-9-]*$');

-- ============================================================================
-- C1. DATA POLICY FLAGS
-- ============================================================================
-- Behavioral data-layer policy for soft-delete, append-only, temporal dating,
-- and state-based immutability. Critical for fin, doc, and audit-heavy entities.

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS data_policy jsonb;

COMMENT ON COLUMN meta.entity.data_policy IS
  'Data-layer behavioral policy: { soft_delete (boolean), append_only (boolean), temporal (boolean), immutable_after_state (string) }. Drives runtime insert/update/delete guards.';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_data_policy_structure;
ALTER TABLE meta.entity ADD CONSTRAINT chk_data_policy_structure CHECK (
    data_policy IS NULL
    OR (
        jsonb_typeof(data_policy) = 'object'
        AND (NOT data_policy ? 'soft_delete' OR jsonb_typeof(data_policy -> 'soft_delete') = 'boolean')
        AND (NOT data_policy ? 'append_only' OR jsonb_typeof(data_policy -> 'append_only') = 'boolean')
        AND (NOT data_policy ? 'temporal' OR jsonb_typeof(data_policy -> 'temporal') = 'boolean')
        AND (NOT data_policy ? 'immutable_after_state' OR jsonb_typeof(data_policy -> 'immutable_after_state') = 'string')
    )
);

-- ============================================================================
-- C2. EXTEND JSONB KEY ALLOWLIST TRIGGER (from 059) to cover provenance + data_policy
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_entity_jsonb_key_allowlist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    bad_key text;
BEGIN
    -- naming_policy key allowlist
    IF NEW.naming_policy IS NOT NULL THEN
        SELECT k INTO bad_key FROM jsonb_object_keys(NEW.naming_policy) k
        WHERE k NOT IN ('code', 'pattern', 'reset_policy', 'seq_start', 'seq_increment', 'is_active')
        LIMIT 1;
        IF bad_key IS NOT NULL THEN
            RAISE EXCEPTION 'JSONB_KEY_CHECK: naming_policy contains unknown key "%"', bad_key
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- feature_flags key allowlist
    IF NEW.feature_flags IS NOT NULL THEN
        SELECT k INTO bad_key FROM jsonb_object_keys(NEW.feature_flags) k
        WHERE k NOT IN (
            'approval_required', 'numbering_enabled',
            'effective_dating_enabled', 'versioning_mode',
            'fields', 'relations', 'indexes', 'compiledModel',
            'permissionPolicies', 'fieldSecurity', 'lifecycle', 'overlays',
            'numbering', 'approvals', 'effectiveDating', 'audit'
        )
        LIMIT 1;
        IF bad_key IS NOT NULL THEN
            RAISE EXCEPTION 'JSONB_KEY_CHECK: feature_flags contains unknown key "%"', bad_key
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- display_config key allowlist
    IF NEW.display_config IS NOT NULL THEN
        SELECT k INTO bad_key FROM jsonb_object_keys(NEW.display_config) k
        WHERE k NOT IN (
            'treeView', 'displayFields', 'displayTemplate', 'sectionOverrides',
            'sectionLabels', 'descriptorOverride', 'groupableFields', 'cacheRefLabels'
        )
        LIMIT 1;
        IF bad_key IS NOT NULL THEN
            RAISE EXCEPTION 'JSONB_KEY_CHECK: display_config contains unknown key "%"', bad_key
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- provenance key allowlist
    IF NEW.provenance IS NOT NULL THEN
        SELECT k INTO bad_key FROM jsonb_object_keys(NEW.provenance) k
        WHERE k NOT IN (
            'source_package', 'source_version',
            'introduced_in_release', 'deprecated_in_release'
        )
        LIMIT 1;
        IF bad_key IS NOT NULL THEN
            RAISE EXCEPTION 'JSONB_KEY_CHECK: provenance contains unknown key "%"', bad_key
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    -- data_policy key allowlist
    IF NEW.data_policy IS NOT NULL THEN
        SELECT k INTO bad_key FROM jsonb_object_keys(NEW.data_policy) k
        WHERE k NOT IN (
            'soft_delete', 'append_only', 'temporal', 'immutable_after_state'
        )
        LIMIT 1;
        IF bad_key IS NOT NULL THEN
            RAISE EXCEPTION 'JSONB_KEY_CHECK: data_policy contains unknown key "%"', bad_key
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger already attached in 059 — CREATE OR REPLACE updated the function body in-place.

-- ============================================================================
-- D. UPDATE MUTABLE COLUMN SET (evolution guard)
-- ============================================================================
-- All new columns are mutable (display/operational metadata changes are safe
-- after publish). They do NOT need evolution guard protection.

-- ============================================================================
-- E. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code, name, slug, entity_short. Classification: kind + entity_class. Lifecycle: status. Ownership: ownership_model + mutability. Physical: backing_type + mapping_mode. Display: label_singular/plural, description, icon_key, color_token. Operational: published_version_id, last_compiled_at/hash, last_schema_change_at, provenance. Config: naming_policy, feature_flags, display_config, identity_config, data_policy. Governance + version links.';
