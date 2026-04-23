-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/019_promote_proforma_operation.sql
-- §O1: entity_operation binding for promote_proforma (DETAIL view, PRIMARY button)
-- §O2: promote_proforma modal flow — 1-step form to bind real invoice identity.
-- The server handler runs: dedup probe → FX lock → fiscal period → state transition.
-- Idempotent: WHERE NOT EXISTS for operation and flow; DELETE+INSERT for field bindings.
-- Depends on: 001_invoice.sql, 001_invoice_v2.sql, 020_ap_flow_permissions.sql
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_ev_id   uuid;
  v_flow_id uuid;
  v_step_1  uuid;
BEGIN
  SELECT ev.id INTO v_ev_id
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
   WHERE e.table_schema = 'document' AND e.table_name = 'purchase_invoice'
     AND e.tenant_id IS NULL AND ev.version_no = 1;

  IF v_ev_id IS NULL THEN
    RAISE NOTICE '019_promote_proforma_operation: purchase_invoice v1 not found — skipped';
    RETURN;
  END IF;

  -- §O1 — entity_operation: promote_proforma
  -- Shown as a PRIMARY button in the DETAIL view when status='proforma'.
  INSERT INTO control.entity_operation (
    tenant_id, entity_name, permission_code,
    handler_type, handler_target, placement, surface,
    sort_order, label_override, icon_override, created_by)
  SELECT
    NULL, 'purchase_invoice', 'ap.promote_proforma',
    'MODAL', 'flow:promote_proforma', 'PRIMARY', 'DETAIL',
    100, 'Promote to Invoice', 'file-check', v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_operation
     WHERE entity_name = 'purchase_invoice'
       AND permission_code = 'ap.promote_proforma'
       AND tenant_id IS NULL);

  -- §O2 — promote_proforma modal flow (1 step)
  INSERT INTO control.entity_flow (
    tenant_id, entity_version_id, flow_code, label, description, icon_key,
    trigger_context, is_default, config, version_no, status, effective_from, created_by)
  SELECT
    NULL, v_ev_id, 'promote_proforma',
    'Promote Proforma Invoice',
    'Single-step modal to bind real invoice identity and transition from proforma to draft. '
    'Server handler: (1) validate from_state=proforma, (2) dedup probe, (3) update deferred fields, '
    '(4) lock FX + fiscal period, (5) advance lifecycle state to draft.',
    'file-check',
    'edit', false,
    jsonb_build_object(
      'layout', 'modal',
      'creates_with_status', 'draft',
      'dedup', jsonb_build_object(
        'enabled', true,
        'index',   'pi_supplier_invoice_dedup_idx'),
      'from_state_guard', 'proforma'),
    1, 'active', now(), v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_flow
     WHERE entity_version_id = v_ev_id
       AND flow_code = 'promote_proforma' AND tenant_id IS NULL AND version_no = 1);

  SELECT id INTO v_flow_id FROM control.entity_flow
   WHERE entity_version_id = v_ev_id
     AND flow_code = 'promote_proforma' AND tenant_id IS NULL AND version_no = 1;

  -- Step: bind_real_invoice
  INSERT INTO control.entity_flow_step
    (tenant_id, flow_id, step_key, label, icon_key, sort_order,
     advance_rule, layout_hint, created_by)
  VALUES
  (NULL, v_flow_id, 'bind_real_invoice',
   'Invoice Details', 'file-text', 10,
   '{"required_fields":["supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb,
   'single_column', v_su)
  ON CONFLICT (flow_id, step_key) DO NOTHING;

  UPDATE control.entity_flow_step
     SET advance_rule =
       '{"required_fields":["supplier_invoice_number","supplier_invoice_date","posting_date","received_date"]}'::jsonb
   WHERE flow_id = v_flow_id AND step_key = 'bind_real_invoice';

  SELECT id INTO v_step_1 FROM control.entity_flow_step
   WHERE flow_id = v_flow_id AND step_key = 'bind_real_invoice';

  DELETE FROM control.entity_flow_field
   WHERE flow_step_id = v_step_1 AND tenant_id IS NULL;

  -- Field bindings: the 4 required fields + conditional commitment_id
  -- posting_date and received_date drive FX lock and fiscal period determination.
  INSERT INTO control.entity_flow_field (
    tenant_id, flow_step_id, entity_field_id,
    mode, derivation_mode, visible_when, required_when,
    default_source, derive_expression, override_permission,
    summary_role, ui_variant, span, help_text, sort_order, created_by)
  SELECT NULL, v_step_1, ef.id,
         v.mode, v.derivation_mode,
         v.visible_when::jsonb, v.required_when::jsonb,
         v.default_source, v.derive_expression, v.override_permission,
         v.summary_role, v.ui_variant, v.span, v.help_text, v.sort_order, v_su
  FROM control.entity_field ef
  JOIN (VALUES
    ('supplier_invoice_number','required', 'manual',
      NULL::text, NULL::text, NULL, NULL, NULL,
      NULL, NULL, 2,
      'Real invoice number from the vendor''s document. Triggers duplicate detection.', 10),
    ('supplier_invoice_date', 'required',  'manual',
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, 1,
      'Real date on the vendor''s invoice.', 20),
    ('commitment_id',         'editable',  'manual',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      '{"in":[{"var":"invoice_source"},["po_based","contract_based"]]}',
      NULL, NULL, NULL,
      NULL, 'inline_search', 2,
      'Required for PO-based and contract-based invoices.', 30),
    ('posting_date',          'required',  'derived_overrideable',
      NULL, NULL, NULL, 'today()', 'ap.override_posting_date',
      NULL, NULL, 1,
      'GL posting date — drives fiscal year, period, and FX rate. Defaults to today.', 40),
    ('received_date',         'required',  'manual',
      NULL, NULL, 'today()', NULL, NULL,
      NULL, NULL, 1,
      'Date goods or services were received. Defaults to today.', 50)
  ) AS v(field_name, mode, derivation_mode, visible_when, required_when,
         default_source, derive_expression, override_permission,
         summary_role, ui_variant, span, help_text, sort_order)
     ON ef.name = v.field_name AND ef.entity_version_id = v_ev_id;

  RAISE NOTICE '019_promote_proforma_operation: operation and modal flow seeded, % field bindings',
    (SELECT count(*) FROM control.entity_flow_field WHERE flow_step_id = v_step_1 AND tenant_id IS NULL);
END $$;
