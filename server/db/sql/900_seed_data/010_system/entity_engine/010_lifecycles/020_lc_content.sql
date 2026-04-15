-- 010_lifecycles/020_lc_content.sql
-- Lifecycle: lc_content — CMS content item
-- Used by: master.content_item

DO $$
DECLARE
    v_lc_id uuid;
    v_s     jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'lc_content', 'Content Item', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,
      "icon_key":"file-text","ui_color":"#7B61FF"}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'lc_content' AND tenant_id IS NULL;

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',       'Draft',       true,  false, 10,
     '{"ui_color":"#888888","icon_key":"pencil","badge_variant":"secondary"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'published',   'Published',   false, false, 20,
     '{"ui_color":"#217346","icon_key":"globe","badge_variant":"success"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'unpublished', 'Unpublished', false, false, 30,
     '{"ui_color":"#E8A020","icon_key":"eye-off","badge_variant":"warning"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'archived',    'Archived',    false, true,  40,
     '{"ui_color":"#555555","icon_key":"archive","badge_variant":"neutral"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

SELECT jsonb_object_agg(code, id) INTO v_s FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'published')::uuid,   'publish',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'published')::uuid,   (v_s->>'unpublished')::uuid, 'unpublish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'published')::uuid,   'republish', true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'unpublished')::uuid, (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'draft')::uuid,       (v_s->>'archived')::uuid,    'archive',   true,
     '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

END $$;
