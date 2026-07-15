INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- Document lifecycle domains
    ('document',  'Document',
     'log.activity_domain',
     'Document lifecycle events: create, update, submit, approve, cancel, reopen.',
     5),
    ('workflow',  'Workflow',
     'log.activity_domain',
     'Workflow routing events: submission, approvals, rejections, delegations, escalations.',
     6),
    ('accounting','Accounting',
     'log.activity_domain',
     'Accounting events: journal posting, reversal, revaluation, period assignment.',
     7),
    ('payment',   'Payment',
     'log.activity_domain',
     'Payment processing events: payment run, clearance, remittance, bank confirmation.',
     8),
    ('system',    'System',
     'log.activity_domain',
     'System-generated events: imports, migrations, automated background processing.',
     9),
    -- Analytics / BI domains
    ('kpi',       'KPI',
     'log.activity_domain',
     'KPI calculation, threshold breach, and execution activities.',
     10),
    ('pack',      'Report Pack',
     'log.activity_domain',
     'Report pack generation, publishing, and distribution activities.',
     20),
    ('release',   'Release',
     'log.activity_domain',
     'Pack release and approval workflow activities.',
     30),
    ('planning',  'Planning',
     'log.activity_domain',
     'Budget and forecast planning model activities.',
     40),
    ('close',     'Period Close',
     'log.activity_domain',
     'Period close process orchestration activities (distinct from close_activity_log '
     'which covers compliance-critical close audit records).',
     50),
    ('approval',  'Approval',
     'log.activity_domain',
     'Approval workflow instance events (submitted, approved, rejected, escalated).',
     60),
    ('user',      'User',
     'log.activity_domain',
     'User interaction activities: comment reads, responses, record views.',
     70)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
