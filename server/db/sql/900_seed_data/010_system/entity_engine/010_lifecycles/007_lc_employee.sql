-- 010_lifecycles/007_lc_employee.sql
-- Lifecycle: lc_employee — employee onboarding through termination
-- Used by: master.employee

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_employee', 'Employee', 1, true,
    '{"initial_state_code":"onboarding","allow_parallel_instances":false,
      "icon_key":"user-check","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_employee' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'onboarding', 'Onboarding', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"user-plus","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',     'Active',     false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_leave',   'On Leave',   false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"calendar-off","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',  'Suspended',  false, false, 40,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'terminated', 'Terminated', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"user-x","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'onboarding')::uuid, (v_s->>'active')::uuid,     'activate',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'on_leave')::uuid,   'go_on_leave',      true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_leave')::uuid,   (v_s->>'active')::uuid,     'return_from_leave',true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'suspended')::uuid,  'suspend',          true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'active')::uuid,     'reactivate',       true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,     (v_s->>'terminated')::uuid, 'terminate',        true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,  (v_s->>'terminated')::uuid, 'terminate',        true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
