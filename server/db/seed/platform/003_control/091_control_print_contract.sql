-- Â§1 master.print_profile â€” default A4 portrait, one per active tenant
-- Â§2 control.entity.display_config.print_config â€” site + warehouse layout (jsonb merge)
-- Â§3 control.entity_field.ui_hint.display.hide_in â€” audit/system field masking on print
-- Run after 042_control_entity_field_contract.sql and 044b_site_warehouse_contract.sql.

DO $$
DECLARE
    v_tenant record;
    v_sys    uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    FOR v_tenant IN
        SELECT id FROM master.tenant WHERE status = 'active'
    LOOP
        INSERT INTO master.print_profile (
            id,
            tenant_id,
            code,
            name,
            paper_size,
            orientation,
            color_mode,
            quality_dpi,
            output_format,
            duplex,
            margins,
            compression,
            header_footer,
            background_graphics,
            watermark_enabled,
            watermark_text,
            encrypt_pdf,
            archive_after_render,
            email_after_render,
            is_default,
            metadata,
            status,
            created_at,
            created_by
        )
        VALUES (
            shared.uuidv7(),
            v_tenant.id,
            'default_a4_portrait',
            'Default A4 Portrait',
            'A4',
            'portrait',
            'color',
            300,
            'pdf',
            'none',
            'normal',
            'medium',
            false,
            true,
            false,
            NULL,
            false,
            true,
            false,
            true,
            '{}'::jsonb,
            'active',
            now(),
            v_sys
        )
        ON CONFLICT (tenant_id, code) DO NOTHING;
    END LOOP;
END;
$$;


-- Â§2 Entity print_config â€” site (standard, two-section) and warehouse layout.
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


-- Â§3 Add "print" to ui_hint.display.hide_in for audit/system fields on site + warehouse.
-- jsonb_agg(DISTINCT v) deduplicates on re-run.
UPDATE control.entity_field ef
SET
    ui_hint = COALESCE(ui_hint, '{}'::jsonb)
              || jsonb_build_object(
                  'display', jsonb_build_object(
                      'hide_in', (
                          SELECT jsonb_agg(DISTINCT v)
                          FROM (
                              SELECT jsonb_array_elements_text(
                                  COALESCE(ui_hint->'display'->'hide_in', '[]'::jsonb)
                              ) AS v
                              UNION SELECT 'print'
                          ) sub
                      )
                  )
              ),
    updated_at = now()
WHERE ef.name IN (
    'created_by', 'updated_by', 'row_version', 'sync_token',
    'import_ref', 'legacy_ref', 'metadata'
)
AND EXISTS (
    SELECT 1
    FROM control.entity_version ev
    JOIN control.entity e
      ON e.id = ev.entity_id
    WHERE ev.id = ef.entity_version_id
      AND e.entity_code IN ('site', 'warehouse')
      AND e.tenant_id IS NULL
);



