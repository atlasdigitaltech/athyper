-- 010_lifecycles/001_lc_active_inactive.sql
-- Lifecycle: lc_active_inactive — simple 2-state toggle
-- Used by: label, brand_profile, letterhead, template (active/deprecated),
--          ledger_book, holiday_calendar, payment_term, payment_method,
--          planning_model, commodity_category, chart_of_account,
--          tax_jurisdiction, tax_type, auth_group, team, dimension_set,
--          asset_class, print_profile, and others.
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_active_inactive', 'Active / Inactive', 1, true,
    '{"initial_state_code":"active","allow_parallel_instances":false,
      "icon_key":"toggle-right","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_active_inactive' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'active',   'Active',   true,  false, 10,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive', 'Inactive', false, false, 20,
     '{"ui_color":"#888888","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'active')::uuid,   (v_s->>'inactive')::uuid, 'deactivate', true,
     '{"require_comment":false,"label":"Deactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'inactive')::uuid, (v_s->>'active')::uuid,   'reactivate', true,
     '{"require_comment":false,"label":"Reactivate"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
