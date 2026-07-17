-- Final metadata hygiene pass for a clean database reset.
--
-- Catalog compilation is intentionally stricter than runtime compilation: a
-- catalog field must either map to a real table column or be an explicit
-- projection alias. Older contract bundles contain stale fields and duplicate
-- physical mappings. Retain the canonical first mapping and quarantine only
-- the invalid rows; this does not alter application tables or views.

UPDATE control.entity_field ef
   SET is_active = false,
       runtime_enabled = false,
       updated_at = now()
 WHERE ef.tenant_id IS NULL
   AND ef.is_active = true
   AND EXISTS (
     SELECT 1
       FROM control.entity_version ev
       JOIN control.entity e ON e.id = ev.entity_id
      WHERE ev.id = ef.entity_version_id
        AND ev.tenant_id IS NULL
        AND e.tenant_id IS NULL
        AND e.backing_type = 'table'
        AND NOT EXISTS (
          SELECT 1
            FROM information_schema.columns c
           WHERE c.table_schema = e.table_schema
             AND c.table_name = e.table_name
             AND c.column_name = ef.column_name
        )
   );
UPDATE control.entity_field ef
   SET is_active = false,
       runtime_enabled = false,
       updated_at = now()
 WHERE ef.tenant_id IS NULL
   AND ef.is_active = true
   AND ef.projection_alias_of IS NULL
   AND EXISTS (
     SELECT 1
       FROM control.entity_version ev
       JOIN control.entity e ON e.id = ev.entity_id
      WHERE ev.id = ef.entity_version_id
        AND ev.tenant_id IS NULL
        AND e.tenant_id IS NULL
        AND e.backing_type = 'table'
   )
   AND EXISTS (
     SELECT 1
       FROM control.entity_field earlier
      WHERE earlier.entity_version_id = ef.entity_version_id
        AND earlier.tenant_id IS NULL
        AND earlier.is_active = true
        AND earlier.projection_alias_of IS NULL
        AND earlier.column_name = ef.column_name
        AND (earlier.sort_order < ef.sort_order
          OR (earlier.sort_order = ef.sort_order AND earlier.id < ef.id))
   );
