-- 100_master/022_customer_block.sql
-- Purpose: Register master.customer_block as customer_block entity.
-- Idempotent: WHERE NOT EXISTS / ON CONFLICT DO NOTHING

-- 1. control.entity
INSERT INTO control.entity (
    module_id, name, entity_short, entity_code,
    entity_class, ownership_model, kind, backing_type,
    governance_level, security_tier, mutability,
    table_schema, table_name,
    label_singular, label_plural, icon_key, color_token,
    feature_flags,
    status, created_by)
SELECT
    (SELECT id FROM shared.module WHERE code = 'CRM'),
    'customer_block', 'CBK', 'customer_block',
    'MASTER', 'system', 'ent', 'table',
    'standard', 'restricted', 'controlled',
    'master', 'customer_block',
    'Customer Block', 'Customer Blocks', 'ban', 'red',
    '{"parent_entity":"customer","parent_fk":"customer_id"}'::jsonb,
    'ACTIVE', '00000000-0000-0000-0000-000000000000'
ON CONFLICT (table_schema, table_name) DO NOTHING;

-- 2. control.entity_version
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status,
    label, change_type, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE',
    'Initial Version', 'structural', now(),
    '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'customer_block' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- 3. control.entity_field
INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, is_required, is_filterable,
    validation, sort_order, created_by)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard', f.enum_domain_code,
       f.is_required, f.is_filterable,
       f.validation, f.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('block_type',   'block_type',   'Block Type',   'text',            'one',         NULL::text, true,  true,  NULL::jsonb, 10),
    ('block_reason', 'block_reason', 'Block Reason', 'text',            'one',         NULL::text, true,  false, NULL::jsonb, 20),
    ('blocked_at',   'blocked_at',   'Blocked At',   'datetime',        'one',         NULL::text, true,  true,  NULL::jsonb, 30),
    ('is_active',    'is_active',    'Active',       'boolean',         'one',         NULL::text, true,  true,  NULL::jsonb, 40),
    ('lifted_at',    'lifted_at',    'Lifted At',    'datetime',        'zero_or_one', NULL::text, false, true,  NULL::jsonb, 50),
    ('lift_reason',  'lift_reason',  'Lift Reason',  'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 60),
    ('notes',        'notes',        'Notes',        'text',            'zero_or_one', NULL::text, false, false, NULL::jsonb, 70),
    ('status',       'status',       'Status',       'lifecycle_state', 'one',         NULL::text, true,  true,  NULL::jsonb, 80)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'customer_block' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

UPDATE control.entity_field ef
SET origin = 'system',
    ui_type = 'hidden'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
WHERE ef.entity_version_id = ev.id
  AND e.entity_code = 'customer_block'
  AND e.tenant_id IS NULL AND ev.version_no = 1
  AND ef.name = 'is_active'
  AND (ef.origin IS DISTINCT FROM 'system' OR ef.ui_type IS DISTINCT FROM 'hidden');

-- 4. display_config + natural_key_fields
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       jsonb_build_array('block_type','block_reason','blocked_at','status'),
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Block',     'fields',jsonb_build_array('block_type','block_reason','blocked_at','status')),
            jsonb_build_object('label','Lift',      'fields',jsonb_build_array('lifted_at','lift_reason')),
            jsonb_build_object('label','Notes',     'fields',jsonb_build_array('notes')),
            jsonb_build_object('label','Technical', 'collapsed',true, 'fields',jsonb_build_array('id','created_at'))
        ),
        'default_sort_field', 'blocked_at',
        'default_sort_order', 'desc'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['id']::text[]), true)
WHERE entity_code = 'customer_block' AND tenant_id IS NULL;
