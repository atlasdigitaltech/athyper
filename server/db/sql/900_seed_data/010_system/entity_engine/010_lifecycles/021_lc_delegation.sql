-- 010_lifecycles/021_lc_delegation.sql
-- Lifecycle: lc_delegation — authority delegation grant
-- Used by: master.delegation_grant

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_delegation', 'Delegation Grant', 1, true,
    '{"initial_state_code":"pending","allow_parallel_instances":false,
      "icon_key":"share-2","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_delegation' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending', 'Pending', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',  'Active',  false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'expired', 'Expired', false, true,  30,
     '{"ui_color":"#888888","icon_key":"timer-off","badge_variant":"neutral",
       "auto_trigger":"effective_to_passed"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revoked', 'Revoked', false, true,  40,
     '{"ui_color":"#C00000","icon_key":"shield-off","badge_variant":"danger"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'active')::uuid,  'activate', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'expired')::uuid, 'expire',   true,
     '{"require_comment":false,"system_trigger":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending')::uuid, (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,  (v_s->>'revoked')::uuid, 'revoke',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
