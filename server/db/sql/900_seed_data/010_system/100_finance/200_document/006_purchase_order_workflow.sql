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
