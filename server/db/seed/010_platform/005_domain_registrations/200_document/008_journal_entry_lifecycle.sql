-- 100_finance/200_document/008_journal_entry_lifecycle.sql
-- Purpose: lifecycle states, transitions, and entity binding for Journal Entry.
-- The state codes intentionally match action-dispatcher.route.ts and the DB
-- journal_entry status guard.

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;
BEGIN

INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'journal_entry', 'Journal Entry Lifecycle', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"book-open","ui_color":"#475569","entity_types":["journal_entry"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id
FROM control.lifecycle
WHERE code = 'journal_entry' AND tenant_id IS NULL;

-- Older seeds used pending_review. Rename it when possible so generic actions
-- using pending_approval resolve to the same state row.
UPDATE control.lifecycle_state ls
   SET code = 'pending_approval',
       name = 'Pending Approval',
       is_terminal = false,
       sort_order = 30,
       config = '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb
 WHERE ls.lifecycle_id = v_lc_id
   AND ls.code = 'pending_review'
   AND NOT EXISTS (
       SELECT 1 FROM control.lifecycle_state x
        WHERE x.lifecycle_id = v_lc_id AND x.code = 'pending_approval'
   );

INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',            'Draft',            true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                   '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'created',          'Ready',            false, false, 20, '{"ui_color":"#64748B","icon_key":"file-check"}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'pending_approval', 'Pending Approval', false, false, 30, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":1440}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',         'Approved',         false, false, 40, '{"ui_color":"#0F6CBD","icon_key":"check-circle"}'::jsonb,             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'posted',           'Posted',           false, true,  50, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'reversed',         'Reversed',         false, true,  60, '{"ui_color":"#E8A020","icon_key":"rotate-ccw"}'::jsonb,              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',         'Rejected',         false, false, 70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

UPDATE control.lifecycle_state
   SET is_terminal = false, sort_order = 70
 WHERE lifecycle_id = v_lc_id AND code = 'rejected';

SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state
WHERE lifecycle_id = v_lc_id;

INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,            (v_s->>'created')::uuid,          'complete', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'created')::uuid,          (v_s->>'pending_approval')::uuid, 'submit',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'approved')::uuid,         'approve',  true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'rejected')::uuid,         'deny',     true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'pending_approval')::uuid, (v_s->>'created')::uuid,          'amend',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'rejected')::uuid,         (v_s->>'created')::uuid,          'amend',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,         (v_s->>'posted')::uuid,           'post',     true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'posted')::uuid,           (v_s->>'reversed')::uuid,         'reverse',  true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

INSERT INTO control.entity_lifecycle
    (entity_name, lifecycle_id, tenant_id, conditions, priority, created_by)
VALUES
    ('journal_entry', v_lc_id, NULL, NULL, 100, '00000000-0000-0000-0000-000000000000')
ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

END $$;
