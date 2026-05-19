-- 020_entities/013_master_banking.sql
-- Entities 87â€“91: Banking & Payments
-- Depends on: shared.module rows (PAY)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pay text;
BEGIN
    SELECT id::text INTO v_pay FROM shared.module WHERE code = 'PAY';

    -- â”€â”€ 87. bank_party â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'bank_party', 'BKPTY', 'bank_party', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'bank_party',
        'Bank', 'Banks', 'landmark', 'blue',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€ 88. bank_account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account', 'BKACC', 'bank_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account',
        'Bank Account', 'Bank Accounts', 'credit-card', 'blue',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€ 89. bank_account_link â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_link', 'BKACCL', 'bank_account_link', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_link',
        'Bank Account Link', 'Bank Account Links', 'link', 'blue',
        '{"requires_owner_type_scope":true,"owner_type_column":"owner_type"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€ 89b. business_partner_bank_account (view entity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    -- Read-only view entity used by the Business Partner Banking tab.
    -- parent_fk "business_partner_id" enables ?parent_id= filtering in records.route.
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'business_partner_bank_account', 'BPBKACC', 'business_partner_bank_account', 'RELATION', 'system', 'ent', 'view',
        'full', 'tenant_critical', 'controlled', 'master', 'v_business_partner_bank_account',
        'Business Partner Bank Account', 'Business Partner Bank Accounts', 'credit-card', 'blue',
        '{"parent_entity":"business_partner","parent_fk":"business_partner_id"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€ 90. bank_account_house_config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'bank_account_house_config', 'BKHCFG', 'bank_account_house_config', 'CONTROL', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'bank_account_house_config',
        'House Bank Config', 'House Bank Configs', 'settings', 'blue',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- â”€â”€ 91. payment_method â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        feature_flags, status, created_by)
    VALUES (v_pay, 'payment_method', 'PMTM', 'payment_method', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'payment_method',
        'Payment Method', 'Payment Methods', 'wallet', 'blue',
        '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;

-- â”€â”€ business_partner_bank_account: entity_version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Explicit version needed: 025_entity_versions may have run before this entity
-- was added, leaving it without an EFFECTIVE version.
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, effective_from, created_by)
SELECT e.id, NULL, 1, 'EFFECTIVE', now(),
       '00000000-0000-0000-0000-000000000000'
FROM   control.entity e
WHERE  e.entity_code = 'business_partner_bank_account' AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO NOTHING;

-- â”€â”€ business_partner_bank_account: entity_field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
WHERE e.entity_code = 'business_partner_bank_account' AND e.tenant_id IS NULL AND ev.version_no = 1
ON CONFLICT DO NOTHING;

-- â”€â”€ business_partner_bank_account: display_config + natural_key_fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
UPDATE control.entity
SET display_config        = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
        'detail_renderer',    'master',
        'list_columns',       '["bank_name","currency_code","account_number","is_primary","is_verified"]'::jsonb,
        'drawer_groups',      jsonb_build_array(
            jsonb_build_object('label','Account',            'fields',jsonb_build_array('bank_name','account_holder_name','account_number','currency_code')),
            jsonb_build_object('label','Purpose & Standing', 'fields',jsonb_build_array('purpose','is_primary','is_verified')),
            jsonb_build_object('label','Validity',           'fields',jsonb_build_array('effective_from','effective_until')),
            jsonb_build_object('label','Technical',          'collapsed',true, 'fields',jsonb_build_array('id','bank_account_id','created_at','metadata'))
        ),
        'default_sort_field', 'is_primary',
        'default_sort_order', 'desc'
    ),
    identity_config = jsonb_set(COALESCE(identity_config, '{}'::jsonb), '{natural_key_fields}', to_jsonb(ARRAY['id']::text[]), true)
WHERE entity_code = 'business_partner_bank_account' AND tenant_id IS NULL;
