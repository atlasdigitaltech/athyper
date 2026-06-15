-- ============================================================================
-- AP purchase invoice metadata contract.
--
-- Development-stage consolidation for the AP document cluster:
--   PI  = document.purchase_invoice
--   PIL = document.purchase_invoice_line
--   PC  = document.pricing_component
--   AD  = document.accounting_distribution
--
-- This script intentionally keeps the AP entity contract together so developers
-- can understand the invoice model from one file after a full DB reset.
-- Physical DDL remains under server/db/ddl/document.
--
-- Developer map:
--   1. Register PC entity + v1
--   2. Set AP display/list columns and PI field groups
--   3. Register PI invoice-type logical fields
--   4. Register PC fields plus PIL/AD asset fields
--   5. Mark computed fields
--   6. Apply editability gates
--   7. Apply visibility rules
--   8. Apply cascade/default rules
--   9. Deactivate legacy AP fields
--  10. Assert the contract after reset
--
-- Run after: 040_entity.sql, 041_entity_version.sql, 042_entity_field.sql
-- Run before: 043_entity_relation.sql, 044_entity_operation.sql, 046_entity_flow.sql
-- ============================================================================

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- ============================================================================
-- 1. Entity registration: pricing_component
-- ============================================================================

INSERT INTO control.entity (
    tenant_id,
    module_id,
    name,
    slug,
    entity_short,
    entity_code,
    entity_class,
    ownership_model,
    kind,
    backing_type,
    governance_level,
    security_tier,
    mutability,
    mapping_mode,
    table_schema,
    table_name,
    label_singular,
    label_plural,
    icon_key,
    color_token,
    display_config,
    feature_flags,
    data_policy,
    identity_config,
    search_config,
    concurrency_policy,
    status,
    created_by,
    updated_by
)
VALUES (
    NULL,
    'ACC',
    'pricing_component',
    'pricing-component',
    'PC',
    'pricing_component',
    'DOCUMENT_RELATION',
    'system',
    'ent',
    'table',
    'full',
    'tenant_critical',
    'controlled',
    'exclusive',
    'document',
    'pricing_component',
    'Pricing Component',
    'Pricing Components',
    'percent',
    'amber',
    '{"line_ui_variant":"pricing"}'::jsonb,
    '{"polymorphic_parent":true,"parent_source_type_field":"source_doc_type","parent_source_id_field":"source_doc_id","parent_source_line_field":"source_line_id","auto_generated":true,"supersede_chain":true,"no_status":true}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    'ACTIVE',
    '00000000-0000-0000-0000-000000000000',
    NULL
)
ON CONFLICT (table_schema, table_name) DO UPDATE
SET module_id          = EXCLUDED.module_id,
    name               = EXCLUDED.name,
    slug               = EXCLUDED.slug,
    entity_short       = EXCLUDED.entity_short,
    entity_code        = EXCLUDED.entity_code,
    entity_class       = EXCLUDED.entity_class,
    ownership_model    = EXCLUDED.ownership_model,
    kind               = EXCLUDED.kind,
    backing_type       = EXCLUDED.backing_type,
    governance_level   = EXCLUDED.governance_level,
    security_tier      = EXCLUDED.security_tier,
    mutability         = EXCLUDED.mutability,
    mapping_mode       = EXCLUDED.mapping_mode,
    label_singular     = EXCLUDED.label_singular,
    label_plural       = EXCLUDED.label_plural,
    icon_key           = EXCLUDED.icon_key,
    color_token        = EXCLUDED.color_token,
    display_config     = EXCLUDED.display_config,
    feature_flags      = EXCLUDED.feature_flags,
    data_policy        = EXCLUDED.data_policy,
    identity_config    = EXCLUDED.identity_config,
    search_config      = EXCLUDED.search_config,
    concurrency_policy = EXCLUDED.concurrency_policy,
    status             = EXCLUDED.status,
    updated_at         = now(),
    updated_by         = '00000000-0000-0000-0000-000000000000';

INSERT INTO control.entity_version (
    tenant_id,
    entity_id,
    version_no,
    label,
    status,
    effective_from,
    change_type,
    created_by,
    updated_by
)
SELECT NULL,
       e.id,
       1,
       'Initial Version',
       'EFFECTIVE',
       now(),
       'structural',
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
 WHERE e.table_schema = 'document'
   AND e.table_name = 'pricing_component'
   AND e.tenant_id IS NULL
ON CONFLICT (entity_id, version_no) DO UPDATE
SET label          = COALESCE(control.entity_version.label, EXCLUDED.label),
    status         = 'EFFECTIVE',
    effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
    change_type    = COALESCE(control.entity_version.change_type, EXCLUDED.change_type),
    updated_at     = now(),
    updated_by     = '00000000-0000-0000-0000-000000000000';

-- ============================================================================
-- 2. AP display and grouping contract
-- ============================================================================

UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'line_ui_variant', 'procure',
                             'line_entity_code', 'purchase_invoice_line',
                             'list_columns', jsonb_build_array(
                                 'document_no',
                                 'name',
                                 'invoice_type',
                                 'supplier_id',
                                 'supplier_invoice_date',
                                 'status',
                                 'created_at'
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_invoice'
   AND tenant_id IS NULL;

UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'line_ui_variant', 'procure',
                             'list_columns', jsonb_build_array(
                                 'line_no',
                                 'procurement_type',
                                 'item_id',
                                 'item_description',
                                 'quantity',
                                 'uom_code',
                                 'unit_price',
                                 'net_amount',
                                 'discount_pct',
                                 'tax_amount',
                                 'gross_amount',
                                 'match_status',
                                 'cost_center_id'
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_invoice_line'
   AND tenant_id IS NULL;

INSERT INTO control.field_group (
    group_key,
    label,
    description,
    applies_to_classes,
    sort_order,
    columns,
    page_span
)
VALUES
    ('general', 'General', 'Invoice identity, classification, and source.',
        ARRAY['DOCUMENT'], 50, 2, 'half'),
    ('parties', 'Parties & Commitment', 'Company code, supplier, and source commitment / PO link.',
        ARRAY['DOCUMENT'], 60, 2, 'half'),
    ('currency', 'Currency & FX', 'Transaction currency, base currency, and exchange rate.',
        ARRAY['DOCUMENT'], 580, 3, 'half'),
    ('amounts', 'Amounts', 'Header amounts: subtotal, discount, freight, misc, tax, WHT, advance, retention, totals.',
        ARRAY['DOCUMENT'], 600, 3, 'half'),
    ('hold', 'Hold', 'Operational hold reason.',
        ARRAY['DOCUMENT'], 695, 1, 'full'),
    ('fiscal', 'Fiscal Scope', 'Fiscal year and posting period.',
        ARRAY['DOCUMENT'], 710, 2, 'half'),
    ('payment', 'Payment Terms', 'Payment terms and method for settlement.',
        ARRAY['DOCUMENT'], 720, 2, 'half'),
    ('annotations', 'Notes & Tags', 'Operational notes and tags.',
        ARRAY['DOCUMENT'], 800, 1, 'full'),
    ('credit_note', 'Credit Note Details', 'Fields specific to credit-note invoices.',
        ARRAY['DOCUMENT'], 750, 2, 'half'),
    ('debit_note', 'Debit Note Details', 'Fields specific to debit-note invoices.',
        ARRAY['DOCUMENT'], 760, 2, 'half'),
    ('advance', 'Advance Payment Details', 'Fields specific to advance-payment invoices.',
        ARRAY['DOCUMENT'], 770, 2, 'half'),
    ('retention_release', 'Retention Release Details', 'Fields specific to retention-release invoices.',
        ARRAY['DOCUMENT'], 780, 2, 'half')
ON CONFLICT (group_key) DO UPDATE
SET label              = EXCLUDED.label,
    description        = EXCLUDED.description,
    applies_to_classes = EXCLUDED.applies_to_classes,
    sort_order         = EXCLUDED.sort_order,
    columns            = EXCLUDED.columns,
    page_span          = EXCLUDED.page_span;

WITH pi_groups(field_name, group_key) AS (
    VALUES
    ('document_no', 'general'),
    ('fiscal_document_number', 'general'),
    ('description', 'general'),
    ('invoice_source', 'general'),
    ('invoice_type', 'general'),
    ('is_reversal', 'general'),
    ('reversal_of_id', 'general'),

    ('company_code_id', 'parties'),
    ('supplier_id', 'parties'),
    ('supplier_invoice_number', 'parties'),
    ('supplier_invoice_date', 'parties'),
    ('commitment_id', 'parties'),

    ('invoice_date', 'dates'),
    ('posting_date', 'dates'),
    ('received_date', 'dates'),
    ('baseline_date', 'dates'),
    ('due_date', 'dates'),

    ('currency_code', 'currency'),
    ('base_currency_code', 'currency'),
    ('exchange_rate', 'currency'),

    ('discount_amount', 'amounts'),
    ('freight_amount', 'amounts'),
    ('misc_charges_amount', 'amounts'),
    ('total_amount', 'amounts'),
    ('net_amount', 'amounts'),
    ('payable_amount', 'amounts'),
    ('paid_amount', 'amounts'),
    ('outstanding_amount', 'amounts'),
    ('advance_deduction_amount', 'amounts'),
    ('retention_amount', 'amounts'),
    ('retention_pct', 'amounts'),

    ('tax_mode', 'tax'),
    ('tax_mode_source', 'tax'),
    ('tax_amount', 'tax'),
    ('withholding_tax_amount', 'tax'),

    ('match_type', 'matching'),
    ('match_status', 'matching'),

    ('hold_reason', 'hold'),

    ('cost_center_id', 'dimensions'),
    ('profit_center_id', 'dimensions'),
    ('project_id', 'dimensions'),
    ('site_id', 'dimensions'),
    ('budget_allocation_id', 'dimensions'),
    ('budget_check_result', 'dimensions'),

    ('fiscal_year', 'fiscal'),
    ('period_number', 'fiscal'),

    ('payment_term_id', 'payment'),
    ('payment_method_id', 'payment'),

    ('notes', 'annotations'),
    ('tags', 'annotations'),

    ('credited_invoice_id', 'credit_note'),
    ('credit_reason', 'credit_note'),
    ('credit_reference', 'credit_note'),
    ('credit_note_date', 'credit_note'),
    ('credit_note_name', 'credit_note'),

    ('debited_invoice_id', 'debit_note'),
    ('debit_reason', 'debit_note'),
    ('debit_note_number', 'debit_note'),
    ('debit_note_date', 'debit_note'),
    ('debit_note_name', 'debit_note'),

    ('advance_type', 'advance'),
    ('recovery_method', 'advance'),
    ('advance_request_reference', 'advance'),
    ('advance_request_date', 'advance'),
    ('advance_name', 'advance'),

    ('retention_invoice_id', 'retention_release'),
    ('release_type', 'retention_release'),
    ('application_strategy', 'retention_release'),
    ('release_request_reference', 'retention_release'),
    ('release_date', 'retention_release'),
    ('release_name', 'retention_release')
)
UPDATE control.entity_field ef
   SET group_key = pg.group_key,
       ui_hint = COALESCE(ef.ui_hint, '{}'::jsonb)
                 || jsonb_build_object('group_key', pg.group_key),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM pi_groups pg
  JOIN control.entity e
    ON e.entity_code = 'purchase_invoice'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
WHERE ef.entity_version_id = ev.id
   AND ef.name = pg.field_name;

-- ============================================================================
-- 3. PI invoice-type logical fields
-- ============================================================================

WITH pi_type_fields (
    name,
    column_name,
    label,
    data_type,
    ui_type,
    cardinality,
    enum_domain_code,
    reference_config,
    lookup_config,
    validation,
    json_config,
    group_key,
    visible_when,
    sort_order
) AS (
    VALUES
    ('credited_invoice_id','reversal_of_id','Original Invoice Being Credited','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,NULL::jsonb,'credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),300),
    ('debited_invoice_id','reversal_of_id','Original Invoice Being Debited','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,NULL::jsonb,'debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),301),
    ('retention_invoice_id','reversal_of_id','Invoice With Retention','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,NULL::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),302),

    ('credit_reason','metadata','Reason for Credit','enum','select','zero_or_one','document.purchase_invoice_credit_reason',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"credit_reason"}'::jsonb,'credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),310),
    ('debit_reason','metadata','Reason for Debit','enum','select','zero_or_one','document.purchase_invoice_debit_reason',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"debit_reason"}'::jsonb,'debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),311),
    ('advance_type','metadata','Advance Type','enum','select','zero_or_one','document.purchase_invoice_advance_type',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"advance_type"}'::jsonb,'advance',jsonb_build_object('field','invoice_type','eq','advance'),312),
    ('recovery_method','metadata','Recovery Method','enum','select','zero_or_one','document.purchase_invoice_recovery_method',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"recovery_method"}'::jsonb,'advance',jsonb_build_object('field','invoice_type','eq','advance'),313),
    ('release_type','metadata','Release Type','enum','select','zero_or_one','document.purchase_invoice_release_type',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"release_type"}'::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),314),
    ('application_strategy','metadata','Application Strategy','enum','select','zero_or_one','document.purchase_invoice_application_strategy',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"application_strategy"}'::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),315),

    ('credit_reference','supplier_invoice_number','Credit Reference','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),320),
    ('credit_note_date','supplier_invoice_date','Credit Note Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),321),
    ('credit_note_name','description','Credit Note Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,NULL::jsonb,'credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),322),

    ('debit_note_number','supplier_invoice_number','Debit Note No.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),330),
    ('debit_note_date','supplier_invoice_date','Debit Note Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),331),
    ('debit_note_name','description','Debit Note Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,NULL::jsonb,'debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),332),

    ('advance_request_reference','supplier_invoice_number','Supplier Request Ref.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'advance',jsonb_build_object('field','invoice_type','eq','advance'),340),
    ('advance_request_date','supplier_invoice_date','Request Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'advance',jsonb_build_object('field','invoice_type','eq','advance'),341),
    ('advance_name','description','Advance Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,NULL::jsonb,'advance',jsonb_build_object('field','invoice_type','eq','advance'),342),

    ('release_request_reference','supplier_invoice_number','Release Request Ref.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),350),
    ('release_date','supplier_invoice_date','Release Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),351),
    ('release_name','description','Release Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,NULL::jsonb,'retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),352)
)
INSERT INTO control.entity_field (
    tenant_id,
    entity_version_id,
    name,
    column_name,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    enum_domain_code,
    reference_config,
    lookup_config,
    validation,
    json_config,
    is_required,
    is_filterable,
    group_key,
    ui_hint,
    visibility,
    sort_order,
    is_active,
    created_by,
    updated_by
)
SELECT NULL,
       ev.id,
       ptf.name,
       ptf.column_name,
       ptf.label,
       ptf.data_type,
       ptf.ui_type,
       ptf.cardinality,
       'standard',
       ptf.enum_domain_code,
       ptf.reference_config,
       ptf.lookup_config,
       ptf.validation,
       ptf.json_config,
       false,
       false,
       ptf.group_key,
       jsonb_build_object(
           'group_key', ptf.group_key,
           'display', jsonb_build_object('visible_when', ptf.visible_when)
       ),
       jsonb_build_object('when', ptf.visible_when),
       ptf.sort_order::smallint,
       true,
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000'
  FROM pi_type_fields ptf
  JOIN control.entity e
    ON e.entity_code = 'purchase_invoice'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name      = EXCLUDED.column_name,
    label            = EXCLUDED.label,
    data_type        = EXCLUDED.data_type,
    ui_type          = EXCLUDED.ui_type,
    cardinality      = EXCLUDED.cardinality,
    origin           = EXCLUDED.origin,
    enum_config      = NULL,
    enum_domain_code = EXCLUDED.enum_domain_code,
    reference_config = EXCLUDED.reference_config,
    lookup_config    = EXCLUDED.lookup_config,
    validation       = EXCLUDED.validation,
    json_config      = EXCLUDED.json_config,
    group_key        = EXCLUDED.group_key,
    ui_hint          = COALESCE(control.entity_field.ui_hint, '{}'::jsonb) || EXCLUDED.ui_hint,
    visibility       = EXCLUDED.visibility,
    sort_order       = EXCLUDED.sort_order,
    is_active        = true,
    updated_at       = now(),
    updated_by       = '00000000-0000-0000-0000-000000000000';

-- ============================================================================
-- 4. Field registration: PC, new PIL asset fields, new AD asset frozen fields
-- ============================================================================

WITH field_rows (
    entity_code,
    name,
    column_name,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    is_required,
    is_read_only,
    is_computed,
    is_write_once,
    compute_mode,
    enum_domain_code,
    reference_config,
    validation,
    group_key,
    sort_order
) AS (
    VALUES
    -- PC identity
    ('pricing_component','id','id','ID','uuid','identifier','one','system',true,false,false,true,NULL,NULL,NULL::jsonb,NULL::jsonb,'identity',10),
    ('pricing_component','tenant_id','tenant_id','Tenant','uuid','reference','one','system',true,false,false,true,NULL,NULL,'{"target_entity":"tenant","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'identity',20),
    ('pricing_component','company_code_id','company_code_id','Company Code','uuid','reference','one','system',true,false,false,true,NULL,NULL,'{"target_entity":"company_code","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'identity',30),

    -- PC polymorphic source
    ('pricing_component','source_doc_type','source_doc_type','Source Type','text','enum','one','system',true,false,false,true,NULL,NULL,NULL::jsonb,'{"allowed_values":["PURCHASE_REQUISITION_LINE","COMMITMENT_LINE","PURCHASE_INVOICE_LINE","GOODS_RECEIPT_LINE","SERVICE_ENTRY_SHEET_LINE"]}'::jsonb,'source',40),
    ('pricing_component','source_doc_id','source_doc_id','Source Header','uuid','reference','one','system',true,false,false,true,NULL,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'source',50),
    ('pricing_component','source_line_id','source_line_id','Source Line','uuid','reference','zero_or_one','system',false,false,false,true,NULL,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'source',60),

    -- PC term classification
    ('pricing_component','term_type','term_type','Term Type','text','enum','one','standard',true,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["discount","charge","tax","withholding","retention","principal_marker"]}'::jsonb,'classification',70),
    ('pricing_component','condition_type_id','condition_type_id','Condition Type','uuid','reference','one','standard',true,false,false,false,NULL,NULL,'{"target_entity":"condition_type","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'classification',80),
    ('pricing_component','sequence','sequence','Sequence','integer','number','one','standard',true,false,false,false,NULL,NULL,NULL::jsonb,'{"min":1}'::jsonb,'classification',90),

    -- PC basis and values
    ('pricing_component','basis','basis','Basis','text','enum','one','standard',true,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["percent","amount","per_unit","flat"]}'::jsonb,'amounts',100),
    ('pricing_component','rate_value','rate_value','Rate','numeric','number','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"min":0}'::jsonb,'amounts',110),
    ('pricing_component','amount_value','amount_value','Amount','numeric','money','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"min":0}'::jsonb,'amounts',120),
    ('pricing_component','base_for_calculation','base_for_calculation','Base for Calc','numeric','money','zero_or_one','standard',false,true,false,false,NULL,NULL,NULL::jsonb,'{"min":0}'::jsonb,'amounts',130),
    ('pricing_component','computed_amount','computed_amount','Computed Amount','numeric','money','one','system',true,true,true,false,'service',NULL,NULL::jsonb,'{"min":0}'::jsonb,'amounts',140),
    ('pricing_component','computed_base_amount','computed_base_amount','Computed Amount (Base)','numeric','money','one','system',true,true,true,false,'service',NULL,NULL::jsonb,'{"min":0}'::jsonb,'amounts',150),

    -- PC apportionment
    ('pricing_component','entry_level','entry_level','Entry Level','text','enum','one','standard',true,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["header","line"]}'::jsonb,'apportionment',160),
    ('pricing_component','apportion_basis','apportion_basis','Apportion Basis','text','enum','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["value","quantity","weight","equal"]}'::jsonb,'apportionment',170),
    ('pricing_component','is_apportioned','is_apportioned','Is Apportioned','boolean','switch','one','system',true,true,true,false,'service',NULL,NULL::jsonb,NULL::jsonb,'apportionment',180),
    ('pricing_component','is_apportioned_from_id','is_apportioned_from_id','Apportioned From','uuid','reference','zero_or_one','system',false,true,true,false,'service',NULL,'{"target_entity":"pricing_component","target_field":"id"}'::jsonb,NULL::jsonb,'apportionment',190),

    -- PC origin and lineage
    ('pricing_component','origin','origin','Origin','text','enum','one','standard',true,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["manual","inherited","vendor_default","system_resolved"]}'::jsonb,'lineage',200),
    ('pricing_component','ref_source_doc_type','ref_source_doc_type','Ref Source Type','text','enum','zero_or_one','standard',false,false,false,true,NULL,NULL,NULL::jsonb,NULL::jsonb,'lineage',210),
    ('pricing_component','ref_source_doc_id','ref_source_doc_id','Ref Source Doc','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'lineage',220),
    ('pricing_component','ref_source_line_id','ref_source_line_id','Ref Source Line','uuid','reference','zero_or_one','standard',false,false,false,true,NULL,NULL,'{"polymorphic":true}'::jsonb,NULL::jsonb,'lineage',230),
    ('pricing_component','ref_value','ref_value','Ref Value','numeric','money','zero_or_one','standard',false,false,false,true,NULL,NULL,NULL::jsonb,'{"min":0}'::jsonb,'lineage',240),

    -- PC tax and withholding
    ('pricing_component','tax_group_id','tax_group_id','Tax Group','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"tax_group","target_field":"id","display_field":"name"}'::jsonb,NULL::jsonb,'tax',250),
    ('pricing_component','is_inclusive','is_inclusive','Tax Inclusive','boolean','switch','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,NULL::jsonb,'tax',260),
    ('pricing_component','recoverable_pct','recoverable_pct','Recoverable %','numeric','percent','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"min":0,"max":100}'::jsonb,'tax',270),
    ('pricing_component','tax_section_code','tax_section_code','Tax Section','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,NULL::jsonb,'tax',280),

    -- PC currency
    ('pricing_component','currency_code','currency_code','Currency','text','currency','one','standard',true,false,false,true,NULL,NULL,NULL::jsonb,'{"max_length":3}'::jsonb,'currency',290),
    ('pricing_component','base_currency_code','base_currency_code','Base Currency','text','currency','one','standard',true,false,false,true,NULL,NULL,NULL::jsonb,'{"max_length":3}'::jsonb,'currency',300),
    ('pricing_component','exchange_rate','exchange_rate','FX Rate','numeric','number','one','standard',true,false,false,true,NULL,NULL,NULL::jsonb,'{"min":0}'::jsonb,'currency',310),

    -- PC GL routing
    ('pricing_component','business_intent_id','business_intent_id','Business Intent','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'gl_routing',320),
    ('pricing_component','posting_role_code','posting_role_code','Posting Role','text','text','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,NULL::jsonb,'gl_routing',330),
    ('pricing_component','gl_account_id','gl_account_id','GL Account','uuid','reference','zero_or_one','system',false,true,true,false,'service',NULL,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'gl_routing',340),
    ('pricing_component','account_source','account_source','Account Strategy','text','enum','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["POSTING_ROLE","FIXED","FROM_INTENT","FROM_CATEGORY"]}'::jsonb,'gl_routing',350),

    -- PC supersede chain
    ('pricing_component','superseded_by_id','superseded_by_id','Superseded By','uuid','reference','zero_or_one','system',false,true,true,false,'service',NULL,'{"target_entity":"pricing_component","target_field":"id"}'::jsonb,NULL::jsonb,'supersede',360),
    ('pricing_component','superseded_at','superseded_at','Superseded At','timestamptz','datetime','zero_or_one','system',false,true,true,false,'service',NULL,NULL::jsonb,NULL::jsonb,'supersede',370),
    ('pricing_component','superseded_by_user','superseded_by_user','Superseded By User','uuid','reference','zero_or_one','system',false,true,true,false,'service',NULL,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'supersede',380),

    -- PC system and audit
    ('pricing_component','row_version','row_version','Row Version','bigint','number','one','system',true,true,true,false,'trigger',NULL,NULL::jsonb,NULL::jsonb,'system',390),
    ('pricing_component','tags','tags','Tags','jsonb','tags','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,NULL::jsonb,'annotation',400),
    ('pricing_component','metadata','metadata','Metadata','jsonb','json','zero_or_one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,NULL::jsonb,'annotation',410),
    ('pricing_component','created_at','created_at','Created At','timestamptz','datetime','one','system',true,false,false,true,NULL,NULL,NULL::jsonb,NULL::jsonb,'audit',420),
    ('pricing_component','created_by','created_by','Created By','uuid','reference','one','system',true,false,false,true,NULL,NULL,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'audit',430),
    ('pricing_component','updated_at','updated_at','Updated At','timestamptz','datetime','zero_or_one','system',false,true,true,false,'trigger',NULL,NULL::jsonb,NULL::jsonb,'audit',440),
    ('pricing_component','updated_by','updated_by','Updated By','uuid','reference','zero_or_one','system',false,true,false,false,NULL,NULL,'{"target_entity":"principal","target_field":"id","display_field":"display_name"}'::jsonb,NULL::jsonb,'audit',450),

    -- PIL P3 asset fields
    ('purchase_invoice_line','asset_treatment','asset_treatment','Asset Treatment','text','enum','one','standard',false,false,false,false,NULL,NULL,NULL::jsonb,'{"allowed_values":["none","expense_low_value","class_pending","target_asset"]}'::jsonb,'asset',142),
    ('purchase_invoice_line','asset_class_id','asset_class_id','Asset Class','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"asset_class","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'asset',145),
    ('purchase_invoice_line','target_asset_id','target_asset_id','Target Asset','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"asset","target_field":"id","display_field":"name","picker":{"code_field":"asset_number","show_code":true}}'::jsonb,NULL::jsonb,'asset',146),

    -- AD P3 frozen asset fields
    ('accounting_distribution','asset_posting_target','asset_posting_target','Asset Posting Target','text','enum','zero_or_one','system',false,true,true,false,'service',NULL,NULL::jsonb,'{"allowed_values":["cwip_clearing","fixed_asset","class_clearing","expense"]}'::jsonb,'asset',96),
    ('accounting_distribution','target_asset_id','target_asset_id','Target Asset','uuid','reference','zero_or_one','system',false,true,true,false,'service',NULL,'{"target_entity":"asset","target_field":"id","display_field":"name","picker":{"code_field":"asset_number","show_code":true}}'::jsonb,NULL::jsonb,'asset',97)
)
INSERT INTO control.entity_field (
    tenant_id,
    entity_version_id,
    name,
    column_name,
    label,
    data_type,
    ui_type,
    cardinality,
    origin,
    is_required,
    is_read_only,
    is_computed,
    is_write_once,
    compute_mode,
    enum_config,
    enum_domain_code,
    reference_config,
    validation,
    group_key,
    is_active,
    sort_order,
    created_by,
    updated_by
)
SELECT NULL,
       ev.id,
       fr.name,
       fr.column_name,
       fr.label,
       fr.data_type,
       fr.ui_type,
       fr.cardinality,
       fr.origin,
       fr.is_required,
       fr.is_read_only,
       fr.is_computed,
       fr.is_write_once,
       fr.compute_mode,
       CASE
           WHEN fr.data_type = 'enum' AND fr.enum_domain_code IS NULL THEN fr.validation
           ELSE NULL::jsonb
       END,
       fr.enum_domain_code,
       fr.reference_config,
       CASE
           WHEN fr.data_type = 'enum' AND fr.enum_domain_code IS NULL THEN NULL::jsonb
           ELSE fr.validation
       END,
       fr.group_key,
       true,
       fr.sort_order::smallint,
       '00000000-0000-0000-0000-000000000000',
       '00000000-0000-0000-0000-000000000000'
  FROM field_rows fr
  JOIN control.entity e
    ON e.entity_code = fr.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET column_name      = EXCLUDED.column_name,
    label            = EXCLUDED.label,
    data_type        = EXCLUDED.data_type,
    ui_type          = EXCLUDED.ui_type,
    cardinality      = EXCLUDED.cardinality,
    origin           = EXCLUDED.origin,
    is_required      = EXCLUDED.is_required,
    is_read_only     = EXCLUDED.is_read_only,
    is_computed      = EXCLUDED.is_computed,
    is_write_once    = EXCLUDED.is_write_once,
    compute_mode     = EXCLUDED.compute_mode,
    enum_config      = CASE WHEN EXCLUDED.enum_domain_code IS NOT NULL THEN NULL ELSE EXCLUDED.enum_config END,
    enum_domain_code = EXCLUDED.enum_domain_code,
    reference_config = EXCLUDED.reference_config,
    validation       = EXCLUDED.validation,
    group_key        = EXCLUDED.group_key,
    is_active        = true,
    sort_order       = EXCLUDED.sort_order,
    updated_at       = now(),
    updated_by       = '00000000-0000-0000-0000-000000000000';

-- ============================================================================
-- 5. Computed field flags
-- ============================================================================

WITH computed_fields(entity_code, field_name, compute_mode) AS (
    VALUES
    -- PI header
    ('purchase_invoice','total_amount','trigger'),
    ('purchase_invoice','net_amount','trigger'),
    ('purchase_invoice','tax_amount','trigger'),
    ('purchase_invoice','line_count','trigger'),
    ('purchase_invoice','payable_amount','generated'),
    ('purchase_invoice','outstanding_amount','generated'),
    ('purchase_invoice','paid_amount','service'),
    ('purchase_invoice','match_status','service'),

    -- PIL
    ('purchase_invoice_line','net_amount','generated'),
    ('purchase_invoice_line','gross_amount','service'),
    ('purchase_invoice_line','match_status','service'),
    ('purchase_invoice_line','matched_quantity','service'),

    -- AD
    ('accounting_distribution','distributed_amount','service'),
    ('accounting_distribution','budget_check_result','service'),
    ('accounting_distribution','asset_posting_target','service'),
    ('accounting_distribution','target_asset_id','service'),

    -- PC
    ('pricing_component','computed_amount','service'),
    ('pricing_component','computed_base_amount','service'),
    ('pricing_component','is_apportioned','service'),
    ('pricing_component','is_apportioned_from_id','service'),
    ('pricing_component','gl_account_id','service'),
    ('pricing_component','superseded_by_id','service'),
    ('pricing_component','superseded_at','service'),
    ('pricing_component','superseded_by_user','service'),
    ('pricing_component','row_version','trigger'),
    ('pricing_component','updated_at','trigger')
)
UPDATE control.entity_field ef
   SET is_computed  = true,
       compute_mode = cf.compute_mode,
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
  FROM computed_fields cf
  JOIN control.entity e
    ON e.entity_code = cf.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = cf.field_name;

-- ============================================================================
-- 6. Field editability gates
-- ============================================================================

WITH field_rules(entity_code, field_name, allowed_statuses, reason) AS (
    VALUES
    -- PI header
    ('purchase_invoice','supplier_id',ARRAY['draft'],'Supplier locks at submit; identity is frozen in invoice_party_snapshot.'),
    ('purchase_invoice','supplier_invoice_number',ARRAY['draft','rejected'],'Vendor invoice number locks from submit onward to prevent duplicate-evasion.'),
    ('purchase_invoice','supplier_invoice_date',ARRAY['draft','rejected'],'Vendor invoice date locks from submit onward.'),
    ('purchase_invoice','invoice_source',ARRAY['draft'],'Invoice source drives matching and commitment requirements.'),
    ('purchase_invoice','invoice_type',ARRAY['draft'],'Invoice type drives JE template and credit/debit handling.'),
    ('purchase_invoice','company_code_id',ARRAY['draft'],'Company code drives chart of accounts and tax setup.'),
    ('purchase_invoice','commitment_id',ARRAY['draft','rejected'],'Commitment link drives PO matching.'),
    ('purchase_invoice','currency_code',ARRAY['draft'],'Currency drives FX snapshot and tax engine.'),
    ('purchase_invoice','exchange_rate',ARRAY['draft','rejected'],'FX rate captured at posting; pre-post correction allowed.'),
    ('purchase_invoice','invoice_date',ARRAY['draft','rejected'],'Document date locks after approval.'),
    ('purchase_invoice','posting_date',ARRAY['draft','rejected'],'Posting date determines period and FX; locks after approval.'),
    ('purchase_invoice','discount_amount',ARRAY['draft','rejected'],'Discount changes the engine recomputation contract.'),
    ('purchase_invoice','freight_amount',ARRAY['draft','rejected'],'Freight locks at submit; use credit-note for corrections.'),
    ('purchase_invoice','misc_charges_amount',ARRAY['draft','rejected'],'Misc charges lock at submit.'),
    ('purchase_invoice','withholding_tax_amount',ARRAY['draft','rejected'],'WHT is computed pre-submit and locks.'),
    ('purchase_invoice','hold_reason',ARRAY['on_hold'],'Hold reason is editable only while status = on_hold.'),
    ('purchase_invoice','fiscal_document_number',ARRAY['draft','rejected'],'Fiscal document reference is part of the legal invoice once submitted.'),
    ('purchase_invoice','description',ARRAY['draft','rejected','pending_approval'],'Invoice name/description can be refined during approval.'),
    ('purchase_invoice','payment_term_id',ARRAY['draft','rejected'],'Payment terms drive due_date and clauses; locked at submit.'),
    ('purchase_invoice','payment_method_id',ARRAY['draft','rejected'],'Payment method drives bank/rail selection; locked at submit.'),
    ('purchase_invoice','base_currency_code',ARRAY['draft'],'Base currency comes from the company code; only draft edits via re-scope.'),
    ('purchase_invoice','received_date',ARRAY['draft','rejected'],'Received date is part of the operational audit trail.'),
    ('purchase_invoice','baseline_date',ARRAY['draft','rejected'],'Baseline date drives payment-term scheduling.'),
    ('purchase_invoice','due_date',ARRAY['draft','rejected','pending_approval'],'Due date can be deferred during approval; locked after approval.'),
    ('purchase_invoice','tax_mode',ARRAY['draft','rejected'],'Tax mode drives tax engine behavior; locked at submit.'),
    ('purchase_invoice','tax_mode_source',ARRAY['draft','rejected'],'Tax mode source explains derivation; locked at submit.'),
    ('purchase_invoice','advance_deduction_amount',ARRAY['draft','rejected'],'Advance deduction changes payable; locked at submit.'),
    ('purchase_invoice','retention_amount',ARRAY['draft','rejected'],'Retention amount creates AP Retention Payable; locked at submit.'),
    ('purchase_invoice','retention_pct',ARRAY['draft','rejected'],'Retention percent drives retention calculation; locked at submit.'),
    ('purchase_invoice','match_type',ARRAY['draft','rejected'],'Match type controls 2-way/3-way matching; locked at submit.'),
    ('purchase_invoice','is_reversal',ARRAY['draft'],'Reversal flag drives JE construction; immutable after submit.'),
    ('purchase_invoice','reversal_of_id',ARRAY['draft'],'Reversal target is part of audit trail; immutable after submit.'),
    ('purchase_invoice','cost_center_id',ARRAY['draft','rejected'],'Cost centre is the default for line postings.'),
    ('purchase_invoice','profit_center_id',ARRAY['draft','rejected'],'Profit centre is the default for line postings.'),
    ('purchase_invoice','project_id',ARRAY['draft','rejected'],'Project is the default for line postings.'),
    ('purchase_invoice','site_id',ARRAY['draft','rejected'],'Site is the default for line postings.'),
    ('purchase_invoice','budget_allocation_id',ARRAY['draft','rejected'],'Budget allocation drives budget consumption; locked at submit.'),
    ('purchase_invoice','fiscal_year',ARRAY['draft','rejected'],'Fiscal year is derived from posting_date; corrections via re-date.'),
    ('purchase_invoice','period_number',ARRAY['draft','rejected'],'Period is derived from posting_date; corrections via re-date.'),
    ('purchase_invoice','notes',ARRAY['draft','rejected','pending_approval','approved','on_hold'],'Operational notes can be appended through the active lifecycle.'),
    ('purchase_invoice','tags',ARRAY['draft','rejected','pending_approval','approved','on_hold'],'Tags can be applied through the active lifecycle.'),

    -- PIL
    ('purchase_invoice_line','purchase_invoice_id',ARRAY['draft'],'Parent invoice link is set at line creation and cannot be reassigned.'),
    ('purchase_invoice_line','line_no',ARRAY['draft'],'Line number is assigned at creation and is immutable thereafter.'),
    ('purchase_invoice_line','item_id',ARRAY['draft','rejected'],'Item link drives accounting category and posting profile.'),
    ('purchase_invoice_line','item_description',ARRAY['draft','rejected'],'Description is part of the legal invoice record once submitted.'),
    ('purchase_invoice_line','procurement_type',ARRAY['draft','rejected'],'Procurement type drives matching and GL category.'),
    ('purchase_invoice_line','commodity_category_id',ARRAY['draft','rejected'],'Commodity category drives account derivation and budget mapping.'),
    ('purchase_invoice_line','business_intent_id',ARRAY['draft','rejected'],'Business intent drives accounting profile resolution.'),
    ('purchase_invoice_line','unspsc_code',ARRAY['draft','rejected'],'UNSPSC code is part of procurement audit record.'),
    ('purchase_invoice_line','hs_code',ARRAY['draft','rejected'],'HS code is part of customs/trade compliance record.'),
    ('purchase_invoice_line','uom_code',ARRAY['draft','rejected'],'UoM drives quantity matching and GR receipt processing.'),
    ('purchase_invoice_line','quantity',ARRAY['draft','rejected'],'Quantity changes header totals; locked after submit.'),
    ('purchase_invoice_line','unit_price',ARRAY['draft','rejected'],'Unit price changes header totals; locked after submit.'),
    ('purchase_invoice_line','price_unit',ARRAY['draft','rejected'],'Price denominator changes the computed net amount.'),
    ('purchase_invoice_line','discount_pct',ARRAY['draft','rejected'],'Discount percent changes header subtotal.'),
    ('purchase_invoice_line','discount_amount',ARRAY['draft','rejected'],'Discount amount changes header subtotal.'),
    ('purchase_invoice_line','tax_amount',ARRAY['draft','rejected'],'Tax amount changes header tax total.'),
    ('purchase_invoice_line','withholding_tax_amount',ARRAY['draft','rejected'],'WHT amount changes header WHT total.'),
    ('purchase_invoice_line','retention_pct',ARRAY['draft','rejected'],'Retention percent changes retention liability calculation.'),
    ('purchase_invoice_line','retention_amount',ARRAY['draft','rejected'],'Retention amount changes the AP Retention Payable.'),
    ('purchase_invoice_line','cost_center_id',ARRAY['draft','rejected'],'Cost centre drives GL posting; locked after submit.'),
    ('purchase_invoice_line','profit_center_id',ARRAY['draft','rejected'],'Profit centre drives GL posting; locked after submit.'),
    ('purchase_invoice_line','project_id',ARRAY['draft','rejected'],'Project drives GL posting; locked after submit.'),
    ('purchase_invoice_line','site_id',ARRAY['draft','rejected'],'Site drives GL posting; locked after submit.'),
    ('purchase_invoice_line','asset_treatment',ARRAY['draft','rejected'],'Asset treatment locks at submit and drives AD asset_posting_target.'),
    ('purchase_invoice_line','asset_class_id',ARRAY['draft','rejected'],'Asset class drives depreciation policy and GL routing; locks at submit.'),
    ('purchase_invoice_line','target_asset_id',ARRAY['draft','rejected'],'Target asset is the procurement intent; locks at submit.'),

    -- AD
    ('accounting_distribution','distribution_basis',ARRAY['draft','rejected'],'Split basis changes the AD amount/qty allocation contract.'),
    ('accounting_distribution','split_pct',ARRAY['draft','rejected'],'Percent splits must sum to 100 across the source line; locks at submit.'),
    ('accounting_distribution','split_amount',ARRAY['draft','rejected'],'Amount splits change posting allocations; locks at submit.'),
    ('accounting_distribution','account_source',ARRAY['draft','rejected'],'Account source drives resolve_entry_account(); locks at submit.'),
    ('accounting_distribution','gl_account_id',ARRAY['draft','rejected'],'Explicit GL account locks at submit to preserve audit trail.'),
    ('accounting_distribution','account_code',ARRAY['draft','rejected'],'Account code is an alternate FIXED-source input; locks at submit.'),
    ('accounting_distribution','business_intent_id',ARRAY['draft','rejected'],'Business intent drives FROM_INTENT account resolution.'),
    ('accounting_distribution','commodity_category_id',ARRAY['draft','rejected'],'Commodity category drives FROM_CATEGORY account resolution.'),
    ('accounting_distribution','cost_center_id',ARRAY['draft','rejected'],'Cost centre drives GL posting; locks at submit.'),
    ('accounting_distribution','profit_center_id',ARRAY['draft','rejected'],'Profit centre drives GL posting; locks at submit.'),
    ('accounting_distribution','project_id',ARRAY['draft','rejected'],'Project drives GL posting; locks at submit.'),
    ('accounting_distribution','site_id',ARRAY['draft','rejected'],'Site drives GL posting; locks at submit.'),
    ('accounting_distribution','is_capex',ARRAY['draft','rejected'],'CapEx flag controls fixed asset capitalization on posting.'),
    ('accounting_distribution','asset_class_id',ARRAY['draft','rejected'],'Asset class drives fixed asset book; locks at submit.'),
    ('accounting_distribution','description',ARRAY['draft','rejected','on_hold'],'Split text is annotative; editable while parent invoice is correctable.'),

    -- PC
    ('pricing_component','term_type',ARRAY['draft','rejected'],'Term type drives waterfall and GL routing; immutable after submit.'),
    ('pricing_component','condition_type_id',ARRAY['draft','rejected'],'Condition type defines defaults; immutable after submit.'),
    ('pricing_component','sequence',ARRAY['draft','rejected'],'Waterfall sequence locks at submit to preserve order.'),
    ('pricing_component','basis',ARRAY['draft','rejected'],'Computation basis is the contract; immutable after submit.'),
    ('pricing_component','rate_value',ARRAY['draft','rejected'],'Percent or per-unit value; locks at submit.'),
    ('pricing_component','amount_value',ARRAY['draft','rejected'],'Flat or amount value; locks at submit.'),
    ('pricing_component','base_for_calculation',ARRAY['draft','rejected'],'Pre-resolved waterfall base; audit field.'),
    ('pricing_component','entry_level',ARRAY['draft','rejected'],'Header vs line scope is set at create.'),
    ('pricing_component','apportion_basis',ARRAY['draft','rejected'],'Apportionment method for header-to-line distribution.'),
    ('pricing_component','origin',ARRAY['draft','rejected'],'Manual vs inherited indicator; user-editable at draft.'),
    ('pricing_component','tax_group_id',ARRAY['draft','rejected'],'Tax group drives rate and GL; locks at submit.'),
    ('pricing_component','is_inclusive',ARRAY['draft','rejected'],'Inclusive or exclusive computation mode; locks at submit.'),
    ('pricing_component','recoverable_pct',ARRAY['draft','rejected'],'Partial-recovery percentage; locks at submit.'),
    ('pricing_component','tax_section_code',ARRAY['draft','rejected'],'Jurisdiction tax section code; locks at submit.'),
    ('pricing_component','exchange_rate',ARRAY['draft','rejected'],'FX rate is correctable pre-post.'),
    ('pricing_component','business_intent_id',ARRAY['draft','rejected'],'Term-level intent override; locks at submit.'),
    ('pricing_component','posting_role_code',ARRAY['draft','rejected'],'Strategy parameter for POSTING_ROLE source.'),
    ('pricing_component','account_source',ARRAY['draft','rejected'],'Resolution strategy enum.'),
    ('pricing_component','tags',ARRAY['draft','rejected'],'Operational tags.'),
    ('pricing_component','metadata',ARRAY['draft','rejected'],'Free-form metadata.')
)
UPDATE control.entity_field ef
   SET editability = jsonb_build_object(
           'editable_in_status', to_jsonb(fr.allowed_statuses),
           'reason', fr.reason
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM field_rules fr
  JOIN control.entity e
    ON e.entity_code = fr.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = fr.field_name;

-- ============================================================================
-- 7. Visibility rules
-- ============================================================================

WITH visibility_rules(entity_code, field_name, predicate) AS (
    VALUES
    -- PI header
    ('purchase_invoice','reversal_of_id',jsonb_build_object('field','is_reversal','eq',true)),
    ('purchase_invoice','tax_mode_source',jsonb_build_object('field','tax_mode','notNull',true)),
    ('purchase_invoice','hold_reason',jsonb_build_object('field','status','eq','on_hold')),
    ('purchase_invoice','retention_pct',jsonb_build_object('field','retention_amount','notNull',true)),
    ('purchase_invoice','advance_deduction_amount',jsonb_build_object('field','commitment_id','notNull',true)),
    ('purchase_invoice','budget_check_result',jsonb_build_object('field','budget_allocation_id','notNull',true)),

    -- PI type-specific metadata fields
    ('purchase_invoice','credited_invoice_id',jsonb_build_object('field','invoice_type','eq','credit_note')),
    ('purchase_invoice','credit_reason',jsonb_build_object('field','invoice_type','eq','credit_note')),
    ('purchase_invoice','credit_reference',jsonb_build_object('field','invoice_type','eq','credit_note')),
    ('purchase_invoice','credit_note_date',jsonb_build_object('field','invoice_type','eq','credit_note')),
    ('purchase_invoice','credit_note_name',jsonb_build_object('field','invoice_type','eq','credit_note')),
    ('purchase_invoice','debited_invoice_id',jsonb_build_object('field','invoice_type','eq','debit_note')),
    ('purchase_invoice','debit_reason',jsonb_build_object('field','invoice_type','eq','debit_note')),
    ('purchase_invoice','debit_note_number',jsonb_build_object('field','invoice_type','eq','debit_note')),
    ('purchase_invoice','debit_note_date',jsonb_build_object('field','invoice_type','eq','debit_note')),
    ('purchase_invoice','debit_note_name',jsonb_build_object('field','invoice_type','eq','debit_note')),
    ('purchase_invoice','advance_type',jsonb_build_object('field','invoice_type','eq','advance')),
    ('purchase_invoice','recovery_method',jsonb_build_object('field','invoice_type','eq','advance')),
    ('purchase_invoice','advance_request_reference',jsonb_build_object('field','invoice_type','eq','advance')),
    ('purchase_invoice','advance_request_date',jsonb_build_object('field','invoice_type','eq','advance')),
    ('purchase_invoice','advance_name',jsonb_build_object('field','invoice_type','eq','advance')),
    ('purchase_invoice','retention_invoice_id',jsonb_build_object('field','invoice_type','eq','retention_release')),
    ('purchase_invoice','release_type',jsonb_build_object('field','invoice_type','eq','retention_release')),
    ('purchase_invoice','application_strategy',jsonb_build_object('field','invoice_type','eq','retention_release')),
    ('purchase_invoice','release_request_reference',jsonb_build_object('field','invoice_type','eq','retention_release')),
    ('purchase_invoice','release_date',jsonb_build_object('field','invoice_type','eq','retention_release')),
    ('purchase_invoice','release_name',jsonb_build_object('field','invoice_type','eq','retention_release')),

    -- PIL
    ('purchase_invoice_line','retention_pct',jsonb_build_object('field','retention_amount','notNull',true)),
    ('purchase_invoice_line','asset_class_id',jsonb_build_object('field','asset_treatment','ne','none')),
    ('purchase_invoice_line','target_asset_id',jsonb_build_object('field','asset_treatment','eq','target_asset')),

    -- AD
    ('accounting_distribution','posting_role_code',jsonb_build_object('field','account_source','eq','POSTING_ROLE')),
    ('accounting_distribution','gl_account_id',jsonb_build_object('field','account_source','eq','FIXED')),
    ('accounting_distribution','account_code',jsonb_build_object('field','account_source','eq','FIXED')),
    ('accounting_distribution','asset_class_id',jsonb_build_object('field','is_capex','eq',true)),
    ('accounting_distribution','budget_check_result',jsonb_build_object('field','budget_allocation_id','notNull',true)),
    ('accounting_distribution','asset_posting_target',jsonb_build_object('field','is_capex','eq',true)),
    ('accounting_distribution','target_asset_id',jsonb_build_object('field','is_capex','eq',true))
)
UPDATE control.entity_field ef
   SET ui_hint = jsonb_set(
                     COALESCE(ef.ui_hint, '{}'::jsonb),
                     '{display}',
                     COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                       || jsonb_build_object('visible_when', vr.predicate),
                     true
                 ),
       visibility = jsonb_set(
                     COALESCE(ef.visibility, '{}'::jsonb),
                     '{when}',
                     vr.predicate,
                     true
                 ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM visibility_rules vr
  JOIN control.entity e
    ON e.entity_code = vr.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = vr.field_name;

-- Hide fields that are system-managed or not intended for create/edit forms.
WITH hide_rules(entity_code, field_name) AS (
    VALUES
    ('purchase_invoice','workflow_request_id'),
    ('purchase_invoice','approved_at'),
    ('purchase_invoice','approved_by'),
    ('purchase_invoice','posted_at'),
    ('purchase_invoice','posted_by'),
    ('purchase_invoice','status_changed_at'),
    ('purchase_invoice','status_changed_by'),
    ('purchase_invoice','is_posted'),
    ('purchase_invoice','ap_je_id'),
    ('purchase_invoice','line_count'),
    ('purchase_invoice','term_snapshot'),
    ('purchase_invoice','dimension_set_id'),
    ('purchase_invoice','row_version'),
    ('purchase_invoice','metadata'),
    ('purchase_invoice','status')
)
UPDATE control.entity_field ef
   SET ui_hint = jsonb_set(
                      COALESCE(ef.ui_hint, '{}'::jsonb),
                      '{display}',
                      COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                        || jsonb_build_object('hide_in', to_jsonb(ARRAY['create','edit'])),
                      true
                    ),
       visibility = jsonb_set(
                      COALESCE(ef.visibility, '{}'::jsonb),
                      '{hide_in}',
                      to_jsonb(ARRAY['create','edit']),
                      true
                    ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM hide_rules hr
  JOIN control.entity e
    ON e.entity_code = hr.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = hr.field_name;

-- ============================================================================
-- 8. Cascade/default rules
-- ============================================================================

WITH pil_cascades(pil_field, parent_field) AS (
    VALUES
    ('cost_center_id','cost_center_id'),
    ('profit_center_id','profit_center_id'),
    ('project_id','project_id'),
    ('site_id','site_id'),
    ('budget_allocation_id','budget_allocation_id')
)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind', 'parent_field',
             'parent_entity', 'purchase_invoice',
             'parent_field', pc.parent_field,
             'apply_on', jsonb_build_array('create')
         ),
         'override_detection', jsonb_build_object(
             'compare_to', 'parent.' || pc.parent_field,
             'label_when_inherited', 'From header',
             'label_when_overridden', 'Overridden',
             'label_when_inherited_null', 'Not set'
         ),
         'on_parent_change', 'preserve',
         'ui_affordance', jsonb_build_object(
             'show_reset_to_default', true,
             'show_inheritance_chip', true,
             'chip_position', 'field_label'
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM pil_cascades pc
  JOIN control.entity e
    ON e.entity_code = 'purchase_invoice_line'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = pc.pil_field;

-- business_intent_id is intentionally line-set today, not inherited from PI.
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind', 'static',
             'static_value', NULL,
             'apply_on', jsonb_build_array('create')
         ),
         'override_detection', NULL,
         'on_parent_change', 'preserve',
         'ui_affordance', jsonb_build_object(
             'show_reset_to_default', false,
             'show_inheritance_chip', false,
             'chip_position', 'none'
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE e.entity_code = 'purchase_invoice_line'
   AND e.tenant_id IS NULL
   AND ef.entity_version_id = ev.id
   AND ef.name = 'business_intent_id';

UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind', 'parent_field',
             'parent_entity', 'purchase_invoice_line',
             'parent_field', 'business_intent_id',
             'apply_on', jsonb_build_array('create')
         ),
         'override_detection', jsonb_build_object(
             'compare_to', 'parent.business_intent_id',
             'label_when_inherited', 'Line intent',
             'label_when_overridden', 'Term-specific intent',
             'label_when_inherited_null', 'Not set'
         ),
         'on_parent_change', 'preserve',
         'ui_affordance', jsonb_build_object(
             'show_reset_to_default', true,
             'show_inheritance_chip', true,
             'chip_position', 'field_label'
         )
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity e
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE e.entity_code = 'pricing_component'
   AND e.tenant_id IS NULL
   AND ef.entity_version_id = ev.id
   AND ef.name = 'business_intent_id';

-- ============================================================================
-- 9. Legacy field deactivation
-- ============================================================================

WITH inactive_fields(entity_code, field_name) AS (
    VALUES
    ('purchase_invoice','is_on_hold'),
    ('purchase_invoice','is_credit_note'),
    ('purchase_invoice','invoice_number'),
    ('purchase_invoice','code'),
    ('purchase_invoice_line','is_asset'),
    ('purchase_invoice_line','asset_category_id')
)
UPDATE control.entity_field ef
   SET is_active = false,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM inactive_fields f
  JOIN control.entity e
    ON e.entity_code = f.entity_code
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = f.field_name;

-- ============================================================================
-- 10. Development assertions
-- ============================================================================

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
     WHERE e.entity_code = 'pricing_component'
       AND e.tenant_id IS NULL
       AND ev.tenant_id IS NULL;
    IF v_count <> 1 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected pricing_component entity + v1, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'pricing_component'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.is_active = true;
    IF v_count < 45 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected at least 45 active PC fields, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name IN ('asset_treatment','asset_class_id','target_asset_id')
       AND ef.is_active = true;
    IF v_count <> 3 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected 3 active PIL asset fields, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name IN ('asset_posting_target','target_asset_id')
       AND ef.is_active = true
       AND ef.is_computed = true;
    IF v_count <> 2 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected 2 computed AD asset fields, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code IN ('purchase_invoice_line','pricing_component')
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'business_intent_id'
       AND ef.defaults IS NOT NULL;
    IF v_count <> 2 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected business_intent cascade/default rows for PIL + PC, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity e
     WHERE e.entity_code IN ('purchase_invoice','purchase_invoice_line')
       AND e.tenant_id IS NULL
       AND jsonb_typeof(e.display_config->'list_columns') = 'array'
       AND jsonb_array_length(e.display_config->'list_columns') > 0;
    IF v_count <> 2 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected PI + PIL list_columns display config, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'purchase_invoice'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.group_key IS NOT NULL
       AND ef.is_active = true;
    IF v_count < 50 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected at least 50 grouped active PI fields, got %', v_count;
    END IF;
END $$;

COMMIT;
