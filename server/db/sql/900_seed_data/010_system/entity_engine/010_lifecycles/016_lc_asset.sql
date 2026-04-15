-- 010_lifecycles/016_lc_asset.sql
-- Lifecycle: lc_asset — fixed asset
-- Used by: master.asset

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_asset', 'Fixed Asset', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"hard-drive","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_asset' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',             'Draft',               true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'in_service',        'In Service',          false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'under_maintenance', 'Under Maintenance',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"wrench","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'disposed',          'Disposed',            false, true,  40,
     '{"ui_color":"#C00000","icon_key":"trash-2","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,             (v_s->>'in_service')::uuid,        'commission',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'under_maintenance')::uuid,  'put_in_maintenance', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'in_service')::uuid,         'return_to_service',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'in_service')::uuid,        (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'under_maintenance')::uuid, (v_s->>'disposed')::uuid,           'dispose',            true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
