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
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'business_partner_id','business_partner_id','Business Partner', 'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_partner"}'::jsonb,110,v_su),
            (v_ev,'customer_code',      'customer_code',      'Customer Code',    'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'customer_type',      'customer_type',      'Type',             'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'account_manager_id', 'account_manager_id', 'Account Manager',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,140,v_su),
            (v_ev,'risk_rating',        'risk_rating',        'Risk Rating',      'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_key_account',     'is_key_account',     'Key Account',      'boolean','checkbox', 'one','standard',false,true,  true,  false,NULL::jsonb,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
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
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'business_partner_id','business_partner_id','Business Partner','uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"business_partner"}'::jsonb,110,v_su),
            (v_ev,'supplier_code',      'supplier_code',      'Supplier Code',   'string', 'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'supplier_type',      'supplier_type',      'Type',            'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'payment_term_id',    'payment_term_id',    'Payment Terms',   'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,140,v_su),
            (v_ev,'payment_method_id',  'payment_method_id',  'Payment Method',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,150,v_su),
            (v_ev,'account_manager_id', 'account_manager_id', 'Account Manager', 'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,160,v_su),
            (v_ev,'spend_category_id',  'spend_category_id',  'Spend Category',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"spend_category"}'::jsonb,170,v_su),
            (v_ev,'is_payment_ready',   'is_payment_ready',   'Payment Ready',   'boolean','checkbox', 'one','standard',false,true,  true,  false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
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
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'employee_number', 'employee_number', 'Employee Number', 'string','text',     'one','standard',true, true,  true,  true, NULL::jsonb,110,v_su),
            (v_ev,'principal_id',    'principal_id',    'User Account',    'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"principal"}'::jsonb,120,v_su),
            (v_ev,'first_name',      'first_name',      'First Name',      'string','text',     'one','standard',true, false, true,  true, NULL::jsonb,130,v_su),
            (v_ev,'last_name',       'last_name',       'Last Name',       'string','text',     'one','standard',true, false, true,  true, NULL::jsonb,140,v_su),
            (v_ev,'display_name',    'display_name',    'Display Name',    'string','text',     'one','standard',false,false, true,  true, NULL::jsonb,150,v_su),
            (v_ev,'email',           'email',           'Email',           'string','email',    'one','standard',false,true,  true,  true, NULL::jsonb,160,v_su),
            (v_ev,'phone',           'phone',           'Phone',           'string','phone',    'one','standard',false,false, false, true, NULL::jsonb,170,v_su),
            (v_ev,'employment_type', 'employment_type', 'Employment Type', 'enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'department',      'department',      'Department',      'string','text',     'one','standard',false,true,  true,  true, NULL::jsonb,190,v_su),
            (v_ev,'title',           'title',           'Title',           'string','text',     'one','standard',false,true,  true,  true, NULL::jsonb,200,v_su),
            (v_ev,'manager_id',      'manager_id',      'Manager',         'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"employee"}'::jsonb,210,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',    'uuid',  'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,220,v_su),
            (v_ev,'hire_date',       'hire_date',       'Hire Date',       'date',  'date',     'one','standard',false,true,  true,  false,NULL::jsonb,230,v_su),
            (v_ev,'termination_date','termination_date','Termination Date', 'date',  'date',     'one','standard',false,true,  true,  false,NULL::jsonb,240,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
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
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'customer_id',                   'customer_id',                   'Customer',            'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"customer"}'::jsonb,110,v_su),
            (v_ev,'company_code_id',               'company_code_id',               'Company Code',        'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'credit_limit',                  'credit_limit',                  'Credit Limit',        'money',  'money',    'one','standard',false,true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'credit_limit_currency_code',    'credit_limit_currency_code',    'Credit Currency',     'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'credit_rating',                 'credit_rating',                 'Credit Rating',       'string', 'text',     'one','standard',false,true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_blocked',                    'is_blocked',                    'Blocked',             'boolean','toggle',   'one','standard',false,true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'block_reason',                  'block_reason',                  'Block Reason',        'string', 'text',     'one','standard',false,false, false, false,NULL::jsonb,170,v_su),
            (v_ev,'default_accounting_profile_id', 'default_accounting_profile_id', 'Accounting Profile',  'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"accounting_profile"}'::jsonb,180,v_su),
            (v_ev,'tax_group_id',                  'tax_group_id',                  'Tax Group',           'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,190,v_su),
            (v_ev,'default_receipt_method_id',     'default_receipt_method_id',     'Receipt Method',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,200,v_su),
            (v_ev,'default_dimension_set_id',      'default_dimension_set_id',      'Dimension Set',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,210,v_su),
            (v_ev,'payment_term_id',               'payment_term_id',               'Payment Terms',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,220,v_su),
            (v_ev,'currency_code',                 'currency_code',                 'Currency',            'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,230,v_su),
            (v_ev,'statement_cycle_code',          'statement_cycle_code',          'Statement Cycle',     'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,240,v_su),
            (v_ev,'dunning_policy_id',             'dunning_policy_id',             'Dunning Policy',      'uuid',   'reference','one','standard',false,true,  false, false,NULL::jsonb,250,v_su),
            (v_ev,'status',                        'status',                        'Status',              'lifecycle_state','select','one','standard',true,true,true,false,NULL::jsonb,260,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
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
            is_searchable, validation, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, validation, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'supplier_id',                      'supplier_id',                      'Supplier',             'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"supplier"}'::jsonb,110,v_su),
            (v_ev,'company_code_id',                  'company_code_id',                  'Company Code',         'uuid',   'reference','one','standard',true, true,  false, false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'is_blocked',                       'is_blocked',                       'Blocked',              'boolean','toggle',   'one','standard',false,true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'block_reason',                     'block_reason',                     'Block Reason',         'string', 'text',     'one','standard',false,false, false, false,NULL::jsonb,140,v_su),
            (v_ev,'currency_code',                    'currency_code',                    'Currency',             'string', 'text',     'one','standard',false,true,  false, false,NULL::jsonb,150,v_su),
            (v_ev,'default_accounting_profile_id',    'default_accounting_profile_id',    'Accounting Profile',   'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"accounting_profile"}'::jsonb,160,v_su),
            (v_ev,'payment_term_id',                  'payment_term_id',                  'Payment Terms',        'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,170,v_su),
            (v_ev,'payment_method_id',                'payment_method_id',                'Payment Method',       'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"payment_method"}'::jsonb,180,v_su),
            (v_ev,'preferred_remittance_bank_link_id','preferred_remittance_bank_link_id','Remittance Bank',      'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"business_partner_bank_account"}'::jsonb,190,v_su),
            (v_ev,'tax_group_id',                     'tax_group_id',                     'Tax Group',            'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,200,v_su),
            (v_ev,'default_wht_tax_group_id',         'default_wht_tax_group_id',         'Default WHT Group',    'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"tax_group"}'::jsonb,210,v_su),
            (v_ev,'default_dimension_set_id',         'default_dimension_set_id',         'Dimension Set',        'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"dimension_set"}'::jsonb,220,v_su),
            (v_ev,'invoice_hold_policy_id',           'invoice_hold_policy_id',           'Invoice Hold Policy',  'uuid',   'reference','one','standard',false,true,  false, false,NULL::jsonb,230,v_su),
            (v_ev,'status',                           'status',                           'Status',               'lifecycle_state','select','one','standard',true,true,true,false,NULL::jsonb,240,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/008_fields_partners: done';
END $$;
