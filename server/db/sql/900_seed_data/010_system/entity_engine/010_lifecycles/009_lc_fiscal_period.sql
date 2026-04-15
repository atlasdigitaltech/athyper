-- 010_lifecycles/009_lc_fiscal_period.sql
-- Lifecycle: lc_fiscal_period — accounting period open/close cycle
-- Used by: master.fiscal_period
-- States: open → posting_closed ⇌ (reopen) → period_closed → archived

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_fiscal_period', 'Fiscal Period', 1, true,
    '{"initial_state_code":"open","allow_parallel_instances":false,
      "icon_key":"calendar","ui_color":"#217346"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_fiscal_period' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'open',           'Open',           true,  false, 10,
     '{"ui_color":"#217346","icon_key":"calendar","badge_variant":"success",
       "description":"Period open for journal postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posting_closed', 'Posting Closed', false, false, 20,
     '{"ui_color":"#E8A020","icon_key":"calendar-x","badge_variant":"warning",
       "description":"Journal postings closed; adjustment postings only"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'period_closed',  'Period Closed',  false, false, 30,
     '{"ui_color":"#C00000","icon_key":"lock","badge_variant":"danger",
       "description":"Period fully closed; no further postings"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',       'Archived',       false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'open')::uuid,           (v_s->>'posting_closed')::uuid, 'close_postings',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'open')::uuid,           'reopen_postings', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posting_closed')::uuid, (v_s->>'period_closed')::uuid,  'close_period',    true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'period_closed')::uuid,  (v_s->>'archived')::uuid,       'archive',         true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
