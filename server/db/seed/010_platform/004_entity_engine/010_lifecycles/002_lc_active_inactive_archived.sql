-- 010_lifecycles/002_lc_active_inactive_archived.sql
-- Lifecycle: lc_active_inactive_archived — 3-state with soft-delete archive
-- Used by: dimension_type, dimension_value
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive_archived', 'Active / Inactive / Archived', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"archive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle
WHERE code = 'lc_active_inactive_archived' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived', 'Archived', false, true,  30,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'archived')::uuid, 'archive',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
