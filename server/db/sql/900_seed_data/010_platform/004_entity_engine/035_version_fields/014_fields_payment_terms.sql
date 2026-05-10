-- 035_version_fields/014_fields_payment_terms.sql
-- Version-bound entity_field rows for Payment Term entities (92–96)
-- Entities: holiday_calendar, holiday_calendar_day, payment_term,
--           payment_term_clause, payment_term_discount_tier
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── holiday_calendar ──────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar' AND ev.version_no = 1;

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
            (v_ev,'country_code',     'country_code',     'Country',          'string',  'text',  'one','standard',false,true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'company_code_id',  'company_code_id',  'Company Code',     'uuid',    'reference','one','standard',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,120,v_su),
            (v_ev,'weekend_pattern',  'weekend_pattern',  'Weekend Pattern',  'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'is_default',       'is_default',       'Default',          'boolean', 'hidden','one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'sort_order',       'sort_order',       'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,NULL::jsonb,150,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── holiday_calendar_day ──────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    -- name exists in DDL but not seeded by bulk pass — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'holiday_calendar_day' AND ev.version_no = 1;

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
            (v_ev,'holiday_calendar_id','holiday_calendar_id','Calendar',      'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"holiday_calendar"}'::jsonb,110,v_su),
            (v_ev,'calendar_year',      'calendar_year',      'Year',          'integer', 'number',   'one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'holiday_date',       'holiday_date',       'Date',          'date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'name',               'name',               'Name',          'string',  'text',     'one','standard',true, false, true,  true, NULL::jsonb,140,v_su),
            (v_ev,'day_type',           'day_type',           'Day Type',      'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'observance_type',    'observance_type',    'Observance',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'is_half_day',        'is_half_day',        'Half Day',      'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,170,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term' AND ev.version_no = 1;

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
            (v_ev,'applicable_to',          'applicable_to',          'Applicable To',    'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'base_event',             'base_event',             'Base Event',       'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,120,v_su),
            (v_ev,'due_rule_type',          'due_rule_type',          'Due Rule',         'enum',    'select','one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'due_days',               'due_days',               'Due Days',         'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,140,v_su),
            (v_ev,'due_day_of_month',       'due_day_of_month',       'Due Day of Month', 'integer', 'number','one','standard',false,true,  true,  false,'{"min":1,"max":31}'::jsonb,145,v_su),
            (v_ev,'grace_days',             'grace_days',             'Grace Days',       'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,150,v_su),
            (v_ev,'due_date_flexibility',   'due_date_flexibility',   'Due Flexibility',  'enum',    'select','one','standard',false,true,  true,  false,NULL::jsonb,155,v_su),
            (v_ev,'business_day_convention','business_day_convention','Business Day Convention','enum','select','one','standard',false,true,true,false,NULL::jsonb,158,v_su),
            (v_ev,'holiday_calendar_id',    'holiday_calendar_id',    'Holiday Calendar', 'uuid',    'reference','one','standard',false,true,false,false,'{"ref_entity":"holiday_calendar"}'::jsonb,160,v_su),
            (v_ev,'month_offset',           'month_offset',           'Month Offset',     'integer', 'number','one','standard',false,true,  true,  false,'{"min":0}'::jsonb,165,v_su),
            (v_ev,'term_category',          'term_category',          'Category',         'enum',    'select','one','standard',false,true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'installment_count',      'installment_count',      'Installments',     'integer', 'number','one','standard',false,true,  true,  false,'{"min":1}'::jsonb,175,v_su),
            (v_ev,'version',                'version',                'Version',          'integer', 'number','one','system',  false,true,  true,  false,'{"min":1}'::jsonb,180,v_su),
            (v_ev,'supersedes_payment_term_id','supersedes_payment_term_id','Supersedes Term','uuid','hidden','one','system',false,true,false,false,'{"ref_entity":"payment_term"}'::jsonb,185,v_su),
            (v_ev,'is_current_version',     'is_current_version',     'Current',          'boolean', 'hidden','one','system',  false,true,  false, false,NULL::jsonb,190,v_su),
            (v_ev,'effective_from',         'effective_from',         'Effective From',   'date',    'date',  'one','standard',false,true,  true,  false,NULL::jsonb,200,v_su),
            (v_ev,'effective_to',           'effective_to',           'Effective To',     'date',    'date',  'one','standard',false,true,  true,  false,NULL::jsonb,210,v_su),
            (v_ev,'sort_order',             'sort_order',             'Sort Order',       'integer', 'number','one','standard',false,false, true,  false,'{"min":0}'::jsonb,220,v_su),
            (v_ev,'status_changed_at',      'status_changed_at',      'Status Changed At','datetime','hidden','one','system',false,true,  true,  false,NULL::jsonb,900,v_su),
            (v_ev,'status_changed_by',      'status_changed_by',      'Status Changed By','uuid',    'hidden','one','system',false,true, false, false,'{"ref_entity":"principal"}'::jsonb,910,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_clause ───────────────────────────────────────────────────
    -- RELATION class: id, tenant_id, created_at, created_by in common fields
    -- is_active is standalone boolean (no status column) — add explicitly
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_clause' AND ev.version_no = 1;

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
            (v_ev,'payment_term_id', 'payment_term_id', 'Payment Term',    'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,110,v_su),
            (v_ev,'clause_code',     'clause_code',     'Clause Code',     'string',  'text',     'one','standard',true, true,  true,  true, NULL::jsonb,120,v_su),
            (v_ev,'clause_type',     'clause_type',     'Clause Type',     'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'sequence_no',     'sequence_no',     'Sequence',        'integer', 'number',   'one','standard',true, false, true,  false,'{"min":1}'::jsonb,140,v_su),
            (v_ev,'calc_mode',       'calc_mode',       'Calc Mode',       'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'default_pct',     'default_pct',     'Default %',       'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,160,v_su),
            (v_ev,'default_amount',  'default_amount',  'Default Amount',  'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,170,v_su),
            (v_ev,'flexibility_mode','flexibility_mode','Flexibility',     'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'is_active',       'is_active',       'Active',          'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,190,v_su),
            (v_ev,'settles_clause_code','settles_clause_code','Settles Clause','string','text',   'one','standard',false,true,  true,  false,NULL::jsonb,200,v_su),
            (v_ev,'application_scope','application_scope','Application Scope','enum',  'select',   'one','standard',true, true,  true,  false,NULL::jsonb,210,v_su),
            (v_ev,'basis_amount_mode','basis_amount_mode','Basis Amount',   'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,220,v_su),
            (v_ev,'currency_code',   'currency_code',   'Currency',        'string',  'currency', 'one','standard',false,true,  true,  false,'{"max_length":3}'::jsonb,230,v_su),
            (v_ev,'min_pct',         'min_pct',         'Min %',           'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,240,v_su),
            (v_ev,'max_pct',         'max_pct',         'Max %',           'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,250,v_su),
            (v_ev,'min_amount',      'min_amount',      'Min Amount',      'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,260,v_su),
            (v_ev,'max_amount',      'max_amount',      'Max Amount',      'money',   'money',    'one','standard',false,false, true,  false,'{"min":0}'::jsonb,270,v_su),
            (v_ev,'cumulative_cap_pct','cumulative_cap_pct','Cumulative Cap %','decimal','number', 'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,280,v_su),
            (v_ev,'cumulative_cap_amount','cumulative_cap_amount','Cumulative Cap Amount','money','money','one','standard',false,false,true,false,'{"min":0}'::jsonb,290,v_su),
            (v_ev,'trigger_event',   'trigger_event',   'Trigger Event',   'string',  'text',     'one','standard',false,true,  true,  false,NULL::jsonb,300,v_su),
            (v_ev,'release_event',   'release_event',   'Release Event',   'string',  'text',     'one','standard',false,true,  true,  false,NULL::jsonb,310,v_su),
            (v_ev,'release_delay_days','release_delay_days','Release Delay Days','integer','number','one','standard',false,false,true,false,'{"min":0}'::jsonb,320,v_su),
            (v_ev,'recovery_start_after_pct','recovery_start_after_pct','Recovery Start After %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,330,v_su),
            (v_ev,'recovery_end_before_pct','recovery_end_before_pct','Recovery End Before %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,340,v_su),
            (v_ev,'recovery_method', 'recovery_method', 'Recovery Method', 'enum',    'select',   'one','standard',false,true,  true,  false,NULL::jsonb,350,v_su),
            (v_ev,'partial_release_pct','partial_release_pct','Partial Release %','decimal','number','one','standard',false,false,true,false,'{"min":0,"max":100}'::jsonb,360,v_su),
            (v_ev,'partial_release_event','partial_release_event','Partial Release Event','string','text','one','standard',false,true,true,false,NULL::jsonb,370,v_su),
            (v_ev,'rounding_method', 'rounding_method', 'Rounding Method', 'enum',    'select',   'one','standard',false,true,  true,  false,NULL::jsonb,380,v_su),
            (v_ev,'rounding_scale',  'rounding_scale',  'Rounding Scale',  'integer', 'number',   'one','standard',false,false, true,  false,'{"min":0}'::jsonb,390,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_term_discount_tier ────────────────────────────────────────────
    -- RELATION class
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_term_discount_tier' AND ev.version_no = 1;

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
            (v_ev,'payment_term_id',      'payment_term_id',      'Payment Term',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"payment_term"}'::jsonb,110,v_su),
            (v_ev,'tier_no',              'tier_no',              'Tier',          'integer', 'number',   'one','standard',true, true,  true,  false,'{"min":1}'::jsonb,120,v_su),
            (v_ev,'qualify_within_days',  'qualify_within_days',  'Qualify Days',  'integer', 'number',   'one','standard',true, true,  true,  false,'{"min":1}'::jsonb,130,v_su),
            (v_ev,'discount_pct',         'discount_pct',         'Discount %',    'decimal', 'number',   'one','standard',false,false, true,  false,'{"min":0,"max":100}'::jsonb,140,v_su),
            (v_ev,'discount_basis_mode',  'discount_basis_mode',  'Basis Mode',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_best_only',         'is_best_only',         'Best Only',     'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,160,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/014_fields_payment_terms: done';
END $$;
