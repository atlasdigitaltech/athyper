-- 035_version_fields/013_fields_banking.sql
-- Version-bound entity_field rows for Banking/Payment entities (87–91)
-- Entities: bank_party, bank_account, bank_account_link,
--           bank_account_house_config, payment_method
-- NOTE: bank_party boolean cols supports_swift/sepa/ach (starts with supports_)
--       and payment_method capability flags (requires_*/supports_*) are omitted —
--       they violate the ef_bool_naming_chk constraint.
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
            (v_ev,'national_bank_code',    'national_bank_code',    'Bank Code',            'string', 'text',  'one','standard',false,false, false, true, 150,v_su),
            (v_ev,'branch_name',           'branch_name',           'Branch Name',          'string', 'text',  'one','standard',false,false, false, true, 160,v_su)
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
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'bank_party_id',       'bank_party_id',       'Bank',              'uuid',   'reference','one','standard',false,true,  false, false,110,v_su),
            (v_ev,'account_holder_name', 'account_holder_name', 'Account Holder',    'string', 'text',     'one','standard',true, false, true,  true, 120,v_su),
            (v_ev,'account_id_type',     'account_id_type',     'Account ID Type',   'enum',   'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'account_id_value',    'account_id_value',    'Account Number',    'string', 'text',     'one','standard',true, false, false, false,140,v_su),
            (v_ev,'account_last4',       'account_last4',       'Last 4',            'string', 'text',     'one','system',  false,false, false, false,150,v_su),
            (v_ev,'currency_code',       'currency_code',       'Currency',          'string', 'text',     'one','standard',true, true,  true,  false,160,v_su),
            (v_ev,'account_nature',      'account_nature',      'Account Nature',    'enum',   'select',   'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'is_verified',         'is_verified',         'Verified',          'boolean','hidden',   'one','standard',false,true,  false, false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
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
            is_searchable, sort_order, created_by, enum_config)
SELECT entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_filterable, is_sortable,
    is_searchable, sort_order, created_by,
    CASE WHEN data_type = 'enum' THEN '{}'::jsonb END
FROM (VALUES
            (v_ev,'owner_type',      'owner_type',      'Owner Type',    'string',  'text',     'one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'owner_id',        'owner_id',        'Owner',         'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'bank_account_id', 'bank_account_id', 'Bank Account',  'uuid',    'reference','one','standard',true, true,  false, false,130,v_su),
            (v_ev,'company_code_id', 'company_code_id', 'Company Code',  'uuid',    'reference','one','standard',false,true,  false, false,140,v_su),
            (v_ev,'purpose',         'purpose',         'Purpose',       'string',  'text',     'one','standard',true, true,  true,  false,150,v_su),
            (v_ev,'is_primary',      'is_primary',      'Primary',       'boolean', 'hidden',   'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'effective_from',  'effective_from',  'Effective From','date',    'date',     'one','standard',true, true,  true,  false,170,v_su),
            (v_ev,'effective_until', 'effective_until', 'Effective To',  'date',    'date',     'one','standard',false,true,  true,  false,180,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── bank_account_house_config ─────────────────────────────────────────────
    -- CONTROL class: description seeded by 000_common_fields (no actual column — harmless)
    SELECT ev.id INTO v_ev FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    WHERE e.name = 'bank_account_house_config' AND ev.version_no = 1;

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
            (v_ev,'bank_account_link_id',  'bank_account_link_id',  'Bank Account Link', 'uuid',    'reference','one','standard',true, true,  false, false,110,v_su),
            (v_ev,'gl_account_id',         'gl_account_id',         'Cash GL Account',   'uuid',    'reference','one','standard',true, true,  false, false,120,v_su),
            (v_ev,'usage_type',            'usage_type',            'Usage Type',        'enum',    'select',   'one','standard',true, true,  true,  false,130,v_su),
            (v_ev,'is_disbursement_enabled','is_disbursement_enabled','Disbursement',     'boolean', 'hidden',   'one','standard',false,true,  false, false,140,v_su),
            (v_ev,'is_collection_enabled', 'is_collection_enabled', 'Collection',        'boolean', 'hidden',   'one','standard',false,true,  false, false,150,v_su),
            (v_ev,'is_default_disbursement','is_default_disbursement','Default Disbursement','boolean','hidden', 'one','standard',false,true,  false, false,160,v_su),
            (v_ev,'is_default_collection', 'is_default_collection', 'Default Collection','boolean', 'hidden',   'one','standard',false,true,  false, false,170,v_su),
            (v_ev,'reconciliation_mode',   'reconciliation_mode',   'Reconciliation',    'enum',    'select',   'one','standard',true, true,  true,  false,180,v_su),
            (v_ev,'priority',              'priority',              'Priority',          'integer', 'number',   'one','standard',false,false, true,  false,190,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    -- ── payment_method ────────────────────────────────────────────────────────
    -- NOTE: requires_*/supports_* capability flags omitted — violate ef_bool_naming_chk
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
            (v_ev,'direction',       'direction',       'Direction',       'enum',    'select','one','standard',true, true,  true,  false,110,v_su),
            (v_ev,'instrument_mode', 'instrument_mode', 'Instrument Mode', 'enum',    'select','one','standard',true, true,  true,  false,120,v_su),
            (v_ev,'sort_order',      'sort_order',      'Sort Order',      'integer', 'number','one','standard',false,false, true,  false,130,v_su)
) AS v(entity_version_id, name, column_name, label, data_type, ui_type,
       cardinality, origin, is_required, is_filterable, is_sortable,
       is_searchable, sort_order, created_by)
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE '035_version_fields/013_fields_banking: done';
END $$;
