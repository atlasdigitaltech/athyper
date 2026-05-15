-- 100_finance/200_document/005_purchase_order_lifecycle.sql
-- Purpose: control.lifecycle + 9 states + transitions + entity_lifecycle binding
--          for Purchase Order (document.purchase_order)
-- Depends on: 004_purchase_order.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_order', 'Purchase Order Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"shopping-cart","ui_color":"#EA580C","entity_types":["purchase_order"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_order' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (9 states) ────────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',              true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',   'Pending Approval',   false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',           'Approved',           false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'sent_to_supplier',    'Sent to Supplier',   false, false, 40, '{"ui_color":"#0891B2","icon_key":"send"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_received', 'Partially Received', false, false, 50, '{"ui_color":"#E8A020","icon_key":"package-open"}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_received',     'Fully Received',     false, false, 60, '{"ui_color":"#217346","icon_key":"package-check"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',            'On Hold',            false, false, 65, '{"ui_color":"#D97706","icon_key":"pause-circle","projects_from":"commitment.status=suspended"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',             'Closed',             false, true,  70, '{"ui_color":"#217346","icon_key":"lock"}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',           'Rejected',           false, true,  80, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',          'Cancelled',          false, true,  90, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,           '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'pending_approval')::uuid,   'submit',       true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'approved')::uuid,           'approve',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'rejected')::uuid,           'deny',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'sent_to_supplier')::uuid,   'send',         true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'sent_to_supplier')::uuid,     (v_s->>'partially_received')::uuid, 'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'fully_received')::uuid,     'receive',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'fully_received')::uuid,     (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,           (v_s->>'draft')::uuid,              'amend',        true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Hold transitions (approved/sent_to_supplier/partially_received -> on_hold; on_hold -> sent_to_supplier; on_hold -> cancelled/closed)
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'sent_to_supplier')::uuid,     (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_received')::uuid, (v_s->>'on_hold')::uuid,            'hold',         true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'sent_to_supplier')::uuid,     'release_hold', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'cancelled')::uuid,          'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid,            (v_s->>'closed')::uuid,             'close',        true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('purchase_order', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

END $$;
