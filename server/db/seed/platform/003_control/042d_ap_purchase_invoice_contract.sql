-- AP document cluster metadata contract: PI / PIL / PC / AD entities.
-- Kept together so the full invoice model is readable in one file after a reset.
-- Physical DDL lives under server/db/ddl/document.
-- Section order:
--   Â§1  Register PC entity + v1
--   Â§2  AP display/list columns and PI field groups
--   Â§3  PI invoice-type logical fields
--   Â§4  PC fields + PIL/AD asset fields
--   Â§5  Mark computed fields
--   Â§6  Editability gates
--   Â§7  Visibility rules
--   Â§8  Cascade / default rules
--   Â§9  Deactivate legacy AP fields
--   Â§10 Contract assertions (after reset)
--   Â§11 Hide phase-3 resolver outputs from forms
--   Â§12 Hide PI system/audit/derived fields from forms
--   Â§13 PI action rules â€” state matrix
-- Run after 040/041/042; run before 043/044/046.

BEGIN;
SET LOCAL app.bypass_version_lock = 'true';

-- Â§1 pricing_component entity registration

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
    (SELECT id::text FROM shared.module WHERE code = 'ACC'),
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
    '{"natural_key_fields":["id"]}'::jsonb,
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

-- Â§2 AP display and grouping contract

UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'line_ui_variant', 'procure',
                             'line_entity_code', 'purchase_invoice_line',
                             'list_columns', jsonb_build_array(
                                 'code',
                                 'name',
                                 'invoice_type',
                                 'supplier_id',
                                 'supplier_invoice_date',
                                 'status',
                                 'created_at'
                             ),
                             'header', jsonb_build_object(
                                 'layout', 'approvable_document_v2',
                                 'amount', jsonb_build_object(
                                     'headline', jsonb_build_object(
                                         'field', 'total_amount',
                                         'currency_field', 'currency_code',
                                         'label', 'Gross',
                                         'base_amount', jsonb_build_object(
                                             'currency_field', 'base_currency_code',
                                             'exchange_rate_field', 'exchange_rate'
                                         )
                                     ),
                                     'secondary', jsonb_build_object(
                                         'field', 'outstanding_amount',
                                         'currency_field', 'currency_code',
                                         'label', 'Outstanding',
                                         'visible_when', jsonb_build_object(
                                             'status_in', jsonb_build_array('approved', 'posted', 'partially_paid'),
                                             'field_gt', 0
                                         )
                                     )
                                 ),
                                 'subtitle_rows', jsonb_build_array(
                                     jsonb_build_object(
                                         'kind', 'party',
                                         'fields', jsonb_build_array('supplier_id')
                                     ),
                                     jsonb_build_object(
                                         'kind', 'external_reference',
                                         'fields', jsonb_build_array('supplier_invoice_number', 'supplier_invoice_date')
                                     )
                                 ),
                                 'facts', jsonb_build_array(
                                     jsonb_build_object('field', 'invoice_date', 'label', 'Invoice Date', 'value_type', 'date'),
                                     jsonb_build_object('field', 'posting_date', 'label', 'Posting Date', 'value_type', 'date'),
                                     jsonb_build_object('field', 'due_date', 'label', 'Due Date', 'value_type', 'date')
                                 ),
                                 'status_badges', jsonb_build_array(
                                     jsonb_build_object(
                                         'kind', 'match_pair',
                                         'label', 'Matching',
                                         'type_field', 'match_type',
                                         'status_field', 'match_status',
                                         'format', '{type} - {status}'
                                     )
                                 ),
                                 'tabs', jsonb_build_object(
                                     'order', jsonb_build_array(
                                         'details',
                                         'identity',
                                         'lines',
                                         'components',
                                         'process',
                                         'lifecycle',
                                         'versions',
                                         'audit'
                                     )
                                 )
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_invoice'
   AND tenant_id IS NULL;

UPDATE control.entity
   SET identity_config = COALESCE(identity_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'header', jsonb_build_object(
                               'primary', jsonb_build_object('field', 'code'),
                               'secondary', jsonb_build_object('field', 'description', 'optional', true),
                               'classification', jsonb_build_object('field', 'invoice_type'),
                               'status', jsonb_build_object(
                                 'process_state_first', true,
                                 'field', 'status'
                               )
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_invoice'
   AND tenant_id IS NULL;

-- Phase B â€” seed-driven document_runtime surfaces. Any entity that populates
-- display_config.document_runtime.surfaces gets those surfaces attached to
-- its runtime descriptor via buildDocumentRuntimeSurfaces() â€” no per-entity
-- TS code required. The identity summary surface is auto-appended for
-- procurement entities by that reader, so it is not seeded here.
--
-- The sibling `components.lookups` slot is retained as reference data for
-- the lookup codes reused by document_lines / document_components configs
-- below; nothing else reads it after Phase B.
UPDATE control.entity
   SET display_config = COALESCE(display_config, '{}'::jsonb)
                        || jsonb_build_object(
                             'document_runtime', jsonb_build_object(
                                 'components', jsonb_build_object(
                                     'lookups', jsonb_build_object(
                                         'discount',  'pi_discount_condition_types',
                                         'charge',    'pi_charge_condition_types',
                                         'tax',       'pi_tax_condition_types',
                                         'tax_group', 'pi_tax_groups',
                                         'wht',       'pi_wht_condition_types',
                                         'wht_group', 'pi_wht_groups'
                                     )
                                 ),
                                 'surfaces', jsonb_build_array(
                                     jsonb_build_object(
                                         'kind',      'document_lines',
                                         'key',       'purchase_invoice__document_lines',
                                         'label',     'Lines',
                                         'order',     1010,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'relations', jsonb_build_object(
                                                 'lines',             'lines',
                                                 'pricingComponents', 'pricing_components',
                                                 'distributions',     'accounting_distributions'
                                             ),
                                             'source_doc_type',                   'purchase_invoice_line',
                                             'condition_type_lookup_code',        'pi_discount_condition_types',
                                             'charge_condition_type_lookup_code', 'pi_charge_condition_types',
                                             'tax_condition_type_lookup_code',    'pi_tax_condition_types',
                                             'tax_group_lookup_code',             'pi_tax_groups',
                                             'wht_condition_type_lookup_code',    'pi_wht_condition_types',
                                             'wht_group_lookup_code',             'pi_wht_groups'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'kind',      'document_components',
                                         'key',       'purchase_invoice__document_components',
                                         'label',     'Components',
                                         'order',     1020,
                                         'placement', 'main',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'source_doc_type',                   'purchase_invoice_line',
                                             'condition_type_lookup_code',        'pi_discount_condition_types',
                                             'charge_condition_type_lookup_code', 'pi_charge_condition_types',
                                             'tax_condition_type_lookup_code',    'pi_tax_condition_types',
                                             'tax_group_lookup_code',             'pi_tax_groups',
                                             'wht_condition_type_lookup_code',    'pi_wht_condition_types',
                                             'wht_group_lookup_code',             'pi_wht_groups'
                                         )
                                     ),
                                     jsonb_build_object(
                                         'kind',      'postings_preview',
                                         'key',       'purchase_invoice__postings_preview',
                                         'label',     'Postings Preview',
                                         'order',     1030,
                                         'placement', 'action_only',
                                         'enabled',   true,
                                         'config',    jsonb_build_object(
                                             'posting_strategy_code', 'ap_invoice',
                                             'toolbar_action', jsonb_build_object(
                                                 'code',      'preview_postings',
                                                 'label',     'Preview Postings',
                                                 'icon',      'ListChecks',
                                                 'placement', 'secondary'
                                             )
                                         )
                                     )
                                 )
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
                                 'item_id',
                                 'item_description',
                                 'quantity',
                                 'unit_price',
                                 'net_amount',
                                 'tax_amount',
                                 'gross_amount',
                                 'match_status',
                                 'site_id'
                             )
                           ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE entity_code = 'purchase_invoice_line'
   AND tenant_id IS NULL;

-- Shared procurement header field groups are now seeded in 020_control_field_group_contract.sql.

WITH pi_groups(field_name, group_key) AS (
    VALUES
    ('code', 'purchase_invoice_general'),
    ('invoice_source', 'purchase_invoice_general'),
    ('invoice_type', 'purchase_invoice_general'),
    ('is_reversal', 'purchase_invoice_general'),
    ('reversal_of_id', 'purchase_invoice_general'),

    ('company_code_id', 'purchase_invoice_parties'),
    ('supplier_id', 'purchase_invoice_parties'),
    ('commitment_id', 'purchase_invoice_parties'),
    ('supplier_invoice_number', 'purchase_invoice_parties'),
    ('supplier_invoice_date', 'purchase_invoice_parties'),

    -- Header-level legal addresses (bill_to/bill_from/remit_to). Snapshot-frozen
    -- at submit. Line-level ship_to/ship_from + jurisdictions belong on the line.
    ('billto_address_id', 'purchase_invoice_billing'),
    ('billfrom_address_id', 'purchase_invoice_billing'),
    ('remitto_address_id', 'purchase_invoice_billing'),

    ('posting_date', 'dates'),
    ('received_date', 'dates'),
    ('baseline_date', 'dates'),
    ('due_date', 'dates'),

    ('currency_code', 'currency'),
    ('base_currency_code', 'currency'),
    ('exchange_rate', 'currency'),

    ('total_amount', 'purchase_invoice_amounts'),
    ('payable_amount', 'purchase_invoice_amounts'),
    ('paid_amount', 'purchase_invoice_amounts'),
    ('outstanding_amount', 'purchase_invoice_amounts'),
    ('advance_deduction_amount', 'purchase_invoice_amounts'),
    ('retention_amount', 'purchase_invoice_amounts'),

    ('tax_mode', 'tax'),
    ('tax_mode_source', 'tax'),
    ('tax_amount', 'tax'),
    ('withholding_tax_amount', 'tax'),

    ('match_type', 'matching'),
    ('match_status', 'matching'),

    ('budget_check_result', 'dimensions'),

    ('fiscal_year', 'purchase_invoice_fiscal'),
    ('period_number', 'purchase_invoice_fiscal'),

    ('payment_term_id', 'purchase_invoice_payment'),

    ('credited_invoice_id', 'purchase_invoice_credit_note'),
    ('credit_reason', 'purchase_invoice_credit_note'),
    ('credit_reference', 'purchase_invoice_credit_note'),
    ('credit_note_date', 'purchase_invoice_credit_note'),
    ('credit_note_name', 'purchase_invoice_credit_note'),

    ('debited_invoice_id', 'purchase_invoice_debit_note'),
    ('debit_reason', 'purchase_invoice_debit_note'),
    ('debit_note_number', 'purchase_invoice_debit_note'),
    ('debit_note_date', 'purchase_invoice_debit_note'),
    ('debit_note_name', 'purchase_invoice_debit_note'),

    ('advance_type', 'purchase_invoice_advance'),
    ('recovery_method', 'purchase_invoice_advance'),
    ('advance_request_reference', 'purchase_invoice_advance'),
    ('advance_request_date', 'purchase_invoice_advance'),
    ('advance_name', 'purchase_invoice_advance'),

    ('retention_invoice_id', 'purchase_invoice_retention_release'),
    ('release_type', 'purchase_invoice_retention_release'),
    ('application_strategy', 'purchase_invoice_retention_release'),
    ('release_request_reference', 'purchase_invoice_retention_release'),
    ('release_date', 'purchase_invoice_retention_release'),
    ('release_name', 'purchase_invoice_retention_release')
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Sort-order overrides to drive the "Parties & Commitment" 2-col layout:
--   Row 1: Company Code (35)   | Supplier (40)
--   Row 2: PO / Commitment (43)| Invoice Name (44)
--   Row 3: Supplier Inv No (46)| Supplier Inv Date (47)
-- description was 130 â†’ bumped to 44; supplier_invoice_number was 120 â†’ 46;
-- supplier_invoice_date was 45 â†’ 47 (so it lands after the invoice number).
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
WITH pi_sort(field_name, sort_order) AS (
    VALUES
    ('supplier_invoice_number', 41),
    ('supplier_invoice_date',   42),
    ('commitment_id',           43),
    ('description',             44)
)
UPDATE control.entity_field ef
   SET sort_order = ps.sort_order,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM pi_sort ps
  JOIN control.entity e
    ON e.entity_code = 'purchase_invoice'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = ps.field_name;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Shipping group layout was previously full-width for Ship-To Site, then a
-- 2-col grid for the two address pointers. Both are now owned by the
-- ShippingPanel surface (NOT the generic Details form), so the col_span
-- ui_hint is no longer needed. site_id continues to live in the dimensions
-- group with default col_span behaviour. Intentionally a no-op block kept
-- as a marker for the historical layout.
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Â§3 PI invoice-type logical fields

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
    -- The 3 *_invoice_id aliases previously mapped to column_name='reversal_of_id',
    -- which was dropped from document.purchase_invoice in the Phase 1 reset.
    -- Remapped to column_name='metadata' with a jsonb path so the variant
    -- picker keeps working; runtime persists the ID as metadata.<field>.
    -- Reference-integrity is best-effort (jsonb value, not FK); acceptable
    -- until a dedicated column is reintroduced.
    ('credited_invoice_id','metadata','Original Invoice Being Credited','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"code","picker":{"label_field":"code","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","partially_paid","fully_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,'{"path":"credited_invoice_id"}'::jsonb,'purchase_invoice_credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),300),
    ('debited_invoice_id','metadata','Original Invoice Being Debited','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"code","picker":{"label_field":"code","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","partially_paid","fully_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,'{"path":"debited_invoice_id"}'::jsonb,'purchase_invoice_debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),301),
    ('retention_invoice_id','metadata','Invoice With Retention','reference','reference','zero_or_one',NULL::text,
        '{"target_entity":"purchase_invoice","target_field":"id","display_field":"code","picker":{"label_field":"code","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}'::jsonb,
        '{"filters":{"status":["posted","partially_paid","fully_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"none"}}'::jsonb,
        '{"ref_entity":"purchase_invoice"}'::jsonb,'{"path":"retention_invoice_id"}'::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),302),

    ('credit_reason','metadata','Reason for Credit','enum','select','zero_or_one','document.purchase_invoice_credit_reason',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"credit_reason"}'::jsonb,'purchase_invoice_credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),310),
    ('debit_reason','metadata','Reason for Debit','enum','select','zero_or_one','document.purchase_invoice_debit_reason',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"debit_reason"}'::jsonb,'purchase_invoice_debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),311),
    ('advance_type','metadata','Advance Type','enum','select','zero_or_one','document.purchase_invoice_advance_type',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"advance_type"}'::jsonb,'purchase_invoice_advance',jsonb_build_object('field','invoice_type','eq','advance'),312),
    ('recovery_method','metadata','Recovery Method','enum','select','zero_or_one','document.purchase_invoice_recovery_method',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"recovery_method"}'::jsonb,'purchase_invoice_advance',jsonb_build_object('field','invoice_type','eq','advance'),313),
    ('release_type','metadata','Release Type','enum','select','zero_or_one','document.purchase_invoice_release_type',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"release_type"}'::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),314),
    ('application_strategy','metadata','Application Strategy','enum','select','zero_or_one','document.purchase_invoice_application_strategy',NULL::jsonb,NULL::jsonb,NULL::jsonb,'{"path":"application_strategy"}'::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),315),

    ('credit_reference','supplier_invoice_number','Credit Reference','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'purchase_invoice_credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),320),
    ('credit_note_date','supplier_invoice_date','Credit Note Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'purchase_invoice_credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),321),
    ('credit_note_name','metadata','Credit Note Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,'{"path":"credit_note_name"}'::jsonb,'purchase_invoice_credit_note',jsonb_build_object('field','invoice_type','eq','credit_note'),322),

    ('debit_note_number','supplier_invoice_number','Debit Note No.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'purchase_invoice_debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),330),
    ('debit_note_date','supplier_invoice_date','Debit Note Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'purchase_invoice_debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),331),
    ('debit_note_name','metadata','Debit Note Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,'{"path":"debit_note_name"}'::jsonb,'purchase_invoice_debit_note',jsonb_build_object('field','invoice_type','eq','debit_note'),332),

    ('advance_request_reference','supplier_invoice_number','Supplier Request Ref.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'purchase_invoice_advance',jsonb_build_object('field','invoice_type','eq','advance'),340),
    ('advance_request_date','supplier_invoice_date','Request Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'purchase_invoice_advance',jsonb_build_object('field','invoice_type','eq','advance'),341),
    ('advance_name','metadata','Advance Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,'{"path":"advance_name"}'::jsonb,'purchase_invoice_advance',jsonb_build_object('field','invoice_type','eq','advance'),342),

    ('release_request_reference','supplier_invoice_number','Release Request Ref.','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":100}'::jsonb,NULL::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),350),
    ('release_date','supplier_invoice_date','Release Date','date','date','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,NULL::jsonb,NULL::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),351),
    ('release_name','metadata','Release Name','text','text','zero_or_one',NULL::text,NULL::jsonb,NULL::jsonb,'{"max_length":200}'::jsonb,'{"path":"release_name"}'::jsonb,'purchase_invoice_retention_release',jsonb_build_object('field','invoice_type','eq','retention_release'),352)
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

-- Â§4 PC + new PIL asset + new AD asset frozen fields

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
    ('pricing_component','source_doc_type','source_doc_type','Source Type','text','enum','one','system',true,false,false,true,NULL,NULL,NULL::jsonb,'{"allowed_values":["purchase_requisition_line","commitment_line","purchase_invoice_line","receipt_line","service_sheet_line"]}'::jsonb,'source',40),
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

    -- PIL asset field (single source of truth: class only)
    ('purchase_invoice_line','asset_class_id','asset_class_id','Asset Class','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"asset_class","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,NULL::jsonb,'asset',145),

    -- PIL source binding (Batch 6A.4) â€” jsonb blob written by the source-line
    -- cascade trigger to record the chain (PO line / receipt line / SES line)
    -- the invoice line was derived from. Read-only inspection surface only.
    ('purchase_invoice_line','source_binding','source_binding','Source Binding','json','textarea','zero_or_one','system',false,true,true,false,'service',NULL,NULL::jsonb,NULL::jsonb,'matching',148),

    -- AD asset field (specific master.asset this split capitalises against)
    ('accounting_distribution','asset_id','asset_id','Asset','uuid','reference','zero_or_one','standard',false,false,false,false,NULL,NULL,'{"target_entity":"asset","target_field":"id","display_field":"name","picker":{"code_field":"asset_number","show_code":true}}'::jsonb,NULL::jsonb,'asset',90)

    -- AD allocation rows stay in document currency. Base amounts and FX rates
    -- are owned by lifecycle/posting snapshots and journal/posting artifacts.
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

-- Retired PC fields: physical columns are dropped in 01u_tables_pricing_component.sql.
DELETE FROM control.entity_field ef
USING control.entity_version ev,
      control.entity e
 WHERE ef.entity_version_id = ev.id
   AND ev.entity_id = e.id
   AND e.entity_code = 'pricing_component'
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
   AND ef.name IN ('business_intent_id','gl_account_id','posting_role_code','account_source');

-- Â§5 Computed field flags

WITH computed_fields(entity_code, field_name, compute_mode) AS (
    VALUES
    -- PI header
    ('purchase_invoice','total_amount','trigger'),
    -- tax_amount + withholding_tax_amount are PC-derived roll-ups (WS-A).
    -- The header-level cache is refreshed by document.refresh_invoice_amounts_from_pc
    -- after every PC mutation; UI gates on is_computed=true to render them as
    -- locked summary values rather than editable inputs.
    ('purchase_invoice','tax_amount','pricing_components'),
    ('purchase_invoice','withholding_tax_amount','pricing_components'),
    ('purchase_invoice','line_count','trigger'),
    ('purchase_invoice','payable_amount','generated'),
    ('purchase_invoice','outstanding_amount','generated'),
    ('purchase_invoice','paid_amount','service'),
    ('purchase_invoice','match_status','service'),

    -- PIL
    ('purchase_invoice_line','net_amount','generated'),
    -- Line-level tax + WHT same story as the header â€” PC-derived (WS-A).
    ('purchase_invoice_line','tax_amount','pricing_components'),
    ('purchase_invoice_line','withholding_tax_amount','pricing_components'),
    ('purchase_invoice_line','gross_amount','generated'),
    ('purchase_invoice_line','match_status','service'),
    ('purchase_invoice_line','matched_quantity','service'),

    -- AD
    ('accounting_distribution','distributed_amount','service'),
    ('accounting_distribution','budget_check_result','service'),

    -- PC
    ('pricing_component','computed_amount','service'),
    ('pricing_component','computed_base_amount','service'),
    ('pricing_component','is_apportioned','service'),
    ('pricing_component','is_apportioned_from_id','service'),
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

-- Â§6 Field editability gates

WITH field_rules(entity_code, field_name, allowed_statuses, reason) AS (
    VALUES
    -- PI header
    ('purchase_invoice','supplier_id',ARRAY['draft'],'Supplier locks at submit; display resolves through live master joins.'),
    ('purchase_invoice','supplier_invoice_number',ARRAY['draft','rejected'],'Vendor invoice number locks from submit onward to prevent duplicate-evasion.'),
    ('purchase_invoice','supplier_invoice_date',ARRAY['draft','rejected'],'Vendor invoice date locks from submit onward.'),
    ('purchase_invoice','invoice_source',ARRAY['draft'],'Invoice source drives matching and commitment requirements.'),
    ('purchase_invoice','invoice_type',ARRAY['draft'],'Invoice type drives JE template and credit/debit handling.'),
    ('purchase_invoice','company_code_id',ARRAY['draft'],'Company code drives chart of accounts and tax setup.'),
    ('purchase_invoice','commitment_id',ARRAY['draft','rejected'],'Commitment link drives PO matching.'),
    ('purchase_invoice','currency_code',ARRAY['draft'],'Currency drives FX snapshot and tax engine.'),
    ('purchase_invoice','exchange_rate',ARRAY['draft','rejected'],'FX rate captured at posting; pre-post correction allowed.'),
    ('purchase_invoice','posting_date',ARRAY['draft','rejected'],'Posting date determines period and FX; locks after approval.'),
    ('purchase_invoice','withholding_tax_amount',ARRAY['draft','rejected'],'WHT is computed pre-submit and locks.'),
    ('purchase_invoice','payment_term_id',ARRAY['draft','rejected'],'Payment terms drive due_date and clauses; locked at submit.'),
    ('purchase_invoice','base_currency_code',ARRAY['draft'],'Base currency comes from the company code; only draft edits via re-scope.'),
    ('purchase_invoice','received_date',ARRAY['draft','rejected'],'Received date is part of the operational audit trail.'),
    ('purchase_invoice','baseline_date',ARRAY['draft','rejected'],'Baseline date drives payment-term scheduling.'),
    ('purchase_invoice','due_date',ARRAY['draft','rejected','pending_approval'],'Due date can be deferred during approval; locked after approval.'),
    ('purchase_invoice','tax_mode',ARRAY['draft','rejected'],'Tax mode drives tax engine behavior; locked at submit.'),
    ('purchase_invoice','tax_mode_source',ARRAY['draft','rejected'],'Tax mode source explains derivation; locked at submit.'),
    ('purchase_invoice','advance_deduction_amount',ARRAY['draft','rejected'],'Advance deduction changes payable; locked at submit.'),
    ('purchase_invoice','retention_amount',ARRAY['draft','rejected'],'Retention amount creates AP Retention Payable; locked at submit.'),
    ('purchase_invoice','match_type',ARRAY['draft','rejected'],'Match type controls 2-way/3-way matching; locked at submit.'),
    ('purchase_invoice','fiscal_year',ARRAY['draft','rejected'],'Fiscal year is derived from posting_date; corrections via re-date.'),
    ('purchase_invoice','period_number',ARRAY['draft','rejected'],'Period is derived from posting_date; corrections via re-date.'),
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
    ('purchase_invoice_line','tax_amount',ARRAY['draft','rejected'],'Tax amount changes header tax total.'),
    ('purchase_invoice_line','withholding_tax_amount',ARRAY['draft','rejected'],'WHT amount changes header WHT total.'),
    -- Accounting dimensions (cost_center, profit_center, project, budget_allocation,
    -- dimension_set) live on document.accounting_distribution. PIL editability rules
    -- removed accordingly. Site + ship-address fields stay on the line for logistics.
    -- Site + ship-address fields editable across the entire initial phase
    -- (draft / rejected / proforma) so the user can adjust origin & destination
    -- on PO-derived invoices before promote_proforma + submit. Trigger
    -- document.resolve_pil_defaults pre-fills these from source-line cascade;
    -- this rule governs subsequent manual overrides.
    ('purchase_invoice_line','site_id',ARRAY['draft','rejected','proforma'],'Site drives GL posting; editable across initial phase, locked after submit.'),
    ('purchase_invoice_line','shipto_address_id',ARRAY['draft','rejected','proforma'],'Ship-to address drives tax jurisdiction; editable across initial phase, locked after submit.'),
    ('purchase_invoice_line','shipfrom_address_id',ARRAY['draft','rejected','proforma'],'Ship-from address drives tax jurisdiction; editable across initial phase, locked after submit.'),
    ('purchase_invoice_line','asset_class_id',ARRAY['draft','rejected'],'Asset class declares the line is an asset acquisition; drives capex routing. Locks at submit.'),

    -- AD
    ('accounting_distribution','distribution_basis',ARRAY['draft','rejected'],'Split basis changes the AD amount/qty allocation contract.'),
    ('accounting_distribution','split_pct',ARRAY['draft','rejected'],'Percent splits must sum to 100 across the source line; locks at submit.'),
    ('accounting_distribution','split_amount',ARRAY['draft','rejected'],'Amount splits change posting allocations; locks at submit.'),
    -- account_source and gl_account_id are system-stamped by the posting service; never user-editable.
    -- Resolution strategy lives in control.acct_profile_entry_template + document.pricing_component, not AD.
    -- business_intent_id / commodity_category_id / site_id removed from AD; sourced from the P2P line.
    ('accounting_distribution','cost_center_id',ARRAY['draft','rejected'],'Cost centre drives GL posting; locks at submit.'),
    ('accounting_distribution','profit_center_id',ARRAY['draft','rejected'],'Profit centre drives GL posting; locks at submit.'),
    ('accounting_distribution','project_id',ARRAY['draft','rejected'],'Project drives GL posting; locks at submit.'),
    ('accounting_distribution','budget_allocation_id',ARRAY['draft','rejected'],'Budget allocation drives budget consumption; locks at submit.'),
    ('accounting_distribution','asset_id',ARRAY['draft','rejected'],'Specific master.asset this split capitalises against; locks at submit.'),
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

-- Â§7 Visibility rules

WITH visibility_rules(entity_code, field_name, predicate) AS (
    VALUES
    -- PI header
    ('purchase_invoice','tax_mode_source',jsonb_build_object('field','tax_mode','notNull',true)),
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

    -- AD: account_source and gl_account_id are system-stamped by the posting
    -- service; no visibility predicates needed. Account-resolution strategy
    -- lives in control.acct_profile_entry_template + document.pricing_component.
    ('accounting_distribution','budget_check_result',jsonb_build_object('field','budget_allocation_id','notNull',true))
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
    ('purchase_invoice','status_changed_at'),
    ('purchase_invoice','status_changed_by'),
    ('purchase_invoice','ap_je_id'),
    ('purchase_invoice','row_version'),
    ('purchase_invoice','metadata'),
    ('purchase_invoice','status'),
    -- AD dimension_set_id is derived from scalar dimensions by trigger.
    ('accounting_distribution','dimension_set_id')
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

-- Â§8 Cascade / default rules
-- Site is the only PILâ†’PI inheritance left after accounting dims moved to AD.
WITH pil_cascades(pil_field, parent_field) AS (
    VALUES
    ('site_id','site_id')
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

-- AD cascade defaults: pull accounting dimensions from the parent PI header on
-- create. PI header acts as the defaulting source; AD is the authoritative
-- store for posting capture (line tables no longer carry these columns).
WITH ad_cascades(ad_field, parent_field) AS (
    VALUES
    ('cost_center_id',      'cost_center_id'),
    ('profit_center_id',    'profit_center_id'),
    ('project_id',          'project_id'),
    ('budget_allocation_id','budget_allocation_id')
)
UPDATE control.entity_field ef
   SET defaults = jsonb_build_object(
         'default_value_source', jsonb_build_object(
             'kind', 'parent_field',
             'parent_entity', 'purchase_invoice',
             'parent_field', ac.parent_field,
             'apply_on', jsonb_build_array('create')
         ),
         'override_detection', jsonb_build_object(
             'compare_to', 'parent.' || ac.parent_field,
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
  FROM ad_cascades ac
  JOIN control.entity e
    ON e.entity_code = 'accounting_distribution'
   AND e.tenant_id IS NULL
  JOIN control.entity_version ev
    ON ev.entity_id = e.id
   AND ev.version_no = 1
   AND ev.tenant_id IS NULL
 WHERE ef.entity_version_id = ev.id
   AND ef.name = ac.ad_field;

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

-- Â§9 Legacy field deactivation

WITH inactive_fields(entity_code, field_name) AS (
    VALUES
    ('purchase_invoice','is_credit_note'),
    ('purchase_invoice','code'),
    ('purchase_invoice','code')
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

-- Â§9b P5 primary-field markers â€” PI + PIL
-- Drives detectAmountField / detectCurrencyField in the shared line-item
-- runtime (procure variant). One per entity_version enforced by partial
-- UNIQUE index ef_primary_amount_uq / ef_primary_currency_uq.

UPDATE control.entity_field ef
   SET is_primary_amount = true,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND (
     (e.entity_code = 'purchase_invoice'      AND ef.name = 'total_amount') OR
     (e.entity_code = 'purchase_invoice_line' AND ef.name = 'net_amount')
   );

UPDATE control.entity_field ef
   SET is_primary_currency = true,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.tenant_id IS NULL
   AND ev.version_no = 1
   AND ef.name = 'currency_code'
   AND e.entity_code IN ('purchase_invoice','purchase_invoice_line');


-- Â§10 Development assertions

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
    IF v_count < 41 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected at least 41 active PC fields, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'asset_class_id'
       AND ef.is_active = true;
    IF v_count <> 1 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected 1 active PIL asset_class_id field, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'asset_id'
       AND ef.is_active = true;
    IF v_count <> 1 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected 1 active AD asset_id field, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.entity_code = 'purchase_invoice_line'
       AND e.tenant_id IS NULL
       AND ev.version_no = 1
       AND ef.name = 'business_intent_id'
       AND ef.defaults IS NOT NULL;
    IF v_count <> 1 THEN
        RAISE EXCEPTION '[ap_purchase_invoice_contract] expected business_intent default row for PIL, got %', v_count;
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


-- Â§11 is_reversal INSERT removed â€” column dropped from
-- document.purchase_invoice per Phase 1 reset (01e_tables_invoice.sql:148-149).
-- Reversal state is now derived from lifecycle transitions, not a header flag.


-- â”€â”€ Hide line-level resolver outputs from Details form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.entity_field (
    entity_version_id,
    name, column_name, label, data_type,
    cardinality, origin,
    is_required, is_filterable,
    visibility,
    sort_order, created_by
)
SELECT ev.id,
       f.name, f.column_name, f.label, f.data_type,
       f.cardinality, 'standard',
       false, false,
       '{"hidden": true}'::jsonb,
       900::smallint,
       '00000000-0000-0000-0000-000000000000'
FROM control.entity_version ev
JOIN control.entity e ON e.id = ev.entity_id
CROSS JOIN (VALUES
    ('to_tax_jurisdiction_id',    'to_tax_jurisdiction_id',    'Ship-To Jurisdiction',    'reference', 'zero_or_one'),
    ('from_tax_jurisdiction_id',  'from_tax_jurisdiction_id',  'Ship-From Jurisdiction',  'reference', 'zero_or_one')
    -- tax_resolution_rule_id removed â€” column dropped from PIL
) AS f(name, column_name, label, data_type, cardinality)
WHERE e.table_schema = 'document'
  AND e.table_name   = 'purchase_invoice_line'
  AND e.tenant_id IS NULL
  AND ev.version_no  = 1
ON CONFLICT (entity_version_id, name) WHERE entity_version_id IS NOT NULL DO UPDATE
SET visibility    = '{"hidden": true}'::jsonb,
    is_filterable = false,
    sort_order    = 900,
    is_active     = true,
    updated_at    = now(),
    updated_by    = '00000000-0000-0000-0000-000000000000';

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document'
       AND e.table_name IN ('purchase_invoice','purchase_invoice_line')
       AND e.tenant_id IS NULL AND ev.version_no = 1
       AND ef.visibility->>'hidden' = 'true';
    RAISE NOTICE '042d Â§11: hidden % PI/PIL system-resolved fields from Details form', v_count;
END $$;


-- Â§12 Hide PI system/audit/derived fields from forms.
-- 042_control_entity_field_contract.sql flipped origin='system'â†’'standard' on all PI fields, which
-- accidentally exposed id/tenant_id/created_*/updated_* in Details Edit mode.
-- visibility.hideIn is read by visibilityHidesSurface in runtime-canvas.
-- group_key='audit' keeps them grouped if a Show-system-fields toggle ever surfaces them.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit", "detail"]}'::jsonb,
       group_key  = 'audit',
       ui_hint    = COALESCE(ef.ui_hint, '{}'::jsonb)
                    || jsonb_build_object('group_key', 'audit'),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name IN (
        -- Identity (system-managed)
        'id',
        'tenant_id',
        -- Lifecycle metadata
        'is_active',
        'status_changed_at',
        'status_changed_by',
        -- Row-level audit
        'created_at',
        'created_by',
        'updated_at',
        'updated_by',
        -- Row versioning / concurrency
        'row_version',
        -- Posting metadata (auto-populated at posting time)
        'is_posted',
        'posted_at',
        'posted_by',
        -- Approval metadata (auto-populated at workflow gate)
        'approved_at',
        'approved_by',
        -- Workflow link
        'workflow_request_id',
        -- AP-JE link (auto-populated at posting)
        'ap_je_id',
        -- Reversal pointer (auto-populated when reversing)
        'reversal_of_id'
   );

-- â”€â”€ 12.2 "name" leftover schema artefact â€” hide globally â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
UPDATE control.entity_field ef
   SET visibility = '{"hidden": true}'::jsonb,
       updated_at = now()
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name = 'name';

-- â”€â”€ 12.3 "subtotal_amount" duplicative with net_amount â€” hide from forms â”€â”€â”€â”€
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit"]}'::jsonb,
       updated_at = now()
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name = 'subtotal_amount';

-- â”€â”€ 12.4 tax_mode / tax_mode_source â€” DB defaults; hide from forms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Phase 4 UI cleanup: these now default at the DB level
-- (DEFAULT 'exclusive' and DEFAULT 'tax_group' in 01f_tables_invoice_streamlining).
-- The user never picks them; the resolver (tax_group_id) drives tax math.
-- Still visible in detail/view so audit reviewers can confirm provenance.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit"]}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name IN ('tax_mode', 'tax_mode_source');

-- â”€â”€ 12.5 Auto-derived identifier + date fields â€” hide from forms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Phase 4 UI cleanup (Dates / Fiscal Scope streamlining). Hide auto-derived /
-- default-laden fields from create/edit forms while keeping them visible in
-- detail/view for audit and override.
--
-- Field-by-field rationale:
--   - baseline_date:          mirrors supplier_invoice_date (trigger derives)
--   - posting_date:           mirrors baseline_date (trigger derives + period-gate)
--   - due_date:               baseline_date + payment_term.due_days (trigger)
--   - received_date:          defaults to CURRENT_DATE (trigger)
--   - fiscal_year:            derived from posting_date + company FY-start (trigger)
--   - period_number:          derived from posting_date + company FY-start (trigger)
--
-- Batch 6D cleanup: removed empty-string entry and dropped-column ghosts
-- (document_date, invoice_date) â€” see 01e_tables_invoice.sql:148-149 for the
-- reset that eliminated them.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit"]}'::jsonb,
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name IN (
        'baseline_date',
        'posting_date',
        'due_date',
        'received_date',
        'fiscal_year',
        'period_number'
   );

-- â”€â”€ 12.6 "description" â€” single-line input, not textarea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Bootstrap seed (042 Â§1) auto-sets ui_type='textarea' for columns named
-- 'description'. PI uses it as a short headline ("Invoice Name", max_length
-- 200), not free-form notes, so we override to 'text' to drop the multi-line
-- affordance. The descriptor compiler reads ui_type to pick editor.control:
-- only 'TEXTAREA' / 'LONG_TEXT' maps to <textarea>; everything else defaults
-- to a single-line <input>.
UPDATE control.entity_field ef
   SET ui_type    = 'text',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name        = 'description';

-- â”€â”€ 12.7 notes/tags â€” moved out of the Details field groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Activity is the preferred place for operational commentary and tagging.
-- Hide these fields from create/edit/detail so the old Notes & Tags group
-- does not render as a standalone panel on the document object page.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit", "detail"]}'::jsonb,
       ui_hint    = jsonb_set(
                      COALESCE(ef.ui_hint, '{}'::jsonb),
                      '{display}',
                      COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                        || jsonb_build_object('hide_in', to_jsonb(ARRAY['create','edit','detail'])),
                      true
                    ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name IN ('notes', 'tags');

-- â”€â”€ 12.8 duplicated summary groups â€” hide from Details/Edit field grids â”€â”€â”€â”€â”€
-- Amounts, Tax, Matching, and Fiscal Scope are represented by composed header
-- summaries / dedicated process surfaces. Keep the columns and runtime data,
-- but remove these duplicated field groups from the object-page field grid.
UPDATE control.entity_field ef
   SET visibility = COALESCE(ef.visibility, '{}'::jsonb)
                    || '{"hideIn": ["create", "edit", "detail"]}'::jsonb,
       ui_hint    = jsonb_set(
                      COALESCE(ef.ui_hint, '{}'::jsonb),
                      '{display}',
                      COALESCE(ef.ui_hint->'display', '{}'::jsonb)
                        || jsonb_build_object('hide_in', to_jsonb(ARRAY['create','edit','detail'])),
                      true
                    ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document'
   AND e.table_name   = 'purchase_invoice'
   AND e.tenant_id IS NULL
   AND ev.version_no  = 1
   AND ef.name IN (
        -- Dates (Batch 6D: stripped ghost 'invoice_date')
        'posting_date',
        'received_date',
        'baseline_date',
        'due_date',
        -- Versioning / close metadata (Batch 6D: stripped ghosts
        -- 'operational_closed_at', 'financial_closed_at' â€” columns removed
        -- from document.purchase_invoice)
        'version_number',
        'previous_version_id',
        'is_current_version',
        'supersedes_at',
        'terminal_status',
        'status_source',
        -- Amounts (Batch 6D: stripped ghosts 'subtotal_amount',
        -- 'discount_amount', 'freight_amount', 'misc_charges_amount',
        -- 'retention_pct' â€” columns removed from document.purchase_invoice)
        'total_amount',
        'payable_amount',
        'paid_amount',
        'outstanding_amount',
        'advance_deduction_amount',
        'retention_amount',
        -- Tax
        'tax_mode',
        'tax_mode_source',
        'tax_amount',
        'withholding_tax_amount',
        -- Matching
        'match_type',
        'match_status',
        -- Fiscal Scope
        'fiscal_year',
        'period_number',
        -- Dimensions (Batch 6D: stripped ghosts 'cost_center_id',
        -- 'profit_center_id', 'project_id', 'site_id',
        -- 'budget_allocation_id' â€” moved to accounting_distribution)
        'budget_check_result',
        -- Type-specific sections stay out of the standard header Details grid.
        'credited_invoice_id',
        'credit_reason',
        'credit_reference',
        'credit_note_date',
        'credit_note_name',
        'debited_invoice_id',
        'debit_reason',
        'debit_note_number',
        'debit_note_date',
        'debit_note_name',
        'advance_type',
        'recovery_method',
        'advance_request_reference',
        'advance_request_date',
        'advance_name',
        'retention_invoice_id',
        'release_type',
        'application_strategy',
        'release_request_reference',
        'release_date',
        'release_name'
   );

DO $$
DECLARE
    v_hidden_count integer;
    v_form_hidden_count integer;
BEGIN
    SELECT count(*) INTO v_hidden_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
       AND e.tenant_id IS NULL AND ev.version_no = 1
       AND ef.visibility->>'hidden' = 'true';

    SELECT count(*) INTO v_form_hidden_count
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
       AND e.tenant_id IS NULL AND ev.version_no = 1
       AND (ef.visibility->>'hidden' = 'true'
            OR ef.visibility ? 'hideIn');

    RAISE NOTICE '042d Â§12: % PI fields fully hidden, % fields hidden from create/edit forms',
        v_hidden_count, v_form_hidden_count;
END $$;


-- Â§13 PI action rules â€” control.entity_action_rule (deny-by-default; explicit 'denied'
-- rows exist only when the UI needs a tooltip reason). Matrix:
--
--   Status              PC.ADD  PC.REPL  PC.DEL  AD.ADD  AD.EDIT  AD.DEL  HEADER.SUBMIT  HEADER.APPROVE
--   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
--   draft               allow   allow    allow   allow   allow    allow   allow          denied
--   rejected            allow   allow    allow   allow   allow    allow   allow          denied
--   pending_approval    denied  allow    denied  allow   allow    denied  denied         allow
--   approved            denied  allow    denied  allow   allow    denied  denied         denied
--   posted              denied  denied   denied  denied  denied   denied  denied         denied
--   partially_paid      denied  denied   denied  denied  denied   denied  denied         denied
--   fully_paid          denied  denied   denied  denied  denied   denied  denied         denied
--   on_hold             denied  denied   denied  denied  denied   denied  denied         denied
--   reversed            denied  denied   denied  denied  denied   denied  denied         denied
--   cancelled           denied  denied   denied  denied  denied   denied  denied         denied
--
-- Allowed rows are seeded explicitly. Denied rows are seeded only when
-- a clear UI tooltip reason exists; otherwise the client falls back to
-- deny-by-default with a generic "denied in <status>" message.
--
-- Universal HEADER.POSTINGS_PREVIEW.OPEN = allowed in EVERY status â€” the
-- preview is read-only and always visible per design plan Â§A5.

INSERT INTO control.entity_action_rule (
    entity_code,
    status,
    action_code,
    capability,
    required_permission,
    reason,
    description,
    metadata,
    created_by
)
VALUES
    -- â”€â”€ draft / rejected: full edit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ('purchase_invoice', 'draft', 'PC.ADD',       'allowed', NULL, NULL, 'Add component in draft.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.REPLACE',   'allowed', NULL, NULL, 'Edit/replace existing component.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.OVERRIDE',  'allowed', NULL, NULL, 'Override inherited component.',    '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'PC.DELETE',    'allowed', NULL, NULL, 'Delete component in draft.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.ADD',       'allowed', NULL, NULL, 'Add distribution split.',          '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.EDIT',      'allowed', NULL, NULL, 'Edit distribution split.',         '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'AD.DELETE',    'allowed', NULL, NULL, 'Delete distribution split.',       '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'draft', 'HEADER.SUBMIT','allowed', NULL, NULL, 'Submit invoice for approval.',     '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    ('purchase_invoice', 'rejected', 'PC.ADD',       'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.REPLACE',   'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.OVERRIDE',  'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'PC.DELETE',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.ADD',       'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.EDIT',      'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'AD.DELETE',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected', 'HEADER.SUBMIT','allowed', NULL, NULL, 'Resubmit after rejection.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ pending_approval: supersede only on PC; AD remains editable pre-post â”€
    ('purchase_invoice', 'pending_approval', 'PC.REPLACE',     'allowed', NULL, NULL, 'Supersede via fn_pc_supersede_only_update.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.OVERRIDE',    'allowed', NULL, NULL, 'Override an inherited row (writes a new manual PC).', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.ADD',         'allowed', NULL, NULL, 'AD remains editable pre-post.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.EDIT',        'allowed', NULL, NULL, 'AD remains editable pre-post.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'HEADER.APPROVE', 'requires_permission', 'PI.APPROVE', NULL, 'Approve the invoice.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'HEADER.REJECT',  'requires_permission', 'PI.APPROVE', NULL, 'Reject + return to draft.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.ADD',         'denied',  NULL, 'Adds frozen in approval; use Replace.',  NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'PC.DELETE',      'denied',  NULL, 'Hard delete forbidden in approval; use Replace with amount_value=0.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'AD.DELETE',      'denied',  NULL, 'Distribution deletion frozen in approval.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ approved: same as pending_approval but cannot re-approve â”€â”€â”€â”€
    ('purchase_invoice', 'approved', 'PC.REPLACE', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'PC.OVERRIDE','allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'AD.ADD',     'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'AD.EDIT',    'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved', 'HEADER.POST','requires_permission', 'PI.POST', NULL, 'Post invoice and create accounting entries.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ posted / paid / reversed / cancelled / on_hold: explicit denied
    --     rows with reason text drive the affordance tooltips so users
    --     don't see "denied in posted" with no context.
    ('purchase_invoice', 'posted',           'PC.REPLACE',    'denied', NULL, 'Posted invoices are read-only. Use a credit note to adjust.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'posted',           'AD.EDIT',       'denied', NULL, 'Posted invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'posted',           'HEADER.REVERSE','requires_permission', 'PI.REVERSE', NULL, 'Reverse with a compensating journal entry.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'partially_paid',   'PC.REPLACE',    'denied', NULL, 'Paid invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'fully_paid',       'PC.REPLACE',    'denied', NULL, 'Paid invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'reversed',         'PC.REPLACE',    'denied', NULL, 'Reversed invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'cancelled',        'PC.REPLACE',    'denied', NULL, 'Cancelled invoices are read-only.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'on_hold',          'PC.REPLACE',    'denied', NULL, 'Invoice is on hold; release before editing.', NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    -- â”€â”€ Postings Preview: always read-only, always allowed (Â§A5) â”€â”€â”€â”€â”€
    ('purchase_invoice', 'draft',            'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Postings preview is read-only and always available.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'pending_approval', 'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'approved',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'rejected',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'posted',           'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, 'Frozen with JE link post-posting.', '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'partially_paid',   'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'fully_paid',       'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'on_hold',          'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'reversed',         'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('purchase_invoice', 'cancelled',        'POSTINGS_PREVIEW.OPEN', 'allowed', NULL, NULL, NULL, '{}'::jsonb, '00000000-0000-0000-0000-000000000000')

ON CONFLICT (entity_code, status, action_code) DO UPDATE
SET capability          = EXCLUDED.capability,
    required_permission = EXCLUDED.required_permission,
    reason              = EXCLUDED.reason,
    description         = EXCLUDED.description,
    metadata            = EXCLUDED.metadata,
    updated_at          = now();


-- ============================================================================
-- on_source_change rules (Phase 6 pilot)
-- Spec: docs/specs/entity_field_defaults.md Â§6  +  purchase_invoice_field_design.md Â§4.x
--
-- Every field with a `lookup_config.dependent_filter` MUST declare an
-- `on_source_change` rule so the form/server/BFF know how to handle the
-- stale value when the parent source changes. Pairing is CI-enforced.
-- ============================================================================

-- credited_invoice_id / debited_invoice_id / retention_invoice_id â€” clear on supplier change
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id'),
            'action',  'clear',
            'layers',  jsonb_build_array('client_on_change', 'server_on_save'),
            'message', 'Cleared because supplier changed'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name IN ('credited_invoice_id', 'debited_invoice_id', 'retention_invoice_id');

-- commitment_id â€” clear on supplier change
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id'),
            'action',  'clear',
            'layers',  jsonb_build_array('client_on_change', 'server_on_save'),
            'message', 'Cleared because supplier changed'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'commitment_id';

-- payment_term_id â€” rederive (if_empty_or_derived) + warn-if-overridden
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources',  jsonb_build_array('supplier_id'),
            'action',   'rederive',
            'mode',     'if_empty_or_derived',
            'resolver', 'supplier.default_payment_term',
            'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
            'message',  'Filled from supplier default'
          ),
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id'),
            'action',  'warn',
            'layers',  jsonb_build_array('client_on_change'),
            'when',    jsonb_build_object('target_was_user_overridden', true),
            'message', 'Supplier changed â€” verify payment term'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'payment_term_id';

-- currency_code â€” rederive (if_empty_or_derived) from (supplier, company_code) + warn
UPDATE control.entity_field ef
   SET defaults  = jsonb_build_object(
        'on_source_change', jsonb_build_array(
          jsonb_build_object(
            'sources',  jsonb_build_array('supplier_id', 'company_code_id'),
            'action',   'rederive',
            'mode',     'if_empty_or_derived',
            'resolver', 'supplier.default_currency',
            'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
            'message',  'Filled from supplier company-code profile'
          ),
          jsonb_build_object(
            'sources', jsonb_build_array('supplier_id', 'company_code_id'),
            'action',  'warn',
            'layers',  jsonb_build_array('client_on_change'),
            'when',    jsonb_build_object('target_was_user_overridden', true),
            'message', 'Supplier or company code changed â€” verify currency'
          )
        )
      ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1
   AND ef.name = 'currency_code';

-- commitment_id â€” derive header fields from the selected PO/commitment.
WITH commitment_targets(field_name) AS (
  VALUES
    ('supplier_id'),
    ('currency_code'),
    ('payment_term_id'),
    ('payment_method_id'),
    ('billto_address_id'),
    ('billfrom_address_id'),
    ('remitto_address_id'),
    ('match_type')
)
UPDATE control.entity_field ef
   SET defaults = jsonb_set(
          COALESCE(ef.defaults, '{}'::jsonb),
          '{on_source_change}',
          COALESCE((
            SELECT jsonb_agg(rule)
              FROM jsonb_array_elements(COALESCE(ef.defaults->'on_source_change', '[]'::jsonb)) AS rule
             WHERE COALESCE(rule->>'resolver', '') <> 'purchase_invoice.commitment_default'
          ), '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'sources',  jsonb_build_array('commitment_id'),
              'action',   'rederive',
              'mode',     'if_empty_or_derived',
              'resolver', 'purchase_invoice.commitment_default',
              'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
              'message',  'Filled from selected PO / commitment'
            )
          ),
          true
        ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
  CROSS JOIN commitment_targets t
 WHERE ef.entity_version_id = ev.id
   AND t.field_name = ef.name
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1;

-- Original-invoice references â€” derive header fields for credit/debit/retention docs.
WITH reference_targets(field_name) AS (
  VALUES
    ('company_code_id'),
    ('supplier_id'),
    ('commitment_id'),
    ('currency_code'),
    ('payment_term_id'),
    ('payment_method_id'),
    ('billto_address_id'),
    ('billfrom_address_id'),
    ('remitto_address_id'),
    ('tax_mode'),
    ('tax_mode_source'),
    ('match_type')
)
UPDATE control.entity_field ef
   SET defaults = jsonb_set(
          COALESCE(ef.defaults, '{}'::jsonb),
          '{on_source_change}',
          COALESCE((
            SELECT jsonb_agg(rule)
              FROM jsonb_array_elements(COALESCE(ef.defaults->'on_source_change', '[]'::jsonb)) AS rule
             WHERE COALESCE(rule->>'resolver', '') <> 'purchase_invoice.reference_default'
          ), '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'sources',  jsonb_build_array('invoice_type', 'credited_invoice_id', 'debited_invoice_id', 'retention_invoice_id'),
              'action',   'rederive',
              'mode',     'if_empty_or_derived',
              'resolver', 'purchase_invoice.reference_default',
              'layers',   jsonb_build_array('client_on_change', 'server_on_save'),
              'message',  'Filled from referenced original invoice'
            )
          ),
          true
        ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
  CROSS JOIN reference_targets t
 WHERE ef.entity_version_id = ev.id
   AND t.field_name = ef.name
   AND e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
   AND e.tenant_id IS NULL AND ev.version_no = 1;


COMMIT;
