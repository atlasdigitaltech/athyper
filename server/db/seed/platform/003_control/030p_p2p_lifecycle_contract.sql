-- P2P lifecycles (PR / POC / DN / Receipt / SES). PI + PO (commitment) live in 030_control_lifecycle_contract.sql;
-- this cluster sits next to its hook contract in 072p_p2p_runtime_contract.sql Â§6.
-- Also writes: control.lifecycle_state, control.lifecycle_transition (per DO block, in-scope).

-- ## purchase_requisition
-- rejected is re-draftable; cancelled is terminal.
DO $$ DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_requisition', 'Purchase Requisition Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"clipboard-list","ui_color":"#2563EB","entity_types":["purchase_requisition"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_requisition' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',                'Draft',                true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',     'Pending Approval',     false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',             'Approved',             false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',             'Rejected',             false, false, 35, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_converted',  'Partially Converted',  false, false, 40, '{"ui_color":"#E8A020","icon_key":"split"}'::jsonb,                               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_converted',      'Fully Converted',      false, false, 50, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',               'Closed',               false, true,  60, '{"ui_color":"#217346","icon_key":"lock"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',            'Cancelled',            false, true,  70, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Authoring
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'pending_approval')::uuid,    'submit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'cancelled')::uuid,           'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Approval
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'approved')::uuid,            'approve', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'rejected')::uuid,            'deny',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,    (v_s->>'draft')::uuid,               'amend',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,            (v_s->>'draft')::uuid,               'amend',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Conversion to PO
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'partially_converted')::uuid, 'convert', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_converted')::uuid, (v_s->>'fully_converted')::uuid,     'convert', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Close paths
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'closed')::uuid,              'close',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_converted')::uuid, (v_s->>'closed')::uuid,              'close',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'fully_converted')::uuid,     (v_s->>'closed')::uuid,              'close',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Cancel paths
    (v_lc_id, NULL, (v_s->>'approved')::uuid,            (v_s->>'cancelled')::uuid,           'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_converted')::uuid, (v_s->>'cancelled')::uuid,           'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## purchase_order_confirmation
-- Supplier artifact: buyer accepts/rejects supplier changes, no internal approval.
-- receivedâ†’confirmed is auto when within tolerance.
DO $$ DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'purchase_order_confirmation', 'PO Confirmation Lifecycle', 1, true,
    '{"initial_state_code":"received","allow_parallel_instances":false,"icon_key":"badge-check","ui_color":"#0EA5E9","entity_types":["purchase_order_confirmation"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'purchase_order_confirmation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'received',          'Received',           true,  false, 10, '{"ui_color":"#0EA5E9","icon_key":"inbox"}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'confirmed',         'Confirmed',          false, true,  20, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'changes_proposed',  'Changes Proposed',   false, false, 30, '{"ui_color":"#E8A020","icon_key":"edit-3","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'changes_accepted',  'Changes Accepted',   false, true,  40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'changes_rejected',  'Changes Rejected',   false, false, 50, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',          'Rejected',           false, true,  60, '{"ui_color":"#991B1B","icon_key":"slash"}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',         'Cancelled',          false, true,  70, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Supplier-driven flow
    (v_lc_id, NULL, (v_s->>'received')::uuid,         (v_s->>'confirmed')::uuid,        'confirm',         true, '{"require_comment":false,"auto_if_within_tolerance":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'received')::uuid,         (v_s->>'changes_proposed')::uuid, 'propose_changes', true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'received')::uuid,         (v_s->>'rejected')::uuid,         'reject',          true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000'),
    -- Buyer adjudication on proposed changes
    (v_lc_id, NULL, (v_s->>'changes_proposed')::uuid, (v_s->>'changes_accepted')::uuid, 'accept_changes',  true, '{"require_comment":false}'::jsonb,                                 '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'changes_proposed')::uuid, (v_s->>'changes_rejected')::uuid, 'reject_changes',  true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000'),
    -- Recovery from changes_rejected: supplier can repropose
    (v_lc_id, NULL, (v_s->>'changes_rejected')::uuid, (v_s->>'changes_proposed')::uuid, 'propose_changes', true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'changes_rejected')::uuid, (v_s->>'cancelled')::uuid,        'cancel',          true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000'),
    -- Cancellation
    (v_lc_id, NULL, (v_s->>'received')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',          true, '{"require_comment":true}'::jsonb,                                  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## delivery_note
-- Logistics artifact (not approvable); arrival drives receipt creation.
DO $$ DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'delivery_note', 'Delivery Note Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"truck","ui_color":"#0F766E","entity_types":["delivery_note"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'delivery_note' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',                'Draft',                true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'in_transit',           'In Transit',           false, false, 20, '{"ui_color":"#0EA5E9","icon_key":"truck","sla_minutes":4320}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'arrived',              'Arrived',              false, false, 30, '{"ui_color":"#0F766E","icon_key":"map-pin"}'::jsonb,                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'partially_receipted',  'Partially Receipted',  false, false, 40, '{"ui_color":"#E8A020","icon_key":"package-open"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'fully_receipted',      'Fully Receipted',      false, true,  50, '{"ui_color":"#217346","icon_key":"package-check"}'::jsonb,                       '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'returned',             'Returned',             false, true,  60, '{"ui_color":"#B45309","icon_key":"corner-up-left"}'::jsonb,                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',            'Cancelled',            false, true,  70, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Logistics flow
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'in_transit')::uuid,          'dispatch',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_transit')::uuid,          (v_s->>'arrived')::uuid,             'mark_arrived', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Receipting (driven by receipt postings)
    (v_lc_id, NULL, (v_s->>'arrived')::uuid,             (v_s->>'partially_receipted')::uuid, 'receipt',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_receipted')::uuid, (v_s->>'fully_receipted')::uuid,     'receipt',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'arrived')::uuid,             (v_s->>'fully_receipted')::uuid,     'receipt',      true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- Returns
    (v_lc_id, NULL, (v_s->>'arrived')::uuid,             (v_s->>'returned')::uuid,            'return',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'partially_receipted')::uuid, (v_s->>'returned')::uuid,            'return',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Cancellation (only before arrival)
    (v_lc_id, NULL, (v_s->>'draft')::uuid,               (v_s->>'cancelled')::uuid,           'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_transit')::uuid,          (v_s->>'cancelled')::uuid,           'cancel',       true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## receipt
-- Approvable. post triggers inventory_movement + GR/IR accrual JE + commitment_fulfillment.
DO $$ DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'receipt', 'Receipt Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"package-check","ui_color":"#16A34A","entity_types":["receipt"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'receipt' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',             'Draft',             true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',  'Pending Approval',  false, false, 20, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',          'Approved',          false, false, 30, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',            'Posted',            false, false, 40, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',          'Reversed',          false, true,  60, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',         'Cancelled',         false, true,  70, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Authoring + approval
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'pending_approval')::uuid, 'submit',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'cancelled')::uuid,        'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'draft')::uuid,            'amend',   true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'cancelled')::uuid,        'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Posting (triggers JE + inventory + commitment_fulfillment hooks)
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'cancelled')::uuid,        'cancel',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Reversal (compensating JE)
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse', true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;


-- ## service_sheet
-- Two-step approval: ownerâ†’requester accept, then finance approve.
-- post triggers accrual JE (Dr Expense / Cr SES Clearing) + commitment_fulfillment.
DO $$ DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'service_sheet', 'Service Sheet Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"file-check","ui_color":"#0F766E","entity_types":["service_sheet"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'service_sheet' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',               'Draft',               true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_acceptance',  'Pending Acceptance',  false, false, 20, '{"ui_color":"#0EA5E9","icon_key":"user-check","sla_minutes":2880}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'accepted',            'Accepted',            false, false, 30, '{"ui_color":"#0F766E","icon_key":"check"}'::jsonb,                                '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval',    'Pending Approval',    false, false, 40, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',            'Approved',            false, false, 50, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',              'Posted',              false, false, 60, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                        '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',            'Reversed',            false, true,  70, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,                         '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',           'Cancelled',           false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                 '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    -- Step 1: submit for acceptance (project owner â†’ requester)
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'pending_acceptance')::uuid, 'submit_for_acceptance', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'cancelled')::uuid,          'cancel',                true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_acceptance')::uuid, (v_s->>'accepted')::uuid,           'accept',                true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_acceptance')::uuid, (v_s->>'draft')::uuid,              'reject_acceptance',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Step 2: submit for finance approval (requester â†’ finance)
    (v_lc_id, NULL, (v_s->>'accepted')::uuid,           (v_s->>'pending_approval')::uuid,   'submit',                true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'approved')::uuid,           'approve',               true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'draft')::uuid,              'amend',                 true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid,   (v_s->>'cancelled')::uuid,          'cancel',                true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    -- Posting + reversal
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'posted')::uuid,             'post',                  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'cancelled')::uuid,          'cancel',                true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,             (v_s->>'reversed')::uuid,           'reverse',               true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;

