/* ============================================================================
   Athyper — Entity UI Profile (satellite table)

   Extracts display/presentation metadata from meta.entity into a dedicated
   satellite table. These columns define how an entity is rendered in the UI
   (nav menus, command palette, list views, detail pages) and have a distinct
   write cadence from core registry columns.

   Columns moved:
     label_singular → entity_ui_profile.label_singular
     label_plural   → entity_ui_profile.label_plural
     description    → entity_ui_profile.description
     icon_key       → entity_ui_profile.icon_key
     color_token    → entity_ui_profile.color_token
     display_config → entity_ui_profile.display_config

   The original columns on meta.entity are NOT dropped (backward compat).
   Reads should prefer entity_ui_profile; the old columns become stale
   and will be dropped in a future migration.

   PostgreSQL 16+
   Depends on: 040_meta.sql, 063_operational_display_datapolicy.sql
   ============================================================================ */

-- ============================================================================
-- 1. CREATE SATELLITE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.entity_ui_profile (
    entity_id        uuid        NOT NULL,
    tenant_id        uuid        NOT NULL,
    label_singular   text,
    label_plural     text,
    description      text,
    icon_key         text,
    color_token      text,
    display_config   jsonb,
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_entity_ui_profile PRIMARY KEY (entity_id),
    CONSTRAINT fk_eup_entity FOREIGN KEY (entity_id)
        REFERENCES meta.entity(id) ON DELETE CASCADE,
    CONSTRAINT fk_eup_tenant FOREIGN KEY (tenant_id)
        REFERENCES core.tenant(id) ON DELETE CASCADE
);

COMMENT ON TABLE meta.entity_ui_profile IS
  'Display/presentation metadata for entities. Defines how an entity appears in nav menus, command palette, list views, and detail pages. Separated from meta.entity to reduce row width and isolate UI concern writes.';

COMMENT ON COLUMN meta.entity_ui_profile.label_singular IS
  'Human-readable singular label for page titles, breadcrumbs, command palette. E.g. "Purchase Invoice". Falls back to entity name if NULL.';
COMMENT ON COLUMN meta.entity_ui_profile.label_plural IS
  'Human-readable plural label for list pages, menus, count badges. E.g. "Purchase Invoices". Falls back to label_singular + "s" heuristic if NULL.';
COMMENT ON COLUMN meta.entity_ui_profile.description IS
  'Brief entity description for admin tooltips, import/export bundles, low-code descriptors, AI-assisted exploration.';
COMMENT ON COLUMN meta.entity_ui_profile.icon_key IS
  'Icon library key for nav menus, command palette, entity cards. E.g. "file-text", "users", "dollar-sign".';
COMMENT ON COLUMN meta.entity_ui_profile.color_token IS
  'Design-system color token for entity badges, charts, dashboards. E.g. "blue-500", "emerald-600".';
COMMENT ON COLUMN meta.entity_ui_profile.display_config IS
  'Display configuration JSONB: { treeView, displayFields, displayTemplate, sectionOverrides, sectionLabels, descriptorOverride, groupableFields, cacheRefLabels }.';

-- Format constraints (mirror those on meta.entity)
ALTER TABLE meta.entity_ui_profile DROP CONSTRAINT IF EXISTS chk_eup_icon_key_format;
ALTER TABLE meta.entity_ui_profile ADD CONSTRAINT chk_eup_icon_key_format
    CHECK (icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$');

ALTER TABLE meta.entity_ui_profile DROP CONSTRAINT IF EXISTS chk_eup_color_token_format;
ALTER TABLE meta.entity_ui_profile ADD CONSTRAINT chk_eup_color_token_format
    CHECK (color_token IS NULL OR color_token ~ '^[a-z][a-z0-9-]*$');

-- display_config structure validation (no subqueries — CHECK constraints cannot use them)
ALTER TABLE meta.entity_ui_profile DROP CONSTRAINT IF EXISTS chk_eup_display_config_structure;
ALTER TABLE meta.entity_ui_profile ADD CONSTRAINT chk_eup_display_config_structure CHECK (
    display_config IS NULL
    OR (
        jsonb_typeof(display_config) = 'object'
        AND (NOT display_config ? 'treeView'       OR jsonb_typeof(display_config -> 'treeView') = 'object')
        AND (NOT display_config ? 'displayFields'  OR jsonb_typeof(display_config -> 'displayFields') = 'array')
        AND (NOT display_config ? 'displayTemplate' OR jsonb_typeof(display_config -> 'displayTemplate') = 'string')
        AND (NOT display_config ? 'sectionOverrides' OR jsonb_typeof(display_config -> 'sectionOverrides') = 'object')
        AND (NOT display_config ? 'sectionLabels'  OR jsonb_typeof(display_config -> 'sectionLabels') = 'object')
        AND (NOT display_config ? 'descriptorOverride' OR jsonb_typeof(display_config -> 'descriptorOverride') = 'object')
        AND (NOT display_config ? 'groupableFields' OR jsonb_typeof(display_config -> 'groupableFields') = 'array')
        AND (NOT display_config ? 'cacheRefLabels' OR jsonb_typeof(display_config -> 'cacheRefLabels') = 'boolean')
    )
);

-- display_config key allowlist (trigger-based, since CHECK cannot use subqueries)
CREATE OR REPLACE FUNCTION meta.trg_eup_display_config_key_allowlist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    _allowed text[] := ARRAY[
        'treeView', 'displayFields', 'displayTemplate', 'sectionOverrides',
        'sectionLabels', 'descriptorOverride', 'groupableFields', 'cacheRefLabels'
    ];
    _key text;
BEGIN
    IF NEW.display_config IS NOT NULL THEN
        FOR _key IN SELECT jsonb_object_keys(NEW.display_config) LOOP
            IF _key != ALL(_allowed) THEN
                RAISE EXCEPTION 'entity_ui_profile.display_config contains disallowed key: %', _key;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eup_display_config_key_allowlist ON meta.entity_ui_profile;

CREATE TRIGGER eup_display_config_key_allowlist
    BEFORE INSERT OR UPDATE OF display_config ON meta.entity_ui_profile
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_eup_display_config_key_allowlist();

-- Index for tenant scoping
CREATE INDEX IF NOT EXISTS idx_eup_tenant
    ON meta.entity_ui_profile (tenant_id);

-- ============================================================================
-- 2. BACKFILL FROM meta.entity
-- ============================================================================

INSERT INTO meta.entity_ui_profile (
    entity_id, tenant_id,
    label_singular, label_plural, description,
    icon_key, color_token, display_config, updated_at
)
SELECT
    id, tenant_id,
    label_singular, label_plural, description,
    icon_key, color_token, display_config,
    COALESCE(updated_at, now())
FROM meta.entity
ON CONFLICT (entity_id) DO UPDATE SET
    label_singular = EXCLUDED.label_singular,
    label_plural   = EXCLUDED.label_plural,
    description    = EXCLUDED.description,
    icon_key       = EXCLUDED.icon_key,
    color_token    = EXCLUDED.color_token,
    display_config = EXCLUDED.display_config,
    updated_at     = now();

-- ============================================================================
-- 3. ENSURE ROW EXISTS TRIGGER (auto-create on entity insert)
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_ensure_entity_ui_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO meta.entity_ui_profile (entity_id, tenant_id, updated_at)
    VALUES (NEW.id, NEW.tenant_id, now())
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_entity_ui_profile ON meta.entity;

CREATE TRIGGER ensure_entity_ui_profile
    AFTER INSERT ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_ensure_entity_ui_profile();

COMMENT ON TRIGGER ensure_entity_ui_profile ON meta.entity IS
  'Auto-creates a meta.entity_ui_profile row when a new entity is registered.';

-- ============================================================================
-- 4. DUAL-WRITE TRIGGER (keep legacy columns in sync during migration)
-- ============================================================================
-- When entity_ui_profile is updated, sync back to meta.entity legacy columns
-- so readers that haven't migrated yet still get current data.

CREATE OR REPLACE FUNCTION meta.trg_sync_entity_ui_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE meta.entity
    SET label_singular = NEW.label_singular,
        label_plural   = NEW.label_plural,
        description    = NEW.description,
        icon_key       = NEW.icon_key,
        color_token    = NEW.color_token,
        display_config = NEW.display_config,
        updated_at     = now()
    WHERE id = NEW.entity_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_entity_ui_to_legacy ON meta.entity_ui_profile;

CREATE TRIGGER sync_entity_ui_to_legacy
    AFTER UPDATE ON meta.entity_ui_profile
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_sync_entity_ui_to_legacy();

COMMENT ON TRIGGER sync_entity_ui_to_legacy ON meta.entity_ui_profile IS
  'Dual-write: syncs UI profile changes back to meta.entity legacy columns during migration period.';

-- ============================================================================
-- 5. VIEW: Unified entity + UI profile (convenience)
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_with_ui_profile AS
SELECT
    e.*,
    eup.label_singular  AS eup_label_singular,
    eup.label_plural    AS eup_label_plural,
    eup.description     AS eup_description,
    eup.icon_key        AS eup_icon_key,
    eup.color_token     AS eup_color_token,
    eup.display_config  AS eup_display_config
FROM meta.entity e
LEFT JOIN meta.entity_ui_profile eup ON eup.entity_id = e.id;

COMMENT ON VIEW meta.entity_with_ui_profile IS
  'Convenience view joining meta.entity with meta.entity_ui_profile for admin queries.';
