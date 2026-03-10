/* ============================================================================
   Athyper v2.1 — Field Dictionary for Asset, FxRevaluation, ConsolidationElimination

   Populates meta.field for entities that were registered in
   300_meta_entity_registration.sql but had no field dictionaries:

     - Asset                      (fin.asset)
     - FxRevaluation              (fin.fx_revaluation_run)
     - ConsolidationElimination   (fin.consolidation_elimination)

   Also upgrades FxRevaluation → fin.fx_revaluation_run (richer DDL)
   and ensures both FxRevaluation & ConsolidationElimination have
   governance_level = 'full' so they appear in the entity list.

   Dependencies:
     - meta.entity, meta.entity_version (from 300_meta_entity_registration.sql)
   ============================================================================ */

-- Temporary helper: resolve entity_version v1 id by entity name
CREATE OR REPLACE FUNCTION pg_temp.ev_id(p_tenant uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT ev.id
    FROM meta.entity_version ev
    JOIN meta.entity e ON ev.entity_id = e.id AND ev.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant AND e.name = p_name AND ev.version_no = 1
    LIMIT 1;
$$;

-- ============================================================================
-- §0  Upgrade entity registrations
-- ============================================================================
DO $$
BEGIN
    -- FxRevaluation: point to the richer fx_revaluation_run table
    UPDATE meta.entity
    SET    table_name        = 'fx_revaluation_run',
           governance_level  = 'full',
           engine_tag        = COALESCE(engine_tag, 'federation-engine'),
           entity_short      = COALESCE(entity_short, 'FXR')
    WHERE  name = 'FxRevaluation'
      AND  (table_name = 'fx_revaluation' OR governance_level = 'audit_only');

    -- ConsolidationElimination: upgrade to full governance
    UPDATE meta.entity
    SET    governance_level  = 'full',
           entity_short      = COALESCE(entity_short, 'ICELM')
    WHERE  name = 'ConsolidationElimination'
      AND  governance_level = 'audit_only';

    -- Asset: ensure full governance (already registered as full, belt-and-braces)
    UPDATE meta.entity
    SET    governance_level  = 'full',
           entity_short      = COALESCE(entity_short, 'AST')
    WHERE  name = 'Asset'
      AND  governance_level != 'full';

    -- Ensure all three are active (not draft)
    UPDATE meta.entity
    SET    status = 'active', status_changed_at = now(), status_changed_by = 'system'
    WHERE  name IN ('Asset', 'FxRevaluation', 'ConsolidationElimination')
      AND  status = 'draft';

    -- Set display_config for list-page column headers
    UPDATE meta.entity
    SET display_config = '{"displayFields":["asset_number","name","asset_class","acquisition_cost","status"]}'::jsonb
    WHERE name = 'Asset' AND (display_config IS NULL OR display_config = '{}'::jsonb);

    UPDATE meta.entity
    SET display_config = '{"displayFields":["revaluation_code","revaluation_date","functional_currency_code","net_amount","status"]}'::jsonb
    WHERE name = 'FxRevaluation' AND (display_config IS NULL OR display_config = '{}'::jsonb);

    UPDATE meta.entity
    SET display_config = '{"displayFields":["elimination_type","source_entity_code","dest_entity_code","amount","status"]}'::jsonb
    WHERE name = 'ConsolidationElimination' AND (display_config IS NULL OR display_config = '{}'::jsonb);
END $$;


-- ============================================================================
-- §1  Field dictionaries (first tenant)
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_vid    uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant — skipping asset/fxreval/consolelim field seeding';
        RETURN;
    END IF;

    -- ====================================================================
    -- §1a  Asset  (fin.asset)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'Asset');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Identity
        (v_tenant, v_vid, 'Asset Number',       'asset_number',       'text',        'code',     true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Name',               'name',               'text',        'text',     true,   2,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Description',         'description',        'text',        'textarea', false,  3,  'business', false, false, false, 'system'),
        -- Classification
        (v_tenant, v_vid, 'Asset Class',         'asset_class',        'text',        'select',   true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Status',              'status',             'text',        'select',   true,   5,  'system',   true,  false, false, 'system'),
        -- Acquisition
        (v_tenant, v_vid, 'Acquisition Date',    'acquisition_date',   'date',        'date',     true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Acquisition Cost',    'acquisition_cost',   'decimal',     'money',    true,   7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',            'currency_code',      'text',        'lookup',   true,   8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Residual Value',      'residual_value',     'decimal',     'money',    true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Useful Life (Months)','useful_life_months', 'integer',     'number',   true,  10,  'business', false, false, false, 'system'),
        -- Context
        (v_tenant, v_vid, 'Operating Unit',      'ou_id',              'uuid',        'lookup',   false, 11,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Cost Center',         'cost_center_id',     'uuid',        'lookup',   false, 12,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Location',            'location',           'text',        'text',     false, 13,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Vendor',              'vendor_id',          'uuid',        'lookup',   false, 14,  'business', false, false, false, 'system'),
        -- Flags
        (v_tenant, v_vid, 'Capitalized from WIP','capitalized_from_wip','boolean',    'toggle',   false, 15,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Parent Asset',        'parent_asset_id',    'uuid',        'lookup',   false, 16,  'business', false, false, false, 'system'),
        -- Metadata
        (v_tenant, v_vid, 'Tags',                'tags',               'jsonb',       'hidden',   false, 90,  'system',   false, false, false, 'system'),
        (v_tenant, v_vid, 'Metadata',            'metadata',           'jsonb',       'hidden',   false, 91,  'system',   false, false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §1b  FxRevaluation  (fin.fx_revaluation_run)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'FxRevaluation');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Identity
        (v_tenant, v_vid, 'Revaluation Code',   'revaluation_code',   'text',        'code',     true,   1,  'system',   false, false, true,  'system'),
        (v_tenant, v_vid, 'Description',          'description',        'text',        'textarea', false,  2,  'business', false, false, false, 'system'),
        -- Period context
        (v_tenant, v_vid, 'Period Code',          'period_code',        'text',        'text',     true,   3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Revaluation Date',     'revaluation_date',   'date',        'date',     true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Posting Date',          'posting_date',       'date',        'date',     false,  5,  'business', false, false, false, 'system'),
        -- Rate source
        (v_tenant, v_vid, 'Rate Source',           'rate_source',        'text',        'select',   true,   6,  'business', false, false, false, 'system'),
        -- OU + Currency
        (v_tenant, v_vid, 'Operating Unit',        'ou_id',              'uuid',        'lookup',   true,   7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Functional Currency',   'functional_currency_code','text',   'lookup',   true,   8,  'business', false, false, false, 'system'),
        -- Aggregated amounts (MC-4)
        (v_tenant, v_vid, 'Total Gain',            'total_gain',         'decimal',     'money',    false,  9,  'system',   true,  true,  false, 'system'),
        (v_tenant, v_vid, 'Total Loss',            'total_loss',         'decimal',     'money',    false, 10,  'system',   true,  true,  false, 'system'),
        (v_tenant, v_vid, 'Net Amount',            'net_amount',         'decimal',     'money',    false, 11,  'system',   true,  true,  false, 'system'),
        (v_tenant, v_vid, 'Line Count',            'line_count',         'integer',     'number',   false, 12,  'system',   true,  true,  false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',                'status',             'text',        'select',   true,  13,  'system',   true,  false, false, 'system'),
        -- Decision Grid
        (v_tenant, v_vid, 'Decision Score',        'decision_score',     'decimal',     'hidden',   false, 90,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Route',        'approval_route',     'text',        'hidden',   false, 91,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Approval Instance',     'approval_instance_id','uuid',       'hidden',   false, 92,  'system',   true,  false, false, 'system'),
        -- Posting
        (v_tenant, v_vid, 'Journal Entry',         'je_id',              'uuid',        'hidden',   false, 93,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted At',             'posted_at',          'timestamptz', 'hidden',   false, 94,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Posted By',             'posted_by',          'uuid',        'hidden',   false, 95,  'system',   true,  false, false, 'system'),
        -- Reversal
        (v_tenant, v_vid, 'Reversal JE',           'reversal_je_id',     'uuid',        'hidden',   false, 96,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Reversed At',           'reversed_at',        'timestamptz', 'hidden',   false, 97,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'Reversed By',           'reversed_by',        'uuid',        'hidden',   false, 98,  'system',   true,  false, false, 'system'),
        -- System
        (v_tenant, v_vid, 'Transaction ID',        'txn_id',             'uuid',        'hidden',   true,  99,  'system',   false, false, true,  'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ====================================================================
    -- §1c  ConsolidationElimination  (fin.consolidation_elimination)
    -- ====================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'ConsolidationElimination');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- Period
        (v_tenant, v_vid, 'Fiscal Year',           'fiscal_year',         'integer',     'number',  true,   1,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Period Number',          'period_number',       'integer',     'number',  true,   2,  'business', false, false, false, 'system'),
        -- Classification
        (v_tenant, v_vid, 'Elimination Type',       'elimination_type',    'text',        'select',  true,   3,  'business', false, false, false, 'system'),
        -- Counterparties
        (v_tenant, v_vid, 'Source Entity Code',     'source_entity_code',  'text',        'lookup',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Dest Entity Code',       'dest_entity_code',    'text',        'lookup',  true,   5,  'business', false, false, false, 'system'),
        -- Amount
        (v_tenant, v_vid, 'Amount',                 'amount',              'decimal',     'money',   true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'Currency',               'currency_code',       'text',        'lookup',  true,   7,  'business', false, false, false, 'system'),
        -- Posting
        (v_tenant, v_vid, 'Journal Entry',          'reference_je_id',     'uuid',        'hidden',  false, 90,  'system',   true,  false, false, 'system'),
        -- Status
        (v_tenant, v_vid, 'Status',                 'status',              'text',        'select',  true,   8,  'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    RAISE NOTICE 'Field dictionary seeded for Asset, FxRevaluation, ConsolidationElimination';
END;
$$;

-- ============================================================================
-- §2  Replicate fields to all other tenants
-- ============================================================================
DO $$
DECLARE
    v_source_tenant uuid;
    v_target_tenant uuid;
    v_source_vid    uuid;
    v_target_vid    uuid;
    v_entity_name   text;
BEGIN
    SELECT id INTO v_source_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_source_tenant IS NULL THEN RETURN; END IF;

    FOR v_target_tenant IN
        SELECT id FROM core.tenant WHERE id != v_source_tenant
    LOOP
        FOREACH v_entity_name IN ARRAY ARRAY[
            'Asset', 'FxRevaluation', 'ConsolidationElimination'
        ]
        LOOP
            v_source_vid := pg_temp.ev_id(v_source_tenant, v_entity_name);
            v_target_vid := pg_temp.ev_id(v_target_tenant, v_entity_name);

            IF v_source_vid IS NOT NULL AND v_target_vid IS NOT NULL THEN
                INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                        is_required, sort_order, origin, is_read_only, is_computed, write_once,
                                        is_unique, is_searchable, is_filterable,
                                        default_value, validation, lookup_config, is_active, created_by)
                SELECT v_target_tenant, v_target_vid, f.name, f.column_name, f.data_type, f.ui_type,
                       f.is_required, f.sort_order, f.origin, f.is_read_only, f.is_computed, f.write_once,
                       f.is_unique, f.is_searchable, f.is_filterable,
                       f.default_value, f.validation, f.lookup_config, f.is_active, 'system'
                FROM meta.field f
                WHERE f.tenant_id = v_source_tenant AND f.entity_version_id = v_source_vid
                ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Asset/FxRevaluation/ConsolidationElimination fields replicated to all tenants';
END $$;
