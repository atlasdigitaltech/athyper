-- Phase B.5 — display_config v2 backfill
-- Adds the six keys introduced in Phase B.5:
--   list_renderer, view_modes, lines_renderer,
--   status_field_names, alternate_flows
-- Also normalises detail_renderer from "generic" → "standard" for non-document entities.
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

-- ── Step 3: Normalise legacy "generic" detail_renderer → "standard" ─────────
-- The DB seed uses "standard"; the old Zod enum had only "generic".
-- Any row that slipped through with "generic" for a non-document entity
-- is updated to the canonical "standard" value.
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "standard"}'::jsonb
WHERE entity_class IN ('MASTER', 'CONTROL', 'REFERENCE', 'DIMENSION', 'LOOKUP')
  AND display_config->>'detail_renderer' = 'generic';

-- ── Step 4: DOCUMENT entities with "generic" keep "approvable" ───────────────
-- Defensive: if any document entity had "generic" from old seeds, set "approvable".
UPDATE control.entity
SET display_config = display_config
  || '{"detail_renderer": "approvable"}'::jsonb
WHERE entity_class = 'DOCUMENT'
  AND display_config->>'detail_renderer' = 'generic';
