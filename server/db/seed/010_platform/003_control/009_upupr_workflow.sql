-- 900_seed_data/002_control/009_upupr_workflow.sql
-- Purpose: control.workflow_template + stage + rule + workflow_definition
-- Depends on: 007_upupr_entity_registration.sql
-- Idempotent: yes — ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_id uuid;
    v_ent_id uuid;
BEGIN
    SELECT id INTO v_ent_id FROM control.entity
    WHERE table_schema = 'document' AND table_name = 'user_profile_update_request'
      AND tenant_id IS NULL;

-- 1. control.workflow_template
INSERT INTO control.workflow_template
    (tenant_id, code, name, description,
     version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'upupr_single_stage_supervisor',
     'UPUPR — Single Stage Supervisor Approval',
     'Single-stage approval routed to the requestor supervisors supervisor.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_id FROM control.workflow_template
WHERE code = 'upupr_single_stage_supervisor' AND tenant_id IS NULL;

-- 2. control.workflow_template_stage
INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_id, 1, 'Supervisor Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

-- 3. control.workflow_template_rule — dynamic assignee from principal_profile.supervisor_id
INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- 4. control.workflow_definition
INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules,
     effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid, 'upupr_supervisor_approval',
     'UPUPR — Supervisor Approval',
     'user_profile_update_request',
     '[{"condition":null,"template_code":"upupr_single_stage_supervisor","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;
