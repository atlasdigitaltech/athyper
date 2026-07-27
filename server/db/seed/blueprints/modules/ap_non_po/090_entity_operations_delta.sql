-- Non-PO-specific entity_operation deltas on top of base seed.
-- Base seed already covers create/update/submit/approve/deny/post/cancel/reverse/copy/export
-- for purchase_invoice + payment_entry; this file adds 11 Non-PO ops
-- (hold/release_hold/propose_payment/view_je/match_advance/allocate_payment
-- for purchase_invoice; transmit/print/mark_cleared/allocate/unallocate for payment_entry).
-- entity_operation.permission_code FKs into shared.permission(code) — we insert any
-- missing codes first so the binding inserts don't fail.
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

-- Repair already-seeded NAVIGATE handler_targets if a prior version of this
-- file landed them with stale routes (idempotent rewrite).
UPDATE control.entity_operation
SET handler_target = CASE
    WHEN permission_code = 'propose_payment' THEN '/app/payment_entry/new?invoice={id}'
    WHEN permission_code = 'view_je'         THEN '/app/journal_entry?source_id={id}'
END
WHERE tenant_id IS NULL
  AND entity_name = 'purchase_invoice'
  AND permission_code IN ('propose_payment','view_je')
  AND handler_type = 'NAVIGATE';

INSERT INTO control.entity_operation
    (tenant_id, entity_name, entity_version_id, permission_code, surface, placement,
     handler_type, handler_target, is_record_required, sort_order, created_by)
SELECT
    v.tenant_id,
    v.entity_name,
    ev.id,
    v.permission_code,
    v.surface,
    v.placement,
    v.handler_type,
    v.handler_target,
    v.is_record_required,
    v.sort_order,
    v.created_by::uuid
FROM (VALUES
    (NULL::uuid, 'purchase_invoice', 'hold',
     'DETAIL', 'OVERFLOW', 'MODAL', 'put_on_hold',
     true, 110, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'purchase_invoice', 'release_hold',
     'DETAIL', 'OVERFLOW', 'MODAL', 'release_hold',
     true, 120, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'purchase_invoice', 'propose_payment',
     'DETAIL', 'TOOLBAR', 'NAVIGATE', '/app/payment_entry/new?invoice={id}',
     true, 130, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'purchase_invoice', 'view_je',
     'DETAIL', 'OVERFLOW', 'NAVIGATE', '/app/journal_entry?source_id={id}',
     true, 140, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'purchase_invoice', 'match_advance',
     'DETAIL', 'OVERFLOW', 'MODAL', 'match_supplier_advance',
     true, 150, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'purchase_invoice', 'allocate_payment',
     'DETAIL', 'OVERFLOW', 'MODAL', 'allocate_payment',
     true, 160, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'payment_entry', 'transmit',
     'DETAIL', 'TOOLBAR', 'MODAL', 'transmit_to_bank',
     true, 120, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'payment_entry', 'print',
     'DETAIL', 'OVERFLOW', 'API', 'print_remittance',
     true, 130, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'payment_entry', 'mark_cleared',
     'DETAIL', 'TOOLBAR', 'MODAL', 'mark_bank_cleared',
     true, 140, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'payment_entry', 'allocate',
     'DETAIL', 'PRIMARY', 'MODAL', 'allocate_to_invoice',
     true, 150, '00000000-0000-0000-0000-000000000000'),

    (NULL::uuid, 'payment_entry', 'unallocate',
     'DETAIL', 'OVERFLOW', 'MODAL', 'unallocate',
     true, 160, '00000000-0000-0000-0000-000000000000')
) AS v(tenant_id, entity_name, permission_code, surface, placement,
       handler_type, handler_target, is_record_required, sort_order, created_by)
JOIN control.entity e
  ON e.tenant_id IS NULL
 AND e.entity_code = v.entity_name
JOIN control.entity_version ev
  ON ev.entity_id = e.id
 AND ev.tenant_id IS NULL
 AND ev.status = 'EFFECTIVE'
ON CONFLICT (tenant_id, entity_version_id, permission_code)
    WHERE entity_version_id IS NOT NULL DO NOTHING;
