INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status,
     metadata, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', v.meta::jsonb,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('approval',
     'Approval',
     'work_request.workflow_type',
     'Structured approval workflow. Creates workflow_stages from the template. '
     'Each stage has work_items of task_type=approval. '
     'Final outcome (approved/rejected) is derived from stage quorum results. '
     'Used for: invoice approval, close override authorisation, delegation grants.',
     10,
     '{"creates_stages": true,
       "work_item_types": ["approval"],
       "requires_template": true,
       "derives_outcome_from_stages": true}'
    ),

    ('review',
     'Review',
     'work_request.workflow_type',
     'Review and sign-off workflow. May or may not have stages. '
     'Each stage has work_items of task_type=review. '
     'Used for: close pack review, certification attestation, release sign-off.',
     20,
     '{"creates_stages": true,
       "work_item_types": ["review"],
       "requires_template": true,
       "derives_outcome_from_stages": true}'
    ),

    ('watcher',
     'Watcher',
     'work_request.workflow_type',
     'Notification workflow. No stages. '
     'Creates work_items of task_type=watcher directly on the workflow_request. '
     'Non-blocking — watcher workflow completes as soon as it is created. '
     'Used for: FYI distribution, audit trail of notification delivery.',
     30,
     '{"creates_stages": false,
       "work_item_types": ["watcher"],
       "requires_template": false,
       "derives_outcome_from_stages": false}'
    )
) AS v(code, name, domain_code, description, sort_order, meta)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
