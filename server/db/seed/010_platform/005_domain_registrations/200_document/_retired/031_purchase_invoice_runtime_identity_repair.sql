-- Repairs AP document runtime identities that can be preempted by governed
-- schema coverage when physical tables are registered before curated entities.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_relations int;
BEGIN
    UPDATE control.entity
       SET module_id = COALESCE((SELECT id::text FROM shared.module WHERE code = 'PROC'), module_id),
           name = 'purchase_invoice',
           slug = 'purchase-invoice',
           entity_short = 'INV',
           entity_code = 'purchase_invoice',
           entity_class = 'DOCUMENT',
           ownership_model = 'system',
           kind = 'ent',
           backing_type = 'table',
           governance_level = 'full',
           security_tier = 'tenant_critical',
           mutability = 'controlled',
           label_singular = 'Purchase Invoice',
           label_plural = 'Purchase Invoices',
           icon_key = 'file-text',
           color_token = 'violet',
           numbering_active = true,
           feature_flags = jsonb_build_object(
               'is_approvable', true,
               'document_category', 'payables',
               'allow_on_behalf_of', false,
               'auto_number', true,
               'has_lines', true,
               'catalog_feature_enabled', false,
               'has_ai_classification', true,
               'has_line_composer', true,
               'comments_enabled', true,
               'event_history', true,
               'has_attachments', true,
               'version_control', true,
               'has_accounting_distribution', true,
               'has_payment_schedule', true
           ),
           display_config = jsonb_build_object(
               'detail_renderer', 'document',
               'line_entity_code', 'purchase_invoice_line',
               'title_field', 'document_no',
               'subtitle_field', 'supplier_id',
               'list_columns', '["document_no","status","supplier_id","invoice_date","due_date","total_amount","currency_code"]'::jsonb,
               'default_sort_field', 'invoice_date',
               'default_sort_order', 'desc',
               'action_groups', jsonb_build_object(
                   'draft', jsonb_build_object('primary', '["edit","submit"]'::jsonb, 'working', '["cancel_document"]'::jsonb),
                   'submitted', jsonb_build_object('primary', '["approve","reject"]'::jsonb, 'working', '["cancel_document"]'::jsonb),
                   'pending_approval', jsonb_build_object('primary', '["approve","reject"]'::jsonb, 'working', '["cancel_document"]'::jsonb),
                   'in_review', jsonb_build_object('primary', '["approve","reject"]'::jsonb, 'working', '["cancel_document"]'::jsonb),
                   'on_hold', jsonb_build_object('primary', '["release_hold"]'::jsonb, 'working', '["cancel_document"]'::jsonb),
                   'approved', jsonb_build_object('primary', '["post"]'::jsonb, 'working', '["propose_payment","cancel_document"]'::jsonb, 'output', '["view_je"]'::jsonb),
                   'posted', jsonb_build_object('primary', '["propose_payment"]'::jsonb, 'working', '["allocate_payment"]'::jsonb, 'output', '["view_je"]'::jsonb),
                   'partially_paid', jsonb_build_object('primary', '["propose_payment"]'::jsonb, 'working', '["allocate_payment"]'::jsonb, 'output', '["view_je"]'::jsonb),
                   'paid', jsonb_build_object('output', '["view_je"]'::jsonb),
                   'cancelled', jsonb_build_object(),
                   'rejected', jsonb_build_object('working', '["copy"]'::jsonb)
               ),
               'document_header', jsonb_build_object(
                   'number_field', 'document_no',
                   'status_field', 'status',
                   'type_label', 'PURCHASE INVOICE',
                   'total_label', 'INVOICE TOTAL',
                   'date_label', 'INVOICE DATE',
                   'party_id_field', 'supplier_id',
                   'amount_field', 'total_amount',
                   'subtotal_field', 'net_amount',
                   'tax_field', 'tax_amount',
                   'currency_field', 'currency_code',
                   'date_field', 'invoice_date',
                   'due_date_field', 'due_date',
                   'title_field', 'description'
               )
           ),
           naming_policy = jsonb_build_object(
               'prefix', 'PINV',
               'prefix_configurable', true,
               'separator', '-',
               'segments', jsonb_build_array(
                   jsonb_build_object('type', 'tenant_code'),
                   jsonb_build_object('type', 'year', 'format', 'YYYY'),
                   jsonb_build_object('type', 'sequence', 'padding', 5)
               ),
               'reset_strategy', 'yearly'
           ),
           natural_key_fields = ARRAY['document_no']::text[],
           status = 'ACTIVE',
           updated_at = now(),
           updated_by = v_su
     WHERE table_schema = 'document'
       AND table_name = 'purchase_invoice'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET module_id = COALESCE((SELECT id::text FROM shared.module WHERE code = 'PROC'), module_id),
           name = 'purchase_invoice_line',
           slug = 'purchase-invoice-line',
           entity_short = 'PINV_L',
           entity_code = 'purchase_invoice_line',
           entity_class = 'DOCUMENT_RELATION',
           ownership_model = 'system',
           kind = 'ent',
           backing_type = 'table',
           governance_level = 'full',
           security_tier = 'tenant_critical',
           mutability = 'controlled',
           label_singular = 'Invoice Line',
           label_plural = 'Invoice Lines',
           icon_key = 'list',
           color_token = 'violet',
           numbering_active = false,
           feature_flags = jsonb_build_object(
               'parent_entity', 'purchase_invoice',
               'has_accounting_distribution', true,
               'has_matching', true
           ),
           display_config =
               (COALESCE(display_config, '{}'::jsonb)
                   - 'coverage_mode'
                   - 'list_renderer'
                   - 'detail_renderer'
                   - 'readOnly'
                   - 'hidden')
               || jsonb_build_object(
                   'detail_renderer', 'master',
                   'title_field', 'item_description',
                   'subtitle_field', 'procurement_type',
                   'list_columns', '["line_no","item_description","quantity","unit_price","gross_amount"]'::jsonb,
                   'default_sort_field', 'line_no',
                   'default_sort_order', 'asc'
               ),
           natural_key_fields = ARRAY['line_no']::text[],
           status = 'ACTIVE',
           updated_at = now(),
           updated_by = v_su
     WHERE table_schema = 'document'
       AND table_name = 'purchase_invoice_line'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET module_id = COALESCE((SELECT id::text FROM shared.module WHERE code = 'ACC'), module_id),
           name = 'accounting_distribution',
           slug = 'accounting-distribution',
           entity_short = 'ACCD',
           entity_code = 'accounting_distribution',
           entity_class = 'DOCUMENT_RELATION',
           ownership_model = 'system',
           kind = 'ent',
           backing_type = 'table',
           governance_level = 'full',
           security_tier = 'tenant_critical',
           mutability = 'locked',
           label_singular = 'Account Assignment Split',
           label_plural = 'Account Assignment Splits',
           icon_key = 'split',
           color_token = 'slate',
           numbering_active = false,
           feature_flags = jsonb_build_object(
               'polymorphic_parent', true,
               'parent_source_type_field', 'source_doc_type',
               'parent_source_id_field', 'source_doc_id',
               'parent_source_line_field', 'source_line_id',
               'auto_generated', true
           ),
           display_config = jsonb_build_object(
               'detail_renderer', 'master',
               'title_field', 'distribution_no',
               'subtitle_field', 'account_source',
               'list_columns', '["distribution_no","distribution_basis","distributed_amount","account_source","gl_account_id","cost_center_id","spend_category_id"]'::jsonb,
               'default_sort_field', 'distribution_no',
               'default_sort_order', 'asc'
           ),
           natural_key_fields = ARRAY['distribution_no']::text[],
           status = 'ACTIVE',
           updated_at = now(),
           updated_by = v_su
     WHERE table_schema = 'document'
       AND table_name = 'accounting_distribution'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_version (
        entity_id, tenant_id, version_no, status, effective_from,
        change_type, created_by, updated_by
    )
    SELECT e.id, NULL, 1, 'EFFECTIVE', now(), 'fix', v_su, v_su
      FROM control.entity e
     WHERE e.entity_code IN (
               'purchase_invoice',
               'purchase_invoice_line',
               'accounting_distribution'
           )
       AND e.tenant_id IS NULL
    ON CONFLICT (entity_id, version_no) DO UPDATE
       SET status = 'EFFECTIVE',
           effective_from = COALESCE(control.entity_version.effective_from, EXCLUDED.effective_from),
           updated_at = now(),
           updated_by = v_su;

    WITH invoice_fields(
        name, column_name, label, data_type, cardinality, enum_domain_code,
        reference_config, validation, is_required, is_filterable, is_read_only,
        sort_order, group_key
    ) AS (
        VALUES
        ('document_no', 'invoice_number', 'Invoice No.', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":50}'::jsonb, true, true, true, 10, 'identity'),
        ('invoice_type', 'invoice_type', 'Invoice Type', 'enum', 'one', 'document.purchase_invoice_type', NULL::jsonb, NULL::jsonb, true, true, false, 20, 'identity'),
        ('status', 'status', 'Status', 'lifecycle_state', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, true, 30, 'identity'),
        ('company_code_id', 'company_code_id', 'Company Code', 'reference', 'one', NULL::text, '{"target_entity":"company_code","display_field":"name"}'::jsonb, '{"ref_entity":"company_code","display_field":"name"}'::jsonb, true, true, false, 35, 'identity'),
        ('supplier_id', 'supplier_id', 'Supplier', 'reference', 'one', NULL::text, '{"target_entity":"supplier","display_field":"name"}'::jsonb, '{"ref_entity":"supplier","display_field":"name"}'::jsonb, true, true, false, 40, 'reference'),
        ('commitment_id', 'commitment_id', 'Commitment/PO', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"purchase_order"}'::jsonb, '{"ref_entity":"purchase_order"}'::jsonb, false, true, false, 43, 'reference'),
        ('supplier_invoice_date', 'supplier_invoice_date', 'Supplier Invoice Date', 'date', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, false, 45, 'dates'),
        ('invoice_date', 'document_date', 'Invoice Date', 'date', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, false, 50, 'dates'),
        ('posting_date', 'posting_date', 'Posting Date', 'date', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, false, 55, 'dates'),
        ('received_date', 'received_date', 'Received Date', 'date', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, false, false, 57, 'dates'),
        ('due_date', 'due_date', 'Due Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, false, 60, 'dates'),
        ('baseline_date', 'baseline_date', 'Baseline Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 62, 'dates'),
        ('currency_code', 'currency_code', 'Currency', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":3}'::jsonb, true, true, true, 70, 'financial'),
        ('base_currency_code', 'base_currency_code', 'Base Currency', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":3}'::jsonb, true, true, true, 72, 'financial'),
        ('exchange_rate', 'exchange_rate', 'Exchange Rate', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 74, 'financial'),
        ('total_amount', 'total_amount', 'Gross Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, true, 80, 'financial'),
        ('discount_amount', 'discount_amount', 'Discount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 83, 'discount'),
        ('freight_amount', 'freight_amount', 'Freight', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 85, 'financial'),
        ('misc_charges_amount', 'misc_charges_amount', 'Misc. Charges', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 87, 'financial'),
        ('tax_amount', 'tax_amount', 'Tax Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 90, 'tax'),
        ('withholding_tax_amount', 'withholding_tax_amount', 'WHT Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 95, 'tax'),
        ('net_amount', 'subtotal_amount', 'Net Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, true, 100, 'financial'),
        ('paid_amount', 'paid_amount', 'Paid Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 102, 'financial'),
        ('outstanding_amount', 'outstanding_amount', 'Outstanding', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, true, true, 104, 'financial'),
        ('payable_amount', 'payable_amount', 'Payable Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, true, true, 107, 'financial'),
        ('advance_deduction_amount', 'advance_deduction_amount', 'Advance Deduction', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 109, 'financial'),
        ('invoice_source', 'invoice_source', 'Invoice Source', 'enum', 'one', 'document.purchase_invoice_source', NULL::jsonb, NULL::jsonb, true, true, false, 110, 'identity'),
        ('retention_amount', 'retention_amount', 'Retention Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 112, 'retention'),
        ('retention_pct', 'retention_pct', 'Retention %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, false, false, true, 114, 'retention'),
        ('supplier_invoice_number', 'supplier_invoice_number', 'Supplier Invoice No.', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":100}'::jsonb, false, false, false, 120, 'reference'),
        ('description', 'description', 'Invoice Name', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":200}'::jsonb, false, false, false, 130, 'identity'),
        ('payment_term_id', 'payment_term_id', 'Payment Terms', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_term"}'::jsonb, '{"ref_entity":"payment_term"}'::jsonb, false, false, false, 140, 'reference'),
        ('payment_method_id', 'payment_method_id', 'Payment Method', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"payment_method"}'::jsonb, '{"ref_entity":"payment_method"}'::jsonb, false, false, false, 142, 'reference'),
        ('invoice_match_type', 'match_type', 'Match Type', 'enum', 'one', 'document.invoice_match_type', NULL::jsonb, NULL::jsonb, true, true, false, 150, 'matching'),
        ('match_type', 'match_type', 'Match Type', 'enum', 'one', 'document.invoice_match_type', NULL::jsonb, NULL::jsonb, true, true, false, 150, 'matching'),
        ('match_status', 'match_status', 'Match Status', 'enum', 'one', 'document.invoice_match_status', NULL::jsonb, NULL::jsonb, false, true, true, 155, 'matching'),
        ('hold_reason', 'hold_reason', 'Hold Reason', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, false, false, false, 160, 'matching'),
        ('is_on_hold', 'is_on_hold', 'On Hold', 'boolean', 'one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 163, 'matching'),
        ('notes', 'notes', 'Notes', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":2000}'::jsonb, false, false, false, 170, 'metadata'),
        ('tags', 'tags', 'Tags', 'json', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 175, 'metadata'),
        ('cost_center_id', 'cost_center_id', 'Cost Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"cost_center"}'::jsonb, '{"ref_entity":"cost_center"}'::jsonb, false, true, false, 200, 'dimensions'),
        ('budget_check_result', 'budget_check_result', 'Budget Check', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, true, 205, 'matching'),
        ('project_id', 'project_id', 'Project', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"project"}'::jsonb, '{"ref_entity":"project"}'::jsonb, false, true, false, 210, 'dimensions'),
        ('profit_center_id', 'profit_center_id', 'Profit Center', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"profit_center"}'::jsonb, '{"ref_entity":"profit_center"}'::jsonb, false, true, false, 215, 'dimensions'),
        ('fiscal_year', 'fiscal_year', 'Fiscal Year', 'integer', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, true, 220, 'financial'),
        ('site_id', 'site_id', 'Site', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"site"}'::jsonb, '{"ref_entity":"site"}'::jsonb, false, true, false, 222, 'dimensions'),
        ('period_number', 'period_number', 'Period', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1,"max":16}'::jsonb, true, true, true, 225, 'financial'),
        ('tax_mode', 'tax_mode', 'Tax Mode', 'lookup', 'zero_or_one', 'document.purchase_invoice_tax_mode', NULL::jsonb, NULL::jsonb, false, true, false, 85, 'tax'),
        ('tax_mode_source', 'tax_mode_source', 'Tax Mode Source', 'lookup', 'zero_or_one', 'document.purchase_invoice_tax_mode_source', NULL::jsonb, NULL::jsonb, false, true, true, 86, 'tax'),
        ('credited_invoice_id', 'reversal_of_id', 'Original Invoice Being Credited', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number"}'::jsonb, '{"ref_entity":"purchase_invoice"}'::jsonb, false, false, false, 300, 'reference'),
        ('debited_invoice_id', 'reversal_of_id', 'Original Invoice Being Debited', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number"}'::jsonb, '{"ref_entity":"purchase_invoice"}'::jsonb, false, false, false, 301, 'reference'),
        ('retention_invoice_id', 'reversal_of_id', 'Invoice With Retention', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number"}'::jsonb, '{"ref_entity":"purchase_invoice"}'::jsonb, false, false, false, 302, 'reference'),
        ('credit_reason', 'metadata', 'Reason for Credit', 'enum', 'zero_or_one', 'document.purchase_invoice_credit_reason', NULL::jsonb, NULL::jsonb, false, false, false, 310, 'identity'),
        ('debit_reason', 'metadata', 'Reason for Debit', 'enum', 'zero_or_one', 'document.purchase_invoice_debit_reason', NULL::jsonb, NULL::jsonb, false, false, false, 311, 'identity'),
        ('advance_type', 'metadata', 'Advance Type', 'enum', 'zero_or_one', 'document.purchase_invoice_advance_type', NULL::jsonb, NULL::jsonb, false, false, false, 312, 'identity'),
        ('recovery_method', 'metadata', 'Recovery Method', 'enum', 'zero_or_one', 'document.purchase_invoice_recovery_method', NULL::jsonb, NULL::jsonb, false, false, false, 313, 'identity'),
        ('release_type', 'metadata', 'Release Type', 'enum', 'zero_or_one', 'document.purchase_invoice_release_type', NULL::jsonb, NULL::jsonb, false, false, false, 314, 'identity'),
        ('application_strategy', 'metadata', 'Application Strategy', 'enum', 'zero_or_one', 'document.purchase_invoice_application_strategy', NULL::jsonb, NULL::jsonb, false, false, false, 315, 'identity'),
        ('credit_reference', 'supplier_invoice_number', 'Credit Reference', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":100}'::jsonb, false, false, false, 320, 'reference'),
        ('credit_note_date', 'supplier_invoice_date', 'Credit Note Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 321, 'dates'),
        ('credit_note_name', 'description', 'Credit Note Name', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":200}'::jsonb, false, false, false, 322, 'identity'),
        ('debit_note_number', 'supplier_invoice_number', 'Debit Note No.', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":100}'::jsonb, false, false, false, 330, 'reference'),
        ('debit_note_date', 'supplier_invoice_date', 'Debit Note Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 331, 'dates'),
        ('debit_note_name', 'description', 'Debit Note Name', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":200}'::jsonb, false, false, false, 332, 'identity'),
        ('advance_request_reference', 'supplier_invoice_number', 'Supplier Request Ref.', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":100}'::jsonb, false, false, false, 340, 'reference'),
        ('advance_request_date', 'supplier_invoice_date', 'Request Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 341, 'dates'),
        ('advance_name', 'description', 'Advance Name', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":200}'::jsonb, false, false, false, 342, 'identity'),
        ('release_request_reference', 'supplier_invoice_number', 'Release Request Ref.', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":100}'::jsonb, false, false, false, 350, 'reference'),
        ('release_date', 'supplier_invoice_date', 'Release Date', 'date', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, false, 351, 'dates'),
        ('release_name', 'description', 'Release Name', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":200}'::jsonb, false, false, false, 352, 'identity')
    )
    UPDATE control.entity_field ef
       SET column_name = f.column_name,
           label = f.label,
           data_type = f.data_type,
           ui_type = NULL,
           cardinality = f.cardinality,
           origin = 'standard',
           enum_config = NULL,
           enum_domain_code = f.enum_domain_code,
           reference_config = f.reference_config,
           validation = f.validation,
           is_required = f.is_required,
           is_filterable = f.is_filterable,
           is_read_only = f.is_read_only,
           is_computed = false,
           is_active = true,
           ui_hint = CASE
               WHEN f.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb)
               ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', f.group_key)
           END,
           sort_order = f.sort_order,
           updated_at = now(),
           updated_by = v_su
      FROM invoice_fields f,
           control.entity_version ev,
           control.entity e
      WHERE e.entity_code = 'purchase_invoice'
        AND e.tenant_id IS NULL
        AND e.id = ev.entity_id
        AND ev.version_no = 1
        AND ev.tenant_id IS NULL
        AND ev.id = ef.entity_version_id
        AND ef.tenant_id IS NULL
        AND ef.name = f.name;

    WITH line_fields(
        name, column_name, label, data_type, cardinality, enum_domain_code,
        reference_config, validation, is_required, is_filterable, is_read_only,
        sort_order, group_key
    ) AS (
        VALUES
        ('purchase_invoice_id', 'purchase_invoice_id', 'Invoice', 'reference', 'one', NULL::text, '{"target_entity":"purchase_invoice","display_field":"document_no"}'::jsonb, '{"ref_entity":"purchase_invoice"}'::jsonb, true, false, true, 5, NULL::text),
        ('line_no', 'line_no', 'Line No.', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1}'::jsonb, true, false, true, 10, NULL::text),
        ('item_description', 'item_description', 'Description', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, true, false, false, 20, 'item'),
        ('procurement_type', 'procurement_type', 'Type', 'enum', 'one', 'document.procurement_type', NULL::jsonb, NULL::jsonb, true, true, false, 30, 'item'),
        ('item_id', 'item_id', 'Item', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"item"}'::jsonb, '{"ref_entity":"item"}'::jsonb, false, false, false, 35, 'item'),
        ('spend_category_id', 'spend_category_id', 'Spend Category', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"spend_category"}'::jsonb, '{"ref_entity":"spend_category"}'::jsonb, false, true, false, 40, 'classification'),
        ('business_intent_id', 'business_intent_id', 'Business Intent', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"business_intent"}'::jsonb, '{"ref_entity":"business_intent"}'::jsonb, false, false, false, 45, 'classification'),
        ('unspsc_code', 'metadata', 'UNSPSC Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":32}'::jsonb, false, false, false, 46, 'classification'),
        ('hs_code', 'metadata', 'HS / Trade Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":32}'::jsonb, false, false, false, 47, 'classification'),
        ('uom_code', 'uom_code', 'UoM', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":20}'::jsonb, true, false, false, 50, 'item'),
        ('quantity', 'quantity', 'Quantity', 'decimal', 'one', NULL::text, NULL::jsonb, '{"nonzero":true}'::jsonb, true, false, false, 60, 'item'),
        ('unit_price', 'unit_price', 'Unit Price', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, false, 70, 'item'),
        ('price_unit', 'price_unit', 'Price Per', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 72, 'item'),
        ('discount_pct', 'discount_pct', 'Discount %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, false, false, false, 75, 'discount'),
        ('net_amount', 'net_amount', 'Net Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 80, 'financial'),
        ('discount_amount', 'discount_amount', 'Discount Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 82, 'discount'),
        ('tax_amount', 'tax_amount', 'Tax Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 90, 'tax'),
        ('withholding_tax_amount', 'withholding_tax_amount', 'WHT Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 95, 'tax'),
        ('gross_amount', 'gross_amount', 'Gross Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, false, false, 100, 'financial'),
        ('retention_pct', 'retention_pct', 'Retention %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, false, false, false, 102, 'retention'),
        ('retention_amount', 'retention_amount', 'Retention Amt', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 104, 'retention'),
        ('cost_center_id', 'cost_center_id', 'Cost Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"cost_center"}'::jsonb, '{"ref_entity":"cost_center"}'::jsonb, false, true, false, 110, 'dimensions'),
        ('profit_center_id', 'profit_center_id', 'Profit Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"profit_center"}'::jsonb, '{"ref_entity":"profit_center"}'::jsonb, false, false, false, 115, 'dimensions'),
        ('project_id', 'project_id', 'Project', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"project"}'::jsonb, '{"ref_entity":"project"}'::jsonb, false, true, false, 120, 'dimensions'),
        ('site_id', 'site_id', 'Site', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"site"}'::jsonb, '{"ref_entity":"site"}'::jsonb, false, false, false, 125, 'dimensions'),
        ('match_status', 'match_status', 'Match Status', 'enum', 'one', 'document.invoice_match_status', NULL::jsonb, NULL::jsonb, false, true, true, 130, 'matching'),
        ('matched_quantity', 'matched_quantity', 'Matched Qty', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, true, 135, 'matching'),
        ('is_asset', 'is_asset', 'Is Asset', 'boolean', 'one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, false, 140, 'matching'),
        ('asset_category_id', 'asset_category_id', 'Asset Category', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"asset_class"}'::jsonb, '{"ref_entity":"asset_class"}'::jsonb, false, false, false, 145, 'matching'),
        ('commitment_line_id', 'commitment_line_id', 'PO Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"commitment_line"}'::jsonb, '{"ref_entity":"commitment_line"}'::jsonb, false, false, true, 150, 'matching'),
        ('goods_receipt_line_id', 'goods_receipt_line_id', 'GR Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"goods_receipt_line"}'::jsonb, '{"ref_entity":"goods_receipt_line"}'::jsonb, false, false, true, 151, 'matching'),
        ('ses_line_id', 'ses_line_id', 'SES Line', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"service_entry_sheet_line"}'::jsonb, '{"ref_entity":"service_entry_sheet_line"}'::jsonb, false, false, true, 152, 'matching')
    )
    UPDATE control.entity_field ef
       SET column_name = f.column_name,
           label = f.label,
           data_type = f.data_type,
           ui_type = NULL,
           cardinality = f.cardinality,
           origin = 'standard',
           enum_config = NULL,
           enum_domain_code = f.enum_domain_code,
           reference_config = f.reference_config,
           validation = f.validation,
           is_required = f.is_required,
           is_filterable = f.is_filterable,
           is_read_only = f.is_read_only,
           is_computed = false,
           is_active = true,
           ui_hint = CASE
               WHEN f.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key'
               ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', f.group_key)
           END,
           sort_order = f.sort_order,
           updated_at = now(),
           updated_by = v_su
      FROM line_fields f,
           control.entity_version ev,
           control.entity e
      WHERE e.entity_code = 'purchase_invoice_line'
        AND e.tenant_id IS NULL
        AND e.id = ev.entity_id
        AND ev.version_no = 1
        AND ev.tenant_id IS NULL
        AND ev.id = ef.entity_version_id
        AND ef.tenant_id IS NULL
        AND ef.name = f.name;

    WITH distribution_fields(
        name, column_name, label, data_type, cardinality, enum_domain_code,
        reference_config, validation, is_required, is_filterable, is_read_only,
        sort_order, group_key
    ) AS (
        VALUES
        ('source_doc_type', 'source_doc_type', 'Source Document Type', 'text', 'one', NULL::text, NULL::jsonb, NULL::jsonb, true, true, true, 5, 'reference'),
        ('source_line_id', 'source_line_id', 'Commercial Line', 'reference', 'one', NULL::text, NULL::jsonb, '{"polymorphic":true}'::jsonb, true, false, true, 7, 'reference'),
        ('distribution_no', 'distribution_no', 'Split No.', 'integer', 'one', NULL::text, NULL::jsonb, '{"min":1}'::jsonb, true, false, true, 10, 'identity'),
        ('distribution_basis', 'distribution_basis', 'Split Basis', 'enum', 'one', 'document.acct_dist_account_source', NULL::jsonb, NULL::jsonb, true, true, false, 20, 'financial'),
        ('split_pct', 'split_pct', 'Split %', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 25, 'financial'),
        ('split_amount', 'split_amount', 'Split Amount', 'decimal', 'zero_or_one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, false, false, false, 27, 'financial'),
        ('distributed_amount', 'distributed_amount', 'Assigned Amount', 'decimal', 'one', NULL::text, NULL::jsonb, '{"min":0}'::jsonb, true, true, false, 30, 'financial'),
        ('currency_code', 'currency_code', 'Currency', 'text', 'one', NULL::text, NULL::jsonb, '{"max_length":3}'::jsonb, true, false, true, 35, 'financial'),
        ('account_source', 'account_source', 'Account Derivation', 'enum', 'one', 'document.acct_dist_account_source', NULL::jsonb, NULL::jsonb, true, true, false, 40, 'matching'),
        ('posting_role_code', 'posting_role_code', 'Posting Role', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, false, true, 45, 'matching'),
        ('gl_account_id', 'gl_account_id', 'Resolved GL Account', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, '{"ref_entity":"gl_account"}'::jsonb, false, true, false, 50, 'matching'),
        ('account_code', 'account_code', 'Account Code', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":50}'::jsonb, false, false, true, 52, 'matching'),
        ('business_intent_id', 'business_intent_id', 'Business Intent', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"business_intent","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"business_intent"}'::jsonb, false, false, false, 55, 'classification'),
        ('spend_category_id', 'spend_category_id', 'Spend Category', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"spend_category","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"spend_category"}'::jsonb, false, true, false, 60, 'classification'),
        ('cost_center_id', 'cost_center_id', 'Cost Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"cost_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"cost_center"}'::jsonb, false, true, false, 70, 'dimensions'),
        ('profit_center_id', 'profit_center_id', 'Profit Centre', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"profit_center","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"profit_center"}'::jsonb, false, false, false, 75, 'dimensions'),
        ('project_id', 'project_id', 'Project', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"project","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"project"}'::jsonb, false, true, false, 80, 'dimensions'),
        ('site_id', 'site_id', 'Site', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"site","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"site"}'::jsonb, false, false, false, 85, 'dimensions'),
        ('is_capex', 'is_capex', 'CapEx', 'boolean', 'one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, false, 90, 'matching'),
        ('asset_class_id', 'asset_class_id', 'Asset Class', 'reference', 'zero_or_one', NULL::text, '{"target_entity":"asset_class","target_field":"id","display_field":"name"}'::jsonb, '{"ref_entity":"asset_class"}'::jsonb, false, false, false, 95, 'matching'),
        ('budget_check_result', 'budget_check_result', 'Budget Check', 'text', 'zero_or_one', NULL::text, NULL::jsonb, NULL::jsonb, false, true, true, 100, 'matching'),
        ('description', 'description', 'Split Text', 'text', 'zero_or_one', NULL::text, NULL::jsonb, '{"max_length":500}'::jsonb, false, false, false, 110, 'identity')
    )
    UPDATE control.entity_field ef
       SET column_name = f.column_name,
           label = f.label,
           data_type = f.data_type,
           ui_type = NULL,
           cardinality = f.cardinality,
           origin = 'standard',
           enum_config = NULL,
           enum_domain_code = f.enum_domain_code,
           reference_config = f.reference_config,
           validation = f.validation,
           is_required = f.is_required,
           is_filterable = f.is_filterable,
           is_read_only = f.is_read_only,
           is_computed = false,
           is_active = true,
           ui_hint = CASE
               WHEN f.group_key IS NULL THEN COALESCE(ef.ui_hint, '{}'::jsonb) - 'group_key'
               ELSE COALESCE(ef.ui_hint, '{}'::jsonb) || jsonb_build_object('group_key', f.group_key)
           END,
           sort_order = f.sort_order,
           updated_at = now(),
           updated_by = v_su
      FROM distribution_fields f,
           control.entity_version ev,
           control.entity e
     WHERE e.entity_code = 'accounting_distribution'
       AND e.tenant_id IS NULL
       AND e.id = ev.entity_id
       AND ev.version_no = 1
       AND ev.tenant_id IS NULL
       AND ev.id = ef.entity_version_id
       AND ef.tenant_id IS NULL
       AND ef.name = f.name;

    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb)
                            || jsonb_build_object('field_metadata_repair_version', 1),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code IN ('purchase_invoice', 'purchase_invoice_line', 'accounting_distribution')
       AND tenant_id IS NULL;

    INSERT INTO control.entity_relation
        (tenant_id, entity_version_id, name, relation_kind, target_entity, fk_field, on_delete, created_by)
    SELECT
        NULL,
        ev.id,
        r.rel_name,
        r.kind,
        r.target_entity,
        r.fk_field,
        r.on_del,
        v_su
    FROM (VALUES
        ('purchase_invoice', 'supplier', 'belongs_to', 'supplier', 'supplier_id', 'restrict'),
        ('purchase_invoice', 'purchase_order', 'belongs_to', 'purchase_order', 'commitment_id', 'set_null'),
        ('purchase_invoice', 'lines', 'has_many', 'purchase_invoice_line', 'purchase_invoice_id', 'cascade'),
        ('purchase_invoice', 'journal_entry', 'belongs_to', 'journal_entry', 'ap_je_id', 'set_null'),
        ('purchase_invoice', 'payment_term', 'belongs_to', 'payment_term', 'payment_term_id', 'set_null'),
        ('purchase_invoice_line', 'purchase_invoice', 'belongs_to', 'purchase_invoice', 'purchase_invoice_id', 'cascade'),
        ('purchase_invoice_line', 'spend_category', 'belongs_to', 'spend_category', 'spend_category_id', 'set_null'),
        ('purchase_invoice_line', 'distributions', 'has_many', 'accounting_distribution', 'source_line_id', 'cascade'),
        ('accounting_distribution', 'source_invoice_line', 'belongs_to', 'purchase_invoice_line', 'source_line_id', 'cascade'),
        ('accounting_distribution', 'gl_account', 'belongs_to', 'gl_account', 'gl_account_id', 'set_null'),
        ('accounting_distribution', 'cost_center', 'belongs_to', 'cost_center', 'cost_center_id', 'set_null'),
        ('accounting_distribution', 'project', 'belongs_to', 'project', 'project_id', 'set_null')
    ) AS r(entity, rel_name, kind, target_entity, fk_field, on_del)
    JOIN control.entity e
      ON e.entity_code = r.entity
     AND e.tenant_id IS NULL
    JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.version_no = 1
     AND ev.tenant_id IS NULL
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET relation_kind = EXCLUDED.relation_kind,
           target_entity = EXCLUDED.target_entity,
           fk_field = EXCLUDED.fk_field,
           on_delete = EXCLUDED.on_delete,
           updated_at = now(),
           updated_by = v_su;

    GET DIAGNOSTICS v_relations = ROW_COUNT;
    RAISE NOTICE 'purchase invoice runtime identity repair applied; relations upserted=%', v_relations;
END $$;
