-- 004_entity_engine/091_entity_list_view_modes_patch.sql
-- Expand legacy List-only entity-list metadata to the full Smart List mode set.
-- The UI still gates Board at runtime when an entity has no groupable field.

UPDATE control.entity
SET display_config = jsonb_set(
    display_config,
    '{view_modes}',
    jsonb_build_array('table', 'compact', 'kanban', 'dashboard', 'spreadsheet'),
    true
)
WHERE display_config != '{}'::jsonb
  AND (
    NOT (display_config ? 'view_modes')
    OR display_config->'view_modes' = jsonb_build_array('table')
  )
  AND coalesce(display_config->>'detail_renderer', CASE
        WHEN entity_class = 'DOCUMENT' THEN 'document'
        WHEN entity_class IN ('LEDGER', 'LOG', 'AGGREGATE') THEN 'ledger'
        ELSE 'master'
      END) IN ('master', 'document');
