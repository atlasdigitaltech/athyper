-- 010_lifecycles/017_lc_budget_profile.sql
-- Lifecycle: lc_budget_profile
-- Used by: master.budget_profile

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_budget_profile', 'Budget Profile', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"pie-chart","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_budget_profile' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',    'Draft',    true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved', 'Approved', false, false, 20,
     '{"ui_color":"#0F6CBD","icon_key":"check","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',   'Active',   false, false, 30,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',   'Closed',   false, false, 40,
     '{"ui_color":"#555555","icon_key":"lock","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  50,
     '{"ui_color":"#333333","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,    (v_s->>'approved')::uuid, 'approve',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid, (v_s->>'active')::uuid,   'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'closed')::uuid,   'close',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'active')::uuid,   'reopen',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'closed')::uuid,   (v_s->>'archived')::uuid, 'archive',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
