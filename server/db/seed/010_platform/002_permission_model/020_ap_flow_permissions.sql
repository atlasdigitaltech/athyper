-- =============================================================================
-- 010_platform/002_permission_model/020_ap_flow_permissions.sql
--
-- New AP permissions for the flow engine: tax mode override + proforma promotion.
-- Extends 015_ap_override_permissions.sql (sort_orders 610–750).
--
-- Permissions added:
--   ap.override_tax_mode  (sort_order 760, risk_level medium)
--   ap.promote_proforma   (sort_order 770, risk_level medium)
--
-- Idempotent: WHERE NOT EXISTS guard prevents duplicate rows.
-- Run order: after 015_ap_override_permissions.sql.
-- =============================================================================

DO $$
DECLARE
  v_su  CONSTANT uuid := '00000000-0000-0000-0000-000000000000';
  v_fin uuid;
BEGIN
  SELECT id INTO v_fin
    FROM shared.permission_category
   WHERE code = 'finance';

  IF v_fin IS NULL THEN
    RAISE NOTICE '020_ap_flow_permissions: finance category not found — skipping';
    RETURN;
  END IF;

  INSERT INTO shared.permission
         (code, name, category_id, scope_type, risk_level,
          sort_order, metadata, status, created_by)
  SELECT v.code,
         v.name,
         v_fin,
         'record',
         'medium',
         v.sort_order,
         jsonb_build_object(
           'module',      'finance',
           'area',        'ap',
           'description', v.description
         ),
         'active',
         v_su
  FROM (VALUES
    ('ap.override_tax_mode',
     'Override Invoice Tax Mode',
     760,
     'Override the system-inferred tax mode (inclusive/exclusive/no_tax) on an AP invoice.'),
    ('ap.promote_proforma',
     'Promote Proforma Invoice to Draft',
     770,
     'Convert a proforma (preview) invoice to a real draft: runs dedup, locks FX rate and fiscal period, triggers AP workflow.')
  ) AS v(code, name, sort_order, description)
  WHERE NOT EXISTS (
      SELECT 1 FROM shared.permission WHERE code = v.code);

  RAISE NOTICE '020_ap_flow_permissions: % permissions seeded',
    (SELECT count(*) FROM shared.permission
      WHERE code IN ('ap.override_tax_mode', 'ap.promote_proforma'));
END $$;
