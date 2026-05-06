-- 100_finance/200_document/009_journal_entry_workflow.sql
-- Purpose: default auto-approval workflow setup for Journal Entry.
-- Routing: platform default submit auto-approves and posts. Tenants can override
--          by creating their own active journal_entry workflow_definition.
-- Depends on: 007_journal_entry.sql
-- Idempotent: upserts platform templates and default definition.

DO $$ DECLARE
    v_su            constant uuid := '00000000-0000-0000-0000-000000000000';
    v_auto_tpl_id   uuid;
    v_review_tpl_id uuid;
BEGIN

-- Template: Journal Entry Auto Post (platform default)
INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'je_auto_post',
     'Journal Entry Auto Approval and Posting',
     'Platform default: submit immediately approves and posts a valid journal entry.',
     1, true,
     '{"auto_approve":true,"auto_post":true,"allow_self_approval":true,"require_all_stages":true,"allow_reassignment":false,"capture_entity_snapshot":true,"require_reason_on_reject":false,"notify_requester":false}'::jsonb,
     v_su)
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name        = EXCLUDED.name,
       description = EXCLUDED.description,
       behaviors   = EXCLUDED.behaviors,
       is_active   = true,
       updated_at  = now(),
       updated_by  = v_su;

SELECT id INTO v_auto_tpl_id
  FROM control.workflow_template
 WHERE code = 'je_auto_post'
   AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_auto_tpl_id, 1, 'Auto Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb, v_su)
ON CONFLICT (workflow_template_id, stage_no) DO UPDATE
   SET name       = EXCLUDED.name,
       mode       = EXCLUDED.mode,
       quorum     = EXCLUDED.quorum,
       updated_at = now(),
       updated_by = v_su;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_auto_tpl_id, 1, 10, NULL,
     '{"type":"requester"}'::jsonb, v_su)
ON CONFLICT (workflow_template_id, stage_no, priority) DO UPDATE
   SET conditions = EXCLUDED.conditions,
       assign_to  = EXCLUDED.assign_to,
       updated_at = now(),
       updated_by = v_su;

-- Template: Journal Entry Accounting Manager Review (available for customer setup)
INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'je_acct_review',
     'Journal Entry Accounting Manager Review',
     'Single-stage review and approval by the accounting manager before posting.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     v_su)
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name        = EXCLUDED.name,
       description = EXCLUDED.description,
       behaviors   = EXCLUDED.behaviors,
       is_active   = true,
       updated_at  = now(),
       updated_by  = v_su;

SELECT id INTO v_review_tpl_id
  FROM control.workflow_template
 WHERE code = 'je_acct_review'
   AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_review_tpl_id, 1, 'Accounting Manager Review', 'serial',
     '{"strategy":"unanimous"}'::jsonb, v_su)
ON CONFLICT (workflow_template_id, stage_no) DO UPDATE
   SET name       = EXCLUDED.name,
       mode       = EXCLUDED.mode,
       quorum     = EXCLUDED.quorum,
       updated_at = now(),
       updated_by = v_su;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_review_tpl_id, 1, 10, NULL,
     '{"type":"role_based","value":"accounting_manager"}'::jsonb, v_su)
ON CONFLICT (workflow_template_id, stage_no, priority) DO UPDATE
   SET conditions = EXCLUDED.conditions,
       assign_to  = EXCLUDED.assign_to,
       updated_at = now(),
       updated_by = v_su;

-- Platform default definition. Tenant-specific active definitions win at runtime.
INSERT INTO control.workflow_definition
    (tenant_id, code, name, description, entity_type, rules, effective_from, is_active, created_by)
VALUES
    (v_su,
     'journal_entry_review',
     'Journal Entry Default Workflow',
     'Default Journal Entry workflow: auto-approve and post unless the tenant configures approvers.',
     'journal_entry',
     '[{"condition":null,"template_code":"je_auto_post","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true, v_su)
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name           = EXCLUDED.name,
       description    = EXCLUDED.description,
       entity_type    = EXCLUDED.entity_type,
       rules          = EXCLUDED.rules,
       effective_to   = NULL,
       is_active      = true,
       updated_at     = now(),
       updated_by     = v_su;

PERFORM control.compile_workflow_template(v_auto_tpl_id);
PERFORM control.compile_workflow_template(v_review_tpl_id);

END $$;
