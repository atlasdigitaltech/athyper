-- 020_entities/008_master_partners.sql
-- Entities 64–70: Business Partners (BP-first architecture)
-- Depends on: shared.module rows (ACC, IAM, BUY, CRM)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
    v_iam text;
    v_buy text;
    v_crm text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';
    SELECT id::text INTO v_buy FROM shared.module WHERE code = 'BUY';
    SELECT id::text INTO v_crm FROM shared.module WHERE code = 'CRM';

    -- ── 64. business_partner ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, naming_policy, feature_flags, status, created_by)
    VALUES (v_acc::uuid, 'business_partner', 'BP', 'business_partner', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'business_partner',
        'Business Partner', 'Business Partners', 'building', 'indigo',
        true,
        '{"prefix":"BP","prefix_configurable":true,"separator":"-","segments":[{"type":"sequence","padding":6}]}'::jsonb,
        '{"is_approvable":false,"party_category":"business_partner","allow_address":true,"allow_contact":true}'::jsonb,
        'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 65. customer ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'customer', 'CUST', 'customer', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'customer',
        'Customer', 'Customers', 'user-round', 'sky',
        false, '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 66. supplier ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'supplier', 'SUP', 'supplier', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'extensible', 'master', 'supplier',
        'Supplier', 'Suppliers', 'building-2', 'blue',
        false, '{"is_approvable":false}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 67. employee ─────────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_iam, 'employee', 'EMP', 'employee', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'employee',
        'Employee', 'Employees', 'user-tie', 'blue',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 68. company_code_customer_profile ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_customer_profile', 'CCCP', 'company_code_customer_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_customer_profile',
        'Customer Company Profile', 'Customer Company Profiles', 'user-cog', 'sky',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 69. company_code_supplier_profile ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_supplier_profile', 'CCSUP', 'company_code_supplier_profile', 'MASTER', 'system', 'ent', 'table',
        'full', 'operational', 'controlled', 'master', 'company_code_supplier_profile',
        'Supplier Company Profile', 'Supplier Company Profiles', 'truck', 'orange',
        false, '{"parent_entity":"supplier","parent_fk":"supplier_id"}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 70. company_code_supplier_spend_policy ────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_buy, 'company_code_supplier_spend_policy', 'CCSS', 'company_code_supplier_spend_policy', 'MASTER', 'system', 'ent', 'table',
        'standard', 'business', 'controlled', 'master', 'company_code_supplier_spend_policy',
        'Supplier Spend Policy', 'Supplier Spend Policies', 'tag', 'amber',
        false, '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
        'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 71. company_code_supplier_intent_policy ───────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_buy, 'company_code_supplier_intent_policy', 'CCSI', 'company_code_supplier_intent_policy', 'MASTER', 'system', 'ent', 'table',
        'standard', 'business', 'controlled', 'master', 'company_code_supplier_intent_policy',
        'Supplier Intent Policy', 'Supplier Intent Policies', 'target', 'violet',
        false, '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
        'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 72. company_code_supplier_posting_override ────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_supplier_posting_override', 'CSPO', 'company_code_supplier_posting_override', 'MASTER', 'system', 'ent', 'table',
        'standard', 'sensitive', 'controlled', 'master', 'company_code_supplier_posting_override',
        'Supplier Posting Override', 'Supplier Posting Overrides', 'book-open', 'rose',
        false, '{"parent_entity":"company_code_supplier_profile","parent_fk":"supplier_profile_id"}'::jsonb,
        'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
