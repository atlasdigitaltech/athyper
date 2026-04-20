-- ============================================================================
-- FILE: blueprint/090_entity_operations_delta.sql
-- Purpose: Add Non-PO-specific operations not in base seed
-- Depends on: control.entity_operation (base pack), purchase_invoice +
--             payment_entry entities already registered
-- Idempotent: ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING
-- ============================================================================
-- Base pack already seeds these operations:
--   purchase_invoice: create, update, submit, approve, deny, post, cancel,
--                     reverse, copy, export
--   payment_entry:    create, update, submit, approve, deny, post, void,
--                     reverse, cancel, copy, export
--
-- This file ADDS the following missing Non-PO-specific operations:
--
-- purchase_invoice:
--   hold                 — put invoice on payment hold
--   release_hold         — release payment hold
--   propose_payment      — navigate to payment_entry/new pre-filled with invoice
--   view_je              — navigate to source journal entry
--   match_advance        — manually match existing vendor advance to invoice
--   allocate_payment     — manual allocation UI for partial payments
--
-- payment_entry:
--   transmit             — send to bank interface / PAYG provider
--   print                — generate remittance advice PDF (already exists)
--   mark_cleared         — user-driven clearance (before auto bank matching)
--   allocate             — manual allocation to invoice(s)
--   unallocate           — break an existing allocation
-- ============================================================================

-- ── Step 1: Ensure permission codes exist in shared.permission ───────────────
-- entity_operation has FK (permission_code) → shared.permission(code).
-- Insert any missing codes; existing ones are skipped via ON CONFLICT DO NOTHING.
DO $$
DECLARE
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';
    v_fin  uuid;
    v_util uuid;
BEGIN
    SELECT id INTO v_fin  FROM shared.permission_category WHERE code = 'finance';
    SELECT id INTO v_util FROM shared.permission_category WHERE code = 'utility';

    INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, created_by)
    VALUES
        ('hold',             'Hold',             v_fin,  'record', 'low',    v_sys),
        ('release_hold',     'Release Hold',     v_fin,  'record', 'low',    v_sys),
        ('propose_payment',  'Propose Payment',  v_fin,  'record', 'low',    v_sys),
        ('view_je',          'View Journal Entry', v_util,'record', 'low',   v_sys),
        ('match_advance',    'Match Advance',    v_fin,  'record', 'medium', v_sys),
        ('allocate_payment', 'Allocate Payment', v_fin,  'record', 'medium', v_sys),
        ('transmit',         'Transmit',         v_fin,  'record', 'medium', v_sys),
        ('mark_cleared',     'Mark Cleared',     v_fin,  'record', 'medium', v_sys),
        ('allocate',         'Allocate',         v_fin,  'record', 'medium', v_sys),
        ('unallocate',       'Unallocate',       v_fin,  'record', 'medium', v_sys)
    ON CONFLICT (code) DO NOTHING;
END $$;

-- ── Step 1b: Fix already-seeded NAVIGATE handler_targets (idempotent) ────────
UPDATE control.entity_operation
SET handler_target = CASE
    WHEN permission_code = 'propose_payment' THEN '/app/payment-entry/new?invoice={id}'
    WHEN permission_code = 'view_je'         THEN '/app/journal-entry?source_id={id}'
END
WHERE tenant_id IS NULL
  AND entity_name = 'purchase_invoice'
  AND permission_code IN ('propose_payment','view_je')
  AND handler_type = 'NAVIGATE'
  AND handler_target LIKE '/document/%';

-- ── Step 2: Insert entity operations ─────────────────────────────────────────

INSERT INTO control.entity_operation
    (tenant_id, entity_name, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
VALUES
    -- ── purchase_invoice ────────────────────────────────────────────────────
    (NULL, 'purchase_invoice', 'hold',
     'DETAIL', 'OVERFLOW', 'MODAL', 'put_on_hold',
     true, 110, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_invoice', 'release_hold',
     'DETAIL', 'OVERFLOW', 'MODAL', 'release_hold',
     true, 120, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_invoice', 'propose_payment',
     'DETAIL', 'TOOLBAR', 'NAVIGATE', '/app/payment-entry/new?invoice={id}',
     true, 130, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_invoice', 'view_je',
     'DETAIL', 'OVERFLOW', 'NAVIGATE', '/app/journal-entry?source_id={id}',
     true, 140, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_invoice', 'match_advance',
     'DETAIL', 'OVERFLOW', 'MODAL', 'match_vendor_advance',
     true, 150, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'purchase_invoice', 'allocate_payment',
     'DETAIL', 'OVERFLOW', 'MODAL', 'allocate_payment',
     true, 160, '00000000-0000-0000-0000-000000000000'),

    -- ── payment_entry ───────────────────────────────────────────────────────
    (NULL, 'payment_entry', 'transmit',
     'DETAIL', 'TOOLBAR', 'MODAL', 'transmit_to_bank',
     true, 120, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'payment_entry', 'print',
     'DETAIL', 'OVERFLOW', 'API', 'print_remittance',
     true, 130, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'payment_entry', 'mark_cleared',
     'DETAIL', 'TOOLBAR', 'MODAL', 'mark_bank_cleared',
     true, 140, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'payment_entry', 'allocate',
     'DETAIL', 'PRIMARY', 'MODAL', 'allocate_to_invoice',
     true, 150, '00000000-0000-0000-0000-000000000000'),

    (NULL, 'payment_entry', 'unallocate',
     'DETAIL', 'OVERFLOW', 'MODAL', 'unallocate',
     true, 160, '00000000-0000-0000-0000-000000000000')

ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;
