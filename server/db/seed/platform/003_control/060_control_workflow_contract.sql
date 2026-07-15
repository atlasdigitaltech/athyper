-- Workflow contract â€” platform template family + SLA policies.
-- Â§1 control.workflow_template + _stage + _rule + workflow_definition
-- Â§2 control.workflow_sla_policy (AP + P2P SLA timer ladders; P2P templates themselves live
--    in 072p_p2p_runtime_contract.sql Â§5).

-- UPUPR (User Profile Update Request) lifecycle + workflow bundle.
-- Each DO block resolves its own *_id to keep child rows local.

DO $$ DECLARE
    v_lc_id  uuid;
    v_s      jsonb;
    v_tpl_id uuid;
    v_ent_id uuid;
BEGIN

-- LIFECYCLE
INSERT INTO control.lifecycle (tenant_id, code, name, version_no, is_active, config, created_by)
VALUES (NULL, 'upupr', 'User Profile Update Request', 1, true,
    '{"initial_state_code":"draft","allow_parallel_instances":false,"icon_key":"user-pen","ui_color":"#0F6CBD","entity_types":["user_profile_update_request"]}'::jsonb,
    '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_lc_id FROM control.lifecycle WHERE code = 'upupr';

-- 2. control.lifecycle_state (8 states)
INSERT INTO control.lifecycle_state
    (lifecycle_id, tenant_id, code, name, is_initial, is_terminal, sort_order, config, created_by)
VALUES
    (v_lc_id, NULL, 'draft',              'Draft',                        true,  false, 10, '{"ui_color":"#888888","icon_key":"pencil"}'::jsonb,                                                             '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'submitted',           'Submitted',                   false, false, 20, '{"ui_color":"#0F6CBD","icon_key":"send"}'::jsonb,                                                              '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'awaiting_approval',   'Awaiting Supervisor Approval', false, false, 30, '{"ui_color":"#7B61FF","icon_key":"clock","sla_minutes":2880,"timer_policy_code":"upupr_approval_sla"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'revision_requested',  'Revision Requested',          false, false, 40, '{"ui_color":"#E8A020","icon_key":"refresh"}'::jsonb,                                                           '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'approved',            'Approved',                    false, false, 50, '{"ui_color":"#217346","icon_key":"check-circle"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'provisioned',         'Provisioned',                 false, true,  60, '{"ui_color":"#217346","icon_key":"check-double"}'::jsonb,                                                      '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'rejected',            'Rejected',                    false, true,  70, '{"ui_color":"#C00000","icon_key":"x-circle"}'::jsonb,                                                          '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, 'cancelled',           'Cancelled',                   false, true,  80, '{"ui_color":"#666666","icon_key":"ban"}'::jsonb,                                                               '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, code) DO NOTHING;

-- Build state id map
SELECT jsonb_object_agg(code, id) INTO v_s
FROM control.lifecycle_state WHERE lifecycle_id = v_lc_id;

-- 3. control.lifecycle_transition (10 edges)
INSERT INTO control.lifecycle_transition
    (lifecycle_id, tenant_id, from_state_id, to_state_id, operation_code, is_active, config, created_by)
VALUES
    (v_lc_id, NULL, (v_s->>'draft')::uuid,              (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'awaiting_approval')::uuid,  'assign',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'submitted')::uuid,          (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'approved')::uuid,           'approve',   true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'rejected')::uuid,           'deny',      true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'revision_requested')::uuid, 'return',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'awaiting_approval')::uuid,  (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'submitted')::uuid,          'submit',    true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'revision_requested')::uuid, (v_s->>'cancelled')::uuid,          'cancel',    true, '{"require_comment":true}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    (v_lc_id, NULL, (v_s->>'approved')::uuid,           (v_s->>'provisioned')::uuid,        'provision', true, '{"require_comment":false}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (lifecycle_id, from_state_id, to_state_id) DO NOTHING;

-- â”€â”€ WORKFLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

SELECT id INTO v_ent_id FROM control.entity
WHERE table_schema = 'document' AND table_name = 'user_profile_update_request'
  AND tenant_id IS NULL;

-- 1. control.workflow_template
INSERT INTO control.workflow_template
    (tenant_id, code, name, description,
     version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'upupr_single_stage_supervisor',
     'UPUPR â€” Single Stage Supervisor Approval',
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

-- 3. control.workflow_template_rule â€” dynamic assignee from principal_profile.supervisor_id
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
     'UPUPR â€” Supervisor Approval',
     'user_profile_update_request',
     '[{"condition":null,"template_code":"upupr_single_stage_supervisor","workflow_type":"approval","priority":10}]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;


-- Purchase Invoice approval â€” amount-based routing:
--   net_amount >= 50000 â†’ inv_hv_approval (dept mgr + finance controller)
--   else                â†’ inv_std_approval (dept mgr only)
DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- Template inv_std_approval (single stage)

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_std_approval',
     'Invoice â€” Standard Approval',
     'Single-stage approval by the department manager for standard value invoices.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'inv_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- Template inv_hv_approval (dept mgr â†’ finance controller)

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_hv_approval',
     'Invoice â€” High-Value Approval',
     'Two-stage approval for high-value invoices: department manager then finance controller.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'inv_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'Finance Controller Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL,
     '{"type":"role","role_code":"finance_controller"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- workflow_definition (rules ordered by priority; first match wins).

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'purchase_invoice_approval',
     'Purchase Invoice Approval',
     'purchase_invoice',
     '[
       {"condition":{"field":"net_amount","operator":"gte","value":50000},"template_code":"inv_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"inv_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;



-- Payment approval -- treasury-controlled, with an additional controller
-- stage for high-value payments. Payment is a single-shot financial document;
-- this workflow does not imply business-version amendment support.
DO $$ DECLARE
    v_tpl_std_id uuid;
    v_tpl_hv_id  uuid;
BEGIN

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'pay_std_approval', 'Payment - Standard Approval',
     'Single-stage treasury approval for standard payments.', 1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (NULL, 'pay_hv_approval', 'Payment - High-Value Approval',
     'Treasury approval followed by finance-controller approval for high-value payments.', 1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true,
    behaviors = EXCLUDED.behaviors;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
 WHERE code = 'pay_std_approval' AND tenant_id IS NULL;
SELECT id INTO v_tpl_hv_id FROM control.workflow_template
 WHERE code = 'pay_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Treasury Approval', 'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id,  1, 'Treasury Approval', 'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id,  2, 'Finance Controller Approval', 'serial', '{"strategy":"unanimous"}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO UPDATE
SET name = EXCLUDED.name, mode = EXCLUDED.mode, quorum = EXCLUDED.quorum;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL, '{"type":"role","role_code":"treasury_manager"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id,  1, 10, NULL, '{"type":"role","role_code":"treasury_manager"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id,  2, 10, NULL, '{"type":"role","role_code":"finance_controller"}'::jsonb, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO UPDATE
SET conditions = EXCLUDED.conditions, assign_to = EXCLUDED.assign_to;

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'payment_entry_approval', 'Payment Entry Approval', 'payment_entry',
     '[
       {"condition":{"field":"payment_amount","operator":"gte","value":100000},"template_code":"pay_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"pay_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO UPDATE
SET name = EXCLUDED.name,
    entity_type = EXCLUDED.entity_type,
    rules = EXCLUDED.rules,
    is_active = true;

END $$;



-- Purchase Order approval â€” amount-based routing:
--   total_amount >= 100000 â†’ po_hv_approval (dept mgr + procurement mgr)
--   else                   â†’ po_std_approval (dept mgr only)
DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- Template po_std_approval (single stage)

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_std_approval',
     'Purchase Order â€” Standard Approval',
     'Single-stage approval by the department manager for standard value purchase orders.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_std_id FROM control.workflow_template
WHERE code = 'po_std_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_std_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_std_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- Template po_hv_approval (dept mgr â†’ procurement mgr)

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_hv_approval',
     'Purchase Order â€” High-Value Approval',
     'Two-stage approval for high-value POs: department manager then procurement manager.',
     1, true,
     '{"allow_self_approval":false,"require_all_stages":true,"allow_reassignment":true,"capture_entity_snapshot":true,"require_reason_on_reject":true,"notify_requester":true}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

SELECT id INTO v_tpl_hv_id FROM control.workflow_template
WHERE code = 'po_hv_approval' AND tenant_id IS NULL;

INSERT INTO control.workflow_template_stage
    (workflow_template_id, stage_no, name, mode, quorum, created_by)
VALUES
    (v_tpl_hv_id, 1, 'Department Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 'Procurement Manager Approval', 'serial',
     '{"strategy":"unanimous"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no) DO NOTHING;

INSERT INTO control.workflow_template_rule
    (workflow_template_id, stage_no, priority, conditions, assign_to, created_by)
VALUES
    (v_tpl_hv_id, 1, 10, NULL,
     '{"type":"requester_manager","resolve_from":"principal_profile.supervisor_id"}'::jsonb,
     '00000000-0000-0000-0000-000000000000'),
    (v_tpl_hv_id, 2, 10, NULL,
     '{"type":"role","role_code":"procurement_manager"}'::jsonb,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (workflow_template_id, stage_no, priority) DO NOTHING;

-- workflow_definition (rules ordered by priority; first match wins).

INSERT INTO control.workflow_definition
    (tenant_id, code, name, entity_type, rules, effective_from, is_active, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000000'::uuid,
     'purchase_order_approval',
     'Purchase Order Approval',
     'purchase_order',
     '[
       {"condition":{"field":"total_amount","operator":"gte","value":100000},"template_code":"po_hv_approval","workflow_type":"approval","priority":10},
       {"condition":null,"template_code":"po_std_approval","workflow_type":"approval","priority":20}
     ]'::jsonb,
     now(), true,
     '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code) DO NOTHING;

END $$;



-- === SOURCE: 009_journal_entry_workflow.sql ===
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



-- Bind SLA policies to PI workflow template stages.
--   inv_std_approval  stage 1 â†’ ap_std_review_24h
--   inv_hv_approval   stage 1 â†’ ap_std_review_24h (dept mgr â€” 24h)
--   inv_hv_approval   stage 2 â†’ ap_hv_review_48h  (finance controller â€” 48h)

DO $sla_bind$
DECLARE
    v_std_sla_id  uuid;
    v_hv_sla_id   uuid;
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

    SELECT id INTO v_std_sla_id FROM control.workflow_sla_policy
     WHERE code = 'ap_std_review_24h' AND tenant_id IS NULL;

    SELECT id INTO v_hv_sla_id  FROM control.workflow_sla_policy
     WHERE code = 'ap_hv_review_48h'  AND tenant_id IS NULL;

    SELECT id INTO v_tpl_std_id FROM control.workflow_template
     WHERE code = 'inv_std_approval'  AND tenant_id IS NULL;

    SELECT id INTO v_tpl_hv_id  FROM control.workflow_template
     WHERE code = 'inv_hv_approval'   AND tenant_id IS NULL;

    IF v_std_sla_id IS NULL OR v_hv_sla_id IS NULL THEN
        RAISE NOTICE '[021] SLA policies not found â€” run 020_ap_sla_policies.sql first';
        RETURN;
    END IF;

    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_std_id
       AND stage_no             = 1
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    UPDATE control.workflow_template
       SET sla_policy_id  = v_std_sla_id,
           compiled_hash  = NULL,          -- force recompile
           updated_at     = now()
     WHERE id             = v_tpl_std_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_hv_id
       AND stage_no             = 1
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_hv_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_hv_id
       AND stage_no             = 2
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_hv_sla_id);

    UPDATE control.workflow_template
       SET sla_policy_id  = v_hv_sla_id,
           compiled_hash  = NULL,
           updated_at     = now()
     WHERE id             = v_tpl_hv_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_hv_sla_id);

    -- Demo workflow_stage for INV-A1-0001 was seeded before SLA policies existed; wire it now.
    UPDATE document.workflow_stage ws
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
      FROM document.workflow_request wr
     WHERE ws.workflow_request_id = wr.id
       AND wr.entity_type         = 'purchase_invoice'
       AND wr.entity_id           = '00000001-0000-0000-0001-000000000001'
       AND ws.sla_policy_id       IS NULL;

    -- Backfill event.work_item.due_at = assigned_at + 24h on existing rows linked to the
    -- 24h SLA (first timer = 1440 min); newer work_items get due_at on creation.
    UPDATE event.work_item wi
       SET due_at     = COALESCE(wi.assigned_at, wi.created_at) + interval '1440 minutes',
           updated_at = now()
      FROM document.workflow_stage ws
      JOIN document.workflow_request wr ON wr.id = ws.workflow_request_id
     WHERE wi.workflow_stage_id = ws.id
       AND ws.sla_policy_id     = v_std_sla_id
       AND wi.due_at            IS NULL
       AND wi.status NOT IN ('completed', 'skipped');

    RAISE NOTICE '[021] SLA bindings applied to inv_std_approval + inv_hv_approval templates and INV-A1-0001 demo stage';

END $sla_bind$;


-- Â§2 Workflow SLA policies.
-- Standard timer ladder (per policy): reminder at 75% of SLA, escalate at 100%,
-- auto-reject at 200% (auto_cancel for operational docs).
-- Codes: ap_std_review_24h / ap_hv_review_48h / pr_std_review_24h / pr_hv_review_48h
-- / rcp_std_review_8h / ssh_acceptance_72h / ssh_std_review_24h.
DO $ap_sla$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

    INSERT INTO control.workflow_sla_policy (
        tenant_id, code, name, description,
        timers, escalation_chain, created_by
    ) VALUES (
        NULL,
        'ap_std_review_24h',
        'AP Standard Review â€” 24 h',
        'Standard purchase invoice approval SLA. '
        'Target: 24 h. Reminder at 18 h, escalation at 24 h, auto-reject at 48 h.',
        '[
            {
                "after_minutes": 1080,
                "action": "reminder",
                "notify_roles": [],
                "message_template_key": "wfl.sla_reminder"
            },
            {
                "after_minutes": 1440,
                "action": "escalate",
                "notify_roles": [],
                "message_template_key": "wfl.sla_breach"
            },
            {
                "after_minutes": 2880,
                "action": "auto_reject",
                "notify_roles": [],
                "message_template_key": "wfl.sla_auto_reject"
            }
        ]'::jsonb,
        '[
            {"type": "role", "value": "finance_controller", "notify": true}
        ]'::jsonb,
        v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO control.workflow_sla_policy (
        tenant_id, code, name, description,
        timers, escalation_chain, created_by
    ) VALUES (
        NULL,
        'ap_hv_review_48h',
        'AP High-Value Review â€” 48 h',
        'High-value purchase invoice approval SLA (â‰¥ 50,000 base currency). '
        'Target: 48 h. Reminder at 36 h, escalation at 48 h, auto-reject at 96 h.',
        '[
            {
                "after_minutes": 2160,
                "action": "reminder",
                "notify_roles": [],
                "message_template_key": "wfl.sla_reminder"
            },
            {
                "after_minutes": 2880,
                "action": "escalate",
                "notify_roles": [],
                "message_template_key": "wfl.sla_breach"
            },
            {
                "after_minutes": 5760,
                "action": "auto_reject",
                "notify_roles": [],
                "message_template_key": "wfl.sla_auto_reject"
            }
        ]'::jsonb,
        '[
            {"type": "role", "value": "finance_controller", "notify": true},
            {"type": "role", "value": "cfo",                "notify": true}
        ]'::jsonb,
        v_su
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE '[060 Â§2 AP SLA] 2 AP SLA policies seeded (ap_std_review_24h, ap_hv_review_48h)';

END $ap_sla$;


-- â”€â”€ P2P SLA policies (PR / receipt / service_sheet) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Timer ladders mirror the AP policy shape:
--   75 % of SLA  â†’ reminder
--   100 % of SLA â†’ escalate
--   200 % of SLA â†’ auto-reject (auto-cancel for receipts where reject doesn't apply)
--
-- Targets (chosen for the typical P2P cadence):
--   pr_std_review_24h    â€” manager approval, 24 h target
--   pr_hv_review_48h     â€” high-value PR, 48 h target
--   rcp_std_review_8h    â€” warehouse manager, 8 h target (operational urgency)
--   ssh_acceptance_72h   â€” requester acceptance of service sheet, 72 h target
--   ssh_std_review_24h   â€” finance controller approval, 24 h target

DO $p2p_sla$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

-- â”€â”€ pr_std_review_24h â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.workflow_sla_policy
    (tenant_id, code, name, description, timers, escalation_chain, created_by)
VALUES (
    NULL, 'pr_std_review_24h',
    'PR Standard Review â€” 24 h',
    'Standard purchase requisition approval SLA. Target: 24 h. '
    'Reminder at 18 h, escalation at 24 h, auto-reject at 48 h.',
    '[
        {"after_minutes": 1080, "action": "reminder",    "notify_roles": [], "message_template_key": "wfl.sla_reminder"},
        {"after_minutes": 1440, "action": "escalate",    "notify_roles": [], "message_template_key": "wfl.sla_breach"},
        {"after_minutes": 2880, "action": "auto_reject", "notify_roles": [], "message_template_key": "wfl.sla_auto_reject"}
    ]'::jsonb,
    '[{"type": "role", "value": "finance_controller", "notify": true}]'::jsonb,
    v_su
) ON CONFLICT (tenant_id, code) DO NOTHING;

-- â”€â”€ pr_hv_review_48h â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.workflow_sla_policy
    (tenant_id, code, name, description, timers, escalation_chain, created_by)
VALUES (
    NULL, 'pr_hv_review_48h',
    'PR High-Value Review â€” 48 h',
    'High-value purchase requisition approval SLA (â‰¥ 25,000 base currency). '
    'Target: 48 h. Reminder at 36 h, escalation at 48 h, auto-reject at 96 h.',
    '[
        {"after_minutes": 2160, "action": "reminder",    "notify_roles": [], "message_template_key": "wfl.sla_reminder"},
        {"after_minutes": 2880, "action": "escalate",    "notify_roles": [], "message_template_key": "wfl.sla_breach"},
        {"after_minutes": 5760, "action": "auto_reject", "notify_roles": [], "message_template_key": "wfl.sla_auto_reject"}
    ]'::jsonb,
    '[
        {"type": "role", "value": "finance_controller", "notify": true},
        {"type": "role", "value": "cfo",                "notify": true}
    ]'::jsonb,
    v_su
) ON CONFLICT (tenant_id, code) DO NOTHING;

-- â”€â”€ rcp_std_review_8h â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Operational urgency â€” receipts must be posted within a shift so accruals
-- land in the right period. auto_cancel rather than auto_reject because
-- receipts route to ops, not finance, and an un-approved receipt blocks
-- inventory availability.
INSERT INTO control.workflow_sla_policy
    (tenant_id, code, name, description, timers, escalation_chain, created_by)
VALUES (
    NULL, 'rcp_std_review_8h',
    'Receipt Approval â€” 8 h',
    'Operational receipt approval SLA. Target: 8 h (one shift). '
    'Reminder at 6 h, escalation at 8 h, auto-cancel at 16 h.',
    '[
        {"after_minutes": 360,  "action": "reminder",    "notify_roles": [], "message_template_key": "wfl.sla_reminder"},
        {"after_minutes": 480,  "action": "escalate",    "notify_roles": [], "message_template_key": "wfl.sla_breach"},
        {"after_minutes": 960,  "action": "auto_cancel", "notify_roles": [], "message_template_key": "wfl.sla_auto_cancel"}
    ]'::jsonb,
    '[
        {"type": "role", "value": "warehouse_supervisor", "notify": true},
        {"type": "role", "value": "operations_manager",   "notify": true}
    ]'::jsonb,
    v_su
) ON CONFLICT (tenant_id, code) DO NOTHING;

-- â”€â”€ ssh_acceptance_72h â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Requester has 72 h to accept or reject the service sheet. Longer window
-- because the requester may need to verify with on-site staff.
INSERT INTO control.workflow_sla_policy
    (tenant_id, code, name, description, timers, escalation_chain, created_by)
VALUES (
    NULL, 'ssh_acceptance_72h',
    'Service Sheet Acceptance â€” 72 h',
    'Requester acceptance SLA for service sheets. Target: 72 h. '
    'Reminder at 54 h, escalation at 72 h, auto-reject at 144 h.',
    '[
        {"after_minutes": 3240, "action": "reminder",    "notify_roles": [], "message_template_key": "wfl.sla_reminder"},
        {"after_minutes": 4320, "action": "escalate",    "notify_roles": [], "message_template_key": "wfl.sla_breach"},
        {"after_minutes": 8640, "action": "auto_reject", "notify_roles": [], "message_template_key": "wfl.sla_auto_reject"}
    ]'::jsonb,
    '[
        {"type": "role", "value": "project_owner",     "notify": true},
        {"type": "role", "value": "operations_manager","notify": true}
    ]'::jsonb,
    v_su
) ON CONFLICT (tenant_id, code) DO NOTHING;

-- â”€â”€ ssh_std_review_24h â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO control.workflow_sla_policy
    (tenant_id, code, name, description, timers, escalation_chain, created_by)
VALUES (
    NULL, 'ssh_std_review_24h',
    'Service Sheet Finance Review â€” 24 h',
    'Finance controller approval SLA for accepted service sheets. Target: 24 h. '
    'Reminder at 18 h, escalation at 24 h, auto-reject at 48 h.',
    '[
        {"after_minutes": 1080, "action": "reminder",    "notify_roles": [], "message_template_key": "wfl.sla_reminder"},
        {"after_minutes": 1440, "action": "escalate",    "notify_roles": [], "message_template_key": "wfl.sla_breach"},
        {"after_minutes": 2880, "action": "auto_reject", "notify_roles": [], "message_template_key": "wfl.sla_auto_reject"}
    ]'::jsonb,
    '[{"type": "role", "value": "cfo", "notify": true}]'::jsonb,
    v_su
) ON CONFLICT (tenant_id, code) DO NOTHING;

RAISE NOTICE '[060 Â§2 P2P SLA] 5 P2P SLA policies seeded (pr_std/pr_hv/rcp_std/ssh_acceptance/ssh_std).';

END $p2p_sla$;

