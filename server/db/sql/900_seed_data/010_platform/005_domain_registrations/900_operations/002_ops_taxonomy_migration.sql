-- 900_operations/002_ops_taxonomy_migration.sql
-- Purpose: Migrate control.entity_operation permission_code values to the
--          locked operation taxonomy (April 2026).
--
-- Renames applied:
--   Edit mode:   update  → edit              (all 84 platform entity ops)
--   Documents:   cancel  → cancel_document   |  deny    → reject
--                reverse → reverse_document   |  void    → void_document
--   Supplier:    cancel  → deactivate_supplier |  close   → archive_supplier
--                reopen  → reactivate_supplier
--   New inserts: block_supplier, unblock_supplier
--   New perms:   edit, exit  (added to shared.permission; exit is UI-only,
--                             no entity_operation rows needed)
--
-- NOTE: cancel ops (47 rows: deactivate/revoke/block/unpublish/archive targets)
--   are lifecycle actions — they are NOT renamed to 'exit'.
--   'exit' = leave edit mode (frontend state, no DB row required).
--
-- NOTE: handler_target is intentionally NOT changed.
--   handler_target dispatches to control.lifecycle_transition.operation_code
--   ('cancel', 'deny', 'reverse', 'block', 'unblock', etc.) which are separate
--   from permission_code and must stay in sync with the lifecycle engine.
--
-- Depends on: 001_fin_operations.sql
--             004_entity_engine/060_entity_operations/003_ops_coa_partners.sql
--             002_permission_model/015_permission_category.sql
-- Idempotent: yes — UPDATEs guarded by NOT EXISTS; INSERTs ON CONFLICT DO NOTHING

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_wfl uuid;
    v_fin uuid;
    v_rows int;
BEGIN

SELECT id INTO v_wfl FROM shared.permission_category WHERE code = 'workflow';
SELECT id INTO v_fin  FROM shared.permission_category WHERE code = 'finance';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Ensure new permission codes exist in shared.permission
-- ══════════════════════════════════════════════════════════════════════════════

-- Edit-mode permissions (entity category, low risk, no plan restriction)
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
SELECT v.code, v.name, c.id, 'record', 'low', false, v.so, v_su
FROM shared.permission_category c
JOIN (VALUES
    ('edit', 'Edit', 'entity', 30),
    ('exit', 'Exit', 'entity', 35)
) AS v(code, name, cat, so) ON c.code = v.cat
ON CONFLICT (code) DO NOTHING;

-- Document lifecycle permissions
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
VALUES
    ('cancel_document',  'Cancel Document',  v_wfl, 'record', 'high',     false, 96,  v_su),
    ('reject',           'Reject',           v_wfl, 'record', 'medium',   false, 91,  v_su),
    ('void_document',    'Void Document',    v_fin, 'record', 'high',     false, 25,  v_su),
    ('reverse_document', 'Reverse Document', v_fin, 'record', 'critical', true,  27,  v_su)
ON CONFLICT (code) DO NOTHING;

-- Supplier lifecycle permissions
INSERT INTO shared.permission
    (code, name, category_id, scope_type, risk_level, is_plan_restricted, sort_order, created_by)
VALUES
    ('block_supplier',      'Block Supplier',      v_wfl, 'record', 'high',   false, 201, v_su),
    ('unblock_supplier',    'Unblock Supplier',    v_wfl, 'record', 'medium', false, 202, v_su),
    ('deactivate_supplier', 'Deactivate Supplier', v_wfl, 'record', 'medium', false, 203, v_su),
    ('reactivate_supplier', 'Reactivate Supplier', v_wfl, 'record', 'medium', false, 204, v_su),
    ('archive_supplier',    'Archive Supplier',    v_wfl, 'record', 'high',   false, 205, v_su)
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2a. Edit-mode: rename update → edit across all platform entity operations
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = 'edit'
WHERE  tenant_id IS NULL
  AND  permission_code = 'update'
  AND  NOT EXISTS (
       SELECT 1 FROM control.entity_operation x
       WHERE  x.tenant_id IS NULL
         AND  x.entity_name     = eo.entity_name
         AND  x.permission_code = 'edit'
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'update → edit renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2c. Document operations — rename permission_code to taxonomy codes
--
-- Guard: skip any row where the target code already exists on that entity
-- (makes every UPDATE a no-op on re-run once the rename has landed).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = r.new_code
FROM (VALUES
    ('purchase_invoice', 'cancel',  'cancel_document'),
    ('purchase_invoice', 'deny',    'reject'),
    ('purchase_invoice', 'reverse', 'reverse_document'),
    ('purchase_order',   'cancel',  'cancel_document'),
    ('purchase_order',   'deny',    'reject'),
    ('journal_entry',    'deny',    'reject'),
    ('journal_entry',    'reverse', 'reverse_document'),
    ('payment_entry',    'cancel',  'cancel_document'),
    ('payment_entry',    'deny',    'reject'),
    ('payment_entry',    'void',    'void_document'),
    ('payment_entry',    'reverse', 'reverse_document')
) AS r(entity_name, old_code, new_code)
WHERE eo.tenant_id IS NULL
  AND eo.entity_name     = r.entity_name
  AND eo.permission_code = r.old_code
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_operation x
      WHERE x.tenant_id IS NULL
        AND x.entity_name     = r.entity_name
        AND x.permission_code = r.new_code
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'Document ops renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2d. Supplier lifecycle operations — rename permission_code to taxonomy codes
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE control.entity_operation AS eo
SET    permission_code = r.new_code
FROM (VALUES
    ('supplier', 'cancel', 'deactivate_supplier'),
    ('supplier', 'close',  'archive_supplier'),
    ('supplier', 'reopen', 'reactivate_supplier')
) AS r(entity_name, old_code, new_code)
WHERE eo.tenant_id IS NULL
  AND eo.entity_name     = r.entity_name
  AND eo.permission_code = r.old_code
  AND NOT EXISTS (
      SELECT 1 FROM control.entity_operation x
      WHERE x.tenant_id IS NULL
        AND x.entity_name     = r.entity_name
        AND x.permission_code = r.new_code
  );

GET DIAGNOSTICS v_rows = ROW_COUNT;
RAISE NOTICE 'Supplier ops renamed: % rows', v_rows;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Insert new supplier operations: block_supplier / unblock_supplier
--
-- Sort orders slot between deactivate_supplier (30) and archive_supplier (40).
-- handler_target maps to control.lifecycle_transition.operation_code:
--   'block'   → active → blocked  (seeded in 002_vendor_lifecycle.sql)
--   'unblock' → blocked → active  (seeded in 002_vendor_lifecycle.sql)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    (NULL, 'supplier', 'block_supplier',   'DETAIL', 'OVERFLOW', 'MODAL', 'block',   true, 32, v_su),
    (NULL, 'supplier', 'unblock_supplier', 'DETAIL', 'OVERFLOW', 'MODAL', 'unblock', true, 34, v_su)
ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

RAISE NOTICE 'Taxonomy migration complete. Platform entity_operation total: %',
    (SELECT count(*) FROM control.entity_operation WHERE tenant_id IS NULL);

END $$;
