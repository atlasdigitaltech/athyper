-- Phase B.5 — display_config v2 backfill
-- Adds the six keys introduced in Phase B.5:
--   list_renderer, view_modes, lines_renderer,
--   status_field_names, alternate_flows
-- Also normalises ALL legacy detail_renderer values → canonical three-value set:
--   "master" | "document" | "ledger"
--
-- Legacy aliases handled:
--   "rich_master"  → "master" (richness moves to detail_profile:"rich")
--   "approvable"   → "document" (approval is a behavior flag, not a renderer)
--   "standard"     → "master"
--   "generic"      → "master"
--   "line_item"    → "master" (sub-entity, not a top-level renderer)
--   "distribution" → "master" (sub-entity, not a top-level renderer)
--
-- Idempotent: each statement checks for key presence before mutating.

-- ── Step 1: Add all new keys with safe defaults to every configured entity ──
-- Skips entities whose display_config is still the empty object '{}'
-- (those should first be seeded by 080_display_config_natural_key.sql).
UPDATE control.entity
SET display_config = display_config || jsonb_build_object(
  'list_renderer',      'table',
  'view_modes',         jsonb_build_array('table'),
  'lines_renderer',     NULL,
  'status_field_names', jsonb_build_array('status'),
  'alternate_flows',    '[]'::jsonb
)
WHERE display_config != '{}'::jsonb
  AND NOT (display_config ? 'list_renderer');

-- ── Step 2: Document entities get 'generic' lines_renderer ──────────────────
UPDATE control.entity
SET display_config = display_config
  || '{"lines_renderer": "generic"}'::jsonb
WHERE entity_class = 'DOCUMENT'
  AND (display_config ? 'list_renderer')
  AND (display_config->>'lines_renderer') IS NULL;

-- ── Step 3: Normalise simple legacy aliases → "master" ───────────────────────
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "master"}'::jsonb
WHERE display_config->>'detail_renderer'
  IN ('standard', 'generic', 'line_item', 'distribution');

-- ── Step 4: "rich_master" → "master" + inject detail_profile:"rich" ─────────
UPDATE control.entity
SET display_config =
  jsonb_set(
    jsonb_set(display_config, '{detail_renderer}', '"master"'),
    '{detail_profile}', '"rich"'
  )
WHERE display_config->>'detail_renderer' = 'rich_master';

-- ── Step 5: "approvable" → "document" ───────────────────────────────────────
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "document"}'::jsonb
WHERE display_config->>'detail_renderer' = 'approvable';

-- ── Step 6: DOCUMENT entities with no detail_renderer get "document" ─────────
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "document"}'::jsonb
WHERE entity_class = 'DOCUMENT'
  AND (display_config ? 'list_renderer')
  AND (display_config->>'detail_renderer') IS NULL;

-- ── Step 7: All remaining non-DOCUMENT entities default to "master" ──────────
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "master"}'::jsonb
WHERE entity_class NOT IN ('DOCUMENT')
  AND (display_config ? 'list_renderer')
  AND (display_config->>'detail_renderer') IS NULL;

-- ── Step 8: master entities without detail_profile get default "simple" ──────
UPDATE control.entity
SET display_config = display_config
  || '{"detail_profile": "simple"}'::jsonb
WHERE display_config->>'detail_renderer' = 'master'
  AND NOT (display_config ? 'detail_profile');

-- ── Step 9: Rename rich_master_config → master_config ────────────────────────
-- Copies the value to the new key and removes the old key.
-- Idempotent: skips rows that already have master_config or lack rich_master_config.
UPDATE control.entity
SET display_config = (display_config - 'rich_master_config')
  || jsonb_build_object('master_config', display_config->'rich_master_config')
WHERE (display_config ? 'rich_master_config')
  AND NOT (display_config ? 'master_config');
