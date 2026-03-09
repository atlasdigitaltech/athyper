-- 332_seed_action_policies.sql
--
-- Phase 9: Default close action policies.
-- These are seeded per-entity during onboarding and can be customized by tenants.
-- Uses a CTE-driven insert that only runs if no policies exist yet.

-- Note: This seed is designed to be run per-tenant/entity via the onboarding flow.
-- For demo purposes, it inserts policies for the demo tenant's primary entity.

DO $$
DECLARE
    v_tenant_id uuid;
    v_entity_code varchar(20) := 'DEMO';
BEGIN
    -- Find demo tenant (skip if not present)
    SELECT id INTO v_tenant_id FROM core.tenant WHERE code = 'demo' LIMIT 1;
    IF v_tenant_id IS NULL THEN RETURN; END IF;

    -- Skip if policies already exist
    IF EXISTS (
        SELECT 1 FROM fin.close_action_policy
        WHERE tenant_id = v_tenant_id AND entity_code = v_entity_code
    ) THEN RETURN; END IF;

    -- 1. Auto-start ready SYSTEM tasks
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'auto_start_ready', 'Auto-Start Ready Tasks',
        'Automatically start SYSTEM/HYBRID tasks when all predecessors are satisfied',
        'ready_tasks_available', '{"minReadyCount": 1}'::jsonb,
        'start_ready_tasks', '{"maxConcurrent": 3}'::jsonb,
        'auto_safe', 10, 'medium'
    );

    -- 2. Notify on critical risk signals
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'critical_signal_notify', 'Notify on Critical Signals',
        'Send notification when critical risk signals are active during close',
        'critical_signal_active', '{"minSeverity": "critical"}'::jsonb,
        'notify_escalation', '{"channel": "email", "template": "critical_signal_alert"}'::jsonb,
        'auto_safe', 5, 'critical'
    );

    -- 3. Escalate stale blockers
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'stale_blocker_escalate', 'Escalate Stale Blockers',
        'Recommend escalation when tasks with downstream impact remain blocked',
        'blocker_stale', '{"staleSinceSnapshots": 3}'::jsonb,
        'notify_escalation', '{}'::jsonb,
        'recommend', 20, 'high'
    );

    -- 4. Rerun failed handlers
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'failed_handler_rerun', 'Rerun Failed Handlers',
        'Recommend re-running system handlers that returned failure',
        'handler_failed', '{"evidenceCodes": ["RUN_FAILED", "RUN_INCOMPLETE", "DISCREPANCY"]}'::jsonb,
        'rerun_handler', '{}'::jsonb,
        'recommend', 30, 'medium'
    );

    -- 5. SLA at-risk notification
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'sla_warning_notify', 'SLA Warning Notification',
        'Notify task owners when tasks are approaching their SLA deadline',
        'sla_at_risk', '{"leadHours": 4}'::jsonb,
        'notify_owner', '{"channel": "email", "template": "sla_warning"}'::jsonb,
        'auto_safe', 15, 'high'
    );

    -- 6. Recurring bottleneck awareness
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'bottleneck_awareness', 'Recurring Bottleneck Advisory',
        'Highlight tasks that are chronically on the critical path across closes',
        'bottleneck_recurring', '{"minOccurrences": 3, "lookbackCloses": 10}'::jsonb,
        'recommend_reassignment', '{}'::jsonb,
        'recommend', 40, 'medium'
    );

    -- 7. Low confidence recovery
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'low_confidence_recovery', 'Low Confidence Recovery',
        'Trigger snapshot refresh and signal re-evaluation when confidence drops to low',
        'confidence_below', '{"threshold": "medium"}'::jsonb,
        'reevaluate_signals', '{}'::jsonb,
        'auto_safe', 25, 'high'
    );

    -- 8. Parallelization opportunity
    INSERT INTO fin.close_action_policy (
        tenant_id, entity_code, policy_code, policy_name, description,
        trigger_type, trigger_condition,
        action_type, action_params,
        execution_mode, priority, severity
    ) VALUES (
        v_tenant_id, v_entity_code,
        'parallel_opportunity', 'Parallelization Opportunity',
        'Suggest parallel execution when significant time savings are possible',
        'parallel_opportunity', '{"minSavingsMinutes": 60}'::jsonb,
        'recommend_parallel', '{}'::jsonb,
        'recommend', 50, 'info'
    );

END $$;
