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
