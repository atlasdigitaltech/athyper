/* ============================================================================
   Athyper v2.1 — Finance Document Line Meta Seeding

   Registers finance document entities + line entities into meta.entity,
   seeds field dictionaries for line entities, and wires collection fields
   on parent entities.

   This enables the doc-lines-runtime resolver to operate in meta-native mode
   rather than falling back to the static registry.

   Dependencies:
     - meta.entity, meta.entity_version (from 300_meta_entity_registration.sql)
     - meta.field columns from 043_meta_field_enhancement.sql
     - collection_behavior role constraint from 077_collection_role_semantics.sql

   Entities covered:
     - CreditNote → CreditNoteLine
     - DebitNote  → DebitNoteLine
     - PurchaseInvoice → PurchaseInvoiceLine (already registered, needs wiring)
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

DO $$
DECLARE
    v_tenant uuid;
    v_vid    uuid;
    v_eid    uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant — skipping finance document line seeding';
        RETURN;
    END IF;

    -- ========================================================================
    -- §1  Register missing finance document entities
    -- ========================================================================
    -- CreditNote and DebitNote as full-governance document entities
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, engine_tag, created_by)
    VALUES
        (v_tenant, 'ACC', 'CreditNote',  'fin', 'fin', 'credit_note',  'full',       'posting-engine', 'system'),
        (v_tenant, 'ACC', 'DebitNote',   'fin', 'fin', 'debit_note',   'full',       'posting-engine', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- CreditNoteLine and DebitNoteLine as light-governance child entities
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, engine_tag, created_by)
    VALUES
        (v_tenant, 'ACC', 'CreditNoteLine', 'fin', 'fin', 'credit_note_line', 'light', 'posting-engine', 'system'),
        (v_tenant, 'ACC', 'DebitNoteLine',  'fin', 'fin', 'debit_note_line',  'light', 'posting-engine', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- Display config for CreditNote and DebitNote
    UPDATE meta.entity
    SET display_config = '{"displayFields":["credit_note_number","supplier_id","total_amount","status"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'CreditNote';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["debit_note_number","supplier_id","total_amount","status"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'DebitNote';

    -- ========================================================================
    -- §2  Seed field dictionary — PurchaseInvoiceLine
    -- ========================================================================
    -- Infrastructure columns (id, tenant_id, created_at, updated_at) are omitted —
    -- they are implicit system columns handled by the resolver's SYSTEM_COLUMN_NAMES set.

    v_vid := pg_temp.ev_id(v_tenant, 'PurchaseInvoiceLine');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        -- FK to parent (system-managed, not user-editable)
        (v_tenant, v_vid, 'invoice_id',              'invoice_id',              'uuid',     'hidden',  true,   1,  'system',   true,  false, false, 'system'),
        -- Ordering field
        (v_tenant, v_vid, 'line_no',                  'line_no',                 'integer',  'number',  true,   2,  'system',   true,  false, false, 'system'),
        -- User-editable business fields
        (v_tenant, v_vid, 'description',              'description',             'text',     'text',    true,   3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'item_id',                  'item_id',                 'uuid',     'lookup',  false,  4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'warehouse_id',             'warehouse_id',            'uuid',     'lookup',  false,  5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'quantity',                  'quantity',                'decimal',  'number',  true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'uom',                      'uom',                     'text',     'select',  false,  7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'unit_price',               'unit_price',              'decimal',  'money',   true,   8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'amount',                   'amount',                  'decimal',  'money',   true,   9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_code',                 'tax_code',                'text',     'select',  false,  10, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_rate',                 'tax_rate',                'decimal',  'number',  false,  11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_amount',               'tax_amount',              'decimal',  'money',   false,  12, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_inclusive',             'tax_inclusive',           'boolean',  'toggle',  false,  13, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'account_id',               'account_id',              'uuid',     'lookup',  false,  14, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'cost_center_id',           'cost_center_id',          'uuid',     'lookup',  false,  15, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'profit_center_id',         'profit_center_id',        'uuid',     'lookup',  false,  16, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'fp_id',                    'fp_id',                   'uuid',     'lookup',  false,  17, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'asset_id',                 'asset_id',                'uuid',     'lookup',  false,  18, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'inventory_movement_id',    'inventory_movement_id',   'uuid',     'lookup',  false,  19, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tags',                     'tags',                    'jsonb',    'tags',    false,  20, 'business', false, false, false, 'system'),
        -- System-computed fields (hidden from writable set)
        (v_tenant, v_vid, 'spend_category_id',        'spend_category_id',       'uuid',     'hidden',  false,  90, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'commitment_id',            'commitment_id',           'uuid',     'hidden',  false,  91, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'commitment_schedule_id',   'commitment_schedule_id',  'uuid',     'hidden',  false,  92, 'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'resolved_dimension_set_id','resolved_dimension_set_id','uuid',    'hidden',  false,  93, 'system',   true,  false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ========================================================================
    -- §3  Seed field dictionary — CreditNoteLine
    -- ========================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'CreditNoteLine');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        (v_tenant, v_vid, 'credit_note_id',  'credit_note_id',  'uuid',     'hidden',  true,   1,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'line_no',         'line_no',         'integer',  'number',  true,   2,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'description',     'description',     'text',     'text',    true,   3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'quantity',        'quantity',        'decimal',  'number',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'unit_price',      'unit_price',      'decimal',  'money',   true,   5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'amount',          'amount',          'decimal',  'money',   true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_code',        'tax_code',        'text',     'select',  false,  7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_rate',        'tax_rate',        'decimal',  'number',  false,  8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_amount',      'tax_amount',      'decimal',  'money',   false,  9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'account_id',      'account_id',      'uuid',     'lookup',  false,  10, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'cost_center_id',  'cost_center_id',  'uuid',     'lookup',  false,  11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'profit_center_id','profit_center_id','uuid',     'lookup',  false,  12, 'business', false, false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ========================================================================
    -- §4  Seed field dictionary — DebitNoteLine
    -- ========================================================================
    v_vid := pg_temp.ev_id(v_tenant, 'DebitNoteLine');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                is_required, sort_order, origin, is_read_only, is_computed, write_once, created_by) VALUES
        (v_tenant, v_vid, 'debit_note_id',   'debit_note_id',   'uuid',     'hidden',  true,   1,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'line_no',         'line_no',         'integer',  'number',  true,   2,  'system',   true,  false, false, 'system'),
        (v_tenant, v_vid, 'description',     'description',     'text',     'text',    true,   3,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'quantity',        'quantity',        'decimal',  'number',  true,   4,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'unit_price',      'unit_price',      'decimal',  'money',   true,   5,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'amount',          'amount',          'decimal',  'money',   true,   6,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_code',        'tax_code',        'text',     'select',  false,  7,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_rate',        'tax_rate',        'decimal',  'number',  false,  8,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'tax_amount',      'tax_amount',      'decimal',  'money',   false,  9,  'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'account_id',      'account_id',      'uuid',     'lookup',  false,  10, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'cost_center_id',  'cost_center_id',  'uuid',     'lookup',  false,  11, 'business', false, false, false, 'system'),
        (v_tenant, v_vid, 'profit_center_id','profit_center_id','uuid',     'lookup',  false,  12, 'business', false, false, false, 'system')
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- ========================================================================
    -- §5  Wire collection fields on parent entities
    -- ========================================================================
    -- Add cardinality='many' collection field on PurchaseInvoice → PurchaseInvoiceLine
    v_vid := pg_temp.ev_id(v_tenant, 'PurchaseInvoice');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                cardinality, child_entity_name, child_fk_field,
                                collection_behavior,
                                is_required, sort_order, origin, created_by)
        VALUES (
            v_tenant, v_vid, 'Lines', 'lines', 'collection', 'grid',
            'many', 'PurchaseInvoiceLine', 'invoice_id',
            '{"role":"document_lines","ownership":"owned","deleteMode":"cascade","ordering":true,"orderField":"line_no","editorStyle":"grid"}'::jsonb,
            false, 100, 'system', 'system'
        )
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- Add collection field on CreditNote → CreditNoteLine
    v_vid := pg_temp.ev_id(v_tenant, 'CreditNote');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                cardinality, child_entity_name, child_fk_field,
                                collection_behavior,
                                is_required, sort_order, origin, created_by)
        VALUES (
            v_tenant, v_vid, 'Lines', 'lines', 'collection', 'grid',
            'many', 'CreditNoteLine', 'credit_note_id',
            '{"role":"document_lines","ownership":"owned","deleteMode":"cascade","ordering":true,"orderField":"line_no","editorStyle":"grid"}'::jsonb,
            false, 100, 'system', 'system'
        )
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    -- Add collection field on DebitNote → DebitNoteLine
    v_vid := pg_temp.ev_id(v_tenant, 'DebitNote');
    IF v_vid IS NOT NULL THEN
        INSERT INTO meta.field (tenant_id, entity_version_id, name, column_name, data_type, ui_type,
                                cardinality, child_entity_name, child_fk_field,
                                collection_behavior,
                                is_required, sort_order, origin, created_by)
        VALUES (
            v_tenant, v_vid, 'Lines', 'lines', 'collection', 'grid',
            'many', 'DebitNoteLine', 'debit_note_id',
            '{"role":"document_lines","ownership":"owned","deleteMode":"cascade","ordering":true,"orderField":"line_no","editorStyle":"grid"}'::jsonb,
            false, 100, 'system', 'system'
        )
        ON CONFLICT (tenant_id, entity_version_id, name) DO NOTHING;
    END IF;

    RAISE NOTICE 'Finance document line meta seeding complete';
END;
$$;
