-- LookupDomain/log/close_activity_type.sql
-- Lookup values for domain: log.close_activity_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('automation_audit',     'Automation Audit',
     'log.close_activity_type',
     'Close automation rule evaluation result. Migrated from log.close_automation_audit. '
     'detail: {automation_rule_id, policy_id, verdict, gate_evidence, execution_result}.',
     10),
    ('task_duration',        'Task Duration',
     'log.close_activity_type',
     'Period-close task timing record. Migrated from log.close_task_duration_history. '
     'detail: {task_id, task_code, started_at, completed_at, duration_minutes, close_type}.',
     20),
    ('period_close',         'Period Close Step',
     'log.close_activity_type',
     'Period-close checklist step activity. Migrated from log.period_close_activity. '
     'detail: {close_step, step_status}.',
     30),
    ('release_decision',     'Release Decision',
     'log.close_activity_type',
     'Pack release command and policy evaluation result. Migrated from log.release_decision_log. '
     'detail: {release_id, certification_id, distribution_id, result, publication_batch_id}.',
     40),
    ('remediation_preview',  'Remediation Preview',
     'log.close_activity_type',
     'Remediation action impact preview. Migrated from log.remediation_preview_log. '
     'detail: {action_id, campaign_id, impact_summary, blocking_reasons, can_execute}.',
     50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
