-- =============================================================================
-- Purchase invoice create pre-flight chooser metadata.
-- Generic runtime reads this from control.entity_flow.config->preflight.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_flow_id uuid;
BEGIN
  INSERT INTO control.parameter_definition (
      code,
      namespace,
      display_name,
      description,
      owner_model,
      control_level,
      tenant_visibility,
      data_type,
      unit,
      default_value,
      product_value,
      min_value,
      max_value,
      allowed_values,
      runtime_reload,
      cache_ttl_seconds,
      is_security_sensitive,
      is_runtime_reloadable,
      sort_order,
      metadata,
      created_by
  )
  VALUES (
      'document.intake.preflight.ocr_enabled',
      'document.intake.preflight',
      'Pre-flight OCR auto-detect',
      'Enables the PDF drop-zone classifier on metadata-driven intake pre-flight choosers.',
      'product',
      'tenant_configurable',
      'configurable',
      'boolean',
      NULL,
      'false'::jsonb,
      'false'::jsonb,
      NULL,
      NULL,
      NULL,
      'immediate',
      300,
      false,
      true,
      10,
      '{"surface":"document-runtime.flow-preflight"}'::jsonb,
      v_su
  )
  ON CONFLICT (code) DO UPDATE SET
      namespace = EXCLUDED.namespace,
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      control_level = EXCLUDED.control_level,
      tenant_visibility = EXCLUDED.tenant_visibility,
      data_type = EXCLUDED.data_type,
      default_value = EXCLUDED.default_value,
      product_value = EXCLUDED.product_value,
      runtime_reload = EXCLUDED.runtime_reload,
      cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
      is_security_sensitive = EXCLUDED.is_security_sensitive,
      is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
      sort_order = EXCLUDED.sort_order,
      metadata = EXCLUDED.metadata,
      status = 'active',
      updated_at = now(),
      updated_by = EXCLUDED.created_by;

  UPDATE control.lookup_value lv
     SET description = v.short_description,
         sort_order = COALESCE(v.sort_order, lv.sort_order),
         metadata = jsonb_set(
           COALESCE(lv.metadata, '{}'::jsonb) ||
             jsonb_strip_nulls(jsonb_build_object('display_tier', v.display_tier)),
           '{preflight}',
           jsonb_strip_nulls(jsonb_build_object(
             'description', v.card_description,
             'helper', v.helper
           )),
           true
         )
    FROM (VALUES
      (
        'document.purchase_invoice_type',
        'standard',
        'Regular supplier bill for goods received or services delivered.',
        'Regular supplier bill for goods received or services delivered.',
        NULL::text,
        'primary',
        10
      ),
      (
        'document.purchase_invoice_type',
        'credit_note',
        'Supplier-issued credit reducing an outstanding payable.',
        'Supplier-issued credit reducing an outstanding payable. Mirrors an original invoice in full or in part.',
        NULL::text,
        'primary',
        20
      ),
      (
        'document.purchase_invoice_type',
        'debit_note',
        'Buyer-issued document charging the supplier for a shortfall or breach.',
        'Buyer-issued document charging the supplier for a shortfall or breach. Reduces what we owe them.',
        NULL::text,
        'primary',
        30
      ),
      (
        'document.purchase_invoice_type',
        'advance',
        'Standalone prepayment to a supplier before any work or delivery.',
        'Standalone prepayment to a supplier before any work or delivery and recovered by future invoices.',
        NULL::text,
        'primary',
        40
      ),
      (
        'document.purchase_invoice_type',
        'retention_release',
        'Releases previously-withheld retention back to the supplier.',
        'Releases previously-withheld retention back to the supplier when contractual conditions are met.',
        NULL::text,
        'primary',
        50
      ),
      (
        'document.purchase_invoice_type',
        'final',
        'Closing invoice on a PO or contract.',
        'Closing invoice on a PO or contract. Posts normally and releases any remaining encumbered budget on the parent commitment.',
        NULL::text,
        'advanced',
        60
      ),
      (
        'document.purchase_invoice_type',
        'self_billed',
        'Buyer-created invoice on behalf of the supplier under a self-billing agreement.',
        'Buyer-created invoice on behalf of the supplier under a self-billing agreement. We compute the amount owed and notify the supplier.',
        'Requires a contractual basis; not valid for Non-PO or One-Time Supplier.',
        'advanced',
        70
      ),
      (
        'document.purchase_invoice_source',
        'po_based',
        'Invoice against an existing purchase order.',
        'Invoice against an existing purchase order. Matched against the PO and the goods receipt.',
        NULL::text,
        NULL::text,
        10
      ),
      (
        'document.purchase_invoice_source',
        'contract_based',
        'Invoice against an existing master agreement or framework contract.',
        'Invoice against an existing master agreement or framework contract.',
        NULL::text,
        NULL::text,
        20
      ),
      (
        'document.purchase_invoice_source',
        'non_po',
        'Invoice with no upstream PO or contract.',
        'Invoice with no upstream PO or contract. Approver derives intent from spend category at invoice time.',
        NULL::text,
        NULL::text,
        30
      ),
      (
        'document.purchase_invoice_source',
        'one_time_supplier',
        'Invoice from a party not in supplier master data.',
        'Invoice from a party not in supplier master data. Inline party creation, single-use payment, no recurring relationship.',
        NULL::text,
        NULL::text,
        40
      )
    ) AS v(domain_code, code, short_description, card_description, helper, display_tier, sort_order)
   WHERE lv.domain_code = v.domain_code
     AND lv.code = v.code
     AND lv.tenant_id IS NULL;

  SELECT ef.id
    INTO v_flow_id
    FROM control.entity_flow ef
    JOIN control.entity_version ev ON ev.id = ef.entity_version_id
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document'
     AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL
     AND ev.version_no = 1
     AND ef.flow_code = 'create'
     AND ef.tenant_id IS NULL
   LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE NOTICE '029b_purchase_invoice_preflight: purchase_invoice create flow not found - skipped';
    RETURN;
  END IF;

  UPDATE control.entity_flow
     SET config = jsonb_set(
       COALESCE(config, '{}'::jsonb),
       '{preflight}',
       jsonb_build_object(
         'enabled', true,
         'suppress_alternate_flow_launcher', true,
         'eyebrow', 'New Invoice',
         'title', 'What kind of invoice are you raising?',
         'dimensions', jsonb_build_array(
           jsonb_build_object(
             'field', 'invoice_type',
             'caption', 'Commercial purpose',
             'advanced_tiers', jsonb_build_array('advanced')
           ),
           jsonb_build_object(
             'field', 'invoice_source',
             'caption', 'Commitment basis'
           )
         ),
         'defaults', jsonb_build_object(
           'invoice_type', 'standard',
           'invoice_source', 'non_po'
         ),
         'selection_summary_label', 'You are creating',
         'profile_label', 'Routes to profile',
         'recent_label', 'Recent',
         'use_recent_label', 'Use most recent',
         'more_label', 'More types',
         'continue_label', 'Continue to Identify',
         'cancel_label', 'Exit',
         'upload', jsonb_build_object(
           'enabled', false,
           'parameter_code', 'document.intake.preflight.ocr_enabled',
           'parameter_namespace', 'document.intake.preflight',
           'label', 'Drop a PDF to auto-detect',
           'helper', 'Classifier pre-selects choices when enabled.',
           'accept', jsonb_build_array('application/pdf')
         ),
         'disable_rules', jsonb_build_array(
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'advance',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Advances require an ongoing supplier relationship for future recovery.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'retention_release',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Requires posted supplier invoices with releasable retention.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'final',
               'invoice_source', 'non_po'
             ),
             'reason', 'Final invoices require a PO or contract commitment to close.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'final',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Final invoices require a PO or contract commitment basis.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'self_billed',
               'invoice_source', 'non_po'
             ),
             'reason', 'Self-billed invoices require a contractual basis.'
           ),
           jsonb_build_object(
             'when', jsonb_build_object(
               'invoice_type', 'self_billed',
               'invoice_source', 'one_time_supplier'
             ),
             'reason', 'Self-billed invoices require a contractual basis.'
           )
         ),
         'profile_rules', jsonb_build_array(
           jsonb_build_object(
             'when', jsonb_build_object('invoice_type', 'advance'),
             'profile', 'AP_ADVANCE_VENDOR'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_type', 'retention_release'),
             'profile', 'AP_RETENTION_RELEASE'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'non_po'),
             'profile', 'AP_NON_PO_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'po_based'),
             'profile', 'AP_PO_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'contract_based'),
             'profile', 'AP_CONTRACT_STANDARD'
           ),
           jsonb_build_object(
             'when', jsonb_build_object('invoice_source', 'one_time_supplier'),
             'profile', 'AP_NON_PO_STANDARD'
           )
         )
       ),
       true
     ),
     updated_at = now(),
     updated_by = v_su
   WHERE id = v_flow_id;

  RAISE NOTICE '029b_purchase_invoice_preflight: metadata-driven pre-flight chooser enabled';
END $$;
