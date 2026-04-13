-- 100_finance/200_document/009_journal_entry_workflow.sql
-- Purpose: workflow_template + stage + rule + workflow_definition for Journal Entry
-- Routing: single-stage Accounting Manager review for all entries
-- Depends on: 007_journal_entry.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_id  uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template: Journal Entry Review (single stage — Accounting Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'je_acct_review',
     'Journal Entry — Accounting Manager Review',
     'Single-stage review and approval by the accounting manager before posting.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_id FROM control.workflow_template
WHERE code = 'je_acct_review' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_id, 1, 'Accounting Manager Review', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_id, 1, 10, NULL,
     '{"type":"role","role_code":"accounting_manager"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'journal_entry_review',
     'Journal Entry Review',
     'journal_entry',
     '[{"condition":null,"template_code":"je_acct_review","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;
