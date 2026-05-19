-- 020_entities/011_master_tax_fx.sql
-- Entities 81–83: Tax, FX & Treasury
-- Depends on: shared.module rows (ACC, TREASURY)

DO $$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_acc     text;
    v_treasury text;
BEGIN
    SELECT id::text INTO v_acc     FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_treasury FROM shared.module WHERE code = 'TREASURY';

    -- ── 81. tax_jurisdiction ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'tax_jurisdiction', 'TAXJ', 'tax_jurisdiction', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_jurisdiction',
        'Tax Jurisdiction', 'Tax Jurisdictions', 'landmark', 'orange',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 82. tax_type ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'tax_type', 'TAXTP', 'tax_type', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'tax_type',
        'Tax Type', 'Tax Types', 'percent', 'orange',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_acc, 'tax_group', 'TAXGRP', 'tax_group', 'CONTROL', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'control', 'tax_group',
        'Tax Group', 'Tax Groups', 'receipt-text', 'orange',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 83. fx_rate ──────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_treasury, 'fx_rate', 'FXR', 'fx_rate', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'locked', 'master', 'fx_rate',
        'FX Rate', 'FX Rates', 'arrow-right-left', 'orange',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- tax_group is backed by control.tax_group, so it is not picked up by the
-- master.* bulk version/field seed. Register the minimal display metadata here.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000'
FROM control.entity e
WHERE e.entity_code = 'tax_group' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
    is_read_only, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type, f.ui_type,
       f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
       f.is_read_only, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('id',          'id',          'ID',          'uuid',            'hidden',   'one', 'system',   true,  false, false, false, true,   10),
    ('tenant_id',   'tenant_id',   'Tenant',      'uuid',            'hidden',   'one', 'system',   true,  true,  false, false, true,   20),
    ('code',        'code',        'Code',        'string',          'text',     'one', 'standard', true,  true,  true,  true,  false,  30),
    ('name',        'name',        'Name',        'string',          'text',     'one', 'standard', true,  true,  true,  true,  false,  40),
    ('description', 'description', 'Description', 'text',            'textarea', 'one', 'standard', false, false, false, true,  false,  50),
    ('is_compound', 'is_compound', 'Compound',    'boolean',         'toggle',   'one', 'standard', true,  true,  true,  false, false,  60),
    ('status',      'status',      'Status',      'lifecycle_state', 'select',   'one', 'standard', true,  true,  true,  false, false,  70)
) AS f(name, column_name, label, data_type, ui_type, cardinality, origin,
       is_required, is_filterable, is_sortable, is_searchable, is_read_only, sort_order)
WHERE e.entity_code = 'tax_group' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity
SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('code','name','is_compound','status'),
        'default_sort_field', 'name',
        'default_sort_order', 'asc',
        'code_field',         'code',
        'title_field',        'name'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['code']::text[]), true)
WHERE entity_code = 'tax_group' AND tenant_id IS NULL;
