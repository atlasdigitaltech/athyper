-- LookupDomain/master/notification_category.sql
-- Lookup values for domain: notification.category
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('system',            'System',
     'notification.category',
     'Platform system notifications (maintenance, upgrades, security advisories).',
     10),
    ('approval',          'Approval',
     'notification.category',
     'Approval workflow notifications (pending review, approved, rejected, escalated).',
     20),
    ('period_close',      'Period Close',
     'notification.category',
     'Finance period-close notifications (checklist due, override required, certified).',
     30),
    ('kpi',               'KPI',
     'notification.category',
     'KPI threshold breach and calculation completion notifications.',
     40),
    ('task',              'Task',
     'notification.category',
     'Task assignment, due date, and completion notifications.',
     50),
    ('mention',           'Mention',
     'notification.category',
     'Direct @-mention in a comment, conversation, or document.',
     60),
    ('security',          'Security',
     'notification.category',
     'Security and access notifications (new login, MFA, permission change).',
     70),
    ('report',            'Report',
     'notification.category',
     'Report pack generation, publication, and distribution notifications.',
     80)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
