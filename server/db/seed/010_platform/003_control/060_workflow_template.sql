-- Table-owned seed for control.workflow_template
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/003_control/007_upupr.sql
-- ============================================================

-- 900_seed_data/002_control/007_upupr.sql
-- Purpose: UPUPR entity registration + lifecycle + workflow (merged)
-- Sources: 007_upupr_entity_registration.sql + 008_upupr_lifecycle.sql + 009_upupr_workflow.sql
-- Depends on: 002_hook_actions.sql (control schema), shared.module rows (IAM)
-- Idempotent: yes — WHERE NOT EXISTS / ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    -- lifecycle variables (from 008_upupr_lifecycle)
    v_lc_id  uuid;
    v_s      jsonb;  -- state id map
    -- workflow variables (from 009_upupr_workflow)
    v_tpl_id uuid;
    v_ent_id uuid;
BEGIN

-- Entity registration moved to 004_entity_engine/020_entities/001_entity_registry.sql

-- ── LIFECYCLE ─────────────────────────────────────────────────────────────────

-- 1. control.lifecycle
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

-- 4. control.entity_lifecycle binding
-- entity_lifecycle binding moved to 004_entity_engine/050_lifecycle_and_field_bindings.sql

-- ── WORKFLOW ──────────────────────────────────────────────────────────────────

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


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/200_document/004_document_workflows.sql
-- ============================================================


-- === SOURCE: 003_invoice_workflow.sql ===
-- 100_finance/200_document/003_invoice_workflow.sql
-- Purpose: workflow_template + stages + rules + workflow_definition for Purchase Invoice
-- Routing: amount-based — standard single-stage for amounts < 50,000; two-stage for >= 50,000
-- Depends on: 001_invoice.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 1: Standard Invoice Approval (single stage — Department Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_std_approval',
     'Invoice — Standard Approval',
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 2: High-Value Invoice Approval (two stages)
--   Stage 1: Department Manager
--   Stage 2: Finance Controller (role-based)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'inv_hv_approval',
     'Invoice — High-Value Approval',
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition — routes by net_amount
-- ═══════════════════════════════════════════════════════════════════════════════

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



-- === SOURCE: 006_purchase_order_workflow.sql ===
-- 100_finance/200_document/006_purchase_order_workflow.sql
-- Purpose: workflow_template + stages + rules + workflow_definition for Purchase Order
-- Routing: amount-based — standard single-stage (dept manager) for < 100,000;
--          two-stage (dept manager + procurement manager) for >= 100,000
-- Depends on: 004_purchase_order.sql
-- Idempotent: ON CONFLICT DO NOTHING throughout

DO $$ DECLARE
    v_tpl_std_id  uuid;
    v_tpl_hv_id   uuid;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 1: Standard PO Approval (single stage — Department Manager)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_std_approval',
     'Purchase Order — Standard Approval',
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Template 2: High-Value PO Approval (two stages)
--   Stage 1: Department Manager
--   Stage 2: Procurement Manager (role-based)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO control.workflow_template
    (tenant_id, code, name, description, version_no, is_active, behaviors, created_by)
VALUES
    (NULL, 'po_hv_approval',
     'Purchase Order — High-Value Approval',
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Workflow Definition — routes by total_amount
-- ═══════════════════════════════════════════════════════════════════════════════

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



-- === SOURCE: 021_invoice_workflow_sla_bindings.sql ===
-- ============================================================================
-- FILE: 200_document/021_invoice_workflow_sla_bindings.sql
-- Purpose: Bind SLA policies to invoice workflow template stages
--
-- Updates (idempotent):
--   inv_std_approval  stage 1 → ap_std_review_24h
--   inv_hv_approval   stage 1 → ap_std_review_24h   (dept manager — 24 h)
--   inv_hv_approval   stage 2 → ap_hv_review_48h    (finance controller — 48 h)
--
-- Depends on: 003_invoice_workflow.sql, 020_ap_sla_policies.sql
-- ============================================================================

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
        RAISE NOTICE '[021] SLA policies not found — run 020_ap_sla_policies.sql first';
        RETURN;
    END IF;

    -- ── Standard template: stage 1 → 24 h SLA ────────────────────────────────
    UPDATE control.workflow_template_stage
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
     WHERE workflow_template_id = v_tpl_std_id
       AND stage_no             = 1
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    -- ── Template-level default for inv_std_approval ───────────────────────────
    UPDATE control.workflow_template
       SET sla_policy_id  = v_std_sla_id,
           compiled_hash  = NULL,          -- force recompile
           updated_at     = now()
     WHERE id             = v_tpl_std_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_std_sla_id);

    -- ── High-value template: stage 1 → 24 h, stage 2 → 48 h ─────────────────
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

    -- ── Template-level default for inv_hv_approval ────────────────────────────
    UPDATE control.workflow_template
       SET sla_policy_id  = v_hv_sla_id,
           compiled_hash  = NULL,
           updated_at     = now()
     WHERE id             = v_tpl_hv_id
       AND (sla_policy_id IS NULL OR sla_policy_id <> v_hv_sla_id);

    -- ── Patch existing demo workflow_stage for INV-A1-0001 ────────────────────
    -- The stage was seeded before SLA policies existed; wire it now.
    UPDATE document.workflow_stage ws
       SET sla_policy_id = v_std_sla_id,
           updated_at    = now()
      FROM document.workflow_request wr
     WHERE ws.workflow_request_id = wr.id
       AND wr.entity_type         = 'purchase_invoice'
       AND wr.entity_id           = '00000001-0000-0000-0001-000000000001'
       AND ws.sla_policy_id       IS NULL;

    -- ── Populate event.work_item.due_at from SLA first timer ─────────────────
    -- First timer for ap_std_review_24h is 1440 minutes (24 h).
    -- Set due_at = assigned_at + 24 h for all linked work_items that lack it.
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
