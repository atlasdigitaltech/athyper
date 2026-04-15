-- 010_lifecycles/004_lc_bp_master.sql
-- Lifecycle: lc_bp_master — business partner master record
-- Used by: customer, supplier, bank_party, product, item
-- States: draft → active ⇌ credit_hold ⇌ suspended → inactive
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bp_master', 'Business Partner', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"users","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bp_master' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',      'Active',      false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'credit_hold', 'Credit Hold', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"alert-triangle","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'suspended',   'Suspended',   false, false, 40,
     '{"ui_color":"#C00000","icon_key":"pause-circle","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'inactive',    'Inactive',    false, true,  50,
     '{"ui_color":"#555555","icon_key":"circle-off","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'active')::uuid,      'activate',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'credit_hold')::uuid, 'place_hold', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'credit_hold')::uuid, (v_s->>'active')::uuid,      'lift_hold',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'suspended')::uuid,   'suspend',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'active')::uuid,      'reactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,      (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'suspended')::uuid,   (v_s->>'inactive')::uuid,    'deactivate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
