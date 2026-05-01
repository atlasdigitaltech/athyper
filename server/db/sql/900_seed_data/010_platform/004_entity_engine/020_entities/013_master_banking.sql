-- 020_entities/013_master_banking.sql
-- Entities 87–91: Banking & Payments
-- Depends on: shared.module rows (PAY)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pay text;
BEGIN
    SELECT id::text INTO v_pay FROM shared.module WHERE code = 'PAY';

    -- ── 87. bank_party ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_party', 'BKPTY', 'bank_party', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'bank_party',
        'Bank', 'Banks', 'landmark', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 88. bank_account ─────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account', 'BKACC', 'bank_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account',
        'Bank Account', 'Bank Accounts', 'credit-card', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 89. bank_account_link ────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_link', 'BKACCL', 'bank_account_link', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_link',
        'Bank Account Link', 'Bank Account Links', 'link', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 89b. supplier_bank_account (view entity) ─────────────────────────────
    -- Read-only view entity used by the supplier Banking tab.
    -- parent_fk "supplier_id" enables ?parent_id= filtering in records.route.
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'supplier_bank_account', 'SBKACC', 'supplier_bank_account', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'v_supplier_bank_account',
        'Supplier Bank Account', 'Supplier Bank Accounts', 'credit-card', 'blue',
        false, '{"parent_fk":"supplier_id"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 90. bank_account_house_config ────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_house_config', 'BKHCFG', 'bank_account_house_config', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_house_config',
        'House Bank Config', 'House Bank Configs', 'settings', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 91. payment_method ───────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_pay, 'payment_method', 'PMTM', 'payment_method', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_method',
        'Payment Method', 'Payment Methods', 'wallet', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- ── supplier_bank_account: entity_version ────────────────────────────────────
-- Explicit version needed: 025_entity_versions may have run before this entity
-- was added, leaving it without an EFFECTIVE version.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'supplier_bank_account' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- ── supplier_bank_account: entity_field ─────────────────────────────────────
-- View columns exposed for display, filtering, and schema introspection.
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
    ('bank_name',           'bank_name',           'Bank Name',      'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  10),
    ('account_number',      'account_number',      'Account Number', 'text',    'one',         NULL::text, true,  true,  NULL::jsonb,  20),
    ('currency_code',       'currency_code',       'Currency',       'text',    'one',         NULL::text, true,  true,  NULL::jsonb,  30),
    ('account_holder_name', 'account_holder_name', 'Account Holder', 'text',    'zero_or_one', NULL::text, false, false, NULL::jsonb,  40),
    ('account_id_type',     'account_id_type',     'Account Type',   'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  50),
    ('account_nature',      'account_nature',      'Nature',         'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  60),
    ('is_verified',         'is_verified',         'Verified',       'boolean', 'one',         NULL::text, true,  true,  NULL::jsonb,  70),
    ('purpose',             'purpose',             'Purpose',        'text',    'zero_or_one', NULL::text, false, true,  NULL::jsonb,  80),
    ('is_primary',          'is_primary',          'Primary',        'boolean', 'one',         NULL::text, true,  true,  NULL::jsonb,  90),
    ('effective_from',      'effective_from',      'Effective From', 'date',    'zero_or_one', NULL::text, false, true,  NULL::jsonb, 100),
    ('effective_until',     'effective_until',     'Expires',        'date',    'zero_or_one', NULL::text, false, true,  NULL::jsonb, 110),
    ('bic_override',        'bic_override',        'BIC / SWIFT',    'text',    'zero_or_one', NULL::text, false, false, NULL::jsonb, 120)
) AS f(name, column_name, label, data_type, cardinality, enum_domain_code,
       is_required, is_filterable, validation, sort_order)
WHERE e.entity_code = 'supplier_bank_account' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- ── supplier_bank_account: display_config + natural_key_fields ───────────────
UPDATE control.entity
SET display_config        = jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["bank_name","account_number","currency_code","account_id_type","is_primary","is_verified"]'::jsonb,
        'default_sort_field', 'is_primary',
        'default_sort_order', 'desc'
    ),
    natural_key_fields    = ARRAY['id']
WHERE entity_code = 'supplier_bank_account' AND tenant_id IS NULL
  AND display_config = '{}'::jsonb;
