-- 020_entities/008_master_partners.sql
-- Entities 65–69: Business Partners
-- Depends on: shared.module rows (ACC, IAM)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
    v_iam text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id::text INTO v_iam FROM shared.module WHERE code = 'IAM';

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
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
