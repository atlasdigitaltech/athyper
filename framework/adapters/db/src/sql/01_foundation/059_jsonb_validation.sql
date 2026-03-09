/* ============================================================================
   Athyper — JSONB Column Validation & Display Config
   Adds display_config column for UI/presentation hints (split from feature_flags),
   and CHECK constraints on all three JSONB columns: naming_policy, feature_flags,
   display_config.

   Key allowlisting is enforced via a BEFORE INSERT/UPDATE trigger because
   PostgreSQL does not support subqueries (NOT EXISTS) in CHECK constraints.

   display_config — UI/presentation configuration for entity pages:
     treeView       : tree rendering config (parentField, levelField, isGroupField)
     displayFields  : columns shown in reference labels and list summaries
     sectionOverrides : field → section assignment overrides
     sectionLabels  : section code → display label overrides
     descriptorOverride : full entity page descriptor override (advanced)
     groupableFields : explicit opt-in for group-by in list views

   PostgreSQL 16+
   Depends on: 040_meta.sql, 058_entity_ownership_backing.sql
   ============================================================================ */

-- ============================================================================
-- 1. DISPLAY CONFIG COLUMN
-- ============================================================================

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS display_config jsonb;

COMMENT ON COLUMN meta.entity.display_config IS
  'UI/presentation configuration: treeView (hierarchy rendering), displayFields (reference labels), sectionOverrides/sectionLabels (form layout), descriptorOverride (full page descriptor), groupableFields (list group-by opt-in).';

-- ============================================================================
-- 2. NAMING_POLICY VALIDATION (CHECK — type/structure only)
-- ============================================================================

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_naming_policy_structure;
ALTER TABLE meta.entity ADD CONSTRAINT chk_naming_policy_structure CHECK (
    naming_policy IS NULL
    OR (
        jsonb_typeof(naming_policy) = 'object'
        AND naming_policy ? 'pattern'
        AND jsonb_typeof(naming_policy -> 'pattern') = 'string'
        AND (
            NOT naming_policy ? 'reset_policy'
            OR naming_policy ->> 'reset_policy' IN ('none', 'yearly', 'monthly', 'daily')
        )
        AND (
            NOT naming_policy ? 'seq_start'
            OR jsonb_typeof(naming_policy -> 'seq_start') = 'number'
        )
        AND (
            NOT naming_policy ? 'seq_increment'
            OR jsonb_typeof(naming_policy -> 'seq_increment') = 'number'
        )
        AND (
            NOT naming_policy ? 'is_active'
            OR jsonb_typeof(naming_policy -> 'is_active') IN ('boolean', 'null')
        )
        AND (
            NOT naming_policy ? 'code'
            OR jsonb_typeof(naming_policy -> 'code') = 'string'
        )
    )
);

-- ============================================================================
-- 3. FEATURE_FLAGS VALIDATION (CHECK — type/structure only)
-- ============================================================================

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_feature_flags_structure;
ALTER TABLE meta.entity ADD CONSTRAINT chk_feature_flags_structure CHECK (
    feature_flags IS NULL
    OR (
        jsonb_typeof(feature_flags) = 'object'
        AND (
            NOT feature_flags ? 'approval_required'
            OR jsonb_typeof(feature_flags -> 'approval_required') = 'boolean'
        )
        AND (
            NOT feature_flags ? 'numbering_enabled'
            OR jsonb_typeof(feature_flags -> 'numbering_enabled') = 'boolean'
        )
        AND (
            NOT feature_flags ? 'effective_dating_enabled'
            OR jsonb_typeof(feature_flags -> 'effective_dating_enabled') = 'boolean'
        )
        AND (
            NOT feature_flags ? 'versioning_mode'
            OR feature_flags ->> 'versioning_mode' IN ('none', 'sequential', 'major_minor')
        )
        AND (NOT feature_flags ? 'fields' OR jsonb_typeof(feature_flags -> 'fields') = 'boolean')
        AND (NOT feature_flags ? 'relations' OR jsonb_typeof(feature_flags -> 'relations') = 'boolean')
        AND (NOT feature_flags ? 'indexes' OR jsonb_typeof(feature_flags -> 'indexes') = 'boolean')
        AND (NOT feature_flags ? 'compiledModel' OR jsonb_typeof(feature_flags -> 'compiledModel') = 'boolean')
        AND (NOT feature_flags ? 'permissionPolicies' OR jsonb_typeof(feature_flags -> 'permissionPolicies') = 'boolean')
        AND (NOT feature_flags ? 'fieldSecurity' OR jsonb_typeof(feature_flags -> 'fieldSecurity') = 'boolean')
        AND (NOT feature_flags ? 'lifecycle' OR jsonb_typeof(feature_flags -> 'lifecycle') = 'boolean')
        AND (NOT feature_flags ? 'overlays' OR jsonb_typeof(feature_flags -> 'overlays') = 'boolean')
        AND (NOT feature_flags ? 'numbering' OR jsonb_typeof(feature_flags -> 'numbering') = 'boolean')
        AND (NOT feature_flags ? 'approvals' OR jsonb_typeof(feature_flags -> 'approvals') = 'boolean')
        AND (NOT feature_flags ? 'effectiveDating' OR jsonb_typeof(feature_flags -> 'effectiveDating') = 'boolean')
        AND (NOT feature_flags ? 'audit' OR jsonb_typeof(feature_flags -> 'audit') = 'boolean')
    )
);

-- ============================================================================
-- 4. DISPLAY_CONFIG VALIDATION (CHECK — type/structure only)
-- ============================================================================

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_display_config_structure;
ALTER TABLE meta.entity ADD CONSTRAINT chk_display_config_structure CHECK (
    display_config IS NULL
    OR (
        jsonb_typeof(display_config) = 'object'
        AND (
            NOT display_config ? 'treeView'
            OR (
                jsonb_typeof(display_config -> 'treeView') = 'object'
                AND display_config -> 'treeView' ? 'parentField'
                AND jsonb_typeof(display_config -> 'treeView' -> 'parentField') = 'string'
            )
        )
        AND (NOT display_config ? 'displayFields' OR jsonb_typeof(display_config -> 'displayFields') = 'array')
        AND (NOT display_config ? 'sectionOverrides' OR jsonb_typeof(display_config -> 'sectionOverrides') = 'object')
        AND (NOT display_config ? 'sectionLabels' OR jsonb_typeof(display_config -> 'sectionLabels') = 'object')
        AND (NOT display_config ? 'descriptorOverride' OR jsonb_typeof(display_config -> 'descriptorOverride') = 'object')
        AND (NOT display_config ? 'groupableFields' OR jsonb_typeof(display_config -> 'groupableFields') = 'array')
        AND (NOT display_config ? 'cacheRefLabels' OR jsonb_typeof(display_config -> 'cacheRefLabels') = 'boolean')
        AND (NOT display_config ? 'displayTemplate' OR jsonb_typeof(display_config -> 'displayTemplate') = 'string')
    )
);

-- ============================================================================
-- 5. JSONB KEY ALLOWLIST TRIGGER
-- ============================================================================
-- Enforces that JSONB columns only contain allowed top-level keys.
-- PostgreSQL CHECK constraints cannot use subqueries, so we use a trigger.

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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_jsonb_key_allowlist ON meta.entity;

CREATE TRIGGER entity_jsonb_key_allowlist
    BEFORE INSERT OR UPDATE ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_entity_jsonb_key_allowlist();

COMMENT ON TRIGGER entity_jsonb_key_allowlist ON meta.entity IS
  'Enforces allowed top-level keys for naming_policy, feature_flags, and display_config JSONB columns.';

-- ============================================================================
-- 6. UPDATE TABLE COMMENT
-- ============================================================================

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code (immutable), name (display), slug (routing), entity_short (alias). Classification: kind (domain) + entity_class (behavior). Lifecycle: status. Ownership: ownership_model + mutability. Physical: backing_type + mapping_mode. JSONB: naming_policy (numbering), feature_flags (infrastructure), display_config (UI). Governance, feature flags, version links.';
