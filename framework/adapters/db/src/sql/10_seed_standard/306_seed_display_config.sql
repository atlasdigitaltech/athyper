/* ============================================================================
   Athyper — Display Config Migration & Feature Flags Cleanup
   Migrates UI/presentation data from feature_flags to display_config,
   then strips the UI keys from feature_flags.
   Must run AFTER 059_jsonb_validation.sql (schema migration) and
   AFTER 300_meta_entity_registration.sql (initial seed data).

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ============================================================================
-- §1  Migrate treeView + ui from feature_flags → display_config
-- ============================================================================
-- For each entity that has feature_flags containing treeView or ui keys,
-- build a display_config from those keys.

UPDATE meta.entity
SET display_config = (
    CASE
        WHEN feature_flags ? 'treeView' AND feature_flags ? 'ui' THEN
            jsonb_build_object(
                'treeView', feature_flags -> 'treeView',
                'displayFields', feature_flags -> 'ui' -> 'displayFields',
                'sectionOverrides', feature_flags -> 'ui' -> 'sectionOverrides',
                'sectionLabels', feature_flags -> 'ui' -> 'sectionLabels',
                'descriptorOverride', feature_flags -> 'ui' -> 'descriptorOverride'
            )
        WHEN feature_flags ? 'treeView' THEN
            jsonb_build_object('treeView', feature_flags -> 'treeView')
        WHEN feature_flags ? 'ui' THEN
            jsonb_build_object(
                'displayFields', feature_flags -> 'ui' -> 'displayFields',
                'sectionOverrides', feature_flags -> 'ui' -> 'sectionOverrides',
                'sectionLabels', feature_flags -> 'ui' -> 'sectionLabels',
                'descriptorOverride', feature_flags -> 'ui' -> 'descriptorOverride'
            )
    END
)
WHERE feature_flags IS NOT NULL
  AND (feature_flags ? 'treeView' OR feature_flags ? 'ui');

-- Strip null-valued keys from display_config (jsonb_build_object preserves them)
UPDATE meta.entity
SET display_config = (
    SELECT jsonb_object_agg(key, value)
    FROM jsonb_each(display_config)
    WHERE value IS DISTINCT FROM 'null'::jsonb
)
WHERE display_config IS NOT NULL;

-- ============================================================================
-- §2  Migrate groupableFields from feature_flags → display_config
-- ============================================================================

UPDATE meta.entity
SET display_config = COALESCE(display_config, '{}'::jsonb)
    || jsonb_build_object('groupableFields', feature_flags -> 'groupableFields')
WHERE feature_flags IS NOT NULL
  AND feature_flags ? 'groupableFields';

-- ============================================================================
-- §3  Strip UI keys from feature_flags
-- ============================================================================
-- Remove treeView, ui, groupableFields from feature_flags so the CHECK
-- constraint (infrastructure-only keys) passes.

UPDATE meta.entity
SET feature_flags = feature_flags - 'treeView' - 'ui' - 'groupableFields'
WHERE feature_flags IS NOT NULL
  AND (feature_flags ? 'treeView' OR feature_flags ? 'ui' OR feature_flags ? 'groupableFields');

-- If feature_flags is now empty '{}', set it to NULL for cleanliness
UPDATE meta.entity
SET feature_flags = NULL
WHERE feature_flags = '{}'::jsonb;

-- ============================================================================
-- §4  Strip deprecated entity_class key from feature_flags
-- ============================================================================
-- entity_class is now a first-class column (added in Phase 2).

UPDATE meta.entity
SET feature_flags = feature_flags - 'entity_class'
WHERE feature_flags IS NOT NULL
  AND feature_flags ? 'entity_class';

-- Clean up empty again
UPDATE meta.entity
SET feature_flags = NULL
WHERE feature_flags = '{}'::jsonb;

COMMIT;
