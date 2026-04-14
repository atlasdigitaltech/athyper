-- 100_finance/200_document/011_payment_entry_lifecycle.sql
-- Purpose: control.lifecycle + states + transitions + entity_lifecycle binding
--          for Payment Entry (document.payment_entry)
-- Depends on: 010_payment_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map  { state_code: uuid }
BEGIN

-- ── 1. control.lifecycle ─────────────────────────────────────────────────────
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'payment_entry', 'Payment Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"banknote","ui_color":"#059669","entity_types":["payment_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'payment_entry' AND tenant_id IS NULL;

-- ── 2. control.lifecycle_state (11 states) ───────────────────────────────────
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',            true,  false,  10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval', false, false,  20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',         false, false,  30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',           false, false,  40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'transmitted',      'Transmitted',      false, false,  50, '{"ui_color":"#0284C7","icon_key":"send"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'printed',          'Printed',          false, false,  60, '{"ui_color":"#0284C7","icon_key":"printer"}'::jsonb,                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cleared',          'Cleared',          false, true,   70, '{"ui_color":"#217346","icon_key":"circle-check"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',         false, true,   80, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'voided',           'Voided',           false, true,   90, '{"ui_color":"#6B7280","icon_key":"slash"}'::jsonb,                               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',        'Cancelled',        false, true,  100, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',         false, true,  110, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                            '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- ── 3. control.lifecycle_transition ──────────────────────────────────────────
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Submission flow
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Approval flow
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Posting
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Post-posting
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'transmitted')::uuid,      'transmit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'printed')::uuid,          'print',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'voided')::uuid,           'void',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Clearance
    (v_lc_id, NULL, (v_s->>'transmitted')::uuid,      (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'printed')::uuid,          (v_s->>'cleared')::uuid,          'clear',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Re-draft from rejected
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'draft')::uuid,            'amend',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- ── 4. control.entity_lifecycle binding ──────────────────────────────────────
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('payment_entry', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, entity_name, lifecycle_id) DO NOTHING;

END $$;
