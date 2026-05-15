-- 035_version_fields/013_fields_banking.sql
-- Version-bound entity_field rows for Banking/Payment entities (87–91)
-- Entities: bank_party, bank_account, bank_account_link,
--           bank_account_house_config, payment_method
-- Capability flags use the canonical supports_* / requires_* column names.
-- Idempotent: ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev uuid;
BEGIN

    -- ── bank_party ────────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_party' AND ev.version_no = 1;

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
            (v_ev,'country_code',          'country_code',          'Country',              'string', 'text',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'institution_type',      'institution_type',      'Institution Type',     'enum',   'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'bic',                   'bic',                   'BIC / SWIFT',          'string', 'text',  'one','standard',false,true,  false, true, 130,v_su),
            (v_ev,'national_bank_code_type','national_bank_code_type','Bank Code Type',      'string', 'text',  'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'national_bank_code',    'national_bank_code',    'Bank Code',            'string', 'text',    'one','standard',false,false, false, true, 150,v_su),
            (v_ev,'branch_name',           'branch_name',           'Branch Name',          'string', 'text',    'one','standard',false,false, false, true, 160,v_su),
            (v_ev,'supports_swift',        'supports_swift',        'Supports SWIFT',       'boolean','checkbox','one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'supports_local_clearing','supports_local_clearing','Supports Local Clearing','boolean','checkbox','one','standard',false,true,true,false,180,v_su),
            (v_ev,'supports_sepa',         'supports_sepa',         'Supports SEPA',        'boolean','checkbox','one','standard',false,true,  true,  false,190,v_su),
            (v_ev,'supports_ach',          'supports_ach',          'Supports ACH',         'boolean','checkbox','one','standard',false,true,  true,  false,200,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account ──────────────────────────────────────────────────────────
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account' AND ev.version_no = 1;

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
            (v_ev,'bank_party_id',       'bank_party_id',       'Bank',              'uuid',   'reference','one','standard',false,true,  false, false,'{"ref_entity":"bank_party"}'::jsonb,110,v_su),
            (v_ev,'account_holder_name', 'account_holder_name', 'Account Holder',    'string', 'text',     'one','standard',true, false, true,  true, NULL::jsonb,120,v_su),
            (v_ev,'account_id_type',     'account_id_type',     'Account ID Type',   'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'account_id_value',    'account_id_value',    'Account Number',    'string', 'text',     'one','standard',true, false, false, false,NULL::jsonb,140,v_su),
            (v_ev,'account_last4',       'account_last4',       'Last 4',            'string', 'text',     'one','system',  false,false, false, false,NULL::jsonb,150,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',          'string', 'text',     'one','standard',true, true,  true,  false,NULL::jsonb,160,v_su),
            (v_ev,'account_nature',      'account_nature',      'Account Nature',    'enum',   'select',   'one','standard',true, true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'is_verified',         'is_verified',         'Verified',          'boolean','hidden',   'one','standard',false,true,  false, false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_link ─────────────────────────────────────────────────────
    -- RELATION class: only id, tenant_id, created_at, created_by in common fields
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_link' AND ev.version_no = 1;

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
            (v_ev,'owner_type',      'owner_type',      'Owner Type',    'string',  'text',     'one','standard',true, true,  true,  false,NULL::jsonb,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',         'uuid',    'reference','one','standard',true, true,  false, false,NULL::jsonb,120,v_su),
            (v_ev,'bank_account_id', 'bank_account_id', 'Bank Account',  'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"bank_account"}'::jsonb,130,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',    'reference','one','standard',false,true,  false, false,'{"ref_entity":"company_code"}'::jsonb,140,v_su),
            (v_ev,'purpose',         'purpose',         'Purpose',       'string',  'text',     'one','standard',true, true,  true,  false,NULL::jsonb,150,v_su),
            (v_ev,'is_primary',      'is_primary',      'Primary',       'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,160,v_su),
            (v_ev,'effective_from',  'effective_from',  'Effective From','date',    'date',     'one','standard',true, true,  true,  false,NULL::jsonb,170,v_su),
            (v_ev,'effective_until', 'effective_until', 'Effective To',  'date',    'date',     'one','standard',false,true,  true,  false,NULL::jsonb,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_house_config ─────────────────────────────────────────────
    -- CONTROL class. The table has no description column; 099 removes any stale
    -- common-field description row left behind by older seed runs.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_house_config' AND ev.version_no = 1;

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
            (v_ev,'bank_account_link_id',  'bank_account_link_id',  'Bank Account Link', 'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"bank_account_link"}'::jsonb,110,v_su),
            (v_ev,'gl_account_id',         'gl_account_id',         'Cash GL Account',   'uuid',    'reference','one','standard',true, true,  false, false,'{"ref_entity":"gl_account"}'::jsonb,120,v_su),
            (v_ev,'usage_type',            'usage_type',            'Usage Type',        'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,130,v_su),
            (v_ev,'is_disbursement_enabled','is_disbursement_enabled','Disbursement',     'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,140,v_su),
            (v_ev,'is_collection_enabled', 'is_collection_enabled', 'Collection',        'boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,150,v_su),
            (v_ev,'is_default_disbursement','is_default_disbursement','Default Disbursement','boolean','hidden', 'one','standard',false,true,  false, false,NULL::jsonb,160,v_su),
            (v_ev,'is_default_collection', 'is_default_collection', 'Default Collection','boolean', 'hidden',   'one','standard',false,true,  false, false,NULL::jsonb,170,v_su),
            (v_ev,'reconciliation_mode',   'reconciliation_mode',   'Reconciliation',    'enum',    'select',   'one','standard',true, true,  true,  false,NULL::jsonb,180,v_su),
            (v_ev,'priority',              'priority',              'Priority',          'integer', 'number',   'one','standard',false,false, true,  false,NULL::jsonb,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, validation, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_method ────────────────────────────────────────────────────────
    -- requires_bank_interface is a behavioral capability. Execution bindings live
    -- in control.payment_method_interface_binding, not a master entity picker.
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'payment_method' AND ev.version_no = 1;

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
            (v_ev,'direction',                  'direction',                  'Direction',                 'enum',   'select',  'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'instrument_mode',            'instrument_mode',            'Instrument Mode',           'enum',   'select',  'one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'sort_order',                 'sort_order',                 'Sort Order',                'integer','number',  'one','standard',false,false, true,  false,130,v_su),
            (v_ev,'requires_bank_account',      'requires_bank_account',      'Requires Bank Account',     'boolean','checkbox','one','standard',false,true,  true,  false,140,v_su),
            (v_ev,'requires_counterparty_bank', 'requires_counterparty_bank', 'Requires Counterparty Bank','boolean','checkbox','one','standard',false,true,  true,  false,150,v_su),
            (v_ev,'requires_bank_interface',    'requires_bank_interface',    'Requires Bank Interface',   'boolean','checkbox','one','standard',false,true,  true,  false,160,v_su),
            (v_ev,'requires_reference_number',  'requires_reference_number',  'Requires Reference No.',    'boolean','checkbox','one','standard',false,true,  true,  false,170,v_su),
            (v_ev,'supports_batch',             'supports_batch',             'Supports Batch',            'boolean','checkbox','one','standard',false,true,  true,  false,180,v_su),
            (v_ev,'supports_partial',           'supports_partial',           'Supports Partial',          'boolean','checkbox','one','standard',false,true,  true,  false,190,v_su),
            (v_ev,'supports_reversal',          'supports_reversal',          'Supports Reversal',         'boolean','checkbox','one','standard',false,true,  true,  false,200,v_su),
            (v_ev,'supports_file_generation',   'supports_file_generation',   'Supports File Generation',  'boolean','checkbox','one','standard',false,true,  true,  false,210,v_su),
            (v_ev,'supports_real_time_api',     'supports_real_time_api',     'Supports Real-Time API',    'boolean','checkbox','one','standard',false,true,  true,  false,220,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/013_fields_banking: done';
END $$;
