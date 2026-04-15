-- 010_lifecycles/019_lc_bank_account.sql
-- Lifecycle: lc_bank_account
-- Used by: master.bank_account

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_bank_account', 'Bank Account', 1, true,
    '{"initial_state_code":"pending_verification","allow_parallel_instances":false,
      "icon_key":"landmark","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_bank_account' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'pending_verification', 'Pending Verification', true,  false, 10,
     '{"ui_color":"#E8A020","icon_key":"clock","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',               'Active',               false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'frozen',               'Frozen',               false, false, 30,
     '{"ui_color":"#7B61FF","icon_key":"snowflake","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'closed',               'Closed',               false, true,  40,
     '{"ui_color":"#555555","icon_key":"x-circle","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'pending_verification')::uuid, (v_s->>'active')::uuid,  'verify',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'frozen')::uuid,  'freeze',   true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'active')::uuid,  'unfreeze', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'frozen')::uuid,               (v_s->>'closed')::uuid,  'close',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
