-- 020_entities/006_master_coa_gl.sql
-- Entities 55–60: Finance Master — Chart of Accounts & GL
-- Depends on: shared.module rows (ACC)

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc text;
BEGIN
    SELECT id::text INTO v_acc FROM shared.module WHERE code = 'ACC';

    -- ── 55. chart_of_account ─────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'chart_of_account', 'COA', 'chart_of_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'chart_of_account',
        'Chart of Accounts', 'Charts of Accounts', 'list-tree', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 56. gl_account ───────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'gl_account', 'GLA', 'gl_account', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'gl_account',
        'GL Account', 'GL Accounts', 'book-open', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 57. company_code_chart_assignment ────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_chart_assignment', 'CCCOA', 'company_code_chart_assignment', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_chart_assignment',
        'COA Assignment', 'COA Assignments', 'link', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 58. company_code_gl_account ──────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_gl_account', 'CCGLA', 'company_code_gl_account', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_gl_account',
        'Company GL Account', 'Company GL Accounts', 'book-copy', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 59. ledger_book ──────────────────────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'ledger_book', 'LBK', 'ledger_book', 'MASTER', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'ledger_book',
        'Ledger Book', 'Ledger Books', 'book', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

    -- ── 60. company_code_book_assignment ─────────────────────────────────────
    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code, entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability, table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES (v_acc, 'company_code_book_assignment', 'CCBK', 'company_code_book_assignment', 'RELATION', 'system', 'ent', 'table',
        'full', 'tenant_critical', 'controlled', 'master', 'company_code_book_assignment',
        'Book Assignment', 'Book Assignments', 'link-2', 'green',
        false, '{}'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO NOTHING;

END $$;
