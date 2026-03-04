/* ============================================================================
   Athyper v2.1 — Approval Definitions for Finance Documents
   Seeds: wf.approval_definition

   These templates are matched by entity_type + conditions (amount, route).
   The Decision Grid composite score determines the approval route, and the
   matching template provides the approver chain + SLA.

   Dependencies: wf.approval_definition, core.tenant
   ============================================================================ */

DO $$
DECLARE
    v_tenant uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant found — skipping approval definition seeds';
        RETURN;
    END IF;

    -- ========================================================================
    -- Purchase Invoice Approval Templates
    -- ========================================================================

    -- PI_STANDARD: Standard route (score 0.75–0.90, amounts < 50k)
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'PI_STANDARD',
        'Purchase Invoice — Standard Approval',
        'Single-level approval for standard purchase invoices (amount < 50,000). Triggered when Decision Grid score is in STANDARD range (0.75–0.90).',
        'purchase_invoice',
        '{
            "trigger": "on_submit",
            "approvalRoute": "STANDARD",
            "conditions": [
                {"field": "total_amount", "op": "lt", "value": "50000"},
                {"field": "approval_route", "op": "eq", "value": "STANDARD"}
            ],
            "stages": [
                {
                    "name": "L1 Manager Approval",
                    "type": "serial",
                    "approvers": [{"role": "cost_center_manager", "resolveFrom": "cost_center_id"}],
                    "slaHours": 48,
                    "escalation": {"action": "reassign", "escalateTo": "department_head", "afterHours": 48}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true}
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- PI_ENHANCED: Enhanced route (score 0.50–0.75, amounts 50k–500k)
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'PI_ENHANCED',
        'Purchase Invoice — Enhanced Approval',
        'Two-level approval for higher-value invoices (50k–500k). L1 + L2 serial approval chain.',
        'purchase_invoice',
        '{
            "trigger": "on_submit",
            "approvalRoute": "ENHANCED",
            "conditions": [
                {"field": "total_amount", "op": "gte", "value": "50000"},
                {"field": "total_amount", "op": "lt", "value": "500000"},
                {"field": "approval_route", "op": "eq", "value": "ENHANCED"}
            ],
            "stages": [
                {
                    "name": "L1 Manager Approval",
                    "type": "serial",
                    "approvers": [{"role": "cost_center_manager", "resolveFrom": "cost_center_id"}],
                    "slaHours": 48,
                    "escalation": {"action": "reassign", "escalateTo": "department_head", "afterHours": 48}
                },
                {
                    "name": "L2 Director Approval",
                    "type": "serial",
                    "approvers": [{"role": "finance_director"}],
                    "slaHours": 72,
                    "escalation": {"action": "reassign", "escalateTo": "cfo", "afterHours": 72}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true}
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- PI_EXECUTIVE: Executive route (score 0.25–0.50, amounts > 500k)
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'PI_EXECUTIVE',
        'Purchase Invoice — Executive Approval',
        'Full executive approval chain for high-value invoices (> 500k). L1 + L2 + CFO.',
        'purchase_invoice',
        '{
            "trigger": "on_submit",
            "approvalRoute": "EXECUTIVE",
            "conditions": [
                {"field": "total_amount", "op": "gte", "value": "500000"},
                {"field": "approval_route", "op": "eq", "value": "EXECUTIVE"}
            ],
            "stages": [
                {
                    "name": "L1 Manager Approval",
                    "type": "serial",
                    "approvers": [{"role": "cost_center_manager", "resolveFrom": "cost_center_id"}],
                    "slaHours": 24,
                    "escalation": {"action": "reassign", "escalateTo": "department_head", "afterHours": 24}
                },
                {
                    "name": "L2 Director Approval",
                    "type": "serial",
                    "approvers": [{"role": "finance_director"}],
                    "slaHours": 48,
                    "escalation": {"action": "reassign", "escalateTo": "cfo", "afterHours": 48}
                },
                {
                    "name": "CFO Approval",
                    "type": "serial",
                    "approvers": [{"role": "cfo"}],
                    "slaHours": 72,
                    "escalation": {"action": "notify", "notifyRole": "ceo", "afterHours": 72}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true}
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ========================================================================
    -- Payment Entry Approval Templates
    -- ========================================================================

    -- PAY_STANDARD: Standard payment approval
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'PAY_STANDARD',
        'Payment Entry — Standard Approval',
        'Single-level approval for standard payments (amount < 100k).',
        'payment_entry',
        '{
            "trigger": "on_submit",
            "approvalRoute": "STANDARD",
            "conditions": [
                {"field": "total_amount", "op": "lt", "value": "100000"},
                {"field": "approval_route", "op": "eq", "value": "STANDARD"}
            ],
            "stages": [
                {
                    "name": "Treasury Approval",
                    "type": "serial",
                    "approvers": [{"role": "treasury_analyst"}],
                    "slaHours": 24,
                    "escalation": {"action": "reassign", "escalateTo": "treasury_manager", "afterHours": 24}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true}
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- PAY_HIGH_VALUE: High-value payment approval
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'PAY_HIGH_VALUE',
        'Payment Entry — High Value Approval',
        'Two-level approval for high-value payments (>= 100k). Treasury + CFO.',
        'payment_entry',
        '{
            "trigger": "on_submit",
            "approvalRoute": "ENHANCED",
            "conditions": [
                {"field": "total_amount", "op": "gte", "value": "100000"},
                {"field": "approval_route", "op": "in", "value": ["ENHANCED", "EXECUTIVE"]}
            ],
            "stages": [
                {
                    "name": "Treasury Manager Approval",
                    "type": "serial",
                    "approvers": [{"role": "treasury_manager"}],
                    "slaHours": 24,
                    "escalation": {"action": "reassign", "escalateTo": "finance_director", "afterHours": 24}
                },
                {
                    "name": "CFO Approval",
                    "type": "serial",
                    "approvers": [{"role": "cfo"}],
                    "slaHours": 48,
                    "escalation": {"action": "notify", "notifyRole": "ceo", "afterHours": 48}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true}
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- ========================================================================
    -- Manual Journal Entry Approval Templates
    -- ========================================================================

    -- MJE_STANDARD: Standard JE approval (amount > configurable threshold)
    INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
    VALUES (
        v_tenant,
        'MJE_STANDARD',
        'Manual Journal Entry — Standard Approval',
        'Single-level approval for manual JEs exceeding the auto-post threshold. Below threshold, direct-post is allowed for authorized roles.',
        'manual_je',
        '{
            "trigger": "on_submit",
            "approvalRoute": "STANDARD",
            "conditions": [
                {"field": "approval_route", "op": "in", "value": ["STANDARD", "ENHANCED", "EXECUTIVE"]}
            ],
            "stages": [
                {
                    "name": "GL Controller Approval",
                    "type": "serial",
                    "approvers": [{"role": "gl_controller"}],
                    "slaHours": 24,
                    "escalation": {"action": "reassign", "escalateTo": "finance_director", "afterHours": 24}
                }
            ],
            "sodEnforcement": {"submitterCannotApprove": true},
            "directPostMode": {
                "enabled": true,
                "maxAmount": "10000",
                "requiredPermission": "fin.je.direct_post"
            }
        }'::jsonb,
        true, now(), 'system'
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    RAISE NOTICE 'Approval definitions seeded: % rows',
        (SELECT count(*) FROM wf.approval_definition WHERE tenant_id = v_tenant AND code LIKE 'PI_%' OR code LIKE 'PAY_%' OR code LIKE 'MJE_%');

END $$;

-- Replicate to all other tenants
DO $$
DECLARE
    v_source_tenant uuid;
    v_target_tenant uuid;
    r record;
BEGIN
    SELECT id INTO v_source_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_source_tenant IS NULL THEN RETURN; END IF;

    FOR v_target_tenant IN
        SELECT id FROM core.tenant WHERE id != v_source_tenant
    LOOP
        FOR r IN
            SELECT code, name, description, entity_type, rules, is_active
            FROM wf.approval_definition
            WHERE tenant_id = v_source_tenant
              AND code IN ('PI_STANDARD','PI_ENHANCED','PI_EXECUTIVE','PAY_STANDARD','PAY_HIGH_VALUE','MJE_STANDARD')
        LOOP
            INSERT INTO wf.approval_definition (tenant_id, code, name, description, entity_type, rules, is_active, created_at, created_by)
            VALUES (v_target_tenant, r.code, r.name, r.description, r.entity_type, r.rules, r.is_active, now(), 'system')
            ON CONFLICT (tenant_id, code) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
