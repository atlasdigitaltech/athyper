-- ============================================================
-- 092_entity_print_config.sql
-- Adds print_config to display_config for site and warehouse entities.
-- Idempotent: uses jsonb merge (||) so re-running is safe.
-- Run AFTER: 044b_site_warehouse_metadata.sql
-- ============================================================

-- site: standard layout, two-section output
UPDATE control.entity
SET
    display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'print_config', jsonb_build_object(
            'enabled',               true,
            'group_order',           jsonb_build_array('profile', 'reference'),
            'header_pin_fields',     jsonb_build_array('site_type', 'timezone_code'),
            'group_label_overrides', jsonb_build_object(
                'profile',   'Site Details',
                'reference', 'Location & Structure'
            ),
            'layout', jsonb_build_object('mode', 'standard')
        )
    ),
    updated_at = now()
WHERE table_schema = 'master'
  AND entity_code  = 'site'
  AND tenant_id IS NULL;

-- warehouse: two-column layout (compact for fewer fields)
UPDATE control.entity
SET
    display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'print_config', jsonb_build_object(
            'enabled',               true,
            'group_order',           jsonb_build_array('profile', 'reference', 'config'),
            'header_pin_fields',     jsonb_build_array('warehouse_type'),
            'group_label_overrides', jsonb_build_object(
                'profile',   'Warehouse Details',
                'reference', 'Location & Ownership',
                'config',    'Stock Configuration'
            ),
            'layout', jsonb_build_object('mode', 'two_column')
        )
    ),
    updated_at = now()
WHERE table_schema = 'master'
  AND entity_code  = 'warehouse'
  AND tenant_id IS NULL;
