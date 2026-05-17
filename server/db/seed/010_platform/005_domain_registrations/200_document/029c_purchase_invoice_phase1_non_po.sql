-- =============================================================================
-- Purchase invoice Phase 1 Non-PO type adaptations.
-- Adds metadata-driven fields and flow rules for Standard, Credit Note,
-- Debit Note, Advance, and Retention Release without UI annotation copy.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
  v_step_2  uuid;
  v_step_3  uuid;
BEGIN
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document'
     AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1
   LIMIT 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE '029c_purchase_invoice_phase1_non_po: purchase_invoice v1 not found - skipped';
    RETURN;
  END IF;

  SELECT ef.id INTO v_flow_id
    FROM control.entity_flow ef
   WHERE ef.entity_version_id = v_ev_id
     AND ef.flow_code = 'create'
     AND ef.tenant_id IS NULL
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE '029c_purchase_invoice_phase1_non_po: create flow not found - skipped';
    RETURN;
  END IF;

  SELECT id INTO v_step_1 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'identify';
  SELECT id INTO v_step_2 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'commercial';
  SELECT id INTO v_step_3 FROM control.entity_flow_step WHERE flow_id = v_flow_id AND step_key = 'review';

  -- Keep the explicit advance rule generic; visible required fields now gate dynamically.
  UPDATE control.entity_flow_step
     SET advance_rule = '{"required_fields":["company_code_id","supplier_id","invoice_type","invoice_source","posting_date"]}'::jsonb
   WHERE id = v_step_1;

  -- Lookup domains for type-specific controls.
  INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
  SELECT v.code, v.name, v.description, 'document', false, 'active', v_su
  FROM (VALUES
    ('document.purchase_invoice_credit_reason',      'Purchase Invoice Credit Reason',      'Reason selected for a supplier credit note.'),
    ('document.purchase_invoice_debit_reason',       'Purchase Invoice Debit Reason',       'Reason selected for a buyer-issued debit note.'),
    ('document.purchase_invoice_advance_type',       'Purchase Invoice Advance Type',       'Commercial basis for an advance payment.'),
    ('document.purchase_invoice_recovery_method',    'Purchase Invoice Recovery Method',    'How an advance payment is recovered.'),
    ('document.purchase_invoice_release_type',       'Purchase Invoice Retention Release Type', 'How retained balances are released.'),
    ('document.purchase_invoice_application_strategy','Purchase Invoice Application Strategy','How a credit or debit is applied to open payables.')
  ) AS v(code, name, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain d WHERE d.code = v.code
  );

  INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
  SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active', v_su
  FROM (VALUES
    ('price_adjustment', 'Price adjustment', 'document.purchase_invoice_credit_reason', 'Post-invoice price correction.', 10),
    ('goods_returned', 'Goods returned', 'document.purchase_invoice_credit_reason', 'Supplier credit for returned goods.', 20),
    ('allowance_discount', 'Allowance / discount', 'document.purchase_invoice_credit_reason', 'Supplier allowance or discount credit.', 30),
    ('billing_error', 'Billing error', 'document.purchase_invoice_credit_reason', 'Correction for a billing error.', 40),
    ('tax_correction', 'Tax correction', 'document.purchase_invoice_credit_reason', 'Correction of tax treatment or amount.', 50),
    ('other', 'Other', 'document.purchase_invoice_credit_reason', 'Other credit reason.', 90),

    ('damaged_goods', 'Damaged goods', 'document.purchase_invoice_debit_reason', 'Debit raised for damaged goods.', 10),
    ('short_delivery', 'Short delivery', 'document.purchase_invoice_debit_reason', 'Debit raised for a delivery shortfall.', 20),
    ('sla_penalty', 'Penalty / SLA breach', 'document.purchase_invoice_debit_reason', 'Debit raised for a contractual penalty.', 30),
    ('rebate', 'Rebate', 'document.purchase_invoice_debit_reason', 'Debit raised for a rebate.', 40),
    ('freight_back_charge', 'Freight back-charge', 'document.purchase_invoice_debit_reason', 'Debit raised for freight charged back to supplier.', 50),
    ('other', 'Other', 'document.purchase_invoice_debit_reason', 'Other debit reason.', 90),

    ('percent_contract_value', '% of contract value', 'document.purchase_invoice_advance_type', 'Advance calculated as a percentage of contract value.', 10),
    ('fixed_amount', 'Fixed amount', 'document.purchase_invoice_advance_type', 'Advance entered as a fixed amount.', 20),
    ('milestone_advance', 'Milestone advance', 'document.purchase_invoice_advance_type', 'Advance linked to a milestone.', 30),

    ('next_3_invoices', 'Auto-recover from next 3 invoices', 'document.purchase_invoice_recovery_method', 'Recover evenly from the next three invoices.', 10),
    ('proportional', 'Auto-recover proportionally', 'document.purchase_invoice_recovery_method', 'Recover proportionally from future invoices.', 20),
    ('manual_allocation', 'Manual allocation only', 'document.purchase_invoice_recovery_method', 'Recover only when manually allocated.', 30),

    ('partial', 'Partial', 'document.purchase_invoice_release_type', 'Release part of the selected retention balance.', 10),
    ('full_release', 'Full release', 'document.purchase_invoice_release_type', 'Release all selected retention balance.', 20),
    ('milestone_based', 'Milestone-based', 'document.purchase_invoice_release_type', 'Release based on milestone completion.', 30),

    ('apply_now', 'Apply now to specific invoice', 'document.purchase_invoice_application_strategy', 'Apply against the selected original invoice.', 10),
    ('hold_for_allocation', 'Hold for future allocation', 'document.purchase_invoice_application_strategy', 'Hold the adjustment for future allocation.', 20),
    ('pro_rata_open_balance', 'Apply pro-rata across open balance', 'document.purchase_invoice_application_strategy', 'Apply across the supplier open balance.', 30),
    ('next_payment_run', 'Net against next payment run', 'document.purchase_invoice_application_strategy', 'Net against the next supplier payment run.', 40)
  ) AS v(code, name, domain_code, description, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
     WHERE x.domain_code = v.domain_code
       AND x.code = v.code
       AND x.tenant_id IS NULL
  );

  -- Metadata-backed and relabelled logical fields. Metadata paths are stored in json_config.
  INSERT INTO control.entity_field (
    entity_version_id, name, column_name, label, data_type,
    cardinality, origin, enum_domain_code, reference_config, lookup_config,
    validation, json_config, is_required, is_filterable, sort_order, created_by)
  SELECT v_ev_id, v.name, v.column_name, v.label, v.data_type,
         v.cardinality, 'standard', v.enum_domain_code, v.reference_config::jsonb, v.lookup_config::jsonb,
         v.validation::jsonb, v.json_config::jsonb, false, false, v.sort_order, v_su
  FROM (VALUES
    ('credited_invoice_id', 'reversal_of_id', 'Original Invoice Being Credited', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"empty"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 300),
    ('debited_invoice_id', 'reversal_of_id', 'Original Invoice Being Debited', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"empty"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 301),
    ('retention_invoice_id', 'reversal_of_id', 'Invoice With Retention', 'reference', 'zero_or_one', NULL::text,
      '{"target_entity":"purchase_invoice","target_field":"id","display_field":"invoice_number","picker":{"label_field":"invoice_number","description_field":"description","code_field":"supplier_invoice_number","show_code":true}}',
      '{"filters":{"status":["posted","approved","partially_paid"]},"dependent_filter":{"source_field":"supplier_id","target_field":"supplier_id","empty_behavior":"empty"}}',
      '{"ref_entity":"purchase_invoice"}', NULL::text, 302),

    ('credit_reason', 'metadata', 'Reason for Credit', 'enum', 'zero_or_one', 'document.purchase_invoice_credit_reason',
      NULL::text, NULL::text, NULL::text, '{"path":"credit_reason"}', 310),
    ('debit_reason', 'metadata', 'Reason for Debit', 'enum', 'zero_or_one', 'document.purchase_invoice_debit_reason',
      NULL::text, NULL::text, NULL::text, '{"path":"debit_reason"}', 311),
    ('advance_type', 'metadata', 'Advance Type', 'enum', 'zero_or_one', 'document.purchase_invoice_advance_type',
      NULL::text, NULL::text, NULL::text, '{"path":"advance_type"}', 312),
    ('recovery_method', 'metadata', 'Recovery Method', 'enum', 'zero_or_one', 'document.purchase_invoice_recovery_method',
      NULL::text, NULL::text, NULL::text, '{"path":"recovery_method"}', 313),
    ('release_type', 'metadata', 'Release Type', 'enum', 'zero_or_one', 'document.purchase_invoice_release_type',
      NULL::text, NULL::text, NULL::text, '{"path":"release_type"}', 314),
    ('application_strategy', 'metadata', 'Application Strategy', 'enum', 'zero_or_one', 'document.purchase_invoice_application_strategy',
      NULL::text, NULL::text, NULL::text, '{"path":"application_strategy"}', 315),

    ('credit_reference', 'supplier_invoice_number', 'Credit Reference', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 320),
    ('credit_note_date', 'supplier_invoice_date', 'Credit Note Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 321),
    ('credit_note_name', 'description', 'Credit Note Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 322),

    ('debit_note_number', 'supplier_invoice_number', 'Debit Note No.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 330),
    ('debit_note_date', 'supplier_invoice_date', 'Debit Note Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 331),
    ('debit_note_name', 'description', 'Debit Note Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 332),

    ('advance_request_reference', 'supplier_invoice_number', 'Supplier Request Ref.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 340),
    ('advance_request_date', 'supplier_invoice_date', 'Request Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 341),
    ('advance_name', 'description', 'Advance Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 342),

    ('release_request_reference', 'supplier_invoice_number', 'Release Request Ref.', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":100}', NULL::text, 350),
    ('release_date', 'supplier_invoice_date', 'Release Date', 'date', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, 351),
    ('release_name', 'description', 'Release Name', 'text', 'zero_or_one', NULL::text,
      NULL::text, NULL::text, '{"max_length":200}', NULL::text, 352)
  ) AS v(name, column_name, label, data_type, cardinality, enum_domain_code,
         reference_config, lookup_config, validation, json_config, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_field ef
     WHERE ef.entity_version_id = v_ev_id
       AND ef.name = v.name
       AND ef.tenant_id IS NULL
  );

  -- Keep existing labels/config fresh on rerun.
  UPDATE control.entity_field ef
     SET label = v.label,
         column_name = v.column_name,
         data_type = v.data_type,
         enum_domain_code = v.enum_domain_code,
         reference_config = v.reference_config::jsonb,
         lookup_config = v.lookup_config::jsonb,
         validation = v.validation::jsonb,
         json_config = v.json_config::jsonb,
         updated_at = now(),
         updated_by = v_su
    FROM (VALUES
      ('credit_reason', 'metadata', 'Reason for Credit', 'enum', 'document.purchase_invoice_credit_reason', NULL::text, NULL::text, NULL::text, '{"path":"credit_reason"}'),
      ('debit_reason', 'metadata', 'Reason for Debit', 'enum', 'document.purchase_invoice_debit_reason', NULL::text, NULL::text, NULL::text, '{"path":"debit_reason"}'),
      ('advance_type', 'metadata', 'Advance Type', 'enum', 'document.purchase_invoice_advance_type', NULL::text, NULL::text, NULL::text, '{"path":"advance_type"}'),
      ('recovery_method', 'metadata', 'Recovery Method', 'enum', 'document.purchase_invoice_recovery_method', NULL::text, NULL::text, NULL::text, '{"path":"recovery_method"}'),
      ('release_type', 'metadata', 'Release Type', 'enum', 'document.purchase_invoice_release_type', NULL::text, NULL::text, NULL::text, '{"path":"release_type"}'),
      ('application_strategy', 'metadata', 'Application Strategy', 'enum', 'document.purchase_invoice_application_strategy', NULL::text, NULL::text, NULL::text, '{"path":"application_strategy"}')
    ) AS v(name, column_name, label, data_type, enum_domain_code, reference_config, lookup_config, validation, json_config)
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = v.name
     AND ef.tenant_id IS NULL;

  -- Stamp ui_hint.visible_when on invoice-type-specific fields so the overview and
  -- edit panels hide them when irrelevant (evaluated via evaluateRule in the UI).
  UPDATE control.entity_field ef
     SET ui_hint = v.ui_hint::jsonb,
         updated_at = now(),
         updated_by = v_su
    FROM (VALUES
      -- credit note fields
      ('credited_invoice_id',       '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_reason',             '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_reference',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_note_date',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('credit_note_name',          '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      ('application_strategy',      '{"visible_when":{"==":[{"var":"invoice_type"},"credit_note"]}}'),
      -- debit note fields
      ('debited_invoice_id',        '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_reason',              '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_number',         '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_date',           '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      ('debit_note_name',           '{"visible_when":{"==":[{"var":"invoice_type"},"debit_note"]}}'),
      -- advance fields
      ('advance_type',              '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('recovery_method',           '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_request_reference', '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_request_date',      '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      ('advance_name',              '{"visible_when":{"==":[{"var":"invoice_type"},"advance"]}}'),
      -- retention release fields
      ('retention_invoice_id',      '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_type',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_request_reference', '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_date',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}'),
      ('release_name',              '{"visible_when":{"==":[{"var":"invoice_type"},"retention_release"]}}')
    ) AS v(name, ui_hint)
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = v.name
     AND ef.tenant_id IS NULL;

  -- Base Identify bindings only show for standard-like invoices; type variants provide their own labels.
  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('supplier_invoice_number','supplier_invoice_date','description')
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'received_date'
     AND eff.tenant_id IS NULL;

  -- Preferred first row: Supplier left, Company Code right.
  UPDATE control.entity_flow_field eff
     SET sort_order = CASE ef.name WHEN 'supplier_id' THEN 10 WHEN 'company_code_id' THEN 20 ELSE eff.sort_order END,
         span = CASE ef.name WHEN 'supplier_id' THEN 1 WHEN 'company_code_id' THEN 1 ELSE eff.span END
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_1
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('supplier_id','company_code_id')
     AND eff.tenant_id IS NULL;

  -- Step 1 type-specific bindings.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode, v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
    FROM control.entity_field ef
    JOIN (VALUES
      ('credited_invoice_id', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Required for credit notes and scoped to the selected supplier.', 50),
      ('credit_reason', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 55),
      ('credit_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 56),
      ('credit_note_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 57),
      ('credit_note_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"credit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 58),

      ('debited_invoice_id', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Optional for standalone debit notes.', 60),
      ('debit_reason', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 65),
      ('debit_note_number', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, 'sequence.prefix(DN)', NULL::text, NULL::text, NULL::text, NULL::text, 1, 'Auto-generated from the debit note sequence; editable until post.', 66),
      ('debit_note_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 67),
      ('debit_note_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"debit_note"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 68),

      ('advance_type', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 70),
      ('recovery_method', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 71),
      ('advance_request_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, 'sequence.prefix(ADV)', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 76),
      ('advance_request_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 77),
      ('advance_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"advance"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 78),

      ('retention_invoice_id', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'inline_search', 2, 'Select a posted invoice with unreleased retention.', 80),
      ('release_type', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 'select', 1, NULL::text, 85),
      ('release_request_reference', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, 'sequence.prefix(RR)', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 86),
      ('release_date', 'required', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, 'today()', NULL::text, NULL::text, NULL::text, NULL::text, 1, NULL::text, 87),
      ('release_name', 'editable', 'manual', '{"==":[{"var":"invoice_type"},"retention_release"]}', NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, 2, NULL::text, 88)
    ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
           default_source, derive_expression, override_permission,
           summary_role, ui_variant, span, help_text, sort_order)
      ON ef.name = v.field_name
     AND ef.entity_version_id = v_ev_id
  ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    derivation_mode = EXCLUDED.derivation_mode,
    visible_when = EXCLUDED.visible_when,
    required_when = EXCLUDED.required_when,
    default_source = EXCLUDED.default_source,
    derive_expression = EXCLUDED.derive_expression,
    override_permission = EXCLUDED.override_permission,
    summary_role = EXCLUDED.summary_role,
    ui_variant = EXCLUDED.ui_variant,
    span = EXCLUDED.span,
    help_text = EXCLUDED.help_text,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = v_su;

  -- Commercial step: adjustment visibility and no-tax derivation for advance/retention.
  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name IN ('discount_amount','freight_amount','misc_charges_amount','retention_amount')
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"in":[{"var":"invoice_type"},["standard","credit_note","final","self_billed"]]}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'withholding_tax_amount'
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_field eff
     SET derive_expression = 'tax.mode_for_invoice_type(invoice_type, supplier_id, tax_group_id, company_code_id)',
         default_source = NULL
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_2
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'tax_mode'
     AND eff.tenant_id IS NULL;

  UPDATE control.entity_flow_section
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
   WHERE flow_step_id = v_step_2
     AND section_key = 'lines'
     AND tenant_id IS NULL;

  INSERT INTO control.entity_flow_section (
    tenant_id, flow_step_id, section_key, label, description, sort_order,
    collapse_default, visible_when, reveal_behavior,
    section_type, entity_code, payload_key, field_codes, min_rows, default_row, created_by)
  VALUES
  (NULL, v_step_2, 'advance_lines', 'Advance Line', 'Single advance payment line.', 6,
   false, '{"==":[{"var":"invoice_type"},"advance"]}'::jsonb, 'auto_expand',
   'repeater', 'purchase_invoice_line', 'lines',
   '["item_description","procurement_type","uom_code","quantity","unit_price","gross_amount","commodity_category_id","business_intent_id","cost_center_id","profit_center_id","project_id","site_id"]'::jsonb,
   1, '{"item_description":"Advance Payment","procurement_type":"services","uom_code":"EA","quantity":1}'::jsonb, v_su),
  (NULL, v_step_2, 'retention_release_lines', 'Retention Release Line', 'Release amount line for selected retention.', 7,
   false, '{"==":[{"var":"invoice_type"},"retention_release"]}'::jsonb, 'auto_expand',
   'repeater', 'purchase_invoice_line', 'lines',
   '["item_description","procurement_type","uom_code","quantity","unit_price","gross_amount","commodity_category_id","business_intent_id","cost_center_id","profit_center_id","project_id","site_id"]'::jsonb,
   1, '{"item_description":"Retention Release","procurement_type":"services","uom_code":"EA","quantity":1}'::jsonb, v_su)
  ON CONFLICT (flow_step_id, section_key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    collapse_default = EXCLUDED.collapse_default,
    visible_when = EXCLUDED.visible_when,
    reveal_behavior = EXCLUDED.reveal_behavior,
    section_type = EXCLUDED.section_type,
    entity_code = EXCLUDED.entity_code,
    payload_key = EXCLUDED.payload_key,
    field_codes = EXCLUDED.field_codes,
    min_rows = EXCLUDED.min_rows,
    default_row = EXCLUDED.default_row,
    updated_at = now(),
    updated_by = v_su;

  -- Review step: application strategy and type-specific hidden match status.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_3, ef.id,
         'required', 'manual',
         '{"==":[{"var":"invoice_type"},"credit_note"]}'::jsonb,
         NULL::jsonb,
         NULL, NULL, NULL,
         NULL, 'select', 2,
         'When and how this credit is applied to open payable.',
         50, v_su
    FROM control.entity_field ef
   WHERE ef.entity_version_id = v_ev_id
     AND ef.name = 'application_strategy'
  ON CONFLICT (flow_step_id, entity_field_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    derivation_mode = EXCLUDED.derivation_mode,
    visible_when = EXCLUDED.visible_when,
    required_when = EXCLUDED.required_when,
    ui_variant = EXCLUDED.ui_variant,
    span = EXCLUDED.span,
    help_text = EXCLUDED.help_text,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = v_su;

  UPDATE control.entity_flow_field eff
     SET visible_when = '{"!":{"in":[{"var":"invoice_type"},["advance","retention_release"]]}}'::jsonb
    FROM control.entity_field ef
   WHERE eff.flow_step_id = v_step_3
     AND eff.entity_field_id = ef.id
     AND ef.entity_version_id = v_ev_id
     AND ef.name = 'match_status'
     AND eff.tenant_id IS NULL;

  RAISE NOTICE '029c_purchase_invoice_phase1_non_po: type-specific intake fields and rules applied';
END $$;
