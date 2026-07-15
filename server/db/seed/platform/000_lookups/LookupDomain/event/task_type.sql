INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('approval',
     'Approval',
     'work_item.task_type',
     'A human must make a binding decision on a business entity. '
     'Supports quorum (any N of M approvers). '
     'Blocking — the workflow stage cannot advance until quorum is met or rejection is final. '
     'Decision: approve (proceed) | reject (halt) | escalate (raise to next level).',
     10,
     '{"valid_decisions": ["approve", "reject", "return", "escalate"],
       "requires_decision": true,
       "is_blocking": true,
       "allows_reassignment": true,
       "auto_complete_on_read": false,
       "quorum_applies": true}'
    ),

    ('review',
     'Review',
     'work_item.task_type',
     'A human must acknowledge and optionally flag issues with a document or entity. '
     'Soft blocking — workflow can be configured to proceed after partial review. '
     'Decision: acknowledge (reviewed, no issues) | flag (issues noted) | escalate.',
     20,
     '{"valid_decisions": ["acknowledge", "flag", "escalate"],
       "requires_decision": true,
       "is_blocking": true,
       "allows_reassignment": true,
       "auto_complete_on_read": false,
       "quorum_applies": true}'
    ),

    ('watcher',
     'Watcher',
     'work_item.task_type',
     'A human is subscribed to receive structured FYI updates on a workflow. '
     'Non-blocking — watcher tasks never prevent the workflow from advancing. '
     'Decision: read (implicit on open). No quorum. '
     'Distinct from master.notification — watcher tasks have explicit assignment '
     'and a trackable read receipt for audit/SLA reporting.',
     30,
     '{"valid_decisions": ["read"],
       "requires_decision": false,
       "is_blocking": false,
       "allows_reassignment": false,
       "auto_complete_on_read": true,
       "quorum_applies": false}'
    )
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
