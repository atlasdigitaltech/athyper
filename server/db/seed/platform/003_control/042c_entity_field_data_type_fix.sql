-- Fix: data_type values 'text[]' and 'enum[]' are not valid FieldDataType codes.
-- Canonical array type names use underscore suffix: text_array, uuid_array, etc.
-- Affected fields: aliases (text[] → text_array), business_types (enum[] → text_array)
-- Affected entities: supplier, customer, legal_entity
-- Idempotent: safe to re-run.

UPDATE control.entity_field ef
SET    data_type = 'text_array',
       updated_at = now()
FROM   control.entity_version ev
JOIN   control.entity e ON e.id = ev.entity_id
WHERE  ef.entity_version_id = ev.id
  AND  ef.column_name IN ('aliases', 'business_types')
  AND  ef.data_type IN ('text[]', 'enum[]')
  AND  e.table_schema = 'master'
  AND  e.table_name   IN ('supplier', 'customer', 'legal_entity')
  AND  e.tenant_id IS NULL
  AND  ev.version_no = 1;
