-- Explicit aliases for intentional view projections.
-- 042_control_entity_field_contract.sql owns the physical output columns;
-- this file only adds logical identity aliases for views whose row identity is
-- exposed under a source-column name.

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

WITH projection_aliases(entity_code, name, column_name, alias_of, label, sort_order) AS (
    VALUES
        ('v_contact_summary',  'id', 'contact_link_id', 'contact_link_id', 'Contact Link', 1),
        ('v_resolved_address', 'id', 'address_link_id', 'address_link_id', 'Address Link', 1)
)
INSERT INTO control.entity_field (
    tenant_id,
    entity_version_id,
    name,
    column_name,
    projection_alias_of,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    is_read_only,
    is_active,
    sort_order,
    created_by,
    updated_by
)
SELECT
    NULL,
    ev.id,
    pa.name,
    pa.column_name,
    pa.alias_of,
    pa.label,
    'uuid',
    'reference',
    'one',
    'system',
    true,
    true,
    pa.sort_order::smallint,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM projection_aliases pa
JOIN control.entity e
  ON e.entity_code = pa.entity_code
 AND e.tenant_id IS NULL
 AND e.backing_type IN ('view', 'materialized_view')
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.tenant_id IS NULL
 AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name = EXCLUDED.column_name,
    projection_alias_of = EXCLUDED.projection_alias_of,
    label = EXCLUDED.label,
    data_type = EXCLUDED.data_type,
    ui_type = EXCLUDED.ui_type,
    cardinality = EXCLUDED.cardinality,
    origin = EXCLUDED.origin,
    is_read_only = true,
    is_active = true,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

COMMIT;

