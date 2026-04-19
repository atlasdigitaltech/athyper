-- 900_seed_data/002_control/008_upupr_lifecycle.sql
-- Purpose: control.lifecycle + 8 states + 10 transitions + entity_lifecycle binding
-- Depends on: 007_upupr_entity_registration.sql
-- Idempotent: yes — ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map
BEGIN

-- 1. control.lifecycle
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'upupr', 'User Profile Update Request', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"user-pen","ui_color":"#0F6CBD","entity_types":["user_profile_update_request"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'upupr';

-- 2. control.lifecycle_state (8 states)
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',                        true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'submitted',           'Submitted',                   false, false, 20, '{"ui_color":"#0F6CBD","icon_key":"send"}'::jsonb,                                                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'awaiting_approval',   'Awaiting Supervisor Approval', false, false, 30, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880,"timer_policy_code":"upupr_approval_sla"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revision_requested',  'Revision Requested',          false, false, 40, '{"ui_color":"#E8A020","icon_key":"refresh"}'::jsonb,                                                           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',            'Approved',                    false, false, 50, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'provisioned',         'Provisioned',                 false, true,  60, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',            'Rejected',                    false, true,  70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                                          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',           'Cancelled',                   false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                                               '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- 3. control.lifecycle_transition (10 edges)
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'awaiting_approval')::uuid,  'assign',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'approved')::uuid,           'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'rejected')::uuid,           'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'revision_requested')::uuid, 'return',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'provisioned')::uuid,        'provision', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- 4. control.entity_lifecycle binding
INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('user_profile_update_request', v_lc_id, NULL, NULL, 100,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

END $$;
