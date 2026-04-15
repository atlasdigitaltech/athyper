-- 010_lifecycles/010_lc_attachment.sql
-- Lifecycle: lc_attachment — file/document attachment
-- Used by: master.attachment

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_attachment', 'Attachment', 1, true,
    '{"initial_state_code":"uploading","allow_parallel_instances":false,
      "icon_key":"paperclip","ui_color":"#0F6CBD"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_attachment' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'uploading', 'Uploading', true,  false, 10,
     '{"ui_color":"#0F6CBD","icon_key":"upload","badge_variant":"info"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'active',    'Active',    false, false, 20,
     '{"ui_color":"#217346","icon_key":"check-circle","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'flagged',   'Flagged',   false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"flag","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',  'Archived',  false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'uploading')::uuid, (v_s->>'active')::uuid,   'confirm', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'flagged')::uuid,  'flag',    true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'active')::uuid,   'unflag',  true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'active')::uuid,    (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'flagged')::uuid,   (v_s->>'archived')::uuid, 'archive', true,
     '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
