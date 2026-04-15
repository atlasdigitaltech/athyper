-- 010_lifecycles/015_lc_project.sql
-- Lifecycle: lc_project
-- Used by: master.project

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_project', 'Project', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"folder-kanban","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_project' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',     'Draft',     true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"play-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'on_hold',   'On Hold',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"pause-circle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'completed', 'Completed', false, true,  40,
     '{"ui_color":"#0F6CBD","icon_key":"check-circle-2","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled', 'Cancelled', false, true,  50,
     '{"ui_color":"#C00000","icon_key":"x-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,   (v_s->>'active')::uuid,    'activate',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'on_hold')::uuid,   'pause',     true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'active')::uuid,    'resume',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'completed')::uuid, 'complete',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'cancelled')::uuid, 'cancel',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'on_hold')::uuid, (v_s->>'cancelled')::uuid, 'cancel',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
