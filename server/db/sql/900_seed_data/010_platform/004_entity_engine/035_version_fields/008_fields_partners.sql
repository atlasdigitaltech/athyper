-- 035_version_fields/008_fields_partners.sql
-- Version-bound entity_field rows for Business Partners (65–69)
-- Entities: customer, supplier, employee,
--           company_code_customer_profile, company_code_supplier_profile
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── customer ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'customer' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',       'legal_name',       'Legal Name',        'string', 'text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'customer_type',    'customer_type',    'Type',              'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'tax_identifier',   'tax_id',           'Tax ID',            'string', 'text',     'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'credit_limit',     'credit_limit',     'Credit Limit',      'money',  'money',    'one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'credit_currency_id','credit_currency_id','Credit Currency', 'uuid',   'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'payment_term_id',  'payment_term_id',  'Payment Terms',     'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'account_manager_id','account_manager_id','Account Manager', 'uuid',   'reference','one','standard',false,true,  false, false,170,v_su),
            (v_ev,'risk_rating',      'risk_rating',      'Risk Rating',       'enum',   'select',   'one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'is_key_account',   'is_key_account',   'Key Account',       'boolean','hidden',   'one','standard',false,true,  false, false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── supplier ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'supplier' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        -- Remove is_preferred / is_preferred_supplier if mistakenly seeded on supplier entity.
        -- This field belongs to supplier_qualification (016_supplier_qualification.sql),
        -- not master.supplier — querying it against master.supplier causes a column error.
        DELETE FROM control.entity_field
        WHERE entity_version_id = v_ev
          AND name IN ('is_preferred', 'is_preferred_supplier');

        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',        'legal_name',        'Legal Name',      'string', 'text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'supplier_type',     'supplier_type',     'Type',            'enum',   'select',   'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'tax_identifier',    'tax_id',            'Tax ID',          'string', 'text',     'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'payment_term_id',   'payment_term_id',   'Payment Terms',   'uuid',   'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'payment_method_id', 'payment_method_id', 'Payment Method',  'uuid',   'reference','one','standard',false,true,  false, false,150,v_su),
            (v_ev,'account_manager_id','account_manager_id','Account Manager', 'uuid',   'reference','one','standard',false,true,  false, false,160,v_su),
            (v_ev,'spend_category_id', 'spend_category_id', 'Spend Category',  'uuid',   'reference','one','standard',false,true,  false, false,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── employee ──────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'employee' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'legal_name',     'legal_name',     'Legal Name',    'string', 'text',     'one','standard',true, true,  true,  true, 110,v_su),
            (v_ev,'date_of_birth',  'date_of_birth',  'Date of Birth', 'date',   'date',     'one','standard',false,false, false, false,120,v_su),
            (v_ev,'national_identifier','national_id',    'National ID',   'string', 'text',     'one','standard',false,false, false, false,130,v_su),
            (v_ev,'department_id',  'department_id',  'Department',    'uuid',   'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'position_title', 'position_title', 'Position',      'string', 'text',     'one','standard',false,true,  true,  true, 150,v_su),
            (v_ev,'hire_date',      'hire_date',      'Hire Date',     'date',   'date',     'one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'salary',         'salary',         'Salary',        'money',  'money',    'one','standard',false,false, false, false,170,v_su),
            (v_ev,'salary_currency_id','salary_currency_id','Currency','uuid',   'reference','one','standard',false,false, false, false,180,v_su),
            (v_ev,'manager_id',     'manager_id',     'Manager',       'uuid',   'reference','one','standard',false,true,  false, false,190,v_su),
            (v_ev,'principal_id',   'principal_id',   'User Account',  'uuid',   'reference','one','standard',false,true,  false, false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_customer_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_customer_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'customer_id',     'customer_id',     'Customer',           'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',       'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'ar_account_id',   'ar_gl_account_id','AR Account',         'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'credit_limit_local','credit_limit',  'Credit Limit (Local)','money','money','one','standard',false,true,true,false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── company_code_supplier_profile ─────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'company_code_supplier_profile' AND ev.version_no = 1;

    IF v_ev IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'supplier_id',     'supplier_id',      'Supplier',       'uuid','reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'company_code_id', 'company_code_id',  'Company Code',   'uuid','reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'ap_account_id',   'ap_gl_account_id', 'AP Account',     'uuid','reference','one','standard',false,true,  false, false,130,v_su),
            (v_ev,'payment_method_id','payment_method_id','Payment Method', 'uuid','reference','one','standard',false,true, false, false,140,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/008_fields_partners: done';
END $$;
