-- ============================================================================
-- 042p_p2p_foundation_contract.sql
--
-- Production-grade P2P entity metadata foundation.
--
-- Purpose:
--   * Make the authored metadata match the reset DDL.
--   * Normalize shared P2P line fields through one catalog instead of repeating
--     PR/PO/GR/SES/AP line definitions by hand.
--   * Retire stale POC-era fields by comparing active metadata with the actual
--     document columns present after reset.
--
-- Runs after the AP/PO/create-flow contract files and before relation/action
-- wiring. The 092 surface compiler consumes the display_config + entity_field
-- rows authored here.
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- Â§1 Entity runtime display + capability contracts.
WITH entity_contract(entity_code, title_field, subtitle_field, default_sort_field, list_columns, feature_patch, create_mode, numbering_strategy) AS (
    VALUES
        ('purchase_requisition', ARRAY['code','name']::text[], ARRAY['requested_by','status']::text[], 'code',
            ARRAY['code','name','requested_by','required_by_date','total_amount','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"p2p_stage":"request"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('purchase_requisition_line', ARRAY['line_no','item_description']::text[], ARRAY['procurement_type','line_type']::text[], 'line_no',
            ARRAY['line_no','item_id','item_description','quantity','unit_price','net_amount','status']::text[],
            '{"line_ui_variant":"procure","has_pricing_components":true,"has_accounting_distribution":true,"has_schedules":true,"p2p_stage":"request_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('commitment', ARRAY['code','name']::text[], ARRAY['party_id','status']::text[], 'code',
            ARRAY['code','name','party_id','document_date','total_amount','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"has_schedules":true,"p2p_stage":"commitment"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('purchase_order', ARRAY['code','name']::text[], ARRAY['party_id','status']::text[], 'code',
            ARRAY['code','name','party_id','document_date','total_amount','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"has_schedules":true,"backing_source":"commitment","p2p_stage":"commitment"}'::jsonb,
            'EARLY_DRAFT', 'AUTO_ON_PROMOTE'),
        ('commitment_line', ARRAY['line_no','item_description']::text[], ARRAY['procurement_type','line_type']::text[], 'line_no',
            ARRAY['line_no','item_description','quantity','unit_price','pricing_net_amount','status']::text[],
            '{"line_ui_variant":"procure","has_pricing_components":true,"has_accounting_distribution":true,"has_schedules":true,"p2p_stage":"commitment_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('purchase_order_confirmation', ARRAY['confirmation_number']::text[], ARRAY['supplier_id','status']::text[], 'confirmation_number',
            ARRAY['confirmation_number','supplier_id','supplier_confirmation_date','document_date','status']::text[],
            '{"has_lines":true,"has_lifecycle":true,"p2p_stage":"supplier_confirmation"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('purchase_order_confirmation_line', ARRAY['line_no','commitment_line_id']::text[], ARRAY['line_status']::text[], 'line_no',
            ARRAY['line_no','commitment_line_id','confirmed_quantity','confirmed_unit_price','quantity_variance','price_variance','line_status']::text[],
            '{"line_ui_variant":"procure_confirmation","p2p_stage":"supplier_confirmation_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('delivery_note', ARRAY['delivery_note_number']::text[], ARRAY['supplier_id','status']::text[], 'delivery_note_number',
            ARRAY['delivery_note_number','supplier_id','delivery_date','expected_arrival_date','actual_arrival_date','status']::text[],
            '{"has_lines":true,"has_lifecycle":true,"p2p_stage":"delivery"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('delivery_note_line', ARRAY['line_no','item_description']::text[], ARRAY['commitment_line_id']::text[], 'line_no',
            ARRAY['line_no','item_id','item_description','shipped_quantity','received_quantity','accepted_quantity']::text[],
            '{"line_ui_variant":"delivery_note","p2p_stage":"delivery_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('receipt', ARRAY['code','name']::text[], ARRAY['supplier_id','status']::text[], 'code',
            ARRAY['code','supplier_id','received_date','posting_date','total_amount','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"p2p_stage":"receipt"}'::jsonb,
            'SOURCE_DOCUMENT_CREATE', 'auto_or_manual'),
        ('receipt_line', ARRAY['line_no','item_description']::text[], ARRAY['commitment_line_id','delivery_note_line_id']::text[], 'line_no',
            ARRAY['line_no','item_id','item_description','received_quantity','accepted_quantity','rejected_quantity','unit_price','net_amount']::text[],
            '{"line_ui_variant":"receipt","has_pricing_components":true,"has_accounting_distribution":true,"p2p_stage":"receipt_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('service_sheet', ARRAY['service_sheet_number','code']::text[], ARRAY['supplier_id','status']::text[], 'service_sheet_number',
            ARRAY['service_sheet_number','supplier_id','service_period_from','service_period_to','total_amount','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"p2p_stage":"service_acceptance"}'::jsonb,
            'SOURCE_DOCUMENT_CREATE', 'auto_or_manual'),
        ('service_sheet_line', ARRAY['line_no','item_description']::text[], ARRAY['commitment_line_id','milestone_name']::text[], 'line_no',
            ARRAY['line_no','item_id','item_description','quantity','unit_price','net_amount','completion_pct']::text[],
            '{"line_ui_variant":"service_sheet","has_pricing_components":true,"has_accounting_distribution":true,"p2p_stage":"service_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('purchase_invoice', ARRAY['code','supplier_invoice_number']::text[], ARRAY['supplier_id','match_status']::text[], 'code',
            ARRAY['code','supplier_id','supplier_invoice_number','supplier_invoice_date','posting_date','total_amount','tax_amount','payable_amount','match_status','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"has_pricing_components":true,"has_accounting_distribution":true,"has_matching":true,"p2p_stage":"ap_invoice"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('purchase_invoice_line', ARRAY['line_no','item_description']::text[], ARRAY['commitment_line_id','match_status']::text[], 'line_no',
            ARRAY['line_no','item_id','item_description','quantity','unit_price','net_amount','tax_amount','gross_amount','match_status']::text[],
            '{"line_ui_variant":"procure","has_pricing_components":true,"has_accounting_distribution":true,"has_schedules":true,"has_matching":true,"p2p_stage":"ap_invoice_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('payment_entry', ARRAY['payment_number']::text[], ARRAY['supplier_id','status']::text[], 'payment_number',
            ARRAY['payment_number','supplier_id','posting_date','payment_amount','currency_code','status']::text[],
            '{"has_lines":true,"has_workflow":true,"has_lifecycle":true,"p2p_stage":"payment"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('payment_entry_allocation', ARRAY['line_no','purchase_invoice_id']::text[], ARRAY['commitment_id']::text[], 'line_no',
            ARRAY['line_no','purchase_invoice_id','commitment_id','allocated_amount','discount_amount','withholding_tax_amount','net_payment_amount']::text[],
            '{"line_ui_variant":"payment_allocation","p2p_stage":"payment_allocation"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('accounting_distribution', ARRAY['distribution_no','source_line_id']::text[], ARRAY['distribution_basis','account_source']::text[], 'distribution_no',
            ARRAY['distribution_no','distribution_basis','split_pct','distributed_amount','currency_code','gl_account_id','account_source','budget_check_result']::text[],
            '{"is_polymorphic_child":true,"child_role":"accounting_distribution","p2p_stage":"allocation"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('pricing_component', ARRAY['sequence','condition_type_id']::text[], ARRAY['term_type','basis']::text[], 'sequence',
            ARRAY['sequence','term_type','condition_type_id','basis','rate_value','amount_value','computed_amount','currency_code','origin']::text[],
            '{"is_polymorphic_child":true,"child_role":"pricing_component","p2p_stage":"pricing"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('schedule_line', ARRAY['schedule_no','schedule_kind']::text[], ARRAY['scheduled_date','fulfillment_status']::text[], 'schedule_no',
            ARRAY['schedule_no','schedule_kind','scheduled_quantity','scheduled_amount','scheduled_date','fulfilled_quantity','remaining_quantity','fulfillment_status']::text[],
            '{"is_polymorphic_child":true,"child_role":"schedule_line","p2p_stage":"schedule"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('journal_entry', ARRAY['je_number']::text[], ARRAY['posting_date','status']::text[], 'je_number',
            ARRAY['je_number','posting_date','description','total_debit','total_credit','status']::text[],
            '{"p2p_stage":"ledger"}'::jsonb,
            'FORM_ONLY', 'auto_or_manual'),
        ('journal_line', ARRAY['line_no','description']::text[], ARRAY['gl_account_id']::text[], 'line_no',
            ARRAY['line_no','gl_account_id','transaction_debit','transaction_credit','description']::text[],
            '{"line_ui_variant":"journal","p2p_stage":"ledger_line"}'::jsonb,
            'FORM_ONLY', 'none'),
        ('journal_line_reference', ARRAY['ref_type','ref_doc_id']::text[], ARRAY['journal_line_id']::text[], 'ref_type',
            ARRAY['ref_type','ref_doc_id','journal_line_id','metadata']::text[],
            '{"is_polymorphic_child":true,"child_role":"journal_line_reference","p2p_stage":"ledger_reference"}'::jsonb,
            'FORM_ONLY', 'none')
)
UPDATE control.entity e
   SET display_config = COALESCE(e.display_config, '{}'::jsonb)
                        || jsonb_build_object(
                            'title_field', c.title_field[1],
                            'title_fields', to_jsonb(c.title_field),
                            'subtitle_fields', to_jsonb(c.subtitle_field),
                            'default_sort_field', c.default_sort_field,
                            'default_sort_order', 'asc',
                            'list_columns', to_jsonb(c.list_columns),
                            'list_density', 'compact',
                            'runtime_canvas_flags', CASE
                              WHEN c.entity_code IN (
                                'purchase_requisition','purchase_order','purchase_invoice','receipt',
                                'service_sheet','purchase_order_confirmation','delivery_note'
                              ) THEN jsonb_build_object(
                                'descriptorSurfaceShell', true,
                                'groupedForms', true,
                                'operationDispatch', c.entity_code IN ('purchase_order','purchase_invoice')
                              )
                              ELSE '{}'::jsonb
                            END
                        ),
       feature_flags = COALESCE(e.feature_flags, '{}'::jsonb) || c.feature_patch,
       create_mode = c.create_mode,
       numbering_strategy = c.numbering_strategy,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM entity_contract c
 WHERE e.entity_code = c.entity_code
   AND e.tenant_id IS NULL;

-- Â§2 Ensure version-1 rows for every P2P runtime entity before field upserts.
-- Â§1a PO / Commitment non-catalog line authoring contract.
-- The procure line composer reads display_config.procure_line before falling
-- back to broad group conventions. Keep the purchase-order line layout explicit
-- so text fields such as line_type never get mistaken for the description body.
UPDATE control.entity e
   SET display_config = COALESCE(e.display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'line_ui_variant', 'procure',
                             'procure_line', jsonb_build_object(
                                 'amount_field', 'net_amount',
                                 'currency_field', 'currency_code',
                                 'composer_sections', jsonb_build_array(
                                     jsonb_build_object(
                                         'key', 'item',
                                         'label', 'Item',
                                         'groups', jsonb_build_array('item'),
                                         'fields', jsonb_build_array(
                                             'item_id',
                                             'item_description',
                                             'procurement_type',
                                             'line_type'
                                         ),
                                         'default_open', true
                                     ),
                                     jsonb_build_object(
                                         'key', 'financial',
                                         'label', 'How Much',
                                         'groups', jsonb_build_array('quantities', 'pricing', 'currency'),
                                         'fields', jsonb_build_array(
                                             'uom_code',
                                             'quantity',
                                             'unit_price',
                                             'price_unit',
                                             'currency_code'
                                         ),
                                         'default_open', true
                                     ),
                                     jsonb_build_object(
                                         'key', 'classify',
                                         'label', 'Classify',
                                         'type', 'classification',
                                         'groups', jsonb_build_array('classification'),
                                         'fields', jsonb_build_array(
                                             'commodity_category_id',
                                             'business_intent_id',
                                             'classification_decision',
                                             'asset_class_id'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'key', 'accounting',
                                         'label', 'Accounting',
                                         'groups', jsonb_build_array('dates', 'dimensions', 'logistics', 'addresses'),
                                         'fields', jsonb_build_array(
                                             'required_by_date',
                                             'site_id',
                                             'warehouse_id',
                                             'storage_location',
                                             'shipto_address_id',
                                             'billto_address_id',
                                             'billfrom_address_id',
                                             'supplier_id',
                                             'shipfrom_address_id',
                                             'remitto_address_id'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'key', 'tax',
                                         'label', 'Tax',
                                         'groups', jsonb_build_array('tax'),
                                         'fields', jsonb_build_array(
                                             'tax_group_id',
                                             'withholding_tax_group_id'
                                         )
                                     )
                                 ),
                                 'item_tab', jsonb_build_object(
                                     'primary_fields', jsonb_build_array(
                                         'item_id',
                                         'item_description',
                                         'procurement_type',
                                         'line_type'
                                     ),
                                     'classify_fields', jsonb_build_array(
                                         'commodity_category_id',
                                         'business_intent_id',
                                         'classification_decision',
                                         'asset_class_id'
                                     ),
                                     'quantity_row', jsonb_build_array(
                                         'uom_code',
                                         'quantity',
                                         'unit_price',
                                         'price_unit',
                                         'currency_code'
                                     )
                                 ),
                                 'editor_tabs', jsonb_build_array(
                                     jsonb_build_object('key', 'item', 'label', 'Item', 'groups', jsonb_build_array('item', 'quantities', 'pricing', 'currency')),
                                     jsonb_build_object('key', 'classify', 'label', 'Classify', 'type', 'classification', 'groups', jsonb_build_array('classification')),
                                     jsonb_build_object('key', 'accounting', 'label', 'Accounting', 'groups', jsonb_build_array('dates', 'dimensions', 'logistics', 'addresses')),
                                     jsonb_build_object('key', 'tax', 'label', 'Tax', 'groups', jsonb_build_array('tax')),
                                     jsonb_build_object('key', 'reference', 'label', 'Reference', 'type', 'reference_links', 'groups', jsonb_build_array('source', 'matching', 'reference'))
                                 )
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE e.entity_code = 'commitment_line'
   AND e.tenant_id IS NULL;

-- Section 1b: Shared child grid presentation. Amount formatting remains field-owned
-- through money_config; line_grid only controls list/table presentation.
WITH line_grid_contract(entity_code, line_reference) AS (
    VALUES
        ('commitment_line',
            '{"source":"self","mode":"own_row","fields":["line_no","item_description"],"description_clamp":2}'::jsonb),
        ('schedule_line',
            '{"source":"parent_line","mode":"compact","fields":["line_no","item_description"],"description_clamp":2}'::jsonb),
        ('accounting_distribution',
            '{"source":"parent_line","mode":"compact","fields":["line_no","item_description"],"description_clamp":2}'::jsonb)
)
UPDATE control.entity e
   SET display_config = jsonb_set(
           COALESCE(e.display_config, '{}'::jsonb),
           '{line_grid}',
           COALESCE(e.display_config->'line_grid', '{}'::jsonb)
           || jsonb_build_object(
               'money_header_currency', 'document',
               'money_cell_currency', 'field_config',
               'money_tooltip_currency', true,
               'line_reference', lg.line_reference
           ),
           true
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM line_grid_contract lg
 WHERE e.entity_code = lg.entity_code
   AND e.tenant_id IS NULL;

WITH p2p_entities(entity_code) AS (
    VALUES
        ('accounting_distribution'), ('commitment'), ('commitment_line'),
        ('delivery_note'), ('delivery_note_line'), ('journal_entry'),
        ('journal_line'), ('journal_line_reference'), ('payment_entry'),
        ('payment_entry_allocation'), ('pricing_component'), ('purchase_invoice'),
        ('purchase_invoice_line'), ('purchase_order'), ('purchase_order_confirmation'),
        ('purchase_order_confirmation_line'), ('purchase_requisition'),
        ('purchase_requisition_line'), ('receipt'), ('receipt_line'),
        ('schedule_line'), ('service_sheet'), ('service_sheet_line')
)
INSERT INTO control.entity_version (
    entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by, updated_by
)
SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial Version', 'structural', now(),
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000'
  FROM p2p_entities pe
  JOIN control.entity e ON e.entity_code = pe.entity_code AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET status = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

-- Â§3 DDL-driven stale-field retirement. This catches PI/PIL POC-era fields
-- such as description, discount_pct, subtotal_amount, invoice_date, notes,
-- payment_method_id and any future drift where active metadata points at a
-- dropped physical column.
WITH managed_entities(entity_code) AS (
    VALUES
        ('accounting_distribution'), ('commitment'), ('commitment_line'),
        ('delivery_note'), ('delivery_note_line'), ('payment_entry'),
        ('payment_entry_allocation'), ('pricing_component'), ('purchase_invoice'),
        ('purchase_invoice_line'), ('purchase_order'), ('purchase_order_confirmation'),
        ('purchase_order_confirmation_line'), ('purchase_requisition'),
        ('purchase_requisition_line'), ('receipt'), ('receipt_line'),
        ('schedule_line'), ('service_sheet'), ('service_sheet_line')
)
UPDATE control.entity_field ef
   SET is_active = false,
       is_deprecated = true,
       visibility = '{"hidden":true}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
  JOIN managed_entities me ON me.entity_code = e.entity_code
 WHERE ef.entity_version_id = ev.id
   AND ev.tenant_id IS NULL
   AND ev.version_no = 1
   AND e.tenant_id IS NULL
   AND COALESCE(ef.column_name, '') <> ''
   AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns c
       WHERE c.table_schema = e.table_schema
         AND c.table_name = e.table_name
         AND c.column_name = ef.column_name
   );

-- Â§4 Shared P2P line/child field catalog. Fields are only inserted for
-- entities where the physical column exists, so the catalog can safely cover
-- PR, Commitment, Invoice, Receipt, SES, DN, POC, AD, PC, Schedule and Payment
-- allocation without dead metadata.
WITH line_entities(entity_code, primary_amount_field, primary_currency_field) AS (
    VALUES
        ('purchase_requisition_line', 'net_amount', 'currency_code'),
        ('commitment_line', 'net_amount', 'currency_code'),
        ('purchase_invoice_line', 'net_amount', 'currency_code'),
        ('purchase_order_confirmation_line', NULL, NULL),
        ('delivery_note_line', NULL, NULL),
        ('receipt_line', 'net_amount', 'currency_code'),
        ('service_sheet_line', 'net_amount', 'currency_code'),
        ('accounting_distribution', 'distributed_amount', 'currency_code'),
        ('pricing_component', 'computed_amount', 'currency_code'),
        ('schedule_line', 'scheduled_amount', 'currency_code'),
        ('payment_entry_allocation', 'net_payment_amount', 'currency_code')
),
field_catalog(
    name, label, data_type, ui_type, cardinality, origin,
    is_required, is_read_only, is_computed, is_write_once, compute_mode,
    reference_config, validation, group_key, sort_order, is_hidden
) AS (
    VALUES
    -- Identity and parent/source anchors
    ('id','ID','uuid','identifier','one','system',true,false,false,true,NULL,NULL::jsonb,NULL::jsonb,'identity',10,true),
    ('tenant_id','Tenant','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"tenant","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'identity',20,true),
    ('company_code_id','Company Code','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"company_code","target_field":"id","display_field":"code"}'::jsonb,NULL::jsonb,'identity',30,true),
    ('purchase_requisition_id','Purchase Requisition','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"purchase_requisition","target_field":"id","display_field":"code"}'::jsonb,NULL::jsonb,'source',40,true),
    ('commitment_id','Commitment','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"commitment","target_field":"id","display_field":"code"}'::jsonb,NULL::jsonb,'source',41,true),
    ('purchase_invoice_id','Purchase Invoice','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"purchase_invoice","target_field":"id","display_field":"code"}'::jsonb,NULL::jsonb,'source',42,true),
    ('confirmation_id','PO Confirmation','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"purchase_order_confirmation","target_field":"id","display_field":"confirmation_number"}'::jsonb,NULL::jsonb,'source',43,true),
    ('delivery_note_id','Delivery Note','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"delivery_note","target_field":"id","display_field":"delivery_note_number"}'::jsonb,NULL::jsonb,'source',44,true),
    ('receipt_id','Receipt','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"receipt","target_field":"id","display_field":"code"}'::jsonb,NULL::jsonb,'source',45,true),
    ('service_sheet_id','Service Sheet','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"service_sheet","target_field":"id","display_field":"service_sheet_number"}'::jsonb,NULL::jsonb,'source',46,true),
    ('payment_entry_id','Payment Entry','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"payment_entry","target_field":"id","display_field":"payment_number"}'::jsonb,NULL::jsonb,'source',47,true),
    ('line_no','Line No','integer','number','one','system',true,false,false,false,NULL,NULL::jsonb,'{"min":1}'::jsonb,'identity',50,false),
    ('distribution_no','Distribution No','integer','number','one','system',true,false,false,false,NULL,NULL::jsonb,'{"min":1}'::jsonb,'identity',51,false),
    ('sequence','Sequence','integer','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":1}'::jsonb,'identity',52,false),
    ('schedule_no','Schedule No','integer','number','one','system',true,false,false,false,NULL,NULL::jsonb,'{"min":1}'::jsonb,'identity',53,false),

    -- Source links
    ('source_doc_type','Source Type','text','select','one','system',true,false,false,true,NULL,NULL::jsonb,'{"allowed_values":["purchase_requisition_line","commitment_line","purchase_invoice_line","receipt_line","service_sheet_line"]}'::jsonb,'source',60,false),
    ('source_doc_id','Source Header','uuid','reference','one','system',true,false,false,true,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'source',61,false),
    ('source_line_id','Source Line','uuid','reference','one','system',true,false,false,true,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'source',62,false),
    ('source_doc_entity','Source Entity','text','select','one','system',true,false,false,true,NULL,NULL::jsonb,'{"allowed_values":["purchase_order","purchase_requisition","delivery_note","service_sheet","purchase_invoice"]}'::jsonb,'source',63,false),
    ('source_schedule_id','Source Schedule','uuid','reference','zero_or_one','system',false,false,false,true,NULL,'{"target_entity":"schedule_line","target_field":"id","display_field":"schedule_no"}'::jsonb,NULL::jsonb,'source',64,false),
    ('source_line_version','Source Line Version','bigint','number','zero_or_one','system',false,false,false,true,NULL,NULL::jsonb,NULL::jsonb,'source',65,false),
    ('requisition_line_id','Requisition Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"purchase_requisition_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'source',66,false),
    ('parent_contract_line_id','Parent Contract Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"commitment_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'source',67,false),
    ('commitment_line_id','Commitment Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"commitment_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'matching',68,false),
    ('receipt_line_id','Receipt Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"receipt_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'matching',69,false),
    ('delivery_note_line_id','Delivery Note Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"delivery_note_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'matching',70,false),
    ('service_sheet_line_id','Service Sheet Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"target_entity":"service_sheet_line","target_field":"id","display_field":"line_no"}'::jsonb,NULL::jsonb,'matching',71,false),

    -- Item/classification
    ('item_id','Item','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"item","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'item',90,false),
    ('item_description','Description','text','textarea','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"max_length":4000}'::jsonb,'item',100,false),
    ('procurement_type','Procurement Type','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["goods","services"]}'::jsonb,'item',110,false),
    ('line_type','Line Type','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["contract","catalog","marketplace","noncatalog"]}'::jsonb,'item',120,false),
    ('commodity_category_id','Commodity Category','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"commodity_category","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'classification',130,false),
    ('business_intent_id','Business Intent','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"business_intent","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'classification',140,false),
    ('classification_decision','Classification Decision','jsonb','json','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,NULL::jsonb,'classification',150,true),
    ('asset_class_id','Asset Class','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"asset_class","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'classification',160,false),

    -- Quantity/price/amounts
    ('uom_code','UoM','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"max_length":12}'::jsonb,'quantities',200,false),
    ('quantity','Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0,"exclusive_min":true}'::jsonb,'quantities',210,false),
    ('shipped_quantity','Shipped Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0,"exclusive_min":true}'::jsonb,'quantities',211,false),
    ('received_quantity','Received Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'quantities',212,false),
    ('accepted_quantity','Accepted Quantity','numeric','number','one','system',true,true,true,false,'generated',NULL::jsonb,'{"min":0}'::jsonb,'quantities',213,false),
    ('rejected_quantity','Rejected Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'quantities',214,false),
    ('damaged_quantity','Damaged Quantity','numeric','number','one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'quantities',215,false),
    ('confirmed_quantity','Confirmed Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0,"exclusive_min":true}'::jsonb,'quantities',216,false),
    ('committed_quantity','Committed Quantity','numeric','number','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'quantities',217,false),
    ('matched_quantity','Matched Quantity','numeric','number','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'matching',218,false),
    ('released_quantity','Released Quantity','numeric','number','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'fulfillment',219,false),
    ('fulfilled_quantity','Fulfilled Quantity','numeric','number','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'fulfillment',220,false),
    ('remaining_quantity','Remaining Quantity','numeric','number','one','system',true,true,true,false,'generated',NULL::jsonb,'{"min":0}'::jsonb,'fulfillment',221,false),
    ('unit_price','Unit Price','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'pricing',230,false),
    ('confirmed_unit_price','Confirmed Unit Price','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'pricing',231,false),
    ('price_unit','Price Per','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0,"exclusive_min":true}'::jsonb,'pricing',232,false),
    ('currency_code','Currency','text','currency','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"max_length":3}'::jsonb,'currency',240,false),
    ('net_amount','Net Amount','numeric','money','one','system',true,true,true,false,'generated',NULL::jsonb,'{"min":0}'::jsonb,'financial',250,false),
    ('tax_amount','Tax','numeric','money','one','system',true,true,true,false,'pricing_components',NULL::jsonb,'{"min":0}'::jsonb,'tax',260,false),
    ('withholding_tax_amount','WHT','numeric','money','one','system',true,true,true,false,'pricing_components',NULL::jsonb,'{"min":0}'::jsonb,'tax',270,false),
    ('gross_amount','Gross Amount','numeric','money','one','system',true,true,true,false,'generated',NULL::jsonb,'{"min":0}'::jsonb,'financial',280,false),
    ('over_delivery_tolerance','Over Delivery Tolerance','numeric','percent','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0,"max":999.99}'::jsonb,'tolerances',281,false),
    ('under_delivery_tolerance','Under Delivery Tolerance','numeric','percent','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0,"max":999.99}'::jsonb,'tolerances',282,false),
    ('released_amount','Released Amount','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'fulfillment',281,false),
    ('scheduled_quantity','Scheduled Quantity','numeric','number','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0,"exclusive_min":true}'::jsonb,'schedule',282,false),
    ('scheduled_amount','Scheduled Amount','numeric','money','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'schedule',283,false),
    ('fulfilled_amount','Fulfilled Amount','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'fulfillment',284,false),
    ('allocated_amount','Allocated Amount','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'allocation',285,false),
    ('discount_amount','Discount','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'discount',286,false),
    ('advance_recovery_amount','Advance Recovery','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'retention',287,false),
    ('retention_amount','Retention','numeric','money','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'retention',288,false),
    ('net_payment_amount','Net Payment','numeric','money','one','system',true,true,true,false,'generated',NULL::jsonb,'{"min":0}'::jsonb,'financial',289,false),

    -- Tax, delivery and address scope
    ('tax_group_id','Tax Group','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'tax',300,false),
    ('withholding_tax_group_id','WHT Group','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'tax',310,false),
    ('to_tax_jurisdiction_id','To Tax Jurisdiction','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"tax_jurisdiction","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'tax',320,false),
    ('from_tax_jurisdiction_id','From Tax Jurisdiction','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"tax_jurisdiction","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'tax',330,false),
    ('required_by_date','Required By','date','date','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'delivery_fulfillment',10,false),
    ('confirmed_delivery_date','Confirmed Delivery','date','date','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'dates',341,false),
    ('scheduled_date','Scheduled Date','date','date','one','standard',true,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'schedule',342,false),
    ('site_id','Site','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"site","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'delivery_fulfillment',20,false),
    ('warehouse_id','Warehouse','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"warehouse","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'delivery_fulfillment',30,false),
    ('shipto_address_id','Ship-To Address','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"v_site_address","target_field":"address_id","value_field":"address_id","label_field":"formatted_address","display_field":"formatted_address","code_field":"code","description_field":"name"}'::jsonb,NULL::jsonb,'delivery_fulfillment',40,false),
    ('storage_location','Storage Location','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":120}'::jsonb,'delivery_fulfillment',50,false),
    ('billto_address_id','Bill-To Address','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"v_company_code_address","target_field":"address_id","value_field":"address_id","label_field":"formatted_address","display_field":"formatted_address","code_field":"code","description_field":"name"}'::jsonb,NULL::jsonb,'delivery_fulfillment',60,false),
    ('billfrom_address_id','Bill-From Address','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"v_supplier_address","target_field":"address_id","value_field":"address_id","label_field":"formatted_address","display_field":"formatted_address","code_field":"code","description_field":"name"}'::jsonb,NULL::jsonb,'delivery_supplier_source',40,false),
    ('supplier_id','Supplier','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"supplier","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"supplier_code","picker":{"code_field":"supplier_code","show_code":true}}'::jsonb,NULL::jsonb,'delivery_supplier_source',10,false),
    ('shipfrom_address_id','Ship-From Address','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"v_supplier_address","target_field":"address_id","value_field":"address_id","label_field":"formatted_address","display_field":"formatted_address","code_field":"code","description_field":"name"}'::jsonb,NULL::jsonb,'delivery_supplier_source',20,false),
    ('remitto_address_id','Remit-To Address','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"v_supplier_address","target_field":"address_id","value_field":"address_id","label_field":"formatted_address","display_field":"formatted_address","code_field":"code","description_field":"name"}'::jsonb,NULL::jsonb,'delivery_supplier_source',30,false),

    -- Distribution/pricing/schedule/payment specializations
    ('distribution_basis','Distribution Basis','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["PERCENT","AMOUNT","QUANTITY"]}'::jsonb,'allocation',500,false),
    ('split_pct','Split %','numeric','percent','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0,"max":100}'::jsonb,'allocation',510,false),
    ('split_amount','Split Amount','numeric','money','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'allocation',520,false),
    ('split_quantity','Split Quantity','numeric','number','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'allocation',530,false),
    ('distributed_amount','Distributed Amount','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'allocation',540,false),
    ('account_source','Account Source','text','select','one','system',true,true,true,false,'service',NULL::jsonb,'{"allowed_values":["PENDING","OVERRIDE","PROFILE","FALLBACK"]}'::jsonb,'accounting',550,false),
    ('gl_account_id','GL Account','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"gl_account","target_field":"id","value_field":"id","label_field":"name","display_field":"name","code_field":"code","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'accounting',560,false),
    ('cost_center_id','Cost Center','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"cost_center","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'dimensions',570,false),
    ('profit_center_id','Profit Center','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"profit_center","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'dimensions',580,false),
    ('project_id','Project','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"project","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'dimensions',590,false),
    -- Deterministic internal hash of the scalar dimensions, not a master-data FK.
    -- Keep it out of business surfaces; cost/profit/project are the canonical UI.
    ('dimension_set_id','Dimension Set','uuid','identifier','zero_or_one','system',false,true,true,false,'trigger',NULL::jsonb,NULL::jsonb,'dimensions',600,true),
    ('asset_id','Asset','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"asset","target_field":"id","display_field":"name","picker":{"code_field":"asset_number","show_code":true}}'::jsonb,NULL::jsonb,'asset',610,false),
    ('budget_allocation_id','Budget Allocation','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"budget_allocation","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'accounting',620,false),
    ('budget_check_result','Budget Check','text','select','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,'{"allowed_values":["passed","warned","override","blocked","exempt"]}'::jsonb,'accounting',630,false),
    ('encumbrance_je_id','Encumbrance JE','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"journal_entry","target_field":"id","display_field":"je_number"}'::jsonb,NULL::jsonb,'accounting',640,false),
    ('description','Description','text','textarea','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":4000}'::jsonb,'annotation',650,false),

    ('term_type','Term Type','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["discount","charge","tax","withholding","retention","principal_marker"]}'::jsonb,'classification',700,false),
    ('condition_type_id','Condition Type','uuid','reference','one','standard',true,false,false,false,NULL,'{"target_entity":"condition_type","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'classification',710,false),
    ('basis','Basis','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["percent","amount","per_unit","flat"]}'::jsonb,'pricing',720,false),
    ('rate_value','Rate','numeric','number','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'pricing',730,false),
    ('amount_value','Amount','numeric','money','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0}'::jsonb,'pricing',740,false),
    ('base_for_calculation','Base for Calc','numeric','money','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'pricing',750,false),
    ('computed_amount','Computed Amount','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'pricing',760,false),
    ('computed_base_amount','Computed Base Amount','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'pricing',770,false),
    ('entry_level','Entry Level','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["header","line"]}'::jsonb,'apportionment',780,false),
    ('apportion_basis','Apportion Basis','text','select','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["value","quantity","weight","equal"]}'::jsonb,'apportionment',790,false),
    ('is_apportioned','Is Apportioned','boolean','checkbox','one','system',true,true,true,false,'service',NULL::jsonb,NULL::jsonb,'apportionment',800,false),
    ('is_apportioned_from_id','Apportioned From','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"pricing_component","target_field":"id"}'::jsonb,NULL::jsonb,'apportionment',810,false),
    ('origin','Origin','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["manual","inherited","vendor_default","system_resolved"]}'::jsonb,'lineage',820,false),
    ('ref_source_doc_type','Ref Source Type','text','select','zero_or_one','standard',false,false,false,true,NULL,NULL::jsonb,'{"allowed_values":["purchase_requisition_line","commitment_line","purchase_invoice_line","receipt_line","service_sheet_line"]}'::jsonb,'lineage',830,false),
    ('ref_source_doc_id','Ref Source Doc','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'lineage',840,false),
    ('ref_source_line_id','Ref Source Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'lineage',850,false),
    ('ref_value','Ref Value','numeric','money','zero_or_one','standard',false,false,false,true,NULL,NULL::jsonb,'{"min":0}'::jsonb,'lineage',860,false),
    ('is_inclusive','Tax Inclusive','boolean','checkbox','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'tax',870,false),
    ('recoverable_pct','Recoverable %','numeric','percent','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"min":0,"max":100}'::jsonb,'tax',880,false),
    ('tax_section_code','Tax Section','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'tax',890,false),
    ('base_currency_code','Base Currency','text','currency','zero_or_one','standard',false,false,false,true,NULL,NULL::jsonb,'{"max_length":3}'::jsonb,'currency',900,false),
    ('exchange_rate','FX Rate','numeric','number','zero_or_one','standard',false,false,false,true,NULL,NULL::jsonb,'{"min":0}'::jsonb,'currency',910,false),
    ('superseded_by_id','Superseded By','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"pricing_component","target_field":"id"}'::jsonb,NULL::jsonb,'supersede',920,false),
    ('superseded_at','Superseded At','timestamptz','datetime','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,NULL::jsonb,'supersede',930,false),
    ('superseded_by_user','Superseded By User','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'supersede',940,false),

    ('schedule_kind','Schedule Kind','text','select','one','standard',true,false,false,false,NULL,NULL::jsonb,'{"allowed_values":["delivery","billing_milestone","release_window"]}'::jsonb,'schedule',960,false),
    ('fulfillment_status','Fulfillment Status','text','select','one','system',true,true,true,false,'service',NULL::jsonb,'{"allowed_values":["open","partial","fulfilled","closed","cancelled"]}'::jsonb,'fulfillment',970,false),
    ('version_number','Version','integer','number','one','system',true,true,true,false,'service',NULL::jsonb,'{"min":1}'::jsonb,'system',980,true),
    ('previous_version_id','Previous Version','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"schedule_line","target_field":"id"}'::jsonb,NULL::jsonb,'system',981,true),
    ('is_current_version','Current Version','boolean','checkbox','one','system',true,true,true,false,'service',NULL::jsonb,NULL::jsonb,'system',982,true),
    ('supersedes_at','Superseded At','timestamptz','datetime','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,NULL::jsonb,'system',983,true),
    ('terminal_status','Terminal Status','text','select','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,'{"allowed_values":["CANCELED","REJECTED"]}'::jsonb,'system',984,true),
    ('status_source','Status Source','text','select','one','system',true,true,true,false,'service',NULL::jsonb,'{"allowed_values":["manual","derived","system","terminal"]}'::jsonb,'system',985,true),

    ('base_amount','Base Amount','numeric','money','zero_or_one','system',false,true,true,false,'service',NULL::jsonb,'{"min":0}'::jsonb,'currency',1000,false),
    ('fx_gain_loss','FX Gain/Loss','numeric','money','one','system',true,true,true,false,'service',NULL::jsonb,NULL::jsonb,'currency',1010,false),
    ('is_discount_taken','Discount Taken','boolean','checkbox','one','standard',true,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'discount',1020,false),
    ('discount_due_date','Discount Due Date','date','date','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'discount',1030,false),
    ('payment_term_application_id','Payment Term Application','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,'{"target_entity":"payment_term_application","target_field":"id"}'::jsonb,NULL::jsonb,'payment',1040,false),

    -- Operational/status/audit
    ('status','Status','text','select','one','system',true,true,true,false,'service',NULL::jsonb,NULL::jsonb,'metadata',1100,false),
    ('match_status','Match Status','text','select','one','system',true,true,true,false,'service',NULL::jsonb,'{"allowed_values":["unmatched","partially_matched","fully_matched","match_exception"]}'::jsonb,'matching',1110,false),
    ('line_status','Line Status','text','select','one','system',true,true,true,false,'service',NULL::jsonb,'{"allowed_values":["confirmed","changed","rejected","partial"]}'::jsonb,'metadata',1120,false),
    ('supplier_notes','Supplier Notes','text','textarea','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":4000}'::jsonb,'notes',1130,false),
    ('notes','Notes','text','textarea','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":4000}'::jsonb,'notes',1140,false),
    ('lot_number','Lot Number','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":120}'::jsonb,'logistics',1150,false),
    ('serial_numbers','Serial Numbers','jsonb','json','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'logistics',1160,false),
    ('batch_number','Batch Number','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,'{"max_length":120}'::jsonb,'logistics',1170,false),
    ('expiry_date','Expiry Date','date','date','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'logistics',1180,false),
    ('inventory_movement_id','Inventory Movement','uuid','reference','zero_or_one','system',false,true,true,false,'service','{"target_entity":"inventory_movement","target_field":"id"}'::jsonb,NULL::jsonb,'fulfillment',1190,false),
    ('row_version','Row Version','bigint','number','one','system',true,true,true,false,'trigger',NULL::jsonb,NULL::jsonb,'system',1200,true),
    ('tags','Tags','jsonb','tags','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'annotation',1210,false),
    ('metadata','Metadata','jsonb','json','zero_or_one','standard',false,false,false,false,NULL,NULL::jsonb,NULL::jsonb,'annotation',1220,true),
    ('created_at','Created At','timestamptz','datetime','one','system',true,false,false,true,NULL,NULL::jsonb,NULL::jsonb,'audit',1230,true),
    ('created_by','Created By','uuid','reference','one','system',true,false,false,true,NULL,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'audit',1240,true),
    ('updated_at','Updated At','timestamptz','datetime','zero_or_one','system',false,true,true,false,'trigger',NULL::jsonb,NULL::jsonb,'audit',1250,true),
    ('updated_by','Updated By','uuid','reference','zero_or_one','system',false,true,false,false,NULL,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'audit',1260,true)
),
physical_columns AS (
    SELECT
        le.entity_code,
        e.table_schema,
        e.table_name,
        c.is_nullable,
        fc.*,
        COALESCE(fc.name = le.primary_amount_field, false) AS is_primary_amount,
        COALESCE(fc.name = le.primary_currency_field, false) AS is_primary_currency
    FROM line_entities le
    JOIN control.entity e
      ON e.entity_code = le.entity_code
     AND e.tenant_id IS NULL
    JOIN field_catalog fc ON true
    JOIN information_schema.columns c
      ON c.table_schema = e.table_schema
     AND c.table_name = e.table_name
     AND c.column_name = fc.name
),
clear_primary_markers AS (
    UPDATE control.entity_field ef
       SET is_primary_amount = false,
           is_primary_currency = false,
           updated_at = now(),
           updated_by = '00000000-0000-0000-0000-000000000000'
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
      JOIN line_entities le ON le.entity_code = e.entity_code
     WHERE ef.entity_version_id = ev.id
       AND ev.tenant_id IS NULL
       AND ev.version_no = 1
       AND e.tenant_id IS NULL
       AND (ef.is_primary_amount OR ef.is_primary_currency)
    RETURNING ef.id
)
INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_read_only, is_computed, is_write_once,
    compute_mode, reference_config, money_config, validation, group_key, ui_hint, visibility,
    is_primary_amount, is_primary_currency, is_active, sort_order, created_by, updated_by
)
SELECT
    NULL,
    ev.id,
    pc.name,
    pc.name,
    pc.label,
    pc.data_type,
    pc.ui_type,
    CASE WHEN pc.is_nullable = 'NO' THEN 'one' ELSE pc.cardinality END,
    pc.origin,
    (pc.is_required OR pc.is_nullable = 'NO'),
    pc.is_read_only,
    pc.is_computed,
    pc.is_write_once,
    pc.compute_mode,
    pc.reference_config,
    CASE
        WHEN pc.ui_type = 'money' OR pc.data_type = 'money' THEN
            jsonb_build_object(
                'currency_source', 'header',
                'currency_field', 'currency_code',
                'currency_code_position', 'hidden',
                'minor_units', 2
            )
        ELSE NULL::jsonb
    END,
    pc.validation,
    pc.group_key,
    jsonb_strip_nulls(jsonb_build_object(
        'group_key', pc.group_key,
        'p2p_foundation', true
    )),
    CASE WHEN pc.is_hidden THEN '{"hidden":true}'::jsonb ELSE NULL::jsonb END,
    pc.is_primary_amount,
    pc.is_primary_currency,
    true,
    pc.sort_order::smallint,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM physical_columns pc
JOIN control.entity e
  ON e.entity_code = pc.entity_code
 AND e.tenant_id IS NULL
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.tenant_id IS NULL
 AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name         = EXCLUDED.column_name,
    label               = EXCLUDED.label,
    data_type           = EXCLUDED.data_type,
    ui_type             = EXCLUDED.ui_type,
    cardinality         = EXCLUDED.cardinality,
    origin              = EXCLUDED.origin,
    is_required         = EXCLUDED.is_required,
    is_read_only        = EXCLUDED.is_read_only,
    is_computed         = EXCLUDED.is_computed,
    is_write_once       = EXCLUDED.is_write_once,
    compute_mode        = EXCLUDED.compute_mode,
    reference_config    = EXCLUDED.reference_config,
    money_config        = EXCLUDED.money_config,
    validation          = EXCLUDED.validation,
    group_key           = EXCLUDED.group_key,
    ui_hint             = COALESCE(control.entity_field.ui_hint, '{}'::jsonb) || EXCLUDED.ui_hint,
    visibility          = EXCLUDED.visibility,
    is_primary_amount   = EXCLUDED.is_primary_amount,
    is_primary_currency = EXCLUDED.is_primary_currency,
    is_active           = true,
    is_deprecated       = false,
    sort_order          = EXCLUDED.sort_order,
    updated_at          = now(),
    updated_by          = EXCLUDED.updated_by;

-- Â§4a Commitment-line pricing projection fields.
-- These fields are not stored on document.commitment_line. The records line API
-- hydrates them from document.v_commitment_line_pricing_summary so list surfaces
-- can show item-level Net/Tax/Total from the pricing-component waterfall.
WITH projection_fields(name, label, sort_order, hidden) AS (
    VALUES
        ('pricing_base_amount',        'Base',     251, true),
        ('pricing_discount_amount',    'Discount', 252, true),
        ('pricing_charge_amount',      'Charge',   253, true),
        ('pricing_net_amount',         'Net',      254, false),
        ('pricing_tax_amount',         'Tax',      255, false),
        ('pricing_withholding_amount', 'WHT',      256, true),
        ('pricing_total_amount',       'Total',    257, false)
)
INSERT INTO control.entity_field (
    tenant_id, entity_version_id, name, column_name, label, data_type, ui_type,
    cardinality, origin, is_required, is_read_only, is_computed, is_write_once,
    compute_mode, money_config, validation, group_key, ui_hint, visibility,
    is_primary_amount, is_primary_currency, is_active, sort_order, created_by, updated_by
)
SELECT
    NULL,
    ev.id,
    pf.name,
    '',
    pf.label,
    'numeric',
    'money',
    'one',
    'system',
    true,
    true,
    true,
    false,
    'service',
    jsonb_build_object(
        'currency_source', 'header',
        'currency_field', 'currency_code',
        'currency_code_position', 'hidden',
        'minor_units', 2
    ),
    NULL::jsonb,
    'financial',
    jsonb_build_object(
        'group_key', 'financial',
        'p2p_foundation', true,
        'projection_source', 'document.v_commitment_line_pricing_summary',
        'projection_key', 'commitment_line_id'
    ),
    CASE WHEN pf.hidden THEN '{"hidden":true}'::jsonb ELSE NULL::jsonb END,
    false,
    false,
    true,
    pf.sort_order::smallint,
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
FROM projection_fields pf
JOIN control.entity e
  ON e.entity_code = 'commitment_line'
 AND e.tenant_id IS NULL
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.tenant_id IS NULL
 AND ev.version_no = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name       = EXCLUDED.column_name,
    label             = EXCLUDED.label,
    data_type         = EXCLUDED.data_type,
    ui_type           = EXCLUDED.ui_type,
    cardinality       = EXCLUDED.cardinality,
    origin            = EXCLUDED.origin,
    is_required       = EXCLUDED.is_required,
    is_read_only      = EXCLUDED.is_read_only,
    is_computed       = EXCLUDED.is_computed,
    is_write_once     = EXCLUDED.is_write_once,
    compute_mode      = EXCLUDED.compute_mode,
    money_config      = EXCLUDED.money_config,
    validation        = EXCLUDED.validation,
    group_key         = EXCLUDED.group_key,
    ui_hint           = COALESCE(control.entity_field.ui_hint, '{}'::jsonb) || EXCLUDED.ui_hint,
    visibility        = EXCLUDED.visibility,
    is_active         = true,
    is_deprecated     = false,
    sort_order        = EXCLUDED.sort_order,
    updated_at        = now(),
    updated_by        = EXCLUDED.updated_by;

-- Â§5 Explicit surfacing gates for UI-critical fields that were previously
-- hidden or mislabelled in AP/PO seed fragments.
WITH field_updates(entity_code, field_name, label, group_key, sort_order) AS (
    VALUES
        ('purchase_invoice_line', 'item_description', 'Description', 'item', 100),
        ('commitment_line', 'item_description', 'Description', 'item', 100),
        ('purchase_requisition_line', 'item_description', 'Description', 'item', 100),
        ('service_sheet_line', 'item_description', 'Description', 'item', 100),
        ('receipt_line', 'item_description', 'Description', 'item', 100),
        ('delivery_note_line', 'item_description', 'Description', 'item', 100)
)
UPDATE control.entity_field ef
   SET label = fu.label,
       group_key = fu.group_key,
       ui_type = CASE WHEN fu.field_name = 'item_description' THEN 'textarea' ELSE ef.ui_type END,
       sort_order = fu.sort_order,
       visibility = NULL,
       is_active = true,
       is_deprecated = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM field_updates fu
  JOIN control.entity e ON e.entity_code = fu.entity_code AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
   AND ef.name = fu.field_name;

-- Â§5a Restore lookup-backed enum semantics for P2P line type fields after the
-- shared physical-column catalog upsert. These are text columns in DDL, but
-- metadata must remain enum-backed for type pills/selectors.
WITH enum_fields(entity_code, field_name, enum_domain_code, label, group_key, sort_order, is_required) AS (
    VALUES
        ('purchase_requisition_line', 'procurement_type', 'document.procurement_type', 'Procurement Type', 'item', 110, true),
        ('purchase_requisition_line', 'line_type',        'document.line_type',        'Line Type',        'classification', 120, true),
        ('commitment_line',           'procurement_type', 'document.procurement_type', 'Procurement Type', 'item', 110, true),
        ('commitment_line',           'line_type',        'document.line_type',        'Line Type',        'classification', 120, true),
        ('purchase_invoice_line',     'procurement_type', 'document.procurement_type', 'Procurement Type', 'item', 110, true),
        ('purchase_invoice_line',     'line_type',        'document.line_type',        'Line Type',        'classification', 120, true)
)
UPDATE control.entity_field ef
   SET data_type = 'enum',
       ui_type = 'select',
       enum_domain_code = enum_fields.enum_domain_code,
       label = enum_fields.label,
       group_key = enum_fields.group_key,
       sort_order = enum_fields.sort_order,
       is_required = enum_fields.is_required,
       is_read_only = false,
       is_computed = false,
       visibility = NULL,
       ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                 || jsonb_build_object('group_key', enum_fields.group_key),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM enum_fields
  JOIN control.entity e ON e.entity_code = enum_fields.entity_code AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
   AND ef.name = enum_fields.field_name;

-- Â§5b Commitment-line authoring defaults and drawer visibility.
-- PO line authoring should show commercial entry fields, not downstream
-- fulfillment/accounting mirrors. Defaults remain metadata-driven:
--   â€¢ UoM comes from selected item; when item is blank the resolver/field
--     default source uses finance.ap.default_procurement_line_uom.
--   â€¢ Price Per defaults to 1 and is rederived from item metadata if present.
WITH commitment_line_field_updates(field_name, default_value, defaults_patch, visibility_patch) AS (
    VALUES
        (
            'uom_code',
            NULL::jsonb,
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'tenant_config',
                    'namespace', 'finance.ap',
                    'config_key', 'finance.ap.default_procurement_line_uom',
                    'apply_on', jsonb_build_array('create')
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('item_id'),
                        'action', 'rederive',
                        'layers', jsonb_build_array('client_on_change'),
                        'resolver', 'item.procurement_line_defaults',
                        'mode', 'always',
                        'message', 'Filled from selected item or tenant default UOM.'
                    )
                )
            ),
            NULL::jsonb
        ),
        (
            'price_unit',
            '1'::jsonb,
            NULL::jsonb,
            NULL::jsonb
        ),
        (
            'received_quantity',
            NULL::jsonb,
            NULL::jsonb,
            jsonb_build_object('hideIn', jsonb_build_array('create', 'edit'))
        ),
        (
            'currency_code',
            NULL::jsonb,
            NULL::jsonb,
            jsonb_build_object('hideIn', jsonb_build_array('create', 'edit'))
        )
)
UPDATE control.entity_field ef
   SET default_value = COALESCE(clfu.default_value, ef.default_value),
       defaults = CASE
           WHEN clfu.defaults_patch IS NULL THEN ef.defaults
           ELSE COALESCE(ef.defaults, '{}'::jsonb) || clfu.defaults_patch
       END,
       visibility = CASE
           WHEN clfu.visibility_patch IS NULL THEN ef.visibility
           ELSE COALESCE(ef.visibility, '{}'::jsonb) || clfu.visibility_patch
       END,
       ui_hint = CASE
           WHEN clfu.visibility_patch IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb)
           ELSE COALESCE(ef.ui_hint, '{}'::jsonb)
                || jsonb_build_object(
                    'display', COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                               || jsonb_build_object('hide_in', clfu.visibility_patch->'hideIn')
                )
       END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM commitment_line_field_updates clfu
  JOIN control.entity e ON e.entity_code = 'commitment_line' AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = clfu.field_name;

-- §5c Commitment-line delivery inheritance/defaulting contract.
-- The Delivery tab is metadata driven. These fields behave as line overrides
-- over header/source defaults, with dependent pickers and stale-value handling
-- expressed through existing entity_field properties only:
--   * group_key/sort_order controls layout
--   * lookup_config narrows reference pickers
--   * defaults.on_source_change drives trigger resolver behavior
--   * defaults.default_value_source + override_detection describes inheritance
--   * visibility/editability keep the fields active only in authoring states
WITH delivery_field_contract(
    field_name,
    group_key,
    sort_order,
    is_required,
    is_read_only,
    reference_config_patch,
    lookup_config,
    validation_patch,
    defaults_patch,
    visibility_patch,
    editability_patch
) AS (
    VALUES
        (
            'required_by_date',
            'delivery_fulfillment',
            10,
            false,
            false,
            NULL::jsonb,
            NULL::jsonb,
            jsonb_build_object(
                'date_policy', jsonb_build_object(
                    'not_before_field', 'document_date',
                    'message', 'Required By cannot be before the document date.'
                )
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'parent_field',
                    'parent_entity', 'purchase_order',
                    'parent_field', 'required_by_date',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'parent.required_by_date',
                    'label_when_inherited', 'From header',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No header date'
                ),
                'on_parent_change', 'prompt',
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'site_id',
            'delivery_fulfillment',
            20,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'site',
                'target_field', 'id',
                'display_field', 'name',
                'picker', jsonb_build_object('code_field', 'code', 'show_code', true)
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('status', jsonb_build_array('active')),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'company_code_id',
                    'target_field', 'company_code_id',
                    'empty_behavior', 'all'
                ),
                'default_order', jsonb_build_array('code', 'name', 'id')
            ),
            jsonb_build_object(
                'required_when_any_present', jsonb_build_array('warehouse_id', 'shipto_address_id'),
                'message', 'Site is required when warehouse or ship-to is selected.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'parent_field',
                    'parent_entity', 'purchase_order',
                    'parent_field', 'site_id',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'parent.site_id',
                    'label_when_inherited', 'From header',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No header site'
                ),
                'on_parent_change', 'prompt',
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('company_code_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'document.header_or_profile_site',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Filled from header or requester/site profile.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'warehouse_id',
            'delivery_fulfillment',
            30,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'warehouse',
                'target_field', 'id',
                'display_field', 'name',
                'picker', jsonb_build_object('code_field', 'code', 'show_code', true)
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('status', jsonb_build_array('active')),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'site_id',
                    'target_field', 'site_id',
                    'empty_behavior', 'none'
                ),
                'default_order', jsonb_build_array('code', 'name', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'site_id', 'target_field', 'site_id'),
                'message', 'Warehouse must belong to the selected site.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'resolver',
                    'resolver', 'site.default_warehouse',
                    'sources', jsonb_build_array('site_id'),
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'resolver.site.default_warehouse',
                    'label_when_inherited', 'From site',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No site warehouse'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('site_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'site.default_warehouse',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected the site default warehouse.'
                    ),
                    jsonb_build_object(
                        'sources', jsonb_build_array('site_id'),
                        'action', 'warn',
                        'layers', jsonb_build_array('client_on_change'),
                        'when', jsonb_build_object('target_was_user_overridden', true),
                        'message', 'Site changed - verify warehouse.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'shipto_address_id',
            'delivery_fulfillment',
            40,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'v_site_address',
                'target_field', 'address_id',
                'display_field', 'formatted_address',
                'label_field', 'formatted_address',
                'code_field', 'code',
                'description_field', 'formatted_address',
                'value_field', 'address_id'
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('purpose', 'ship_to,default'),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'site_id',
                    'target_field', 'site_id',
                    'empty_behavior', 'all'
                ),
                'default_order', jsonb_build_array('-is_primary', 'code', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'site_id', 'target_field', 'site_id'),
                'message', 'Ship-To address must be valid for the selected site.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'parent_field',
                    'parent_entity', 'purchase_order',
                    'parent_field', 'shipto_address_id',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'parent.shipto_address_id',
                    'label_when_inherited', 'From header/site',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No header ship-to'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('site_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'picker.first_option',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected default ship-to address for the site.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'storage_location',
            'delivery_fulfillment',
            50,
            false,
            false,
            NULL::jsonb,
            NULL::jsonb,
            jsonb_build_object(
                'max_length', 120,
                'depends_on', 'warehouse_id',
                'message', 'Storage Location is a warehouse-level value.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'resolver',
                    'resolver', 'warehouse.default_storage_location',
                    'sources', jsonb_build_array('warehouse_id'),
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'resolver.warehouse.default_storage_location',
                    'label_when_inherited', 'From warehouse',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No warehouse storage location'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('warehouse_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'warehouse.default_storage_location',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Filled from warehouse default storage location.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'billto_address_id',
            'delivery_fulfillment',
            60,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'v_company_code_address',
                'target_field', 'address_id',
                'display_field', 'formatted_address',
                'label_field', 'formatted_address',
                'code_field', 'code',
                'description_field', 'formatted_address',
                'value_field', 'address_id'
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('purpose', 'bill_to,default'),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'company_code_id',
                    'target_field', 'company_code_id',
                    'empty_behavior', 'none'
                ),
                'default_order', jsonb_build_array('-is_primary', 'code', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'company_code_id', 'target_field', 'company_code_id'),
                'message', 'Bill-To address must belong to the buying company.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'parent_field',
                    'parent_entity', 'purchase_order',
                    'parent_field', 'billto_address_id',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'parent.billto_address_id',
                    'label_when_inherited', 'From header/company',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No header bill-to'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('company_code_id', 'site_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'picker.first_option',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected default bill-to address for the buying company.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'supplier_id',
            'delivery_supplier_source',
            10,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'supplier',
                'target_field', 'id',
                'display_field', 'name',
                'picker', jsonb_build_object('code_field', 'supplier_code', 'show_code', true)
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('status', jsonb_build_array('active')),
                'default_order', jsonb_build_array('supplier_code', 'name', 'id')
            ),
            jsonb_build_object(
                'must_match_header_unless', jsonb_build_object('feature_flag', 'p2p.line_supplier_override_enabled'),
                'message', 'Line supplier must match header supplier unless line-supplier override is enabled.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'parent_field',
                    'parent_entity', 'purchase_order',
                    'parent_field', 'party_id',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'parent.party_id',
                    'label_when_inherited', 'From header',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No header supplier'
                ),
                'on_parent_change', 'inherit',
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object(
                'editable_in_states', jsonb_build_array('draft', 'rejected'),
                'requires_feature_flag', 'p2p.line_supplier_override_enabled'
            )
        ),
        (
            'shipfrom_address_id',
            'delivery_supplier_source',
            20,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'v_supplier_address',
                'target_field', 'address_id',
                'display_field', 'formatted_address',
                'label_field', 'formatted_address',
                'code_field', 'code',
                'description_field', 'formatted_address',
                'value_field', 'address_id'
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('purpose', 'ship_from,default'),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'supplier_id',
                    'target_field', 'supplier_id',
                    'empty_behavior', 'none'
                ),
                'default_order', jsonb_build_array('-is_primary', 'code', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'supplier_id', 'target_field', 'supplier_id'),
                'message', 'Ship-From address must belong to the selected supplier.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'supplier_config',
                    'config_key', 'address.ship_from',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'supplier.address.ship_from',
                    'label_when_inherited', 'From supplier',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No supplier ship-from'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('supplier_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'picker.first_option',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected default ship-from address for the supplier.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'remitto_address_id',
            'delivery_supplier_source',
            30,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'v_supplier_address',
                'target_field', 'address_id',
                'display_field', 'formatted_address',
                'label_field', 'formatted_address',
                'code_field', 'code',
                'description_field', 'formatted_address',
                'value_field', 'address_id'
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('purpose', 'remit_to,default'),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'supplier_id',
                    'target_field', 'supplier_id',
                    'empty_behavior', 'none'
                ),
                'default_order', jsonb_build_array('-is_primary', 'code', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'supplier_id', 'target_field', 'supplier_id'),
                'message', 'Remit-To address must belong to the selected supplier.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'supplier_config',
                    'config_key', 'address.remit_to',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'supplier.address.remit_to',
                    'label_when_inherited', 'From supplier',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No supplier remit-to'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('supplier_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'picker.first_option',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected default remit-to address for the supplier.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        ),
        (
            'billfrom_address_id',
            'delivery_supplier_source',
            40,
            false,
            false,
            jsonb_build_object(
                'target_entity', 'v_supplier_address',
                'target_field', 'address_id',
                'display_field', 'formatted_address',
                'label_field', 'formatted_address',
                'code_field', 'code',
                'description_field', 'formatted_address',
                'value_field', 'address_id'
            ),
            jsonb_build_object(
                'filters', jsonb_build_object('purpose', 'bill_from,default'),
                'dependent_filter', jsonb_build_object(
                    'source_field', 'supplier_id',
                    'target_field', 'supplier_id',
                    'empty_behavior', 'none'
                ),
                'default_order', jsonb_build_array('-is_primary', 'code', 'id')
            ),
            jsonb_build_object(
                'belongs_to_field', jsonb_build_object('field', 'supplier_id', 'target_field', 'supplier_id'),
                'message', 'Bill-From address must belong to the selected supplier.'
            ),
            jsonb_build_object(
                'default_value_source', jsonb_build_object(
                    'kind', 'supplier_config',
                    'config_key', 'address.bill_from',
                    'apply_on', jsonb_build_array('create', 'reset')
                ),
                'override_detection', jsonb_build_object(
                    'compare_to', 'supplier.address.bill_from',
                    'label_when_inherited', 'From supplier',
                    'label_when_overridden', 'Line override',
                    'label_when_inherited_null', 'No supplier bill-from'
                ),
                'on_source_change', jsonb_build_array(
                    jsonb_build_object(
                        'sources', jsonb_build_array('supplier_id'),
                        'action', 'rederive',
                        'mode', 'if_empty_or_derived',
                        'resolver', 'picker.first_option',
                        'layers', jsonb_build_array('client_on_change', 'server_on_save'),
                        'message', 'Selected default bill-from address for the supplier.'
                    )
                ),
                'ui_affordance', jsonb_build_object(
                    'show_reset_to_default', true,
                    'show_inheritance_chip', true,
                    'chip_position', 'field_label'
                )
            ),
            jsonb_build_object('showIn', jsonb_build_array('create', 'edit')),
            jsonb_build_object('editable_in_states', jsonb_build_array('draft', 'rejected'))
        )
)
UPDATE control.entity_field ef
   SET group_key = dfc.group_key,
       sort_order = dfc.sort_order,
       is_required = dfc.is_required,
       is_read_only = dfc.is_read_only,
       reference_config = CASE
           WHEN dfc.reference_config_patch IS NULL THEN ef.reference_config
           ELSE COALESCE(ef.reference_config, '{}'::jsonb) || dfc.reference_config_patch
       END,
       lookup_config = dfc.lookup_config,
       validation = CASE
           WHEN dfc.validation_patch IS NULL THEN ef.validation
           ELSE COALESCE(ef.validation, '{}'::jsonb) || dfc.validation_patch
       END,
       defaults = CASE
           WHEN dfc.defaults_patch IS NULL THEN ef.defaults
           ELSE COALESCE(ef.defaults, '{}'::jsonb) || dfc.defaults_patch
       END,
       visibility = CASE
           WHEN dfc.visibility_patch IS NULL THEN ef.visibility
           ELSE COALESCE(ef.visibility, '{}'::jsonb) || dfc.visibility_patch
       END,
       editability = CASE
           WHEN dfc.editability_patch IS NULL THEN ef.editability
           ELSE COALESCE(ef.editability, '{}'::jsonb) || dfc.editability_patch
       END,
       ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                 || jsonb_build_object(
                     'group_key', dfc.group_key,
                     'delivery', jsonb_build_object(
                         'line_override', true,
                         'reference_aligned', dfc.lookup_config IS NOT NULL
                     )
                 )
                 || CASE
                      WHEN dfc.reference_config_patch IS NULL THEN '{}'::jsonb
                      ELSE jsonb_build_object(
                          'display',
                          COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                          || jsonb_build_object(
                               'renderer', 'reference_label',
                               'format', 'label_code'
                             )
                      )
                    END,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM delivery_field_contract dfc
  JOIN control.entity e ON e.entity_code = 'commitment_line' AND e.tenant_id IS NULL
  JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1 AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = dfc.field_name;

COMMIT;

