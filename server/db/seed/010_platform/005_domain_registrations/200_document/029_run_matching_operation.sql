-- =============================================================================
-- 010_platform/005_domain_registrations/200_document/029_run_matching_operation.sql
--
-- Registers the 'run_matching' operation for purchase_invoice:
--   - shared.permission:      ap.run_matching
--   - control.entity_operation: DETAIL surface, API handler → flow:run_matching
--
-- Non-PO invoices: matching is auto-triggered during submit (match_status → 'unmatched').
-- PO-based invoices: matching runs at post time; this operation allows manual re-runs
-- from the detail view (e.g. after updating line links or resolving exceptions).
--
-- Idempotent: WHERE NOT EXISTS guards on both permission and entity_operation.
-- Depends on: 001_invoice.sql, 020_ap_flow_permissions.sql
-- =============================================================================

DO $$
DECLARE
  v_su  CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  v_fin uuid;
BEGIN
  -- ── 1. Permission ───────────────────────────────────────────────────────────
  SELECT id INTO v_fin
    FROM shared.permission_category
   WHERE code = 'finance';

  IF v_fin IS NULL THEN
    RAISE NOTICE '029_run_matching_operation: finance category not found — skipping';
    RETURN;
  END IF;

  INSERT INTO shared.permission
         (code, name, category_id, scope_type, risk_level,
          sort_order, metadata, status, created_by)
  SELECT 'ap.run_matching',
         'Run Invoice Matching',
         v_fin,
         'record',
         'low',
         780,
         jsonb_build_object(
           'module',      'finance',
           'area',        'ap',
           'description', 'Manually trigger three-way / two-way / no-match matching on an AP invoice. Auto-runs during post for PO-based and during submit for non-PO invoices.'
         ),
         'active',
         v_su
  WHERE NOT EXISTS (
      SELECT 1 FROM shared.permission WHERE code = 'ap.run_matching');

  -- ── 2. entity_operation ─────────────────────────────────────────────────────
  INSERT INTO control.entity_operation (
    tenant_id, entity_name, permission_code,
    handler_type, handler_target, placement, surface,
    is_record_required, sort_order,
    label_override, icon_override, created_by)
  SELECT
    NULL, 'purchase_invoice', 'ap.run_matching',
    'API', 'flow:run_matching', 'TOOLBAR', 'DETAIL',
    true, 150,
    'Run Matching', 'git-compare', v_su
  WHERE NOT EXISTS (
    SELECT 1 FROM control.entity_operation
     WHERE entity_name     = 'purchase_invoice'
       AND permission_code = 'ap.run_matching'
       AND tenant_id IS NULL);

  RAISE NOTICE '029_run_matching_operation: permission and entity_operation seeded';
END $$;
